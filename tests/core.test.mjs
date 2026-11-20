import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assertConfig,readJson,writeJson,sha,fileHash,sceneDir,avpDir} from '../src/utils.mjs';
import {loadState,sceneState,staleParts,recordArtifact,approve,gate,inputHashes,validateSceneQa,finalInputHash,reservePaidCall} from '../src/state.mjs';
import {inspect} from '../src/inspect.mjs';
import {render} from '../src/media.mjs';

const template=readJson(new URL('../templates/project.json',import.meta.url));
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-test-'));
  const config=structuredClone(template);
  // Deliberate legacy fixture: synthetic media carries no real browser evidence.
  config.verification={mode:'legacy'};
  for(const scene of config.scenes){delete scene.claims;delete scene.capture.evidencePolicy;}
  config.sourcePath='src';config.render={engine:'ffmpeg',width:640,height:360,fps:24,captionsBurned:false};
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','main.ts'),'export const n = 1;');
  writeJson(path.join(avpDir(root),'planning','feature-coverage.json'),{schemaVersion:1,features:[]});
  writeJson(path.join(avpDir(root),'planning','storyboard.json'),{schemaVersion:1,scenes:config.scenes.map(s=>({id:s.id,title:s.title,durationSec:s.durationSec,featureIds:s.featureIds||[],narration:s.narration,actions:s.capture.actions}))});
  const state=loadState(root);return {root,config,state};
}
function mockSceneReady(root,config,state,scene=config.scenes[0]){
  const dir=sceneDir(root,scene.id);fs.mkdirSync(dir,{recursive:true});
  for(const [name,ext] of [['capture','mp4'],['captions','srt'],['preview','mp4']]){
    const file=path.join(dir,`${name}.${ext}`);
    fs.writeFileSync(file,`test artifact ${name} ${scene.id}`);
    const ss=sceneState(state,scene.id);
    recordArtifact(root,state,scene,name,file,inputHashes(scene,config,ss,root)[name]);
  }
  const ss=sceneState(state,scene.id),file=path.join(dir,'preview.mp4');
  const report={pass:true,checks:{capturePresent:true,decodePassed:true},previewHash:fileHash(file),previewInputHash:inputHashes(scene,config,ss,root).preview};
  const p=path.join(dir,'qa-report.json');writeJson(p,report);
  ss.qa={reportHash:fileHash(p),previewHash:report.previewHash,previewInputHash:report.previewInputHash};
  return {dir,ss,report};
}
test('project contract rejects duplicate IDs, invalid budgets and unsupported voices',()=>{
  const p=structuredClone(template);p.scenes.push(structuredClone(p.scenes[0]));assert.throws(()=>assertConfig(p),/Duplicate/);
  const a=structuredClone(template);a.voiceover.enabled=true;a.voiceover.provider='unknown';assert.throws(()=>assertConfig(a),/Gemini/);
  const b=structuredClone(template);b.voiceover.estimatedUsdPerCall=-1;assert.throws(()=>assertConfig(b),/estimatedUsdPerCall/);
  assert.equal(assertConfig(template).scenes.length,2);
});
test('repo scan excludes secrets and symlinks, hashes content rather than file sizes',()=>{
  const {root,config}=fixture();fs.writeFileSync(path.join(root,'src','.env'),'PASSWORD=secret');
  fs.mkdirSync(path.join(root,'src','node_modules'));fs.writeFileSync(path.join(root,'src','node_modules','bad.js'),'x');
  const before=inspect(root,config);assert.equal(before.fileCount,1);
  fs.writeFileSync(path.join(root,'src','main.ts'),'export const n = 2;');
  const after=inspect(root,config);assert.notEqual(after.contentFingerprint,before.contentFingerprint);
});
test('coverage approval expires if coverage artifact changes even without config edit',()=>{
  const {root,config,state}=fixture();approve(root,state,config,'coverage');gate(state,config,'coverage',root);
  const file=path.join(avpDir(root),'planning','feature-coverage.json');writeJson(file,{features:['new']});
  assert.throws(()=>gate(state,config,'coverage',root),/planning artifact changes/);
});
test('storyboard must match canonical config and approval expires on edits',()=>{
  const {root,config,state}=fixture();approve(root,state,config,'coverage');approve(root,state,config,'storyboard');
  gate(state,config,'storyboard',root);
  const file=path.join(avpDir(root),'planning','storyboard.json');const board=readJson(file);board.title='Updated story';writeJson(file,board);
  assert.throws(()=>gate(state,config,'storyboard',root),/planning artifact changes/);
  board.scenes[0].narration+=' changed';writeJson(file,board);
  assert.throws(()=>approve(root,state,config,'storyboard'),/does not match project.json/);
});
test('project config edits expire plan approval',()=>{
  const {root,config,state}=fixture();approve(root,state,config,'coverage');
  const modified=structuredClone(config);modified.title+=' new';assert.throws(()=>gate(state,modified,'coverage',root),/config changes/);
});
test('cache invalidates capture for app URL, viewport or same-size source edits',()=>{
  const {root,config,state}=fixture();const scene=config.scenes[0];mockSceneReady(root,config,state,scene);
  assert.equal(staleParts(scene,config,sceneState(state,scene.id),root).capture,false);
  const modified=structuredClone(config);modified.appUrl+='?v=2';
  assert.equal(staleParts(scene,modified,sceneState(state,scene.id),root).capture,true);
  const viewport=structuredClone(config);viewport.render.width=1280;
  assert.equal(staleParts(scene,viewport,sceneState(state,scene.id),root).capture,true);
  fs.writeFileSync(path.join(root,'src','main.ts'),'export const n = 2;');
  assert.equal(staleParts(scene,config,sceneState(state,scene.id),root).capture,true);
});
test('scene approval requires current QA bound to current preview',()=>{
  const {root,config,state}=fixture();approve(root,state,config,'coverage');approve(root,state,config,'storyboard');
  const scene=config.scenes[0];const {dir}=mockSceneReady(root,config,state,scene);
  assert.equal(validateSceneQa(root,config,scene,state).pass,true);
  approve(root,state,config,'scene',scene.id);assert.equal(sceneState(state,scene.id).locked,true);
  const reportFile=path.join(dir,'qa-report.json');const report=readJson(reportFile);report.visualReviewByHuman=true;writeJson(reportFile,report);
  assert.throws(()=>validateSceneQa(root,config,scene,state),/QA is stale/);
});
test('replacing preview cannot reuse an old passing QA report',()=>{
  const {root,config,state}=fixture();approve(root,state,config,'coverage');approve(root,state,config,'storyboard');
  const scene=config.scenes[0],{dir}=mockSceneReady(root,config,state,scene);const oldReport=readJson(path.join(dir,'qa-report.json'));
  fs.writeFileSync(path.join(dir,'preview.mp4'),'new regenerated preview');
  recordArtifact(root,state,scene,'preview',path.join(dir,'preview.mp4'),inputHashes(scene,config,sceneState(state,scene.id),root).preview);
  writeJson(path.join(dir,'qa-report.json'),oldReport);
  assert.throws(()=>approve(root,state,config,'scene',scene.id),/lacks current QA/);
});
test('autonomous export refuses missing current QA, even if previews exist',()=>{
  const {root,config,state}=fixture();config.review.mode='autonomous';
  config.scenes=[config.scenes[0]];mockSceneReady(root,config,state);
  const ss=sceneState(state,config.scenes[0].id);delete ss.qa;
  assert.throws(()=>render(root,config,state),/lacks current QA/);
});
test('scene changes invalidate final approval state',()=>{
  const {root,config,state}=fixture();const s=config.scenes[0];const {dir}=mockSceneReady(root,config,state,s);
  state.output={hash:'old'};state.reviews.final={approvedAt:'then'};
  fs.writeFileSync(path.join(dir,'preview.mp4'),'replacement');recordArtifact(root,state,s,'preview',path.join(dir,'preview.mp4'),inputHashes(s,config,sceneState(state,s.id),root).preview);
  assert.equal(state.output,undefined);assert.equal(state.reviews.final,undefined);
});
test('final approval binds rendered output hash and current scene QA',()=>{
  const {root,config,state}=fixture();config.review.mode='autonomous';config.scenes=[config.scenes[0]];mockSceneReady(root,config,state);
  const out=path.join(avpDir(root),'output','final.mp4'),qa=path.join(avpDir(root),'output','final-qa.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,'final source');
  writeJson(qa,{pass:true,checks:{hasVideo:true},outputHash:fileHash(out)});
  state.output={hash:fileHash(out),qaHash:fileHash(qa),inputHash:finalInputHash(config,state)};
  approve(root,state,config,'final');assert.ok(state.reviews.final?.approvedAt);
  fs.writeFileSync(out,'changed final');assert.throws(()=>approve(root,state,config,'final'),/stale/);
});
test('estimated API call budget enforces per-run and persistent limits before network',()=>{
  const {root,config,state}=fixture();config.voiceover.enabled=true;config.voiceover.maxApiCallsPerRun=2;config.voiceover.estimatedUsdPerCall=.25;config.budget.maxEstimatedUsd=.6;
  const session={calls:0};reservePaidCall(root,state,config,session,.25);reservePaidCall(root,state,config,session,.25);
  assert.equal(state.budget.ttsCalls,2);assert.equal(session.calls,2);
  assert.throws(()=>reservePaidCall(root,state,config,session,.25),/per-run/);
  assert.throws(()=>reservePaidCall(root,state,config,{calls:0},.25),/budget exceeded/);
  const invalid=structuredClone(config);invalid.voiceover.estimatedUsdPerCall=null;
  assert.throws(()=>reservePaidCall(root,state,invalid,{calls:0},invalid.voiceover.estimatedUsdPerCall),/positive cost estimate/);
});
