import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(path.join(root,'config','capabilities.json'),'utf8'));

export const capabilityRegistry = registry;
export const profileNames = Object.freeze(Object.keys(registry.profiles));

function validEnum(label, value, allowed) {
  if (!allowed.includes(value)) throw new Error(label + ' must be one of: ' + allowed.join(', '));
}

export function resolveProfile(config = {}) {
  const value = config?.optimization?.profile ?? registry.defaultProfile;
  validEnum('optimization.profile', value, profileNames);
  return value;
}

/**
 * Deterministic tool selection only. Does NOT invoke an agent, install skills,
 * connect to MCP, run a provider, or assert that a feature/video was verified.
 * 'available' is an explicit host/tool inventory, not evidence of correctness.
 */
export function routeCapabilities({
  task, profile = registry.defaultProfile, risk = 'normal',
  complexity = 'normal', available = [], paidConsent = false,
  estimatedUsd = null, maxEstimatedUsd = null, alreadyReservedUsd = 0
} = {}) {
  validEnum('profile', profile, profileNames);
  validEnum('risk', risk, ['normal','high']);
  validEnum('complexity', complexity, ['normal','complex']);
  if (!registry.tasks[task]) throw new Error('Unknown capability task: ' + String(task));
  if (!Array.isArray(available) || available.some(id => typeof id !== 'string' || !(id in registry.capabilities))) {
    throw new Error('available must be an array of known capability IDs');
  }
  if (!Number.isFinite(alreadyReservedUsd) || alreadyReservedUsd < 0) throw new Error('Invalid alreadyReservedUsd');
  const policy = registry.profiles[profile];
  const inventory = new Set([...registry.bundled, ...available]);
  const steps = [];
  const blockers = [];
  const review = [];
  const deferred = [];
  let selectedPaidUsd = 0;
  const stages = registry.tasks[task];

  for (const stage of stages) {
    const required = stage.required === true;
    const applicable =
      stage.when === 'always' || stage.when === 'complex' && complexity === 'complex' ||
      stage.when === 'high-risk' && risk === 'high' ||
      stage.when === 'quality' && profile === 'quality' ||
      stage.when === 'quality-or-high-risk' && (profile === 'quality' || risk === 'high') ||
      stage.when === 'if-available';
    if (!applicable) continue;

    const considered = stage.candidates.filter(id => inventory.has(id));
    const chosenId = considered[0] ?? null;
    if (!chosenId) {
      const reason = 'No available capability for ' + stage.id + ' (' + stage.candidates.join(', ') + ')';
      (required ? blockers : deferred).push(reason);
      steps.push({stage:stage.id,status:required?'blocked':'deferred',reason,candidates:stage.candidates});
      continue;
    }
    const tool = registry.capabilities[chosenId];
    let status = tool.manual ? 'human-review-required' : 'planned';
    let reason = tool.manual ? 'Human must perform and record this review before it can count as verified.' : null;
    if (tool.paid) {
      const limitOK = maxEstimatedUsd !== null && Number.isFinite(maxEstimatedUsd) && maxEstimatedUsd > 0;
      const estimateOK = estimatedUsd !== null && Number.isFinite(estimatedUsd) && estimatedUsd > 0;
      if (!paidConsent) reason = 'Paid provider requires explicit consent.';
      else if (!limitOK || !estimateOK) reason = 'An explicit positive estimate and budget are required.';
      else if (alreadyReservedUsd + selectedPaidUsd + estimatedUsd > maxEstimatedUsd + 1e-9) reason = 'Estimated budget exceeded; no provider call permitted.';
      if (reason) {
        status = 'blocked';
        blockers.push(stage.id + ': ' + reason);
      } else selectedPaidUsd += estimatedUsd;
    }
    if (tool.manual) review.push(stage.id);
    steps.push({stage:stage.id,capability:chosenId,kind:tool.kind,status,
      reason,load:tool.load ?? null,privacy:tool.privacy,cost:tool.cost,
      evidence:stage.evidence ?? null});
  }
  return {
    schemaVersion:1,task,profile,risk,complexity,status:blockers.length?'blocked':review.length?'review-required':'planned',
    mode:'planning-only',policy,steps,blockers,reviewRequired:review,deferred,
    budget:{
      estimatedUsdPlanned:selectedPaidUsd,
      maxEstimatedUsd,
      alreadyReservedUsd,
      remainingEstimatedUsd:Number.isFinite(maxEstimatedUsd)?Math.max(0,maxEstimatedUsd-alreadyReservedUsd-selectedPaidUsd):null,
      providerQuotaKnown:false,
      note:'No external subscription quotas are accessible here. This plan reserves nothing and makes no network/API call.'
    },
    guarantees:{
      independentEvidenceRequired:profile==='quality'||risk==='high',
      technicalQaCannotProveSemanticCorrectness:true,
      skipHumanReviewAutomatically:false,
      executionPerformed:false
    }
  };
}
