import fs from 'node:fs';
import path from 'node:path';
import {avpDir,readJson,writeJson,fileHash,sha,safeName} from './utils.mjs';
import {sourceFingerprint} from './inspect.mjs';
import {validateCaptureEvidenceConfig} from './capture-assertions.mjs';
import {executeCaptureAction} from './capture-actions.mjs';

const MAX_ACTIONS=50;
const allowedActions=new Set(['goto','click','fill','hover','waitFor','pause','scroll',
  'assertVisible','assertText','assertAttribute','clickExpectResponse']);
const assertionTypes=new Set(['assertVisible','assertText','assertAttribute','clickExpectResponse']);
const actionKeys=new Set(['type','path','testId','role','name','label','text','value','timeoutMs',
  'ms','y','evidenceId','evidenceScreenshot','expectedText','attribute','expectedValue','response']);
const responseKeys=new Set(['pathContains','method','status','bodyIncludes']);
const idValid=id=>typeof id==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id);
const adapterDir=(root,id)=>path.join(avpDir(root),'adapters',safeName(id));
export const adapterPath=(root,id)=>path.join(adapterDir(root,id),'manifest.json');
const reviewPath=(root,id)=>path.join(adapterDir(root,id),'review.json');
const reportPath=(root,id)=>path.join(adapterDir(root,id),'trial-report.json');
const receiptPath=(root,id)=>path.join(adapterDir(root,id),'trial-receipt.json');

