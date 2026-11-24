import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSceneEdit,editAssetNames,compileSceneEdit,defaultVisualTheme,shotIds} from '../src/editing.mjs';
import {visualStatus,shotDiff} from '../src/visual-direction.mjs';
const scene=(edit)=>({id:'mathmate',durationSec:8,narration:'Verified result',edit});
const sources={
  capture:{file:'footage/capture.mp4',durationSec:12},
  'asset:mobile':{file:'footage/mobile.mp4',durationSec:5}
};
test('MathMate-style shots compile with source trim, speed, zoom, focus and end hold',()=>{
  const edit={chapter:'Real result',shots:[
    {durationSec:3,trimStartSec:2,trimEndSec:5,zoom:1.08,focus:{x:.67,y:.42},label:'Focus'},
    {durationSec:4,trimStartSec:7,trimEndSec:9,playbackRate:1.5}
  ]};
  const result=compileSceneEdit(scene(edit),{sources,fps:30,captions:[],hasVoice:false});
  assert.equal(result.durationInFrames,240);
  assert.equal(result.shots.length,2);
  assert.equal(result.shots[0].playFrames,90);
  assert.equal(result.shots[0].trimBefore,60);
  assert.equal(result.shots[0].zoom,1.08);
  assert.equal(result.shots[1].fromFrame,90);
  assert.equal(result.shots[1].playFrames,40);
  assert.equal(result.shots[1].holdFrames,110); // freeze includes 1s gap and source shortage
  assert.equal(result.shots[1].playbackRate,1.5);
  assert.equal(result.chapter,'Real result');
});
test('audio can extend output without accelerating speech or recapturing',()=>{
  const result=compileSceneEdit(scene({chapter:'QA'}),{sources,fps:30,hasVoice:true,voiceDurationSec:9,captions:[]});
  assert.equal(result.durationInFrames,285);
  assert.equal(result.shots[0].durationFrames,285);
  assert.equal(result.shots[0].playbackRate,1);
  assert.equal(result.hasVoice,true);
});
test('inset and callout have bounded, frame-accurate positions',()=>{
  const edit={insets:[{asset:'mobile',startSec:1,durationSec:4,x:.7,y:.1,width:.25,height:.7,label:'Mobile device'}],
    callouts:[{text:'Actual OCR',startSec:3,durationSec:2,position:'top-right'}]};
  assert.deepEqual(editAssetNames(edit),['mobile']);
  const result=compileSceneEdit(scene(edit),{sources,fps:30});
  assert.equal(result.insets[0].fromFrame,30);
  assert.equal(result.insets[0].durationFrames,120);
  assert.equal(result.callouts[0].fromFrame,90);
});
test('invalid sources, traversal, bad timing or overflow fail closed',()=>{
  assert.throws(()=>validateSceneEdit(scene({shots:[{source:'asset:../../.env',durationSec:3}]})),/asset name/);
  assert.throws(()=>validateSceneEdit(scene({shots:[{durationSec:9}]})),/exceeds/);
  assert.throws(()=>validateSceneEdit(scene({shots:[{durationSec:3,playbackRate:9}]})),/playbackRate/);
  assert.throws(()=>validateSceneEdit(scene({insets:[{asset:'mobile',startSec:0,durationSec:3,x:.8,y:0,width:.4,height:.3}]})),/outside/);
  assert.throws(()=>compileSceneEdit(scene({shots:[{source:'asset:missing',durationSec:8}]}),{sources,fps:30}),/Missing source/);
  assert.throws(()=>compileSceneEdit(scene({shots:[{durationSec:8,trimStartSec:12}]}),{sources,fps:30}),/outside/);
});

const designed=()=>scene({design:{rationale:'Retain workflow and visible result',framing:'adaptive',theme:defaultVisualTheme},
  shots:[{id:'overview',durationSec:4,purpose:'Show context',camera:'static'},
    {id:'result',durationSec:4,purpose:'Show result',camera:'push',zoom:1.1,trimStartSec:6,trimEndSec:10,
      editReason:'Skip idle wait only; inspect visible evidence',transitionIn:{type:'fade',durationSec:.2}}]});
test('agent visual design compiles stable IDs, camera mode, fade, theme and documented trim',()=>{
  const s=designed(),plan=compileSceneEdit(s,{sources,fps:30});
  assert.deepEqual(shotIds(s),['overview','result']);
  assert.deepEqual(plan.shots.map(x=>x.id),shotIds(s));
  assert.equal(plan.shots[0].camera,'static');assert.equal(plan.shots[1].camera,'push');
  assert.equal(plan.shots[1].transitionInFrames,6);
  assert.deepEqual(plan.theme,defaultVisualTheme);
  assert.equal(visualStatus({creative:{visual:{}},scenes:[s]}).status,'PASS');
});
test('stable framing, explicit editing rationale, shot IDs, theme contrast and real source bounds fail closed',()=>{
  let s=designed();s.edit.design.framing='stable';assert.throws(()=>validateSceneEdit(s),/Stable/);
  s=designed();delete s.edit.shots[1].editReason;assert.throws(()=>validateSceneEdit(s),/editReason/);
  s=designed();s.edit.shots[1].id='overview';assert.throws(()=>validateSceneEdit(s),/unique stable IDs/);
  s=designed();s.edit.design.theme={...defaultVisualTheme,text:defaultVisualTheme.panel};assert.throws(()=>validateSceneEdit(s),/contrast/);
  s=designed();s.edit.shots[1].trimEndSec=15;assert.throws(()=>compileSceneEdit(s,{sources,fps:30}),/actual source/);
  s=designed();const second=structuredClone(s);second.id='other';second.edit.design.theme.accent='#abcdef';
  assert.equal(visualStatus({creative:{visual:{}},scenes:[s,second]}).status,'BLOCKED');
  assert.equal(visualStatus({creative:{visual:{}},scenes:[scene({})]}).status,'BLOCKED');
});
test('shot spec diff distinguishes insertion, editing and shared composition',()=>{
  const a=designed(),b=structuredClone(a);
  b.edit.shots[0].durationSec=2;
  b.edit.shots.splice(1,0,{id:'detail',durationSec:2,purpose:'Detail',camera:'static'});
  const d=shotDiff(a,b);
  assert.deepEqual(d.added,['detail']);assert.deepEqual(d.changed,['overview']);
  assert.deepEqual(d.unchangedSpecs,['result']);assert.equal(d.orderChanged,true);
  b.edit.design.theme={...defaultVisualTheme,accent:'#ffffff'};
  assert.equal(shotDiff(a,b).sharedCompositionChanged,true);
});
