import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCapabilities,resolveProfile,capabilityRegistry} from '../src/capabilities.mjs';

test('Quality profile is the default even for older project configs', () => {
  assert.equal(resolveProfile({}), 'quality');
  assert.equal(resolveProfile({optimization:{profile:'quality'}}), 'quality');
  assert.equal(capabilityRegistry.defaultProfile, 'quality');
  assert.throws(() => resolveProfile({optimization:{profile:'anything'}}), /optimization.profile/);
});

test('basic research uses local inventory without additional MCP tools', () => {
  const p = routeCapabilities({task:'repo-research'});
  assert.equal(p.profile,'quality');
  assert.equal(p.status,'planned');
  assert.ok(p.steps.some(x=>x.capability==='avp-inspect'));
  assert.ok(!p.steps.some(x=>x.kind==='mcp'));
  assert.equal(p.guarantees.executionPerformed,false);
  assert.equal(p.budget.providerQuotaKnown,false);
});

test('complex research escalates only when available and never connects MCP', () => {
  const p = routeCapabilities({task:'repo-research',complexity:'complex'});
  assert.ok(p.deferred.some(s=>s.includes('complex-symbol-lookup')));
  const q = routeCapabilities({task:'repo-research',complexity:'complex',available:['serena-mcp']});
  assert.ok(q.steps.some(x=>x.capability==='serena-mcp'&&x.status==='planned'));
  assert.equal(q.mode,'planning-only');
});

test('high risk feature needs runtime observation and independent check', () => {
  const p=routeCapabilities({task:'feature-verification',risk:'high'});
  assert.equal(p.status,'blocked');
  assert.ok(p.blockers.some(x=>x.includes('runtime-observation')));
  const q=routeCapabilities({task:'feature-verification',risk:'high',available:['playwright-runtime']});
  assert.equal(q.status,'review-required');
  assert.ok(q.reviewRequired.includes('independent-review'));
  const m=routeCapabilities({task:'feature-verification',risk:'high',available:['playwright-runtime','agent-visual-review']});
  assert.equal(m.status,'planned');
  assert.ok(m.steps.some(x=>x.capability==='agent-visual-review'));
});

test('Quality video QA needs real technical QA and semantic/final review',()=>{
  const p=routeCapabilities({task:'video-qa',available:['ffprobe-qa']});
  assert.equal(p.status,'review-required');
  assert.ok(p.reviewRequired.includes('semantic-qa'));
  assert.ok(p.reviewRequired.includes('final-review'));
  assert.equal(p.guarantees.technicalQaCannotProveSemanticCorrectness,true);
});

test('paid provider planning blocks on missing consent or budget',()=>{
  const base={task:'voice',available:['gemini-tts'],maxEstimatedUsd:2,alreadyReservedUsd:1.9,estimatedUsd:0.2};
  const noConsent=routeCapabilities(base);
  assert.equal(noConsent.status,'blocked');
  const over=routeCapabilities({...base,paidConsent:true});
  assert.equal(over.status,'blocked');
  const ok=routeCapabilities({...base,paidConsent:true,estimatedUsd:0.05});
  assert.equal(ok.status,'planned');
  assert.equal(ok.budget.estimatedUsdPlanned,0.05);
  assert.equal(ok.budget.providerQuotaKnown,false);
  assert.match(ok.budget.note,/reserves nothing/);
});

test('Quality subtitle alignment cannot silently fall back to estimated captions',()=>{
  const p=routeCapabilities({task:'captions'});
  assert.equal(p.status,'blocked');
  assert.ok(p.blockers.some(x=>x.includes('alignment')));
  assert.ok(p.reviewRequired.includes('timing-review'));
});

test('invalid task, inventory and profile fail fast',()=>{
  assert.throws(()=>routeCapabilities({task:'bogus'}),/Unknown/);
  assert.throws(()=>routeCapabilities({task:'video-qa',profile:'bad'}),/profile/);
  assert.throws(()=>routeCapabilities({task:'video-qa',available:['unknown-mcp']}),/available/);
});
