import {spawnSync} from 'node:child_process';

const isTime = value => typeof value==='number' && Number.isFinite(value) && value>=0;
const round3 = value => Math.round(value*1000)/1000;
export const sentenceParts = text => text.match(/[^.!?\n]+(?:[.!?]+|$)/gu)?.map(s=>s.trim()).filter(Boolean)||[];

export function validateCaptionTiming(scene,config={}) {
  const spec=scene.captionTiming;
  if(spec===undefined)return;
  if(!spec||typeof spec!=='object'||Array.isArray(spec))throw Error('captionTiming must be an object');
  if(!['audio-pauses','manual','proportional'].includes(spec.mode))
    throw Error('captionTiming.mode must be audio-pauses, manual or proportional');
  if(spec.maxChars!==undefined&&(!Number.isInteger(spec.maxChars)||spec.maxChars<20||spec.maxChars>160))
    throw Error('captionTiming.maxChars must be an integer between 20 and 160');
  if(spec.mode!=='manual'&&spec.anchors!==undefined)
    throw Error('captionTiming.anchors requires mode=manual');
  if(spec.mode==='manual'){
    if(config.voiceover?.enabled===false)throw Error('Manual audio anchors require voiceover.enabled=true');
    const sentences=sentenceParts(scene.narration);
    if(!Array.isArray(spec.anchors)||spec.anchors.length!==sentences.length||!sentences.length)
      throw Error('Manual anchors must match the number of narration sentences');
    let previous=0;
    for(const [i,a] of spec.anchors.entries()){
      if(!a||!isTime(a.startSec)||!isTime(a.endSec)||a.endSec<=a.startSec||a.startSec<previous-1e-6)
        throw Error('Invalid, overlapping or out-of-order caption anchor '+i);
      previous=a.endSec;
    }
  }
  if(spec.mode==='audio-pauses'&&config.voiceover?.enabled===false)
    throw Error('audio-pauses caption timing requires voiceover.enabled=true');
}

function sanitizeGaps(gaps,duration) {
  const output=[];
  for(const item of gaps){
    const start=Math.min(duration,Math.max(0,Number(item.start)));
    const end=Math.min(duration,Math.max(0,Number(item.end)));
    if(!Number.isFinite(start)||!Number.isFinite(end)||end-start<0.09)continue;
    const previous=output.at(-1);
    if(previous&&start<=previous.end+1e-6)previous.end=Math.max(previous.end,end);
    else output.push({start,end});
  }
  return output;
}

export function speechFromSilence(gaps,duration) {
  if(!isTime(duration)||duration<=0)throw Error('Audio duration must be positive');
  const valid=sanitizeGaps(gaps.slice().sort((a,b)=>a.start-b.start),duration);
  const spans=[];let cursor=0;
  for(const gap of valid){
    if(gap.start-cursor>=0.07)spans.push({start:round3(cursor),end:round3(gap.start)});
    cursor=Math.max(cursor,gap.end);
  }
  if(duration-cursor>=0.07)spans.push({start:round3(cursor),end:round3(duration)});
  return {spans,gaps:valid.map(v=>({start:round3(v.start),end:round3(v.end)}))};
}

