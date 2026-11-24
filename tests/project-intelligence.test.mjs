import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {analyzeProject,inspectProject} from '../src/project-intelligence.mjs';
import {readJson,writeJson} from '../src/utils.mjs';
import {prepareBuild} from '../src/build.mjs';

const rootRepo=path.resolve(import.meta.dirname,'..');
const template=readJson(path.join(rootRepo,'templates/project.json'));
function fixture(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-intelligence-'));
  const config=structuredClone(template);
  config.sourcePath='app';config.appUrl='http://127.0.0.1:4399';
  for(const [file,body] of Object.entries(files)){
    const target=path.join(root,'app',file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,body);
  }
  writeJson(path.join(root,'project.json'),config);
  return {root,config};
}
const cleanup=f=>fs.rmSync(f.root,{recursive:true,force:true});
const ids=result=>result.capabilitySignals.map(x=>x.id);

test('unknown canvas + realtime multi-device project yields domain-specific discovery requirements',()=>{
  const f=fixture({
    'package.json':JSON.stringify({name:'private-project',dependencies:{react:'*',vite:'*','socket.io-client':'*'},
      scripts:{dev:'node -e "process.exit(30)"'}}),
    'src/Canvas.tsx':"export const draw = (el) => el.getContext('2d'); el.addEventListener('pointermove', onMove);",
    'src/pair.js':"const pairingCode = 'temporary'; const ws = new WebSocket('ws://localhost:3000');",
    'src/pages/index.tsx':"export default function Home(){ return <canvas />; }",
    '.env':"SECRET_PRIVATE_TEST_MARKER=must_not_appear",
    'src/mysecret.key':"PRIVATE_DO_NOT_READ"
  });
  try{
    const x=analyzeProject(f.root,f.config);
    assert.equal(x.analysisLevel,'BOUNDED_STATIC_REPO_DISCOVERY');
    assert.equal(x.runtime.verified,false);
    assert.ok(x.technology.some(v=>v.id==='react'));
    assert.ok(x.technology.some(v=>v.id==='vite'));
    assert.ok(ids(x).includes('canvas-interaction'),JSON.stringify(x.capabilitySignals));
    assert.ok(ids(x).includes('multi-device-pairing'));
    assert.ok(ids(x).includes('realtime-events'));
    assert.ok(x.routes.some(r=>r.path==='/'));
    assert.ok(x.runtime.launchCandidates.some(x=>x.kind==='script-name-only'&&x.script==='dev'));
    assert.equal(JSON.stringify(x).includes('process.exit'),false);
    assert.equal(JSON.stringify(x).includes('SECRET_PRIVATE_TEST_MARKER'),false);
    assert.equal(JSON.stringify(x).includes('PRIVATE_DO_NOT_READ'),false);
    assert.ok(x.capabilitySignals.every(s=>s.runtimeVerified===false));
    const stored=inspectProject(f.root,f.config);
    assert.deepEqual(readJson(path.join(f.root,'.avp','intelligence','project-analysis.json')),stored);
  }finally{cleanup(f);}
});

test('unknown dashboard/API domain produces a different capability profile',()=>{
  const f=fixture({
    'package.json':JSON.stringify({dependencies:{express:'^5',recharts:'^2'},scripts:{start:'node server.js'}}),
    'src/server.js':"app.get('/api/metrics', handler); app.post('/api/filter', change);",
    'src/Dashboard.tsx':"import {ResponsiveContainer} from 'recharts'; const chart=<ResponsiveContainer />;",
    'src/pages/analytics.tsx':"export default function Analytics(){ return null; }",
    'README.md':'# Dashboard — chart feature described in docs only'
  });
  try{
    const x=analyzeProject(f.root,f.config);
    assert.ok(x.technology.some(v=>v.id==='express'));
    assert.ok(ids(x).includes('charts-dashboard'));
    assert.equal(ids(x).includes('canvas-interaction'),false);
    assert.equal(ids(x).includes('multi-device-pairing'),false);
    assert.ok(x.routes.some(r=>r.path==='/api/metrics'&&r.method==='GET'));
    assert.ok(x.routes.some(r=>r.path==='/api/filter'&&r.method==='POST'));
    assert.ok(x.routes.some(r=>r.path==='/analytics'));
    assert.ok(x.routes.every(r=>r.evidence?.path));
    assert.ok(x.runtime.launchCandidates.some(r=>r.script==='start'));
  }finally{cleanup(f);}
});

