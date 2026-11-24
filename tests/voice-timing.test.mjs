import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,sha,fileHash,sceneDir} from '../src/utils.mjs';
import {loadState,inputHashes,sceneState,staleParts} from '../src/state.mjs';
import {rehearsalPath} from '../src/rehearsal.mjs';
import {importAudition,chooseAudition,listAuditions,evaluateTiming,auditionVoice} from '../src/voice-timing.mjs';
import {voice} from '../src/media.mjs';
import {selectedVoice} from '../src/voice-selection.mjs';
import {requiresBuild,requiredTools} from '../src/build.mjs';
const skip=Boolean(spawnSync('ffmpeg',['-version']).error||spawnSync('ffprobe',['-version']).error);
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-timing-'));
  fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','index.js'),'export const fixture=1;');
  const config=readJson(new URL('../templates/project.json',import.meta.url));
  config.sourcePath='app';config.scenes=[config.scenes[0]];config.voiceover.enabled=true;
  config.creative={timing:{maxSilenceSec:2,actionToleranceSec:0.25}};
  const scene=config.scenes[0],state=loadState(root),audio=path.join(root,'fixture.wav');
  const make=spawnSync('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','pcm_s16le',audio],{encoding:'utf8'});
  assert.equal(make.status,0,make.stderr);
  const rehearsal=(ms=100)=>writeJson(rehearsalPath(root,scene.id),{sceneId:scene.id,status:'PASS',scope:'BUILD_REHEARSAL_ONLY',captureInputHash:inputHashes(scene,config,{},root).capture,actionsHash:sha(scene.capture.actions),actions:scene.capture.actions.map(a=>({type:a.type,ms}))});
  return {root,config,scene,state,audio,rehearsal};
}
const cleanup=f=>fs.rmSync(f.root,{recursive:true,force:true});
test('real FFmpeg audio measurement, exact selection and Production reuse without paid call',{skip},async()=>{
  const f=fixture();try{
    f.rehearsal();
    assert.equal(requiresBuild(f.root,f.config),true);
    assert.ok(!requiredTools(f.config).includes('gemini-tts'));
    assert.ok(evaluateTiming(f.root,f.config).problems.some(x=>x.code==='TIMING_VOICE_SELECTION_MISSING'));
    const c=importAudition(f.root,f.config,f.scene,{file:f.audio,confirm:true});
    assert.ok(Math.abs(c.durationSec-2)<0.02);
    assert.equal(importAudition(f.root,f.config,f.scene,{file:f.audio,confirm:true}).reused,true);
    assert.throws(()=>chooseAudition(f.root,f.config,f.scene,f.state,{hash:c.candidateHash}),/confirm/);
    chooseAudition(f.root,f.config,f.scene,f.state,{hash:c.candidateHash,confirm:true});
    assert.equal(listAuditions(f.root,f.config,f.scene).selected,c.candidateHash);
    assert.equal(evaluateTiming(f.root,f.config).status,'PASS');
    const result=await voice(f.root,f.config,f.scene,f.state,{allowPaidApi:false});
    assert.equal(result.reusedSelectedAudio,true);
    assert.equal(fileHash(path.join(sceneDir(f.root,f.scene.id),'voice.wav')),c.audioHash);
    assert.equal(f.state.budget.ttsCalls,0);
    assert.equal(staleParts(f.scene,f.config,sceneState(f.state,f.scene.id),f.root).voice,false);
    f.scene.narration+=' Changed';
    assert.equal(selectedVoice(f.root,f.config,f.scene),null);
    assert.ok(evaluateTiming(f.root,f.config).problems.some(x=>x.code==='TIMING_VOICE_SELECTION_MISSING'));
  }finally{cleanup(f);}
});
test('overflow, changed audio and locked scenes fail closed',{skip},()=>{
  const f=fixture();try{
    f.scene.durationSec=2;f.rehearsal(1000);
    const c=importAudition(f.root,f.config,f.scene,{file:f.audio,confirm:true});
    chooseAudition(f.root,f.config,f.scene,f.state,{hash:c.candidateHash,confirm:true});
    const report=evaluateTiming(f.root,f.config);
    assert.ok(report.problems.some(x=>x.code==='TIMING_VOICE_OVERFLOW'));
    assert.ok(report.problems.some(x=>x.code==='TIMING_ACTION_OVERFLOW'));
    sceneState(f.state,f.scene.id).locked=true;
    assert.throws(()=>chooseAudition(f.root,f.config,f.scene,f.state,{hash:c.candidateHash,confirm:true}),/LOCKED/);
    fs.appendFileSync(c.audio,'tampered');
    assert.ok(evaluateTiming(f.root,f.config).problems.some(x=>x.code==='TIMING_VOICE_SELECTION_MISSING'));
  }finally{cleanup(f);}
});
test('audition cannot incur cost without explicit opt-in',{skip},async()=>{
  const f=fixture();try{
    await assert.rejects(auditionVoice(f.root,f.config,f.scene,f.state,{allowPaidApi:false}),/allow-paid-api/);
    assert.equal(f.state.budget.ttsCalls,0);
  }finally{cleanup(f);}
});
