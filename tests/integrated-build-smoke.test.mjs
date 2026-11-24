import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readJson,writeJson,fileHash,sceneDir} from '../src/utils.mjs';
import {scaffoldAdapter,adapterPath,approveAdapter,trialAdapter} from '../src/adapters.mjs';

const execute=promisify(execFile);
const repo=path.resolve(import.meta.dirname,'..');
const cli=async(root,...args)=>{
  const {stdout}=await execute(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],{timeout:180000,maxBuffer:4*1024*1024});
  return stdout;
};
const json=async(root,...args)=>JSON.parse(await cli(root,...args));
const deny=async(root,args,pattern)=>assert.rejects(cli(root,...args),e=>pattern.test(e.stderr||''));
const theme={background:'#101820',panel:'#1B263B',text:'#FFFFFF',accent:'#70D6FF'};
const dashboardHtml='<!doctype html><h1>Inventory dashboard</h1><button data-testid="filter">Filter stock</button><p data-testid="result">All items</p><script>document.querySelector("button").onclick=()=>document.querySelector("[data-testid=result]").textContent="In-stock items";</script>';
const canvasHtml='<!doctype html><h1>Drawing editor</h1><canvas data-testid="canvas" data-drawn="no" width="230" height="80"></canvas><script>const c=document.querySelector("canvas"),ctx=c.getContext("2d");let drawing=false;c.addEventListener("pointerdown",e=>{drawing=true;ctx.beginPath();ctx.moveTo(e.offsetX,e.offsetY)});c.addEventListener("pointermove",e=>{if(drawing){ctx.lineTo(e.offsetX,e.offsetY);ctx.stroke();c.dataset.drawn="yes"}});c.addEventListener("pointerup",()=>drawing=false);</script>';
const fixtureAudio=(file)=>{
  const r=spawnSync('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1.5','-c:a','pcm_s16le',file],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
};
// Synthetic audio and explicit fixture confirmations exercise artifact plumbing,
// not a human listening review, natural speech quality, or LLM authoring.
async function exercise(kind){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-integrated-'+kind+'-'));
  const html=kind==='canvas'?canvasHtml:dashboardHtml;
  let served=html;
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(served);});
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','index.html'),html);
    const config=readJson(path.join(repo,'templates','project.json'));
    config.title=kind==='canvas'?'Drawing editor':'Inventory dashboard';
    config.appUrl='http://127.0.0.1:'+server.address().port;config.sourcePath='app';
    config.workflow={requireBuild:true};config.voiceover.enabled=true;config.review.mode='review';
    config.render={engine:'ffmpeg',width:640,height:360,fps:24,captionsBurned:true};
    config.creative={audience:'product reviewers',goal:'Show a real interaction and result',
      director:{mode:'interactive',visualStyle:'clean',maxDurationSec:20},
      timing:{maxSilenceSec:2,actionToleranceSec:.25},visual:{consistentTheme:true}};
    if(kind==='canvas')config.capabilityRequirements=['pointer-interaction'];
    writeJson(path.join(root,'project.json'),config);
    const context=await json(root,'storyboard','context');
    assert.equal(context.creativeBrief.audience,'product reviewers');
    assert.ok(context.sourceFiles.some(f=>f.path==='index.html'));
    if(kind==='canvas')assert.ok(context.capabilitySignals.some(s=>s.id==='canvas-interaction'));
    const heading=kind==='canvas'?'Drawing editor':'Inventory dashboard';
    const overview={id:'overview',title:heading,durationSec:4,featureIds:['overview'],
      narration:heading+'.',claims:[{id:'heading',featureId:'overview',text:heading+'.',evidenceIds:['heading']}],
      capture:{actions:[{type:'goto',path:'/'},{type:'assertText',role:'heading',expectedText:heading,evidenceId:'heading'}],
        evidencePolicy:{requireAssertions:true,failOnPageError:true}},
      edit:{design:{rationale:'Retain context',framing:'stable',theme},shots:[{id:'context',durationSec:4,camera:'static',purpose:'Show actual heading'}]}};
    const resultText=kind==='canvas'?'A drawn stroke.':'In-stock items.';
    const actions=kind==='canvas'?[]:[{type:'goto',path:'/'},{type:'click',testId:'filter'},
      {type:'assertText',testId:'result',expectedText:'In-stock items',evidenceId:'result'}];
    const workflow={id:'workflow',title:'Observed interaction',durationSec:4,featureIds:['workflow'],
      narration:resultText,claims:[{id:'result',featureId:'workflow',text:resultText,evidenceIds:['result']}],
      capture:{actions,...(kind==='canvas'?{adapter:'drawing'}:{}),evidencePolicy:{requireAssertions:true,failOnPageError:true}},
      edit:{design:{rationale:'Show interaction and result',framing:'adaptive',theme},
        shots:[{id:'result',durationSec:4,camera:'push',zoom:1.08,focus:{x:.4,y:.4},purpose:'Focus actual result'}]}};
    const entry=(scene,role)=>({scene,role,purpose:scene.title,startState:'Fresh browser',endState:'Assertions pass',
      fallback:'Return to Build',dependsOn:[],direction:{framing:scene.edit.design.framing}});
    const proposal={schemaVersion:1,baseConfigHash:context.baseConfigHash,sourceFingerprint:context.sourceFingerprint,
      storyRationale:'Show context then one real workflow',
      features:['overview','workflow'].map(id=>({id,reason:'Core '+id,sourceRefs:[context.sourceFiles.find(f=>f.path==='index.html')]})),
      scenes:[entry(overview,'hook'),entry(workflow,'workflow')]};
    const proposalFile=path.join(root,'.avp','planning','agent-storyboard.json');
    writeJson(proposalFile,proposal);
    const checked=await json(root,'storyboard','check');
    assert.deepEqual(checked.diff.added,['overview','workflow']);
    await json(root,'storyboard','apply','--hash',checked.proposalHash,'--confirm');
    let current=readJson(path.join(root,'project.json'));
    if(kind==='canvas'){
      const scene=current.scenes[1];
      scaffoldAdapter(root,current,scene,{id:'drawing',capabilities:['pointer-interaction']});
      const file=adapterPath(root,'drawing'),manifest=readJson(file);
      manifest.actions=[{type:'goto',path:'/'},
        {type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'no',evidenceId:'before'},
        {type:'pointerPath',testId:'canvas',points:[{x:.1,y:.2},{x:.4,y:.7},{x:.8,y:.25}]},
        {type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'yes',evidenceId:'result'}];
      manifest.expectedEvidenceIds=['before','result'];writeJson(file,manifest);
      approveAdapter(root,current,scene,{confirm:true});
      assert.equal((await trialAdapter(root,current,scene,{allowActions:true})).status,'PASS');
    }
    const prepareAndReview=async()=>{
      await json(root,'build','prepare','--force');
      const creative=await json(root,'creative','recommend');
      assert.equal(creative.status,'REVIEW_REQUIRED');
      await json(root,'creative','approve','--hash',creative.briefHash,'--confirm');
      await cli(root,'approve','--stage','coverage');await cli(root,'approve','--stage','storyboard');
    };
    await prepareAndReview();
    await deny(root,['capture','--scene','workflow'],/BUILD GATE BLOCKED/);
    const audio=path.join(root,'test-tone.wav');fixtureAudio(audio);
    for(const scene of current.scenes){
      const candidate=await json(root,'timing','import','--scene',scene.id,'--file',audio,'--confirm');
      await json(root,'timing','select','--scene',scene.id,'--hash',candidate.candidateHash,'--confirm');
      assert.equal((await json(root,'build','rehearse','--scene',scene.id,'--allow-actions')).status,'PASS');
    }
    assert.equal((await json(root,'timing','check')).status,'PASS');
    assert.equal((await json(root,'visual','check')).status,'PASS');
    assert.equal((await json(root,'build','freeze','--confirm')).status,'READY');
    const next=await json(root,'production','next');assert.equal(next.kind,'capture');
    await assert.rejects(cli(root,'production','step'),e=>JSON.parse(e.stdout).code==='ACTION_AUTHORIZATION_REQUIRED');
    if(kind==='dashboard'){
      served=html.replace('Inventory dashboard','Incorrect heading');
      await assert.rejects(cli(root,'production','step','--allow-actions'),e=>JSON.parse(e.stdout).code==='ASSERTION_FAILED');
      await assert.rejects(cli(root,'production','diagnose'),e=>{const d=JSON.parse(e.stdout);return d.failure.code==='ASSERTION_FAILED'&&d.failure.metadata.actionIndex===1&&d.failure.retrySameRevision===false;});
      await assert.rejects(cli(root,'production','step','--allow-actions','--retry-failed','--confirm-reset'),e=>JSON.parse(e.stdout).code==='RECOVERY_REQUIRES_REPAIR');
      served=html;
      assert.equal((await json(root,'build','rehearse','--scene','overview','--allow-actions')).status,'PASS');
      assert.equal((await json(root,'build','freeze','--confirm')).status,'READY');
    }
    const first=await json(root,'production','step','--allow-actions');
    assert.equal(first.status,'EXECUTED');assert.equal(first.step.kind,'capture');assert.equal(first.next.kind,'voice');
    const second=await json(root,'production','step');assert.equal(second.status,'EXECUTED');assert.equal(second.runId,first.runId);assert.equal(second.step.kind,'voice');
    for(const scene of current.scenes){
      const cap=scene.id==='overview'?{report:readJson(path.join(sceneDir(root,scene.id),'capture-report.json'))}:await json(root,'capture','--scene',scene.id);
      assert.equal(cap.report.status,'PASS');
      if(scene.id==='workflow'&&kind==='canvas')assert.ok(cap.report.actions.some(a=>a.type==='pointerPath'));
      if(scene.id!=='overview')assert.equal((await json(root,'voice','--scene',scene.id)).reusedSelectedAudio,true);
      await json(root,'captions','--scene',scene.id);await json(root,'preview','--scene',scene.id);
      const qa=await json(root,'qa','--scene',scene.id);
      assert.equal(qa.pass,true,JSON.stringify(qa));assert.equal(qa.checks.claimEvidence,true);
      await cli(root,'approve','--stage','scene','--scene',scene.id);
    }
    assert.equal((await json(root,'production','next')).kind,'render');
    const rendered=await json(root,'production','step');assert.equal(rendered.status,'EXECUTED');assert.equal(rendered.step.kind,'render');
    assert.equal(rendered.next.code,'FINAL_REVIEW');await cli(root,'approve','--stage','final');
    assert.equal((await json(root,'production','next')).status,'COMPLETE');
    const unchanged=sceneDir(root,'overview'),changed=sceneDir(root,'workflow');
    const keep=['capture.mp4','voice.wav','preview.mp4','qa-report.json'].map(n=>fileHash(path.join(unchanged,n)));
    const keepChanged=['capture.mp4','voice.wav'].map(n=>fileHash(path.join(changed,n)));
    // Only edit the workflow shot; the first scene remains locked and approved.
    await cli(root,'unlock','--scene','workflow');
    const ctx=await json(root,'storyboard','context');
    const revision=structuredClone(proposal);
    revision.baseConfigHash=ctx.baseConfigHash;revision.sourceFingerprint=ctx.sourceFingerprint;
    revision.scenes[1].scene.edit.shots[0].zoom=1.2;
    writeJson(proposalFile,revision);
    const diff=await json(root,'storyboard','check');
    assert.deepEqual(diff.diff.changed,['workflow']);
    assert.deepEqual(diff.diff.shotChanges.workflow.changed,['result']);
    await json(root,'storyboard','apply','--hash',diff.proposalHash,'--confirm');
    current=readJson(path.join(root,'project.json'));
    await deny(root,['preview','--scene','workflow'],/BUILD GATE BLOCKED/);
    await prepareAndReview();
    // Capture fingerprints and rehearsal proofs are unchanged by this edit-only revision.
    assert.equal((await json(root,'timing','check')).status,'PASS');
    assert.equal((await json(root,'build','freeze','--confirm')).status,'READY');
    const status=await json(root,'status');
    assert.deepEqual(status.scenes.find(x=>x.id==='overview').stale,{capture:false,voice:false,captions:false,preview:false});
    assert.deepEqual(status.scenes.find(x=>x.id==='workflow').stale,{capture:false,voice:false,captions:false,preview:true});
    assert.equal(status.budget.ttsCalls,0);
    await json(root,'preview','--scene','workflow');assert.equal((await json(root,'qa','--scene','workflow')).pass,true);
    await cli(root,'approve','--stage','scene','--scene','workflow');
    assert.equal((await json(root,'render')).pass,true);
    assert.deepEqual(['capture.mp4','voice.wav','preview.mp4','qa-report.json'].map(n=>fileHash(path.join(unchanged,n))),keep);
    assert.deepEqual(['capture.mp4','voice.wav'].map(n=>fileHash(path.join(changed,n))),keepChanged);
    assert.equal((await json(root,'build','gate')).status,'READY');
    // An altered selected WAV must block the frozen Build before any new render.
    const listed=await json(root,'timing','list','--scene','workflow');
    const selected=listed.candidates.find(c=>c.candidateHash===listed.selected);
    fs.appendFileSync(selected.audio,'tampered');
    await deny(root,['render'],/BUILD GATE BLOCKED/);
  }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
}
for(const kind of ['dashboard','canvas'])test('integrated creative Build, real '+kind+' capture, render and scoped repair',{skip:process.env.AVP_INTEGRATED_SMOKE!=='1',timeout:480000},()=>exercise(kind));

