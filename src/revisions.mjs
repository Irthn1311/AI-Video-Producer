import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {sceneDir,readJson,writeJson,sha,safeName} from './utils.mjs';
import {sceneState,saveState,invalidateOutput,requireUnlocked,staleParts} from './state.mjs';

const always=new Set([
  'capture.mp4','capture-report.json','voice.wav','voice-report.json',
  'captions.srt','captions.json','preview.mp4','qa-report.json','edit-plan.json',
  'voice-master.wav','voice-master.json','quality-render.json','semantic-review.json'
]);
const isManaged=rel=>always.has(rel)||
  /^quality-frames\/frame-0[1-8]\.jpg$/.test(rel)||
  /^assets\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.mp4$/.test(rel)||
  /^evidence-[1-9][0-9]*\.png$/.test(rel)||
  /^capture-failure\.png$/.test(rel)||
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}-[0-9]+\.png$/.test(rel);
const versionsDir=(root,id)=>path.join(sceneDir(root,id),'snapshots');
const validateVersion=v=>{if(typeof v!=='string'||!/^v[0-9]{4}$/.test(v))throw Error('Version must be v0001..v9999');return v;};
const digest=file=>{
  const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);
  try{let count;while((count=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,count));}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
};
function regularFile(file){
  if(!fs.existsSync(file))return false;
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Refusing symlink/non-file scene asset: '+path.basename(file));
  return true;
}
function listManaged(root,scene) {
  const dir=sceneDir(root,scene.id),items=[];
  if(!fs.existsSync(dir))return items;
  for(const name of fs.readdirSync(dir)){
    if(name==='assets'||name==='quality-frames'){
      const assetDir=path.join(dir,name),stat=fs.lstatSync(assetDir);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Refusing symlinked/non-directory assets');
      for(const file of fs.readdirSync(assetDir)){
        const rel=name+'/'+file;
        if(isManaged(rel)&&regularFile(path.join(assetDir,file)))items.push(rel);
      }
    }else if(isManaged(name)&&regularFile(path.join(dir,name)))items.push(name);
  }
  return items.sort();
}
export function listSceneSnapshots(root,scene) {
  const dir=versionsDir(root,scene.id);
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(name=>/^v[0-9]{4}$/.test(name)).sort()
    .map(version=>{
      const file=path.join(dir,version,'manifest.json');
      if(!regularFile(file))throw Error('Scene snapshot manifest missing: '+version);
      const manifest=readJson(file);
      return {version,createdAt:manifest.createdAt,label:manifest.label||null,
        files:manifest.files?.length||0,bytes:manifest.totalBytes||0,
        configHash:manifest.configHash};
    });
}
function nextVersion(root,scene) {
  const versions=listSceneSnapshots(root,scene).map(x=>Number(x.version.slice(1)));
  if(versions.length>=20)throw Error('Scene snapshot limit (20) reached. Archive snapshots locally before creating more.');
  const n=(versions.length?Math.max(...versions):0)+1;
  if(n>9999)throw Error('Scene snapshot numbering exhausted');
  return 'v'+String(n).padStart(4,'0');
}
export function snapshotScene(root,config,scene,state,{label=null}={}) {
  safeName(scene.id);
  if(label!==null&&(typeof label!=='string'||label.length>100||!/^[^\r\n]*$/u.test(label)))
    throw Error('Snapshot label must be single-line text of at most 100 characters');
  const dir=sceneDir(root,scene.id),files=listManaged(root,scene);
  if(!files.length)throw Error('No scene media available to snapshot');
  const version=nextVersion(root,scene),folder=versionsDir(root,scene.id),destination=path.join(folder,version);
  fs.mkdirSync(folder,{recursive:true});
  const stage=path.join(folder,'.staging-'+version+'-'+process.pid);
  if(fs.existsSync(stage)||fs.existsSync(destination))throw Error('Scene snapshot staging path already exists');
  fs.mkdirSync(stage,{recursive:true});
  const manifest={
    schemaVersion:1,version,sceneId:scene.id,createdAt:new Date().toISOString(),label,
    configHash:sha(config),sceneHash:sha(scene),
    files:[],totalBytes:0,artifactState:{}
  };
  try{
    for(const rel of files){
      const source=path.join(dir,rel),target=path.join(stage,rel);
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
      const size=fs.statSync(source).size;
      if(fs.statSync(target).size!==size||digest(source)!==digest(target))throw Error('Snapshot source changed during copy');
      manifest.files.push({rel,sha256:digest(target),size});
      manifest.totalBytes+=size;
    }
    const present=new Set(files);
    for(const [name,artifact] of Object.entries(sceneState(state,scene.id).artifacts||{})){
      if(!artifact||typeof artifact.file!=='string'||!isManaged(artifact.file))continue;
      if(present.has(artifact.file))manifest.artifactState[name]=structuredClone(artifact);
    }
    writeJson(path.join(stage,'manifest.json'),manifest);
    fs.renameSync(stage,destination);
    state.history.push({event:'scene-snapshot',scene:scene.id,version,at:manifest.createdAt});
    saveState(root,state);
    return {scene:scene.id,version,files:manifest.files.length,bytes:manifest.totalBytes,
      configMatches:true,approvalUnchanged:true};
  }catch(e){fs.rmSync(stage,{recursive:true,force:true});throw e;}
}
function readVerifiedSnapshot(root,scene,version){
  validateVersion(version);
  const dir=path.join(versionsDir(root,scene.id),version),file=path.join(dir,'manifest.json');
  if(!regularFile(file))throw Error('Scene snapshot not found: '+version);
  const m=readJson(file);
  if(m.schemaVersion!==1||m.sceneId!==scene.id||m.version!==version||!Array.isArray(m.files)||!m.files.length
     ||m.files.length>100)throw Error('Invalid scene snapshot manifest');
  const seen=new Set();let bytes=0;
  for(const item of m.files){
    if(!item||!isManaged(item.rel)||seen.has(item.rel)||!Number.isSafeInteger(item.size)||item.size<0
        ||typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256))
      throw Error('Invalid or duplicate snapshot file manifest entry');
    seen.add(item.rel);
    const source=path.join(dir,item.rel);
    if(!regularFile(source)||fs.statSync(source).size!==item.size||digest(source)!==item.sha256)
      throw Error('Snapshot media hash mismatch: '+item.rel);
    bytes+=item.size;
  }
  if(bytes!==m.totalBytes)throw Error('Snapshot total file size is inconsistent');
  if(!m.artifactState||typeof m.artifactState!=='object'||Array.isArray(m.artifactState))
    throw Error('Snapshot artifact state is invalid');
  for(const artifact of Object.values(m.artifactState)){
    if(!artifact||typeof artifact.file!=='string'||!seen.has(artifact.file)||
       typeof artifact.hash!=='string'||typeof artifact.inputHash!=='string')
      throw Error('Snapshot references missing or invalid artifact');
  }
  return {dir,manifest:m};
}
/**
 * Restore is an explicit mutation. It verifies a full snapshot first, preserves
 * the pre-restore working set as a new snapshot, and ALWAYS clears QA/approval.
 */
