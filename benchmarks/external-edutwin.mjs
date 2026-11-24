// Known-app source-derived external pilot, not an independent agent benchmark.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import assert from 'node:assert/strict';import {execFile,execFileSync} from 'node:child_process';import {promisify} from 'node:util';
import {readJson,writeJson,fileHash} from '../src/utils.mjs';
import {scanSource} from '../src/inspect.mjs';
const exec=promisify(execFile),root='/work/demo',source='/target',repo='/avp',out='/work/public',pin='5d64f7b172a06eefeeb3cff65c85d6d6761db825';
const appUrl='http://127.0.0.1:4173',api='http://127.0.0.1:8080',password=process.env.AVP_QA_PASSWORD;
if(process.env.AVP_EDUTWIN_ISOLATED!=='1'||fs.readdirSync('/sys/class/net').join(',')!=='lo'||typeof password!=='string'||password.length<12)throw Error('Isolated QA namespace and generated disposable password required');
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',wasm:'application/wasm',pdf:'application/pdf'};
const dist='/web-dist';
const server=http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,appUrl);
    if(u.pathname.startsWith('/api/')){
      const headers={...req.headers,host:'127.0.0.1:8080'};delete headers.connection;
      const proxy=http.request(api+u.pathname+u.search,{method:req.method,headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
      proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(proxy);return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    let f=path.resolve(dist,'.'+decodeURIComponent(u.pathname));
    if(!f.startsWith(dist+'/')&&f!==dist)throw Error('unsafe path');
    if(!fs.existsSync(f)||!fs.statSync(f).isFile()){if(path.extname(u.pathname)){res.writeHead(404);res.end();return;}f=path.join(dist,'index.html');}
    if(!fs.realpathSync(f).startsWith(dist+'/'))throw Error('unsafe file');
    res.writeHead(200,{'Content-Type':types[path.extname(f).slice(1)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(f).pipe(res);
  }catch{res.writeHead(400);res.end();}
});
let stage='readiness';
const cli=async(...args)=>{try{const {stdout}=await exec(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],{timeout:240000,maxBuffer:8*1024*1024});return JSON.parse(stdout);}catch(e){if(e.code===2&&e.stdout)try{return JSON.parse(e.stdout);}catch{}throw Error('AVP command failed: '+args.slice(0,2).join(' '));}};
const dispatch=async(kind,...flags)=>{const n=await cli('workflow','next');assert.equal(n.status,'NEXT');assert.equal(n.kind==='production'?n.operation:n.kind,kind);const s=await cli('workflow','step','--hash',n.taskHash,...flags);assert.equal(s.status,'EXECUTED');return s;};
const speech=async scene=>{const wav=path.join(root,scene.id+'.wav');execFileSync('espeak-ng',['-v','vi-sgn','-s','145','-w',wav,scene.narration],{timeout:30000});const a=await cli('timing','import','--scene',scene.id,'--file',wav,'--confirm');await cli('timing','select','--scene',scene.id,'--hash',a.candidateHash,'--confirm');};
try{
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(out,{recursive:true});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4173,'127.0.0.1',resolve);});
  let ready=false;for(let i=0;i<180;i++){try{const response=await fetch(appUrl+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({centerCode:'EDUTWIN_A',username:'student01',password}),signal:AbortSignal.timeout(3000)});if(response.ok){ready=true;await response.body?.cancel();break;}await response.body?.cancel();}catch{}await new Promise(r=>setTimeout(r,2000));}
  assert.ok(ready,'Synthetic student login readiness failed');
  const config=readJson(path.join(repo,'templates','project.json'));config.title='EduTwin — Hành trình học tập';config.sourcePath=source;config.appUrl=appUrl;
  config.workflow={requireBuild:true};config.review.mode='autonomous';config.voiceover.enabled=true;config.productionQuality={targetLufs:-20};
  config.language={script:'vi',narration:'vi-VN',subtitles:['vi']};config.voiceover.style='Local synthetic Vietnamese; no external API';
  config.render={engine:'ffmpeg',width:1280,height:720,fps:24,captionsBurned:true};
  config.assembly={transition:{type:'crossfade-hold',durationSec:.5}};
  config.creative={audience:'Học sinh THPT mới sử dụng EduTwin',goal:'Giới thiệu tổng quan, bài tập, hồ sơ năng lực và khu vực luyện tập',director:{mode:'autonomous',visualStyle:'Framed product walkthrough',targetDurationSec:49.5,maxDurationSec:60},timing:{maxSilenceSec:2,actionToleranceSec:.25},visual:{consistentTheme:true}};
  writeJson(path.join(root,'project.json'),config);
  stage='source-analysis';await dispatch('analyze');await dispatch('skills');const n=await cli('workflow','next');assert.equal(n.status,'AGENT_REQUIRED');assert.equal(n.kind,'author-storyboard');
  const ctx=await cli('storyboard','context'),scan=scanSource(root,config),sourceRef=p=>{const f=scan.files.find(f=>f.path===p);assert.ok(f,'Missing source reference');return {path:f.path,sha256:f.sha256};};
  const app='web/edutwin-web/src/pages/',theme={background:'#172235',panel:'#253952',text:'#FFFFFF',accent:'#E9A56C'};
  const heading=(name,evidenceId)=>({type:'assertVisible',role:'heading',name,evidenceId,evidenceScreenshot:true,timeoutMs:30000});
  // Test-only account. Login repeats in isolated contexts. Password is masked in real UI;
  // no credential-bearing project.json, journals, raw logs or screenshots are exported.
  const login=[{type:'goto',path:'/dang-nhap'},{type:'fill',label:'Mã trung tâm *',value:'EDUTWIN_A'},{type:'fill',label:'Tên đăng nhập *',value:'student01'},{type:'fill',label:'Mật khẩu *',value:password},{type:'click',role:'button',name:'Đăng nhập'},heading('Kế hoạch hôm nay','dashboard-ready')];
  const spec=[
    ['overview','01 / 04 · Tổng quan học tập','EduTwin tập hợp kế hoạch học tập và mục tiêu của học sinh tại màn hình tổng quan.','/hoc-tap/tong-quan','Mục tiêu của bạn','StudentDashboardPage.tsx'],
    ['assignments','02 / 04 · Bài tập','Học sinh có thể mở danh sách bài tập của mình để theo dõi những nhiệm vụ được giao.','/hoc-tap/bai-tap','Bài tập của tôi','StudentAssignmentsPage.tsx'],
    ['twin','03 / 04 · Hồ sơ năng lực','Hồ sơ năng lực cho thấy các chuyên đề và mục tiêu học tập của học sinh.','/hoc-tap/ho-so-nang-luc','Năng lực theo chuyên đề','StudentTwinPage.tsx'],
    ['practice','04 / 04 · Luyện tập thích ứng','Khu vực luyện tập thích ứng cho phép học sinh xem các chế độ luyện tập.','/hoc-tap/luyen-tap','Hoặc chọn chế độ khác','AdaptivePracticeOverviewPage.tsx']
  ];
  const scenes=spec.map(([id,title,narration,url,proof])=>({id,title,durationSec:12,featureIds:[id],narration,
    claims:[{id:id+'-claim',featureId:id,text:narration,evidenceIds:[id+'-ready']}],
    capture:{actions:[...structuredClone(login),...(id==='overview'?[]:[{type:'goto',path:url}]),heading(proof,id+'-ready'),{type:'pause',ms:1500}],evidencePolicy:{requireAssertions:true,failOnPageError:true}},
    edit:{layout:'framed',chapter:title,design:{rationale:'Keep the full authenticated UI and captions in distinct regions',framing:'stable',theme},shots:[{id:'app-view',source:'capture',durationSec:12,camera:'static',purpose:'Show actual authenticated interface'}]}}));
  const proposal={schemaVersion:1,baseConfigHash:ctx.baseConfigHash,sourceFingerprint:ctx.sourceFingerprint,storyRationale:'Orient a first-time learner through actual seeded student screens, without claiming adaptive session or live AI outcomes.',features:spec.map(([id,title,,,,file])=>({id,reason:title,sourceRefs:[sourceRef(app+file),sourceRef('web/edutwin-web/src/App.tsx')]})),scenes:scenes.map((scene,i)=>({scene,role:i===0?'hook':i===scenes.length-1?'conclusion':'workflow',purpose:scene.title,startState:'Fresh context with disposable account',endState:'Verified authenticated screen',fallback:'Return to Build; no fake UI',dependsOn:[],direction:{}}))};
  writeJson(path.join(root,'.avp','planning','agent-storyboard.json'),proposal);
  stage='storyboard';const check=await cli('storyboard','check');assert.equal(check.status,'VALID_DRAFT_NOT_RUNTIME_VERIFIED');assert.equal((await cli('storyboard','apply','--hash',check.proposalHash,'--confirm')).status,'APPLIED_REQUIRES_BUILD');
  await dispatch('skills');await dispatch('prepare');
  for(const s of scenes){stage='rehearsal-'+s.id;await dispatch('rehearse','--allow-actions');}
  for(const s of scenes){stage='local-audio-'+s.id;await speech(s);}
  stage='freeze';assert.equal((await cli('timing','check')).status,'PASS');assert.equal((await cli('build','freeze','--confirm')).status,'READY');
  for(const s of scenes){for(const op of ['capture','voice','captions','preview','qa']){stage=op+'-'+s.id;await dispatch(op,...(op==='capture'?['--allow-actions']:[]));}}
  stage='assembly';assert.equal((await dispatch('render')).next.status,'COMPLETE');
  const benchmark=await cli('benchmark','record','--label','edutwin-full','--kind','full','--scope','external','--confirm');assert.equal(benchmark.reservedCallsDelta,0);
  stage='export';
  // Retain only final video/subtitle and minimal receipt. The source checkout,
  // test account, source code, working configuration and raw evidence remain private.
  for(const name of ['final.mp4','final.srt'])fs.copyFileSync(path.join(root,'.avp','output',name),path.join(out,name));
  const result={status:'TECHNICAL_PASS',scope:'SOURCE_DERIVED_SCRIPTED_REAL_APP_NOT_BLIND',sourceRevision:pin,branch:'ui_update_v4',scenes:scenes.map(s=>({id:s.id,title:s.title})),benchmark,finalHash:fileHash(path.join(out,'final.mp4')),voice:'LOCAL_SYNTHETIC_NOT_LISTENING_VERIFIED',semantic:'NOT_INDEPENDENTLY_EVALUATED',liveAI:'NOT_TESTED',adaptiveSession:'NOT_TESTED'};
  writeJson(path.join(out,'result.json'),result);console.log('AVP_EDUTWIN_RESULT '+JSON.stringify({status:result.status,sourceRevision:pin,scenes:result.scenes,finalDurationSec:benchmark.finalDurationSec,observedMs:benchmark.production.observedMs,paid:benchmark.reservedCallsDelta}));
}catch(e){const result={status:'BLOCKED',stage,sourceRevision:pin,scope:'NO_VIDEO_ACCEPTANCE'};writeJson(path.join(out,'result.json'),result);console.error('AVP_EDUTWIN_BLOCKER '+JSON.stringify(result));process.exitCode=1;}
finally{if(server.listening)await new Promise(r=>server.close(r));}
