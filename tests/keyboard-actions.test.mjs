import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCaptureEvidenceConfig} from '../src/capture-assertions.mjs';
import {executeCaptureAction} from '../src/capture-actions.mjs';
test('bounded key press is a real locator interaction, not an assertion',async()=>{
  const calls=[],page={getByLabel(label,opts){assert.equal(label,'New Todo Input');assert.equal(opts.exact,true);return {press:async(key,options)=>calls.push({key,options})};}};
  const action={type:'press',label:'New Todo Input',key:'Enter',timeoutMs:2000};
  validateCaptureEvidenceConfig({actions:[action]});
  await executeCaptureAction(page,action,{appUrl:'http://127.0.0.1:8000',report:{actions:[]}});
  assert.deepEqual(calls,[{key:'Enter',options:{timeout:2000}}]);
  for(const invalid of [{...action,key:'Control+L'},{...action,key:'F12'},{...action,label:undefined},{...action,evidenceId:'fake'}])
    assert.throws(()=>validateCaptureEvidenceConfig({actions:[invalid]}),/press/);
  assert.throws(()=>validateCaptureEvidenceConfig({actions:[action],evidencePolicy:{requireAssertions:true}}),/explicit capture assertion/);
});
