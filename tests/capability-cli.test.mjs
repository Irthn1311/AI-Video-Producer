import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const bin=path.join(root,'bin','avp.mjs');
const project=path.join(root,'examples','sample-project');

test('CLI capability route defaults to Quality and performs no external calls',()=>{
  const r=spawnSync(process.execPath,[bin,'route','--project',project,'--task','repo-research'],{encoding:'utf8',timeout:12000});
  assert.equal(r.status,0,r.stderr);
  const data=JSON.parse(r.stdout);
  assert.equal(data.profile,'quality');
  assert.equal(data.mode,'planning-only');
  assert.equal(data.guarantees.executionPerformed,false);
  assert.equal(data.budget.providerQuotaKnown,false);
});

test('CLI route reports blocker for feature validation without a runtime',()=>{
  const r=spawnSync(process.execPath,[bin,'route','--project',project,'--task','captions'],{encoding:'utf8',timeout:12000});
  assert.equal(r.status,2,r.stderr);
  const data=JSON.parse(r.stdout);
  assert.equal(data.profile,'quality');
  assert.equal(data.status,'blocked');
  assert.ok(data.blockers.some(x=>x.includes('alignment')));
});

test('CLI route rejects a bad optimization profile',()=>{
  const r=spawnSync(process.execPath,[bin,'route','--project',project,'--task','repo-research','--profile','bogus'],{encoding:'utf8',timeout:12000});
  assert.equal(r.status,1);
  assert.match(r.stderr,/profile/);
});
