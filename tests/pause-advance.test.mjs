import test from 'node:test';import assert from 'node:assert/strict';
import {proposePauseAdvance,applyPauseCandidate} from '../src/pause-advance.mjs';
const actions=[{type:'goto'},{type:'pause',ms:1500},{type:'click'},{type:'pause',ms:1000},{type:'assertVisible',evidenceId:'a'},{type:'pause',ms:900},{type:'assertVisible',evidenceId:'b'}];
const row=(id,t,start,end)=>({evidenceId:id,status:'OUTSIDE_DECLARED_WINDOW',evidencePreviewSec:t,cueStartSec:start,cueEndSec:end,maxOffsetSec:.5});
test('common advance changes only explicit pauses before all anchors and keeps action order',()=>{
  const c=proposePauseAdvance(actions,{results:[row('a',5.6,0,3.3),row('b',7.1,3.7,5.7)]});
  assert.equal(c.status,'CANDIDATE');assert.equal(c.requestedAdvanceMs,2000);
  const next=applyPauseCandidate(actions,c);assert.equal(next[1].ms+next[3].ms,500);assert.deepEqual(next.slice(4),actions.slice(4));assert.equal(actions[1].ms,1500);
  assert.throws(()=>applyPauseCandidate(next,c),/Stale/);
});
test('incompatible, unresolved, already aligned or insufficient inputs do not invent timing',()=>{
  assert.equal(proposePauseAdvance(actions,{results:[row('a',5,0,1),row('b',2,3,4)]}).status,'NO_COMMON_ADVANCE');
  assert.equal(proposePauseAdvance(actions,{results:[{status:'UNRESOLVED'}]}).status,'UNRESOLVED');
  assert.equal(proposePauseAdvance(actions,{results:[row('a',2,1,3)]}).status,'NO_ADVANCE_REQUIRED');
  assert.equal(proposePauseAdvance([{type:'assertVisible',evidenceId:'a'}],{results:[row('a',5,0,1)]}).status,'INSUFFICIENT_PAUSE_BUDGET');
});
