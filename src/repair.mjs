import fs from 'node:fs';
import path from 'node:path';
import {avpDir,readJson,writeJson,sha,getProject,fileHash} from './utils.mjs';
import {sourceFingerprint} from './inspect.mjs';
import {repairStoryboardCandidate} from './agent-storyboard.mjs';
import {inputHashes,staleParts,loadState,saveState,invalidateOutput,validateSceneQa,validateFinalOutput} from './state.mjs';
import {snapshotScene} from './revisions.mjs';
import {archiveRelease} from './release.mjs';
import {selectedVoiceFingerprint} from './voice-selection.mjs';
const folder=root=>path.join(avpDir(root),'repair');
const requestFile=root=>path.join(folder(root),'request.json');
const causes=new Set(['capture-action','capture-timing','app-bug','claim','narration','caption','composition','encoding','asset']);
const names=['capture','voice','captions','preview'];
function loadRequest(root,config){
  const q=readJson(requestFile(root));
  if(!q||Object.keys(q).some(k=>!['schemaVersion','baseConfigHash','sceneId','shotId','cause','description','rationale'].includes(k))||
     q.schemaVersion!==1||q.baseConfigHash!==sha(config)||!causes.has(q.cause)||
     typeof q.description!=='string'||!q.description.trim()||q.description.length>2000||
     typeof q.rationale!=='string'||!q.rationale.trim()||q.rationale.length>2000)throw Error('Invalid or stale repair request');
  const scene=config.scenes.find(s=>s.id===q.sceneId);
  if(!scene)throw Error('Unknown repair target');
  if(q.shotId!==undefined&&!scene.edit?.shots?.some(s=>s.id===q.shotId))throw Error('Unknown stable shot ID');
  if(q.cause==='app-bug')throw Error('Actual app bug requires authorized app repair or truthful revised claim; do not fabricate successful footage');
  if(config.creative?.storyboard?.scenes?.some(s=>s.dependsOn?.length)||Object.keys(config.production?.sceneDependencies||{}).length)
    throw Error('Cross-scene state dependencies require explicit manual Build reconciliation; scoped repair is unsupported');
  return {q,scene};
}
function evaluate(root,config,state){
  const {q,scene}=loadRequest(root,config),candidate=repairStoryboardCandidate(root,config,scene.id),next=candidate.next,d=candidate.diff;
  if(d.added.length||d.removed.length||d.orderChanged||d.changed.length!==1||d.changed[0]!==scene.id)
    throw Error('Repair proposal must change exactly the requested existing scene, without reordering');
  const previous=config.creative.storyboard,fresh=next.creative.storyboard;
  if(!previous||sha(previous.features)!==sha(fresh.features)||previous.storyRationale!==fresh.storyRationale||
    sha(previous.scenes.filter(s=>s.id!==scene.id))!==sha(fresh.scenes.filter(s=>s.id!==scene.id))||
    fresh.scenes.some(s=>s.dependsOn.length))throw Error('Repair must preserve unrelated feature/story metadata and independent scene state');
  const target=next.scenes.find(s=>s.id===scene.id),ss=state.scenes?.[scene.id]||{artifacts:{}};
  const shotChange=d.shotChanges[scene.id];
  if(q.shotId&&q.cause==='composition'&&(!shotChange||!shotChange.changed.includes(q.shotId)))throw Error('Requested composition shot is not changed by proposal');
  const stale=staleParts(scene,config,ss,root),before=inputHashes(scene,config,ss,root),after=inputHashes(target,next,ss,root);
  const rebuild={};
  rebuild.capture=stale.capture||before.capture!==after.capture;
  rebuild.voice=config.voiceover?.enabled!==false&&(stale.voice||before.voice!==after.voice);
  rebuild.captions=stale.captions||before.captions!==after.captions||rebuild.voice;
  rebuild.preview=stale.preview||before.preview!==after.preview||rebuild.capture||rebuild.voice||rebuild.captions;
  const claimChanged=sha(scene.claims||[])!==sha(target.claims||[])||sha(scene.featureIds||[])!==sha(target.featureIds||[]);
  const nodes=names.map(kind=>({kind,action:kind==='voice'&&config.voiceover?.enabled===false?'DISABLED':rebuild[kind]?'REBUILD':'PRESERVE',
    reason:stale[kind]?'CURRENT_ARTIFACT_STALE':before[kind]!==after[kind]?'INPUT_CHANGED':rebuild[kind]?'UPSTREAM_CHANGED':'INPUT_AND_BYTES_CURRENT'}));
  nodes.push({kind:'qa',action:'RECHECK',reason:'NEW_SCENE_REVISION'},{kind:'final',action:'REASSEMBLE',reason:'SCENE_REVISION'});
  const others=config.scenes.filter(s=>s.id!==scene.id).map(s=>{
    const x=state.scenes?.[s.id]||{artifacts:{}},parts=staleParts(s,next,x,root);
    let qa=false;try{validateSceneQa(root,next,s,state);qa=true;}catch{}
    return {sceneId:s.id,action:Object.values(parts).some(Boolean)||!qa?'REVIEW_EXISTING_BLOCKER':'PRESERVE',parts,qaCurrent:qa,
      artifacts:Object.fromEntries(names.map(k=>[k,x.artifacts?.[k]?.hash||null]))};
  });
  if(others.some(s=>s.action!=='PRESERVE'))throw Error('Unrelated scene is not current under proposed revision; resolve broader impact explicitly');
  const lock=path.join(avpDir(root),'build','build-lock.json');
  const plan={schemaVersion:1,status:'REPAIR_CANDIDATE_NOT_EXECUTED',baseConfigHash:sha(config),sourceFingerprint:sourceFingerprint(root,config),
    buildLockHash:fs.existsSync(lock)?fileHash(lock):null,proposalHash:candidate.proposalHash,requestHash:sha(q),
    sceneId:scene.id,shotId:q.shotId||null,cause:q.cause,causeConfidence:'AGENT_DECLARED_NOT_INDEPENDENTLY_VERIFIED',
    nodes,otherScenes:others,claimChanged,shotChanges:d.shotChanges[scene.id]||null,
    captureScope:rebuild.capture?'FULL_TARGET_SCENE':'NONE',compositionScope:'TARGET_SCENE_ONLY',
    durationBeforeSec:d.durationBeforeSec,durationAfterSec:d.durationAfterSec,
    stateHash:sha(state),paidVoiceMayBeNeeded:rebuild.voice&&!/^[a-f0-9]{64}$/.test(selectedVoiceFingerprint(root,next,target)||''),
    estimatedActualCostUsd:null,requiresBuild:true,requiresExplicitApproval:true};
  return {plan:{...plan,planHash:sha(plan)},next};
}
export function repairPlan(root,config,state){
  const {plan}=evaluate(root,config,state);writeJson(path.join(folder(root),'repair-plan.json'),plan);return plan;
}
export function applyRepair(root,{hash,confirm=false}={}){
  if(!confirm||typeof hash!=='string')throw Error('Use repair plan then repair apply --hash HASH --confirm');
  fs.mkdirSync(folder(root),{recursive:true});const lock=path.join(folder(root),'apply.lock'),fd=fs.openSync(lock,'wx');fs.closeSync(fd);
  try{
    const {config}=getProject(root),state=loadState(root),{plan,next}=evaluate(root,config,state);
    if(plan.planHash!==hash)throw Error('Repair plan changed; replan before applying');
    const scene=config.scenes.find(s=>s.id===plan.sceneId);
    // Archive approved output before invalidation; no false claim of a current release.
    let release=null,valid=false;try{validateFinalOutput(root,config,state);valid=true;}catch{}
    if(valid&&(config.review.mode!=='review'||state.reviews?.final))release=archiveRelease(root,config,state,{confirm:true});
    else if(state.reviews?.final)throw Error('Prior final approval exists but output is invalid; inspect or archive externally before repair');
    const backup=snapshotScene(root,config,scene,state,{label:'pre-repair '+plan.planHash.slice(0,12)});
    const journal=path.join(folder(root),plan.planHash+'.json');
    writeJson(journal,{schemaVersion:1,status:'CHECKPOINTED',plan,backup,releaseId:release?.releaseId||null,priorConfig:config});
    // Clear target approval before changing canonical config. If interrupted, old or new config still needs review.
    const ss=state.scenes[scene.id];ss.locked=false;ss.approved=false;delete ss.approvedSemanticHash;delete ss.qa;delete ss.approvedAt;delete ss.approvedPreviewHash;delete ss.approvedQaHash;
    invalidateOutput(state);saveState(root,state);
    writeJson(path.join(root,'project.json'),next);
    writeJson(journal,{schemaVersion:1,status:'APPLIED_REQUIRES_BUILD',plan,backup,releaseId:release?.releaseId||null,priorConfig:config});
    return {status:'APPLIED_REQUIRES_BUILD',planHash:hash,sceneId:scene.id,backup:backup.version,releaseId:release?.releaseId||null,nodes:plan.nodes,
      action:'Review/reprepare and freeze Build; then production next/step. Never restore prior approvals automatically.'};
  }finally{fs.rmSync(lock,{force:true});}
}
