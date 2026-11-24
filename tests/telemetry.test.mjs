import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readJson,writeJson} from '../src/utils.mjs';
import {telemetryReport,reuseComparison} from '../src/telemetry.mjs';
import {synthesizeVoice} from '../src/voice-provider.mjs';
import {loadState} from '../src/state.mjs';
const fixture=()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'avp-telemetry-'));
  fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app','index.js'),'export const app=1;');
  const config=readJson(new URL('../templates/project.json',import.meta.url));config.sourcePath='app';config.voiceover.enabled=false;
  return {root,config};
};
const cleanup=f=>fs.rmSync(f.root,{recursive:true,force:true});
test('journal metrics separate attempts, retries, failures, interrupted work and actual outcomes',()=>{
  const f=fixture();try{
    const rev='a'.repeat(64),event={kind:'capture',key:'s:capture',sceneId:'s',capability:'playwright-runtime'};
    writeJson(path.join(f.root,'.avp','production',rev+'.json'),{schemaVersion:1,revision:rev,events:[
      {...event,status:'RUNNING'},{...event,status:'FAILED',elapsedMs:12},
      {...event,status:'RUNNING'},{...event,status:'EXECUTED',elapsedMs:30,outcome:'REUSED'},
      {kind:'voice',key:'s:voice',sceneId:'s',capability:'selected-local-audio',status:'RUNNING'},
      {kind:'voice',key:'s:voice',sceneId:'s',capability:'selected-local-audio',status:'EXECUTED',elapsedMs:5,outcome:'SELECTED_AUDIO_COPY'},
      {...event,key:'other:capture',sceneId:'other',status:'RUNNING'}]});
    const report=telemetryReport(f.root,f.config);
    assert.deepEqual(report.production.totals,{attempts:4,executed:2,failed:1,reconciled:0,open:1,retries:1,observedMs:47,reusedDispatches:1,selectedAudioCopies:1});
    assert.equal(report.production.byCapability['playwright-runtime'].attempts,3);
    assert.equal(report.artifacts.baselineAvailable,false);assert.equal(report.artifacts.unchangedCount,null);
    assert.equal(report.artifacts.counts.DISABLED,f.config.scenes.length);
    assert.equal(report.provider.actualBilledUsd,null);assert.equal(report.provider.subscriptionQuota,null);
  }finally{cleanup(f);}
});
test('reuse requires valid baseline and current identical input, bytes and build time',()=>{
  const a={status:'CURRENT',hash:'a'.repeat(64),inputHash:'b'.repeat(64),builtAt:'before'};
  const baseline=[{sceneId:'one',artifacts:{capture:a,voice:a,preview:a}}];
  const current=[{sceneId:'one',artifacts:{capture:{...a},voice:{...a,status:'STALE_OR_MISSING'},preview:{...a,builtAt:'after'}}}];
  assert.deepEqual(reuseComparison(baseline,current),[{sceneId:'one',kind:'capture'}]);
});
test('mock provider dispatch records reservation and failure without real API or secrets',async()=>{
  const f=fixture(),original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;try{
    process.env.GEMINI_API_KEY='TEST_KEY_NOT_REAL';
    f.config.voiceover={...f.config.voiceover,enabled:true,provider:'gemini',maxApiCallsPerRun:2,estimatedUsdPerCall:.01};
    f.config.budget={...f.config.budget,maxEstimatedUsd:1};
    globalThis.fetch=async()=>({ok:false,status:429});
    const state=loadState(f.root);
    await assert.rejects(synthesizeVoice(f.root,f.config,f.config.scenes[0],state,{allowPaidApi:true,budgetSession:{calls:0},phase:'BUILD'}),/HTTP 429/);
    const report=telemetryReport(f.root,f.config);
    assert.equal(report.provider.reservedCalls,1);assert.equal(report.provider.observedDispatchStarts,1);
    assert.equal(report.provider.byPhase.BUILD.failed,1);assert.equal(report.provider.estimatedUsdReserved,.01);
    assert.equal(report.provider.actualBilledUsd,null);assert.ok(!JSON.stringify(state.history).includes('TEST_KEY_NOT_REAL'));
  }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;cleanup(f);}
});
