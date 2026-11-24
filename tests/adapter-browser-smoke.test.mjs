import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,sceneDir} from '../src/utils.mjs';
import {loadState,staleParts,validateSceneQa,inputHashes} from '../src/state.mjs';
import {scaffoldAdapter,approveAdapter,trialAdapter,adapterPath,adapterStatus,requireAdapterReady} from '../src/adapters.mjs';
import {rehearseScene} from '../src/rehearsal.mjs';
import {prepareBuild,checkBuild,freezeBuild,requireBuildGate} from '../src/build.mjs';
import {capture,captions,preview,qaScene} from '../src/media.mjs';

const repo=path.resolve(import.meta.dirname,'..');
test('real browser adapter review → trial → frozen Build → authentic capture → targeted invalidation',{
  skip:process.env.AVP_BROWSER_SMOKE!=='1',timeout:150000
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-real-adapter-'));
  let foreignRequests=0;
  const other=http.createServer((req,res)=>{foreignRequests++;res.writeHead(200);res.end('unapproved');});
  const server=http.createServer((req,res)=>{
    if(req.method==='POST'&&req.url==='/api/save'){
      res.writeHead(200,{'Content-Type':'application/json'});res.end('{"saved":true}');return;
    }
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end('<!doctype html><html><body><h1>Project-owned App</h1>'+
      '<button data-testid="save">Save changes</button>'+
      '<canvas data-testid="canvas" data-drawn="no" width="200" height="55"></canvas>'+
      '<div data-testid="result" style="display:none">Saved real data</div>'+
      '<img src="http://127.0.0.1:'+other.address().port+'/unauthorized" />'+
      '<script>const c=document.querySelector("canvas"),ctx=c.getContext("2d");let drawing=false;'+
      'c.addEventListener("pointerdown",e=>{drawing=true;ctx.beginPath();ctx.moveTo(e.offsetX,e.offsetY)});'+
      'c.addEventListener("pointermove",e=>{if(drawing){ctx.lineTo(e.offsetX,e.offsetY);ctx.stroke();c.dataset.drawn="yes"}});'+
      'c.addEventListener("pointerup",()=>drawing=false);'+
      'document.querySelector("[data-testid=save]").onclick=async()=>{'+
      'const r=await fetch("/api/save",{method:"POST"});'+
      'if(r.ok)document.querySelector("[data-testid=result]").style.display="block";'+
      '};</script></body></html>');
  });
  try{
    await new Promise(res=>other.listen(0,'127.0.0.1',res));
    await new Promise(res=>server.listen(0,'127.0.0.1',res));
    fs.mkdirSync(path.join(root,'app'));
    fs.writeFileSync(path.join(root,'app','index.js'),'export const project=true;');
    const config=readJson(path.join(repo,'templates','project.json'));
    config.sourcePath='app';config.workflow={requireBuild:true};
    config.appUrl='http://127.0.0.1:'+server.address().port;
    config.voiceover.enabled=false;config.review.mode='autonomous';config.verification={mode:'claims'};
    config.render={engine:'ffmpeg',width:320,height:180,fps:24,captionsBurned:false};
    config.capabilityRequirements=['app-feature-demo','pointer-interaction'];
    config.scenes=[{...config.scenes[0],id:'adapter-scene',durationSec:3,featureIds:['saved-feature'],
      narration:'Real saved result.',
      claims:[{id:'real-saved-claim',featureId:'saved-feature',text:'Real saved result.',
        evidenceIds:['backend-save','saved-text']}],
      capture:{adapter:'app-recipe',actions:[],
        evidencePolicy:{requireAssertions:true,failOnPageError:true}}}];
    writeJson(path.join(root,'project.json'),config);
    const scene=config.scenes[0],state=loadState(root);
    scaffoldAdapter(root,config,scene,{id:'app-recipe',capabilities:['app-feature-demo','pointer-interaction']});
    const file=adapterPath(root,'app-recipe'),manifest=readJson(file);
    manifest.actions=[
      {type:'goto',path:'/'},
      {type:'assertVisible',role:'heading',name:'Project-owned App',evidenceId:'heading'},
      {type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'no',evidenceId:'before-stroke'},
      {type:'pointerPath',testId:'canvas',points:[{x:.1,y:.2},{x:.4,y:.7},{x:.8,y:.25}]},
      {type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'yes',evidenceId:'after-stroke'},
      {type:'clickExpectResponse',testId:'save',evidenceId:'backend-save',
        response:{pathContains:'/api/save',method:'POST',status:200,bodyIncludes:'"saved":true'}},
      {type:'assertText',testId:'result',expectedText:'Saved real data',evidenceId:'saved-text'}
    ];
    manifest.expectedEvidenceIds=['heading','before-stroke','after-stroke','backend-save','saved-text'];
    writeJson(file,manifest);
    const approved=approveAdapter(root,config,scene,{confirm:true});
    assert.equal(approved.status,'REVIEWED_AWAITING_TRIAL');
    await assert.rejects(trialAdapter(root,config,scene,{allowActions:false}),/--allow-actions/);
    const trial=await trialAdapter(root,config,scene,{allowActions:true});
    assert.equal(trial.status,'PASS');
    assert.equal(trial.assertions,5);
    const report=readJson(path.join(root,'.avp','adapters','app-recipe','trial-report.json'));
    assert.ok(report.blockedExternalRequests>=1,'Browser must deny foreign cross-origin requests');
    assert.equal(foreignRequests,0,'Foreign origin must never receive the page subrequest');
    assert.equal(adapterStatus(root,config,scene).status,'TRIAL_PASS');
    const reportFile=path.join(root,'.avp','adapters','app-recipe','trial-report.json');
    const unmodified=readJson(reportFile),corrupted=structuredClone(unmodified);
    const beforeProofHash=inputHashes(scene,config,{},root).capture;
    corrupted.assertions[0].pass=false;writeJson(reportFile,corrupted);
    assert.notEqual(inputHashes(scene,config,{},root).capture,beforeProofHash,
      'Tampered adapter trial report must invalidate media/cache fingerprints');
    assert.equal(adapterStatus(root,config,scene).status,'TRIAL_REQUIRED',
      'Trial receipt must reject changed evidence even if status remains PASS');
    writeJson(reportFile,unmodified);
    assert.equal(adapterStatus(root,config,scene).status,'TRIAL_PASS');
    assert.deepEqual(requireAdapterReady(root,config,scene).verifiedCapabilities,['app-feature-demo','pointer-interaction']);
    assert.ok(report.engineHash);
    assert.ok(report.actions.some(a=>a.type==='pointerPath'));

    const run=(...args)=>spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],
      {encoding:'utf8',timeout:15000});
    assert.equal(run('plan').status,0);
    prepareBuild(root,config,{force:true});
    const pre=checkBuild(root,config,state);
    assert.equal(pre.problems.some(x=>x.code==='BUILD_REQUIRED_CAPABILITY_MISSING'),false,JSON.stringify(pre.problems));
    assert.ok(pre.problems.some(x=>x.code==='BUILD_REHEARSAL_MISSING'));
    const rehearsal=await rehearseScene(root,config,scene,{allowActions:true});
    assert.equal(rehearsal.status,'PASS');
    assert.equal(rehearsal.assertions,5);
    assert.equal(foreignRequests,0);
    const ready=freezeBuild(root,config,state);
    assert.equal(ready.status,'READY');
    requireBuildGate(root,config,state);
    const result=await capture(root,config,scene,state);
    assert.equal(result.report.status,'PASS');
    assert.equal(result.report.assertions.length,5);
    assert.equal(result.report.adapter.id,'app-recipe');
    assert.ok(result.report.actions.some(a=>a.type==='pointerPath'));
    assert.ok(result.report.assertions.some(a=>a.id==='after-stroke'&&a.pass===true));
    captions(root,config,scene,state);
    await preview(root,config,scene,state);
    const qa=qaScene(root,config,scene,state);
    assert.equal(qa.pass,true,JSON.stringify(qa));
    assert.equal(qa.checks.claimEvidence,true);
    assert.deepEqual(qa.claimEvidence.features,['saved-feature']);
    validateSceneQa(root,config,scene,state);
    assert.equal(foreignRequests,0);

    const oldCaptureHash=inputHashes(scene,config,{},root).capture;
    const change=readJson(file);
    change.actions[1].name='Different heading';
    writeJson(file,change);
    assert.notEqual(inputHashes(scene,config,{},root).capture,oldCaptureHash);
    assert.equal(adapterStatus(root,config,scene).status,'REVIEW_REQUIRED');
    assert.throws(()=>requireBuildGate(root,config,state),/BUILD GATE BLOCKED/);
    assert.throws(()=>requireAdapterReady(root,config,scene),/ADAPTER GATE/);
    assert.equal(staleParts(scene,config,state.scenes[scene.id],root).capture,true);
    // Old QA is no longer evidence for the modified adapter.
    assert.throws(()=>validateSceneQa(root,config,scene,state),/stale/);
  }finally{
    await new Promise(r=>server.close(r));await new Promise(r=>other.close(r));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
