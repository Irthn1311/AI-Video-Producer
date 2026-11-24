import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,sceneDir} from '../src/utils.mjs';
import {adapterStatus,approveAdapter,requireAdapter,validatePointerPath} from '../src/adapters.mjs';
import {prepareBuild,checkBuild,freezeBuild} from '../src/build.mjs';
import {loadState,inputHashes,staleParts} from '../src/state.mjs';
import {rehearseScene} from '../src/rehearsal.mjs';
import {capture,captions,preview,qaScene} from '../src/media.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const cli=(root,...args)=>spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],{encoding:'utf8',timeout:30000});
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-adapter-'));
  const config=readJson(path.join(repo,'templates/project.json'));
  config.workflow={requireBuild:true};config.verification={mode:'legacy'};
  config.review.mode='autonomous';config.voiceover.enabled=false;
  config.sourcePath='app';config.appUrl='http://127.0.0.1:4567';
  config.render={engine:'ffmpeg',width:320,height:240,fps:24,captionsBurned:false};
  fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','app.js'),'canvas.getContext("2d")');
  const scene=config.scenes[0];delete scene.claims;delete scene.edit;
  scene.durationSec=2;scene.featureIds=[];scene.narration='Draw a line.';
  scene.capture={adapter:'draw',evidencePolicy:{requireAssertions:true,failOnPageError:true},actions:[
    {type:'goto',path:'/'},
    {type:'pointerPath',testId:'canvas',points:[{x:.15,y:.2},{x:.45,y:.7},{x:.85,y:.3}]},
    {type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'yes',evidenceId:'drawn',timeoutMs:1500}
  ]};
  config.scenes=[scene];config.capabilityRequirements=['pointer-interaction'];
  const manifest={schemaVersion:1,id:'draw',kind:'declarative-browser-v1',
    provenance:{kind:'project-authored'},
    permissions:{network:'app-origin-only',filesystem:'none',secrets:'none',shell:'none'},
    startState:'Fresh browser canvas',endState:'Canvas has received pointer stroke',cleanup:'close-browser-context',
    actions:structuredClone(scene.capture.actions),capabilities:[{id:'pointer-interaction',evidenceId:'drawn'}]};
  const file=path.join(root,'.avp','adapters','draw.json');
  writeJson(file,manifest);writeJson(path.join(root,'project.json'),config);
  return {root,config,scene,manifest,file};
}
const clean=f=>fs.rmSync(f.root,{recursive:true,force:true});
test('adapter approval binds exact project recipe, origin and source revision; changed recipe fails closed',()=>{
  const f=fixture();
  try{
    assert.notEqual(adapterStatus(f.root,f.config,f.scene).status,'APPROVED_FOR_TRIAL');
    assert.throws(()=>requireAdapter(f.root,f.config,f.scene),/ADAPTER BLOCKED/);
    assert.throws(()=>approveAdapter(f.root,f.config,f.scene),/--confirm/);
    assert.equal(cli(f.root,'adapter','approve','--scene',f.scene.id,'--confirm').status,0);
    const approved=requireAdapter(f.root,f.config,f.scene);
    const before=inputHashes(f.scene,f.config,{},f.root).capture;
    assert.ok(approved.manifestHash&&approved.engineHash);
    f.manifest.endState='Modified after approval';writeJson(f.file,f.manifest);
    assert.equal(adapterStatus(f.root,f.config,f.scene).status,'REVIEW_REQUIRED');
    assert.notEqual(inputHashes(f.scene,f.config,{},f.root).capture,before);
    assert.throws(()=>requireAdapter(f.root,f.config,f.scene),/ADAPTER BLOCKED/);
    approveAdapter(f.root,f.config,f.scene,{confirm:true});
    fs.writeFileSync(path.join(f.root,'app','app.js'),'canvas.getContext("2d"); // changed');
    assert.equal(adapterStatus(f.root,f.config,f.scene).status,'REVIEW_REQUIRED');
  }finally{clean(f);}
});
test('reject arbitrary scripts, extra permissions, unsafe points, mismatched actions and symlink files',()=>{
  const f=fixture();
  try{
    const original=structuredClone(f.manifest);
    f.manifest.permissions.shell='all';writeJson(f.file,f.manifest);
    assert.throws(()=>approveAdapter(f.root,f.config,f.scene,{confirm:true}),/permissions/);
    const bad=structuredClone(original);bad.actions[1].type='evaluate';writeJson(f.file,bad);
    assert.throws(()=>approveAdapter(f.root,f.config,f.scene,{confirm:true}),/exactly match/);
    assert.throws(()=>validatePointerPath({type:'pointerPath',testId:'x',points:[{x:0,y:0},{x:2,y:1}]}),/normalized/);
    writeJson(f.file,original);
    delete f.scene.capture.adapter;
    assert.throws(()=>requireAdapter(f.root,f.config,f.scene),/requires a reviewed/);
    f.scene.capture.adapter='draw';
    if(process.platform!=='win32'){
      const other=path.join(f.root,'other.json');writeJson(other,original);fs.unlinkSync(f.file);fs.symlinkSync(other,f.file);
      assert.throws(()=>approveAdapter(f.root,f.config,f.scene,{confirm:true}),/Symlinked/);
    }
  }finally{clean(f);}
});
test('approved adapter removes implementation blocker but does not bypass real Build trial',()=>{
  const f=fixture();
  try{
    const planned=cli(f.root,'plan');assert.equal(planned.status,0,planned.stderr);
    prepareBuild(f.root,f.config);
    const before=checkBuild(f.root,f.config,loadState(f.root));
    assert.ok(before.problems.some(x=>x.code==='BUILD_ADAPTER_UNSUPPORTED'));
    approveAdapter(f.root,f.config,f.scene,{confirm:true});
    prepareBuild(f.root,f.config,{force:true});
    const checked=checkBuild(f.root,f.config,loadState(f.root));
    assert.equal(checked.status,'BLOCKED');
    assert.ok(checked.problems.some(x=>x.code==='BUILD_REHEARSAL_MISSING'));
    assert.equal(checked.problems.some(x=>x.code==='BUILD_REQUIRED_CAPABILITY_MISSING'),false);
    assert.throws(()=>freezeBuild(f.root,f.config,loadState(f.root)),/Cannot freeze/);
  }finally{clean(f);}
});
test('real Chromium runs reviewed canvas adapter in rehearsal and production, then QA; drift rejects reuse',{
  skip:process.env.AVP_BROWSER_SMOKE!=='1',timeout:90000
},async()=>{
  const f=fixture();
  let externalRequests=0;
  const external=http.createServer((req,res)=>{externalRequests++;res.end('external');});
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html');
    res.end('<canvas data-testid="canvas" width="260" height="180" style="border:1px solid black"></canvas>'+
      '<img src="http://127.0.0.1:'+external.address().port+'/blocked">'+
      '<script>const c=document.querySelector("canvas");const ctx=c.getContext("2d");'+
      'let drawing=false;c.addEventListener("pointerdown",e=>{drawing=true;ctx.beginPath();ctx.moveTo(e.offsetX,e.offsetY)});'+
      'c.addEventListener("pointermove",e=>{if(drawing){ctx.lineTo(e.offsetX,e.offsetY);ctx.stroke();c.dataset.drawn="yes"}});'+
      'c.addEventListener("pointerup",()=>drawing=false);</script>');
  });
  try{
    await new Promise(resolve=>external.listen(0,'127.0.0.1',resolve));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    f.config.appUrl='http://127.0.0.1:'+server.address().port;
    writeJson(path.join(f.root,'project.json'),f.config);
    const plan=cli(f.root,'plan');assert.equal(plan.status,0,plan.stderr);
    approveAdapter(f.root,f.config,f.scene,{confirm:true});
    prepareBuild(f.root,f.config);
    const trial=await rehearseScene(f.root,f.config,f.scene,{allowActions:true});
    assert.equal(trial.status,'PASS');
    assert.equal(trial.assertions,1);
    const state=loadState(f.root);
    const ready=freezeBuild(f.root,f.config,state);assert.equal(ready.status,'READY');
    const actual=await capture(f.root,f.config,f.scene,state);
    assert.equal(actual.report.status,'PASS');assert.equal(actual.report.assertions[0].id,'drawn');
    assert.equal(actual.report.adapterBinding.manifestHash,requireAdapter(f.root,f.config,f.scene).manifestHash);
    assert.equal(externalRequests,0,'cross-origin image must not be fetched in adapter contexts');
    captions(f.root,f.config,f.scene,state);await preview(f.root,f.config,f.scene,state);
    const qa=qaScene(f.root,f.config,f.scene,state);assert.equal(qa.pass,true,JSON.stringify(qa));
    assert.ok(fs.statSync(path.join(sceneDir(f.root,f.scene.id),'preview.mp4')).size>1000);
    f.manifest.endState='Edited after trial';writeJson(f.file,f.manifest);
    assert.equal(checkBuild(f.root,f.config,state).status,'BLOCKED');
    assert.equal(staleParts(f.scene,f.config,state.scenes[f.scene.id],f.root).capture,true);
  }finally{
    server.close();external.close();clean(f);
  }
});
