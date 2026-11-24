import path from 'node:path';
import {avpDir,sceneDir,readJson,writeJson,sha,fileHash} from './utils.mjs';
import {validateSceneQa} from './state.mjs';
const dimensions=['claimTruth','visibleEvidence','narrationAccuracy','subtitleSync','legibility','composition','continuity'];
export function semanticContext(root,config,scene,state){
  const qa=validateSceneQa(root,config,scene,state),dir=sceneDir(root,scene.id);
  const identity={sceneId:scene.id,sceneHash:sha(scene),previewHash:qa.previewHash,qaHash:fileHash(path.join(dir,'qa-report.json'))};
  return {schemaVersion:1,...identity,reviewHash:sha(identity),claims:scene.claims||[],narration:scene.narration,
    preview:path.join(dir,'preview.mp4'),frames:qa.quality?.frames||[],dimensions,
    submission:'.avp/repair/semantic-review.json',scope:'REVIEW_REQUEST_NOT_AUTOMATED_SEMANTIC_JUDGMENT'};
}
export function recordSemanticReview(root,config,scene,state,{confirm=false,hash}={}){
  const ctx=semanticContext(root,config,scene,state),q=readJson(path.join(avpDir(root),'repair','semantic-review.json'));
  if(!confirm||hash!==ctx.reviewHash||q.reviewHash!==hash||q.schemaVersion!==1||!['OPERATOR','EXTERNAL_AGENT'].includes(q.reviewer)||
    !q.findings||Object.keys(q.findings).length!==dimensions.length||!dimensions.every(k=>['PASS','FAIL','NOT_EVALUATED'].includes(q.findings[k])))
    throw Error('Review must explicitly bind all dimensions to current preview and QA');
  const result={schemaVersion:1,reviewHash:hash,previewHash:ctx.previewHash,qaHash:ctx.qaHash,reviewer:q.reviewer,findings:q.findings,
    disposition:dimensions.every(k=>q.findings[k]==='PASS')?'DECLARED_PASS':'REVIEW_ISSUES_OR_INCOMPLETE',
    scope:'DECLARED_EXTERNAL_REVIEW_NOT_INDEPENDENTLY_VERIFIED',at:new Date().toISOString()};
  writeJson(path.join(sceneDir(root,scene.id),'semantic-review.json'),result);return result;
}
