import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCaptureEvidenceConfig,captureEvidencePassed} from '../src/capture-assertions.mjs';

const action={type:'assertVisible',testId:'save-result',evidenceId:'saved'};
test('evidence capture schema accepts DOM and same-origin response assertions',()=>{
  const config={evidencePolicy:{requireAssertions:true,failOnPageError:true},
    actions:[action,{type:'clickExpectResponse',role:'button',name:'Save',response:{
      pathContains:'/api/save',method:'POST',status:200,bodyIncludes:'"ok":true'},evidenceId:'api'}]};
  assert.doesNotThrow(()=>validateCaptureEvidenceConfig(config));
});
test('evidence schema fails on no assertions, invalid locator, path or conflicting evidence ID',()=>{
  assert.throws(()=>validateCaptureEvidenceConfig({evidencePolicy:{requireAssertions:true},actions:[{type:'click',testId:'x'}]}),/requires at least/);
  assert.throws(()=>validateCaptureEvidenceConfig({actions:[{type:'assertText',expectedText:'x'}]}),/locator/);
  assert.throws(()=>validateCaptureEvidenceConfig({actions:[{type:'assertText',testId:'x'}]}),/expectedText/);
  assert.throws(()=>validateCaptureEvidenceConfig({actions:[{type:'clickExpectResponse',testId:'x',response:{pathContains:'https://bad',method:'POST',status:200}}]}),/start with/);
  assert.throws(()=>validateCaptureEvidenceConfig({actions:[action,action]}),/Duplicate evidenceId/);
});
test('evidence gate requires genuine PASS and rejects errors or failed assertions',()=>{
  const policy={requireAssertions:true,failOnPageError:true};
  const ok={status:'PASS',assertions:[{type:'assertVisible',id:'saved',pass:true}],pageErrors:[]};
  assert.equal(captureEvidencePassed(ok,policy),true);
  assert.equal(captureEvidencePassed({...ok,status:'FAIL'},policy),false);
  assert.equal(captureEvidencePassed({...ok,assertions:[]},policy),false);
  assert.equal(captureEvidencePassed({...ok,pageErrors:['bad']},policy),false);
  assert.equal(captureEvidencePassed({...ok,assertions:[{pass:false}]},policy),false);
  assert.equal(captureEvidencePassed({...ok,pageErrors:['bad']},{requireAssertions:true,failOnPageError:false}),true);
});
