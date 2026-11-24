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
// Exit 2 is a structured decision, not a failed subprocess invocation.
const observe=async(root,...args)=>{try{return await json(root,...args);}catch(e){if(e.code!==2)throw e;return JSON.parse(e.stdout);}};
const workflowDispatch=async(root,kind,...flags)=>{
  const next=await observe(root,'workflow','next');assert.equal(next.status,'NEXT',JSON.stringify(next));
  assert.equal(next.kind==='production'?next.operation:next.kind,kind,JSON.stringify(next));
  const result=await json(root,'workflow','step','--hash',next.taskHash,...flags);
  assert.equal(result.status,'EXECUTED',JSON.stringify(result));return result;
};
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
    config.productionQuality={maxCaptionCps:32};
    config.render={engine:'ffmpeg',width:640,height:360,fps:24,captionsBurned:true};
    config.creative={audience:'product reviewers',goal:'Show a real interaction and result',
      director:{mode:'interactive',visualStyle:'clean',maxDurationSec:20},
      timing:{maxSilenceSec:2,actionToleranceSec:.25},visual:{consistentTheme:true}};
    if(kind==='canvas')config.capabilityRequirements=['pointer-interaction'];
    writeJson(path.join(root,'project.json'),config);
    await workflowDispatch(root,'analyze');await workflowDispatch(root,'skills');
    const author=await observe(root,'workflow','next');assert.equal(author.kind,'author-storyboard');assert.equal(author.status,'AGENT_REQUIRED');
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
    await workflowDispatch(root,'skills'); // config changed; source analysis remains current
    if(kind==='canvas'){
      const missing=await observe(root,'workflow','next');assert.equal(missing.kind,'adapter-design');assert.equal(missing.sceneId,'workflow');
      const scene=current.scenes[1];
      scaffoldAdapter(root,current,scene,{id:'drawing',capabilities:['pointer-interaction']});
      const file=adapterPath(root,'drawing'),manifest=readJson(file);
      manifest.actions=[{type:'goto',path:'/'},
        {type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'no',evidenceId:'before'},
        {type:'pointerPath',testId:'canvas',points:[{x:.1,y:.2},{x:.4,y:.7},{x:.8,y:.25}]},
        {type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'yes',evidenceId:'result'}];
      manifest.expectedEvidenceIds=['before','result'];writeJson(file,manifest);
      const review=await observe(root,'workflow','next');assert.equal(review.kind,'adapter-review');assert.equal(review.status,'REVIEW_REQUIRED');
      approveAdapter(root,current,scene,{confirm:true});
      await workflowDispatch(root,'adapter-trial','--allow-actions');
    }
    const prepareAndReview=async()=>{
      await json(root,'build','prepare','--force');
      const creative=await json(root,'creative','recommend');
      assert.equal(creative.status,'REVIEW_REQUIRED');
      await json(root,'creative','approve','--hash',creative.briefHash,'--confirm');
      await cli(root,'approve','--stage','coverage');await cli(root,'approve','--stage','storyboard');
    };
    await workflowDispatch(root,'prepare');
    await deny(root,['capture','--scene','workflow'],/BUILD GATE BLOCKED/);
    const risky=await observe(root,'workflow','next');assert.equal(risky.kind,'rehearse');assert.equal(risky.sceneId,'workflow');
    await workflowDispatch(root,'rehearse','--allow-actions');await workflowDispatch(root,'rehearse','--allow-actions');
    const voiceReview=await observe(root,'workflow','next');assert.equal(voiceReview.kind,'voice-selection');assert.equal(voiceReview.status,'REVIEW_REQUIRED');
    const audio=path.join(root,'test-tone.wav');fixtureAudio(audio);
    for(const scene of current.scenes){
      const candidate=await json(root,'timing','import','--scene',scene.id,'--file',audio,'--confirm');
      await json(root,'timing','select','--scene',scene.id,'--hash',candidate.candidateHash,'--confirm');
    }
    const creativeReview=await observe(root,'workflow','next');assert.equal(creativeReview.kind,'creative-review');
    await json(root,'creative','approve','--hash',creativeReview.briefHash,'--confirm');
    assert.equal((await observe(root,'workflow','next')).kind,'planning-review');
    await cli(root,'approve','--stage','coverage');await cli(root,'approve','--stage','storyboard');
    assert.equal((await observe(root,'workflow','next')).kind,'freeze');
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
    const first=await workflowDispatch(root,'capture','--allow-actions');assert.equal(first.next.kind,'voice');
    if(kind==='dashboard'){
      // Fault injection: emulate a crash after artifact persistence but before journal completion.
      const file=path.join(root,'.avp','production',first.next.revision+'.json'),journal=readJson(file);
      assert.equal(journal.events.at(-1).status,'EXECUTED');journal.events.pop();writeJson(file,journal);
      const captureFile=path.join(sceneDir(root,'overview'),'capture.mp4'),before=fileHash(captureFile);
      const interrupted=await observe(root,'workflow','next');assert.equal(interrupted.status,'RECOVERY_REQUIRED');
      assert.equal((await observe(root,'production','step')).code,'EXPLICIT_RECOVERY_REQUIRED');
      assert.equal((await observe(root,'production','step','--retry-failed')).code,'INTERRUPTED_STATE_REVIEW_REQUIRED');
      assert.equal((await json(root,'production','step','--retry-failed','--confirm-reset')).status,'RECONCILED');
      assert.equal(fileHash(captureFile),before);assert.equal(readJson(file).events.filter(e=>e.kind==='capture'&&e.status==='RUNNING').length,1);
      assert.equal((await json(root,'telemetry')).currentProduction.totals.reconciled,1);
    }
    // Rehearsal proof alone never permits skipping real capture. All production media steps use the workflow.
    for(const scene of current.scenes){
      if(scene.id!=='overview')await workflowDispatch(root,'capture','--allow-actions');
      const cap=readJson(path.join(sceneDir(root,scene.id),'capture-report.json'));
      assert.equal(cap.status,'PASS');
      if(scene.id==='workflow'&&kind==='canvas')assert.ok(cap.actions.some(a=>a.type==='pointerPath'));
      const voiced=await workflowDispatch(root,'voice');assert.equal(voiced.runId,first.runId);
      await workflowDispatch(root,'captions');await workflowDispatch(root,'preview');await workflowDispatch(root,'qa');
      const qa=readJson(path.join(sceneDir(root,scene.id),'qa-report.json'));
      assert.equal(qa.pass,true,JSON.stringify(qa));assert.equal(qa.checks.claimEvidence,true);
      assert.equal(qa.quality.semanticStatus,'NOT_EVALUATED');assert.ok(qa.quality.frames.length>0);assert.equal(qa.checks.audioQuality,true);assert.equal(qa.checks.evidenceTimeline,true);
      const checkpoint=await observe(root,'workflow','next');assert.equal(checkpoint.status,'REVIEW_REQUIRED');assert.equal(checkpoint.code,'SCENE_REVIEW');assert.equal(checkpoint.sceneId,scene.id);
      await cli(root,'approve','--stage','scene','--scene',scene.id);
    }
    const rendered=await workflowDispatch(root,'render');assert.equal(rendered.step.kind,'render');
    assert.equal(rendered.next.code,'FINAL_REVIEW');await cli(root,'approve','--stage','final');
    assert.equal((await json(root,'production','next')).status,'COMPLETE');
    assert.equal((await json(root,'workflow','next')).status,'COMPLETE');
    const finalAudit=readJson(path.join(root,'.avp','output','final-report.json'));assert.equal(finalAudit.sceneTimeline.length,2);assert.equal(finalAudit.sceneTimeline[0].startMs,0);assert.ok(finalAudit.sceneTimeline[1].startMs>0);
    assert.equal(finalAudit.semanticReview,'NOT_EVALUATED_BY_AUTOMATION');assert.equal(finalAudit.actualBilledUsd,null);
    const unchanged=sceneDir(root,'overview'),changed=sceneDir(root,'workflow');
    const keep=['capture.mp4','voice.wav','preview.mp4','qa-report.json'].map(n=>fileHash(path.join(unchanged,n)));
    const keepChanged=['capture.mp4','voice.wav'].map(n=>fileHash(path.join(changed,n)));
    // Only edit the workflow shot; checkpoint automatically and preserve the approved final.
    const originalFinal=fileHash(path.join(root,'.avp','output','final.mp4'));
    const sem=await json(root,'semantic','context','--scene','workflow');
    writeJson(path.join(root,'.avp','repair','semantic-review.json'),{schemaVersion:1,reviewHash:sem.reviewHash,reviewer:'EXTERNAL_AGENT',findings:Object.fromEntries(sem.dimensions.map(x=>[x,'NOT_EVALUATED']))});
    assert.equal((await json(root,'semantic','record','--scene','workflow','--hash',sem.reviewHash,'--confirm')).disposition,'REVIEW_ISSUES_OR_INCOMPLETE');
    const ctx=await json(root,'storyboard','context');
    const revision=structuredClone(proposal);
    revision.baseConfigHash=ctx.baseConfigHash;revision.sourceFingerprint=ctx.sourceFingerprint;
    revision.scenes[1].scene.edit.shots[0].zoom=1.2;
    writeJson(proposalFile,revision);
    writeJson(path.join(root,'.avp','repair','request.json'),{schemaVersion:1,baseConfigHash:ctx.baseConfigHash,sceneId:'workflow',shotId:'result',cause:'composition',description:'Adjust zoom in result shot',rationale:'Improve focus without changing app interaction'});
    const planned=await json(root,'repair','plan');assert.deepEqual(planned.shotChanges.changed,['result']);
    assert.equal(planned.captureScope,'NONE');assert.equal(planned.nodes.find(n=>n.kind==='preview').action,'REBUILD');
    assert.equal(planned.nodes.find(n=>n.kind==='voice').action,'PRESERVE');
    const applied=await json(root,'repair','apply','--hash',planned.planHash,'--confirm');assert.equal(applied.status,'APPLIED_REQUIRES_BUILD');assert.ok(applied.releaseId);assert.ok(applied.backup);
    assert.equal(fileHash(path.join(root,'.avp','releases',applied.releaseId,'final.mp4')),originalFinal);
    assert.equal((await json(root,'release','verify','--hash',applied.releaseId)).status,'VERIFIED_ARCHIVE');
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
    const repair=await json(root,'production','step');assert.equal(repair.status,'EXECUTED');assert.equal(repair.step.kind,'preview');
    const telemetry=await json(root,'telemetry');assert.equal(telemetry.provider.reservedCalls,0);assert.equal(telemetry.artifacts.baselineAvailable,true);
    assert.ok(telemetry.artifacts.unchangedCurrentSinceFirstDispatch.some(a=>a.sceneId==='overview'&&a.kind==='preview'));
    assert.ok(telemetry.artifacts.unchangedCurrentSinceFirstDispatch.some(a=>a.sceneId==='workflow'&&a.kind==='capture'));
    assert.ok(!telemetry.artifacts.unchangedCurrentSinceFirstDispatch.some(a=>a.sceneId==='workflow'&&a.kind==='preview'));
    assert.equal(telemetry.currentProduction.byKind.preview.executed,1);
    assert.equal((await json(root,'qa','--scene','workflow')).pass,true);
    await cli(root,'approve','--stage','scene','--scene','workflow');
    assert.equal((await json(root,'render')).pass,true);
    assert.deepEqual(['capture.mp4','voice.wav','preview.mp4','qa-report.json'].map(n=>fileHash(path.join(unchanged,n))),keep);
    assert.deepEqual(['capture.mp4','voice.wav'].map(n=>fileHash(path.join(changed,n))),keepChanged);
    assert.equal(fileHash(path.join(root,'.avp','releases',applied.releaseId,'final.mp4')),originalFinal);
    await deny(root,['semantic','record','--scene','workflow','--hash',sem.reviewHash,'--confirm'],/Review must explicitly bind/);
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
    config.workflow={requireBuild:true};config.review.mode='autonomous';config.voiceover.enabled=false;config.productionQuality={};
    config.render={engine:'ffmpeg',width:320,height:180,fps:24,captionsBurned:false};
    config.appRuntime={mode:'managed-node',entrypoint:'server.mjs',readinessPath:'/',startupTimeoutMs:5000,reset:'fresh-process',isolation:'operator-approved-disposable-local-fixture'};
    config.scenes=[{id:'managed',title:'Managed fixture',durationSec:2,featureIds:['heading'],narration:'Managed fixture.',
      claims:[{id:'heading',featureId:'heading',text:'Managed fixture.',evidenceIds:['heading']}],
      capture:{actions:[{type:'goto',path:'/'},{type:'assertVisible',role:'heading',name:'Managed fixture',evidenceId:'heading'}],evidencePolicy:{requireAssertions:true,failOnPageError:true}}}];
    writeJson(path.join(root,'project.json'),config);
    let next=await json(root,'workflow','next');assert.equal(next.kind,'analyze');
    next=(await json(root,'workflow','step','--hash',next.taskHash)).next;assert.equal(next.kind,'skills');
    next=(await json(root,'workflow','step','--hash',next.taskHash)).next;assert.equal(next.kind,'runtime-review');
    const status=await json(root,'app','status');
    await json(root,'app','approve','--hash',status.manifestHash,'--confirm');
    next=await json(root,'workflow','next');assert.equal(next.kind,'runtime-trial');
    await assert.rejects(cli(root,'workflow','step','--hash',next.taskHash),e=>JSON.parse(e.stdout).status==='AUTHORIZATION_REQUIRED');
    next=(await json(root,'workflow','step','--hash',next.taskHash,'--allow-launch')).next;assert.equal(next.kind,'prepare');
    next=(await json(root,'workflow','step','--hash',next.taskHash)).next;assert.equal(next.kind,'rehearse');
    await assert.rejects(cli(root,'workflow','step','--hash',next.taskHash,'--allow-actions'),e=>JSON.parse(e.stdout).status==='AUTHORIZATION_REQUIRED');
    next=(await json(root,'workflow','step','--hash',next.taskHash,'--allow-actions','--allow-launch')).next;assert.equal(next.kind,'freeze');
    assert.equal((await json(root,'build','freeze','--confirm')).status,'READY');
    await assert.rejects(cli(root,'production','step','--allow-actions'),e=>JSON.parse(e.stdout).code==='APP_LAUNCH_AUTHORIZATION_REQUIRED');
    next=await json(root,'workflow','next');assert.equal(next.kind,'production');assert.equal(next.operation,'capture');
    assert.equal((await json(root,'workflow','step','--hash',next.taskHash,'--allow-actions','--allow-launch')).status,'EXECUTED');
    const report=readJson(path.join(sceneDir(root,'managed'),'capture-report.json'));
    assert.equal(report.appSession.manifestHash,status.manifestHash);
    assert.equal(report.status,'PASS');
    await assert.rejects(fetch(config.appUrl,{signal:AbortSignal.timeout(1000)}));
    await workflowDispatch(root,'captions');await workflowDispatch(root,'preview');
    const qa=await workflowDispatch(root,'qa');assert.equal(qa.step.kind,'qa');
    assert.equal((await workflowDispatch(root,'render')).next.status,'COMPLETE');
    assert.equal((await json(root,'workflow','next')).status,'COMPLETE');
  }finally{if(portServer.listening)await new Promise(r=>portServer.close(r));fs.rmSync(root,{recursive:true,force:true});}
});
