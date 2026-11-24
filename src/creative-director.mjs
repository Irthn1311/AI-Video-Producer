import fs from 'node:fs';
import path from 'node:path';
import {avpDir,readJson,writeJson,sha} from './utils.mjs';
import {sourceFingerprint} from './inspect.mjs';
import {analyzeProject} from './project-intelligence.mjs';

const record=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v)=>typeof v==='string'&&v.trim().length>0&&v.length<=2000;
const receiptPath=(root,hash)=>path.join(avpDir(root),'creative','approvals',hash+'.json');
const keys=(object,allowed,label)=>{
  if(!record(object)||Object.keys(object).some(k=>!allowed.includes(k)))throw Error('Invalid '+label+' fields');
};

// This module is a deterministic decision contract for an external agent,
// not an LLM, voice synthesis provider, or automatic storyboard generator.
export function validateDirector(config){
  const d=config.creative?.director;
  if(d===undefined)return null;
  keys(d,['mode','visualStyle','tone','brand','pronunciation','voiceDirection','targetDurationSec','maxDurationSec','sceneDirections'],'creative.director');
  if(!['interactive','autonomous'].includes(d.mode))throw Error('creative.director.mode must be interactive or autonomous');
  for(const k of ['visualStyle','tone','brand','pronunciation','voiceDirection']){
    if(d[k]!==undefined&&!text(d[k]))throw Error('Invalid creative.director.'+k);
  }
  for(const k of ['audience','goal']){
    if(config.creative[k]!==undefined&&!text(config.creative[k]))throw Error('Invalid creative.'+k);
  }
  for(const k of ['targetDurationSec','maxDurationSec']){
    if(d[k]!==undefined&&(!Number.isFinite(d[k])||d[k]<1||d[k]>86400))throw Error('Invalid creative.director.'+k);
  }
  if(d.targetDurationSec!==undefined&&d.maxDurationSec!==undefined&&d.targetDurationSec>d.maxDurationSec)throw Error('Target duration exceeds maximum');
  if(d.sceneDirections!==undefined){
    if(!record(d.sceneDirections))throw Error('sceneDirections must be keyed by scene ID');
    for(const [id,dir] of Object.entries(d.sceneDirections)){
      if(!config.scenes.some(s=>s.id===id))throw Error('Unknown creative scene: '+id);
      keys(dir,['framing','pacing','voiceDirection','transition'],'sceneDirections.'+id);
      for(const [k,v] of Object.entries(dir))if(!text(v))throw Error('Invalid sceneDirections.'+id+'.'+k);
    }
  }
  return d;
}

