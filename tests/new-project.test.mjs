import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertConfig,readJson} from '../src/utils.mjs';
import {validateClaimConfig,verificationMode} from '../src/evidence.mjs';

const repo=path.resolve(import.meta.dirname,'..');
test('AVP init creates strict Quality evidence contract for new demo projects',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avp-new-project-'));
  try{
    const dest=path.join(dir,'demo');
    const r=spawnSync(process.execPath,[path.join(repo,'bin','avp.mjs'),'init',dest],{encoding:'utf8',timeout:10000});
    assert.equal(r.status,0,r.stderr);
    const cfg=readJson(path.join(dest,'project.json'));
    assert.equal(cfg.optimization.profile,'quality');
    assert.equal(verificationMode(cfg),'claims');
    assert.doesNotThrow(()=>assertConfig(cfg));
    assert.doesNotThrow(()=>validateClaimConfig(cfg));
    assert.ok(cfg.scenes.every(s=>s.capture.evidencePolicy.requireAssertions));
    assert.ok(cfg.scenes.every(s=>s.claims.length));
    for(const scene of cfg.scenes)for(const claim of scene.claims){
      assert.ok(scene.featureIds.includes(claim.featureId));
      assert.ok(claim.evidenceIds.every(id=>scene.capture.actions.some(a=>a.evidenceId===id)));
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('sample project is strict and legacy project configs still load',()=>{
  const sample=readJson(path.join(repo,'examples','sample-project','project.json'));
  assert.equal(verificationMode(assertConfig(sample)),'claims');
  const legacy=structuredClone(sample);delete legacy.verification;
  for(const s of legacy.scenes)delete s.claims;
  assert.equal(verificationMode(assertConfig(legacy)),'legacy');
});