export function restoreSceneSnapshot(root,config,scene,state,version) {
  requireUnlocked(state,scene.id);
  const {dir:source,manifest}=readVerifiedSnapshot(root,scene,version);
  const dir=sceneDir(root,scene.id),old=listManaged(root,scene);
  const backup=old.length?snapshotScene(root,config,scene,state,{label:'pre-restore '+version}):null;
  const stage=path.join(dir,'.restore-'+process.pid);
  if(fs.existsSync(stage))throw Error('Scene restore staging path already exists');
  fs.mkdirSync(stage,{recursive:true});
  try{
    for(const item of manifest.files){
      const target=path.join(stage,item.rel);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(source,item.rel),target);
      if(digest(target)!==item.sha256)throw Error('Staged restore hash mismatch: '+item.rel);
    }
    // All source media and staged files are verified before touching the working set.
    for(const rel of old)fs.rmSync(path.join(dir,rel),{force:true});
    for(const item of manifest.files){
      const target=path.join(dir,item.rel);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.renameSync(path.join(stage,item.rel),target);
    }
    // Never restore a previous QA/approval as if the new working state were reviewed.
    fs.rmSync(path.join(dir,'qa-report.json'),{force:true});fs.rmSync(path.join(dir,'semantic-review.json'),{force:true});
    const ss=sceneState(state,scene.id);
    ss.artifacts=structuredClone(manifest.artifactState);
    ss.approved=false;ss.locked=false;
    delete ss.qa;delete ss.approvedAt;delete ss.approvedPreviewHash;delete ss.approvedQaHash;
    invalidateOutput(state);
    const freshness=staleParts(scene,config,ss,root);
    state.history.push({event:'scene-restored',scene:scene.id,version,
      backup:backup?.version||null,at:new Date().toISOString()});
    saveState(root,state);
    return {scene:scene.id,restored:version,preRestoreBackup:backup?.version||null,
      approvalRestored:false,qaRestored:false,
      configMatches:manifest.configHash===sha(config),
      stale:freshness,note:'Run QA and re-approve; stale source/input requires rebuild.'};
  }catch(e){
    // A verified pre-restore backup remains available; never claim partial working bytes are approved.
    const ss=sceneState(state,scene.id);ss.approved=false;ss.locked=false;delete ss.qa;delete ss.approvedPreviewHash;delete ss.approvedQaHash;
    invalidateOutput(state);state.history.push({event:'scene-restore-failed',scene:scene.id,version,backup:backup?.version||null,at:new Date().toISOString()});saveState(root,state);
    throw Error('Restore failed; working scene is unapproved. Recover from verified pre-restore backup '+(backup?.version||'unavailable')+' after inspecting local files.',{cause:e});
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
