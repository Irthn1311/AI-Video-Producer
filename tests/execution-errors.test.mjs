import test from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionError,failureDetails,providerHttpError,interruptedFailure} from '../src/execution-errors.mjs';
import {executeCaptureAction} from '../src/capture-actions.mjs';
test('typed provider status distinguishes credentials, rate, transient, invalid request; no response body',()=>{
  for(const [status,code,retry] of [[401,'PROVIDER_AUTH',true],[403,'PROVIDER_AUTH',true],[429,'PROVIDER_RATE_LIMIT',true],[503,'PROVIDER_TRANSIENT',true],[400,'PROVIDER_REQUEST_REJECTED',false]]){
    const f=failureDetails(providerHttpError(status),'voice');
    assert.equal(f.code,code);assert.equal(f.retrySameRevision,retry);assert.equal(f.metadata.httpStatus,status);assert.equal(f.automaticRetry,false);
  }
});
test('journal diagnostics use bounded metadata, never exception text or private fields',()=>{
  const e=new ExecutionError('ASSERTION_FAILED','PRIVATE-TEST-VALUE',{actionIndex:2,actionType:'assertText',private:'PRIVATE-TEST-VALUE',failedChecks:['claimEvidence','PRIVATE-TEST-VALUE']});
  const f=failureDetails(e,'capture');
  assert.equal(f.disposition,'RETURN_TO_BUILD');assert.equal(f.retrySameRevision,false);
  assert.deepEqual(f.metadata,{actionType:'assertText',actionIndex:2,failedChecks:['claimEvidence']});
  assert.ok(!JSON.stringify(f).includes('PRIVATE-TEST-VALUE'));
  assert.equal(interruptedFailure().disposition,'RECONCILE_FIRST');
  assert.equal(failureDetails(new Error('unknown'),'capture').code,'STEP_EXECUTION_FAILED');
});
test('shared browser runner classifies actual assertion failure at action boundary',async()=>{
  const page={getByTestId:()=>({waitFor:async()=>{},innerText:async()=>'different'})};
  const report={actions:[{type:'goto'}],assertions:[]};
  await assert.rejects(executeCaptureAction(page,{type:'assertText',testId:'result',expectedText:'desired',evidenceId:'result'},{appUrl:'http://localhost:1234',dir:null,report}),e=>{
    const f=failureDetails(e,'capture');assert.equal(f.code,'ASSERTION_FAILED');assert.equal(f.metadata.actionIndex,1);assert.equal(f.retrySameRevision,false);return true;
  });
  assert.equal(report.assertions.length,0);
});
test('QA failure is not eligible for blind retry and tool failures are local repair',()=>{
  assert.equal(failureDetails(new ExecutionError('SCENE_QA_FAILED','failed',{failedChecks:['duration']}),'qa').retrySameRevision,false);
  assert.equal(failureDetails(new ExecutionError('MEDIA_TOOL_FAILED','private',{tool:'ffmpeg'}),'preview').disposition,'REPAIR_LOCAL');
});
