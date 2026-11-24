import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCaptureEvidenceConfig} from '../src/capture-assertions.mjs';
import {validatePointerPath,hasPointerTransition,executePointerPath} from '../src/pointer-actions.mjs';
import {executeCaptureAction} from '../src/capture-actions.mjs';
const loc={canvasClass:'main-canvas'},before={type:'assertCanvasPixels',...loc,pixelColor:'#000000ff',minPixels:0,maxPixels:0,evidenceId:'before'},after={...before,minPixels:10,maxPixels:2000000,evidenceId:'after'};
const pointer={type:'pointerPath',...loc,points:[{x:.1,y:.1},{x:.5,y:.5}]};
test('bounded canvas pixel evidence validates disjoint before/after ranges only',()=>{
  validatePointerPath(pointer);validateCaptureEvidenceConfig({actions:[before,pointer,after],evidencePolicy:{requireAssertions:true}});
  assert.equal(hasPointerTransition([before,pointer,after]),true);
  assert.equal(hasPointerTransition([before,pointer,{...after,minPixels:0}]),false);
  assert.equal(hasPointerTransition([before,pointer,{...after,pixelColor:'#ffffffff'}]),false);
  assert.throws(()=>validatePointerPath({...pointer,canvasClass:'main-canvas, body'}));
  for(const a of [{...before,canvasClass:'main-canvas > div'},{...before,role:'button'},{...before,maxPixels:2000001},{...before,pixelColor:'black'}])
    assert.throws(()=>validateCaptureEvidenceConfig({actions:[a]}));
});
test('canvas evidence only through reviewed adapter execution',async()=>{
  await assert.rejects(executeCaptureAction({},before,{adapter:false,report:{actions:[],assertions:[]},appUrl:'http://127.0.0.1:8000'}),/reviewed adapter/);
});

test('paced pointer path emits actual sequential mouse events, honors bounded duration, releases button',async()=>{
  for(const durationMs of [0,249,5001,1.5,'300'])assert.throws(()=>validatePointerPath({...pointer,durationMs}),/durationMs/);
  const el={waitFor:async()=>{},scrollIntoViewIfNeeded:async()=>{},boundingBox:async()=>({x:0,y:0,width:100,height:100})};
  const moves=[];let down=0,up=0;const page={viewportSize:()=>({width:100,height:100}),mouse:{move:async(x,y)=>moves.push({x,y}),down:async()=>down++,up:async()=>up++}};
  const start=performance.now();await executePointerPath(page,{...pointer,durationMs:250},()=>el);
  assert.ok(performance.now()-start>=220);assert.ok(moves.length>=7);assert.equal(down,1);assert.equal(up,1);assert.deepEqual(moves.at(-1),{x:49.5,y:49.5});
  let calls=0;page.mouse.move=async()=>{if(++calls>1)throw Error('simulated failure');};
  await assert.rejects(executePointerPath(page,{...pointer,durationMs:250},()=>el),/simulated failure/);assert.equal(up,2);
});
