import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {avpDir,readJson,writeJson,sha,fileHash,getProject} from './utils.mjs';
import {loadState,sceneState,staleParts,validateSceneQa,sceneApprovalValid,validateFinalOutput} from './state.mjs';
import {checkBuild,requiresBuild,buildDir} from './build.mjs';
import {capture,voice,captions,preview,qaScene,render} from './media.mjs';
import {timingEnabled} from './voice-selection.mjs';
import {ExecutionError,failureDetails,interruptedFailure} from './execution-errors.mjs';
import {verificationMode,verifySceneClaims} from './evidence.mjs';
import {captureEvidencePassed} from './capture-assertions.mjs';
import {managedApp} from './app-runtime.mjs';
import {artifactInventory} from './telemetry.mjs';

const dir=root=>path.join(avpDir(root),'production');
const mutex=root=>path.join(dir(root),'executor.lock');
const now=()=>new Date().toISOString();
const journalFile=(root,revision)=>path.join(dir(root),revision+'.json');
const step=(kind,sceneId,capability,authorization=null)=>({status:'NEXT',kind,sceneId,capability,authorization});
const stop=(status,code,action,extra={})=>({status,code,action,...extra});
function finalValid(root,config,state){
  try{return validateFinalOutput(root,config,state);}catch{return null;}
}
function finalApproved(state,report){
  const review=state.reviews.final;
  return !!review?.approvedAt&&review.outputHash===report.outputHash&&review.qaHash===state.output?.qaHash&&review.inputHash===state.output?.inputHash;
}
function revisionFor(root,config,state){
  if(!requiresBuild(root,config))return {blocked:stop('BLOCKED','FROZEN_BUILD_REQUIRED','Enable Build and freeze a verified plan; legacy run remains separate')};
  const report=checkBuild(root,config,state);
  if(!report.ready)return {blocked:stop(report.status,'BUILD_NOT_READY','Resolve Build blockers/reviews before Production',{problems:report.problems,reviewRequired:report.reviewRequired})};
  const lock=path.join(buildDir(root),'build-lock.json'),plan=path.join(buildDir(root),'production-plan.json');
  const data=readJson(lock);
  if(data.planHash!==fileHash(plan))return {blocked:stop('BLOCKED','PLAN_HASH_MISMATCH','Recheck and freeze the canonical Build')};
  return {revision:fileHash(lock),planHash:data.planHash};
}
function nextMedia(root,config,state){
  for(const s of config.scenes){
    const ss=sceneState(state,s.id),stale=staleParts(s,config,ss,root);
    if(ss.locked){
      try{sceneApprovalValid(root,config,s,state);}
      catch{return stop('BLOCKED','LOCKED_SCENE_INVALID','Inspect and explicitly unlock/repair the stale scene',{sceneId:s.id});}
      continue;
    }
    if(stale.capture)return step('capture',s.id,'playwright-runtime','allow-actions');
    if(s.capture.evidencePolicy?.requireAssertions){
      try{
        const artifact=ss.artifacts.capture,proof=readJson(path.join(avpDir(root),'scenes',s.id,'capture-report.json'));
        if(proof.scene!==s.id||proof.captureHash!==artifact.hash||proof.captureInputHash!==artifact.inputHash||!captureEvidencePassed(proof,s.capture.evidencePolicy))throw Error('Invalid proof');
        if(verificationMode(config)==='claims')verifySceneClaims(root,config,s,state);
      }catch{return stop('BLOCKED','CAPTURE_EVIDENCE_INVALID','Repair current capture and matching evidence before continuing',{sceneId:s.id});}
    }
    if(stale.voice)return step('voice',s.id,timingEnabled(config)?'selected-local-audio':'gemini-tts',timingEnabled(config)?null:'allow-paid-api');
    if(stale.captions)return step('captions',s.id,'bundled-caption-timing');
    if(stale.preview)return step('preview',s.id,s.edit?'remotion-render':'ffmpeg-render');
    if(!ss.qa)return step('qa',s.id,'ffprobe-qa');
    try{validateSceneQa(root,config,s,state);}
    catch{return stop('BLOCKED','SCENE_QA_INVALID','Inspect current QA/evidence and repair the affected inputs; do not repeat blindly',{sceneId:s.id});}
    // Match the actual render gate: review mode requires approved scenes,
    // even if the older eachScene flag is false.
    if(config.review.mode==='review')return stop('REVIEW_REQUIRED','SCENE_REVIEW','Inspect preview, claims and QA; run avp approve --stage scene --scene '+s.id,{sceneId:s.id});
  }
  const report=finalValid(root,config,state);
  if(!report)return step('render',null,config.render?.engine==='remotion'?'remotion-render':'ffmpeg-render');
  if(config.review.mode==='review'&&config.review.finalVideo!==false&&!finalApproved(state,report))
    return stop('REVIEW_REQUIRED','FINAL_REVIEW','Inspect final output and run avp approve --stage final');
  return stop('COMPLETE','CURRENT_OUTPUT_VALID','No Production work remains for this revision',{outputHash:report.outputHash});
}
function readJournal(root,rev){
  const file=journalFile(root,rev);
  if(!fs.existsSync(file))return null;
  const j=readJson(file);
  if(j.schemaVersion!==1||j.revision!==rev||!Array.isArray(j.events)||typeof j.runId!=='string')throw Error('Invalid production journal');
  return j;
}
function pendingEvent(j){const e=j?.events.at(-1);return e&&['RUNNING','FAILED'].includes(e.status)?e:null;}
function pendingFailure(pending){return pending?.status==='RUNNING'?interruptedFailure():pending?.failure||failureDetails(new Error('Unclassified prior failure'),pending?.kind);}
function retryLimit(config){
  const n=config.budget?.maxRetryPerScene??0;
  if(!Number.isInteger(n)||n<0||n>20)throw Error('budget.maxRetryPerScene must be 0–20 for production executor');
  return n;
}
function keyOf(next){return (next.sceneId||'final')+':'+next.kind;}
function snapshot(root,config,state){
  const build=revisionFor(root,config,state);
  if(build.blocked)return build.blocked;
  const j=readJournal(root,build.revision);
  const next=nextMedia(root,config,state);
  const pending=pendingEvent(j);
  return {...next,...build,runId:j?.runId||null,
    pending:pending?{status:pending.status,kind:pending.kind,sceneId:pending.sceneId,attempt:pending.attempt,code:pending.code||null,failure:pendingFailure(pending)}:null,
    observed:{completedSteps:j?.events.filter(e=>e.status==='EXECUTED').length||0,
      failedSteps:j?.events.filter(e=>e.status==='FAILED').length||0,
      ttsCalls:state.budget?.ttsCalls||0,estimatedUsdReserved:state.budget?.estimatedUsdReserved||0},
    scope:'FROZEN_BUILD_EXECUTION_NOT_AUTONOMOUS_SEMANTIC_REVIEW'};
}
export function productionNext(root,config){return snapshot(root,config,loadState(root));}
export function productionDiagnose(root,config){
  const current=productionNext(root,config);
  const pending=current.pending;
  return {status:pending?'RECOVERY_REQUIRED':current.status,revision:current.revision||null,runId:current.runId||null,
    sceneId:pending?.sceneId||current.sceneId||null,step:pending?.kind||current.kind||null,
    failure:pending?.failure||null,blocker:current.code||null,action:pending?.failure?.action||current.action||null,
    observed:current.observed||null,scope:'LOCAL_DIAGNOSIS_NOT_AUTOMATED_REPAIR'};
}
function acquire(root){
  fs.mkdirSync(dir(root),{recursive:true});
  const file=mutex(root),token=randomUUID();
  let fd;
  try{fd=fs.openSync(file,'wx');}
  catch(e){if(e.code==='EEXIST')throw Error('Production executor locked; inspect owner, or recover a dead local process explicitly');throw e;}
  try{fs.writeFileSync(fd,JSON.stringify({schemaVersion:1,token,pid:process.pid,host:os.hostname(),startedAt:now()}));}
  finally{fs.closeSync(fd);}
  return ()=>{try{if(readJson(file).token===token)fs.unlinkSync(file);}catch{/* Never remove a replacement lock. */}};
}
export function recoverProduction(root,{confirm=false}={}){
  if(confirm!==true)throw Error('Inspect the owner, then use production recover --confirm only after the executor has stopped');
  const file=mutex(root),owner=readJson(file);
  if(owner.host!==os.hostname()||!Number.isInteger(owner.pid)||owner.pid<1)throw Error('Cannot prove owner is a dead local process');
  try{process.kill(owner.pid,0);throw Error('Executor PID is still alive');}
  catch(e){if(e.code!=='ESRCH')throw e;}
  if(readJson(file).token!==owner.token)throw Error('Executor lock changed during recovery');
  fs.unlinkSync(file);
  return {status:'LOCK_RECOVERED',note:'Interrupted steps remain journaled. Recheck app state and explicitly authorize retry or repair.'};
}
async function dispatch(root,config,state,next,opts){
  const s=config.scenes.find(x=>x.id===next.sceneId);
  switch(next.kind){
    case 'capture':return capture(root,config,s,state,{allowLaunch:opts.allowLaunch,allowActions:opts.allowActions});
    case 'voice':return voice(root,config,s,state,{allowPaidApi:opts.allowPaidApi,budgetSession:{calls:0}});
    case 'captions':return captions(root,config,s,state);
    case 'preview':return preview(root,config,s,state);
    case 'qa':{const q=qaScene(root,config,s,state);if(q.pass!==true)throw new ExecutionError('SCENE_QA_FAILED','Technical scene QA failed',{failedChecks:Object.keys(q.checks||{}).filter(k=>!q.checks[k])});return q;}
    case 'render':{const q=await render(root,config,state);if(q.pass!==true)throw new ExecutionError('FINAL_QA_FAILED','Final technical QA failed');return q;}
    default:throw Error('Unknown execution step');
  }
}
export async function productionStep(root,opts={}){
  const release=acquire(root);
  try{
    const {config}=getProject(root),state=loadState(root),next=snapshot(root,config,state);
    if(!next.revision)return next;
    let j=readJournal(root,next.revision);
    const pending=pendingEvent(j);
    if(pending){
      const failure=pendingFailure(pending);
      if(!opts.retryFailed)return {...next,status:'BLOCKED',code:'EXPLICIT_RECOVERY_REQUIRED',failure,action:failure.action};
      if(!failure.retrySameRevision)return {...next,status:'BLOCKED',code:'RECOVERY_REQUIRES_REPAIR',failure,action:failure.action};
      if(pending.status==='RUNNING'&&!opts.confirmReset)return {...next,status:'BLOCKED',code:'INTERRUPTED_STATE_REVIEW_REQUIRED',failure,action:'Inspect artifacts and app state; use --confirm-reset only after safe reconciliation/reset'};
      if(pending.kind==='capture'&&!opts.confirmReset)return {...next,status:'BLOCKED',code:'CAPTURE_RESET_REQUIRED',failure,action:'Inspect and safely reset the isolated app before retrying with --confirm-reset'};
      // If a step completed its artifact write before interruption, do not
      // automatically replay it; re-evaluate the next step from actual state.
      if(next.status!=='NEXT'||keyOf(next)!==pending.key){
        j.events.push({status:'RECONCILED',kind:pending.kind,sceneId:pending.sceneId,key:pending.key,at:now(),
          note:'Explicit operator reconciliation; not an assertion of successful execution'});
        writeJson(journalFile(root,next.revision),j);
        return {...next,status:'RECONCILED',action:'Inspect current status; invoke another step explicitly'};
      }
    }
    if(next.status!=='NEXT')return next;
    if(next.authorization==='allow-actions'&&!opts.allowActions)return {...next,status:'BLOCKED',code:'ACTION_AUTHORIZATION_REQUIRED',action:'Authorize isolated test app capture using --allow-actions'};
    if(next.kind==='capture'&&managedApp(config)&&!opts.allowLaunch)return {...next,status:'BLOCKED',code:'APP_LAUNCH_AUTHORIZATION_REQUIRED',action:'Review managed runtime and authorize --allow-launch'};
    if(next.authorization==='allow-paid-api'&&!opts.allowPaidApi)return {...next,status:'BLOCKED',code:'PAID_AUTHORIZATION_REQUIRED',action:'Review provider budget and authorize --allow-paid-api'};
    const key=keyOf(next);
    const attempts=j?.events.filter(e=>e.key===key&&e.status==='RUNNING').length||0;
    if(attempts>=1+retryLimit(config))return {...next,status:'BLOCKED',code:'RETRY_LIMIT_REACHED',action:'Diagnose/repair and prepare a new reviewed Build revision'};
    j??={schemaVersion:1,runId:randomUUID(),revision:next.revision,planHash:next.planHash,createdAt:now(),artifactBaseline:artifactInventory(root,config,state),events:[]};
    const event={key,kind:next.kind,sceneId:next.sceneId,capability:next.capability,attempt:attempts+1};
    const start=Date.now();
    j.events.push({...event,status:'RUNNING',at:now()});writeJson(journalFile(root,next.revision),j);
    try{
      const result=await dispatch(root,config,state,next,opts);
      const outcome=result?.reused===true?'REUSED':result?.reusedSelectedAudio===true?'SELECTED_AUDIO_COPY':'WORK_PERFORMED';
      // Execution does not imply verification. QA and approval are separate.
      // Re-read persistent state and verify frozen Build again after dispatch.
      const current=getProject(root).config;
      if(sha(current)!==sha(config)||revisionFor(root,current,loadState(root)).revision!==next.revision)
        throw new ExecutionError('BUILD_DRIFT','Build changed while step was executing; inspect artifacts before reuse');
      j.events.push({...event,status:'EXECUTED',at:now(),elapsedMs:Date.now()-start,outcome});
      writeJson(journalFile(root,next.revision),j);
      return {status:'EXECUTED',runId:j.runId,step:event,next:snapshot(root,current,loadState(root))};
    }catch(e){
      // No raw error text is persisted: provider/app errors may contain private data.
      const failure=failureDetails(e,next.kind);
      j.events.push({...event,status:'FAILED',at:now(),elapsedMs:Date.now()-start,code:failure.code,failure});
      writeJson(journalFile(root,next.revision),j);
      return {status:'BLOCKED',code:failure.code,runId:j.runId,step:event,failure,action:failure.action};
    }
  }finally{release();}
}
