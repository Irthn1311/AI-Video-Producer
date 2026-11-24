import fs from 'node:fs';
import path from 'node:path';
import {sha,readJson,writeJson,avpDir} from './utils.mjs';
import {sourceFingerprint} from './inspect.mjs';
import {validateCaptureEvidenceConfig} from './capture-assertions.mjs';

const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(v);
const baseActions=['goto','click','fill','hover','waitFor','pause','scroll','screenshot','assertVisible','assertText','assertAttribute','clickExpectResponse'];
export const adapterActionTypes=new Set([...baseActions,'pointerPath']);
const assertions=new Set(['assertVisible','assertText','assertAttribute','clickExpectResponse']);
const dir=root=>path.join(avpDir(root),'adapters');
const manifestPath=(root,id)=>path.join(dir(root),id+'.json');
const approvalPath=(root,id)=>path.join(dir(root),'approvals',id+'.json');
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function exactKeys(v,allowed,label){
  if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Invalid '+label+' fields');
}
function text(v,max){return typeof v==='string'&&v.trim().length>0&&v.length<=max;}
function localJson(root,file){
  // Never follow a symlink in the project-local adapter tree.
  const base=path.resolve(root),rel=path.relative(base,file);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Adapter path escapes project');
  let cur=base;
  for(const part of rel.split(path.sep)){
    cur=path.join(cur,part);
    const stat=fs.lstatSync(cur);
    if(stat.isSymbolicLink())throw Error('Symlinked adapter path is not permitted');
  }
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size>128*1024)throw Error('Adapter JSON must be a regular file <=128 KiB');
  return readJson(file);
}
export function validatePointerPath(action){
  exactKeys(action,['type','testId','role','name','label','text','points','timeoutMs'],'pointerPath');
  if(!['testId','role','label','text'].some(k=>text(action[k],160)))throw Error('pointerPath needs a locator');
  if(!Array.isArray(action.points)||action.points.length<2||action.points.length>80)throw Error('pointerPath requires 2–80 points');
  for(const p of action.points){
    exactKeys(p,['x','y'],'pointer point');
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error('Pointer coordinates must be normalized to [0,1]');
  }
  if(action.timeoutMs!==undefined&&(!Number.isInteger(action.timeoutMs)||action.timeoutMs<100||action.timeoutMs>15000))
    throw Error('pointerPath timeout must be 100–15000 ms');
}
export function validateAdapter(manifest,scene,config){
  exactKeys(manifest,['schemaVersion','id','kind','provenance','permissions','startState','endState','cleanup','actions','capabilities'],'adapter');
  if(manifest.schemaVersion!==1||manifest.kind!=='declarative-browser-v1'||!safeId(manifest.id)||manifest.id!==scene.capture.adapter)
    throw Error('Adapter schema/kind/id mismatch');
  exactKeys(manifest.provenance,['kind'],'provenance');
  if(manifest.provenance.kind!=='project-authored')throw Error('External executable adapters are not supported');
  exactKeys(manifest.permissions,['network','filesystem','secrets','shell'],'permissions');
  const expected={network:'app-origin-only',filesystem:'none',secrets:'none',shell:'none'};
  if(Object.keys(expected).some(k=>manifest.permissions[k]!==expected[k]))throw Error('Adapter requests unsupported permissions');
  const app=new URL(config.appUrl);
  if(!['http:','https:'].includes(app.protocol)||app.username||app.password)throw Error('Adapter needs an authorized HTTP(S) app URL without credentials');
  if(!text(manifest.startState,500)||!text(manifest.endState,500)||manifest.cleanup!=='close-browser-context')
    throw Error('Adapter requires start/end state descriptions and context cleanup');
  if(!Array.isArray(manifest.actions)||manifest.actions.length<2||manifest.actions.length>60||
    sha(manifest.actions)!==sha(scene.capture.actions))throw Error('Adapter actions must exactly match reviewed scene capture actions (2–60)');
  if(manifest.actions[0].type!=='goto')throw Error('Adapter must start with goto');
  if(scene.capture.evidencePolicy?.requireAssertions!==true||scene.capture.evidencePolicy?.failOnPageError===false)
    throw Error('Adapter requires assertions and fail-on-page-error');
  validateCaptureEvidenceConfig(scene.capture);
  const evidenceIds=new Set();
  for(const a of manifest.actions){
    if(!object(a)||!adapterActionTypes.has(a.type))throw Error('Unsupported adapter action');
    if(a.type==='goto'&&new URL(a.path||'/',app).origin!==app.origin)throw Error('Cross-origin adapter navigation');
    if(a.type==='pointerPath')validatePointerPath(a);
    if(assertions.has(a.type)){
      if(!safeId(a.evidenceId)||evidenceIds.has(a.evidenceId))throw Error('Adapter assertions need unique evidence IDs');
      evidenceIds.add(a.evidenceId);
    }
  }
  if(!Array.isArray(manifest.capabilities)||manifest.capabilities.length<1||manifest.capabilities.length>1)
    throw Error('This adapter version supports one explicit capability');
  const claim=manifest.capabilities[0];
  exactKeys(claim,['id','evidenceId'],'capability');
  if(claim.id!=='pointer-interaction'||!evidenceIds.has(claim.evidenceId))
    throw Error('Unsupported capability or missing assertion evidence ID');
  const actionIndex=manifest.actions.findIndex(a=>a.type==='pointerPath');
  const assertionIndex=manifest.actions.findIndex(a=>a.evidenceId===claim.evidenceId&&['assertText','assertAttribute'].includes(a.type));
  if(actionIndex<0||assertionIndex<=actionIndex)throw Error('Pointer capability needs a later text/attribute assertion');
  return manifest;
}
function binding(root,config,scene){
  if(!safeId(scene.capture.adapter))throw Error('Invalid adapter ID');
  const manifest=validateAdapter(localJson(root,manifestPath(root,scene.capture.adapter)),scene,config);
  const engine=sha(['adapters.mjs','capture-actions.mjs','capture-assertions.mjs'].map(name=>
    fs.readFileSync(path.join(import.meta.dirname,name),'utf8')));
  return {schemaVersion:1,sceneId:scene.id,adapterId:manifest.id,manifestHash:sha(manifest),
    engineHash:engine,sourceFingerprint:sourceFingerprint(root,config),appUrl:config.appUrl,
    captureHash:sha(scene.capture),capabilities:manifest.capabilities};
}
export function adapterStatus(root,config,scene){
  if(scene.capture.adapter===undefined)return {status:'NOT_REQUESTED'};
  try{
    const candidate=binding(root,config,scene);
    const approved=localJson(root,approvalPath(root,scene.id));
    if(approved.schemaVersion!==1||sha(approved.binding)!==sha(candidate))
      return {status:'REVIEW_REQUIRED',reason:'Adapter approval is stale',binding:candidate};
    return {status:'APPROVED_FOR_TRIAL',binding:candidate};
  }catch(e){return {status:'BLOCKED',reason:String(e.message).slice(0,300)};}
}
export function approveAdapter(root,config,scene,{confirm=false}={}){
  if(!confirm)throw Error('Adapter approval requires --confirm after reviewing the exact recipe and permissions');
  const candidate=binding(root,config,scene);
  // Reject symlinked approval directory before writing.
  for(const p of [avpDir(root),dir(root),path.join(dir(root),'approvals')])
    if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Symlinked adapter approval path');
  writeJson(approvalPath(root,scene.id),{schemaVersion:1,binding:candidate,approvedAt:new Date().toISOString()});
  return {status:'APPROVED_FOR_TRIAL',binding:candidate};
}
export function requireAdapter(root,config,scene){
  if(!scene.capture.adapter){
    if(scene.capture.actions.some(a=>a.type==='pointerPath'))throw Error('pointerPath requires a reviewed project adapter');
    return null;
  }
  const status=adapterStatus(root,config,scene);
  if(status.status!=='APPROVED_FOR_TRIAL')throw Error('ADAPTER BLOCKED: '+(status.reason||status.status));
  return status.binding;
}
/** Browser-level network restriction, NOT an OS sandbox or arbitrary-code runtime. */
export async function restrictAdapterContext(context,appUrl){
  const origin=new URL(appUrl).origin;
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    return u.origin===origin?route.continue():route.abort('blockedbyclient');
  });
  if(typeof context.routeWebSocket==='function')await context.routeWebSocket('**/*',ws=>ws.close());
}