function safeFile(file){
  if(!fs.existsSync(file))return false;
  const s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink())throw Error('Adapter files must be regular, non-symlink files');
  if(s.size>180000)throw Error('Adapter file too large');
  return true;
}
function loopbackOrigin(appUrl){
  let u;try{u=new URL(appUrl);}catch{throw Error('Adapter requires a valid test appUrl');}
  if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||
    u.username||u.password||u.search||u.hash)
    throw Error('Declarative adapter runs only against an explicit loopback HTTP(S) test app URL');
  return u.origin;
}
function plain(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;}
function keys(v,allowed,label){
  if(!plain(v)||Object.keys(v).some(x=>!allowed.has(x)))throw Error('Invalid '+label+': unexpected field or object type');
}
function short(s,label,limit=250){
  if(typeof s!=='string'||!s.trim()||s.length>limit)throw Error(label+' must be nonempty text (max '+limit+')');
}
function boundedActions(actions,label,{allowEmpty=false}={}){
  if(!Array.isArray(actions)||(!allowEmpty&&actions.length===0)||actions.length>MAX_ACTIONS)
    throw Error(label+' must contain '+(allowEmpty?'0–':'1–')+MAX_ACTIONS+' declarative actions');
  for(const [i,a] of actions.entries()){
    keys(a,actionKeys,label+'['+i+']');
    if(!allowedActions.has(a.type))throw Error('Adapter prohibits arbitrary scripts/commands/actions: '+String(a.type));
    for(const [k,v] of Object.entries(a)){
      if(k==='response'){keys(v,responseKeys,'response');continue;}
      if(['ms','y','timeoutMs'].includes(k)){
        if(!Number.isInteger(v)||v<0||v>30000)throw Error('Adapter numeric action parameter out of range: '+k);
      }else if(k==='evidenceScreenshot'){
        if(typeof v!=='boolean')throw Error('evidenceScreenshot must be boolean');
      }else if(k!=='type'){
        if(typeof v!=='string'||v.length>500)throw Error('Adapter action text value invalid: '+k);
      }
    }
    if(a.type==='goto'){
      if(!a.path||!a.path.startsWith('/')||a.path.startsWith('//')||
        a.path.includes('\\')||/[\u0000-\u001f]/.test(a.path))
        throw Error('Adapter goto must use a local absolute path, not a URL');
    }else if(['click','fill','hover','waitFor',...assertionTypes].includes(a.type)&&
      !['testId','role','label','text'].some(k=>typeof a[k]==='string'&&a[k].trim()))
      throw Error('Adapter action '+a.type+' requires a deterministic locator');
  }
  validateCaptureEvidenceConfig({actions,evidencePolicy:{requireAssertions:!allowEmpty}});
}
export function validateAdapterManifest(manifest,config,scene){
  keys(manifest,new Set(['schemaVersion','id','kind','version','provenance','capabilities','sceneId',
    'appOrigin','permissions','startState','endState','cleanup','actions','resetActions','expectedEvidenceIds']),'adapter manifest');
  if(manifest.schemaVersion!==1||manifest.kind!=='declarative-playwright')throw Error('Only v1 declarative Playwright adapters supported; scripts are disabled');
  safeName(manifest.id);
  if(manifest.sceneId!==scene.id)throw Error('Adapter scene binding mismatch');
  if(manifest.appOrigin!==loopbackOrigin(config.appUrl))throw Error('Adapter origin mismatch');
  if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('Adapter requires pinned semantic version');
  keys(manifest.provenance,new Set(['type','license','repository','commit']),'adapter provenance');
  if(manifest.provenance.type!=='project-authored'||manifest.provenance.repository!==null||
     manifest.provenance.commit!==null||manifest.provenance.license!=='project-owned')
    throw Error('Only project-authored declarative recipes allowed. External code requires future provenance vetting.');
  const p=manifest.permissions;
  keys(p,new Set(['network','filesystem','subprocess','secrets','externalApis']),'adapter permissions');
  if(p.network!=='same-origin-loopback'||p.filesystem!=='none'||p.subprocess!==false||
    p.secrets!==false||p.externalApis!==false)
    throw Error('Adapter permissions exceed supported browser-isolated policy');
  for(const key of ['startState','endState','cleanup'])short(manifest[key],key,300);
  if(!Array.isArray(manifest.capabilities)||!manifest.capabilities.length||manifest.capabilities.length>12||
    new Set(manifest.capabilities).size!==manifest.capabilities.length||
    manifest.capabilities.some(x=>typeof x!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(x)))
    throw Error('Adapter capability IDs must be a unique nonempty bounded list');
  boundedActions(manifest.actions,'adapter.actions');
  boundedActions(manifest.resetActions,'adapter.resetActions',{allowEmpty:true});
  if(!Array.isArray(manifest.expectedEvidenceIds)||!manifest.expectedEvidenceIds.length||
     manifest.expectedEvidenceIds.length>MAX_ACTIONS||
     manifest.expectedEvidenceIds.some(x=>!idValid(x))||
     new Set(manifest.expectedEvidenceIds).size!==manifest.expectedEvidenceIds.length)
    throw Error('Adapter must declare expected evidence IDs');
  const actual=manifest.actions.filter(a=>assertionTypes.has(a.type)).map(a=>a.evidenceId||a.type);
  if(manifest.expectedEvidenceIds.length!==actual.length||
     actual.some((id,i)=>manifest.expectedEvidenceIds[i]!==id))
    throw Error('Adapter expected evidence must match every declared assertion');
  return manifest;
}
function ensureManifest(root,config,scene){
  const id=scene.capture?.adapter;
  if(typeof id!=='string'||!id.length)throw Error('Scene does not declare capture.adapter');
  safeName(id);
  const target=adapterPath(root,id);
  if(!safeFile(target))throw Error('Adapter manifest missing: '+id);
  const data=validateAdapterManifest(readJson(target),config,scene);
  if(data.id!==id)throw Error('Adapter ID mismatch');
  return {data,hash:fileHash(target)};
}
export function adapterActions(root,config,scene){
  if(!scene.capture?.adapter)return scene.capture.actions;
  return ensureManifest(root,config,scene).data.actions;
}
export function adapterFingerprint(root,config,scene){
  if(!scene.capture?.adapter)return null;
  try{
    const {hash}=ensureManifest(root,config,scene),id=scene.capture.adapter;
    return {id,manifestHash:hash,
      reviewHash:safeFile(reviewPath(root,id))?fileHash(reviewPath(root,id)):null,
      receiptHash:safeFile(receiptPath(root,id))?fileHash(receiptPath(root,id)):null};
  }catch{return {id:scene.capture.adapter,invalid:true};}
}
export function scaffoldAdapter(root,config,scene,{id,capabilities=[]}={}){
  safeName(id);
  if(!Array.isArray(capabilities)||!capabilities.length)throw Error('Provide --capability ID[,ID] for an adapter');
  const file=adapterPath(root,id);
  if(fs.existsSync(file))throw Error('Refusing to overwrite existing adapter manifest');
  const actions=scene.capture.actions.length?structuredClone(scene.capture.actions):
    [{type:'goto',path:'/'},{type:'assertVisible',role:'heading',name:'REPLACE_WITH_REAL_HEADING',evidenceId:'replace-me'}];
  const expectedEvidenceIds=actions.filter(a=>assertionTypes.has(a.type)).map(a=>a.evidenceId||a.type);
  if(!expectedEvidenceIds.length)
    actions.push({type:'assertVisible',role:'heading',name:'REPLACE_WITH_REAL_HEADING',evidenceId:'replace-me'});
  const manifest={schemaVersion:1,id,kind:'declarative-playwright',version:'0.1.0',
    provenance:{type:'project-authored',license:'project-owned',repository:null,commit:null},
    sceneId:scene.id,capabilities,appOrigin:loopbackOrigin(config.appUrl),
    permissions:{network:'same-origin-loopback',filesystem:'none',subprocess:false,secrets:false,externalApis:false},
    startState:'Disposable test fixture and fresh isolated browser context',
    endState:'All explicitly declared DOM/API assertions pass',
    cleanup:'Dispose browser context; resetActions if application state must be reverted',
    actions,resetActions:[],expectedEvidenceIds:actions.filter(a=>assertionTypes.has(a.type)).map(a=>a.evidenceId||a.type)};
  validateAdapterManifest(manifest,config,scene);
  writeJson(file,manifest);
  return {id,file,manifestHash:fileHash(file),status:'DRAFT_UNREVIEWED',
    next:'Review/edit manifest; set scene.capture.adapter to this ID; run adapters approve and trial'};
}
export function approveAdapter(root,config,scene,{confirm=false}={}){
  if(confirm!==true)throw Error('Manual inspection and explicit --confirm are required before adapter approval');
  const {data,hash}=ensureManifest(root,config,scene),id=data.id;
  const approval={
    schemaVersion:1,id,sceneId:scene.id,approvedAt:new Date().toISOString(),
    manifestHash:hash,sourceFingerprint:sourceFingerprint(root,config),appOrigin:data.appOrigin,
    permissionsHash:sha(data.permissions),
    humanDecision:'CONFIRMED_BY_LOCAL_CLI_OPERATOR_NOT_IDENTITY_ATTESTED',
    reviewed:{manifest:true,permissions:true,provenance:true,
      licenseClaim:'PROJECT_OWNED_DECLARATION_NOT_INDEPENDENTLY_AUDITED'},
    note:'Approval is not a code security audit, app behavior test or external-skill vetting.'
  };
  writeJson(reviewPath(root,id),approval);
  fs.rmSync(reportPath(root,id),{force:true});
  fs.rmSync(receiptPath(root,id),{force:true});
  return {id,status:'REVIEWED_AWAITING_TRIAL',manifestHash:hash,approvalHash:fileHash(reviewPath(root,id))};
}
function currentApproval(root,config,scene,manifestHash){
  const id=scene.capture.adapter,f=reviewPath(root,id);
  if(!safeFile(f))throw Error('Adapter requires explicit approval: avp adapters approve --confirm');
  const a=readJson(f),source=sourceFingerprint(root,config),origin=loopbackOrigin(config.appUrl);
  if(a.schemaVersion!==1||a.id!==id||a.sceneId!==scene.id||a.manifestHash!==manifestHash||
    a.sourceFingerprint!==source||a.appOrigin!==origin||
    a.humanDecision!=='CONFIRMED_BY_LOCAL_CLI_OPERATOR_NOT_IDENTITY_ATTESTED')
    throw Error('Adapter approval stale or mismatched; review and approve the current manifest/source');
  return {data:a,hash:fileHash(f)};
}
function reportPass(root,config,scene,approvalHash,manifestHash){
  const id=scene.capture.adapter,reportFile=reportPath(root,id),receiptFile=receiptPath(root,id);
  if(!safeFile(reportFile)||!safeFile(receiptFile))throw Error('Adapter needs a passing trial');
  const report=readJson(reportFile),receipt=readJson(receiptFile);
  if(report.schemaVersion!==1||report.status!=='PASS'||report.sceneId!==scene.id||
    report.adapterId!==id||report.manifestHash!==manifestHash||report.approvalHash!==approvalHash||
    report.sourceFingerprint!==sourceFingerprint(root,config)||
    report.appOrigin!==loopbackOrigin(config.appUrl)||report.resetPassed!==true||
    !Array.isArray(report.assertions)||!report.assertions.length||report.assertions.some(a=>a.pass!==true)||
    (report.pageErrors||[]).length>0||receipt.schemaVersion!==1||
    receipt.reportHash!==fileHash(reportFile)||receipt.manifestHash!==manifestHash||
    receipt.approvalHash!==approvalHash||receipt.status!=='PASS')
    throw Error('Adapter trial report/receipt is invalid, edited, failed or stale');
  return {report,receiptHash:fileHash(receiptFile),reportHash:fileHash(reportFile)};
}
/** A compact, deterministic snapshot for Build Package and input hashes. */
export function adapterStatus(root,config,scene){
  if(!scene.capture?.adapter)return null;
  const id=scene.capture.adapter;
  try{
    const {data,hash}=ensureManifest(root,config,scene);
    let approval;try{approval=currentApproval(root,config,scene,hash);}catch(e){
      return {id,status:'REVIEW_REQUIRED',reason:e.message,manifestHash:hash,
        capabilities:data.capabilities,kind:data.kind,version:data.version};
    }
    let proof;try{proof=reportPass(root,config,scene,approval.hash,hash);}catch(e){
      return {id,status:'TRIAL_REQUIRED',reason:e.message,manifestHash:hash,
        approvalHash:approval.hash,capabilities:data.capabilities,kind:data.kind,version:data.version};
    }
    return {id,status:'TRIAL_PASS',manifestHash:hash,approvalHash:approval.hash,
      reportHash:proof.reportHash,receiptHash:proof.receiptHash,
      capabilities:data.capabilities,kind:data.kind,version:data.version,
      permissionsHash:sha(data.permissions),
      independentlyAudited:false,hostSandboxed:false,
      runtimeScope:'LOOPBACK_BROWSER_CONTEXT_ONLY'};
  }catch(e){return {id,status:'INVALID',reason:String(e.message||e).slice(0,350)};}
}
export function requireAdapterReady(root,config,scene){
  if(!scene.capture?.adapter)return null;
  const s=adapterStatus(root,config,scene);
  if(s.status!=='TRIAL_PASS')throw Error('ADAPTER GATE '+s.status+': '+s.reason+
    '. Review/approve and re-trial the current manifest before using it.');
  return s;
}
export function projectAdapterSnapshot(root,config){
  return config.scenes.filter(s=>s.capture?.adapter).map(s=>({
    sceneId:s.id,...adapterStatus(root,config,s)
  })).sort((a,b)=>a.sceneId.localeCompare(b.sceneId,'en'));
}
function installBrowserOriginGuard(context,appOrigin,record){
  // Browser-level guard, not an OS/container sandbox. App server code is still
  // trusted to have been launched separately in an authorized test environment.
  context.route('**/*',async route=>{
    try{
      const u=new URL(route.request().url());
      if(u.origin===appOrigin){await route.continue();return;}
    }catch{}
    record.blockedExternalRequests++;
    await route.abort('blockedbyclient');
  });
}
/** Trial a reviewed declarative recipe in an isolated browser context. No JS/script execution from adapter. */
export async function trialAdapter(root,config,scene,{allowActions=false}={}){
  if(allowActions!==true)throw Error('Adapter trial requires explicit --allow-actions (use disposable local test data)');
  const {data,hash}=ensureManifest(root,config,scene),approval=currentApproval(root,config,scene,hash);
  let chromium;try{({chromium}=await import('@playwright/test'));}
  catch{throw Error('Playwright missing: npm install and npx playwright install chromium');}
  const record={schemaVersion:1,status:'RUNNING',scope:'ADAPTER_BROWSER_TRIAL_NOT_PRODUCTION_EVIDENCE',
    adapterId:data.id,sceneId:scene.id,manifestHash:hash,approvalHash:approval.hash,
    sourceFingerprint:sourceFingerprint(root,config),appOrigin:data.appOrigin,
    actionsHash:sha(data.actions),startedAt:new Date().toISOString(),
    blockedExternalRequests:0,actions:[],assertions:[],pageErrors:[],resetPassed:false,
    warning:'Fresh browser context + same-origin routing is NOT an OS sandbox; app server may make external calls.'};
  const trialFile=reportPath(root,data.id),sealFile=receiptPath(root,data.id);
  fs.rmSync(sealFile,{force:true});
  writeJson(trialFile,record);
  let browser,context,page;
  try{
    browser=await chromium.launch({headless:true});
    context=await browser.newContext({
      viewport:{width:config.render?.width||1280,height:config.render?.height||720},
      acceptDownloads:false,serviceWorkers:'block',permissions:[]
    });
    installBrowserOriginGuard(context,data.appOrigin,record);
    page=await context.newPage();
    page.on('pageerror',e=>record.pageErrors.push(String(e.message).slice(0,300)));
    let error=null;
    try{
      for(const a of data.actions){
        const start=Date.now();
        await executeCaptureAction(page,a,{appUrl:config.appUrl,dir:null,report:record});
        record.actions.push({type:a.type,ms:Date.now()-start});
      }
    }catch(e){error=e;}
    // Best-effort declarative reset; any reset failure fails the trial.
    try{
      for(const a of data.resetActions)
        await executeCaptureAction(page,a,{appUrl:config.appUrl,dir:null,report:record});
      record.resetPassed=true;
    }catch(e){record.resetPassed=false;error??=e;}
    const observed=record.assertions.map(a=>a.id);
    if(observed.length!==data.expectedEvidenceIds.length||
       observed.some((id,i)=>id!==data.expectedEvidenceIds[i]||record.assertions[i].pass!==true))
      error??=Error('Adapter trial missing ordered positive evidence assertions');
    if(record.pageErrors.length)error??=Error('App emitted uncaught browser page errors');
    if(error)throw error;
    record.status='PASS';record.finishedAt=new Date().toISOString();
    writeJson(trialFile,record);
    const receipt={schemaVersion:1,status:'PASS',reportHash:fileHash(trialFile),
      manifestHash:hash,approvalHash:approval.hash};
    writeJson(sealFile,receipt);
    return {id:data.id,status:'PASS',assertions:record.assertions.length,
      manifestHash:hash,reportHash:receipt.reportHash,
      scope:record.scope,warning:record.warning};
  }catch(e){
    record.status='FAILED';record.finishedAt=new Date().toISOString();
    record.error=String(e.message||e).slice(0,500);writeJson(trialFile,record);
    fs.rmSync(sealFile,{force:true});throw e;
  }finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});}
}
/** Restrict adapter-based scene capture/rehearsal browser requests too. */
export function protectAdapterBrowser(context,config,scene){
  if(!scene.capture?.adapter)return;
  requireAdapterReadyContext(config);
  const record={blockedExternalRequests:0};
  installBrowserOriginGuard(context,loopbackOrigin(config.appUrl),record);
  return record;
}
function requireAdapterReadyContext(config){loopbackOrigin(config.appUrl);}