test('Python FastAPI streaming app is detected but source route cannot be labeled verified',()=>{
  const f=fixture({
    'requirements.txt':'fastapi>=0.100\nuvicorn==0.30',
    'src/api.py':"from fastapi import FastAPI\napp = FastAPI()\n@app.get('/chat')\nasync def chat(): return StreamingResponse(chunks, media_type='text/event-stream')"
  });
  try{
    const x=analyzeProject(f.root,f.config);
    assert.ok(x.technology.some(t=>t.id==='fastapi'));
    assert.ok(x.routes.some(r=>r.path==='/chat'&&r.method==='GET'));
    assert.ok(ids(x).includes('streaming-response'));
    assert.equal(x.runtime.verified,false);
    assert.equal(x.routes.some(r=>r.verified===true),false);
  }finally{cleanup(f);}
});

test('content changes invalidate evidence and Build uses source-derived intelligence without declaring verified features',()=>{
  const f=fixture({
    'package.json':JSON.stringify({dependencies:{recharts:'*'},scripts:{dev:'echo test'}}),
    'src/pages/insights.tsx':'const view=<ResponsiveContainer />;'
  });
  try{
    const a=analyzeProject(f.root,f.config);
    const b=analyzeProject(f.root,f.config);
    assert.deepEqual(a,b,'Analysis is deterministic; no changing scan timestamp');
    const cli=(...args)=>spawnSync(process.execPath,[path.join(rootRepo,'bin','avp.mjs'),...args,'--project',f.root],{encoding:'utf8',timeout:15000});
    assert.equal(cli('plan').status,0);
    const build=prepareBuild(f.root,f.config);
    assert.equal(build.status,'PENDING_GATE');
    const profile=readJson(path.join(f.root,'.avp','build','project-profile.json'));
    const inventory=readJson(path.join(f.root,'.avp','build','feature-inventory.json'));
    const cap=readJson(path.join(f.root,'.avp','build','capability-profile.json'));
    assert.ok(profile.detectedRoutes.some(r=>r.path==='/insights'));
    assert.ok(inventory.sourceDiscoveredCandidates.some(r=>r.route==='/insights'));
    assert.ok(cap.projectCapabilityNeeds.some(r=>r.id==='charts-dashboard'));
    assert.ok(inventory.sourceDiscoveredCandidates.every(r=>r.runtimeVerified===false));
    assert.ok(inventory.features.every(r=>r.status==='CANDIDATE_NOT_RUNTIME_VERIFIED'));
    const plan=readJson(path.join(f.root,'.avp','build','production-plan.json'));
    assert.equal(plan.projectIntelligenceHash,profile.projectIntelligenceHash);
    const result=cli('analyze');
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).sourceFingerprint,a.sourceFingerprint);
    fs.writeFileSync(path.join(f.root,'app','src','pages','insights.tsx'),
      'const view=<ResponsiveContainer />; // changed with new feature');
    assert.notEqual(analyzeProject(f.root,f.config).sourceFingerprint,a.sourceFingerprint);
  }finally{cleanup(f);}
});

test('bounded analysis never imports or executes application code or scripts',()=>{
  const f=fixture({
    'package.json':JSON.stringify({scripts:{postinstall:'node ./malicious.js',dev:'node ./malicious.js'}}),
    'malicious.js':"require('node:fs').writeFileSync('/tmp/avp-should-not-run', 'wrong');",
    'src/large.ts':'const value=1;\n'.repeat(200)
  });
  const unexpected=path.join(f.root,'MUST_NOT_EXIST');
  try{
    const result=analyzeProject(f.root,f.config,{maxFiles:1,maxBytes:4096});
    assert.equal(result.scanned.truncated,true);
    assert.ok(result.runtime.launchCandidates.some(x=>x.kind==='script-name-only'&&x.script==='dev'));
    assert.equal(fs.existsSync(unexpected),false);
    assert.throws(()=>analyzeProject(f.root,f.config,{maxFiles:-1}),/Invalid bounded/);
  }finally{cleanup(f);}
});
