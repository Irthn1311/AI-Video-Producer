import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson} from '../src/utils.mjs';
import {matchProjectCapabilities,recommendSkills,searchExternalSkills} from '../src/skill-discovery.mjs';
import {prepareBuild,checkBuild} from '../src/build.mjs';
import {loadState} from '../src/state.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const template=readJson(path.join(repo,'templates/project.json'));
const cli=(root,...args)=>spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],{encoding:'utf8',timeout:18000});
function fixture(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-skill-discovery-'));
  const config=structuredClone(template);
  config.sourcePath='app';config.voiceover.enabled=false;
  for(const [file,body] of Object.entries(files)){
    const target=path.join(root,'app',file);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);
  }
  writeJson(path.join(root,'project.json'),config);
  return {root,config};
}
const clean=f=>fs.rmSync(f.root,{recursive:true,force:true});
const need=(p,id)=>p.requirements.find(x=>x.id===id);

test('domain-specific matching distinguishes bundled implementation from documentation',()=>{
  const f=fixture({
    'src/Canvas.tsx':"const ctx = el.getContext('2d'); el.addEventListener('pointermove', draw);",
    'src/Pairing.ts':"const pairingCode='abc'; const socket=new WebSocket('wss://fixture.invalid');"
  });
  try{
    const plan=matchProjectCapabilities(f.root,f.config);
    assert.equal(plan.mode,'LOCAL_MATCHING_NO_EXECUTION');
    assert.equal(need(plan,'pointer-interaction').status,'GUIDANCE_ONLY');
    assert.equal(need(plan,'multi-context-browser').status,'GUIDANCE_ONLY');
    assert.equal(need(plan,'websocket-observation').status,'GUIDANCE_ONLY');
    assert.ok(need(plan,'pointer-interaction').bundled[0].contentHash);
    assert.equal(need(plan,'multi-context-browser').runtimeVerified,false);
    assert.ok(plan.unresolved.some(x=>x.id==='multi-context-browser'));
    assert.equal(plan.safeguards.noExternalSkillInstallation,true);
    assert.deepEqual(matchProjectCapabilities(f.root,f.config),plan);
  }finally{clean(f);}
});
test('dashboard needs a different, minimal skill set and reuses bundled real assertions',()=>{
  const f=fixture({'package.json':JSON.stringify({dependencies:{recharts:'^2'}}),
    'src/Dashboard.tsx':"const component=<ResponsiveContainer/>;"});
  try{
    const plan=recommendSkills(f.root,f.config);
    assert.equal(need(plan,'data-assertions').status,'BUNDLED_IMPLEMENTATION_AVAILABLE');
    assert.equal(need(plan,'chart-interaction').status,'GUIDANCE_ONLY');
    assert.equal(need(plan,'pointer-interaction'),undefined);
    assert.equal(need(plan,'data-assertions').bundled[0].type,'implementation');
    assert.equal(plan.unresolved.some(x=>x.id==='data-assertions'),false);
  }finally{clean(f);}
});
test('Build gate blocks explicitly required non-implemented project abilities',()=>{
  const f=fixture({'src/Canvas.tsx':"const canvas=<canvas/>;"});
  try{
    f.config.capabilityRequirements=['multi-context-browser'];
    writeJson(path.join(f.root,'project.json'),f.config);
    assert.equal(cli(f.root,'plan').status,0);
    prepareBuild(f.root,f.config);
    const report=checkBuild(f.root,f.config,loadState(f.root));
    assert.equal(report.status,'BLOCKED');
    assert.ok(report.problems.some(x=>x.code==='BUILD_REQUIRED_CAPABILITY_MISSING'));
    const profile=readJson(path.join(f.root,'.avp','build','capability-profile.json'));
    assert.equal(profile.explicitRequired[0],'multi-context-browser');
    const lock=readJson(path.join(f.root,'.avp','build','toolchain-lock.json'));
    assert.equal(lock.domainCapabilityLock.externalSkillsExecuted,false);
    assert.ok(lock.domainCapabilityLock.requirements.some(x=>x.id==='multi-context-browser'));
  }finally{clean(f);}
});
test('required bundled implementation is recognized without equating presence with runtime proof',()=>{
  const f=fixture({'src/dashboard.tsx':'const el=<ResponsiveContainer />;'});
  try{
    f.config.capabilityRequirements=['data-assertions'];writeJson(path.join(f.root,'project.json'),f.config);
    assert.equal(cli(f.root,'plan').status,0);
    prepareBuild(f.root,f.config);
    const result=checkBuild(f.root,f.config,loadState(f.root));
    assert.equal(result.problems.some(x=>x.code==='BUILD_REQUIRED_CAPABILITY_MISSING'),false);
    assert.equal(need(matchProjectCapabilities(f.root,f.config),'data-assertions').runtimeVerified,false);
  }finally{clean(f);}
});
test('read-only GitHub research uses predefined terms, filters invalid metadata and caches by source',async()=>{
  const f=fixture({
    'src/Canvas.tsx':"const draw=el.getContext('2d'); el.addEventListener('pointermove', draw);",
    'src/pair.js':"const pairingCode='x'; const ws=new WebSocket('wss://private.example');",
    'src/Dashboard.tsx':"const chart=<ResponsiveContainer />;"
  });
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url,options});
    const q=new URL(url);
    assert.equal(q.hostname,'api.github.com');
    assert.ok(q.searchParams.get('q').includes(' in:name,description archived:false'));
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,undefined);
    assert.ok(!url.includes('private.example'));
    return {ok:true,status:200,json:async()=>({items:[
      {full_name:'example/repo-skill',stargazers_count:120,pushed_at:'2026-10-22T11:00:00Z',
        license:{spdx_id:'MIT'},default_branch:'main'},
      {full_name:'INVALID/../../traversal',stargazers_count:999,license:{spdx_id:'MIT'}},
      {full_name:'example/archived',archived:true,stargazers_count:10000,license:{spdx_id:'NOASSERTION'}}
    ]})};
  };
  try{
    assert.throws(()=>searchExternalSkills(f.root,f.config,{online:false}),/--online/);
    const now=Date.parse('2026-11-24T08:00:00Z');
    const result=await searchExternalSkills(f.root,f.config,{online:true,fetchImpl,now});
    assert.equal(result.mode,'BOUNDED_GITHUB_REPO_RESEARCH_ONLY');
    assert.ok(result.requestedQueries.length<=3);
    assert.equal(calls.length,result.requestedQueries.length);
    assert.ok(result.candidates.length>0);
    assert.ok(result.candidates.every(x=>x.status==='DISCOVERED_UNREVIEWED_REPOSITORY'));
    assert.ok(result.candidates.every(x=>x.executable===false&&x.commitSha===null));
    assert.ok(result.candidates.every(x=>x.url.startsWith('https://github.com/')));
    assert.ok(result.candidates.every(x=>x.repository!=='INVALID/../../traversal'));
    assert.equal(result.installationPerformed,false);
    assert.equal(result.approvalGranted,false);
    const cache=await searchExternalSkills(f.root,f.config,{online:true,now:now+1000,
      fetchImpl:()=>{throw Error('Network should not be called for a fresh cache');}});
    assert.equal(cache.reused,true);
    fs.writeFileSync(path.join(f.root,'app','src','Pairing.ts'),'const pairingCode=99;');
    const refreshed=await searchExternalSkills(f.root,f.config,{online:true,now:now+2000,fetchImpl});
    assert.equal(refreshed.reused,false);
    assert.notEqual(refreshed.cacheKey,result.cacheKey);
    assert.ok(calls.length>result.requestedQueries.length);
    const saved=readJson(path.join(f.root,'.avp','intelligence','external-skill-candidates.json'));
    assert.equal(saved.cacheKey,refreshed.cacheKey);
  }finally{clean(f);}
});
test('external searches fail closed and never accept arbitrary app queries',async()=>{
  const f=fixture({'src/Canvas.ts':'el.getContext("2d")'});
  try{
    await assert.rejects(searchExternalSkills(f.root,f.config,{online:true,fetchImpl:async()=>({ok:false,status:403})}),/HTTP 403/);
    assert.equal(fs.existsSync(path.join(f.root,'.avp','intelligence','external-skill-candidates.json')),false);
    const cliNoConsent=cli(f.root,'skills','search');
    assert.equal(cliNoConsent.status,1);
    assert.match(cliNoConsent.stderr,/--online/);
    const local=cli(f.root,'skills','recommend');
    assert.equal(local.status,0,local.stderr);
    assert.equal(JSON.parse(local.stdout).mode,'LOCAL_MATCHING_NO_EXECUTION');
  }finally{clean(f);}
});
test('invalid explicit requirement IDs fail fast rather than creating executable tool names',()=>{
  const f=fixture({'src/main.js':'const app=1;'});
  try{
    f.config.capabilityRequirements=['../../evil'];
    assert.throws(()=>matchProjectCapabilities(f.root,f.config),/capabilityRequirements/);
    f.config.capabilityRequirements=['data-assertions','data-assertions'];
    assert.throws(()=>matchProjectCapabilities(f.root,f.config),/capabilityRequirements/);
  }finally{clean(f);}
});
