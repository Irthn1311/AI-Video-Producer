import fs from 'node:fs';
import path from 'node:path';
import {run,sha,readJson,writeJson,fileHash,atomicWrite} from './utils.mjs';
import {inputHashes,requireUnlocked} from './state.mjs';
import {measureSpeech} from './audio-timing.mjs';
import {synthesizeVoice} from './voice-provider.mjs';
import {timingEnabled,timingPolicy,timingDir,voiceRequestHash,candidatePaths,readCandidate,selectedVoice,selectionFile} from './voice-selection.mjs';
import {rehearsalPath} from './rehearsal.mjs';
import {adapterActions} from './adapters.mjs';

function requirePolicy(config){
  if(!timingEnabled(config))throw Error('Configure creative.timing to opt in to timing rehearsal');
  timingPolicy(config);
}
function requireVoice(config,scene){
  requirePolicy(config);
  if(config.voiceover?.enabled===false||!scene.narration.trim())throw Error('Enabled voice and nonempty narration required');
}
function probeAudio(file){
  const p=JSON.parse(run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file],{timeout:30000}));
  const duration=Number(p.format?.duration);
  if(p.streams?.length!==1||p.streams[0].codec_type!=='audio'||!Number.isFinite(duration)||duration<=0||duration>900)
    throw Error('Expected one audio-only stream with duration at most 900 seconds');
  return duration;
}
function candidates(root,config,scene){
  const dir=path.join(timingDir(root,scene),'candidates');
  if(!fs.existsSync(dir))return [];
  const result=[];
  for(const id of fs.readdirSync(dir).sort()){
    try{const c=readCandidate(root,config,scene,id);result.push({candidateHash:id,audio:c.audio,...c.receipt});}catch{/* Stale/corrupt variants cannot be selected. */}
  }
  return result;
}
function saveCandidate(root,config,scene,buffer,origin){
  const dir=timingDir(root,scene);fs.mkdirSync(dir,{recursive:true});
  const staged=path.join(dir,'candidate-'+process.pid+'.wav');
  try{
    atomicWrite(staged,buffer);
    const durationSec=probeAudio(staged),measured=measureSpeech(staged,durationSec);
    const receipt={schemaVersion:1,sceneId:scene.id,requestHash:voiceRequestHash(root,config,scene),
      origin,audioHash:fileHash(staged),durationSec,longestSilenceSec:Math.max(0,...measured.gaps.map(g=>g.end-g.start)),
      silenceGaps:measured.gaps,measurement:'FFmpeg amplitude silence detection, not speech recognition'};
    const id=sha(receipt),p=candidatePaths(root,scene,id);
    if(fs.existsSync(p.receipt)){
      try{readCandidate(root,config,scene,id);return {candidateHash:id,audio:p.audio,reused:true,...receipt};}catch{/* Repair invalid cache only from current measured bytes. */}
    }
    atomicWrite(p.audio,buffer);writeJson(p.receipt,receipt);
    return {candidateHash:id,audio:p.audio,reused:false,...receipt};
  }finally{fs.rmSync(staged,{force:true});}
}
export async function auditionVoice(root,config,scene,state,opts={}){
  requireVoice(config,scene);
  const existing=candidates(root,config,scene).find(x=>x.origin==='GEMINI_TTS');
  if(existing&&!opts.force)return {...existing,reused:true};
  const generated=await synthesizeVoice(root,config,scene,state,{...opts,phase:'BUILD'});
  return {...saveCandidate(root,config,scene,generated.wav,'GEMINI_TTS'),budgetReservation:generated.budgetReservation};
}
export function importAudition(root,config,scene,{file,confirm=false}={}){
  requireVoice(config,scene);
  if(confirm!==true||typeof file!=='string')throw Error('Use timing import --file FILE --confirm only for authorized audio of the exact scene narration and current voice settings');
  const source=path.resolve(file);
  if(!fs.statSync(source).isFile()||fs.statSync(source).size>100_000_000)throw Error('Local audio file must be under 100 MB');
  probeAudio(source);
  const dir=timingDir(root,scene);fs.mkdirSync(dir,{recursive:true});
  const staged=path.join(dir,'import-'+process.pid+'.wav');
  try{
    run('ffmpeg',['-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-i',source,'-map','0:a:0','-vn','-ac','1','-ar','24000','-c:a','pcm_s16le',staged],{timeout:30000});
    return saveCandidate(root,config,scene,fs.readFileSync(staged),'OPERATOR_DECLARED_LOCAL_AUDIO');
  }finally{fs.rmSync(staged,{force:true});}
}
export function listAuditions(root,config,scene){
  requireVoice(config,scene);
  let selected=null;try{selected=selectedVoice(root,config,scene)?.id||null;}catch{/* invalid selection visible as missing */}
  return {sceneId:scene.id,requestHash:voiceRequestHash(root,config,scene),selected,candidates:candidates(root,config,scene)};
}
export function chooseAudition(root,config,scene,state,{hash,confirm=false}={}){
  requireVoice(config,scene);requireUnlocked(state,scene.id);
  if(confirm!==true)throw Error('Listen to the exact audio, then use timing select --hash HASH --confirm');
  const c=readCandidate(root,config,scene,hash);
  const file=selectionFile(root,config,scene);
  let previous=null;try{previous=selectedVoice(root,config,scene);}catch{}
  if(previous?.id!==hash)writeJson(file,{schemaVersion:1,requestHash:c.receipt.requestHash,candidateHash:hash,decision:'EXPLICIT_LISTENING_REVIEW',selectedAt:new Date().toISOString()});
  return {sceneId:scene.id,selected:hash,audio:c.audio,durationSec:c.receipt.durationSec};
}
export function evaluateTiming(root,config){
  if(!timingEnabled(config))return {status:'LEGACY_NOT_ENFORCED',problems:[],digest:null,scenes:[]};
  const policy=timingPolicy(config),problems=[],scenes=[],digests={};
  const issue=(scene,code,message,action)=>problems.push({code,message:scene.id+': '+message,action});
  for(const scene of config.scenes){
    let actionSec=null,audioSec=null,longestSilenceSec=null,voiceSelectionHash=null;
    try{
      const r=readJson(rehearsalPath(root,scene.id)),actions=adapterActions(root,config,scene);
      if(r.status!=='PASS'||r.scope!=='BUILD_REHEARSAL_ONLY'||r.sceneId!==scene.id||r.captureInputHash!==inputHashes(scene,config,{},root).capture||
        r.actionsHash!==sha(actions)||!Array.isArray(r.actions)||r.actions.length!==actions.length||
        r.actions.some((a,i)=>a.type!==actions[i].type||!Number.isFinite(a.ms)||a.ms<0))throw Error('stale rehearsal');
      actionSec=r.actions.reduce((sum,a)=>sum+a.ms,0)/1000;
      if(actionSec>scene.durationSec+policy.actionToleranceSec)issue(scene,'TIMING_ACTION_OVERFLOW','Measured action time exceeds scene duration','Revise scene or reviewed edits; rehearse again. Do not assume acceleration.');
    }catch{issue(scene,'TIMING_REHEARSAL_MISSING','Current measured action timing unavailable','Run avp build rehearse --scene '+scene.id+' --allow-actions');}
    if(config.voiceover?.enabled!==false){
      try{
        const c=selectedVoice(root,config,scene);
        if(!scene.narration.trim()||!c)throw Error('missing selection');
        audioSec=c.receipt.durationSec;longestSilenceSec=c.receipt.longestSilenceSec;voiceSelectionHash=c.selectionHash;
        if(audioSec+0.5>scene.durationSec+0.005)issue(scene,'TIMING_VOICE_OVERFLOW','Selected audio plus renderer tail exceeds scene duration','Revise narration or duration; select current audio');
        if(longestSilenceSec>policy.maxSilenceSec)issue(scene,'TIMING_SILENCE_OVERFLOW','Measured silence exceeds policy','Review pacing, choose another audio or explicitly revise policy');
      }catch{issue(scene,'TIMING_VOICE_SELECTION_MISSING','No valid selected full-scene narration','Use timing audition/import, listen, then timing select --hash HASH --confirm');}
    }
    digests[scene.id]=voiceSelectionHash;
    scenes.push({id:scene.id,plannedSec:scene.durationSec,actionSec,audioSec,longestSilenceSec,voiceSelectionHash});
  }
  return {status:problems.length?'BLOCKED':'PASS',problems,scenes,digest:sha({policy,digests}),scope:'MEASURED_FEASIBILITY_NOT_SEMANTIC_SYNC_OR_RUNTIME_EVIDENCE'};
}
