import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadEnv} from './utils.mjs';
import {reservePaidCall,saveState} from './state.mjs';
import {ExecutionError,providerHttpError} from './execution-errors.mjs';

export function loadVoiceEnvironment(root){
  loadEnv(path.resolve(import.meta.dirname,'..'));loadEnv(root);
}
export function voiceRequest(config,scene){
  return {provider:'gemini',model:process.env.GEMINI_TTS_MODEL||config.voiceover.model||'gemini-2.5-flash-preview-tts',
    voice:config.voiceover.voice||'Charon',language:config.language?.narration||'en-US',
    style:config.voiceover.style||'Clear and conversational',narration:scene.narration};
}
function wavFromPcm(pcm,sampleRate){
  const b=Buffer.alloc(44);b.write('RIFF',0);b.writeUInt32LE(pcm.length+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);return Buffer.concat([b,pcm]);
}
export async function synthesizeVoice(root,config,scene,state,opts={}){
  if(config.voiceover?.enabled===false||config.voiceover?.provider!=='gemini')throw Error('Enabled Gemini voice provider required');
  if(!opts.allowPaidApi)throw new ExecutionError('PAID_CONSENT_REQUIRED','Voice generation may incur cost. Add --allow-paid-api after verifying provider pricing and script.');
  loadVoiceEnvironment(root);
  const key=process.env.GEMINI_API_KEY;
  if(!key)throw new ExecutionError('PROVIDER_AUTH','GEMINI_API_KEY missing; set key locally.');
  const request=voiceRequest(config,scene);
  const text='Speak in '+request.language+'. '+request.style+'. Read only the following: '+request.narration;
  const body={contents:[{parts:[{text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:request.voice}}}}};
  const budgetReservation=reservePaidCall(root,state,config,opts.budgetSession,config.voiceover.estimatedUsdPerCall);
  const callId=randomUUID(),started=Date.now(),phase=opts.phase==='BUILD'?'BUILD':'PRODUCTION';
  state.history.push({event:'provider-request-started',provider:'gemini',callId,phase,scene:scene.id,at:new Date().toISOString()});saveState(root,state);
  let outcome='FAILED';
  try{
  let response;try{response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(request.model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});}catch{throw new ExecutionError('PROVIDER_TRANSIENT','Gemini TTS network request failed or timed out');}
  if(!response.ok)throw providerHttpError(response.status);
  let json;try{json=await response.json();}catch{throw new ExecutionError('PROVIDER_RESPONSE_INVALID','Invalid TTS response JSON');}
  const part=json.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data);
  if(!part)throw new ExecutionError('PROVIDER_RESPONSE_INVALID','TTS response contains no audio');
  const mime=part.inlineData.mimeType||'';
  if(!/audio\/(L16|pcm)/i.test(mime))throw new ExecutionError('PROVIDER_RESPONSE_INVALID','Unsupported raw TTS audio mime type');
  const rate=Number(mime.match(/rate=(\d+)/i)?.[1]||24000),pcm=Buffer.from(part.inlineData.data,'base64');
  if(!Number.isInteger(rate)||rate<8000||rate>96000||pcm.length<100||pcm.length%2||pcm.length>96_000_000)throw new ExecutionError('PROVIDER_RESPONSE_INVALID','Invalid PCM audio response');
  outcome='AUDIO_VALID';return {request,wav:wavFromPcm(pcm,rate),budgetReservation};
  }finally{state.history.push({event:'provider-request-finished',provider:'gemini',callId,phase,status:outcome,elapsedMs:Date.now()-started,at:new Date().toISOString()});saveState(root,state);}
}
