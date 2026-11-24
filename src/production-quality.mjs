import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {run,readJson,writeJson,fileHash,sha,sceneDir,avpDir,atomicWrite} from './utils.mjs';
import {qualityPolicy,captionReadability} from './quality-policy.mjs';
import {ExecutionError} from './execution-errors.mjs';

const duration=file=>Number(JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file])).format.duration);
const fail=message=>new ExecutionError('MEDIA_TOOL_FAILED',message);
const masterPaths=dir=>({file:path.join(dir,'voice-master.wav'),receipt:path.join(dir,'voice-master.json')});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*1000)/1000;
// FFmpeg EBU R128 measurement. The filter output is discarded, never substituted for source speech.
export function measureLoudness(file,{stereo=false}={}){
  const filter=(stereo?'aformat=channel_layouts=stereo,':'')+'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json';
  const p=spawnSync('ffmpeg',['-nostdin','-hide_banner','-v','info','-i',file,'-vn','-af',filter,'-f','null','-'],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:180000});
  if(p.error||p.status!==0)throw fail('Unable to measure audio loudness');
  const blocks=p.stderr.match(/\{\s*"input_i"[\s\S]*?\}/g)||[];
  let x;try{x=JSON.parse(blocks.at(-1));}catch{throw fail('Audio loudness measurement missing');}
  const integratedLufs=Number(x.input_i),truePeakDb=Number(x.input_tp);
  return {integratedLufs:finite(integratedLufs)?integratedLufs:null,truePeakDb:finite(truePeakDb)?truePeakDb:null,
    loudnessRange:finite(Number(x.input_lra))?Number(x.input_lra):null};
}
// Gain-only mastering: no time stretching, trimming, synthetic silence or replacement of selected voice.
export function masterVoice(root,config,scene){
  const p=qualityPolicy(config),dir=sceneDir(root,scene.id),source=path.join(dir,'voice.wav');
  if(!p||config.voiceover?.enabled===false)return source;
  const m=masterPaths(dir),inputHash=sha({schemaVersion:1,sourceHash:fileHash(source),targetLufs:p.targetLufs,maxTruePeakDb:p.maxTruePeakDb});
  try{const old=readJson(m.receipt);if(old.inputHash===inputHash&&old.outputHash===fileHash(m.file)&&old.pass===true)return m.file;}catch{}
  const input=measureLoudness(source,{stereo:true}),sourceSec=duration(source);
  if(!finite(input.integratedLufs)||!finite(input.truePeakDb))throw fail('Voice is silent or loudness cannot be measured');
  const gain=Math.min(p.targetLufs-input.integratedLufs,p.maxTruePeakDb-input.truePeakDb-.25,18);
  if(!finite(gain)||gain < -40)throw fail('Voice gain exceeds mastering range; review source');
  const tmp=path.join(dir,'voice-master.new.wav');
  try{
    run('ffmpeg',['-y','-nostdin','-v','error','-i',source,'-vn','-af','aformat=channel_layouts=stereo,volume='+gain.toFixed(4)+'dB','-ar','48000','-ac','2','-c:a','pcm_s16le',tmp],{timeout:180000});
    const output=measureLoudness(tmp),outputSec=duration(tmp);
    const pass=finite(output.integratedLufs)&&finite(output.truePeakDb)&&Math.abs(output.integratedLufs-p.targetLufs)<=2&&output.truePeakDb<=p.maxTruePeakDb+.1&&Math.abs(sourceSec-outputSec)<=.05;
    if(!pass)throw fail('Voice mastering cannot meet loudness/peak/duration limits without changing speech; review voice');
    fs.renameSync(tmp,m.file);
    writeJson(m.receipt,{schemaVersion:1,inputHash,sourceHash:fileHash(source),outputHash:fileHash(m.file),input,output,gainDb:round(gain),sourceSec,outputSec,pass:true,scope:'GAIN_ONLY_NO_TRANSCRIPT_OR_LISTENING_VERIFICATION'});
    return m.file;
  }finally{fs.rmSync(tmp,{force:true});}
}
export function markerTimeline(report,expectedActions){
  const a=report?.actions;
  if(!Array.isArray(a)||a.length!==expectedActions.length)return {pass:false,reason:'ACTION_COUNT'};
  let last=0;const evidence=[],pauses=[];
  for(let i=0;i<a.length;i++){
    const m=a[i],expected=expectedActions[i];
    if(m.index!==i||m.type!==expected.type||!finite(m.startMs)||!finite(m.endMs)||m.startMs<last||m.endMs<m.startMs)
      return {pass:false,reason:'MARKER_ORDER'};
    last=m.endMs;
    if(expected.type==='pause'&&!expected.evidenceId&&m.endMs-m.startMs>=600)pauses.push({startSec:m.startMs/1000+.15,endSec:m.endMs/1000-.15});
    if(expected.evidenceId){
      if(m.evidenceId!==expected.evidenceId)return {pass:false,reason:'EVIDENCE_ID'};
      evidence.push({id:m.evidenceId,endMs:m.endMs});
    }
  }
  return {pass:true,actionEndSec:last/1000,evidence,pauses,scope:'MONOTONIC_BROWSER_CLOCK_APPROXIMATE_VIDEO_TIME'};
}
// Conservative temporal guard: continuous capture playback from time zero through all actions.
// No claim that this proves pixels, cropping, visibility or semantic truth.
export function evidenceTimeline(scene,markers,plan,previewSec,captureSec,fps){
  if(!(scene.featureIds||[]).length)return {pass:true,scope:'NO_DECLARED_FEATURES'};
  if(!markers.pass||!markers.evidence.length)return {pass:false,reason:'MISSING_ACTION_EVIDENCE_MARKERS'};
  const need=markers.actionEndSec+.2;
  let covered=0;
  if(!plan)covered=Math.min(previewSec,captureSec);
  else{
    for(const shot of plan.shots||[]){
      if(shot.file!=='footage/capture.mp4'||shot.transitionInFrames>0)break;
      const start=shot.trimBefore/fps,rate=shot.playbackRate,end=start+shot.playFrames*rate/fps;
      if(Math.abs(start-covered)>1/fps+.001)break;
      // Only explicit declared pause interiors may be accelerated. Never infer a network wait is idle.
      if(rate!==1&&!(rate>1&&rate<=4&&markers.pauses?.some(p=>start>=p.startSec&&end<=p.endSec)))break;
      covered=end;
      if(covered>=need)break;
    }
  }
  return {pass:covered+1/fps>=need,requiredCaptureSec:round(need),continuousCaptureSec:round(covered),
    scope:'CONSERVATIVE_APPROXIMATE_TEMPORAL_COVERAGE_NOT_VISIBLE_EVIDENCE'};
}
export function sealQualityRender(root,config,scene,file){
  const p=qualityPolicy(config);if(!p)return;
  const dir=sceneDir(root,scene.id),m=masterPaths(dir);
  const captureReport=path.join(dir,'capture-report.json'),editPlan=path.join(dir,'edit-plan.json');
  writeJson(path.join(dir,'quality-render.json'),{schemaVersion:1,policyHash:sha(p),previewHash:fileHash(file),
    captureReportHash:fileHash(captureReport),editPlanHash:scene.edit?fileHash(editPlan):null,
    masterHash:config.voiceover?.enabled!==false?fileHash(m.file):null,
    masterReceiptHash:config.voiceover?.enabled!==false?fileHash(m.receipt):null});
}
function currentRender(root,config,scene,previewHash){
  const dir=sceneDir(root,scene.id),p=qualityPolicy(config),renderFile=path.join(dir,'quality-render.json');
  const receipt=readJson(renderFile),m=masterPaths(dir);
  if(receipt.schemaVersion!==1||receipt.policyHash!==sha(p)||receipt.previewHash!==previewHash||
    receipt.captureReportHash!==fileHash(path.join(dir,'capture-report.json'))||
    receipt.editPlanHash!==(scene.edit?fileHash(path.join(dir,'edit-plan.json')):null))throw Error('Quality render receipt stale');
  if(config.voiceover?.enabled!==false){
    const master=readJson(m.receipt),voiceHash=fileHash(path.join(dir,'voice.wav'));
    if(receipt.masterHash!==fileHash(m.file)||receipt.masterReceiptHash!==fileHash(m.receipt)||
      master.sourceHash!==voiceHash||master.outputHash!==receipt.masterHash||master.pass!==true)
      throw Error('Mastered voice receipt stale');
  }
  return {receipt,renderHash:fileHash(renderFile)};
}
export function qualityScene(root,config,scene,{previewSec,captionInfo,captureReport,effectiveActions}){
  const p=qualityPolicy(config),dir=sceneDir(root,scene.id),file=path.join(dir,'preview.mp4'),capture=path.join(dir,'capture.mp4');
  const previewHash=fileHash(file),render=currentRender(root,config,scene,previewHash),fps=config.render?.fps||30;
  const markers=markerTimeline(captureReport,effectiveActions);
  const plan=scene.edit?readJson(path.join(dir,'edit-plan.json')):null;
  const timeline=evidenceTimeline(scene,markers,plan,previewSec,duration(capture),fps);
  const captions=captionReadability(captionInfo?.rows||[],scene.narration,p);
  const audio=config.voiceover?.enabled!==false?measureLoudness(file):null;
  const audioPass=!audio||(finite(audio.integratedLufs)&&finite(audio.truePeakDb)&&audio.truePeakDb<=0&&Math.abs(audio.integratedLufs-p.targetLufs)<=4);
  // Review candidates only. Approximate marker-derived times are useful for manual review, not semantic evidence.
  const times=[.1,previewSec/2,Math.max(0,previewSec-.15)];
  if(!plan)for(const m of markers.evidence||[])times.push(m.endMs/1000+.1);
  if(plan)for(const s of plan.shots||[])times.push((s.fromFrame+Math.min(s.playFrames/2,s.durationFrames/2))/fps);
  const samples=[...new Set(times.map(t=>Math.round(Math.max(0,Math.min(previewSec-.1,t))*1000)))].sort((a,b)=>a-b).slice(0,8);
  const frameDir=path.join(dir,'quality-frames');fs.mkdirSync(frameDir,{recursive:true});
  const frames=[];
  for(const [i,ms] of samples.entries()){
    const name='frame-'+String(i+1).padStart(2,'0')+'.jpg',dest=path.join(frameDir,name);
    run('ffmpeg',['-y','-nostdin','-v','error','-ss',String(ms/1000),'-i',file,'-frames:v','1','-vf','scale=960:-2:force_original_aspect_ratio=decrease','-q:v','3',dest],{timeout:30000});
    frames.push({file:name,timeMs:ms,hash:fileHash(dest)});
  }
  return {schemaVersion:1,previewHash,renderHash:render.renderHash,markers,timeline,captions,audio,frames,
    checks:{actionMarkers:markers.pass,evidenceTimeline:timeline.pass,captionReadability:captions.pass,audioQuality:audioPass,reviewFrames:frames.length>0},
    semanticStatus:'NOT_EVALUATED',reviewScope:'FRAME_CANDIDATES_AND_TECHNICAL_CHECKS_ONLY'};
}
export function validateQualityScene(root,config,scene,qa){
  if(!qualityPolicy(config))return;
  const q=qa.quality,dir=sceneDir(root,scene.id);
  if(!q||q.schemaVersion!==1||q.previewHash!==qa.previewHash||!q.checks||!Object.values(q.checks).every(Boolean)||
    !Array.isArray(q.frames)||!q.frames.length||q.frames.length>8)throw Error('Quality QA missing or failed');
  if(currentRender(root,config,scene,qa.previewHash).renderHash!==q.renderHash)throw Error('Quality render changed');
  for(const f of q.frames)if(!/^frame-0[1-8]\.jpg$/.test(f.file)||fileHash(path.join(dir,'quality-frames',f.file))!==f.hash)throw Error('Quality review frame changed');
}
const stamp=ms=>{const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
export function writeFinalAudit(root,config,state,output,report){
  const p=qualityPolicy(config);if(!p)return null;
  const dir=path.join(avpDir(root),'output'),scenes=[],rows=[];let offsetMs=0;
  for(const s of config.scenes){
    const d=sceneDir(root,s.id),ss=state.scenes[s.id],preview=path.join(d,'preview.mp4'),ms=Math.round(duration(preview)*1000);
    const info=readJson(path.join(d,'captions.json')),qa=readJson(path.join(d,'qa-report.json'));
    const row={sceneId:s.id,startMs:offsetMs,durationMs:ms,previewHash:ss.artifacts.preview.hash,qaHash:ss.qa.reportHash,
      claimIds:(s.claims||[]).map(c=>c.id),captureHash:ss.artifacts.capture?.hash,voiceHash:ss.artifacts.voice?.hash||null,
      captionsHash:ss.artifacts.captions?.hash,semanticStatus:qa.quality?.semanticStatus||'NOT_EVALUATED'};
    scenes.push(row);
    for(const c of info.rows||[])rows.push({startMs:offsetMs+c.startMs,endMs:offsetMs+c.endMs,text:c.text});
    offsetMs+=ms;
  }
  const srt=path.join(dir,'final.srt'),audit=path.join(dir,'final-report.json');
  if(rows.some(x=>x.endMs>Math.round(report.durationSec*1000)+300))throw Error('Global caption timeline exceeds actual final duration');
  atomicWrite(srt,rows.map((c,i)=>String(i+1)+'\n'+stamp(c.startMs)+' --> '+stamp(c.endMs)+'\n'+c.text+'\n').join('\n'));
  writeJson(audit,{schemaVersion:1,outputHash:report.outputHash,policy:p,durationSec:report.durationSec,sceneTimeline:scenes,
    globalCaptionsHash:fileHash(srt),captionTimingScope:'SCENE_PREVIEW_DURATION_OFFSETS_ESTIMATED_ALIGNMENT',
    estimatedProviderReservations:state.budget||{},actualBilledUsd:null,semanticReview:'NOT_EVALUATED_BY_AUTOMATION'});
  return {auditHash:fileHash(audit),globalCaptionsHash:fileHash(srt)};
}
export function validateFinalAudit(root,config,report){
  if(!qualityPolicy(config))return;
  const dir=path.join(avpDir(root),'output');
  if(!report.qualityExport||report.qualityExport.auditHash!==fileHash(path.join(dir,'final-report.json'))||
    report.qualityExport.globalCaptionsHash!==fileHash(path.join(dir,'final.srt')))throw Error('Final quality audit or global captions stale');
}
