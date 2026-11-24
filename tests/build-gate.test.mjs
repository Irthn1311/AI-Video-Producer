import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson} from '../src/utils.mjs';
import {loadState} from '../src/state.mjs';
import {prepareBuild,checkBuild,requiresBuild,requireBuildGate,requiredTools} from '../src/build.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const template=readJson(path.join(repo,'templates','project.json'));
const cli=(root,...args)=>spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),...args,'--project',root],
  {encoding:'utf8',timeout:25000});

function setup({newInit=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-build-gate-test-'));
  fs.mkdirSync(path.join(root,'app'));
  fs.writeFileSync(path.join(root,'app','main.js'),'export const product = 1;');
  const config=structuredClone(template);
  config.sourcePath='app';config.workflow={requireBuild:true};
  writeJson(path.join(root,'project.json'),config);
  return {root,config,state:loadState(root)};
}
const cleanup=f=>fs.rmSync(f.root,{recursive:true,force:true});

test('init opts new projects into the required two-phase Build workflow',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-new-build-init-'));
  try{
    const dest=path.join(root,'demo');
    const c=spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),'init',dest],{encoding:'utf8'});
    assert.equal(c.status,0,c.stderr);
    assert.equal(readJson(path.join(dest,'project.json')).workflow.requireBuild,true);
    const denied=cli(dest,'run');
    assert.notEqual(denied.status,0);
    assert.match(denied.stderr,/BUILD GATE BLOCKED/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('prepare generates canonical artifacts but never declares an untested repo READY',()=>{
  const f=setup();
  try{
    assert.equal(cli(f.root,'plan').status,0);
    const first=prepareBuild(f.root,f.config,{});
    assert.equal(first.status,'PENDING_GATE');
    const folder=path.join(f.root,'.avp','build');
    const names=['project-profile','feature-inventory','capability-profile','toolchain-lock',
      'creative-brief','storyboard','production-plan','build-report'];
    for(const n of names.slice(0,-1))assert.ok(fs.existsSync(path.join(folder,n+'.json')),n);
    const profile=readJson(path.join(folder,'project-profile.json'));
    assert.equal(profile.analysisLevel,'STATIC_FILE_INVENTORY_ONLY');
    assert.equal(profile.sourceFingerprint,first.sourceFingerprint??profile.sourceFingerprint);
    const features=readJson(path.join(folder,'feature-inventory.json'));
    assert.ok(features.features.every(x=>x.status==='CANDIDATE_NOT_RUNTIME_VERIFIED'));
    const plan=readJson(path.join(folder,'production-plan.json'));
    assert.equal(plan.scenes.length,f.config.scenes.length);
    assert.equal(plan.scenes[0].captureRecipe.actions[0].type,'goto');
    assert.ok(plan.scenes[0].captureInputHash);
    const r=checkBuild(f.root,f.config,f.state);
    assert.equal(r.status,'BLOCKED');
    assert.ok(r.problems.some(x=>x.code==='BUILD_REHEARSAL_MISSING'));
    assert.throws(()=>requireBuildGate(f.root,f.config,f.state),/BUILD GATE BLOCKED/);
    assert.equal(prepareBuild(f.root,f.config).reused,true);
    const before=fs.statSync(path.join(folder,'production-plan.json')).mtimeMs;
    assert.equal(prepareBuild(f.root,f.config).reused,true);
    assert.equal(fs.statSync(path.join(folder,'production-plan.json')).mtimeMs,before);
  }finally{cleanup(f);}
});
test('unfrozen Build fails before capture, TTS, preview, QA or final rendering',()=>{
  const f=setup();
  try{
    assert.equal(cli(f.root,'plan').status,0);
    assert.equal(cli(f.root,'build','prepare').status,0);
    for(const args of [
      ['capture','--scene',f.config.scenes[0].id],
      ['voice','--scene',f.config.scenes[0].id],
      ['preview','--scene',f.config.scenes[0].id],
      ['qa','--scene',f.config.scenes[0].id],
      ['run'],['render']
    ]){
      const result=cli(f.root,...args);
      assert.notEqual(result.status,0,args.join(' '));
      assert.match(result.stderr,/BUILD GATE BLOCKED/);
    }
    const check=cli(f.root,'build','check');
    assert.equal(check.status,2);
    assert.equal(JSON.parse(check.stdout).status,'BLOCKED');
    assert.equal(requiresBuild(f.root,f.config),true);
  }finally{cleanup(f);}
});
test('source and storyboard changes block Build and compiled production plan tampering is rejected',()=>{
  const f=setup();
  try{
    assert.equal(cli(f.root,'plan').status,0);
    prepareBuild(f.root,f.config);
    fs.writeFileSync(path.join(f.root,'app','main.js'),'export const product = 2;');
    assert.ok(checkBuild(f.root,f.config,f.state).problems.some(x=>x.code==='BUILD_SOURCE_DRIFT'));
    prepareBuild(f.root,f.config,{force:true});
    const file=path.join(f.root,'.avp','build','production-plan.json');
    const p=readJson(file);p.scenes[0].captureRecipe.actions[0].path='/hidden';
    writeJson(file,p);
    assert.ok(checkBuild(f.root,f.config,f.state).problems.some(x=>x.code==='BUILD_NONCANONICAL_ARTIFACT'));
    assert.throws(()=>requireBuildGate(f.root,f.config,f.state),/BLOCKED/);
    prepareBuild(f.root,f.config,{force:true});
    const storyboard=path.join(f.root,'.avp','planning','storyboard.json');
    const b=readJson(storyboard);b.scenes[0].narration='fabricated';writeJson(storyboard,b);
    const report=checkBuild(f.root,f.config,f.state);
    assert.ok(report.problems.some(x=>x.code==='BUILD_STORYBOARD_STALE'));
  }finally{cleanup(f);}
});
test('unreviewed external adapter requests cannot silently pass Build preflight',()=>{
  const f=setup();
  try{
    f.config.scenes[0].capture.adapter='unreviewed-internet-module';
    const planned=requiredTools(f.config);
    assert.ok(planned.includes('playwright'));
    assert.equal(cli(f.root,'plan').status,0);
    prepareBuild(f.root,f.config);
    const r=checkBuild(f.root,f.config,f.state);
    assert.ok(r.problems.some(x=>x.code==='BUILD_ADAPTER_UNSUPPORTED'));
  }finally{cleanup(f);}
});
test('legacy project with no opted-in Build retains previous CLI workflow gates',()=>{
  const f=setup();
  try{
    delete f.config.workflow;
    assert.equal(requiresBuild(f.root,f.config),false);
    assert.deepEqual(requireBuildGate(f.root,f.config,f.state),{status:'LEGACY_NOT_ENFORCED'});
    assert.equal(cli(f.root,'plan').status,0);
    const s=readJson(path.join(f.root,'project.json'));delete s.workflow;writeJson(path.join(f.root,'project.json'),s);
    const status=JSON.parse(cli(f.root,'status').stdout);
    assert.equal(status.build.status,'LEGACY_NOT_ENFORCED');
  }finally{cleanup(f);}
});
