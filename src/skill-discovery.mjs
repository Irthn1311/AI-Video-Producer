import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeProject} from './project-intelligence.mjs';
import {avpDir,sha,fileHash,writeJson,readJson} from './utils.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const registryFile=path.join(repoRoot,'config','domain-tools.json');
export const domainRegistry=Object.freeze(readJson(registryFile));
const isSafeId=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const cacheFile=root=>path.join(avpDir(root),'intelligence','external-skill-candidates.json');
const MAX_SEARCHES=3,MAX_PER_SEARCH=3,DAY=24*60*60*1000;
const githubRepo=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

export function validateCapabilityRequirements(config) {
  const required=config.capabilityRequirements;
  if(required===undefined)return;
  if(!Array.isArray(required)||required.length>30||required.some(x=>!isSafeId(x))||
     new Set(required).size!==required.length)
    throw Error('capabilityRequirements must be up to 30 distinct capability IDs');
}

/**
 * Matching means only that a particular AVP file exists, not that the
 * application's domain workflow has ever passed a runtime test.
 */
export function matchProjectCapabilities(root,config,{analysis=analyzeProject(root,config)}={}) {
  validateCapabilityRequirements(config);
  const requested=new Set(config.capabilityRequirements||[]);
  const byId=new Map();
  for(const signal of analysis.capabilitySignals){
    for(const id of signal.neededCapabilities){
      const entry=byId.get(id)||{id,explicitRequired:false,signals:[],sourceEvidence:[]};
      entry.signals.push(signal.id);
      for(const e of signal.evidence||[]){
        if(entry.sourceEvidence.length<6&&!entry.sourceEvidence.some(x=>x.path===e.path&&x.line===e.line))
          entry.sourceEvidence.push(e);
      }
      byId.set(id,entry);
    }
  }
  for(const id of requested){
    const entry=byId.get(id)||{id,explicitRequired:false,signals:[],sourceEvidence:[]};
    entry.explicitRequired=true;byId.set(id,entry);
  }
  const requirements=[...byId.values()].sort((a,b)=>a.id.localeCompare(b.id,'en')).map(item=>{
    const rule=domainRegistry.needs[item.id];
    const bundled=(rule?.bundled||[]).map(x=>{
      const location=path.join(repoRoot,x.path);
      // Paths are owned by the bundled read-only registry; do not accept
      // arbitrary source paths or paths supplied by an untrusted repository.
      if(path.relative(repoRoot,location).startsWith('..'))throw Error('Bundled path escaped repository');
      const exists=fs.existsSync(location)&&fs.lstatSync(location).isFile()&&!fs.lstatSync(location).isSymbolicLink();
      return {id:x.id,type:x.type,path:x.path,exists,
        contentHash:exists?fileHash(location):null,trust:'BUNDLED_LOCAL',
        executionProven:false};
    });
    const impl=bundled.find(x=>x.type==='implementation'&&x.exists);
    const guides=bundled.filter(x=>x.type==='guidance'&&x.exists);
    const status=impl?'BUNDLED_IMPLEMENTATION_AVAILABLE':guides.length?'GUIDANCE_ONLY':'NO_BUNDLED_MATCH';
    return {...item,known:Boolean(rule),status,bundled,candidateFallback:impl?null:'REVIEW_EXTERNAL_RESEARCH_OR_BUILD_ADAPTER',
      externallyInstalled:false,
      runtimeVerified:false,risk:rule?.risk||'unknown',
      queryAvailable:typeof rule?.search==='string'};
  });
  return {
    schemaVersion:1,mode:'LOCAL_MATCHING_NO_EXECUTION',
    sourceFingerprint:analysis.sourceFingerprint,
    registryHash:sha(domainRegistry),
    explicitRequired:[...requested].sort(),
    requirements,
    unresolved:requirements.filter(x=>x.status!=='BUNDLED_IMPLEMENTATION_AVAILABLE')
      .map(x=>({id:x.id,status:x.status,required:x.explicitRequired,reason:x.known?'No bundled implementation for this domain behavior':'Unknown requirement needs manual research'})),
    safeguards:{
      guidanceIsNotExecutable:true,sourceCodeCluesAreNotRuntimeProof:true,
      noExternalSkillInstallation:true,hostToolPresenceIsNotProofOfCapability:true
    }
  };
}
export function recommendSkills(root,config,options={}){
  const matching=matchProjectCapabilities(root,config,options);
  return {...matching,nextSteps:matching.unresolved.length?
    ['Review unverified domain signals and promote truly needed ones to capabilityRequirements in project.json',
     'Optional: avp skills search --online (bounded repository research, never installation)',
     'Assess license, version, permissions, code, OS support and test in isolation before using a new adapter']:
    ['Bundled implementations cover the declared requirements; still run BUILD rehearsal and scene QA']};
}
function safeRepo(item){
  if(!item||typeof item!=='object'||!githubRepo.test(item.full_name||'')||
    item.private===true||item.disabled===true)return null;
  const stars=Number.isSafeInteger(item.stargazers_count)&&item.stargazers_count>=0?item.stargazers_count:0;
  const archived=Boolean(item.archived);
  const spdx=typeof item.license?.spdx_id==='string'&&/^[a-zA-Z0-9.+-]{1,40}$/.test(item.license.spdx_id)?
    item.license.spdx_id:null;
  const pushed=typeof item.pushed_at==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(item.pushed_at)?item.pushed_at:null;
  // This is a prioritization heuristic, NEVER a trust/security conclusion.
  let score=Math.min(25,Math.floor(Math.log10(stars+1)*10))+(spdx&&spdx!=='NOASSERTION'?25:0);
  if(archived)score-=40;
  if(pushed&&Date.parse(pushed)>Date.now()-365*DAY)score+=10;
  return {repository:item.full_name,url:'https://github.com/'+item.full_name,
    defaultBranch:typeof item.default_branch==='string'&&/^[\w./-]{1,70}$/.test(item.default_branch)?
      item.default_branch:null,
    commitSha:null,licenseSpdx:spdx,stars,archived,lastPushedAt:pushed,
    metadataScore:Math.max(0,Math.min(60,score)),
    status:'DISCOVERED_UNREVIEWED_REPOSITORY',
    skillSpecVerified:false,compatibilityVerified:false,permissionsReviewed:false,
    licenseReviewed:false,trialPassed:false,executable:false,
    note:'Search metadata is untrusted. Repository may not contain any Agent Skill.'};
}
async function queryGithub(query,{fetchImpl=globalThis.fetch}={}){
  const url=new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q',query+' in:name,description archived:false');
  url.searchParams.set('per_page',String(MAX_PER_SEARCH));
  url.searchParams.set('sort','stars');
  const response=await fetchImpl(url.toString(),{
    method:'GET',redirect:'error',headers:{Accept:'application/vnd.github+json',
      'User-Agent':'AVP-ReadOnly-Skill-Discovery'},
    signal:AbortSignal.timeout(12000)
  });
  if(!response?.ok)throw Error('GitHub read-only search failed (HTTP '+String(response?.status||'unknown')+
    '). Check network/rate limit; no skill was installed.');
  const body=await response.json();
  if(!Array.isArray(body?.items))throw Error('Unexpected GitHub repository search response');
  return body.items.slice(0,MAX_PER_SEARCH).map(safeRepo).filter(Boolean);
}

