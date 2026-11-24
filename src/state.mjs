import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {editAssetNames} from './editing.mjs';
import {captureEvidencePassed} from './capture-assertions.mjs';
import {verificationMode,requireCoveragePlan,verifySceneClaims} from './evidence.mjs';
import {avpDir,readJson,writeJson,sha,fileHash,sceneDir} from './utils.mjs';
import {sourceFingerprint} from './inspect.mjs';
import {adapterFingerprint} from './adapters.mjs';
import {selectedVoiceFingerprint} from './voice-selection.mjs';
import {ExecutionError} from './execution-errors.mjs';
import {appRuntimeFingerprint} from './app-runtime.mjs';
import {qualityPolicy} from './quality-policy.mjs';
import {validateQualityScene,validateFinalAudit} from './production-quality.mjs';
import {requireSemanticReview,semanticPolicy} from './semantic-review.mjs';

const stamp=()=>new Date().toISOString();
const planPath=(root,stage)=>path.join(avpDir(root),'planning',stage==='coverage'?'feature-coverage.json':'storyboard.json');
function assertStoryboardMatchesConfig(root,config){
  const file=planPath(root,'storyboard');
  if(!fs.existsSync(file))throw Error('Storyboard missing; run avp plan');
  const actual=readJson(file).scenes;
  const expected=config.scenes.map(s=>({id:s.id,title:s.title,durationSec:s.durationSec,featureIds:s.featureIds||[],narration:s.narration,actions:s.capture.actions,...(s.claims!==undefined?{claims:s.claims}:{})}));
  if(sha(actual)!==sha(expected))throw Error('Storyboard does not match project.json. Update canonical project.json and rerun avp plan --force before approval.');
}

export function loadState(root){const file=path.join(avpDir(root),'run-state.json');return fs.existsSync(file)?readJson(file):{schemaVersion:1,createdAt:stamp(),reviews:{},scenes:{},budget:{ttsCalls:0,estimatedUsdReserved:0},history:[]};}
export function saveState(root,state){state.updatedAt=stamp();writeJson(path.join(avpDir(root),'run-state.json'),state);}
export function sceneState(state,id){return state.scenes[id]??(state.scenes[id]={artifacts:{},locked:false,approved:false});}

