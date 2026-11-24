import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {run,readJson,writeJson,sceneDir,avpDir,loadEnv,sha,atomicWrite,fileHash} from './utils.mjs';
import {recordArtifact,inputHashes,sceneState,saveState,requireUnlocked,staleParts,gate,validateSceneQa,sceneApprovalValid,finalInputHash, invalidateOutput} from './state.mjs';
import {captureEvidencePassed} from './capture-assertions.mjs';
import {executeCaptureAction,locator} from './capture-actions.mjs';
import {adapterActions,requireAdapterReady,protectAdapterBrowser} from './adapters.mjs';
import {verificationMode,verifySceneClaims,requireCoveragePlan} from './evidence.mjs';
import {sentenceParts,measureSpeech,alignNarration,validateCaptionRows} from './audio-timing.mjs';
import {loadVoiceEnvironment,synthesizeVoice} from './voice-provider.mjs';
import {timingEnabled,selectedVoice} from './voice-selection.mjs';
import {ExecutionError,failureDetails} from './execution-errors.mjs';
import {withAppRuntime,managedApp} from './app-runtime.mjs';
const seconds=(value)=>Number(value||0);
export function probe(file){return JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));}
export function mediaSeconds(file){return seconds(probe(file).format?.duration);}
export {locator} from './capture-actions.mjs';
export async function capture(root,config,scene,state,opts={}){
  if(managedApp(config)){
    requireUnlocked(state,scene.id);
    if(!opts.force&&!staleParts(scene,config,sceneState(state,scene.id),root).capture)return {reused:true,file:path.join(sceneDir(root,scene.id),'capture.mp4')};
    try{return await withAppRuntime(root,config,opts,session=>captureCore(root,config,scene,state,{...opts,appSession:session}));}
    catch(e){const ss=sceneState(state,scene.id);if(ss.artifacts?.capture){ss.artifacts.capture.inputHash='INVALIDATED';delete ss.qa;ss.approved=false;invalidateOutput(state);saveState(root,state);}throw e;}
  }
  return captureCore(root,config,scene,state,opts);
}
async function captureCore(root,config,scene,state,opts={}){
  let adapterProof;try{adapterProof=requireAdapterReady(root,config,scene);}catch(e){throw new ExecutionError('ADAPTER_OR_POLICY_BLOCKED',e.message);}
  const effectiveActions=adapterActions(root,config,scene);
  const ss=sceneState(state,scene.id);requireUnlocked(state,scene.id);const parts=staleParts(scene,config,ss,root);if(!parts.capture&&!opts.force)return {reused:true,file:path.join(sceneDir(root,scene.id),'capture.mp4')};
  let chromium;try{({chromium}=await import('@playwright/test'));}catch{throw new ExecutionError('TOOL_UNAVAILABLE','Playwright not installed. Run npm install, then npx playwright install chromium.');}
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});const raw=path.join(dir,'raw');fs.mkdirSync(raw,{recursive:true});
  let browser;try{browser=await chromium.launch({headless:true});}catch(e){throw new ExecutionError('TOOL_UNAVAILABLE',e.message);}let ctx;const report={scene:scene.id,actions:[],assertions:[],status:'IN_PROGRESS',startedAt:new Date().toISOString(),
    ...(opts.appSession?{appSession:opts.appSession}:{}),
    adapter:adapterProof?{id:adapterProof.id,manifestHash:adapterProof.manifestHash,receiptHash:adapterProof.receiptHash}:null};
  try{ctx=await browser.newContext({...(adapterProof?{acceptDownloads:false,serviceWorkers:'block',permissions:[]}:{}),viewport:{width:config.render?.width||1920,height:config.render?.height||1080},recordVideo:{dir:raw,size:{width:config.render?.width||1920,height:config.render?.height||1080}}});await protectAdapterBrowser(ctx,config,scene);const page=await ctx.newPage();const pageErrors=[];report.pageErrors=pageErrors;page.on('pageerror',err=>pageErrors.push(err.message.slice(0,500)));const start=Date.now();
    for(const a of effectiveActions){const startAction=Date.now();
      await executeCaptureAction(page,a,{appUrl:config.appUrl,dir,report,adapter:Boolean(adapterProof)});
      report.actions.push({type:a.type,ms:Date.now()-startAction});}
    let remaining=scene.durationSec*1000-(Date.now()-start);if(remaining>0)await page.waitForTimeout(remaining);
    report.finalUrl=page.url();report.pageErrors=pageErrors;report.elapsedMs=Date.now()-start;
    if(scene.capture.evidencePolicy?.requireAssertions&&report.assertions.length===0)throw new ExecutionError('CAPTURE_EVIDENCE_INVALID','Missing required browser assertions');
    if(scene.capture.evidencePolicy?.failOnPageError!==false&&scene.capture.evidencePolicy?.requireAssertions&&pageErrors.length)
      throw new ExecutionError('APP_PAGE_ERROR','Browser emitted '+pageErrors.length+' uncaught page error(s); evidence rejected');
    const video=page.video();await ctx.close();ctx=null;const rawPath=await video.path();
    const output=path.join(dir,'capture.mp4');const tmp=path.join(dir,'capture.new.mp4');run('ffmpeg',['-y','-v','error','-i',rawPath,'-vf',`fps=${config.render?.fps||30},scale=${config.render?.width||1920}:${config.render?.height||1080}:force_original_aspect_ratio=decrease,pad=${config.render?.width||1920}:${config.render?.height||1080}:(ow-iw)/2:(oh-ih)/2`,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-an',tmp]);fs.renameSync(tmp,output);
    const h=inputHashes(scene,config,sceneState(state,scene.id),root);recordArtifact(root,state,scene,'capture',output,h.capture);
    const currentCapture=sceneState(state,scene.id).artifacts.capture;
    report.captureHash=currentCapture.hash;report.captureInputHash=currentCapture.inputHash;
    report.outputDuration=mediaSeconds(output);report.status='PASS';writeJson(path.join(dir,'capture-report.json'),report);return {file:output,report};
   }catch(e){report.status='FAIL';report.failure=failureDetails(e,'capture');report.error=String(e.message).slice(0,750);
    // Keep a local failure screenshot; do not copy private page text or network bodies into reports.
    try{if(ctx){const pages=ctx.pages();if(pages.length){const file=path.join(dir,'capture-failure.png');await pages[0].screenshot({path:file,timeout:6000});report.failureScreenshot='capture-failure.png';}}}catch{}
    writeJson(path.join(dir,'capture-report.json'),report);throw e;}finally{if(ctx)await ctx.close();await browser.close();}
}
export async function voice(root,config,scene,state,opts={}){
  if(config.voiceover?.enabled===false)return {skipped:'disabled'};
  requireUnlocked(state,scene.id);
  loadVoiceEnvironment(root);
  const ss=sceneState(state,scene.id),h=inputHashes(scene,config,ss,root);
  if(!staleParts(scene,config,ss,root).voice&&!opts.force)return {reused:true};
  const out=path.join(sceneDir(root,scene.id),'voice.wav');
  if(timingEnabled(config)){
    let chosen;try{chosen=selectedVoice(root,config,scene);}catch(e){throw new ExecutionError('AUDIO_SELECTION_INVALID',e.message);}
    if(!chosen)throw new ExecutionError('AUDIO_SELECTION_INVALID','Selected Build narration is missing; run timing select before Production');
    atomicWrite(out,fs.readFileSync(chosen.audio));
    recordArtifact(root,state,scene,'voice',out,h.voice);
    writeJson(path.join(sceneDir(root,scene.id),'voice-report.json'),{provider:chosen.receipt.origin,
      durationSec:chosen.receipt.durationSec,contentHash:sha(scene.narration),selectionHash:chosen.selectionHash,
      generatedAt:new Date().toISOString(),humanListeningApproved:true});
    return {file:out,durationSec:chosen.receipt.durationSec,reusedSelectedAudio:true};
  }
  const generated=await synthesizeVoice(root,config,scene,state,opts);
  atomicWrite(out,generated.wav);recordArtifact(root,state,scene,'voice',out,h.voice);
  writeJson(path.join(sceneDir(root,scene.id),'voice-report.json'),{provider:'gemini',model:generated.request.model,voice:generated.request.voice,language:generated.request.language,durationSec:mediaSeconds(out),contentHash:sha(scene.narration),generatedAt:new Date().toISOString(),humanListeningApproved:false});
  return {file:out,durationSec:mediaSeconds(out),budgetReservation:generated.budgetReservation};
}
const stamp=t=>{let ms=Math.round(t*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+','+String(ms%1000).padStart(3,'0');};
export function captions(root,config,scene,state,opts={}){
  requireUnlocked(state,scene.id);
  const ss=sceneState(state,scene.id),parts=staleParts(scene,config,ss,root);
  if(!parts.captions&&!opts.force)return {reused:true};
  const haveVoice=config.voiceover?.enabled!==false;
  if(haveVoice&&parts.voice)throw Error('Current voice is missing/stale; generate or attach approved voice before captions');
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});
  const voiceFile=path.join(dir,'voice.wav'),duration=haveVoice?mediaSeconds(voiceFile):scene.durationSec;
  const requested=scene.captionTiming?.mode||(haveVoice?'audio-pauses':'proportional');
  const analysis=haveVoice&&sentenceParts(scene.narration).length?measureSpeech(voiceFile,duration):null;
  const aligned=alignNarration(scene.narration,duration,{
    mode:requested,maxChars:scene.captionTiming?.maxChars||80,
    anchors:scene.captionTiming?.anchors,measured:analysis
  });
  const srt=aligned.rows.map((row,i)=>
    String(i+1)+'\n'+stamp(row.startMs/1000)+' --> '+stamp(row.endMs/1000)+'\n'+row.text+'\n').join('\n');
  const out=path.join(dir,'captions.srt'),metadata=path.join(dir,'captions.json');
  atomicWrite(out,srt);
  writeJson(metadata,{
    schemaVersion:2,timingMethod:aligned.timingMethod,
    timingIsForcedAlignment:false,reviewRequired:aligned.reviewRequired,
    language:config.language?.subtitles?.[0]||config.language?.narration,
    audioDurationSec:haveVoice?duration:null,
    voiceHash:haveVoice?fileHash(voiceFile):null,
    analysis:aligned.analysis,rows:aligned.rows
  });
  recordArtifact(root,state,scene,'captions',out,inputHashes(scene,config,sceneState(state,scene.id),root).captions);
  sceneState(state,scene.id).artifacts.captions.metadataHash=fileHash(metadata);
  saveState(root,state);
  return {file:out,count:aligned.rows.length,timingMethod:aligned.timingMethod,reviewRequired:aligned.reviewRequired,estimated:true};
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
  const captionFile=path.join(dir,'captions.json');
  const captionInfo=fs.existsSync(captionFile)?readJson(captionFile):null;
  let captionsValid=false;
  try{
    const maxChars=scene.captionTiming?.maxChars||80;
    const bounded=config.voiceover?.enabled!==false&&fs.existsSync(path.join(dir,'voice.wav'))
      ?mediaSeconds(path.join(dir,'voice.wav')):scene.durationSec;
    captionsValid=Boolean(captionInfo)&&validateCaptionRows(captionInfo.rows,bounded,maxChars)
      &&(captionInfo.rows?.length>0||!scene.narration.trim());
    if(captionsValid&&config.voiceover?.enabled!==false)
      captionsValid=captionInfo.voiceHash===fileHash(path.join(dir,'voice.wav'));
  }catch{captionsValid=false;}
  const checks={captionTimeline:captionsValid,videoH264:v?.codec_name==='h264',width:v?.width===(config.render?.width||1920),height:v?.height===(config.render?.height||1080),audioAAC:a?.codec_name==='aac',duration:Math.abs(mediaSeconds(file)-target)<.3,captionsExist:fs.existsSync(path.join(dir,'captions.srt')),fullDecode:decode!==null};
  const evidenceRequired=scene.capture.evidencePolicy?.requireAssertions===true;
  const captureReportFile=path.join(dir,'capture-report.json');
  const captureReport=evidenceRequired&&fs.existsSync(captureReportFile)?readJson(captureReportFile):null;
  if(evidenceRequired)checks.captureAssertions=captureEvidencePassed(captureReport,scene.capture.evidencePolicy);
  let claimEvidence=null,claimEvidenceError=null;
  if(verificationMode(config)==='claims'&&(scene.featureIds||[]).length){
    try{claimEvidence=verifySceneClaims(root,config,scene,state);checks.claimEvidence=claimEvidence.pass===true;}
    catch(e){checks.claimEvidence=false;claimEvidenceError=e.message;}
  }
  const report={scene:scene.id,checks,...(claimEvidence?{claimEvidence}:{}),...(claimEvidenceError?{claimEvidenceError}:{}),pass:Object.values(checks).every(Boolean),durationSec:mediaSeconds(file),captionTiming:captionInfo?.timingMethod||'MISSING',captionReviewRequired:captionInfo?.reviewRequired??true,visualReviewByHuman:false,previewHash:fileHash(file),previewInputHash:inputHashes(scene,config,ss,root).preview,...(evidenceRequired?{captureReportHash:captureReport?fileHash(captureReportFile):null}: {})};
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
  if(!report.pass)throw new ExecutionError('FINAL_QA_FAILED','Final render failed technical QA',{failedChecks:Object.keys(checks).filter(k=>!checks[k])});
  const qa=path.join(avpDir(root),'output','final-qa.json');writeJson(qa,report);
  invalidateOutput(state);
  state.output={file,createdAt:new Date().toISOString(),hash:report.outputHash,qaHash:fileHash(qa),inputHash:finalInputHash(config,state)};
  saveState(root,state);return report;
}
export function render(root,config,state,opts={}){
  requireCoveragePlan(root,config);
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
