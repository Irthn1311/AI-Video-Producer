// Approximate capture-clock to preview-clock mapping. No inference of spoken words.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*1000)/1000;
const normalize=x=>String(x).normalize('NFC').replace(/\s+/gu,' ').trim();
export function captureToPreviewSec(sec,plan,previewSec,fps){
  if(!finite(sec)||sec<0||!finite(previewSec)||!finite(fps)||fps<=0)return null;
  if(!plan)return sec<=previewSec?sec:null;
  const hits=[];
  for(const shot of plan.shots||[]){
    if(shot.file!=='footage/capture.mp4'||!finite(shot.playbackRate)||shot.playbackRate<=0)continue;
    const start=shot.trimBefore/fps,end=start+shot.playFrames*shot.playbackRate/fps;
    // Half-open intervals avoid counting shared cut boundaries twice.
    if(sec>=start&&sec<end){
      const t=shot.fromFrame/fps+(sec-start)/shot.playbackRate;
      if(t>=0&&t<previewSec)hits.push(t);
    }
  }
  return hits.length===1?hits[0]:null;
}
export function cueEvidenceAlignment(scene,markers,plan,rows,previewSec,fps){
  if(!scene.edit?.syncAnchors?.length)return null;
  const results=scene.edit.syncAnchors.map(a=>{
    const matches=(rows||[]).filter(c=>normalize(c.text).includes(normalize(a.cueText)));
    const evidence=(markers.evidence||[]).filter(m=>m.id===a.evidenceId);
    const t=markers.pass&&evidence.length===1?captureToPreviewSec(evidence[0].endMs/1000,plan,previewSec,fps):null;
    if(matches.length!==1||t===null||!finite(matches[0].startMs)||!finite(matches[0].endMs)||matches[0].endMs<=matches[0].startMs)
      return {...a,status:'UNRESOLVED',reason:t===null?'MISSING_OR_AMBIGUOUS_EVIDENCE_MAPPING':'MISSING_OR_AMBIGUOUS_CUE'};
    const c=matches[0],start=c.startMs/1000,end=c.endMs/1000,delta=t<start?t-start:t>end?t-end:0;
    return {...a,status:Math.abs(delta)<=a.maxOffsetSec?'WITHIN_DECLARED_WINDOW':'OUTSIDE_DECLARED_WINDOW',
      evidencePreviewSec:round(t),cueStartSec:round(start),cueEndSec:round(end),signedGapSec:round(delta)};
  });
  return {scope:'ADVISORY_CAPTURE_MARKER_VS_ESTIMATED_CAPTION_CUE_NOT_SPEECH_ALIGNMENT',
    results,within:results.filter(x=>x.status==='WITHIN_DECLARED_WINDOW').length,
    outside:results.filter(x=>x.status==='OUTSIDE_DECLARED_WINDOW').length,unresolved:results.filter(x=>x.status==='UNRESOLVED').length};
}
