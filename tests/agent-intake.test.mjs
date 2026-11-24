import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileHash,readJson} from '../src/utils.mjs';
import {storyboardGate} from '../src/agent-storyboard.mjs';
const cli=path.resolve(import.meta.dirname,'../bin/avp.mjs');
test('fresh real-app workspace on host OS has no sample claims and stops at agent storyboard',{timeout:60000},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp onboarding '));
  try{
    const source=path.join(root,'target app'),workspace=path.join(root,'separate output');
    fs.mkdirSync(source);const code=path.join(source,'index.html');fs.writeFileSync(code,'<!doctype html><title>Independent source</title><h1>Local app</h1>');
    const before=fileHash(code);
    const call=(args,expected=0)=>{const p=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:20000});assert.equal(p.status,expected,p.stderr+'\n'+p.stdout);return JSON.parse(p.stdout);};
    const opts=['--source',source,'--app-url','http://127.0.0.1:4173','--goal','Show actual functionality','--audience','First-time users'];
    const created=call(['init',workspace,...opts]);assert.equal(created.status,'CREATED_UNPLANNED');
    const config=readJson(path.join(workspace,'project.json'));assert.equal(config.sourcePath,fs.realpathSync(source));
    assert.deepEqual(config.scenes[0].featureIds,[]);assert.equal(config.scenes[0].narration,'');assert.equal(config.voiceover.enabled,false);assert.equal(config.review.semantic,'required');
    assert.ok(storyboardGate(config,'unused').some(x=>x.code==='STORYBOARD_POLICY_REQUIRED'));
    for(const kind of ['analyze','skills']){
      const next=call(['workflow','next','--project',workspace]);assert.equal(next.kind,kind);
      const step=call(['workflow','step','--project',workspace,'--hash',next.taskHash]);assert.equal(step.status,'EXECUTED');
    }
    const next=call(['workflow','next','--project',workspace],2);assert.equal(next.status,'AGENT_REQUIRED');assert.equal(next.kind,'author-storyboard');
    const ctx=call(['storyboard','context','--project',workspace]);assert.ok(ctx.sourceFiles.some(x=>x.path==='index.html'));
    assert.equal(fileHash(code),before);assert.deepEqual(fs.readdirSync(source),['index.html']);
    for(const args of [['init',workspace,...opts],['init',path.join(source,'unsafe'),...opts],['init',path.join(root,'remote'),...opts,'--app-url','https://example.org'],['init',path.join(root,'paid'),...opts,'--voice','paid']]){
      const p=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.notEqual(p.status,0);
    }
    assert.equal(fs.existsSync(path.join(source,'unsafe')),false);
    const freeze=spawnSync(process.execPath,[cli,'build','freeze','--project',workspace,'--confirm'],{encoding:'utf8'});
    assert.notEqual(freeze.status,0);assert.match(freeze.stderr+freeze.stdout,/STORYBOARD_POLICY_REQUIRED/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
