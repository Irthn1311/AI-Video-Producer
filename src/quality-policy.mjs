// Opt-in production quality contract. No hidden ASR, provider calls or scene edits.
export function qualityPolicy(config){
  if(config.productionQuality===undefined)return null;
  const p=config.productionQuality;
  const allowed=['targetLufs','maxTruePeakDb','maxCaptionChars','maxCaptionCps','minCaptionSec','exportCrf'];
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))throw Error('Invalid productionQuality policy');
  const result={schemaVersion:1,targetLufs:p.targetLufs??-16,maxTruePeakDb:p.maxTruePeakDb??-1.5,
    maxCaptionChars:p.maxCaptionChars??64,maxCaptionCps:p.maxCaptionCps??28,minCaptionSec:p.minCaptionSec??.35,exportCrf:p.exportCrf??null};
  const range=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!range(result.targetLufs,-24,-14)||!range(result.maxTruePeakDb,-6,-1)||
    !Number.isInteger(result.maxCaptionChars)||!range(result.maxCaptionChars,20,100)||
    !range(result.maxCaptionCps,12,40)||!range(result.minCaptionSec,.2,2)||
    (result.exportCrf!==null&&(!Number.isInteger(result.exportCrf)||!range(result.exportCrf,16,28))))
    throw Error('Invalid productionQuality thresholds');
  return result;
}
export function qualityCaptionLimit(config,scene){
  const p=qualityPolicy(config);
  return Math.min(scene.captionTiming?.maxChars||80,p?.maxCaptionChars??160);
}
export function captionReadability(rows,narration,policy){
  const compact=s=>s.normalize('NFC').replace(/\s+/gu,'');
  const expected=compact(narration);
  const actual=compact(rows.map(r=>r.text).join(''));
  const issues=[];let maxCps=0;
  for(const [index,r] of rows.entries()){
    const length=Array.from(r.text.normalize('NFC')).length,sec=(r.endMs-r.startMs)/1000,cps=length/sec;
    maxCps=Math.max(maxCps,cps);
    if(length>policy.maxCaptionChars||sec<policy.minCaptionSec||cps>policy.maxCaptionCps)issues.push({index,length,durationSec:sec,cps:Math.round(cps*100)/100});
  }
  return {pass:expected===actual&&!issues.length,textMatchesNarration:expected===actual,maxCps:Math.round(maxCps*100)/100,issues,
    scope:'SCRIPT_TEXT_AND_ESTIMATED_CUE_READABILITY_NOT_TRANSCRIPTION'};
}