test('managed Node lifecycle is used by actual rehearsal and capture',{skip:process.env.AVP_INTEGRATED_SMOKE!=='1',timeout:180000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-managed-browser-'));
  const portServer=http.createServer();
  try{
    await new Promise(r=>portServer.listen(0,'127.0.0.1',r));
    const port=portServer.address().port;await new Promise(r=>portServer.close(r));
    fs.mkdirSync(path.join(root,'app'));
    fs.writeFileSync(path.join(root,'app','server.mjs'),`import http from 'node:http';http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>Managed fixture</h1>');}).listen(Number(process.env.PORT),process.env.HOST);`);
    const config=readJson(path.join(repo,'templates','project.json'));config.sourcePath='app';config.appUrl='http://127.0.0.1:'+port;
    config.workflow={requireBuild:true};config.review.mode='autonomous';config.voiceover.enabled=false;
    config.render={engine:'ffmpeg',width:320,height:180,fps:24,captionsBurned:false};
    config.appRuntime={mode:'managed-node',entrypoint:'server.mjs',readinessPath:'/',startupTimeoutMs:5000,reset:'fresh-process',isolation:'operator-approved-disposable-local-fixture'};
    config.scenes=[{id:'managed',title:'Managed fixture',durationSec:2,featureIds:['heading'],narration:'Managed fixture.',
      claims:[{id:'heading',featureId:'heading',text:'Managed fixture.',evidenceIds:['heading']}],
      capture:{actions:[{type:'goto',path:'/'},{type:'assertVisible',role:'heading',name:'Managed fixture',evidenceId:'heading'}],evidencePolicy:{requireAssertions:true,failOnPageError:true}}}];
    writeJson(path.join(root,'project.json'),config);
    const status=await json(root,'app','status');
    await json(root,'app','approve','--hash',status.manifestHash,'--confirm');
    assert.equal((await json(root,'app','trial','--allow-launch')).status,'TRIAL_PASS');
    await json(root,'build','prepare');
    await deny(root,['build','rehearse','--scene','managed','--allow-actions'],/allow-launch/);
    assert.equal((await json(root,'build','rehearse','--scene','managed','--allow-actions','--allow-launch')).status,'PASS');
    assert.equal((await json(root,'build','freeze','--confirm')).status,'READY');
    await assert.rejects(cli(root,'production','step','--allow-actions'),e=>JSON.parse(e.stdout).code==='APP_LAUNCH_AUTHORIZATION_REQUIRED');
    assert.equal((await json(root,'production','step','--allow-actions','--allow-launch')).status,'EXECUTED');
    const report=readJson(path.join(sceneDir(root,'managed'),'capture-report.json'));
    assert.equal(report.appSession.manifestHash,status.manifestHash);
    assert.equal(report.status,'PASS');
    await assert.rejects(fetch(config.appUrl,{signal:AbortSignal.timeout(1000)}));
    await json(root,'production','step');await json(root,'production','step');
    const qa=await json(root,'production','step');assert.equal(qa.step.kind,'qa');assert.equal(qa.status,'EXECUTED');
    assert.equal((await json(root,'production','step')).next.status,'COMPLETE');
  }finally{if(portServer.listening)await new Promise(r=>portServer.close(r));fs.rmSync(root,{recursive:true,force:true});}
});
