import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {avpDir,readJson,writeJson,sha,fileHash,getProject} from './utils.mjs';
import {sourceFingerprint} from './inspect.mjs';
import {inspectProject} from './project-intelligence.mjs';
import {recommendSkills} from './skill-discovery.mjs';
import {checkBuild,prepareBuild,requiresBuild,buildDir} from './build.mjs';
import {loadState} from './state.mjs';
import {plan} from './planning.mjs';
import {appStatus,managedApp,trialApp} from './app-runtime.mjs';
import {projectAdapterSnapshot,trialAdapter} from './adapters.mjs';
import {rehearseScene} from './rehearsal.mjs';
import {productionNext,productionStep} from './production-executor.mjs';
import {failureDetails} from './execution-errors.mjs';

const dir=root=>path.join(avpDir(root),'workflow');
const journalFile=(root,revision)=>path.join(dir(root),revision+'.json');
const now=()=>new Date().toISOString();
const reportFile=(root,name)=>path.join(dir(root),name+'.json');
const engine=()=>fileHash(new URL(import.meta.url));
const manifest=root=>path.join(buildDir(root),'production-plan.json');
const local=(kind,stage,action,extra={})=>({status:'NEXT',kind,stage,owner:'BUNDLED_EXECUTOR',action,...extra});
const ask=(kind,stage,action,extra={})=>({status:'REVIEW_REQUIRED',kind,stage,owner:'OPERATOR',action,...extra});
const agent=(kind,stage,action,extra={})=>({status:'AGENT_REQUIRED',kind,stage,owner:'AGENT',action,...extra});
const block=(kind,stage,action,extra={})=>({status:'BLOCKED',kind,stage,owner:'AGENT',action,...extra});
function cached(root,name,key){
  try{const d=readJson(reportFile(root,name));return d.schemaVersion===1&&d.key===key&&sha(d.value)===d.digest?d.value:null;}catch{return null;}
}
function cache(root,name,key,value){writeJson(reportFile(root,name),{schemaVersion:1,key,digest:sha(value),value});}
function readJournal(root,revision){
  const f=journalFile(root,revision);
  if(!fs.existsSync(f))return null;
  const j=readJson(f);if(j.schemaVersion!==1||j.revision!==revision||!Array.isArray(j.events))throw Error('Invalid workflow journal');
  return j;
}
const policy={maxBuildSteps:100,maxAttemptsPerTask:3,maxObservedBuildMs:600000};
function priority(s){
  // Prioritize risk, not a claim of verified complexity.
  return (s.capture?.adapter?100:0)+(s.capture?.actions||[]).reduce((n,a)=>n+(['clickExpectResponse','pointerPath'].includes(a.type)?10:['fill','click'].includes(a.type)?3:0),0);
}
function sceneForIssue(config,issue){
  return config.scenes.find(s=>issue.message.startsWith(s.id+' ')||issue.message.startsWith(s.id+':'));
}
function decision(root,config,revision,source,analysisKey,skillsKey){
  if(!requiresBuild(root,config))return block('enable-build','intake','Enable the two-phase Build policy; workflow never dispatches legacy production');
  const state=loadState(root),report=checkBuild(root,config,state);
  if(report.ready){
    const p=productionNext(root,config);
    if(p.pending)return {...p,status:'RECOVERY_REQUIRED',kind:'production',stage:'production',owner:'OPERATOR',action:'Inspect production diagnose, then explicitly reconcile/retry through production step'};
    return {...p,kind:'production',operation:p.kind||null,stage:'production',owner:p.status==='NEXT'?'BUNDLED_EXECUTOR':p.status==='REVIEW_REQUIRED'?'OPERATOR':'AGENT'};
  }
  const analysis=cached(root,'analysis',analysisKey);
  if(!analysis)return local('analyze','intake','Inspect bounded repository signals; no code execution');
  const skills=cached(root,'skills',skillsKey);
  if(!skills)return local('skills','capabilityMatching','Match local capabilities; no external installation or search');
  const app=appStatus(root,config);
  if(managedApp(config)&&app.status!=='TRIAL_PASS'){
    if(app.status==='INVALID')return agent('runtime-design','environment','Inspect launch candidates and fix managed runtime manifest');
    if(app.status==='REVIEW_REQUIRED')return ask('runtime-review','environment','Review exact entrypoint and source, then avp app approve --hash HASH --confirm',{manifestHash:app.manifestHash});
    return local('runtime-trial','environment','Launch reviewed disposable app and verify readiness/cleanup',{authorization:['allow-launch']});
  }
  const issues=report.problems,review=report.reviewRequired;
  const has=(...codes)=>issues.some(x=>codes.includes(x.code));
  if(has('CREATIVE_INTENT_MISSING','CREATIVE_DURATION_EXCEEDED'))return agent('creative-intent','creative','Resolve missing goal/audience or duration with authorized Agent/user decision; do not invent intent');
  if(config.creative?.director&&!config.creative?.storyboard)
    return agent('author-storyboard','storyboard','Use storyboard context; author source-linked scenes and exact claims, then check/apply reviewed proposal');
  if(has('STORYBOARD_POLICY_REQUIRED','STORYBOARD_PROVENANCE_STALE','STORYBOARD_DEPENDENCY_UNSUPPORTED','VISUAL_DESIGN_INVALID'))
    return agent('revise-storyboard','storyboard','Resolve source-linked storyboard, dependencies or executable visual direction; check/apply proposal');
  const adapters=projectAdapterSnapshot(root,config);
  for(const s of [...config.scenes].sort((a,b)=>priority(b)-priority(a))){
    const x=adapters.find(a=>a.sceneId===s.id);
    if(!x)continue;
    if(x.status==='INVALID'||x.unprovenCapabilities?.length)return agent('adapter-design','capabilityMatching','Inspect/author a bounded project adapter and prove required behavior',{sceneId:s.id});
    if(x.status==='REVIEW_REQUIRED')return ask('adapter-review','capabilityMatching','Review current local adapter, then avp adapters approve --scene '+s.id+' --confirm',{sceneId:s.id,manifestHash:x.manifestHash});
    if(x.status==='TRIAL_REQUIRED')return local('adapter-trial','capabilityMatching','Trial reviewed adapter with actual browser evidence',{sceneId:s.id,authorization:managedApp(config)?['allow-actions','allow-launch']:['allow-actions']});
  }
  const gaps=skills.unresolved.filter(x=>x.required&&!adapters.some(a=>a.status==='TRIAL_PASS'&&a.verifiedCapabilities?.includes(x.id)));
  if(gaps.length)return agent('capability-research','capabilityMatching','Research only unresolved required capabilities; optional skills search --online requires separate authorization. Do not install/execute discovered repositories.',{capabilities:gaps.map(x=>x.id)});
  if(has('BUILD_TOOL_MISSING','BUILD_UNKNOWN_ACTION','BUILD_ADAPTER_CLAIM_MISMATCH','BUILD_ADAPTER_INVALID','BUILD_ADAPTER_CAPABILITY_UNPROVEN','BUILD_ADAPTER_UNVERIFIED'))
    return agent('technical-blocker','capabilityMatching','Resolve required tooling, action or adapter evidence before rehearsal',{issues:issues.filter(x=>/TOOL_MISSING|UNKNOWN_ACTION|ADAPTER/.test(x.code)).map(x=>x.code)});
  if(has('BUILD_STORYBOARD_STALE','BUILD_COVERAGE_MISMATCH'))
    return agent('planning-revision','storyboard','Review canonical config and planning artifacts; explicitly regenerate with avp plan --force only after review');
  if(has('BUILD_NOT_PREPARED','BUILD_PLANNING_MISSING'))return local('prepare','planning','Create missing planning drafts without overwriting existing files and compile canonical Build');
  if(has('BUILD_CONFIG_DRIFT','BUILD_SOURCE_DRIFT','BUILD_ARTIFACT_MISSING','BUILD_ARTIFACT_STALE','BUILD_NONCANONICAL_ARTIFACT','BUILD_MANIFEST_MISMATCH','BUILD_PLAN_DRIFT','BUILD_TOOLCHAIN_DRIFT','BUILD_STORYBOARD_DRIFT','BUILD_PLAN_INPUT_DRIFT'))
    return local('recompile','planning','Recompile Build artifacts from canonical config and existing reviewed planning; do not overwrite planning drafts');
  const rehearsal=issues.filter(x=>['BUILD_REHEARSAL_MISSING','BUILD_REHEARSAL_STALE','BUILD_REHEARSAL_UNVERIFIED'].includes(x.code))
    .map(x=>({issue:x,scene:sceneForIssue(config,x)})).filter(x=>x.scene).sort((a,b)=>priority(b.scene)-priority(a.scene));
  // Failed or stale rehearsal is not automatically repeated; require diagnosis.
  if(rehearsal.length){
    const {issue,scene}=rehearsal[0];
    if(issue.code!=='BUILD_REHEARSAL_MISSING')return agent('rehearsal-review','rehearsal','Inspect current rehearsal proof and re-author/rehearse affected scene explicitly',{sceneId:scene.id,reason:issue.code});
    return local('rehearse','rehearsal','Run highest-risk pending scene rehearsal; not production evidence',{sceneId:scene.id,authorization:managedApp(config)?['allow-actions','allow-launch']:['allow-actions']});
  }
  if(has('TIMING_VOICE_SELECTION_MISSING'))return ask('voice-selection','timing','Resolve actual voice settings; audition/import exact narration and listen/select before Production',{issues:issues.filter(x=>x.code==='TIMING_VOICE_SELECTION_MISSING').map(x=>sceneForIssue(config,x)?.id).filter(Boolean)});
  if(has('TIMING_ACTION_OVERFLOW','TIMING_VOICE_OVERFLOW','TIMING_SILENCE_OVERFLOW','TIMING_REHEARSAL_MISSING'))
    return agent('timing-repair','timing','Review measured timing; revise narration, scene length or recipe; never hide failed evidence');
  if(issues.length)return block('unresolved-build','readiness','Resolve remaining Build blockers without bypassing gates',{issues:issues.map(x=>x.code)});
  if(review.some(x=>x.code==='BUILD_CREATIVE_REVIEW_PENDING'))return ask('creative-review','creative','Inspect creative recommend and approve exact current brief',{briefHash:report.creative.briefHash});
  if(review.some(x=>x.code==='BUILD_REVIEW_PENDING'))return ask('planning-review','planning','Review and explicitly approve coverage and storyboard using existing commands');
  if(review.some(x=>x.code==='BUILD_FREEZE_REQUIRED'))return ask('freeze','readiness','Review compiled production plan and explicitly run avp build freeze --confirm',{planHash:fs.existsSync(manifest(root))?fileHash(manifest(root)):null});
  return block('unresolved-build','readiness','Inspect Build report');
}
function observe(root,config){
  const source=sourceFingerprint(root,config),revision=sha({schemaVersion:1,configHash:sha(config),source,engine:engine()});
  const analysisKey=sha({source,sourcePath:config.sourcePath,engine:engine()});
  const skillsKey=sha({revision,analysisKey});
  const d=decision(root,config,revision,source,analysisKey,skillsKey),j=readJournal(root,revision);
  const count=j?.events.filter(e=>e.status==='RUNNING').length||0;
  const elapsedMs=j?.events.filter(e=>['EXECUTED','FAILED'].includes(e.status)).reduce((n,e)=>n+(e.elapsedMs||0),0)||0;
  const observed={buildSteps:count,observedBuildMs:elapsedMs,maxBuildSteps:policy.maxBuildSteps,maxObservedBuildMs:policy.maxObservedBuildMs};
  const last=j?.events.at(-1);
  let next=d;
  if(last?.status==='RUNNING')next=block('interrupted-build',last.stage,'Inspect interrupted step and its proof; use existing explicit CLI repair. Do not automatically replay app actions.');
  else if(d.kind!=='production'&&d.status==='NEXT'&&(count>=policy.maxBuildSteps||elapsedMs>=policy.maxObservedBuildMs))
    next=block('build-budget','readiness','Observed Build step/time budget exhausted; inspect and explicitly revise the plan');
  else if(d.kind!=='production'&&d.status==='NEXT'&&j?.events.filter(e=>e.status==='RUNNING'&&e.key===d.kind+':'+(d.sceneId||'')).length>=policy.maxAttemptsPerTask)
    next=block('build-retry-limit',d.stage,'Task attempt cap reached; diagnose and repair rather than repeat');
  else if(d.kind!=='production'&&last?.status==='FAILED'&&last.key===d.kind+':'+(d.sceneId||''))
    next=block('build-step-failed',d.stage,'Inspect local failure and use explicit task-specific repair; workflow will not repeat failed work automatically',{failure:last.failure});
  const taskHash=sha({revision,decision:next});
  return {...next,revision,taskHash,sourceFingerprint:source,observed,scope:'STATE_DERIVED_GUIDANCE_NOT_LLM_OR_SEMANTIC_VERIFICATION',analysisKey,skillsKey};
}
export function workflowNext(root,config){return observe(root,config);}
export async function workflowStep(root,opts={}){
  fs.mkdirSync(dir(root),{recursive:true});
  const lock=path.join(dir(root),'step.lock');let fd;
  try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Error('Workflow step locked; inspect interrupted owner before manual recovery');throw e;}
  try{
    fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:now()}));fs.closeSync(fd);fd=null;
    const {config}=getProject(root),next=observe(root,config);
    if(opts.hash!==next.taskHash)return {...next,status:'BLOCKED',code:'TASK_HASH_CHANGED',action:'Read workflow next and authorize the exact current task hash'};
    if(next.status!=='NEXT')return next;
    if(next.kind==='production')return productionStep(root,opts);
    const missing=(next.authorization||[]).filter(x=>x==='allow-actions'?!opts.allowActions:x==='allow-launch'?!opts.allowLaunch:true);
    if(missing.length)return {...next,status:'AUTHORIZATION_REQUIRED',missing};
    const key=next.kind+':'+(next.sceneId||''),file=journalFile(root,next.revision);
    const j=readJournal(root,next.revision)||{schemaVersion:1,runId:randomUUID(),revision:next.revision,events:[]};
    const event={key,kind:next.kind,stage:next.stage,sceneId:next.sceneId||null};
    j.events.push({...event,status:'RUNNING',at:now()});writeJson(file,j);const start=Date.now();
    try{
      switch(next.kind){
        case 'analyze':cache(root,'analysis',next.analysisKey,inspectProject(root,config));break;
        case 'skills':cache(root,'skills',next.skillsKey,recommendSkills(root,config));break;
        case 'prepare':plan(root,config);prepareBuild(root,config,{force:true});break;
        case 'recompile':prepareBuild(root,config,{force:true});break;
        case 'runtime-trial':await trialApp(root,config,opts);break;
        case 'adapter-trial':await trialAdapter(root,config,config.scenes.find(s=>s.id===next.sceneId),opts);break;
        case 'rehearse':await rehearseScene(root,config,config.scenes.find(s=>s.id===next.sceneId),opts);break;
        default:throw Error('Unsupported workflow task');
      }
      const current=getProject(root).config;
      if(sha(current)!==sha(config)||sourceFingerprint(root,current)!==next.sourceFingerprint)throw Error('Inputs changed during Build task');
      j.events.push({...event,status:'EXECUTED',at:now(),elapsedMs:Date.now()-start});writeJson(file,j);
      return {status:'EXECUTED',runId:j.runId,step:event,next:observe(root,current)};
    }catch(e){
      const failure=failureDetails(e,next.kind);
      j.events.push({...event,status:'FAILED',at:now(),elapsedMs:Date.now()-start,failure});writeJson(file,j);
      return {status:'BLOCKED',code:failure.code,runId:j.runId,step:event,failure,action:'Inspect task reports and explicitly repair before proceeding'};
    }
  }finally{if(fd!==null)fs.closeSync(fd);fs.rmSync(lock,{force:true});}
}
