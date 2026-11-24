import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {profileNames} from './capabilities.mjs';
import {validateSceneEdit} from './editing.mjs';
import {validateCaptureEvidenceConfig} from './capture-assertions.mjs';
import {validateClaimConfig} from './evidence.mjs';
import {validateCaptionTiming} from './audio-timing.mjs';

export const readJson=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
export function writeJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file);}
export function sha(value){return crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');}
export const fileHash=(file)=>sha(fs.readFileSync(file).toString('base64'));
export const safeName=(value)=>{if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value))throw Error(`Invalid ID: ${value}`);return value;};
export function run(command,args=[],options={}){const p=spawnSync(command,args,{encoding:'utf8',maxBuffer:5*1024*1024,...options});if(p.error)throw Error(`${command} is unavailable: ${p.error.message}`);if(p.status!==0)throw Error(`${command} failed (${p.status}): ${(p.stderr||p.stdout||'').slice(-1600)}`);return p.stdout||'';}
export function available(command){const p=spawnSync(command,['-version'],{encoding:'utf8',timeout:6000});return !p.error && p.status===0? (p.stdout||p.stderr||'').split('\n')[0]:null;}
export function loadEnv(root){const file=path.join(root,'.env');if(!fs.existsSync(file))return;for(const l of fs.readFileSync(file,'utf8').split(/\r?\n/)){let x=l.trim();if(!x||x.startsWith('#'))continue;const m=x.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}
export const isWithin=(base,target)=>{const rel=path.relative(path.resolve(base),path.resolve(target));return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
export function parseArgs(argv){let out={_:[]};for(let i=0;i<argv.length;i++){let t=argv[i];if(!t.startsWith('--'))out._.push(t);else{const [k,v]=t.slice(2).split('=',2);if(v!==undefined)out[k]=v;else if(i+1<argv.length&&!argv[i+1].startsWith('--'))out[k]=argv[++i];else out[k]=true;}}return out;}
export function assertConfig(p){if(p.schemaVersion!==1)throw Error('project.json schemaVersion must be 1');if(p.workflow!==undefined&&(!p.workflow||typeof p.workflow!=='object'||Array.isArray(p.workflow)||typeof p.workflow.requireBuild!=='boolean'))throw Error('workflow.requireBuild must be boolean');if(p.capabilityRequirements!==undefined&&(!Array.isArray(p.capabilityRequirements)||p.capabilityRequirements.length>30||p.capabilityRequirements.some(x=>typeof x!=='string'||!(/^[a-z][a-z0-9-]{0,63}$/).test(x))||new Set(p.capabilityRequirements).size!==p.capabilityRequirements.length))throw Error('capabilityRequirements must be up to 30 distinct capability IDs');if(p.optimization?.profile!=null&&!profileNames.includes(p.optimization.profile))throw Error('optimization.profile must be economy, balanced, or quality');if(p.module!=='software-demo')throw Error('v0.1 supports software-demo only');if(!['review','autonomous'].includes(p.review?.mode))throw Error('review.mode must be review or autonomous');if(!Array.isArray(p.scenes)||!p.scenes.length)throw Error('At least one scene required');
  if(p.voiceover?.enabled!==false&&p.voiceover?.provider!=='gemini')throw Error('v0.1 supports Gemini voice provider only');
  if(p.voiceover?.maxApiCallsPerRun!==undefined&&(!Number.isInteger(p.voiceover.maxApiCallsPerRun)||p.voiceover.maxApiCallsPerRun<1))throw Error('Invalid voiceover.maxApiCallsPerRun');
  if(p.voiceover?.estimatedUsdPerCall!=null&&(!Number.isFinite(p.voiceover.estimatedUsdPerCall)||p.voiceover.estimatedUsdPerCall<=0))throw Error('Invalid voiceover.estimatedUsdPerCall');
  if(p.budget?.maxEstimatedUsd!=null&&(!Number.isFinite(p.budget.maxEstimatedUsd)||p.budget.maxEstimatedUsd<=0))throw Error('Invalid budget.maxEstimatedUsd');const ids=new Set();for(const s of p.scenes){safeName(s.id);if(ids.has(s.id))throw Error('Duplicate scene ID '+s.id);ids.add(s.id);if(typeof s.durationSec!=='number'||s.durationSec<1||s.durationSec>900)throw Error('Invalid duration for '+s.id);if(!Array.isArray(s.capture?.actions))throw Error('Capture actions required for '+s.id);if(typeof s.narration!=='string')throw Error('narration must be a string for '+s.id);validateSceneEdit(s);validateCaptureEvidenceConfig(s.capture);validateCaptionTiming(s,p);}validateClaimConfig(p);return p;}
export function getProject(dir){const root=path.resolve(dir);const p=path.join(root,'project.json');if(!fs.existsSync(p))throw Error(`Project missing: ${p}. Run avp init`);return {root,config:assertConfig(readJson(p))};}
export const avpDir=root=>path.join(root,'.avp');
export const sceneDir=(root,id)=>path.join(avpDir(root),'scenes',safeName(id));
export function atomicWrite(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,data);fs.renameSync(temp,file);}
