import {cueEvidenceAlignment,captureToPreviewSec} from '../src/cue-evidence-alignment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {qualityPolicy,captionReadability} from '../src/quality-policy.mjs';
import {markerTimeline,evidenceTimeline,masterVoice} from '../src/production-quality.mjs';
import {run,fileHash,sceneDir,readJson} from '../src/utils.mjs';
import {inputHashes} from '../src/state.mjs';
test('quality policy is opt-in and readable Unicode cues must match script',()=>{
  assert.equal(qualityPolicy({}),null);assert.throws(()=>qualityPolicy({productionQuality:{targetLufs:0}}));
  const p=qualityPolicy({productionQuality:{}});
  assert.equal(captionReadability([{text:'Xin chào.',startMs:0,endMs:1000}],'Xin chào.',p).pass,true);
  assert.equal(captionReadability([{text:'Xin chào.',startMs:0,endMs:100}],'Xin chào.',p).pass,false);
  assert.equal(captionReadability([{text:'Sai.',startMs:0,endMs:1000}],'Xin chào.',p).pass,false);
});
test('measured action markers and conservative evidence coverage reject deleted/reordered footage',()=>{
  const scene={featureIds:['result']};
  const actions=[{type:'goto'},{type:'assertText',evidenceId:'result'}];
  const m=markerTimeline({actions:[{index:0,type:'goto',startMs:20,endMs:100},{index:1,type:'assertText',evidenceId:'result',startMs:120,endMs:900}]},actions);
  assert.equal(m.pass,true);
  const shot={file:'footage/capture.mp4',trimBefore:0,playFrames:48,playbackRate:1,transitionInFrames:0};
  assert.equal(evidenceTimeline(scene,m,{shots:[shot]},2,2,24).pass,true);
  assert.equal(evidenceTimeline(scene,m,{shots:[{...shot,trimBefore:24}]},2,2,24).pass,false);
  assert.equal(evidenceTimeline(scene,m,{shots:[{...shot,playFrames:12}]},2,2,24).pass,false);
  assert.equal(markerTimeline({actions:[]},actions).pass,false);
});
test('gain-only mastering preserves source bytes and duration, caches measured result',{timeout:60000},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-master-'));
  try{
    const scene={id:'sample'},config={productionQuality:{},voiceover:{enabled:true}},dir=sceneDir(root,scene.id);
    fs.mkdirSync(dir,{recursive:true});const src=path.join(dir,'voice.wav');
    run('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','pcm_s16le',src]);
    const before=fileHash(src),master=masterVoice(root,config,scene),receipt=readJson(path.join(dir,'voice-master.json'));
    assert.equal(receipt.pass,true);assert.equal(fileHash(src),before);assert.ok(Math.abs(receipt.sourceSec-receipt.outputSec)<=.05);
    const hash=fileHash(master);assert.equal(masterVoice(root,config,scene),master);assert.equal(fileHash(master),hash);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('speed changes are permitted only within a recorded explicit pause interior',()=>{
  const scene={featureIds:['result']},actions=[{type:'goto'},{type:'pause'},{type:'assertText',evidenceId:'result'}];
  const markers=markerTimeline({actions:[{index:0,type:'goto',startMs:0,endMs:100},{index:1,type:'pause',startMs:100,endMs:3100},{index:2,type:'assertText',startMs:3100,endMs:3400,evidenceId:'result'}]},actions);
  const shot=(trimBefore,playFrames,playbackRate=1)=>({file:'footage/capture.mp4',trimBefore,playFrames,playbackRate,transitionInFrames:0});
  const plan={shots:[shot(0,12),shot(12,24,2),shot(60,36)]};
  assert.equal(evidenceTimeline(scene,markers,plan,3,4,24).pass,true);
  assert.equal(evidenceTimeline(scene,markers,{shots:[shot(0,24,2),shot(48,48)]},3,4,24).pass,false);
});

test('duration-only repair invalidates silent-scene captions but preserves voiced narration inputs',()=>{
  const config={voiceover:{enabled:false},render:{fps:30}},scene={id:'s',durationSec:4,narration:'Example.',capture:{actions:[]}};
  const a=inputHashes(scene,config),b=inputHashes({...scene,durationSec:6},config);
  assert.notEqual(a.captions,b.captions);assert.notEqual(a.capture,b.capture);assert.notEqual(a.preview,b.preview);
  config.voiceover.enabled=true;
  const x=inputHashes(scene,config),y=inputHashes({...scene,durationSec:6},config);
  assert.equal(x.voice,y.voice);assert.equal(x.captions,y.captions);assert.notEqual(x.preview,y.preview);
});

test('cue evidence diagnostic maps edited source time and reports gaps, not speech verification',()=>{
  const scene={edit:{syncAnchors:[{evidenceId:'result',cueText:'Kết quả.',maxOffsetSec:.3}]}},markers={pass:true,evidence:[{id:'result',endMs:3000}]};
  const shot={file:'footage/capture.mp4',trimBefore:48,playFrames:48,playbackRate:2,fromFrame:24};
  const plan={shots:[shot]},rows=[{text:'Kết quả.',startMs:1400,endMs:1800}];
  assert.equal(captureToPreviewSec(3,plan,4,24),1.5);
  assert.equal(cueEvidenceAlignment(scene,markers,plan,rows,4,24).within,1);
  const late=cueEvidenceAlignment(scene,{pass:true,evidence:[{id:'result',endMs:5000}]},plan,rows,4,24);assert.equal(late.outside,1);assert.equal(late.results[0].signedGapSec,.7);
  assert.equal(cueEvidenceAlignment(scene,markers,{shots:[shot,{...shot,fromFrame:72}]},rows,5,24).unresolved,1);
  assert.equal(cueEvidenceAlignment(scene,markers,plan,[...rows,...rows],4,24).unresolved,1);
});
