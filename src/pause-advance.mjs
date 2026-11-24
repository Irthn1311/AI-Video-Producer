// Suggest only a common advance by shortening explicit pauses preceding all selected evidence.
// Never edit actions, script, audio, tolerances or media; caller reviews and applies through scoped repair.
export function proposePauseAdvance(actions,diagnostic,{minimumPauseMs=100,safetyMarginMs=200}={}){
  if(!Array.isArray(actions)||!Array.isArray(diagnostic?.results)||!diagnostic.results.length||
     !Number.isSafeInteger(minimumPauseMs)||minimumPauseMs<100||minimumPauseMs>1000||
     !Number.isSafeInteger(safetyMarginMs)||safetyMarginMs<0||safetyMarginMs>500)throw Error('Invalid pause planning inputs');
  const rows=diagnostic.results;
  if(rows.some(x=>!['WITHIN_DECLARED_WINDOW','OUTSIDE_DECLARED_WINDOW'].includes(x.status)||
      ![x.evidencePreviewSec,x.cueStartSec,x.cueEndSec,x.maxOffsetSec].every(Number.isFinite)||
      x.cueStartSec>x.cueEndSec||x.maxOffsetSec<0))return {status:'UNRESOLVED',changes:[]};
  const lower=Math.max(0,...rows.map(x=>Math.ceil((x.evidencePreviewSec-x.cueEndSec-x.maxOffsetSec)*1000)));
  const upper=Math.min(...rows.map(x=>Math.floor((x.evidencePreviewSec-x.cueStartSec+x.maxOffsetSec)*1000)));
  if(lower===0&&upper>=0)return {status:'NO_ADVANCE_REQUIRED',changes:[]};
  if(lower>upper)return {status:'NO_COMMON_ADVANCE',changes:[]};
  const indices=rows.map(x=>actions.reduce((hits,a,i)=>a.evidenceId===x.evidenceId?[...hits,i]:hits,[]));
  if(indices.some(x=>x.length!==1))return {status:'UNRESOLVED',changes:[]};
  const earliest=Math.min(...indices.map(x=>x[0]));
  const candidates=actions.map((a,index)=>({a,index})).filter(({a,index})=>index<earliest&&a.type==='pause'&&a.evidenceId===undefined&&Number.isSafeInteger(a.ms)&&a.ms>minimumPauseMs&&a.ms<=15000);
  const available=candidates.reduce((n,{a})=>n+a.ms-minimumPauseMs,0);
  const target=Math.min(upper,lower+safetyMarginMs,available);
  if(target<=0)return {status:'INSUFFICIENT_PAUSE_BUDGET',changes:[],availableMs:available,minimumRequiredMs:lower};
  let remaining=target;const changes=[];
  for(const {a,index} of candidates.reverse()){
    const reduction=Math.min(remaining,a.ms-minimumPauseMs);
    if(reduction>0)changes.push({index,beforeMs:a.ms,afterMs:a.ms-reduction});
    remaining-=reduction;if(!remaining)break;
  }
  return {status:target>=lower?'CANDIDATE':'PARTIAL_CANDIDATE',minimumRequiredMs:lower,maximumAllowedMs:upper,requestedAdvanceMs:target,availableMs:available,changes,
    scope:'APPROXIMATE_CUE_EVIDENCE_ADVANCE_NOT_EXECUTED_OR_SPEECH_ALIGNMENT'};
}
export function applyPauseCandidate(actions,candidate){
  if(!['CANDIDATE','PARTIAL_CANDIDATE'].includes(candidate?.status)||!candidate.changes?.length)throw Error('No reviewed pause candidate');
  const copy=structuredClone(actions),seen=new Set();
  for(const c of candidate.changes){
    const a=copy[c.index];
    if(seen.has(c.index)||a?.type!=='pause'||a.evidenceId!==undefined||a.ms!==c.beforeMs||!Number.isSafeInteger(c.afterMs)||c.afterMs<100||c.afterMs>=a.ms)throw Error('Stale or invalid pause candidate');
    seen.add(c.index);a.ms=c.afterMs;
  }
  return copy;
}
