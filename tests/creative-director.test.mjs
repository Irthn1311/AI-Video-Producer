import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readJson} from '../src/utils.mjs';
import {makeCreativeBrief,creativeStatus,approveCreative} from '../src/creative-director.mjs';
const template=readJson(new URL('../templates/project.json',import.meta.url));
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-creative-'));
  fs.mkdirSync(path.join(root,'app'));
  fs.writeFileSync(path.join(root,'app','index.js'),'export const app=1;');
  const config=structuredClone(template);config.sourcePath='app';
  config.creative={audience:'reviewers',goal:'show real workflow',director:{mode:'interactive'}};
  return {root,config};
}
test('context-sensitive advice differs across two source-signal sets and never asserts runtime truth',()=>{
  const {root,config}=fixture();
  try{
    const a=makeCreativeBrief(root,config,{analysis:{capabilitySignals:[{id:'canvas-interaction'}]},sourceHash:'fixture-a'});
    const b=makeCreativeBrief(root,config,{analysis:{capabilitySignals:[{id:'charts-dashboard'}]},sourceHash:'fixture-b'});
    assert.ok(a.recommendations.some(x=>x.id==='canvas'));
    assert.ok(!b.recommendations.some(x=>x.id==='canvas'));
    assert.ok(b.recommendations.some(x=>x.id==='dashboard'));
    assert.match(a.scope,/NOT_RUNTIME_EVIDENCE/);
    assert.equal(a.scenes.length,config.scenes.length);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('creative review hash rejects changed scene direction and source, retains separate production review',()=>{
  const {root,config}=fixture();
  try{
    let r=creativeStatus(root,config);
    assert.equal(r.status,'REVIEW_REQUIRED');
    assert.throws(()=>approveCreative(root,config,{confirm:true,expectedHash:'bad'}),/hash/);
    assert.equal(approveCreative(root,config,{confirm:true,expectedHash:r.briefHash}).status,'APPROVED');
    config.creative.director.sceneDirections={[config.scenes[0].id]:{framing:'no zoom'}};
    r=creativeStatus(root,config);
    assert.equal(r.status,'REVIEW_REQUIRED');
    approveCreative(root,config,{confirm:true,expectedHash:r.briefHash});
    fs.writeFileSync(path.join(root,'app','index.js'),'export const app=2;');
    assert.equal(creativeStatus(root,config).status,'REVIEW_REQUIRED');
    config.creative.director.mode='autonomous';
    r=creativeStatus(root,config);
    assert.equal(r.status,'AUTONOMOUS_POLICY');
    assert.equal(r.brief.productionReviewMode,'review');
    assert.equal(r.approval,null);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('missing intent, duration overflow and invalid scene IDs fail closed',()=>{
  const {root,config}=fixture();
  try{
    config.creative.director.mode='autonomous';
    delete config.creative.goal;
    config.creative.director.maxDurationSec=5;
    const r=creativeStatus(root,config);
    assert.equal(r.status,'BLOCKED');
    assert.deepEqual(r.issues.map(i=>i.code),['CREATIVE_DURATION_EXCEEDED','CREATIVE_INTENT_MISSING']);
    config.creative.director.sceneDirections={missing:{framing:'no zoom'}};
    assert.throws(()=>creativeStatus(root,config),/Unknown creative scene/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
