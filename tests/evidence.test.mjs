import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateClaimConfig,validateCoveragePlan,verifySceneClaims,inspectEvidence} from '../src/evidence.mjs';
import {writeJson,sceneDir,fileHash} from '../src/utils.mjs';
import {inputHashes,staleParts} from '../src/state.mjs';

function fixture(){
  const scene={id:'feature-demo',durationSec:5,featureIds:['save'],
    narration:'The app saves a real result, then shows the confirmation.',
    capture:{evidencePolicy:{requireAssertions:true,failOnPageError:true},actions:[
      {type:'goto',path:'/'},
      {type:'clickExpectResponse',evidenceId:'server-ok',testId:'save',
        response:{pathContains:'/save',method:'POST',status:200}},
      {type:'assertText',evidenceId:'ui-ok',testId:'result',expectedText:'Saved'}
    ]},
    claims:[{id:'claim-1',featureId:'save',text:'The app saves a real result',evidenceIds:['server-ok','ui-ok']}]};
  return {verification:{mode:'claims'},scenes:[scene]};
}
test('strict config requires exactly declared, narration-bound claims and explicit assertions',()=>{
  const config=fixture();
  assert.doesNotThrow(()=>validateClaimConfig(config));
  const a=structuredClone(config);a.scenes[0].claims[0].text='Invented 100% accurate AI';assert.throws(()=>validateClaimConfig(a),/narration/);
  const b=structuredClone(config);b.scenes[0].claims[0].evidenceIds=['unknown'];assert.throws(()=>validateClaimConfig(b),/missing/);
  const c=structuredClone(config);c.scenes[0].capture.evidencePolicy.requireAssertions=false;assert.throws(()=>validateClaimConfig(c),/requireAssertions/);
  const d=structuredClone(config);d.scenes[0].claims=[];assert.throws(()=>validateClaimConfig(d),/needs a narration claim/);
  const e=structuredClone(config);delete e.scenes[0].capture.actions[2].evidenceId;assert.throws(()=>validateClaimConfig(e),/Explicit evidenceId/);
});
test('coverage approval can only represent all intended features with correct scene mapping',()=>{
  const c=fixture();
  const coverage={schemaVersion:1,features:[{id:'save',includedInScenes:['feature-demo'],verifiedInBrowser:false,evidence:[]}]};
  assert.deepEqual(validateCoveragePlan(c,coverage).plannedFeatures,['save']);
  const a=structuredClone(coverage);a.features=[];assert.throws(()=>validateCoveragePlan(c,a),/does not match/);
  const b=structuredClone(coverage);b.features[0].includedInScenes=['fake-scene'];assert.throws(()=>validateCoveragePlan(c,b),/stale/);
});
test('runtime evidence must match exact current capture hash, input hash, IDs, types',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-claim-test-'));
  try{
    const config=fixture(),scene=config.scenes[0],dir=sceneDir(root,scene.id);
    fs.mkdirSync(dir,{recursive:true});
    const report={scene:scene.id,status:'PASS',captureHash:'cap-1',captureInputHash:'input-1',
      pageErrors:[],assertions:[{id:'server-ok',type:'clickExpectResponse',pass:true},{id:'ui-ok',type:'assertText',pass:true}]};
    const file=path.join(dir,'capture-report.json');writeJson(file,report);
    const state={scenes:{[scene.id]:{artifacts:{capture:{hash:'cap-1',inputHash:'input-1'}}}}};
    assert.equal(verifySceneClaims(root,config,scene,state).status,'VERIFIED_ASSERTIONS');
    report.assertions[0].type='assertVisible';writeJson(file,report);
    assert.throws(()=>verifySceneClaims(root,config,scene,state),/unmatched/);
    report.assertions[0].type='clickExpectResponse';report.captureHash='cap-old';writeJson(file,report);
    assert.throws(()=>verifySceneClaims(root,config,scene,state),/not bound/);
    report.captureHash='cap-1';report.assertions.pop();writeJson(file,report);
    assert.throws(()=>verifySceneClaims(root,config,scene,state),/missing configured assertion/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('inspect is honest about unavailable evidence and unknown legacy mode',()=>{
  const c=fixture();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-inspect-evidence-'));
  try{
    const result=inspectEvidence(root,c,{scenes:{}});
    assert.equal(result.ready,false);
    assert.equal(result.scenes[0].status,'UNVERIFIED');
    assert.equal(inspectEvidence(root,{scenes:c.scenes},{scenes:{}}).mode,'legacy');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('evidence status rejects stale source even with a previously passing capture report',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-proof-freshness-'));
  try{
    const config=fixture(),scene=config.scenes[0];config.sourcePath='app';
    const src=path.join(root,'app');fs.mkdirSync(src);fs.writeFileSync(path.join(src,'main.ts'),'export const version = 1;');
    config.appUrl='http://127.0.0.1:4173';config.render={width:320,height:180,fps:24};
    const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});
    const footage=path.join(dir,'capture.mp4');fs.writeFileSync(footage,'real fixture bytes, not a playable media test');
    const state={scenes:{[scene.id]:{artifacts:{capture:{file:'capture.mp4',
      hash:fileHash(footage),inputHash:''}}}}};
    state.scenes[scene.id].artifacts.capture.inputHash=inputHashes(scene,config,state.scenes[scene.id],root).capture;
    writeJson(path.join(dir,'capture-report.json'),{scene:scene.id,status:'PASS',
      captureHash:fileHash(footage),captureInputHash:state.scenes[scene.id].artifacts.capture.inputHash,
      pageErrors:[],assertions:[{id:'server-ok',type:'clickExpectResponse',pass:true},{id:'ui-ok',type:'assertText',pass:true}]});
    const plan={schemaVersion:1,features:[{id:'save',includedInScenes:[scene.id]}]};
    const planning=path.join(root,'.avp','planning');fs.mkdirSync(planning,{recursive:true});writeJson(path.join(planning,'feature-coverage.json'),plan);
    const status=()=>inspectEvidence(root,config,state,{isCaptureStale:s=>staleParts(s,config,state.scenes[s.id],root).capture});
    assert.equal(status().ready,true);
    fs.writeFileSync(path.join(src,'main.ts'),'export const version = 2;');
    assert.equal(status().ready,false);
    assert.equal(status().scenes[0].status,'UNVERIFIED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
