import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writeJson,sha,isWithin,avpDir} from './utils.mjs';

const excluded=new Set(['.git','node_modules','.next','dist','build','coverage','.venv','venv','.avp','.tmp','graphify-out','vendor','.cache','target','out']);
const sensitive=/^\.env|secret|credential|\.pem$|\.key$|password|token/i;
const sourceFile=/\.(js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|md|json|yml|yaml|toml|html|css|vue|svelte)$/i;
// Recognized metadata manifests: include these exactly, not arbitrary .txt or .xml files.
const manifestFile=/^(?:requirements(?:-[a-z0-9_-]+)?\.txt|go\.mod|pom\.xml)$/i;

/** Deterministic, local-only content fingerprint. Does not read secrets, symlinks or dependencies. */
export function scanSource(root,config){
  const source=path.resolve(root,config.sourcePath||'.');
  if(!fs.existsSync(source)||!fs.statSync(source).isDirectory())throw Error('sourcePath must reference an existing directory');
  const files=[];let skipped=0,visited=0;
  const walk=(dir,depth=0)=>{
    if(depth>12)return;
    for(const ent of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      if(visited++>100000)throw Error('Large source: adjust scope');
      if(ent.isSymbolicLink())continue;
      const full=path.join(dir,ent.name);
      if(!isWithin(source,full))continue;
      if(ent.isDirectory()){
        if(!excluded.has(ent.name)&&!ent.name.startsWith('.git'))walk(full,depth+1);
      }else if(ent.isFile()){
        if(sensitive.test(ent.name)||ent.name.includes('.private.')){skipped++;continue;}
        const stat=fs.statSync(full);
        if(stat.size>512000||(!sourceFile.test(ent.name)&&!manifestFile.test(ent.name))){skipped++;continue;}
        const relative=path.relative(source,full).replaceAll('\\','/');
        if(source===path.resolve(root)&&relative==='project.json')continue;
        const digest=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
        files.push({path:relative,bytes:stat.size,sha256:digest});
      }
    }
  };
  walk(source);
  files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  return {source,files,skipped,contentFingerprint:sha(files)};
}
export function sourceFingerprint(root,config){return scanSource(root,config).contentFingerprint;}
export function inspect(root,config){
  const {source,files,skipped,contentFingerprint}=scanSource(root,config);
  const important=files.filter(f=>/(^|\/)(README\.md|package\.json|pyproject\.toml|requirements\.txt|vite\.config\.[^/]+|next\.config\.[^/]+|main\.[^/]+|app\.[^/]+)$/i.test(f.path)).slice(0,40);
  const ui=files.filter(f=>/(page|route|screen|view|component|src\/app|src\/pages)/i.test(f.path)).slice(0,100);
  const report={schemaVersion:1,source,scannedAt:new Date().toISOString(),fileCount:files.length,skipped,important,uiCandidates:ui,allPathsHash:contentFingerprint,contentFingerprint,limitations:['Static inventory is not proof of runtime features','Files above 512KB, secrets, binaries and dependencies are excluded','Source changes anywhere inside scope conservatively invalidate capture; narrow sourcePath for efficiency']};
  writeJson(path.join(avpDir(root),'intelligence','inventory.json'),report);
  return report;
}
