import fs from 'node:fs';
import path from 'node:path';
import {avpDir,sceneDir,readJson,fileHash} from './utils.mjs';
import {captureEvidencePassed} from './capture-assertions.mjs';
import {adapterActions} from './adapters.mjs';

const assertionTypes = new Set(['assertVisible','assertText','assertAttribute','clickExpectResponse','assertCanvasPixels']);
const safeId = v => typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
const normalize = value => String(value).replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US');

export function verificationMode(config) {
  return config?.verification?.mode || 'legacy';
}

/**
 * Require explicit declarative claims only when the user opts into the strict
 * workflow. This does not ask an LLM to judge truthfulness.
 */
export function validateClaimConfig(config) {
  const verification=config.verification;
  if(verification!==undefined){
    if(!verification||typeof verification!=='object'||Array.isArray(verification))
      throw Error('verification must be an object');
    if(!['legacy','claims'].includes(verification.mode))throw Error('verification.mode must be legacy or claims');
  }
  const strict=verificationMode(config)==='claims';
  for(const scene of config.scenes||[]){
    const claims=scene.claims;
    if(claims!==undefined&&!Array.isArray(claims))throw Error('scene.claims must be an array: '+scene.id);
    if(!strict&&claims?.length)throw Error('scene.claims require verification.mode=claims');
    if(!strict)continue;
    const features=scene.featureIds||[];
    if(!Array.isArray(features)||features.some(x=>!safeId(x))||new Set(features).size!==features.length)
      throw Error('Invalid or duplicate scene.featureIds for '+scene.id);
    if((features.length||claims?.length)&&scene.capture?.evidencePolicy?.requireAssertions!==true)
      throw Error('Claim-bearing scene requires capture.evidencePolicy.requireAssertions=true: '+scene.id);
    const actionIndex=new Map();
    for(const action of scene.capture?.actions||[]){
      if(!assertionTypes.has(action.type))continue;
      if(!safeId(action.evidenceId))throw Error('Explicit evidenceId required for assertion in '+scene.id);
      if(actionIndex.has(action.evidenceId))throw Error('Duplicate evidenceId in '+scene.id);
      actionIndex.set(action.evidenceId,action.type);
    }
    if(features.length&&(!claims||!claims.length))
      throw Error('Every verified scene feature needs a narration claim: '+scene.id);
    const covered=new Set(),claimIds=new Set();
    for(const claim of claims||[]){
      if(!claim||typeof claim!=='object'||Array.isArray(claim))throw Error('Invalid claim in '+scene.id);
      if(!safeId(claim.id)||claimIds.has(claim.id))throw Error('Invalid or duplicate claim.id: '+scene.id);
      claimIds.add(claim.id);
      if(!features.includes(claim.featureId))throw Error('Claim references unknown feature: '+claim.featureId);
      if(typeof claim.text!=='string'||!claim.text.trim()||claim.text.length>500)
        throw Error('Invalid claim.text: '+claim.id);
      if(!normalize(scene.narration).includes(normalize(claim.text)))
        throw Error('Claim text must appear verbatim in scene narration: '+claim.id);
      if(!Array.isArray(claim.evidenceIds)||!claim.evidenceIds.length||new Set(claim.evidenceIds).size!==claim.evidenceIds.length)
        throw Error('Claim requires unique evidenceIds: '+claim.id);
      // Adapter assertions are checked against the actual reviewed recipe
      // in the Build Gate and verified at Production runtime.
      for(const id of claim.evidenceIds)if(!actionIndex.has(id)&&!scene.capture?.adapter)
        throw Error('Claim evidenceId missing from capture actions: '+id);
      covered.add(claim.featureId);
    }
    for(const feature of features)if(!covered.has(feature))
      throw Error('Uncovered scene feature '+feature+' in '+scene.id);
  }
}

/**
 * Coverage is a candidate plan approved BEFORE capture. Do not mistake a plan
 * draft's verifiedInBrowser boolean for independent runtime evidence.
 */
export function validateCoveragePlan(config,coverage) {
  if(verificationMode(config)!=='claims')return {mode:'legacy',required:false};
  if(!coverage||coverage.schemaVersion!==1||!Array.isArray(coverage.features))
    throw Error('Strict verification requires a valid feature-coverage.json');
  const expected=new Map();
  for(const scene of config.scenes){
    for(const id of scene.featureIds||[]){
      const scenes=expected.get(id)||[];
      scenes.push(scene.id);
      expected.set(id,scenes);
    }
  }
  if(coverage.features.length!==expected.size)
    throw Error('Feature coverage does not match scene featureIds');
  const seen=new Set();
  for(const entry of coverage.features){
    if(!entry||!expected.has(entry.id)||seen.has(entry.id))
      throw Error('Unknown or duplicate feature coverage entry: '+entry?.id);
    seen.add(entry.id);
    const desired=expected.get(entry.id).slice().sort();
    const actual=entry.includedInScenes;
    if(!Array.isArray(actual)||actual.length!==desired.length||JSON.stringify(actual.slice().sort())!==JSON.stringify(desired))
      throw Error('Feature coverage scene mapping is stale for '+entry.id);
  }
  return {mode:'claims',required:true,plannedFeatures:[...expected.keys()].sort()};
}

