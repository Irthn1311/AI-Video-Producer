import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCaptureEvidenceConfig} from '../src/capture-assertions.mjs';
import {validatePointerPath,hasPointerTransition} from '../src/pointer-actions.mjs';
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
