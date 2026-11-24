import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson} from '../src/utils.mjs';
import {loadState,inputHashes} from '../src/state.mjs';
import {scaffoldAdapter,approveAdapter,adapterStatus,requireAdapterReady,adapterPath,
  validateAdapterManifest,adapterFingerprint} from '../src/adapters.mjs';
import {prepareBuild,checkBuild} from '../src/build.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const cfg=readJson(path.join(repo,'templates','project.json'));
const cli=(root,...args)=>spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],
  {encoding:'utf8',timeout:16000});
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-adapter-contract-'));
  fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','main.js'),'export const example = 1;');
  const config=structuredClone(cfg);config.sourcePath='app';config.voiceover.enabled=false;
  config.workflow={requireBuild:true};config.appUrl='http://127.0.0.1:4123';
  const scene=config.scenes[0];
  scene.capture={adapter:'project-flow',actions:[],evidencePolicy:{requireAssertions:true,failOnPageError:true}};
  config.scenes=[scene];config.capabilityRequirements=['app-feature-demo'];
  writeJson(path.join(root,'project.json'),config);
  return {root,config,scene,manifest:()=>adapterPath(root,'project-flow')};
}
const clean=f=>fs.rmSync(f.root,{recursive:true,force:true});
test('project adapter manifest scaffolds locally, never runs downloaded code, and requires review',()=>{
  const f=fixture();
  try{
    const sc=scaffoldAdapter(f.root,f.config,f.scene,{id:'project-flow',capabilities:['app-feature-demo']});
    assert.equal(sc.status,'DRAFT_UNREVIEWED');
    assert.equal(adapterStatus(f.root,f.config,f.scene).status,'REVIEW_REQUIRED');
    assert.throws(()=>requireAdapterReady(f.root,f.config,f.scene),/ADAPTER GATE/);
    const manifest=readJson(f.manifest());
    assert.equal(manifest.kind,'declarative-playwright');
    assert.equal(manifest.permissions.subprocess,false);
    assert.equal(manifest.permissions.filesystem,'none');
    assert.equal(manifest.provenance.commit,null);
    assert.throws(()=>approveAdapter(f.root,f.config,f.scene),/--confirm/);
    assert.throws(()=>scaffoldAdapter(f.root,f.config,f.scene,{id:'project-flow',capabilities:['app-feature-demo']}),/overwrite/);
    const before=inputHashes(f.scene,f.config,{},f.root).capture;
    const approved=approveAdapter(f.root,f.config,f.scene,{confirm:true});
    assert.equal(approved.status,'REVIEWED_AWAITING_TRIAL');
    assert.equal(adapterStatus(f.root,f.config,f.scene).status,'TRIAL_REQUIRED');
    assert.notEqual(inputHashes(f.scene,f.config,{},f.root).capture,before);
    assert.equal(cli(f.root,'adapters','status','--scene',f.scene.id).status,0);
    const denied=cli(f.root,'adapters','trial','--scene',f.scene.id);
    assert.notEqual(denied.status,0);
    assert.match(denied.stderr,/--allow-actions/);
  }finally{clean(f);}
});
test('unsupported script, expanded permissions and malicious paths fail closed',()=>{
  const f=fixture();
  try{
    scaffoldAdapter(f.root,f.config,f.scene,{id:'project-flow',capabilities:['app-feature-demo']});
    const original=readJson(f.manifest());
    for(const [key,mutate] of [
      ['script-action',m=>m.actions.push({type:'eval',script:'process.exit(0)'})],
      ['external-command',m=>m.permissions.subprocess=true],
      ['secret-access',m=>m.permissions.secrets=true],
      ['foreign-origin',m=>m.appOrigin='https://example.com'],
      ['url-redirect',m=>m.actions[0].path='//evil.invalid'],
      ['code-smuggling',m=>m.actions[0].command='rm -rf /'],
      ['foreign-source',m=>m.provenance.repository='https://github.com/someone/unknown']
    ]){
      const m=structuredClone(original);mutate(m);
      assert.throws(()=>validateAdapterManifest(m,f.config,f.scene),undefined,key);
    }
    assert.throws(()=>scaffoldAdapter(f.root,f.config,f.scene,{id:'../escape',capabilities:['app-feature-demo']}),/Invalid ID/);
    const s=structuredClone(original);s.actions[0].path='/changed';
    writeJson(f.manifest(),s);
    assert.equal(adapterStatus(f.root,f.config,f.scene).status,'REVIEW_REQUIRED');
    const approval=approveAdapter(f.root,f.config,f.scene,{confirm:true});
    s.actions[0].path='/changed-again';writeJson(f.manifest(),s);
    assert.equal(adapterStatus(f.root,f.config,f.scene).status,'REVIEW_REQUIRED');
    assert.throws(()=>requireAdapterReady(f.root,f.config,f.scene),/ADAPTER GATE/);
    assert.ok(adapterFingerprint(f.root,f.config,f.scene).manifestHash);
    assert.ok(approval.approvalHash);
  }finally{clean(f);}
});
test('a forged PASS JSON without receipt, or a status fabricated from a failed trial, never passes Build',()=>{
  const f=fixture();
  try{
    scaffoldAdapter(f.root,f.config,f.scene,{id:'project-flow',capabilities:['app-feature-demo']});
    approveAdapter(f.root,f.config,f.scene,{confirm:true});
    const d=path.dirname(f.manifest());
    writeJson(path.join(d,'trial-report.json'),{schemaVersion:1,status:'PASS',sceneId:f.scene.id,
      adapterId:'project-flow',assertions:[{id:'replace-me',pass:true}]});
    assert.equal(adapterStatus(f.root,f.config,f.scene).status,'TRIAL_REQUIRED');
    assert.equal(cli(f.root,'plan').status,0);
    const prepared=prepareBuild(f.root,f.config);
    assert.equal(prepared.status,'PENDING_GATE');
    const r=checkBuild(f.root,f.config,loadState(f.root));
    assert.equal(r.status,'BLOCKED');
    assert.ok(r.problems.some(x=>x.code==='BUILD_ADAPTER_UNVERIFIED'));
    assert.ok(r.problems.some(x=>x.code==='BUILD_REQUIRED_CAPABILITY_MISSING'));
    const lock=readJson(path.join(f.root,'.avp','build','toolchain-lock.json'));
    assert.equal(lock.domainCapabilityLock.projectAdapters[0].status,'TRIAL_REQUIRED');
    assert.equal(lock.domainCapabilityLock.externalSkillsExecuted,false);
  }finally{clean(f);}
});
test('read-only project adapter CLI offers safe status/preview without executing a script',()=>{
  const f=fixture();
  try{
    const cliFixture=cli(f.root,'adapters','init','--scene',f.scene.id,'--id','project-flow','--capability','app-feature-demo');
    assert.equal(cliFixture.status,0,cliFixture.stderr);
    const denied=cli(f.root,'adapters','approve','--scene',f.scene.id);
    assert.notEqual(denied.status,0);
    const approved=cli(f.root,'adapters','approve','--scene',f.scene.id,'--confirm');
    assert.equal(approved.status,0,approved.stderr);
    assert.equal(JSON.parse(approved.stdout).status,'REVIEWED_AWAITING_TRIAL');
  }finally{clean(f);}
});
test('legacy scenes retain original capture fingerprints without project adapters',()=>{
  const f=fixture();
  try{
    delete f.scene.capture.adapter;
    f.scene.capture.actions=[{type:'goto',path:'/'}];
    const a=inputHashes(f.scene,f.config,{},f.root).capture;
    const b=inputHashes(f.scene,f.config,{},f.root).capture;
    assert.equal(a,b);
    assert.equal(adapterFingerprint(f.root,f.config,f.scene),null);
  }finally{clean(f);}
});