export function makeCreativeBrief(root,config,{analysis,sourceHash}={}){
  const d=validateDirector(config);
  if(!d)return null;
  const a=analysis||analyzeProject(root,config);
  const signals=(a.capabilitySignals||[]).map(s=>s.id).sort();
  const scenes=config.scenes.map(s=>({
    id:s.id,title:s.title,featureIds:s.featureIds||[],durationSec:s.durationSec,
    narration:s.narration,claims:s.claims||[],direction:Object.hasOwn(d.sceneDirections||{},s.id)?d.sceneDirections[s.id]:{},
    actualEdit:s.edit||null,
    // Editorial direction is guidance, not an executable change to the scene.
    status:'EXISTING_SCENE_CANDIDATE'
  }));
  const planned=scenes.reduce((sum,s)=>sum+s.durationSec,0);
  const width=config.render?.width||1920,height=config.render?.height||1080;
  const recommendations=[
    {id:'story',reason:'Lead with a user problem, show an observed workflow/result, then conclude with value; do not invent features.'},
    {id:'voice',reason:'Review a short audition on actual narration and pronunciation before paid full production; no API calls made.'},
    {id:'framing',reason:width<height?'Vertical output: verify UI readability and avoid cropping key controls.':'Landscape output: retain context, use focus only when it clarifies a demonstrated interaction.'}
  ];
  if(signals.includes('canvas-interaction'))recommendations.push({id:'canvas',reason:'Source suggests canvas/pointer interaction. Rehearse the real gesture and retain its visible result; signal is not runtime proof.'});
  if(signals.includes('realtime-events'))recommendations.push({id:'realtime',reason:'Source suggests realtime state. Show observable before/after state; verify synchronization before narrating it.'});
  if(signals.includes('charts-dashboard'))recommendations.push({id:'dashboard',reason:'Source suggests charts/dashboard. Prefer a readable data-focused shot with verified values.'});
  const decisions=[];
  if(!config.creative.audience)decisions.push({id:'audience',question:'Who should understand the demo: end users, technical reviewers or stakeholders?'});
  if(!config.creative.goal)decisions.push({id:'goal',question:'What single outcome should the viewer understand?'});
  if(!d.visualStyle)decisions.push({id:'visualStyle',question:'What visual style best suits this product and audience?'});
  if(config.voiceover?.enabled!==false&&!d.voiceDirection)decisions.push({id:'voiceDirection',question:'What voice, accent, pronunciation and pacing should the audition use?'});
  return {schemaVersion:1,configHash:sha(config),sourceFingerprint:sourceHash||sourceFingerprint(root,config),
    title:config.title,mode:d.mode,productionReviewMode:config.review.mode,
    audience:config.creative.audience||null,goal:config.creative.goal||null,
    visualStyle:d.visualStyle||null,tone:d.tone||null,brand:d.brand||config.title,
    pronunciation:d.pronunciation||null,voiceDirection:d.voiceDirection||null,
    languages:config.language,frame:{width,height,fps:config.render?.fps||30},
    duration:{plannedSec:planned,targetSec:d.targetDurationSec??planned,maxSec:d.maxDurationSec??null},
    voice:config.voiceover,sourceSignals:signals,recommendations,decisions,scenes,
    scope:'EDITORIAL_GUIDANCE_NOT_RUNTIME_EVIDENCE_OR_APPLIED_MEDIA_SETTINGS',
    qualityPolicy:'All existing evidence, budget, permissions, rehearsal and QA gates remain enforced'};
}

export function creativeStatus(root,config,options={}){
  const brief=makeCreativeBrief(root,config,options);
  if(!brief)return {status:'LEGACY_NOT_ENFORCED'};
  const hash=sha(brief);
  const issues=[];
  if(brief.duration.maxSec!==null&&brief.duration.plannedSec>brief.duration.maxSec)
    issues.push({code:'CREATIVE_DURATION_EXCEEDED',message:'Planned scenes exceed creative maximum duration',action:'Revise scene durations before preparing Build'});
  // Critical intent is not guessed in either mode. An agent can explicitly
  // choose and save it in autonomous mode without impersonating an approval.
  if(!brief.audience||!brief.goal)issues.push({code:'CREATIVE_INTENT_MISSING',message:'Audience and goal must be recorded',action:'Set creative.audience and creative.goal from user/authorized agent decision'});
  const file=receiptPath(root,hash);
  let receipt=null;
  if(fs.existsSync(file)){
    try{const value=readJson(file);if(value.schemaVersion===1&&value.briefHash===hash&&sha(value.brief)===hash&&value.decision==='EXPLICIT_REVIEW'&&typeof value.approvedAt==='string')receipt=value;}
    catch{/* Invalid receipts fail closed. */}
  }
  const status=issues.length?'BLOCKED':brief.mode==='interactive'&&!receipt?'REVIEW_REQUIRED':brief.mode==='interactive'?'APPROVED':'AUTONOMOUS_POLICY';
  return {status,briefHash:hash,brief,issues,approval:receipt?{approvedAt:receipt.approvedAt,briefHash:hash}:null};
}

export function approveCreative(root,config,{confirm=false,expectedHash}={}){
  if(confirm!==true)throw Error('Review creative recommend output; use creative approve --hash HASH --confirm');
  const current=creativeStatus(root,config);
  if(current.status==='LEGACY_NOT_ENFORCED'||current.brief.mode!=='interactive')throw Error('Interactive creative policy required for approval');
  if(current.issues.length)throw Error(current.issues.map(i=>i.code).join(', '));
  if(expectedHash!==current.briefHash)throw Error('Creative brief hash changed or missing; review current recommendation');
  const file=receiptPath(root,current.briefHash);
  if(!current.approval)writeJson(file,{schemaVersion:1,briefHash:current.briefHash,brief:current.brief,decision:'EXPLICIT_REVIEW',approvedAt:new Date().toISOString()});
  return creativeStatus(root,config);
}
