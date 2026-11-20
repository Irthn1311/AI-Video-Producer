import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {run,readJson,writeJson,sceneDir,avpDir,loadEnv,sha,atomicWrite,fileHash} from './utils.mjs';
import {recordArtifact,inputHashes,sceneState,saveState,requireUnlocked,staleParts,gate,validateSceneQa,sceneApprovalValid,finalInputHash, invalidateOutput,reservePaidCall} from './state.mjs';
import {executeCaptureAssertion,captureEvidencePassed} from './capture-assertions.mjs';
const seconds=(value)=>Number(value||0);
export function probe(file){return JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));}
export function mediaSeconds(file){return seconds(probe(file).format?.duration);}
export function locator(page,action){if(action.testId)return page.getByTestId(action.testId);if(action.role)return page.getByRole(action.role,action.name?{name:action.name,exact:true}:{});if(action.label)return page.getByLabel(action.label,{exact:true});if(action.text)return page.getByText(action.text,{exact:true});throw Error('Action requires testId, role, label, or text (avoid brittle CSS selectors)');}
export async function capture(root,config,scene,state,opts={}){
  const ss=sceneState(state,scene.id);requireUnlocked(state,scene.id);const parts=staleParts(scene,config,ss,root);if(!parts.capture&&!opts.force)return {reused:true,file:path.join(sceneDir(root,scene.id),'capture.mp4')};
  let chromium;try{({chromium}=await import('@playwright/test'));}catch{throw Error('Playwright not installed. Run npm install, then npx playwright install chromium.');}
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});const raw=path.join(dir,'raw');fs.mkdirSync(raw,{recursive:true});
  const browser=await chromium.launch({headless:true});let ctx;const report={scene:scene.id,actions:[],assertions:[],status:'IN_PROGRESS',startedAt:new Date().toISOString()};
  try{ctx=await browser.newContext({viewport:{width:config.render?.width||1920,height:config.render?.height||1080},recordVideo:{dir:raw,size:{width:config.render?.width||1920,height:config.render?.height||1080}}});const page=await ctx.newPage();const pageErrors=[];report.pageErrors=pageErrors;page.on('pageerror',err=>pageErrors.push(err.message.slice(0,500)));const start=Date.now();
    for(const a of scene.capture.actions){const startAction=Date.now();switch(a.type){
      case 'goto': {const url=new URL(a.path||'/',config.appUrl);const allowed=new URL(config.appUrl);if(url.origin!==allowed.origin)throw Error('Cross-origin navigation blocked for capture');await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});break;}
      case 'click':await locator(page,a).click({timeout:30000});break;
      case 'fill':await locator(page,a).fill(a.value??'');break;
      case 'hover':await locator(page,a).hover({timeout:30000});break;
      case 'waitFor':await locator(page,a).waitFor({state:'visible',timeout:a.timeoutMs||30000});break;
      case 'pause':await page.waitForTimeout(Math.max(0,Math.min(a.ms||500,15000)));break;
      case 'scroll':await page.mouse.wheel(0,a.y||500);break;
      case 'screenshot':await page.screenshot({path:path.join(dir,`${scene.id}-${report.actions.length}.png`)});break;
      case 'assertVisible':
      case 'assertText':
      case 'assertAttribute':
      case 'clickExpectResponse': {
        const evidence=await executeCaptureAssertion(page,a,locator,config.appUrl);
        report.assertions.push(evidence);
        if(a.evidenceScreenshot===true){
          const name='evidence-'+report.assertions.length+'.png';
          await page.screenshot({path:path.join(dir,name)});
          evidence.screenshot=name;
        }
        break;
      }
      default:throw Error('Unsupported capture action: '+a.type);
    }report.actions.push({type:a.type,ms:Date.now()-startAction});}
    let remaining=scene.durationSec*1000-(Date.now()-start);if(remaining>0)await page.waitForTimeout(remaining);
    report.finalUrl=page.url();report.pageErrors=pageErrors;report.elapsedMs=Date.now()-start;
    if(scene.capture.evidencePolicy?.requireAssertions&&report.assertions.length===0)throw Error('Missing required browser assertions');
    if(scene.capture.evidencePolicy?.failOnPageError!==false&&scene.capture.evidencePolicy?.requireAssertions&&pageErrors.length)
      throw Error('Browser emitted '+pageErrors.length+' uncaught page error(s); evidence rejected');
    const video=page.video();await ctx.close();ctx=null;const rawPath=await video.path();
    const output=path.join(dir,'capture.mp4');const tmp=path.join(dir,'capture.new.mp4');run('ffmpeg',['-y','-v','error','-i',rawPath,'-vf',`fps=${config.render?.fps||30},scale=${config.render?.width||1920}:${config.render?.height||1080}:force_original_aspect_ratio=decrease,pad=${config.render?.width||1920}:${config.render?.height||1080}:(ow-iw)/2:(oh-ih)/2`,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-an',tmp]);fs.renameSync(tmp,output);
    const h=inputHashes(scene,config,sceneState(state,scene.id),root);recordArtifact(root,state,scene,'capture',output,h.capture);report.outputDuration=mediaSeconds(output);report.status='PASS';writeJson(path.join(dir,'capture-report.json'),report);return {file:output,report};
   }catch(e){report.status='FAIL';report.error=String(e.message).slice(0,750);
    // Keep a local failure screenshot; do not copy private page text or network bodies into reports.
    try{if(ctx){const pages=ctx.pages();if(pages.length){const file=path.join(dir,'capture-failure.png');await pages[0].screenshot({path:file,timeout:6000});report.failureScreenshot='capture-failure.png';}}}catch{}
    writeJson(path.join(dir,'capture-report.json'),report);throw e;}finally{if(ctx)await ctx.close();await browser.close();}
}
function wavFromPcm(pcm,sampleRate=24000){const b=Buffer.alloc(44);b.write('RIFF',0);b.writeUInt32LE(pcm.length+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);return Buffer.concat([b,pcm]);}
export async function voice(root,config,scene,state,opts={}){
  if(config.voiceover?.enabled===false)return {skipped:'disabled'};
  if(config.voiceover?.provider!=='gemini')throw Error('v0.1 includes Gemini TTS adapter only; other providers are extension points.');
  requireUnlocked(state,scene.id);let ss=sceneState(state,scene.id),h=inputHashes(scene,config,sceneState(state,scene.id),root);if(!staleParts(scene,config,ss,root).voice&&!opts.force)return {reused:true};
  if(!opts.allowPaidApi)throw Error('Voice generation may incur cost. Add --allow-paid-api after verifying provider pricing and script.');
  loadEnv(path.resolve(import.meta.dirname,'..'));loadEnv(root);const key=process.env.GEMINI_API_KEY;if(!key)throw Error('GEMINI_API_KEY missing; copy .env.example to .env and set key locally.');
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});const model=process.env.GEMINI_TTS_MODEL||config.voiceover.model||'gemini-2.5-flash-preview-tts';
  let v=config.voiceover.voice||'Charon';const lang=config.language?.narration||'en-US';const text=`Speak in ${lang}. ${config.voiceover.style||'Clear and conversational'}. Read only the following: ${scene.narration}`;
  const body={contents:[{parts:[{text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:v}}}}};
  const budgetReservation=reservePaidCall(root,state,config,opts.budgetSession,config.voiceover?.estimatedUsdPerCall);
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(!response.ok())throw Error(`Gemini TTS returned HTTP ${response.status} (response contents withheld)`);
  const json=await response.json();const part=json.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data);if(!part)throw Error('TTS response contains no audio');const mime=part.inlineData.mimeType||'';
  if(!/audio\/(L16|pcm)/i.test(mime))throw Error(`Unsupported raw TTS audio mime type: ${mime}`);
  const rate=Number(mime.match(/rate=(\d+)/i)?.[1]||24000);const pcm=Buffer.from(part.inlineData.data,'base64');if(pcm.length<100||pcm.length%2)throw Error('Invalid PCM audio response');
  const out=path.join(dir,'voice.wav');atomicWrite(out,wavFromPcm(pcm,rate));recordArtifact(root,state,scene,'voice',out,h.voice);
  writeJson(path.join(dir,'voice-report.json'),{provider:'gemini',model,voice:v,language:lang,durationSec:mediaSeconds(out),contentHash:sha(scene.narration),generatedAt:new Date().toISOString(),humanListeningApproved:false});
  return {file:out,durationSec:mediaSeconds(out),budgetReservation};
}
const stamp=t=>{let ms=Math.round(t*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
function splitSentences(text){return text.match(/[^.!?\n]+(?:[.!?]+|$)/gu)?.map(x=>x.trim()).filter(Boolean)||[];}
export function captions(root,config,scene,state,opts={}){
  requireUnlocked(state,scene.id);const ss=sceneState(state,scene.id);const h=inputHashes(scene,config,sceneState(state,scene.id),root);if(!staleParts(scene,config,ss,root).captions&&!opts.force)return {reused:true};
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});const audio=path.join(dir,'voice.wav');const duration=fs.existsSync(audio)&&config.voiceover?.enabled!==false?mediaSeconds(audio):scene.durationSec;
  const sentences=splitSentences(scene.narration);const weight=sentences.reduce((a,s)=>a+s.length,0)||1;let cursor=0;const rows=sentences.map(s=>{let start=cursor;cursor+=duration*s.length/weight;return {startMs:Math.round(start*1000),endMs:Math.round(cursor*1000),text:s};});
  const srt=rows.map((r,i)=>`${i+1}\n${stamp(r.startMs/1000)} --> ${stamp(r.endMs/1000)}\n${r.text}\n`).join('\n');const out=path.join(dir,'captions.srt');atomicWrite(out,srt);writeJson(path.join(dir,'captions.json'),{timingMethod:'ESTIMATED proportional text length (not forced alignment)',language:config.language?.subtitles?.[0]||config.language?.narration,rows});recordArtifact(root,state,scene,'captions',out,h.captions);return {file:out,count:rows.length,estimated:true};
}
export async function preview(root,config,scene,state,opts={}){
  requireUnlocked(state,scene.id);const ss=sceneState(state,scene.id),parts=staleParts(scene,config,ss,root);if(!parts.preview&&!opts.force)return {reused:true};
  if(parts.capture)throw Error(`Capture missing/stale for ${scene.id}`);if(config.voiceover?.enabled!==false&&parts.voice)throw Error(`Voice missing/stale for ${scene.id}`);if(parts.captions)throw Error(`Captions missing/stale for ${scene.id}`);
  if(scene.edit){
    // Only the reviewed preview can contain editorial changes. Final render concatenates these approved previews.
    const {renderEditedPreview}=await import('./remotion-preview.mjs');
    const result=await renderEditedPreview(root,config,scene);
    recordArtifact(root,state,scene,'preview',result.file,inputHashes(scene,config,sceneState(state,scene.id),root).preview);
    return result;
  }
  const dir=sceneDir(root,scene.id),clip=path.join(dir,'capture.mp4'),audio=path.join(dir,'voice.wav');const haveVoice=config.voiceover?.enabled!==false;
  const duration=Math.max(scene.durationSec,haveVoice?mediaSeconds(audio)+.5:0);let filters=[`fps=${config.render?.fps||30}`,`scale=${config.render?.width||1920}:${config.render?.height||1080}:force_original_aspect_ratio=decrease`,`pad=${config.render?.width||1920}:${config.render?.height||1080}:(ow-iw)/2:(oh-ih)/2`,`tpad=stop_mode=clone:stop_duration=${Math.ceil(duration+1)}`,`trim=duration=${duration}`,`setpts=PTS-STARTPTS`];
  if(config.render?.captionsBurned!==false&&scene.narration.trim())filters.push("subtitles=captions.srt:force_style='Fontsize=22,Outline=2,Alignment=2,MarginV=36'");
  const args=['-y','-v','error','-i','capture.mp4'];if(haveVoice)args.push('-i','voice.wav');else args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
  const out='preview.new.mp4';args.push('-vf',filters.join(','),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-af','apad','-t',String(duration),'-movflags','+faststart',out);
  run('ffmpeg',args,{cwd:dir});fs.renameSync(path.join(dir,out),path.join(dir,'preview.mp4'));recordArtifact(root,state,scene,'preview',path.join(dir,'preview.mp4'),inputHashes(scene,config,sceneState(state,scene.id),root).preview);return {file:path.join(dir,'preview.mp4'),duration};
}
export function qaScene(root,config,scene,state){
  const ss=sceneState(state,scene.id),dir=sceneDir(root,scene.id),file=path.join(dir,'preview.mp4');
  if(!Object.values(staleParts(scene,config,ss,root)).every(v=>v===false))throw Error(`Scene ${scene.id} has stale inputs; rebuild before QA`);
  if(ss.qa){
    try{return validateSceneQa(root,config,scene,state);}catch(e){if(ss.locked)throw Error(`Scene ${scene.id} is locked with invalid QA. Unlock before regeneration: ${e.message}`);}
  }
  if(ss.locked)throw Error(`Cannot regenerate QA of locked scene ${scene.id} without explicit unlock`);
  const p=probe(file),v=p.streams.find(x=>x.codec_type==='video'),a=p.streams.find(x=>x.codec_type==='audio');
  const target=Math.max(scene.durationSec,config.voiceover?.enabled!==false&&fs.existsSync(path.join(dir,'voice.wav'))?mediaSeconds(path.join(dir,'voice.wav'))+.5:0);
  const decode=run('ffmpeg',['-v','error','-i',file,'-f','null','-']);
  const checks={videoH264:v?.codec_name==='h264',width:v?.width===(config.render?.width||1920),height:v?.height===(config.render?.height||1080),audioAAC:a?.codec_name==='aac',duration:Math.abs(mediaSeconds(file)-target)<.3,captionsExist:fs.existsSync(path.join(dir,'captions.srt')),fullDecode:decode!==null};
  const evidenceRequired=scene.capture.evidencePolicy?.requireAssertions===true;
  const captureReportFile=path.join(dir,'capture-report.json');
  const captureReport=evidenceRequired&&fs.existsSync(captureReportFile)?readJson(captureReportFile):null;
  if(evidenceRequired)checks.captureAssertions=captureEvidencePassed(captureReport,scene.capture.evidencePolicy);
  const report={scene:scene.id,checks,pass:Object.values(checks).every(Boolean),durationSec:mediaSeconds(file),captionTiming:'Estimated unless externally aligned',visualReviewByHuman:false,previewHash:fileHash(file),previewInputHash:inputHashes(scene,config,ss,root).preview,...(evidenceRequired?{captureReportHash:captureReport?fileHash(captureReportFile):null}: {})};
  const reportFile=path.join(dir,'qa-report.json');writeJson(reportFile,report);ss.qa={reportHash:fileHash(reportFile),previewHash:report.previewHash,previewInputHash:report.previewInputHash};ss.approved=false;
  invalidateOutput(state);saveState(root,state);return report;
}
function finalReport(root,config,state,engine,file){
  const p=probe(file),v=p.streams.find(x=>x.codec_type==='video'),a=p.streams.find(x=>x.codec_type==='audio');
  const sourceDurations=config.scenes.map(s=>mediaSeconds(path.join(sceneDir(root,s.id),'preview.mp4')));
  const target=sourceDurations.reduce((a,b)=>a+b,0),actual=mediaSeconds(file);
  run('ffmpeg',['-v','error','-i',file,'-f','null','-']);
  const checks={videoH264:v?.codec_name==='h264',audioAAC:a?.codec_name==='aac',width:v?.width===(config.render?.width||1920),height:v?.height===(config.render?.height||1080),duration:Math.abs(actual-target)<1,fullDecode:true};
  const report={schemaVersion:2,engine,file,durationSec:actual,scenes:config.scenes.length,checks,pass:Object.values(checks).every(Boolean),outputHash:fileHash(file),humanFinalApproval:false};
  if(!report.pass)throw Error('Final render failed technical QA');
  const qa=path.join(avpDir(root),'output','final-qa.json');writeJson(qa,report);
  invalidateOutput(state);
  state.output={file,createdAt:new Date().toISOString(),hash:report.outputHash,qaHash:fileHash(qa),inputHash:finalInputHash(config,state)};
  saveState(root,state);return report;
}
export function render(root,config,state,opts={}){
  gate(state,config,'coverage',root);gate(state,config,'storyboard',root);
  const outDir=path.join(avpDir(root),'output');fs.mkdirSync(outDir,{recursive:true});
  const previews=[];
  for(const s of config.scenes){
    validateSceneQa(root,config,s,state); // Required in BOTH review and autonomous modes.
    if(config.review.mode==='review')sceneApprovalValid(root,config,s,state);
    previews.push(path.join(sceneDir(root,s.id),'preview.mp4'));
  }
  if(config.render?.engine==='remotion')return renderRemotion(root,config,state,opts);
  const list=path.join(outDir,'concat.txt');fs.writeFileSync(list,previews.map(f=>`file '${f.replaceAll("'", "'\\''")}'`).join('\n')+'\n');
  const out=path.join(outDir,'final.mp4'),tmp=path.join(outDir,'final.new.mp4');
  run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',tmp]);fs.renameSync(tmp,out);
  return finalReport(root,config,state,'ffmpeg',out);
}
async function renderRemotion(root,config,state,opts){
  let bundle,selectComposition,renderMedia;
  try{({bundle}=await import('@remotion/bundler'));({selectComposition,renderMedia}=await import('@remotion/renderer'));}catch{throw Error('Remotion dependencies unavailable; npm install, or set render.engine to ffmpeg');}
  const work=path.join(avpDir(root),'remotion'),publicDir=path.join(work,'public');fs.mkdirSync(publicDir,{recursive:true});
  const timeline=[];const fps=config.render?.fps||30;let fromFrame=0;
  for(const s of config.scenes){const d=sceneDir(root,s.id),source=path.join(d,'preview.mp4');fs.copyFileSync(source,path.join(publicDir,`${s.id}.mp4`));const frameCount=Math.max(1,Math.round(mediaSeconds(source)*fps));timeline.push({id:s.id,from:fromFrame/fps,duration:frameCount/fps,file:`${s.id}.mp4`});fromFrame+=frameCount;}
  const total=fromFrame/fps;
  writeJson(path.join(publicDir,'timeline.json'),{scenes:timeline,total,fps,width:config.render?.width||1920,height:config.render?.height||1080});
  // Keep the entrypoint under the AVP package root so React/Remotion resolve even when projects live elsewhere.
  const source=path.resolve(import.meta.dirname,'../remotion/src/index.tsx');
  const serveUrl=await bundle({entryPoint:source,publicDir});const inputProps={timeline:{scenes:timeline,total,fps,width:config.render?.width||1920,height:config.render?.height||1080}};
  const composition=await selectComposition({serveUrl,id:'AVPVideo',inputProps});const out=path.join(avpDir(root),'output','final.mp4');
  await renderMedia({serveUrl,composition,inputProps,codec:'h264',audioCodec:'aac',outputLocation:out,crf:20,concurrency:2});
  return finalReport(root,config,state,'remotion',out);
}