/** Local scene media assets contribute only to preview staleness; capture/voice remain reusable. */
function editAssetsFingerprint(scene,root){
  if(!scene.edit||!root)return undefined;
  return editAssetNames(scene.edit).map(name=>{
    const file=path.join(sceneDir(root,scene.id),'assets',name+'.mp4');
    if(!fs.existsSync(file))return {name,digest:'MISSING'};
    // Stream chunks without materializing large video files in memory.
    const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);
    try{let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));}
    finally{fs.closeSync(fd);}
    return {name,digest:hash.digest('hex')};
  });
}
/** Capture uses a content fingerprint, not file names or file sizes. Inputs include browser settings and app origin. */
export function inputHashes(scene,config,ss={},root){
  const artifacts=ss.artifacts||{};
  const selectionFingerprint=selectedVoiceFingerprint(root,config,scene),quality=qualityPolicy(config);
  return {
    capture:sha({schema:scene.capture?.adapter?3:2,capture:scene.capture,adapter:scene.capture?.adapter&&root?adapterFingerprint(root,config,scene):undefined,duration:scene.durationSec,appUrl:config.appUrl,appRuntime:appRuntimeFingerprint(root,config),viewport:{width:config.render?.width||1920,height:config.render?.height||1080,fps:config.render?.fps||30},source:root?sourceFingerprint(root,config):null,provider:'playwright-v1',...(quality?{actionMarkersVersion:1}:{})}),
    voice:sha({schema:2,narration:scene.narration,voice:config.voiceover,language:config.language?.narration,modelOverride:process.env.GEMINI_TTS_MODEL||null,selectedVoice:selectionFingerprint}),
    captions:sha({schema:3,narration:scene.narration,timing:scene.captionTiming??null,language:config.language?.subtitles,voiceEnabled:config.voiceover?.enabled!==false,voiceHash:config.voiceover?.enabled!==false?artifacts.voice?.hash:null,...(config.voiceover?.enabled===false?{silentDurationSec:scene.durationSec}:{}),...(quality?{qualityCaptionMaxChars:quality.maxCaptionChars}:{})}),
    preview:sha({schema:2,render:config.render,duration:scene.durationSec,style:config.style||{},edit:scene.edit,editAssets:editAssetsFingerprint(scene,root),captureHash:artifacts.capture?.hash,voiceHash:config.voiceover?.enabled!==false?artifacts.voice?.hash:null,captionHash:artifacts.captions?.hash,captionMetadataHash:artifacts.captions?.metadataHash,...(quality?{qualityPolicy:quality}:{})})
  };
}
export function staleParts(scene,config,ss,root){
  const expected=inputHashes(scene,config,ss,root);
  const check=name=>{
    const a=ss.artifacts?.[name];if(!a)return true;
    const f=path.join(sceneDir(root,scene.id),a.file);
    if(a.inputHash!==expected[name]||!fs.existsSync(f)||a.hash!==fileHash(f))return true;
    if(name==='captions'){
      const meta=path.join(sceneDir(root,scene.id),'captions.json');
      // Old legacy fixtures may have SRT only. A real captions.json must always be
      // hashed; otherwise Remotion could use edited timings not seen during QA.
      if(fs.existsSync(meta))return !a.metadataHash||fileHash(meta)!==a.metadataHash;
      return Boolean(a.metadataHash);
    }
    return false;
  };
  const capture=check('capture');
  const voice=config.voiceover?.enabled===false?false:check('voice');
  const captions=check('captions')||voice;
  const preview=check('preview')||capture||voice||captions;
  return {capture,voice,captions,preview};
}
export function invalidateOutput(state){delete state.output;delete state.reviews.final;}
export function recordArtifact(root,state,scene,name,file,inputHash){
  const ss=sceneState(state,scene.id);
  const rel=path.relative(sceneDir(root,scene.id),file);
  ss.artifacts[name]={file:rel,hash:fileHash(file),inputHash,builtAt:stamp()};
  ss.approved=false;delete ss.approvedPreviewHash;delete ss.approvedQaHash;
  delete ss.qa;
  if(name==='voice'&&ss.artifacts.captions)ss.artifacts.captions.inputHash='INVALIDATED';
  if(['capture','voice','captions'].includes(name)&&ss.artifacts.preview)ss.artifacts.preview.inputHash='INVALIDATED';
  invalidateOutput(state);
  saveState(root,state);
}
export function requireUnlocked(state,id){if(sceneState(state,id).locked)throw Error(`Scene ${id} is LOCKED. Human must explicitly run 'avp unlock --scene ${id}' to replace.`);}
export function validateSceneQa(root,config,scene,state){
  const ss=sceneState(state,scene.id),parts=staleParts(scene,config,ss,root);
  if(Object.values(parts).some(Boolean))throw Error(`Scene ${scene.id} has stale or missing media: ${Object.entries(parts).filter(([,v])=>v).map(([k])=>k).join(', ')}`);
  const p=path.join(sceneDir(root,scene.id),'qa-report.json');
  if(!fs.existsSync(p)||!ss.qa)throw Error(`Scene ${scene.id} lacks current QA evidence. Run avp qa --scene ${scene.id}`);
  const report=readJson(p),previewFile=path.join(sceneDir(root,scene.id),'preview.mp4');
  if(!report.pass||!report.checks||!Object.values(report.checks).every(Boolean))throw Error(`Scene ${scene.id} QA failed`);
  if(scene.capture.evidencePolicy?.requireAssertions===true){
    const evidenceFile=path.join(sceneDir(root,scene.id),'capture-report.json');
    if(!fs.existsSync(evidenceFile)||report.captureReportHash!==fileHash(evidenceFile)
      ||!captureEvidencePassed(readJson(evidenceFile),scene.capture.evidencePolicy))
      throw Error(`Scene ${scene.id} capture evidence is missing, invalid or stale`);
  }
  if(verificationMode(config)==='claims'&&(scene.featureIds||[]).length){
    const fresh=verifySceneClaims(root,config,scene,state);
    if(!report.claimEvidence||sha(report.claimEvidence)!==sha(fresh))
      throw Error(`Scene ${scene.id} claim-to-evidence QA is missing, invalid or stale`);
  }
  const expected=inputHashes(scene,config,ss,root).preview;
  if(report.previewHash!==fileHash(previewFile)||report.previewInputHash!==expected||ss.qa.previewHash!==report.previewHash||ss.qa.previewInputHash!==expected||ss.qa.reportHash!==fileHash(p))throw Error(`Scene ${scene.id} QA is stale or does not match current preview. Rerun avp qa`);
  validateQualityScene(root,config,scene,report);
  return report;
}
export function sceneApprovalValid(root,config,scene,state){
  const ss=sceneState(state,scene.id);
  if(!ss.approved||!ss.locked)throw Error(`Scene ${scene.id} awaits review approval`);
  const qa=validateSceneQa(root,config,scene,state);
  const semantic=requireSemanticReview(root,config,scene,qa);
  if(semantic&&ss.approvedSemanticHash!==semantic.receiptHash)throw Error('Scene semantic review changed since approval');
  if(ss.approvedPreviewHash!==ss.artifacts.preview.hash||ss.approvedQaHash!==ss.qa.reportHash)throw Error(`Scene ${scene.id} approval is stale`);
  return true;
}
export function finalInputHash(config,state){
  return sha({schema:2,configHash:sha(config),scenes:config.scenes.map(s=>({id:s.id,previewHash:sceneState(state,s.id).artifacts.preview?.hash,qaHash:sceneState(state,s.id).qa?.reportHash})),engine:config.render?.engine||'ffmpeg'});
}
export function validateFinalOutput(root,config,state){
  const file=path.join(avpDir(root),'output','final.mp4'),qa=path.join(avpDir(root),'output','final-qa.json');
  if(!fs.existsSync(file)||!fs.existsSync(qa)||!state.output)throw Error('Render and validate final video first');
  const report=readJson(qa);
  if(report.pass!==true||!Object.values(report.checks||{}).every(Boolean)||report.outputHash!==fileHash(file)||state.output.hash!==report.outputHash||state.output.qaHash!==fileHash(qa)||state.output.inputHash!==finalInputHash(config,state))throw Error('Final output or QA evidence is stale; render again');
  validateFinalAudit(root,config,report);
  requireCoveragePlan(root,config);
  for(const scene of config.scenes){const qa=validateSceneQa(root,config,scene,state);const semantic=requireSemanticReview(root,config,scene,qa);
    if(semantic&&report.semanticReceipts?.[scene.id]!==semantic.receiptHash)throw Error('Final output semantic review receipt changed');
    if(config.review?.mode==='review')sceneApprovalValid(root,config,scene,state);}
  return report;
}
export function approve(root,state,config,stage,id){
  if(stage==='scene'){
    if(!id)throw Error('Use --scene ID');
    const scene=config.scenes.find(s=>s.id===id);if(!scene)throw Error('Unknown scene');
    gate(state,config,'coverage',root);gate(state,config,'storyboard',root);
    const qa=validateSceneQa(root,config,scene,state),semantic=requireSemanticReview(root,config,scene,qa);
    const ss=sceneState(state,id);if(semantic)ss.approvedSemanticHash=semantic.receiptHash;ss.approved=true;ss.locked=true;ss.approvedAt=stamp();ss.approvedPreviewHash=ss.artifacts.preview.hash;ss.approvedQaHash=ss.qa.reportHash;
    invalidateOutput(state);
  }else if(stage==='coverage'||stage==='storyboard'){
    if(stage==='storyboard')gate(state,config,'coverage',root);
    if(stage==='storyboard')assertStoryboardMatchesConfig(root,config);
    if(stage==='coverage')requireCoveragePlan(root,config);
    const file=planPath(root,stage);if(!fs.existsSync(file))throw Error('Generate and review planning artifacts first');
    state.reviews[stage]={approvedAt:stamp(),configHash:sha(config),artifactHash:fileHash(file)};
    // A new planning decision invalidates the final render review even if the film still exists.
    invalidateOutput(state);
  }else if(stage==='final'){
    gate(state,config,'coverage',root);gate(state,config,'storyboard',root);
    const report=validateFinalOutput(root,config,state);
    state.reviews.final={approvedAt:stamp(),outputHash:report.outputHash,qaHash:state.output.qaHash,inputHash:state.output.inputHash};
  }else throw Error('stage must be coverage, storyboard, scene, or final');
  state.history.push({event:'approved',stage,scene:id||null,at:stamp()});saveState(root,state);
}
export function gate(state,config,stage,root){
  if(config.review?.mode!=='review'||config.review?.[stage==='coverage'?'featureCoverage':stage]===false)return;
  const record=state.reviews[stage];if(!record?.approvedAt)throw Error(`Review checkpoint '${stage}' is not approved. Run avp approve --stage ${stage}`);
  if(record.configHash!==sha(config))throw Error(`Review '${stage}' invalidated by project config changes; re-approve after review.`);
  if(!root)throw Error('Review gate requires project root for artifact verification');
  if(stage==='storyboard')assertStoryboardMatchesConfig(root,config);
  if(stage==='coverage')requireCoveragePlan(root,config);
  const file=planPath(root,stage);
  if(!fs.existsSync(file)||record.artifactHash!==fileHash(file))throw Error(`Review '${stage}' invalidated by planning artifact changes; re-approve after review.`);
}

