import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {avpDir,fileHash,readJson,writeJson,sha} from './utils.mjs';
import {validateFinalOutput} from './state.mjs';

const folder=root=>path.join(avpDir(root),'releases');
const files=['final.mp4','final-qa.json','final.srt','final-report.json'];
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function verify(root,id){
  if(!hash(id))throw Error('Invalid release ID');
  const dir=path.join(folder(root),id),m=readJson(path.join(dir,'manifest.json'));
  if(m.schemaVersion!==1||sha(m.identity)!==id||!Array.isArray(m.identity.files)||m.identity.files.length<2)throw Error('Invalid release manifest');
  const seen=new Set();
  for(const f of m.identity.files){
    if(!files.includes(f.name)||seen.has(f.name)||!hash(f.hash))throw Error('Invalid release entry');
    seen.add(f.name);const dest=path.join(dir,f.name);
    if(!fs.lstatSync(dest).isFile()||fileHash(dest)!==f.hash||fs.statSync(dest).size!==f.bytes)throw Error('Release file integrity failure');
  }
  if(!seen.has('final.mp4')||!seen.has('final-qa.json'))throw Error('Incomplete release');
  return {releaseId:id,files:m.identity.files,approval:m.identity.approval,createdAt:m.createdAt,status:'VERIFIED_ARCHIVE'};
}
export function listReleases(root){
  if(!fs.existsSync(folder(root)))return [];
  return fs.readdirSync(folder(root),{withFileTypes:true}).filter(x=>x.isDirectory()&&hash(x.name)).map(x=>verify(root,x.name));
}
export function archiveRelease(root,config,state,{confirm=false}={}){
  if(!confirm)throw Error('Review output and use release archive --confirm');
  const report=validateFinalOutput(root,config,state),review=state.reviews?.final;
  if(config.review.mode==='review'&&(review?.outputHash!==report.outputHash||review.qaHash!==state.output.qaHash||review.inputHash!==state.output.inputHash||!review.approvedAt))
    throw Error('Explicit current final approval required for review-mode release');
  const output=path.join(avpDir(root),'output'),names=files.filter(n=>fs.existsSync(path.join(output,n)));
  // Only include optional sidecars if bound by current final QA.
  const selected=names.filter(n=>n==='final.mp4'||n==='final-qa.json'||report.qualityExport);
  const identity={configHash:sha(config),outputHash:report.outputHash,qaHash:state.output.qaHash,inputHash:state.output.inputHash,
    approval:config.review.mode==='review'?'OPERATOR_FINAL_APPROVAL':'AUTONOMOUS_TECHNICAL_PASS',
    files:selected.map(name=>{const f=path.join(output,name);if(!fs.lstatSync(f).isFile())throw Error('Nonregular release file');return {name,hash:fileHash(f),bytes:fs.statSync(f).size};})};
  const id=sha(identity),base=folder(root),dest=path.join(base,id);
  if(fs.existsSync(dest))return verify(root,id);
  fs.mkdirSync(base,{recursive:true});
  if(fs.readdirSync(base).filter(hash).length>=20)throw Error('Release archive limit reached; archive externally before proceeding');
  const stage=path.join(base,'.staging-'+randomUUID());fs.mkdirSync(stage);
  try{
    for(const f of identity.files){const target=path.join(stage,f.name);fs.copyFileSync(path.join(output,f.name),target);
      if(fileHash(target)!==f.hash||fs.statSync(target).size!==f.bytes)throw Error('Release changed while archiving');}
    writeJson(path.join(stage,'manifest.json'),{schemaVersion:1,identity,createdAt:new Date().toISOString()});
    fs.renameSync(stage,dest);return verify(root,id);
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
export const verifyRelease=verify;
