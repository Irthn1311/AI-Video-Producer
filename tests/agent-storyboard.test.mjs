import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readJson,writeJson,sha} from '../src/utils.mjs';
import {storyboardContext,checkStoryboardProposal,applyStoryboardProposal,storyboardGate} from '../src/agent-storyboard.mjs';
import {loadState,saveState} from '../src/state.mjs';
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-storyboard-'));
  fs.mkdirSync(path.join(root,'app'));
  fs.writeFileSync(path.join(root,'app','app.js'),"app.get('/dashboard', handler);");
  const config=readJson(new URL('../templates/project.json',import.meta.url));
  config.sourcePath='app';
  config.creative={audience:'reviewers',goal:'Show a real workflow',director:{mode:'interactive',maxDurationSec:60}};
  writeJson(path.join(root,'project.json'),config);
  const context=storyboardContext(root,config);
  const scene=structuredClone(config.scenes[0]);scene.id='new-dashboard';
  const proposal={schemaVersion:1,baseConfigHash:context.baseConfigHash,sourceFingerprint:context.sourceFingerprint,
    storyRationale:'Focus on the dashboard',features:[{id:'dashboard',reason:'Core entry',sourceRefs:[context.sourceFiles[0]]}],
    scenes:[{scene,role:'workflow',purpose:'Show dashboard',startState:'fresh browser',endState:'heading visible',fallback:'return to Build',dependsOn:[],direction:{framing:'no zoom'}}]};
  const file=path.join(root,'.avp','planning','agent-storyboard.json');
  const save=()=>writeJson(file,proposal);save();
  return {root,config,proposal,file,save};
}
const cleanup=f=>fs.rmSync(f.root,{recursive:true,force:true});
test('agent authors a new canonical scene with source refs and strict claims; apply needs exact hash',()=>{
  const f=fixture();
  try{
    const report=checkStoryboardProposal(f.root,f.config);
    assert.deepEqual(report.diff.added,['new-dashboard']);
    assert.equal(report.diff.removed.length,2);
    assert.equal(readJson(path.join(f.root,'project.json')).scenes.length,2);
    assert.throws(()=>applyStoryboardProposal(f.root,f.config,{confirm:true,expectedHash:'bad'}),/hash/);
    applyStoryboardProposal(f.root,f.config,{confirm:true,expectedHash:report.proposalHash});
    const next=readJson(path.join(f.root,'project.json'));
    assert.equal(next.scenes[0].id,'new-dashboard');
    assert.deepEqual(next.review,f.config.review);
    assert.deepEqual(next.budget,f.config.budget);
    assert.equal(next.creative.storyboard.features[0].status,'SOURCE_REFERENCED_UNVERIFIED');
    assert.equal(storyboardGate(next,f.proposal.sourceFingerprint).length,0);
    next.scenes[0].narration+=' Changed.';
    assert.equal(storyboardGate(next,f.proposal.sourceFingerprint)[0].code,'STORYBOARD_PROVENANCE_STALE');
  }finally{cleanup(f);}
});
test('invalid source references and claims cannot be applied',()=>{
  const f=fixture();
  try{
    f.proposal.features[0].sourceRefs[0].sha256='fake';f.save();
    assert.throws(()=>checkStoryboardProposal(f.root,f.config),/source reference/);
    f.proposal.features[0].sourceRefs[0]=storyboardContext(f.root,f.config).sourceFiles[0];
    f.proposal.scenes[0].scene.claims[0].evidenceIds=['fake'];f.save();
    assert.throws(()=>checkStoryboardProposal(f.root,f.config),/evidenceId/);
    assert.equal(readJson(path.join(f.root,'project.json')).scenes.length,2);
  }finally{cleanup(f);}
});
test('locked scenes cannot be removed; source drift invalidates proposal',()=>{
  const f=fixture();
  try{
    const state=loadState(f.root);state.scenes[f.config.scenes[0].id]={locked:true};saveState(f.root,state);
    assert.throws(()=>checkStoryboardProposal(f.root,f.config),/Locked scene/);
    fs.writeFileSync(path.join(f.root,'app','app.js'),"app.get('/changed', handler);");
    assert.throws(()=>checkStoryboardProposal(f.root,f.config),/stale source/);
  }finally{cleanup(f);}
});
test('cross-scene dependency is not mistaken for executable orchestration',()=>{
  const f=fixture();
  try{
    const another=structuredClone(f.proposal.scenes[0]);
    another.scene.id='second-dashboard';another.dependsOn=['new-dashboard'];
    f.proposal.scenes.push(another);f.save();
    const report=checkStoryboardProposal(f.root,f.config);
    assert.deepEqual(report.dependenciesPending,['second-dashboard']);
    applyStoryboardProposal(f.root,f.config,{confirm:true,expectedHash:report.proposalHash});
    const next=readJson(path.join(f.root,'project.json'));
    assert.equal(storyboardGate(next,f.proposal.sourceFingerprint)[0].code,'STORYBOARD_DEPENDENCY_UNSUPPORTED');
  }finally{cleanup(f);}
});
