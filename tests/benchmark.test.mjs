import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {compareBenchmarks,readBenchmark} from '../src/benchmark.mjs';
import {sha,writeJson} from '../src/utils.mjs';
const base={id:'full',kind:'full',inputContractHash:'a'.repeat(64),configHash:'c',sourceFingerprint:'s',environmentHash:'e',scope:'AUTHOR_KNOWN_FIXTURE',production:{observedMs:2000},regeneratedCaptureSec:10,regeneratedPreviewSec:10,reservedCallsDelta:0};
test('benchmark comparison reports percentage only for matching inputs',()=>{
  const repair={...base,id:'repair',kind:'repair',production:{observedMs:500},regeneratedCaptureSec:0,regeneratedPreviewSec:4};
  assert.equal(compareBenchmarks(base,repair).observedDispatchReductionPct,75);
  const diff=compareBenchmarks(base,{...repair,configHash:'other'});assert.equal(diff.comparable,false);assert.equal(diff.observedDispatchReductionPct,null);assert.equal(diff.delta.captureSec,10);
  assert.equal(compareBenchmarks(base,{...repair,inputContractHash:'b'.repeat(64)}).comparable,false);
  assert.equal(compareBenchmarks({...base,inputContractHash:undefined},{...repair,inputContractHash:undefined}).comparable,false);
  assert.throws(()=>compareBenchmarks(repair,base));
});
test('tampered benchmark receipt is rejected',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-benchmark-'));try{
    const data={kind:'full'},id=sha(data),file=path.join(root,'.avp','benchmarks',id+'.json');writeJson(file,{schemaVersion:1,id,data});
    assert.equal(readBenchmark(root,id).kind,'full');writeJson(file,{schemaVersion:1,id,data:{kind:'repair'}});assert.throws(()=>readBenchmark(root,id),/integrity/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
