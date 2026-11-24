import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readJson,writeJson} from '../src/utils.mjs';
import {productionNext,productionStep,recoverProduction} from '../src/production-executor.mjs';
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-executor-'));
  fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','index.js'),'export const app=1;');
  const config=readJson(new URL('../templates/project.json',import.meta.url));config.sourcePath='app';
  config.workflow={requireBuild:true};writeJson(path.join(root,'project.json'),config);
  return {root,config};
}
test('production executor cannot dispatch without a frozen Build or silently use legacy mode',async()=>{
  const {root,config}=fixture();try{
    assert.equal(productionNext(root,config).code,'BUILD_NOT_READY');
    const result=await productionStep(root,{allowActions:true,allowPaidApi:true});
    assert.equal(result.code,'BUILD_NOT_READY');
    assert.equal(fs.existsSync(path.join(root,'.avp','production','executor.lock')),false);
    assert.equal(fs.existsSync(path.join(root,'.avp','run-state.json')),false);
    delete config.workflow;writeJson(path.join(root,'project.json'),config);
    assert.equal(productionNext(root,config).code,'FROZEN_BUILD_REQUIRED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('exclusive executor lock refuses concurrent step and live owner recovery',async()=>{
  const {root}=fixture();try{
    const file=path.join(root,'.avp','production','executor.lock');
    writeJson(file,{schemaVersion:1,token:'owner',pid:process.pid,host:os.hostname()});
    await assert.rejects(productionStep(root),/locked/);
    assert.throws(()=>recoverProduction(root,{confirm:true}),/still alive/);
    assert.equal(readJson(file).token,'owner');
    assert.throws(()=>recoverProduction(root),/confirm/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
