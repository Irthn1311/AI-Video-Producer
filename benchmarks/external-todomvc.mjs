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
let stage='intake';
try{
  fs.mkdirSync(served,{recursive:true});copySource(path.join(app,'src'),path.join(source,'src'));copyRegular(path.join(app,'package.json'),path.join(source,'package.json'));
  for(const name of Object.keys(assets))copyRegular(path.join(app,'dist',name),path.join(served,name));
  // Served dist bytes are included under a non-excluded directory in AVP source fingerprint.
  await wait();
  const config=readJson(path.join(repo,'templates','project.json'));
  config.title='TodoMVC React: task workflow';config.sourcePath='app';config.appUrl='http://127.0.0.1:'+server.address().port;
  config.workflow={requireBuild:true};config.review.mode='autonomous';config.voiceover.enabled=false;config.productionQuality={};
  config.render={engine:'ffmpeg',width:1280,height:720,fps:24,captionsBurned:true};
  config.creative={audience:'first-time TodoMVC users',goal:'Demonstrate creating and completing a task with real UI',director:{mode:'autonomous',visualStyle:'clean',maxDurationSec:30}};
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
  const scenes=[createScene('create','Create a task','Add a task.',add,['task-added']),createScene('complete','Complete a task','Complete the task.',complete,['completed-count','completed-task'])];
  const entry=(scene,role)=>({scene,role,purpose:scene.title,startState:'Fresh isolated browser storage',endState:'Declared UI assertions pass',fallback:'Return to Build',dependsOn:[],direction:{}});
  const proposal={schemaVersion:1,baseConfigHash:ctx.baseConfigHash,sourceFingerprint:ctx.sourceFingerprint,storyRationale:'A short first-time task workflow; each scene establishes its own state.',
    features:[{id:'create',reason:'Input commits tasks on Enter',sourceRefs:[ref('src/todo/components/input.jsx'),ref('src/todo/reducer.js')]},
      {id:'complete',reason:'Checkbox and completed filter',sourceRefs:[ref('src/todo/components/item.jsx'),ref('src/todo/components/footer.jsx')]}],
    scenes:[entry(scenes[0],'hook'),entry(scenes[1],'workflow')]};
  const proposalFile=path.join(root,'.avp','planning','agent-storyboard.json');writeJson(proposalFile,proposal);
  stage='build';const checked=await cli('storyboard','check');assert.equal(checked.status,'VALID_DRAFT_NOT_RUNTIME_VERIFIED');
  assert.equal((await cli('storyboard','apply','--hash',checked.proposalHash,'--confirm')).status,'APPLIED_REQUIRES_BUILD');
  await dispatch('skills');await dispatch('prepare');await dispatch('rehearse','--allow-actions');await dispatch('rehearse','--allow-actions');
  assert.equal((await cli('build','freeze','--confirm')).status,'READY');
  stage='production';for(const scene of scenes){await dispatch('capture','--allow-actions');await dispatch('captions');await dispatch('preview');await dispatch('qa');}
  assert.equal((await dispatch('render')).next.status,'COMPLETE');
  const full=await cli('benchmark','record','--label','todomvc-full','--kind','full','--scope','external','--confirm');
  assert.equal(full.reservedCallsDelta,0);
  const prior=await cli('release','archive','--confirm'),preserved=fileHash(path.join(sceneDir(root,'create'),'preview.mp4')),capture=fileHash(path.join(sceneDir(root,'complete'),'capture.mp4'));
  stage='repair';const newContext=await cli('storyboard','context'),revision=structuredClone(proposal);
  revision.baseConfigHash=newContext.baseConfigHash;revision.sourceFingerprint=newContext.sourceFingerprint;
  revision.scenes[1].scene.narration='Complete the task. Show completed tasks.';
  revision.scenes[1].scene.claims[0].text=revision.scenes[1].scene.narration;
  writeJson(proposalFile,revision);
  writeJson(path.join(root,'.avp','repair','request.json'),{schemaVersion:1,baseConfigHash:newContext.baseConfigHash,sceneId:'complete',cause:'narration',description:'Clarify the completed-task filter in the caption',rationale:'Existing footage already demonstrates the result'});
  const plan=await cli('repair','plan');assert.equal(plan.captureScope,'NONE');assert.equal(plan.nodes.find(x=>x.kind==='captions').action,'REBUILD');
  const applied=await cli('repair','apply','--hash',plan.planHash,'--confirm');assert.equal(applied.releaseId,prior.releaseId);
  await cli('build','prepare','--force');assert.equal((await cli('build','freeze','--confirm')).status,'READY');
  await dispatch('captions');await dispatch('preview');await dispatch('qa');assert.equal((await dispatch('render')).next.status,'COMPLETE');
  assert.equal(fileHash(path.join(sceneDir(root,'create'),'preview.mp4')),preserved);assert.equal(fileHash(path.join(sceneDir(root,'complete'),'capture.mp4')),capture);
  const repair=await cli('benchmark','record','--label','todomvc-repair','--kind','repair','--scope','external','--confirm');
  assert.equal(repair.regeneratedCaptureSec,0);assert.equal(repair.reservedCallsDelta,0);
  const comparison=await cli('benchmark','compare','--full',full.id,'--repair',repair.id);assert.equal(comparison.status,'UNMATCHED_INPUT_OBSERVATION');
  stage='export';fs.mkdirSync(destination,{recursive:true});
  for(const name of ['final.mp4','final.srt','final-qa.json','final-report.json'])copyRegular(path.join(root,'.avp','output',name),path.join(destination,name));
  copyRegular(path.join(root,'.avp','releases',prior.releaseId,'final.mp4'),path.join(destination,'previous.mp4'));
  const result={status:'TECHNICAL_PASS',scope:'SOURCE_DERIVED_EXTERNAL_SCRIPTED_PILOT_NOT_BLIND',sourceRevision:pin,full,repair,comparison,semantic:'NOT_INDEPENDENTLY_EVALUATED',voice:'DISABLED'};
  writeJson(path.join(destination,'pilot-report.json'),result);console.log('AVP_EXTERNAL_PILOT '+JSON.stringify(result));
}catch(e){console.error('AVP_EXTERNAL_BLOCKER '+JSON.stringify({stage,message:String(e.message).slice(0,1500)}));throw e;}
finally{if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