export function measureSpeech(audio,duration) {
  // FFmpeg's silencedetect uses signal amplitude; it is NOT a speech recognizer.
  const p=spawnSync('ffmpeg',['-hide_banner','-nostdin','-v','info','-i',audio,
    '-af','silencedetect=noise=-38dB:d=0.18','-f','null','-'],
    {encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  if(p.error||p.status!==0)throw Error('Local FFmpeg silence analysis failed; review voice.wav and FFmpeg availability');
  const gaps=[];let opened=null;
  for(const line of (p.stderr||'').split(/\r?\n/)){
    const start=line.match(/silence_start:\s*([0-9.]+)/);
    if(start){opened=Number(start[1]);continue;}
    const end=line.match(/silence_end:\s*([0-9.]+)/);
    if(end&&opened!==null){gaps.push({start:opened,end:Number(end[1])});opened=null;}
  }
  if(opened!==null)gaps.push({start:opened,end:duration});
  const result=speechFromSilence(gaps,duration);
  if(!result.spans.length)throw Error('No non-silent audio region detected; cannot align spoken captions to voice.wav');
  return {...result,analyzer:'ffmpeg silencedetect -38dB, 0.18s; measured silence is not transcription'};
}

export function chunkCaption(sentence,maxChars=80) {
  const chunks=[];let line='';
  for(let word of sentence.trim().split(/\s+/u).filter(Boolean)){
    while(Array.from(word).length>maxChars) {
      if(line){chunks.push(line);line='';}
      const points=Array.from(word);
      chunks.push(points.slice(0,maxChars).join(''));word=points.slice(maxChars).join('');
    }
    if(!word)continue;
    if(!line)line=word;
    else if(Array.from(line).length+1+Array.from(word).length<=maxChars)line+=' '+word;
    else {chunks.push(line);line=word;}
  }
  if(line)chunks.push(line);
  return chunks;
}

const textWeight = value => Math.max(1,Array.from(value).length);
function activeSecondsToTime(spans,seconds,atStart) {
  if(seconds<=0)return spans[0].start;
  let used=0;
  for(let i=0;i<spans.length;i++){
    const s=spans[i],len=s.end-s.start;
    if(seconds<used+len-1e-8)return s.start+seconds-used;
    if(Math.abs(seconds-(used+len))<=1e-8)
      return atStart && spans[i+1]?spans[i+1].start:s.end;
    used+=len;
  }
  return spans.at(-1).end;
}
function distributeByActiveSpeech(sentences,spans) {
  const total=spans.reduce((sum,s)=>sum+s.end-s.start,0);
  const weights=sentences.map(textWeight),sum=weights.reduce((a,b)=>a+b,0);
  let at=0;
  return sentences.map((s,i)=>{
    const start=activeSecondsToTime(spans,total*at/sum,true);at+=weights[i];
    const end=activeSecondsToTime(spans,total*at/sum,false);
    return {start,end};
  });
}

export function validateCaptionRows(rows,duration,maxChars=80) {
  if(!Array.isArray(rows))throw Error('Caption rows missing');
  let end=0;
  for(const [i,row] of rows.entries()){
    if(!Number.isInteger(row.startMs)||!Number.isInteger(row.endMs)||
      row.startMs<0||row.endMs<=row.startMs||row.startMs<end||
      row.endMs>Math.ceil(duration*1000)+5)
      throw Error('Caption timestamp out of bounds, overlapping or too short at row '+i);
    if(typeof row.text!=='string'||!row.text.trim()||Array.from(row.text).length>maxChars)
      throw Error('Invalid caption content/length at row '+i);
    end=row.endMs;
  }
  return true;
}

export function alignNarration(text, duration, options={}) {
  if(!isTime(duration)||duration<=0)throw Error('Caption duration must be positive');
  const sentences=sentenceParts(text),maxChars=options.maxChars||80;
  if(!sentences.length)return {rows:[],timingMethod:'NO_NARRATION',reviewRequired:false,analysis:{durationSec:round3(duration),sentenceCount:0}};
  const mode=options.mode||'proportional';
  const measured=options.measured;
  const warnings=[];
  let windows,method;
  if(mode==='manual'){
    if(!Array.isArray(options.anchors)||options.anchors.length!==sentences.length)
      throw Error('Manual caption anchors must match narration sentence count');
    windows=options.anchors.map(a=>({start:a.startSec,end:a.endSec}));
    if(windows.some(a=>a.end>duration+0.005))
      throw Error('Manual caption anchor exceeds actual voice duration');
    method='MANUAL_AUDIO_ANCHORS';
    warnings.push('Anchors are human-supplied: verify them against the audio before approval.');
  }else if(mode==='audio-pauses'){
    if(!measured?.spans?.length)throw Error('Silence-aware caption timing requires measured audio spans');
    if(measured.spans.length===sentences.length){
      windows=measured.spans.map(s=>({...s}));
      method='SILENCE_ANCHORED_SENTENCES';
      warnings.push('One-to-one sentence/speech-region assignment is inferred, not verified transcription.');
    }else{
      windows=distributeByActiveSpeech(sentences,measured.spans);
      method='SILENCE_AWARE_ESTIMATED';
      warnings.push('Sentence count differs from measured speech regions; boundaries are estimated over non-silent audio time.');
    }
  }else if(mode==='proportional'){
    windows=distributeByActiveSpeech(sentences,[{start:0,end:duration}]);
    method='PROPORTIONAL_TEXT_ESTIMATED';
    warnings.push('Text duration estimate; not aligned to actual words or silence.');
  }else throw Error('Unknown caption timing mode');

  const rows=[];
  for(let i=0;i<sentences.length;i++){
    const sentence=sentences[i],parts=chunkCaption(sentence,maxChars);
    const w=windows[i],width=w.end-w.start;
    if(!isTime(w.start)||!isTime(w.end)||width<=0)throw Error('No usable caption interval for sentence '+i);
    const weights=parts.map(textWeight),sum=weights.reduce((a,b)=>a+b,0);
    let cursor=0;
    for(let j=0;j<parts.length;j++){
      const start=Math.round((w.start+width*cursor/sum)*1000);cursor+=weights[j];
      const end=Math.round((w.start+width*cursor/sum)*1000);
      rows.push({startMs:start,endMs:end,text:parts[j]});
    }
  }
  validateCaptionRows(rows,duration,maxChars);
  return {rows,timingMethod:method,
    reviewRequired:method!=='NO_NARRATION',
    analysis:{
      durationSec:round3(duration),sentenceCount:sentences.length,captionCount:rows.length,
      detectedSpeechRegions:measured?.spans?.length??null,
      speechSpans:measured?.spans??null,
      silenceGaps:measured?.gaps??null,
      observations:measured?.analyzer??null,
      warnings
    }};
}
