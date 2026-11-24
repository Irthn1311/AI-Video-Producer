import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePointerPath,hasPointerTransition} from '../src/pointer-actions.mjs';
import {executeCaptureAction} from '../src/capture-actions.mjs';

const stroke={type:'pointerPath',testId:'canvas',points:[{x:.1,y:.2},{x:.8,y:.7}]};
const before={type:'assertAttribute',testId:'canvas',attribute:'data-drawn',expectedValue:'no',evidenceId:'initial'};
const after={...before,expectedValue:'yes',evidenceId:'result'};

test('normalized pointer path is bounded, moving and rejects extra executable fields',()=>{
  assert.doesNotThrow(()=>validatePointerPath(stroke));
  for(const bad of [
    {...stroke,points:[{x:-1,y:0},{x:1,y:1}]},
    {...stroke,points:[{x:0,y:0},{x:0,y:0}]},
    {...stroke,points:Array.from({length:81},()=>({x:.3,y:.4}))},
    {...stroke,points:[{x:0,y:0},{x:1,y:1,code:'eval'}]},
    {...stroke,script:'eval'},
    {...stroke,timeoutMs:999999}
  ])assert.throws(()=>validatePointerPath(bad));
});
test('pointer capability needs distinct before/after attribute evidence on same target',()=>{
  assert.equal(hasPointerTransition([before,stroke,after]),true);
  assert.equal(hasPointerTransition([stroke,after]),false);
  assert.equal(hasPointerTransition([before,after,stroke]),false);
  assert.equal(hasPointerTransition([before,stroke,{...after,expectedValue:'no'}]),false);
  assert.equal(hasPointerTransition([before,stroke,{...after,testId:'other'}]),false);
  assert.equal(hasPointerTransition([before,stroke,{...after,evidenceId:'initial'}]),false);
});
test('ordinary non-adapter capture cannot use pointerPath',async()=>{
  await assert.rejects(executeCaptureAction({},stroke,{report:{},adapter:false}),/reviewed project adapter/);
});
