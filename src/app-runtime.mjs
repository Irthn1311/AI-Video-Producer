import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {avpDir,readJson,writeJson,sha,fileHash,isWithin} from './utils.mjs';
import {scanSource} from './inspect.mjs';
import {ExecutionError} from './execution-errors.mjs';

const dir=root=>path.join(avpDir(root),'app-runtime');
const approvalFile=root=>path.join(dir(root),'approval.json');
const proofFile=root=>path.join(dir(root),'trial.json');
const lockFile=root=>path.join(dir(root),'session.lock');
const now=()=>new Date().toISOString();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export const managedApp=config=>config.appRuntime!==undefined;
const fail=(code,message)=>new ExecutionError(code,message);
function exact(v,keys,label){
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Invalid '+label);
}
function runtime(root,config){
  const m=config.appRuntime;
  exact(m,['mode','entrypoint','readinessPath','startupTimeoutMs','reset','isolation'],'appRuntime manifest');
  if(m.mode!=='managed-node'||m.reset!=='fresh-process'||m.isolation!=='operator-approved-disposable-local-fixture')
    throw Error('Managed runtime requires explicit disposable local fixture and fresh-process reset policy');
  const u=new URL(config.appUrl);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||Number(u.port)<1024||u.pathname!=='/'||u.search||u.hash||u.username||u.password)
    throw Error('Managed runtime requires http://127.0.0.1:PORT with explicit unprivileged port');
  if(typeof m.readinessPath!=='string'||!/^\/[A-Za-z0-9/_-]*$/.test(m.readinessPath)||m.readinessPath.startsWith('//'))
    throw Error('Invalid local readiness path');
  if(!Number.isInteger(m.startupTimeoutMs)||m.startupTimeoutMs<1000||m.startupTimeoutMs>60000)
    throw Error('startupTimeoutMs must be 1000–60000');
  const scan=scanSource(root,config);
  if(typeof m.entrypoint!=='string'||!/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:mjs|cjs|js)$/.test(m.entrypoint)||
      !scan.files.some(f=>f.path===m.entrypoint))throw Error('Entrypoint must be a scanned Node source file');
  const source=fs.realpathSync(scan.source),entry=path.join(source,m.entrypoint);
  if(!isWithin(source,fs.realpathSync(entry))||fs.realpathSync(entry)!==entry||!fs.lstatSync(entry).isFile())
    throw Error('Entrypoint cannot traverse or use symlinks');
  const identity={schemaVersion:1,manifest:m,sourceFingerprint:scan.contentFingerprint,entryHash:fileHash(entry),
    origin:u.origin,nodeVersion:process.version,engineHash:fileHash(new URL(import.meta.url))};
  return {identity,hash:sha(identity),entry,source,origin:u.origin,port:Number(u.port),m};
}
export function appRuntimeFingerprint(root,config){
  if(!root||!managedApp(config))return undefined;
  try{return runtime(root,config).hash;}catch{return 'INVALID_RUNTIME';}
}
export function appStatus(root,config){
  if(!managedApp(config))return {status:'EXTERNAL_UNMANAGED',scope:'Existing app; no launch or reset claim'};
  try{
    const x=runtime(root,config);
    const a=fs.existsSync(approvalFile(root))?readJson(approvalFile(root)):null;
    const p=fs.existsSync(proofFile(root))?readJson(proofFile(root)):null;
    const approved=a?.schemaVersion===1&&a.manifestHash===x.hash&&a.decision==='EXPLICIT_CODE_EXECUTION_REVIEW';
    const tested=approved&&p?.schemaVersion===1&&p.manifestHash===x.hash&&p.approvalHash===fileHash(approvalFile(root))&&p.status==='PASS'&&p.cleanup==='DIRECT_CHILD_EXITED';
    return {status:!approved?'REVIEW_REQUIRED':!tested?'TRIAL_REQUIRED':'TRIAL_PASS',manifestHash:x.hash,
      entrypoint:x.m.entrypoint,origin:x.origin,nodeVersion:process.version,reset:'FRESH_PROCESS_ONLY',
      scope:'OPERATOR_DECLARED_DISPOSABLE_APP_NOT_OS_SANDBOX'};
  }catch{return {status:'INVALID',scope:'Invalid or unreadable managed runtime manifest'};}
}
export function approveApp(root,config,{hash,confirm=false}={}){
  const x=runtime(root,config);
  if(confirm!==true||hash!==x.hash)throw Error('Review exact runtime manifest/source, then app approve --hash HASH --confirm');
  writeJson(approvalFile(root),{schemaVersion:1,manifestHash:x.hash,decision:'EXPLICIT_CODE_EXECUTION_REVIEW',at:now()});
  return appStatus(root,config);
}
function approved(root,config,{trial=false}={}){
  const s=appStatus(root,config);
  if(!['TRIAL_REQUIRED','TRIAL_PASS'].includes(s.status)||(!trial&&s.status!=='TRIAL_PASS'))
    throw fail('APP_RUNTIME_REVIEW_REQUIRED','Managed app requires current approval and trial');
  return runtime(root,config);
}
async function portFree(port){
  const s=net.createServer();
  await new Promise((resolve,reject)=>{s.once('error',()=>reject(fail('APP_PORT_OCCUPIED','Managed app port unavailable; do not kill existing processes')));s.listen(port,'127.0.0.1',resolve);});
  await new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));
}
function acquire(root){
  fs.mkdirSync(dir(root),{recursive:true});
  const f=lockFile(root),token=randomUUID();let fd;
  try{fd=fs.openSync(f,'wx');}catch(e){if(e.code==='EEXIST')throw fail('APP_RUNTIME_BUSY','Managed app session lock exists; inspect owner and cleanup manually');throw e;}
  try{fs.writeFileSync(fd,JSON.stringify({schemaVersion:1,token,ownerPid:process.pid,startedAt:now()}));}finally{fs.closeSync(fd);}
  return {token,release(){try{if(readJson(f).token===token)fs.unlinkSync(f);}catch{}}};
}
async function ready(child,x,dead){
  const end=Date.now()+x.m.startupTimeoutMs;
  while(Date.now()<end){
    if(dead.exited)throw fail('APP_START_FAILED','Managed Node child exited before readiness');
    try{
      const res=await fetch(x.origin+x.m.readinessPath,{redirect:'manual',signal:AbortSignal.timeout(600)});
      const ok=res.ok;await res.body?.cancel();
      if(ok&&!dead.exited)return;
    }catch{/* Poll within bounded startup deadline. */}
    await delay(100);
  }
  throw fail('APP_READINESS_TIMEOUT','Managed app readiness deadline exceeded');
}
async function terminate(child,dead){
  if(!child||dead.exited)return;
  child.kill('SIGTERM');
  const end=Date.now()+2000;
  while(!dead.exited&&Date.now()<end)await delay(50);
  if(!dead.exited){child.kill('SIGKILL');const hardEnd=Date.now()+2000;while(!dead.exited&&Date.now()<hardEnd)await delay(50);}
  if(!dead.exited)throw fail('APP_CLEANUP_FAILED','Could not confirm direct child exit; retain session lock for manual inspection');
}
// No shell, no npm scripts, no dependency installation, no inherited provider keys.
// This is process lifecycle management, NOT security isolation for untrusted code.
export async function withAppRuntime(root,config,{allowLaunch=false,trial=false,allowActions=false}={},work){
  if(!managedApp(config))return work(null);
  if(allowLaunch!==true)throw fail('APP_LAUNCH_AUTHORIZATION_REQUIRED','Managed app launch requires --allow-launch');
  if(!trial&&allowActions!==true)throw fail('APP_LAUNCH_AUTHORIZATION_REQUIRED','Managed app interaction requires --allow-actions');
  const x=approved(root,config,{trial}),lease=acquire(root),dead={exited:false};
  let child,record={schemaVersion:1,sessionId:lease.token,manifestHash:x.hash,startedAt:now(),status:'RUNNING',reset:'FRESH_PROCESS_ONLY'};
  const report=path.join(dir(root),'sessions',lease.token+'.json');let cleanupOK=false;
  try{
    await portFree(x.port);
    // The fixture must explicitly honor HOST and PORT and avoid persistent state.
    const env={HOST:'127.0.0.1',PORT:String(x.port),NODE_ENV:'test'};
    if(process.platform==='win32'&&process.env.SystemRoot)env.SystemRoot=process.env.SystemRoot;
    child=spawn(process.execPath,[x.entry],{cwd:x.source,env,shell:false,stdio:'ignore',windowsHide:true});
    child.once('exit',()=>{dead.exited=true;});
    child.once('error',()=>{dead.exited=true;});
    record.childPid=child.pid||null;writeJson(report,record);
    await ready(child,x,dead);
    record.readyAt=now();writeJson(report,record);
    const value=await work({sessionId:record.sessionId,manifestHash:x.hash,reset:'FRESH_PROCESS_ONLY'});
    if(dead.exited)throw fail('APP_START_FAILED','Managed app exited during operation');
    if(runtime(root,config).hash!==x.hash)throw fail('BUILD_DRIFT','Source or runtime changed during operation');
    record.status='PASS';return value;
  }catch(e){record.status='FAILED';record.failureCode=e.failureCode||'APP_OPERATION_FAILED';throw e;}
  finally{
    try{await terminate(child,dead);cleanupOK=true;record.cleanup='DIRECT_CHILD_EXITED';}
    catch(e){record.status='FAILED';record.cleanup='UNCONFIRMED';record.failureCode='APP_CLEANUP_FAILED';throw e;}
    finally{record.finishedAt=now();writeJson(report,record);if(cleanupOK)lease.release();}
  }
}
export async function trialApp(root,config,{allowLaunch=false}={}){
  const x=approved(root,config,{trial:true});
  if(!allowLaunch)throw fail('APP_LAUNCH_AUTHORIZATION_REQUIRED','Managed app trial requires --allow-launch');
  fs.rmSync(proofFile(root),{force:true});
  await withAppRuntime(root,config,{allowLaunch,trial:true},async()=>null);
  writeJson(proofFile(root),{schemaVersion:1,manifestHash:x.hash,approvalHash:fileHash(approvalFile(root)),status:'PASS',cleanup:'DIRECT_CHILD_EXITED',at:now()});
  return appStatus(root,config);
}
