import fs from 'node:fs';
import path from 'node:path';
import {avpDir,readJson,writeJson,sha,safeName,assertConfig} from './utils.mjs';
import {scanSource} from './inspect.mjs';
import {analyzeProject} from './project-intelligence.mjs';
import {makeCreativeBrief,validateDirector} from './creative-director.mjs';
import {loadState} from './state.mjs';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,allowed,label)=>{
  if(!record(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Unexpected '+label+' field');
};
const nonempty=(v,label,max=2000)=>{
  if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid '+label);
};
const proposalPath=root=>path.join(avpDir(root),'planning','agent-storyboard.json');
const actionTypes=new Set(['goto','click','fill','hover','waitFor','pause','scroll','screenshot','assertVisible','assertText','assertAttribute','clickExpectResponse']);
const roles=new Set(['hook','problem','workflow','result','conclusion','transition']);
function checkPolicy(config){
  if(!validateDirector(config))throw Error('Configure creative.director before agent storyboard planning');
  if(config.verification?.mode!=='claims')throw Error('Agent storyboard requires verification.mode=claims');
}

// Context is bounded, read-only, and does not send source to a provider.
// Agents can inspect other eligible files separately; references are validated
// against the complete eligible inventory, not just the displayed preview.
export function storyboardContext(root,config){
  checkPolicy(config);
  const scan=scanSource(root,config);
  const analysis=analyzeProject(root,config);
  const brief=makeCreativeBrief(root,config,{analysis,sourceHash:scan.contentFingerprint});
  const {scenes,...briefContext}=brief;
  return {schemaVersion:1,baseConfigHash:sha(config),sourceFingerprint:scan.contentFingerprint,
    creativeBrief:briefContext,sourceCandidates:analysis.routes,capabilitySignals:analysis.capabilitySignals,
    sourceFiles:scan.files.slice(0,120).map(f=>({path:f.path,sha256:f.sha256})),
    sourceFilesTruncated:scan.files.length>120,
    currentScenes:config.scenes.map(s=>({id:s.id,title:s.title,featureIds:s.featureIds||[],durationSec:s.durationSec})),
    proposalPath:'.avp/planning/agent-storyboard.json',
    instructions:'Author a new scene list from inspected features, exact assertions and creative intent. Source references are hypotheses, never runtime proof. Check before apply.'};
}
function validateFeatureRefs(features,scan){
  if(!Array.isArray(features)||features.length>100)throw Error('features must be an array of at most 100 candidates');
  const indexed=new Map(scan.files.map(f=>[f.path,f.sha256])),result=new Map();
  for(const f of features){
    exact(f,['id','reason','sourceRefs'],'feature');
    safeName(f.id);nonempty(f.reason,'feature.reason');
    if(result.has(f.id))throw Error('Duplicate feature '+f.id);
    if(!Array.isArray(f.sourceRefs)||!f.sourceRefs.length||f.sourceRefs.length>12)throw Error('Feature requires source references: '+f.id);
    for(const ref of f.sourceRefs){
      exact(ref,['path','sha256'],'source reference');
      if(typeof ref.path!=='string'||!indexed.has(ref.path)||indexed.get(ref.path)!==ref.sha256)
        throw Error('Unknown or stale source reference: '+String(ref.path));
    }
    result.set(f.id,{id:f.id,reason:f.reason,sourceRefs:f.sourceRefs,status:'SOURCE_REFERENCED_UNVERIFIED'});
  }
  return result;
}
function inspectScenes(entries,features){
  if(!Array.isArray(entries)||!entries.length||entries.length>100)throw Error('scenes must contain 1–100 entries');
  const scenes=[],metadata=[],seen=new Set(),used=new Set();
  for(const entry of entries){
    exact(entry,['scene','role','purpose','startState','endState','fallback','dependsOn','direction'],'storyboard scene');
    const s=entry.scene;
    exact(s,['id','title','durationSec','featureIds','narration','capture','claims','edit','captionTiming'],'scene');
    safeName(s.id);nonempty(s.title,'scene.title',160);
    if(seen.has(s.id))throw Error('Duplicate scene '+s.id);
    if(!roles.has(entry.role))throw Error('Invalid story role: '+s.id);
    for(const k of ['purpose','startState','endState','fallback'])nonempty(entry[k],k);
    if(!Array.isArray(entry.dependsOn)||new Set(entry.dependsOn).size!==entry.dependsOn.length||
       entry.dependsOn.some(id=>!seen.has(id)))throw Error('Dependencies must refer to earlier scenes: '+s.id);
    seen.add(s.id);
    if(!Array.isArray(s.featureIds))throw Error('Explicit featureIds required: '+s.id);
    for(const id of s.featureIds){
      if(!features.has(id))throw Error('Scene references an unlisted feature: '+id);
      used.add(id);
    }
    if(!Array.isArray(s.capture?.actions)||s.capture.actions.some(a=>!actionTypes.has(a?.type)))
      throw Error('Unsupported direct action in '+s.id+'; use a separately reviewed project adapter');
    // A proposal cannot disable existing evidence safety by substituting a
    // feature-less scene with unverified narration. Semantic review still needed.
    if(s.capture.evidencePolicy?.failOnPageError===false)throw Error('Agent storyboard cannot disable page-error checks');
    scenes.push(s);
    metadata.push({id:s.id,role:entry.role,purpose:entry.purpose,startState:entry.startState,
      endState:entry.endState,fallback:entry.fallback,dependsOn:entry.dependsOn,
      direction:entry.direction||{}});
  }
  if(used.size!==features.size)throw Error('All selected features must be used in at least one scene');
  return {scenes,metadata};
}
function duration(config){return config.scenes.reduce((sum,s)=>sum+s.durationSec,0);}
function checkLocked(root,current,next){
  const state=loadState(root),before=new Map(current.scenes.map(s=>[s.id,s])),after=new Map(next.scenes.map(s=>[s.id,s]));
  for(const [id,ss] of Object.entries(state.scenes||{})){
    if(!ss.locked)continue;
    if(!before.has(id)||!after.has(id)||sha(before.get(id))!==sha(after.get(id))||
       sha(current.creative?.director?.sceneDirections?.[id]||{})!==sha(next.creative?.director?.sceneDirections?.[id]||{}))
      throw Error('Locked scene '+id+' cannot be changed or removed; explicitly unlock first');
  }
}
function compile(root,config,proposal){
  checkPolicy(config);
  exact(proposal,['schemaVersion','baseConfigHash','sourceFingerprint','storyRationale','features','scenes'],'proposal');
  if(proposal.schemaVersion!==1||proposal.baseConfigHash!==sha(config))throw Error('Storyboard proposal has stale base config');
  const scan=scanSource(root,config);
  if(proposal.sourceFingerprint!==scan.contentFingerprint)throw Error('Storyboard proposal has stale source fingerprint');
  nonempty(proposal.storyRationale,'storyRationale');
  const features=validateFeatureRefs(proposal.features,scan);
  const {scenes,metadata}=inspectScenes(proposal.scenes,features);
  const next=structuredClone(config);
  next.scenes=structuredClone(scenes);
  next.creative.director.sceneDirections=Object.fromEntries(metadata.map(m=>[m.id,m.direction]));
  next.creative.storyboard={schemaVersion:1,sourceFingerprint:scan.contentFingerprint,
    proposalHash:sha(proposal),storyRationale:proposal.storyRationale,
    features:[...features.values()],scenes:metadata,sceneListHash:sha(next.scenes)};
  // No change to budget, app URL, review, provider, environment or permissions.
  assertConfig(next);validateDirector(next);
  if(next.creative.director.maxDurationSec!=null&&duration(next)>next.creative.director.maxDurationSec)
    throw Error('Proposed storyboard exceeds creative maximum duration');
  if(Object.keys(config.production?.sceneDependencies||{}).length)
    throw Error('Existing production.sceneDependencies require manual reconciliation before storyboard apply');
  checkLocked(root,config,next);
  return next;
}
function diff(before,after){
  const old=new Map(before.scenes.map(s=>[s.id,s])),fresh=new Map(after.scenes.map(s=>[s.id,s]));
  const direction=(c,id)=>c.creative?.director?.sceneDirections?.[id]||{};
  return {added:[...fresh.keys()].filter(id=>!old.has(id)),removed:[...old.keys()].filter(id=>!fresh.has(id)),
    changed:[...fresh.keys()].filter(id=>old.has(id)&&(sha(old.get(id))!==sha(fresh.get(id))||sha(direction(before,id))!==sha(direction(after,id)))),
    unchanged:[...fresh.keys()].filter(id=>old.has(id)&&sha(old.get(id))===sha(fresh.get(id))&&sha(direction(before,id))===sha(direction(after,id))),
    orderChanged:sha([...old.keys()])!==sha([...fresh.keys()]),
    durationBeforeSec:duration(before),durationAfterSec:duration(after)};
}
export function checkStoryboardProposal(root,config){
  const proposal=readJson(proposalPath(root)),next=compile(root,config,proposal);
  return {status:'VALID_DRAFT_NOT_RUNTIME_VERIFIED',proposalHash:sha(proposal),
    diff:diff(config,next),features:next.creative.storyboard.features,
    dependenciesPending:next.creative.storyboard.scenes.filter(s=>s.dependsOn.length).map(s=>s.id),
    note:'Requires explicit apply, renewed creative/planning approval where applicable, and real rehearsal. No actions executed.'};
}
export function applyStoryboardProposal(root,config,{confirm=false,expectedHash}={}){
  if(confirm!==true)throw Error('Use storyboard check, then storyboard apply --hash HASH --confirm');
  const proposal=readJson(proposalPath(root));
  if(sha(proposal)!==expectedHash)throw Error('Storyboard proposal hash changed or missing');
  const next=compile(root,config,proposal);
  // The canonical config is replaced only after validation, explicit apply and
  // lock checks. Existing artifacts/approval receipts are preserved for review;
  // old Build locks and planning reviews fail their existing config hash checks.
  const result={status:'APPLIED_REQUIRES_BUILD',proposalHash:expectedHash,diff:diff(config,next)};
  writeJson(path.join(root,'project.json'),next);
  return result;
}
export function storyboardGate(config,sourceFingerprint){
  const s=config.creative?.storyboard;
  if(s===undefined)return [];
  const issues=[];
  if(!record(s)||s.schemaVersion!==1||s.sourceFingerprint!==sourceFingerprint||s.sceneListHash!==sha(config.scenes)||
     !Array.isArray(s.scenes)||!Array.isArray(s.features)){
    issues.push({code:'STORYBOARD_PROVENANCE_STALE',message:'Agent storyboard source or scene list changed',action:'Author/check/apply a fresh storyboard proposal'});return issues;
  }
  if(s.scenes.some(x=>!Array.isArray(x?.dependsOn)||x.dependsOn.length))
    issues.push({code:'STORYBOARD_DEPENDENCY_UNSUPPORTED',message:'Cross-scene runtime dependencies are not yet orchestrated',action:'Rehearse independent scenes with explicit setup, or implement dependency orchestration before Production'});
  return issues;
}
