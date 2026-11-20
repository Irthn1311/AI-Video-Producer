import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readJson,writeJson,sceneDir,fileHash} from '../src/utils.mjs';
import {loadState,sceneState,recordArtifact,requireUnlocked} from '../src/state.mjs';
import {snapshotScene,restoreSceneSnapshot,listSceneSnapshots} from '../src/revisions.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-scene-versions-'));
  fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','app.js'),'export default 1');
  const config=readJson(new URL('../templates/project.json',import.meta.url));
  config.sourcePath='app';config.voiceover.enabled=false;
  const scene=config.scenes[0],dir=sceneDir(root,scene.id);
  fs.mkdirSync(path.join(dir,'assets'),{recursive:true});
  const state=loadState(root);
  const clip=path.join(dir,'capture.mp4');fs.writeFileSync(clip,'authentic-clip-v1-fixture');
  recordArtifact(root,state,scene,'capture',clip,'input-fixture-sha-v1');
  fs.writeFileSync(path.join(dir,'assets','mobile.mp4'),'mobile-v1');
  fs.writeFileSync(path.join(dir,'captions.json'),JSON.stringify({rows:[{startMs:1,endMs:10,text:'A'}]}));
  fs.writeFileSync(path.join(dir,'captions.srt'),'1\n00:00:00,001 --> 00:00:00,010\nA');
  return {root,config,scene,dir,state,clip};
}
test('snapshots preserve media bytes and current artifact state without changing approval',()=>{
  const f=fixture();
  try{
    f.state.scenes[f.scene.id].approved=true;f.state.scenes[f.scene.id].locked=true;
    const saved=snapshotScene(f.root,f.config,f.scene,f.state,{label:'good capture'});
    assert.equal(saved.version,'v0001');
    assert.equal(sceneState(f.state,f.scene.id).locked,true);
    assert.equal(sceneState(f.state,f.scene.id).approved,true);
    const entries=listSceneSnapshots(f.root,f.scene);
    assert.equal(entries.length,1);
    assert.equal(entries[0].files,4);
    assert.equal(entries[0].label,'good capture');
    assert.equal(fs.existsSync(path.join(f.dir,'snapshots','v0001','capture.mp4')),true);
    assert.equal(readJson(path.join(f.dir,'snapshots','v0001','manifest.json')).artifactState.capture.hash,fileHash(f.clip));
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('restore requires unlocked state, is reversible, and never carries approvals or QA',()=>{
  const f=fixture();
  try{
    const ss=sceneState(f.state,f.scene.id);
    snapshotScene(f.root,f.config,f.scene,f.state,{label:'version one'});
    const expected=fs.readFileSync(f.clip,'utf8');
    fs.writeFileSync(f.clip,'authentic-clip-v2-fixture');
    recordArtifact(f.root,f.state,f.scene,'capture',f.clip,'input-fixture-sha-v2');
    ss.approved=true;ss.locked=true;ss.qa={reportHash:'old'};
    f.state.output={hash:'old-final'};f.state.reviews.final={approvedAt:'yesterday'};
    assert.throws(()=>restoreSceneSnapshot(f.root,f.config,f.scene,f.state,'v0001'),/LOCKED/);
    ss.locked=false;
    const restored=restoreSceneSnapshot(f.root,f.config,f.scene,f.state,'v0001');
    assert.equal(restored.restored,'v0001');
    assert.equal(restored.preRestoreBackup,'v0002');
    assert.equal(restored.approvalRestored,false);
    assert.equal(restored.qaRestored,false);
    assert.equal(fs.readFileSync(f.clip,'utf8'),expected);
    assert.equal(ss.approved,false);assert.equal(ss.locked,false);
    assert.equal(ss.qa,undefined);assert.equal(f.state.output,undefined);
    assert.equal(f.state.reviews.final,undefined);
    assert.equal(fs.existsSync(path.join(f.dir,'qa-report.json')),false);
    assert.equal(listSceneSnapshots(f.root,f.scene).length,2);
    assert.equal(ss.artifacts.capture.hash,fileHash(f.clip));
    // Reverting again from the automatically preserved pre-restore version.
    const again=restoreSceneSnapshot(f.root,f.config,f.scene,f.state,'v0002');
    assert.equal(again.preRestoreBackup,'v0003');
    assert.equal(fs.readFileSync(f.clip,'utf8'),'authentic-clip-v2-fixture');
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('tampered snapshot fails before changing active media',()=>{
  const f=fixture();
  try{
    snapshotScene(f.root,f.config,f.scene,f.state,{label:'baseline'});
    fs.writeFileSync(path.join(f.dir,'snapshots','v0001','capture.mp4'),'tampered');
    const current=fs.readFileSync(f.clip,'utf8');
    assert.throws(()=>restoreSceneSnapshot(f.root,f.config,f.scene,f.state,'v0001'),/hash mismatch|total/);
    assert.equal(fs.readFileSync(f.clip,'utf8'),current);
    assert.equal(listSceneSnapshots(f.root,f.scene).length,1);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('snapshot version selection rejects path traversal and invalid labels',()=>{
  const f=fixture();
  try{
    snapshotScene(f.root,f.config,f.scene,f.state);
    assert.throws(()=>restoreSceneSnapshot(f.root,f.config,f.scene,f.state,'../v0001'),/Version/);
    assert.throws(()=>snapshotScene(f.root,f.config,f.scene,f.state,{label:'bad\nname'}),/label/);
    assert.equal(listSceneSnapshots(f.root,f.scene).length,1);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