/** Fail closed before any provider network request; counts reservations even when provider fails. */
export function reservePaidCall(root,state,config,session,estimatedUsd){
  const maxCalls=config.voiceover?.maxApiCallsPerRun;
  const limit=config.budget?.maxEstimatedUsd;
  if(!Number.isInteger(maxCalls)||maxCalls<1)throw new ExecutionError('PAID_BUDGET_BLOCKED','voiceover.maxApiCallsPerRun must be a positive integer');
  if(!Number.isFinite(limit)||limit<=0)throw new ExecutionError('PAID_BUDGET_BLOCKED','budget.maxEstimatedUsd must be positive before paid API calls');
  if(!Number.isFinite(estimatedUsd)||estimatedUsd<=0)throw new ExecutionError('PAID_BUDGET_BLOCKED','Set voiceover.estimatedUsdPerCall to a positive cost estimate (USD) before paid calls');
  if(!session||!Number.isInteger(session.calls))throw new ExecutionError('PAID_BUDGET_BLOCKED','Paid API run session missing');
  if(session.calls>=maxCalls)throw new ExecutionError('PAID_BUDGET_BLOCKED',`Paid API per-run call limit reached (${maxCalls})`);
  const budget=state.budget??(state.budget={ttsCalls:0,estimatedUsdReserved:0});
  if(budget.estimatedUsdReserved+estimatedUsd>limit+1e-9)throw new ExecutionError('PAID_BUDGET_BLOCKED',`Estimated paid API project budget exceeded (${limit} USD). No call made.`);
  session.calls++;
  budget.ttsCalls++;
  budget.estimatedUsdReserved=Math.round((budget.estimatedUsdReserved+estimatedUsd)*1000000)/1000000;
  state.history.push({event:'paid-api-reserved',provider:'gemini',estimatedUsd,at:stamp()});saveState(root,state);
  return {callsThisRun:session.calls,projectEstimatedUsdReserved:budget.estimatedUsdReserved};
}