/**
 * Network search MUST be user-opted-in and sends only predefined catalog terms.
 * No arbitrary repository source, private feature name, app URL, or secrets.
 * Network results are research candidates, not selectable executable tools.
 */
export async function searchExternalSkills(root,config,{online=false,refresh=false,fetchImpl=globalThis.fetch,now=Date.now()}={}){
  if(online!==true)throw Error('External search requires explicit --online consent; try avp skills recommend for local matching.');
  const matching=matchProjectCapabilities(root,config);
  const selected=matching.requirements.filter(r=>r.status!=='BUNDLED_IMPLEMENTATION_AVAILABLE'&&r.known)
    .slice(0,MAX_SEARCHES);
  const queries=selected.map(x=>({capability:x.id,query:domainRegistry.needs[x.id].search}));
  const cacheKey=sha({sourceFingerprint:matching.sourceFingerprint,registryHash:matching.registryHash,queries});
  const dest=cacheFile(root);
  if(!refresh&&fs.existsSync(dest)){
    const cache=readJson(dest);
    if(cache.cacheKey===cacheKey&&Number.isSafeInteger(cache.expiresAtMs)&&now<cache.expiresAtMs)
      return {...cache,reused:true};
  }
  const result=[];
  for(const q of queries){
    // Do not mix external findings with our trusted built-in tool registry.
    const matches=await queryGithub(q.query,{fetchImpl});
    for(const candidate of matches)result.push({
      id:'github-'+sha(q.capability+'|'+candidate.repository).slice(0,14),
      capability:q.capability,queryKey:q.capability,...candidate
    });
  }
  const snapshot={
    schemaVersion:1,mode:'BOUNDED_GITHUB_REPO_RESEARCH_ONLY',
    cacheKey,sourceFingerprint:matching.sourceFingerprint,registryHash:matching.registryHash,
    generatedAt:new Date(now).toISOString(),expiresAtMs:now+DAY,
    sentToGithub:'Only predefined, non-project-specific capability search terms',
    requestedQueries:queries.map(q=>({capability:q.capability,term:q.query})),
    maxQueries:MAX_SEARCHES,maxRepositoriesPerQuery:MAX_PER_SEARCH,
    candidates:result,omittedUnresolved:matching.unresolved.map(x=>x.id)
      .filter(id=>!queries.some(q=>q.capability===id)),
    installationPerformed:false,codeExecutionPerformed:false,
    approvalGranted:false,versionPinned:false,
    nextSteps:[
      'Human/agent: inspect candidate repository and confirm it actually contains the required skill/tool',
      'Review exact license, maintenance, code, permissions, privacy impact, OS compatibility and pinned commit',
      'Trial safely using explicit permissions before configuring a project adapter; never trust repository search scores'
    ]
  };
  writeJson(dest,snapshot);
  return {...snapshot,reused:false};
}
