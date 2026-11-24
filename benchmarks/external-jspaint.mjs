// Real upstream JS Paint, no upstream build scripts or app source modification.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import crypto from 'node:crypto';import {execFile,execFileSync} from 'node:child_process';import {promisify} from 'node:util';
import {readJson,writeJson,fileHash,sha,sceneDir} from '../src/utils.mjs';
import {scaffoldAdapter,adapterPath,approveAdapter} from '../src/adapters.mjs';
const exec=promisify(execFile),repo=path.resolve(import.meta.dirname,'..'),pin='53be67ab8c47cc0d2168899e7481bc04839c4c81';
if(process.env.AVP_EXTERNAL_ISOLATED!=='1')throw Error('Use isolated pilot workflow');
const upstream=path.resolve(process.argv[2]),dest=path.resolve(process.argv[3]),root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-jspaint-'));
const source=path.join(root,'app'),assets=new Map(),types={html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',gif:'image/gif',jpg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',wav:'audio/wav',txt:'text/plain',properties:'text/plain'};
function loadAssets(){
  assert.equal(execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pin);
  const tree=execFileSync('git',['-C',upstream,'ls-tree','-r','-z',pin],{encoding:'utf8',maxBuffer:4*1024*1024}).split('\0').filter(Boolean);
  const manifest=[];let total=0;
  for(const entry of tree){
    const [meta,name]=entry.split('\t'),[mode,type,oid]=meta.split(' ');
    if(type!=='blob'||!['100644','100755'].includes(mode)||!(/^(index\.html$|favicon\.ico$|manifest\.webmanifest$|(?:src|styles|lib|images|localization|audio|help)\/)/.test(name)))continue;
    if(name.split('/').some(p=>!p||p==='.'||p==='..')||name.includes('\\'))throw Error('Unsafe asset path');
    const file=path.join(upstream,name),st=fs.lstatSync(file);if(!st.isFile()||st.size>8*1024*1024)throw Error('Unexpected asset file: '+name);
    const bytes=fs.readFileSync(file),actual=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    if(actual!==oid)throw Error('Pinned Git blob mismatch: '+name);
    total+=bytes.length;if(total>80*1024*1024)throw Error('Asset size budget exceeded');
    assets.set(name,bytes);manifest.push({name,oid});
    if(name.startsWith('src/')&&/\.(js|css|json|html)$/.test(name)){const target=path.join(source,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
  }
  assert.ok(assets.has('index.html')&&assets.has('src/app-state.js'));
  fs.copyFileSync(path.join(upstream,'package.json'),path.join(source,'package.json'));
  // Bind every served byte to a compact source-scanned digest, including binary assets and large JS.
  writeJson(path.join(source,'runtime-assets.json'),{upstream:pin,fileCount:manifest.length,totalBytes:total,gitBlobManifestHash:sha(manifest)});
  console.log('AVP_JSPAINT_INTAKE '+JSON.stringify({files:manifest.length,totalBytes:total}));
}
const server=http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1)||'index.html';}catch{res.writeHead(400);res.end();return;}
  const data=assets.get(name);if(req.method!=='GET'||!data){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'self' blob:; form-action 'none'; base-uri 'self'",
    'Permissions-Policy':'microphone=(), camera=(), geolocation=(), payment=()'});
  res.end(data);
});
const cli=async(...args)=>{try{const {stdout}=await exec(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],{timeout:180000,maxBuffer:4*1024*1024});return JSON.parse(stdout);}catch(e){if(e.code===2&&e.stdout)try{return JSON.parse(e.stdout);}catch{}throw e;}};
const dispatch=async(kind,...flags)=>{const n=await cli('workflow','next');assert.equal(n.status,'NEXT',JSON.stringify(n));assert.equal(n.kind==='production'?n.operation:n.kind,kind,JSON.stringify(n));const s=await cli('workflow','step','--hash',n.taskHash,...flags);assert.equal(s.status,'EXECUTED',JSON.stringify(s));return s;};
let stage='intake';
try{
  fs.mkdirSync(source,{recursive:true});loadAssets();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const config=readJson(path.join(repo,'templates','project.json'));
  config.title='JS Paint: draw on the actual canvas';config.sourcePath='app';config.appUrl='http://127.0.0.1:'+server.address().port;
  config.workflow={requireBuild:true};config.review.mode='autonomous';config.voiceover.enabled=false;config.productionQuality={};config.capabilityRequirements=['pointer-interaction'];
  config.render={engine:'ffmpeg',width:1280,height:720,fps:24,captionsBurned:true};
  config.creative={audience:'First-time graphics editor users',goal:'Show real drawing on the app canvas',director:{mode:'autonomous',visualStyle:'clean',maxDurationSec:30}};
  writeJson(path.join(root,'project.json'),config);
  stage='source-analysis';await dispatch('analyze');await dispatch('skills');assert.equal((await cli('workflow','next')).kind,'author-storyboard');
  const ctx=await cli('storyboard','context'),ref=p=>{const f=ctx.sourceFiles.find(x=>x.path===p);assert.ok(f,p);return f;};
  const loc={canvasClass:'main-canvas'};
  const draw=points=>[{type:'goto',path:'/'},{type:'pause',ms:1500},
    {type:'assertCanvasPixels',...loc,pixelColor:'#ffffffff',minPixels:1000,maxPixels:2000000,evidenceId:'white-canvas'},
    {type:'assertCanvasPixels',...loc,pixelColor:'#000000ff',minPixels:0,maxPixels:0,evidenceId:'before'},
    {type:'pointerPath',...loc,points},
    {type:'assertCanvasPixels',...loc,pixelColor:'#000000ff',minPixels:20,maxPixels:2000000,evidenceId:'after',evidenceScreenshot:true}];
  const recipes=[draw([{x:.2,y:.2},{x:.2,y:.6},{x:.6,y:.6}]),draw([{x:.2,y:.6},{x:.35,y:.2},{x:.5,y:.6},{x:.65,y:.2},{x:.8,y:.6}])];
  const scenes=['stroke','zigzag'].map((id,i)=>{const narration=i?'Draw a zigzag.':'Draw a line.';return {id,title:narration,durationSec:9,featureIds:[id],narration,claims:[{id:id+'-claim',featureId:id,text:narration,evidenceIds:['before','after']}],capture:{adapter:'paint-'+id,actions:[],evidencePolicy:{requireAssertions:true,failOnPageError:true}}};});
  const proposal={schemaVersion:1,baseConfigHash:ctx.baseConfigHash,sourceFingerprint:ctx.sourceFingerprint,storyRationale:'Demonstrate two simple pencil strokes, each in fresh browser storage.',
    features:scenes.map(s=>({id:s.id,reason:'Real pencil drawing',sourceRefs:[ref('src/app-state.js'),ref('src/tools.js')]})),
    scenes:scenes.map((scene,i)=>({scene,role:i?'workflow':'hook',purpose:scene.title,startState:'Fresh isolated browser context',endState:'Actual canvas contains black pixels after pointer drawing',fallback:'Return to Build',dependsOn:[],direction:{}}))};
  const proposalFile=path.join(root,'.avp','planning','agent-storyboard.json');writeJson(proposalFile,proposal);
  stage='adapter-design';const checked=await cli('storyboard','check');assert.equal(checked.status,'VALID_DRAFT_NOT_RUNTIME_VERIFIED');
  assert.equal((await cli('storyboard','apply','--hash',checked.proposalHash,'--confirm')).status,'APPLIED_REQUIRES_BUILD');
  const current=readJson(path.join(root,'project.json'));await dispatch('skills');
  for(const [i,s] of current.scenes.entries()){
    scaffoldAdapter(root,current,s,{id:s.capture.adapter,capabilities:['pointer-interaction']});
    const f=adapterPath(root,s.capture.adapter),m=readJson(f);m.actions=recipes[i];m.expectedEvidenceIds=['white-canvas','before','after'];writeJson(f,m);
    // This is a scripted test confirmation of our reviewed bounded manifest, not a real user's semantic approval.
    approveAdapter(root,current,s,{confirm:true});
  }
  stage='adapter-trial';await dispatch('adapter-trial','--allow-actions');await dispatch('adapter-trial','--allow-actions');
  stage='build';await dispatch('prepare');await dispatch('rehearse','--allow-actions');await dispatch('rehearse','--allow-actions');
  assert.equal((await cli('build','freeze','--confirm')).status,'READY');
  stage='production';const proof=[];
  for(const s of scenes){await dispatch('capture','--allow-actions');const cap=readJson(path.join(sceneDir(root,s.id),'capture-report.json'));const before=cap.assertions.find(x=>x.id==='before').canvas,after=cap.assertions.find(x=>x.id==='after').canvas;
    assert.equal(before.count,0);assert.ok(after.count>=20);proof.push({sceneId:s.id,before,after});await dispatch('captions');await dispatch('preview');await dispatch('qa');}
  assert.equal((await dispatch('render')).next.status,'COMPLETE');
  const full=await cli('benchmark','record','--label','jspaint-full','--kind','full','--scope','external','--confirm');assert.equal(full.reservedCallsDelta,0);
  const prior=await cli('release','archive','--confirm'),other=fileHash(path.join(sceneDir(root,'stroke'),'preview.mp4')),capture=fileHash(path.join(sceneDir(root,'zigzag'),'capture.mp4'));
  stage='repair';const newContext=await cli('storyboard','context'),revision=structuredClone(proposal);revision.baseConfigHash=newContext.baseConfigHash;revision.sourceFingerprint=newContext.sourceFingerprint;
  revision.scenes[1].scene.narration='Draw a zigzag with the pencil.';revision.scenes[1].scene.claims[0].text=revision.scenes[1].scene.narration;
  writeJson(proposalFile,revision);writeJson(path.join(root,'.avp','repair','request.json'),{schemaVersion:1,baseConfigHash:newContext.baseConfigHash,sceneId:'zigzag',cause:'narration',description:'Clarify the pencil tool',rationale:'Retain the actual drawing footage'});
  const plan=await cli('repair','plan');assert.equal(plan.captureScope,'NONE');
  const applied=await cli('repair','apply','--hash',plan.planHash,'--confirm');assert.equal(applied.releaseId,prior.releaseId);
  await cli('build','prepare','--force');assert.equal((await cli('build','freeze','--confirm')).status,'READY');
  await dispatch('captions');await dispatch('preview');await dispatch('qa');assert.equal((await dispatch('render')).next.status,'COMPLETE');
  assert.equal(fileHash(path.join(sceneDir(root,'stroke'),'preview.mp4')),other);assert.equal(fileHash(path.join(sceneDir(root,'zigzag'),'capture.mp4')),capture);
  const repair=await cli('benchmark','record','--label','jspaint-repair','--kind','repair','--scope','external','--confirm');assert.equal(repair.regeneratedCaptureSec,0);
  const comparison=await cli('benchmark','compare','--full',full.id,'--repair',repair.id);
  stage='export';fs.mkdirSync(dest,{recursive:true});
  for(const name of ['final.mp4','final.srt','final-qa.json','final-report.json'])fs.copyFileSync(path.join(root,'.avp','output',name),path.join(dest,name));
  fs.copyFileSync(path.join(root,'.avp','releases',prior.releaseId,'final.mp4'),path.join(dest,'previous.mp4'));
  const result={status:'TECHNICAL_PASS',scope:'SOURCE_DERIVED_EXTERNAL_SCRIPTED_PILOT_NOT_BLIND',sourceRevision:pin,proof,full,repair,comparison,semantic:'NOT_INDEPENDENTLY_EVALUATED',voice:'DISABLED'};
  writeJson(path.join(dest,'pilot-report.json'),result);console.log('AVP_EXTERNAL_JSPAINT '+JSON.stringify(result));
}catch(e){console.error('AVP_EXTERNAL_BLOCKER '+JSON.stringify({stage,message:String(e.message).slice(0,2000)}));throw e;}
finally{if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
