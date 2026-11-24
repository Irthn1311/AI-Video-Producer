import fs from 'node:fs';
import path from 'node:path';
import {avpDir,sha,safeName,readJson,fileHash,loadEnv} from './utils.mjs';

export function timingEnabled(config){return config.creative?.timing!==undefined;}
export function timingPolicy(config){
  if(!timingEnabled(config))return null;
  const p=config.creative.timing;
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['maxSilenceSec','actionToleranceSec'].includes(k)))throw Error('Invalid creative.timing policy');
  const maxSilenceSec=p.maxSilenceSec??2,actionToleranceSec=p.actionToleranceSec??0.25;
  if(!Number.isFinite(maxSilenceSec)||maxSilenceSec<0.18||maxSilenceSec>60||
     !Number.isFinite(actionToleranceSec)||actionToleranceSec<0||actionToleranceSec>2)throw Error('Invalid creative.timing thresholds');
  return {maxSilenceSec,actionToleranceSec};
}
export function voiceRequestHash(root,config,scene){
  loadEnv(path.resolve(import.meta.dirname,'..'));loadEnv(root);
  return sha({schemaVersion:1,narration:scene.narration,provider:config.voiceover?.provider,
    model:process.env.GEMINI_TTS_MODEL||config.voiceover?.model||'gemini-2.5-flash-preview-tts',
    voice:config.voiceover?.voice||'Charon',language:config.language?.narration||'en-US',
    style:config.voiceover?.style||'Clear and conversational'});
}
export const timingDir=(root,scene)=>path.join(avpDir(root),'timing',safeName(scene.id));
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function selectionFile(root,config,scene){return path.join(timingDir(root,scene),'selected',voiceRequestHash(root,config,scene)+'.json');}
export function candidatePaths(root,scene,id){
  if(!validHash(id))throw Error('Invalid candidate hash');
  const dir=path.join(timingDir(root,scene),'candidates',id);
  return {dir,audio:path.join(dir,'voice.wav'),receipt:path.join(dir,'receipt.json')};
}
export function readCandidate(root,config,scene,id){
  const p=candidatePaths(root,scene,id),receipt=readJson(p.receipt);
  if(receipt.schemaVersion!==1||sha(receipt)!==id||receipt.requestHash!==voiceRequestHash(root,config,scene)||
    receipt.sceneId!==scene.id||!validHash(receipt.audioHash)||fileHash(p.audio)!==receipt.audioHash||
    !Number.isFinite(receipt.durationSec)||receipt.durationSec<=0||!Number.isFinite(receipt.longestSilenceSec)||
    receipt.longestSilenceSec<0||receipt.longestSilenceSec>receipt.durationSec||
    !['GEMINI_TTS','OPERATOR_DECLARED_LOCAL_AUDIO'].includes(receipt.origin))
    throw Error('Candidate is stale, invalid, or audio bytes changed');
  return {id,...p,receipt};
}
export function selectedVoice(root,config,scene){
  const file=selectionFile(root,config,scene);
  if(!fs.existsSync(file))return null;
  const selected=readJson(file);
  if(selected.schemaVersion!==1||selected.requestHash!==voiceRequestHash(root,config,scene)||
     selected.decision!=='EXPLICIT_LISTENING_REVIEW'||typeof selected.selectedAt!=='string')
    throw Error('Invalid voice selection receipt');
  const candidate=readCandidate(root,config,scene,selected.candidateHash);
  return {...candidate,selectionHash:fileHash(file),selectedAt:selected.selectedAt};
}
export function selectedVoiceFingerprint(root,config,scene){
  if(!root||!timingEnabled(config)||config.voiceover?.enabled===false)return undefined;
  try{return selectedVoice(root,config,scene)?.selectionHash||'MISSING';}catch{return 'INVALID';}
}
