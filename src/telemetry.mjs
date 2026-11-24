import fs from 'node:fs';
import path from 'node:path';
import {avpDir,readJson,fileHash} from './utils.mjs';
import {loadState,staleParts,validateSceneQa} from './state.mjs';

const kinds=['capture','voice','captions','preview'];
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const time=x=>Number.isFinite(x)&&x>=0?x:0;
const safeKinds=new Set(['analyze','skills','prepare','recompile','runtime-trial','adapter-trial','rehearse','capture','voice','captions','preview','qa','render']);
const safeCapabilities=new Set(['playwright-runtime','selected-local-audio','gemini-tts','bundled-caption-timing','remotion-render','ffmpeg-render','ffprobe-qa']);
const empty=()=>({attempts:0,executed:0,failed:0,reconciled:0,open:0,retries:0,observedMs:0,reusedDispatches:0,selectedAudioCopies:0});
const bump=(target,metric,value=1)=>target[metric]+=value;
export function artifactInventory(root,config,state=loadState(root)){
  return config.scenes.map(s=>{
    const ss=state.scenes?.[s.id]||{artifacts:{}},stale=staleParts(s,config,ss,root);
    const artifacts={};
    for(const kind of kinds){
      if(kind==='voice'&&config.voiceover?.enabled===false){artifacts[kind]={status:'DISABLED'};continue;}
      const a=ss.artifacts?.[kind];
      artifacts[kind]={status:stale[kind]?'STALE_OR_MISSING':'CURRENT',
        ...(a&&hex(a.hash)&&hex(a.inputHash)?{hash:a.hash,inputHash:a.inputHash,builtAt:a.builtAt||null}:{})};
    }
    let qa=false;try{validateSceneQa(root,config,s,state);qa=true;}catch{}
    return {sceneId:s.id,artifacts,qaCurrent:qa,locked:ss.locked===true};
  });
}
export function reuseComparison(baseline,current){
  const rows=[];
  for(const old of baseline||[]){
    const fresh=current.find(x=>x.sceneId===old.sceneId);if(!fresh)continue;
    for(const kind of kinds){
      const a=old.artifacts?.[kind],b=fresh.artifacts?.[kind];
      if(a?.status!=='CURRENT'||b?.status!=='CURRENT'||!hex(a.hash)||!hex(a.inputHash))continue;
      if(a.hash===b.hash&&a.inputHash===b.inputHash&&a.builtAt===b.builtAt)
        rows.push({sceneId:old.sceneId,kind});
    }
  }
  return rows;
}
function aggregate(events,phase){
  const totals=empty(),byKind=Object.create(null),byScene=Object.create(null),byCapability=Object.create(null),attempts=new Map(),open=new Map();
  const apply=(e,metric,v=1)=>{
    bump(totals,metric,v);
    if(!safeKinds.has(e.kind))return;
    bump(byKind[e.kind]??=empty(),metric,v);
    if(id(e.sceneId))bump(byScene[e.sceneId]??=empty(),metric,v);
    if(safeCapabilities.has(e.capability))bump(byCapability[e.capability]??=empty(),metric,v);
  };
  for(const e of events){
    if(!e||!safeKinds.has(e.kind)||typeof e.key!=='string')continue;
    if(e.status==='RUNNING'){
      apply(e,'attempts');const count=attempts.get(e.key)||0;if(count)apply(e,'retries');attempts.set(e.key,count+1);
      if(open.has(e.key))apply(open.get(e.key),'open');
      open.set(e.key,e);
    }else if(['EXECUTED','FAILED','RECONCILED'].includes(e.status)&&open.has(e.key)){
      open.delete(e.key);
      apply(e,e.status==='EXECUTED'?'executed':e.status==='FAILED'?'failed':'reconciled');
      apply(e,'observedMs',time(e.elapsedMs));
      if(e.status==='EXECUTED'&&e.outcome==='REUSED')apply(e,'reusedDispatches');
      if(e.status==='EXECUTED'&&e.outcome==='SELECTED_AUDIO_COPY')apply(e,'selectedAudioCopies');
    }
  }
  for(const e of open.values())apply(e,'open');
  return {phase,totals,byKind,byScene,byCapability};
}
function journals(root,folder){
  const base=path.join(avpDir(root),folder);
  if(!fs.existsSync(base))return {valid:[],invalid:0,truncated:false};
  const names=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isFile()&&/^[a-f0-9]{64}\.json$/.test(e.name)).map(e=>e.name).sort();
  const valid=[];let invalid=0;
  for(const n of names.slice(0,1000)){
    try{
      const f=path.join(base,n);
      if(fs.statSync(f).size>16*1024*1024)throw Error('oversized journal');
      const j=readJson(f);
      if(j.schemaVersion!==1||j.revision!==n.slice(0,-5)||!Array.isArray(j.events))throw Error('invalid journal');
      valid.push(j);
    }catch{invalid++;}
  }
  return {valid,invalid,truncated:names.length>1000};
}
function combine(items,phase){
  const out={phase,totals:empty(),byKind:Object.create(null),byScene:Object.create(null),byCapability:Object.create(null)};
  for(const item of items){
    const a=aggregate(item.events,phase);
    for(const k of Object.keys(out.totals))out.totals[k]+=a.totals[k];
    for(const group of ['byKind','byScene','byCapability'])for(const [key,value] of Object.entries(a[group])){
      const dest=out[group][key]??=empty();
      for(const k of Object.keys(dest))dest[k]+=value[k];
    }
  }
  return out;
}
function providerMetrics(state,config){
  const history=Array.isArray(state.history)?state.history:[],calls=new Map();
  for(const e of history){
    if(e?.provider!=='gemini'||!id(e.callId))continue;
    if(e.event==='provider-request-started'&&!calls.has(e.callId))
      calls.set(e.callId,{phase:['BUILD','PRODUCTION'].includes(e.phase)?e.phase:'UNSPECIFIED',status:'OPEN',observedMs:0});
    if(e.event==='provider-request-finished'&&calls.get(e.callId)?.status==='OPEN'){
      const c=calls.get(e.callId);c.status=e.status==='AUDIO_VALID'?'AUDIO_VALID':'FAILED';c.observedMs=time(e.elapsedMs);
    }
  }
  const byPhase={};
  for(const c of calls.values()){
    const p=byPhase[c.phase]??={attempts:0,audioValid:0,failed:0,open:0,observedMs:0};
    p.attempts++;p.observedMs+=c.observedMs;
    p[c.status==='OPEN'?'open':c.status==='FAILED'?'failed':'audioValid']++;
  }
  const reservations=state.budget?.ttsCalls||0,reserved=state.budget?.estimatedUsdReserved||0,limit=config.budget?.maxEstimatedUsd??null;
  return {provider:'gemini',reservedCalls:reservations,observedDispatchStarts:calls.size,
    reservationsWithoutObservedStart:Math.max(0,reservations-calls.size),estimatedUsdReserved:reserved,
    configuredMaxEstimatedUsd:limit,estimatedUsdRemaining:Number.isFinite(limit)?Math.max(0,limit-reserved):null,
    byPhase,actualBilledUsd:null,externalAgentTokens:null,subscriptionQuota:null,
    note:'Reservation is not a confirmed provider request or charge. Dispatch start is local intent immediately before fetch; no delivery guarantee. Audio-valid means decoded response format, not approved narration.'};
}
export function telemetryReport(root,config,state=loadState(root)){
  const build=journals(root,'workflow'),production=journals(root,'production');
  const current=artifactInventory(root,config,state);
  let revision=null;try{const lock=readJson(path.join(avpDir(root),'build','build-lock.json'));if(hex(lock.planHash)){
    // Read only the exact current lock hash via the same hashing routine as executor.
    revision=fileHash(path.join(avpDir(root),'build','build-lock.json'));
  }}catch{}
  const active=production.valid.find(j=>j.revision===revision);
  const baseline=Array.isArray(active?.artifactBaseline)?active.artifactBaseline:null;
  const reused=baseline?reuseComparison(baseline,current):null;
  const counts={CURRENT:0,STALE_OR_MISSING:0,DISABLED:0};
  for(const row of current)for(const a of Object.values(row.artifacts))counts[a.status]++;
  return {schemaVersion:1,scope:'LOCAL_OBSERVED_JOURNALS_AND_ARTIFACT_INTEGRITY',build:combine(build.valid,'BUILD'),
    production:combine(production.valid,'PRODUCTION'),currentProduction:active?aggregate(active.events,'PRODUCTION'):null,
    journalCoverage:{buildRevisions:build.valid.length,productionRevisions:production.valid.length,invalid:build.invalid+production.invalid,truncated:build.truncated||production.truncated},
    provider:providerMetrics(state,config),
    artifacts:{counts,scenes:current.map(s=>({sceneId:s.sceneId,locked:s.locked,qaCurrent:s.qaCurrent,parts:Object.fromEntries(Object.entries(s.artifacts).map(([k,a])=>[k,a.status]))})),
      baselineAvailable:!!baseline,currentFrozenLockRevision:revision,unchangedCurrentSinceFirstDispatch:reused,
      unchangedCount:reused?.length??null},
    limitations:['Dispatch durations are not wall-clock project duration; legacy direct commands and external agent work are not fully journaled.',
      'Artifact currency is an input/byte integrity check, not semantic approval. Unchanged artifacts are not a measured counterfactual cost or time saving.',
      'Current frozen lock identifier is not a fresh readiness approval. Existing Build and QA gates remain authoritative.',
      'No billing, token usage or subscription quota is inferred.']};
}
