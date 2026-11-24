import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {avpDir,readJson,writeJson,sha,fileHash,sceneDir,run} from './utils.mjs';
import {checkBuild} from './build.mjs';
import {productionNext} from './production-executor.mjs';
import {validateFinalOutput,validateSceneQa} from './state.mjs';
import {telemetryReport} from './telemetry.mjs';
import {sourceFingerprint} from './inspect.mjs';
import {semanticStatus} from './semantic-review.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const directory=root=>path.join(avpDir(root),'benchmarks');
const kinds=['capture','voice','captions','preview','qa','render'];
function mediaSec(file){const n=Number(JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file])).format.duration);if(!Number.isFinite(n)||n<=0)throw Error('Invalid measured media duration');return n;}
function toolVersion(name){return run(name,['-version']).split('\n')[0];}
export function benchmarkRecord(root,config,state,{label,kind,scope,confirm=false}={}){
  if(confirm!==true||typeof label!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).test(label)||!['full','repair'].includes(kind)||!['fixture','external'].includes(scope))
    throw Error('Use benchmark record --label ID --kind full|repair --scope fixture|external --confirm');
  const build=checkBuild(root,config,state),next=productionNext(root,config);
  if(!build.ready||next.status!=='COMPLETE'||next.pending||!hash(next.revision))throw Error('Benchmark requires current complete frozen Production');
  const report=validateFinalOutput(root,config,state),t=telemetryReport(root,config,state),p=t.currentProduction;
  if(!p||!t.artifacts.baselineAvailable||t.journalCoverage.invalid||t.journalCoverage.truncated||p.totals.open)
    throw Error('Benchmark requires complete observable revision journal and baseline');
  const journal=readJson(path.join(avpDir(root),'production',next.revision+'.json'));
  if(!Number.isSafeInteger(journal.paidReservationBaseline)||journal.paidReservationBaseline<0)
    throw Error('Benchmark requires persisted provider reservation baseline');
  const executed=journal.events.filter(e=>e.status==='EXECUTED');
  const baseline=journal.artifactBaseline;
  const current=Object.fromEntries(config.scenes.map(s=>[s.id,state.scenes[s.id]]));
  const covered=executed.some(e=>e.kind==='render');
  if(!covered)throw Error('Final render not observed in current Production journal');
  const parts=['capture','voice','captions','preview'];
  const rows=[];
  for(const scene of config.scenes){
    const old=baseline.find(x=>x.sceneId===scene.id),qa=validateSceneQa(root,config,scene,state);
    if(!old)throw Error('Scene baseline missing');
    const artifactStatus={};
    for(const part of parts){
      if(part==='voice'&&config.voiceover?.enabled===false){artifactStatus[part]='DISABLED';continue;}
      const a=current[scene.id].artifacts?.[part],prior=old.artifacts?.[part];
      const event=executed.find(e=>e.sceneId===scene.id&&e.kind===part&&e.outcome!=='REUSED');
      const unchanged=prior?.status==='CURRENT'&&prior.hash===a?.hash&&prior.inputHash===a?.inputHash&&prior.builtAt===a?.builtAt;
      artifactStatus[part]=unchanged?'PRESERVED':event?'EXECUTED':'UNOBSERVED';
      if(artifactStatus[part]==='UNOBSERVED')throw Error('Artifact changed without journaled execution: '+scene.id+'/'+part);
      if(kind==='full'&&(prior?.status!=='STALE_OR_MISSING'||!event))throw Error('Full benchmark requires all enabled media stale/missing at baseline and journaled execution');
    }
    const capture=readJson(path.join(sceneDir(root,scene.id),'capture-report.json'));
    const assertions=Array.isArray(capture.assertions)?capture.assertions:[];
    rows.push({sceneId:scene.id,previewSec:mediaSec(path.join(sceneDir(root,scene.id),'preview.mp4')),
      captureSec:mediaSec(path.join(sceneDir(root,scene.id),'capture.mp4')),artifactStatus,
      assertionsRecorded:assertions.length,claimCount:(scene.claims||[]).length,claimEvidenceCheck:qa.checks.claimEvidence??null,
      semantic:semanticStatus(root,config,scene,qa).status,technicalQa:qa.pass===true});
  }
  if(kind==='repair'&&(!rows.some(s=>Object.values(s.artifactStatus).includes('PRESERVED'))||!rows.some(s=>Object.values(s.artifactStatus).includes('EXECUTED'))))
    throw Error('Repair benchmark needs both preserved and newly executed media');
  const media=(part,durationField)=>rows.filter(s=>s.artifactStatus[part]==='EXECUTED').reduce((n,s)=>n+s[durationField],0);
  const environment={node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model||null,logicalCpus:os.cpus().length,
    ffmpeg:toolVersion('ffmpeg'),ffprobe:toolVersion('ffprobe')};
  const data={schemaVersion:1,label,kind,scope:scope==='fixture'?'AUTHOR_KNOWN_FIXTURE':'OPERATOR_DECLARED_EXTERNAL_NOT_VERIFIED_BLIND',
    sourceFingerprint:sourceFingerprint(root,config),configHash:sha(config),planHash:next.planHash,revision:next.revision,
    outputHash:report.outputHash,finalDurationSec:report.durationSec,environment,environmentHash:sha(environment),
    production:p.totals,byKind:p.byKind,scenes:rows,regeneratedCaptureSec:media('capture','captureSec'),regeneratedPreviewSec:media('preview','previewSec'),
    reservedCallsDelta:(state.budget?.ttsCalls||0)-journal.paidReservationBaseline,estimatedProjectUsdReserved:state.budget?.estimatedUsdReserved||0,
    actualBilledUsd:null,agentTokens:null,wallClockMs:null,
    limitations:['Only completed journaled Production dispatch time; excludes research, approval and external Agent time.',
      'Media seconds count newly executed current artifacts, not all failed attempts or encoder work.',
      'Declared semantic review is not independently verified. External scope is operator-declared, not proof of an unseen repository.',
      'No actual bill, token count or provider quota inferred.']};
  const id=sha(data),file=path.join(directory(root),id+'.json');
  if(!fs.existsSync(file))writeJson(file,{schemaVersion:1,id,data});
  return {id,...data};
}
export function readBenchmark(root,id){
  if(!hash(id))throw Error('Invalid benchmark receipt ID');
  const f=path.join(directory(root),id+'.json'),v=readJson(f);
  if(v.schemaVersion!==1||v.id!==id||sha(v.data)!==id)throw Error('Benchmark receipt integrity mismatch');
  return {id,...v.data};
}
export function compareBenchmarks(full,repair){
  if(full.kind!=='full'||repair.kind!=='repair')throw Error('Compare full baseline first, then repair');
  const comparable=full.configHash===repair.configHash&&full.sourceFingerprint===repair.sourceFingerprint&&full.environmentHash===repair.environmentHash&&full.scope===repair.scope;
  const delta={observedDispatchMs:full.production.observedMs-repair.production.observedMs,
    captureSec:full.regeneratedCaptureSec-repair.regeneratedCaptureSec,previewSec:full.regeneratedPreviewSec-repair.regeneratedPreviewSec,
    reservedCalls:full.reservedCallsDelta-repair.reservedCallsDelta};
  return {status:comparable?'MATCHED_INPUT_OBSERVATION':'UNMATCHED_INPUT_OBSERVATION',fullId:full.id,repairId:repair.id,
    comparable,delta,observedDispatchReductionPct:comparable&&full.production.observedMs>0?Math.round(delta.observedDispatchMs/full.production.observedMs*10000)/100:null,
    note:comparable?'Matched configuration/source/environment receipt, not randomized controlled experiment. Report repeated trials and variance.':'Different config/source/environment/scope: raw observed delta only; do not call it measured same-input savings.'};
}
export function listBenchmarks(root){if(!fs.existsSync(directory(root)))return [];return fs.readdirSync(directory(root),{withFileTypes:true}).filter(x=>x.isFile()&&/^[a-f0-9]{64}\.json$/.test(x.name)).map(x=>readBenchmark(root,x.name.slice(0,-5)));}
