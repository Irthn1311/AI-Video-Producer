// Source-derived integration pilot on pinned upstream TodoMVC React.
 // No independent LLM benchmark; no paid voice, upstream install, or runtime response substitution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readJson,writeJson,fileHash,sceneDir} from '../src/utils.mjs';
const exec=promisify(execFile),repo=path.resolve(import.meta.dirname,'..');
const pin='ff43b02e59dfa604386bb382034b2cd07c2bcd8a';
if(process.env.AVP_EXTERNAL_ISOLATED!=='1')throw Error('Use reviewed isolated external pilot workflow');
const mode=process.argv[4]||'baseline';if(!['baseline','story','focus'].includes(mode))throw Error('Invalid TodoMVC pilot mode');
const focus=mode==='focus',story=mode!=='baseline';
const upstream=path.resolve(process.argv[2]),destination=path.resolve(process.argv[3]);
assert.equal(execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pin);
const app=path.join(upstream,'examples','react'),root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-todomvc-'));
const source=path.join(root,'app'),served=path.join(source,'runtime-assets');
const assets={'index.html':'text/html; charset=utf-8','app.bundle.js':'text/javascript; charset=utf-8','app.css':'text/css; charset=utf-8','base.js':'text/javascript; charset=utf-8'};
function copyRegular(from,to){if(!fs.lstatSync(from).isFile())throw Error('Nonregular source asset');fs.copyFileSync(from,to);}
function copySource(from,to){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Unexpected source symlink');if(e.isDirectory())copySource(path.join(from,e.name),path.join(to,e.name));else if(e.isFile())copyRegular(path.join(from,e.name),path.join(to,e.name));}}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname,name=pathname==='/'?'index.html':pathname.slice(1);
  if(req.method!=='GET'||!Object.hasOwn(assets,name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':assets[name],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"});
  res.end(fs.readFileSync(path.join(served,name)));
});
const cli=async(...args)=>{try{const {stdout}=await exec(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],{timeout:180000,maxBuffer:4*1024*1024});return JSON.parse(stdout);}catch(e){if(e.code===2&&e.stdout)try{return JSON.parse(e.stdout);}catch{}throw e;}};
const dispatch=async(kind,...flags)=>{
  const n=await cli('workflow','next');assert.equal(n.status,'NEXT',JSON.stringify(n));assert.equal(n.kind==='production'?n.operation:n.kind,kind,JSON.stringify(n));
  const s=await cli('workflow','step','--hash',n.taskHash,...flags);assert.equal(s.status,'EXECUTED',JSON.stringify(s));return s;
};
const wait=async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));};
async function selectLocalSpeech(scene){
  const wav=path.join(root,scene.id+'-local-speech.wav');
  execFileSync('espeak-ng',['-v','vi-sgn','-s','145','-w',wav,scene.narration],{timeout:30000});
  const candidate=await cli('timing','import','--scene',scene.id,'--file',wav,'--confirm');
  await cli('timing','select','--scene',scene.id,'--hash',candidate.candidateHash,'--confirm');
  return {sceneId:scene.id,candidateHash:candidate.candidateHash,origin:'ESPEAK_NG_LOCAL_SYNTHETIC_VI_SGN'};
}
let stage='intake';
try{
  fs.mkdirSync(served,{recursive:true});copySource(path.join(app,'src'),path.join(source,'src'));copyRegular(path.join(app,'package.json'),path.join(source,'package.json'));
  for(const name of Object.keys(assets))copyRegular(path.join(app,'dist',name),path.join(served,name));
  // Served dist bytes are included under a non-excluded directory in AVP source fingerprint.
  await wait();
  const config=readJson(path.join(repo,'templates','project.json'));
  config.title='TodoMVC React: task workflow';config.sourcePath='app';config.appUrl='http://127.0.0.1:'+server.address().port;
  config.workflow={requireBuild:true};config.review.mode='autonomous';config.voiceover.enabled=story;config.productionQuality=story?{targetLufs:-20}:{};
  config.render={engine:'ffmpeg',width:1280,height:720,fps:24,captionsBurned:true};
  config.creative={audience:'first-time TodoMVC users',goal:'Demonstrate creating and completing a task with real UI',director:{mode:'autonomous',visualStyle:'clean',maxDurationSec:30}};
  if(story){
    config.language={script:'vi',narration:'vi-VN',subtitles:['vi']};
    config.voiceover.style='Local synthetic Vietnamese integration speech; no provider call';
    config.render={engine:'ffmpeg',width:1280,height:720,fps:24,captionsBurned:true};
    config.assembly={transition:{type:'crossfade-hold',durationSec:.5}};
    config.creative={audience:'Người mới cần quản lý công việc trong ngày',goal:'Từ ghi công việc đến hoàn thành và dọn danh sách',director:{mode:'autonomous',visualStyle:'Framed product walkthrough, no overlays on the UI',targetDurationSec:37.5,maxDurationSec:40},timing:{maxSilenceSec:2,actionToleranceSec:.25},visual:{consistentTheme:true}};
  }
  writeJson(path.join(root,'project.json'),config);
  stage='source-analysis';await dispatch('analyze');await dispatch('skills');
  const next=await cli('workflow','next');assert.equal(next.kind,'author-storyboard');assert.equal(next.status,'AGENT_REQUIRED');
  const ctx=await cli('storyboard','context');
  const ref=p=>{const f=ctx.sourceFiles.find(x=>x.path===p);assert.ok(f,p);return f;};
  const task='Prepare demo';
  const add=[{type:'goto',path:'/'},{type:'fill',label:'New Todo Input',value:task},{type:'press',label:'New Todo Input',key:'Enter'},
    {type:'assertVisible',text:task,evidenceId:'task-added',evidenceScreenshot:true}];
  const complete=[...add,{type:'click',testId:'todo-item-toggle'},{type:'assertVisible',text:'0 items left!',evidenceId:'completed-count'},
    {type:'click',role:'link',name:'Completed'},{type:'assertVisible',text:task,evidenceId:'completed-task',evidenceScreenshot:true}];
  const createScene=(id,title,narration,actions,evidenceIds)=>({id,title,durationSec:8,featureIds:[id],narration,claims:[{id:id+'-claim',featureId:id,text:narration,evidenceIds}],
    capture:{actions,evidencePolicy:{requireAssertions:true,failOnPageError:true}}});
  let scenes=[createScene('create','Create a task','Add a task.',add,['task-added']),createScene('complete','Complete a task','Complete the task.',complete,['completed-count','completed-task'])];
  const refs=[
    {id:'create',reason:'Input commits tasks on Enter',sourceRefs:[ref('src/todo/components/input.jsx'),ref('src/todo/reducer.js')]},
    {id:'complete',reason:'Checkbox and completed filter',sourceRefs:[ref('src/todo/components/item.jsx'),ref('src/todo/components/footer.jsx')]}];
  if(story){
    const pause=ms=>({type:'pause',ms});
    const fill=title=>[{type:'fill',label:'New Todo Input',value:title},pause(650),{type:'press',label:'New Todo Input',key:'Enter'}];
    const visible=(text,id)=>({type:'assertVisible',text,evidenceId:id,evidenceScreenshot:true});
    const begin=[{type:'goto',path:'/'},...fill(task),visible(task,'task-added'),pause(650)];
    const finish=[...begin,{type:'click',testId:'todo-item-toggle'},visible('0 items left!','done-count'),pause(650)];
    const second='Review notes';
    const both=[...finish,...fill(second),visible(second,'second-added')];
    const filters=[...both,{type:'click',role:'link',name:'Active'},visible(second,'active-task'),pause(500),{type:'click',role:'link',name:'Completed'},visible(task,'completed-task'),pause(700)];
    const clear=[...both,{type:'click',role:'button',name:'Clear completed'},visible(second,'remaining-task'),visible('1 item left!','remaining-count'),pause(650)];
    const theme={background:'#101C30',panel:'#203550',text:'#FFFFFF',accent:'#71C7BE'};
    scenes=[
      createScene('create','01 / 04 · Ghi việc cần làm','Bắt đầu ngày mới bằng một việc cần làm. Nhập tên rồi nhấn Enter.',begin,['task-added']),
      createScene('complete','02 / 04 · Hoàn thành công việc','Khi đã làm xong, đánh dấu vào ô bên trái. Danh sách cập nhật số việc còn lại.',finish,['done-count']),
      createScene('filter','03 / 04 · Theo dõi tiến độ','Tách việc đang làm khỏi việc đã xong bằng hai bộ lọc. Bạn dễ dàng theo dõi tiến độ.',filters,['active-task','completed-task']),
      createScene('cleanup','04 / 04 · Dọn danh sách','Cuối cùng, xóa những việc đã hoàn thành. Chỉ giữ lại việc còn phải làm.',clear,['remaining-task','remaining-count'])
    ].map(s=>({...s,durationSec:9,edit:{layout:'framed',chapter:s.title,design:{rationale:'Keep the whole real app visible between separate title and caption lanes.',framing:'stable',theme},shots:[{id:'app-view',source:'capture',durationSec:9,camera:'static',purpose:'Show actual app state and verified actions'}]}}));
    if(focus){
      const anchors={create:[['task-added','nhấn Enter.']],complete:[['done-count','số việc còn lại.']],filter:[['active-task','hai bộ lọc.'],['completed-task','theo dõi tiến độ.']],cleanup:[['remaining-count','việc còn phải làm.']]};
      // Approximate focus region inferred from actual PR37 frame; full source always remains in adjacent overview.
      scenes=scenes.map(s=>({...s,edit:{...s.edit,detail:{x:.235,y:.015,width:.53,height:.62},syncAnchors:anchors[s.id].map(([evidenceId,cueText])=>({evidenceId,cueText,maxOffsetSec:.5}))}}));
      // Give the first spoken instruction time to start before committing the new task. Still real UI actions.
      const create=scenes[0].capture.actions,enter=create.findIndex(a=>a.type==='press');create[enter-1].ms=2300;
      const complete=scenes[1].capture.actions,click=complete.findIndex(a=>a.type==='click');complete[click-1].ms=1700;
    }
    refs.push({id:'filter',reason:'Active and Completed routes separate task state',sourceRefs:[ref('src/todo/components/footer.jsx')]},{id:'cleanup',reason:'Remove completed reducer and footer button',sourceRefs:[ref('src/todo/reducer.js'),ref('src/todo/components/footer.jsx')]});
  }
  const entry=(scene,role)=>({scene,role,purpose:scene.title,startState:'Fresh isolated browser storage',endState:'Declared UI assertions pass',fallback:'Return to Build',dependsOn:[],direction:{}});
  const proposal={schemaVersion:1,baseConfigHash:ctx.baseConfigHash,sourceFingerprint:ctx.sourceFingerprint,storyRationale:'A short first-time task workflow; each scene establishes its own state.',
    features:refs,scenes:scenes.map((s,i)=>entry(s,i===0?'hook':i===scenes.length-1?'conclusion':'workflow'))};
  const proposalFile=path.join(root,'.avp','planning','agent-storyboard.json');writeJson(proposalFile,proposal);
  stage='build';const checked=await cli('storyboard','check');assert.equal(checked.status,'VALID_DRAFT_NOT_RUNTIME_VERIFIED');
  assert.equal((await cli('storyboard','apply','--hash',checked.proposalHash,'--confirm')).status,'APPLIED_REQUIRES_BUILD');
  await dispatch('skills');await dispatch('prepare');for(const s of scenes)await dispatch('rehearse','--allow-actions');
  const selected=[];if(story){stage='local-speech-selection';for(const s of scenes)selected.push(await selectLocalSpeech(s));assert.equal((await cli('timing','check')).status,'PASS');}
  assert.equal((await cli('build','freeze','--confirm')).status,'READY');
  stage='production';for(const scene of scenes){await dispatch('capture','--allow-actions');if(story)await dispatch('voice');await dispatch('captions');await dispatch('preview');await dispatch('qa');}
  assert.equal((await dispatch('render')).next.status,'COMPLETE');
  const full=await cli('benchmark','record','--label','todomvc-full','--kind','full','--scope','external','--confirm');
  assert.equal(full.reservedCallsDelta,0);
  const prior=await cli('release','archive','--confirm'),targetId=story?'filter':'complete';
  const preserveIds=scenes.filter(s=>s.id!==targetId).map(s=>s.id),preserved=Object.fromEntries(preserveIds.map(id=>[id,Object.fromEntries(['capture.mp4','preview.mp4','captions.srt',...(story?['voice.wav']:[])].map(n=>[n,fileHash(path.join(sceneDir(root,id),n))]))]));
  const capture=fileHash(path.join(sceneDir(root,targetId),'capture.mp4')),targetVoice=story?fileHash(path.join(sceneDir(root,targetId),'voice.wav')):null,targetCaptions=fileHash(path.join(sceneDir(root,targetId),'captions.srt'));
  stage='repair';const newContext=await cli('storyboard','context'),revision=structuredClone(proposal);
  revision.baseConfigHash=newContext.baseConfigHash;revision.sourceFingerprint=newContext.sourceFingerprint;
  if(story){
    const target=revision.scenes.find(s=>s.scene.id===targetId).scene;
    const i=target.capture.actions.findIndex(a=>a.evidenceId==='active-task');
    assert.equal(target.capture.actions[i+1].type,'pause');target.capture.actions[i+1].ms=1400;
  }else{
    revision.scenes[1].scene.narration='Complete the task. Show completed tasks.';
    revision.scenes[1].scene.claims[0].text=revision.scenes[1].scene.narration;
  }
  writeJson(proposalFile,revision);
  writeJson(path.join(root,'.avp','repair','request.json'),{schemaVersion:1,baseConfigHash:newContext.baseConfigHash,sceneId:targetId,cause:story?'capture-timing':'narration',description:story?'Hold the Active filter longer so the viewer can read it':'Clarify the completed-task filter in the caption',rationale:story?'Recapture only the filter scene; keep the same narration and script':'Existing footage already demonstrates the result'});
  const plan=await cli('repair','plan');assert.equal(plan.captureScope,story?'FULL_TARGET_SCENE':'NONE');assert.equal(plan.nodes.find(x=>x.kind==='captions').action,story?'PRESERVE':'REBUILD');if(story)assert.equal(plan.nodes.find(x=>x.kind==='voice').action,'PRESERVE');
  const applied=await cli('repair','apply','--hash',plan.planHash,'--confirm');assert.equal(applied.releaseId,prior.releaseId);
  await cli('build','prepare','--force');if(story){const rehearsed=await cli('build','rehearse','--scene',targetId,'--allow-actions');assert.equal(rehearsed.status,'PASS');assert.equal((await cli('timing','check')).status,'PASS');}
  assert.equal((await cli('build','freeze','--confirm')).status,'READY');
  if(story)await dispatch('capture','--allow-actions');else await dispatch('captions');await dispatch('preview');await dispatch('qa');assert.equal((await dispatch('render')).next.status,'COMPLETE');
  for(const [id,parts] of Object.entries(preserved))for(const [name,hash] of Object.entries(parts))assert.equal(fileHash(path.join(sceneDir(root,id),name)),hash);
  if(story){assert.notEqual(fileHash(path.join(sceneDir(root,targetId),'capture.mp4')),capture);assert.equal(fileHash(path.join(sceneDir(root,targetId),'voice.wav')),targetVoice);assert.equal(fileHash(path.join(sceneDir(root,targetId),'captions.srt')),targetCaptions);}else assert.equal(fileHash(path.join(sceneDir(root,targetId),'capture.mp4')),capture);
  const repair=await cli('benchmark','record','--label','todomvc-repair','--kind','repair','--scope','external','--confirm');
  assert.equal(repair.reservedCallsDelta,0);if(story){assert.ok(repair.regeneratedCaptureSec>0);assert.equal(repair.scenes.filter(s=>s.artifactStatus.capture==='EXECUTED').length,1);assert.equal(repair.scenes.find(s=>s.sceneId===targetId).artifactStatus.voice,'PRESERVED');}else assert.equal(repair.regeneratedCaptureSec,0);
  const comparison=await cli('benchmark','compare','--full',full.id,'--repair',repair.id);assert.equal(comparison.status,'UNMATCHED_INPUT_OBSERVATION');
  if(story){
    const audit=readJson(path.join(root,'.avp','output','final-report.json')),segments=audit.assembly.segments;
    assert.equal(segments.filter(s=>s.kind==='transition').length,3);
    assert.equal(segments.filter(s=>s.kind==='scene').length,4);
    for(const s of audit.sceneTimeline){const seg=segments.find(x=>x.sceneId===s.sceneId);assert.equal(s.startMs,Math.round(seg.fromFrame/audit.assembly.policy.fps*1000));}
    assert.ok(Math.abs(repair.finalDurationSec-audit.assembly.durationSec)<.12);
    assert.equal(repair.scenes.filter(s=>s.artifactStatus.preview==='EXECUTED').length,1);
  }
  stage='export';fs.mkdirSync(destination,{recursive:true});
  for(const name of ['final.mp4','final.srt','final-qa.json','final-report.json'])copyRegular(path.join(root,'.avp','output',name),path.join(destination,name));
  copyRegular(path.join(root,'.avp','releases',prior.releaseId,'final.mp4'),path.join(destination,'previous.mp4'));
  const diagnostics=focus?scenes.map(s=>{const q=readJson(path.join(sceneDir(root,s.id),'qa-report.json')).quality;assert.ok(q.framing?.detail);assert.ok(q.cueAlignment?.results?.length);return {sceneId:s.id,framing:q.framing,cueAlignment:q.cueAlignment};}):[];
  if(focus)assert.equal(diagnostics.flatMap(s=>s.cueAlignment.results).length,5);
  const result={status:'TECHNICAL_PASS',mode,selected,diagnostics,scope:'SOURCE_DERIVED_EXTERNAL_SCRIPTED_PILOT_NOT_BLIND',sourceRevision:pin,full,repair,comparison,semantic:'NOT_INDEPENDENTLY_EVALUATED',voice:story?'ESPEAK_NG_LOCAL_SYNTHETIC_VI_SGN_NOT_LISTENING_VERIFIED':'DISABLED'};
  writeJson(path.join(destination,'pilot-report.json'),result);console.log('AVP_EXTERNAL_PILOT '+JSON.stringify(result));
}catch(e){console.error('AVP_EXTERNAL_BLOCKER '+JSON.stringify({stage,message:String(e.message).slice(0,1500)}));throw e;}
finally{if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
