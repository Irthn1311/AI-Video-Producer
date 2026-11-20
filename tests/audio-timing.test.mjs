import test from 'node:test';
import assert from 'node:assert/strict';
import {sentenceParts,validateCaptionTiming,speechFromSilence,alignNarration,validateCaptionRows,chunkCaption} from '../src/audio-timing.mjs';

test('MathMate-like measured silence maps sentences to their spoken regions, not pauses',()=>{
  const measured=speechFromSilence([{start:0,end:.25},{start:1.15,end:1.75},{start:2.95,end:3.2}],3.2);
  assert.deepEqual(measured.spans,[{start:.25,end:1.15},{start:1.75,end:2.95}]);
  const result=alignNarration('First sentence. Second sentence.',3.2,{mode:'audio-pauses',measured,maxChars:80});
  assert.equal(result.timingMethod,'SILENCE_ANCHORED_SENTENCES');
  assert.equal(result.rows[0].startMs,250);assert.equal(result.rows[0].endMs,1150);
  assert.equal(result.rows[1].startMs,1750);assert.equal(result.rows[1].endMs,2950);
  assert.equal(result.reviewRequired,true);
});
test('mismatched speech-region count is explicitly estimated and stays within audio',()=>{
  const measured=speechFromSilence([{start:.8,end:1.35},{start:2,end:2.45}],3);
  const result=alignNarration('One sentence. Two sentences. Three sentences. Four sentences.',3,
    {mode:'audio-pauses',measured});
  assert.equal(result.timingMethod,'SILENCE_AWARE_ESTIMATED');
  assert.equal(result.rows.length,4);
  assert.ok(result.analysis.warnings.some(s=>s.includes('estimated')));
  assert.equal(validateCaptionRows(result.rows,3),true);
});
test('human sentence anchors are explicit and cannot exceed the measured voice duration',()=>{
  const scene={narration:'Hello. World.',captionTiming:{mode:'manual',anchors:[
    {startSec:.3,endSec:1.1},{startSec:2,endSec:2.9}]}};
  assert.doesNotThrow(()=>validateCaptionTiming(scene,{voiceover:{enabled:true}}));
  const aligned=alignNarration(scene.narration,3,{...scene.captionTiming});
  assert.equal(aligned.timingMethod,'MANUAL_AUDIO_ANCHORS');
  assert.equal(aligned.rows[1].startMs,2000);
  assert.throws(()=>alignNarration(scene.narration,2.5,{...scene.captionTiming}),/exceeds/);
  const invalid={...scene,captionTiming:{mode:'manual',anchors:[
    {startSec:.2,endSec:1.9},{startSec:1.5,endSec:2.4}]}};
  assert.throws(()=>validateCaptionTiming(invalid,{voiceover:{enabled:true}}),/overlapping/);
});
test('long Vietnamese caption sentences chunk to bounded text without overlap',()=>{
  const narration='Đây là một ví dụ lời thuyết minh khá dài về việc kiểm chứng tính năng sản phẩm bằng thao tác thực tế trong ứng dụng.';
  const result=alignNarration(narration,7,{mode:'proportional',maxChars:40});
  assert.ok(result.rows.length>1);
  assert.ok(result.rows.every(row=>Array.from(row.text).length<=40));
  assert.equal(validateCaptionRows(result.rows,7,40),true);
  assert.ok(chunkCaption(narration,40).length>1);
});
test('silence-only speech regions fail rather than hallucinate an alignment',()=>{
  assert.equal(speechFromSilence([{start:0,end:2}],2).spans.length,0);
  assert.throws(()=>alignNarration('Hello.',2,{mode:'audio-pauses',measured:{spans:[]}}),/requires measured/);
});
test('validation rejects missing anchors and unsupported modes before any provider calls',()=>{
  assert.throws(()=>validateCaptionTiming({narration:'A.',captionTiming:{mode:'manual',anchors:[]}},
    {voiceover:{enabled:true}}),/match/);
  assert.throws(()=>validateCaptionTiming({narration:'A.',captionTiming:{mode:'audio-pauses'}},
    {voiceover:{enabled:false}}),/requires voiceover/);
  assert.throws(()=>validateCaptionTiming({narration:'A.',captionTiming:{mode:'invalid'}},{}),/mode/);
  assert.throws(()=>validateCaptionRows([{startMs:300,endMs:200,text:'Fail'}],1),/timestamp/);
  assert.deepEqual(sentenceParts('Xin chào. Tạm biệt!'),['Xin chào.','Tạm biệt!']);
});
