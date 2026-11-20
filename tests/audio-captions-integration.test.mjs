import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson,sceneDir,fileHash} from '../src/utils.mjs';
import {loadState,sceneState,recordArtifact,inputHashes,staleParts,validateSceneQa} from '../src/state.mjs';
import {captions,preview,qaScene} from '../src/media.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const ffmpeg=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});
const ffprobe=spawnSync('ffprobe',['-version'],{encoding:'utf8'});
const skip=Boolean(ffmpeg.error||ffprobe.error);

function wav(file,{silenceOnly=false}={}){
  const sr=16000;
  const spans=silenceOnly?[]:[{start:.28,end:1.19},{start:1.79,end:2.96}];
  const seconds=3.22,frames=Math.round(sr*seconds),data=Buffer.alloc(44+frames*2);
  data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);
  data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);
  data.writeUInt16LE(1,22);data.writeUInt32LE(sr,24);
  data.writeUInt32LE(sr*2,28);data.writeUInt16LE(2,32);
  data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++){
    const t=i/sr,active=spans.some(s=>t>=s.start&&t<s.end);
    const sample=active?Math.round(9000*Math.sin(2*Math.PI*330*t)):0;
    data.writeInt16LE(sample,44+i*2);
  }
  fs.writeFileSync(file,data);
}
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-real-audio-'));
  fs.mkdirSync(path.join(root,'app'));
  fs.writeFileSync(path.join(root,'app','app.js'),'export const demo = 1;');
  const config=readJson(path.join(repo,'templates','project.json'));
  config.sourcePath='app';config.verification={mode:'legacy'};
  config.review.mode='autonomous';config.voiceover.enabled=true;
  config.render={engine:'ffmpeg',width:320,height:180,fps:24,captionsBurned:false};
  const scene={...config.scenes[0],durationSec:4,narration:'First sentence. Second sentence.'};
  delete scene.claims;delete scene.capture.evidencePolicy;
  config.scenes=[scene];
  const state=loadState(root),dir=sceneDir(root,scene.id);
  fs.mkdirSync(dir,{recursive:true});
  const voiceFile=path.join(dir,'voice.wav');wav(voiceFile);
  recordArtifact(root,state,scene,'voice',voiceFile,inputHashes(scene,config,sceneState(state,scene.id),root).voice);
  return {root,config,scene,state,dir,voiceFile};
}
test('audio-pauses captions follow two actual sine-burst speech regions and do not regenerate TTS',{
  skip,timeout:30000
},()=>{
  const f=fixture();
  try{
    const voiceHash=fileHash(f.voiceFile);
    const out=captions(f.root,f.config,f.scene,f.state);
    assert.equal(out.timingMethod,'SILENCE_ANCHORED_SENTENCES');
    const metadata=readJson(path.join(f.dir,'captions.json'));
    assert.equal(metadata.timingIsForcedAlignment,false);
    assert.equal(metadata.audioDurationSec,3.22);
    assert.equal(metadata.voiceHash,voiceHash);
    assert.equal(metadata.rows.length,2);
    assert.ok(Math.abs(metadata.rows[0].startMs-280)<90,JSON.stringify(metadata.rows));
    assert.ok(Math.abs(metadata.rows[0].endMs-1190)<110,JSON.stringify(metadata.rows));
    assert.ok(Math.abs(metadata.rows[1].startMs-1790)<110,JSON.stringify(metadata.rows));
    assert.equal(fileHash(f.voiceFile),voiceHash);
    assert.equal(captions(f.root,f.config,f.scene,f.state).reused,true);
    assert.equal(staleParts(f.scene,f.config,sceneState(f.state,f.scene.id),f.root).voice,false);
    f.scene.captionTiming={mode:'manual',anchors:[
      {startSec:.31,endSec:1.12},{startSec:1.83,endSec:2.91}]};
    assert.equal(staleParts(f.scene,f.config,sceneState(f.state,f.scene.id),f.root).captions,true);
    assert.equal(staleParts(f.scene,f.config,sceneState(f.state,f.scene.id),f.root).voice,false);
    assert.equal(captions(f.root,f.config,f.scene,f.state).timingMethod,'MANUAL_AUDIO_ANCHORS');
    assert.equal(fileHash(f.voiceFile),voiceHash);
    assert.equal(readJson(path.join(f.dir,'captions.json')).rows[0].startMs,310);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('Remotion JSON and SRT are both integrity-bound to preview QA and scene approval',{
  skip,timeout:60000
},async()=>{
  const f=fixture();
  try{
    const clip=path.join(f.dir,'capture.mp4');
    const make=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=4',
      '-c:v','libx264','-pix_fmt','yuv420p',clip],{encoding:'utf8',timeout:20000});
    assert.equal(make.status,0,make.stderr);
    recordArtifact(f.root,f.state,f.scene,'capture',clip,inputHashes(f.scene,f.config,sceneState(f.state,f.scene.id),f.root).capture);
    captions(f.root,f.config,f.scene,f.state);
    await preview(f.root,f.config,f.scene,f.state);
    const qa=qaScene(f.root,f.config,f.scene,f.state);
    assert.equal(qa.pass,true,JSON.stringify(qa));
    assert.equal(qa.checks.captionTimeline,true);
    assert.equal(qa.captionTiming,'SILENCE_ANCHORED_SENTENCES');
    assert.equal(qa.captionReviewRequired,true);
    validateSceneQa(f.root,f.config,f.scene,f.state);
    const metadataFile=path.join(f.dir,'captions.json');
    const metadata=readJson(metadataFile);
    metadata.rows[0].startMs=0;writeJson(metadataFile,metadata);
    const staleness=staleParts(f.scene,f.config,sceneState(f.state,f.scene.id),f.root);
    assert.equal(staleness.capture,false);
    assert.equal(staleness.voice,false);
    assert.equal(staleness.captions,true);
    assert.equal(staleness.preview,true);
    assert.throws(()=>validateSceneQa(f.root,f.config,f.scene,f.state),/stale/);
    // Repairing captions should preserve the expensive voice and unchanged capture.
    const oldVoice=fileHash(f.voiceFile),oldCapture=fileHash(clip);
    const repaired=captions(f.root,f.config,f.scene,f.state);
    assert.equal(repaired.timingMethod,'SILENCE_ANCHORED_SENTENCES');
    assert.equal(fileHash(f.voiceFile),oldVoice);
    assert.equal(fileHash(clip),oldCapture);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('voiceover containing no audible speech rejects silence-aware captions',{
  skip,timeout:30000
},()=>{
  const f=fixture();
  try{
    wav(f.voiceFile,{silenceOnly:true});
    recordArtifact(f.root,f.state,f.scene,'voice',f.voiceFile,inputHashes(f.scene,f.config,sceneState(f.state,f.scene.id),f.root).voice);
    assert.throws(()=>captions(f.root,f.config,f.scene,f.state),/No non-silent audio region/);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('no-voice projects remain on the explicitly estimated no-cost timing path',{
  skip,timeout:15000
},()=>{
  const f=fixture();
  try{
    f.config.voiceover.enabled=false;
    const out=captions(f.root,f.config,f.scene,f.state);
    assert.equal(out.timingMethod,'PROPORTIONAL_TEXT_ESTIMATED');
    assert.equal(readJson(path.join(f.dir,'captions.json')).audioDurationSec,null);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