export function requireCoveragePlan(root,config) {
  if(verificationMode(config)!=='claims')return {mode:'legacy',required:false};
  const file=path.join(avpDir(root),'planning','feature-coverage.json');
  if(!fs.existsSync(file))throw Error('Strict verification requires feature-coverage.json; run avp plan');
  return validateCoveragePlan(config,readJson(file));
}

/**
 * Integrity boundary: link the latest on-disk report to its matching captured
 * artifact and exact configured assertion IDs/types. This is not a cryptographic
 * attestation of an untrusted machine or a semantic LLM evaluation.
 */
export function verifySceneClaims(root,config,scene,state) {
  if(verificationMode(config)!=='claims')return {status:'NOT_REQUIRED',pass:true};
  if(!(scene.featureIds||[]).length)return {status:'NOT_APPLICABLE',pass:true};
  const ss=state.scenes?.[scene.id];
  const artifact=ss?.artifacts?.capture;
  if(!artifact?.hash||!artifact?.inputHash)throw Error('Claim verification lacks current captured footage: '+scene.id);
  const reportFile=path.join(sceneDir(root,scene.id),'capture-report.json');
  if(!fs.existsSync(reportFile))throw Error('Capture evidence report missing: '+scene.id);
  const report=readJson(reportFile);
  if(report.scene!==scene.id||!captureEvidencePassed(report,scene.capture.evidencePolicy))
    throw Error('Capture evidence failed required assertions: '+scene.id);
  if(report.captureHash!==artifact.hash||report.captureInputHash!==artifact.inputHash)
    throw Error('Capture evidence is not bound to current footage: '+scene.id);
  const effectiveActions=adapterActions(root,config,scene);
  const declared=new Map(effectiveActions
    .filter(a=>assertionTypes.has(a.type)).map(a=>[a.evidenceId,a.type]));
  const observed=new Map();
  for(const item of report.assertions){
    if(!item||!declared.has(item.id)||declared.get(item.id)!==item.type
        ||item.pass!==true||observed.has(item.id))
      throw Error('Capture evidence includes unmatched, duplicate or failed assertion: '+scene.id);
    observed.set(item.id,item);
  }
  if(observed.size!==declared.size)throw Error('Capture evidence is missing configured assertion(s): '+scene.id);
  for(const claim of scene.claims||[])for(const id of claim.evidenceIds){
    if(!observed.has(id))throw Error('Claim is missing supporting runtime assertion: '+claim.id);
  }
  return {
    status:'VERIFIED_ASSERTIONS',pass:true,sceneId:scene.id,
    features:[...new Set((scene.claims||[]).map(c=>c.featureId))].sort(),
    claims:(scene.claims||[]).map(c=>({id:c.id,featureId:c.featureId,evidenceIds:c.evidenceIds})),
    captureHash:artifact.hash,captureInputHash:artifact.inputHash,
    captureReportHash:fileHash(reportFile)
  };
}

export function inspectEvidence(root,config,state,{isCaptureStale}={}) {
  const coverage=verificationMode(config)==='claims'?(()=>{
    try{return {pass:true,...requireCoveragePlan(root,config)};}
    catch(e){return {pass:false,error:e.message};}
  })():{pass:null,mode:'legacy'};
  const scenes=config.scenes.map(scene=>{
    if(verificationMode(config)!=='claims')return {id:scene.id,status:'NOT_REQUIRED'};
    if(!(scene.featureIds||[]).length)return {id:scene.id,status:'NOT_APPLICABLE'};
    try{
      const result=verifySceneClaims(root,config,scene,state);
      // The core supplies its canonical staleParts check, including source
      // fingerprints, app URL and viewport. Without it inspection fails closed.
      if(typeof isCaptureStale!=='function'||isCaptureStale(scene))
        throw Error('Source/runtime capture freshness not established');
      const artifact=state.scenes?.[scene.id]?.artifacts?.capture;
      const file=artifact?path.join(sceneDir(root,scene.id),artifact.file):null;
      if(!file||!fs.existsSync(file)||fileHash(file)!==artifact.hash)
        throw Error('Capture video missing or modified');
      return {id:scene.id,status:result.status,features:result.features,claimIds:result.claims.map(c=>c.id)};
    }catch(e){return {id:scene.id,status:'UNVERIFIED',reason:e.message};}
  });
  const strict=verificationMode(config)==='claims';
  return {schemaVersion:1,mode:verificationMode(config),
    ready:strict&&coverage.pass===true&&scenes.every(s=>['VERIFIED_ASSERTIONS','NOT_APPLICABLE'].includes(s.status)),
    coverage,scenes,
    note:'Assertions prove specific observed UI/API conditions, not the truth of all narration or artistic quality.'};
}
