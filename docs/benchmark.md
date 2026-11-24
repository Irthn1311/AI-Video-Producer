# Benchmark protocol and preview readiness

The integrated dashboard/canvas fixtures exercise real browser/media production. They are author-known fixtures, not independent unseen apps or MathMate parity. CI logs AVP_BENCHMARK JSON observations. Do not publish fixture results as a real external benchmark.

## Independent benchmark

Select two repositories from distinct domains without supplying a ready-made AVP scene list, feature map, adapters or storyboard to the agent. Record pinned source revision, hardware, AVP commit, agent/model version, explicit permitted tools, safe local environment, test data and independent evaluator. Use a separate AVP workspace per run; source may be read-only. Do not execute unknown repository scripts without approval. No provider secrets in logs. Never upload private videos or source.

Use the entry skill and workflow next/step. Capture actual feature proof, inspect actual video/audio and captions; record semantic review findings. If required capability is absent, report blocker, do not substitute a fake demo. Compare interactive/autonomous with same requirements and constraints; record human interventions and external agent tokens/time only if measured. Test at least one real Vietnamese voice with consent or an authorized local recording, including pronunciation and caption sync. MathMate parity requires genuine handwriting, pairing and OCR/feedback in authorized test environment; fixture canvas alone is not parity.

Record complete Production with:
```sh
avp benchmark record --label baseline --kind full --scope external --confirm
avp benchmark record --label targeted --kind repair --scope external --confirm
avp benchmark list
avp benchmark compare --full HASH --repair HASH
```

All enabled media must be initially stale/missing and executed through journaled Production for full; repair must have both preserved and executed media. Current output, frozen Build, complete non-reconciled journal, baseline, QA and no unobserved changed artifact required. Production execution events bind resulting artifact hashes/input hashes/build times and final QA hash. Interrupted checkpoint tests remain separate; incomplete timing is rejected, not imputed. Receipt is local, hash-verified; it does not measure external agent work, actual billing, counterfactual encoder time or semantic truth. Scope external is operator-declared, not proof of blindness. A v1 versus v2 comparison has different config hashes, so percentage savings are deliberately null. For matched-input comparison, run a clean full rebuild of the repaired v2 config in an independent workspace with same source, environment, media policy and selected voice; compare receipts by copying the verified JSON receipt into the benchmark directory. Repeat at least three trials and report variance, not a single timing guarantee. Count measured regeneration seconds and provider reservations separately. No automatic external trial or provider call.

## Semantic policy

Set review.semantic to required to enforce a current declared external semantic review in either Production mode. Use semantic context/record after technical QA; inspect actual audio and video, not just frames. A non-PASS dimension or stale receipt blocks approval/render. Scene and final approvals bind exact receipts. Advisory remains default. This is enforcement of declared external review, not an independent semantic evaluator or a guarantee of truthful content. CI's synthetic declarations test the gate, not semantic quality.

## Release status

v0.1 preview only. No stable tag until E2 parity, external unknown-app, security and cross-platform/agent criteria are met. See MASTER_UPGRADE_CHECKLIST. F-08 policy/measurement and F-09 benchmark/release are separate in the canonical checklist; this batch provides shared foundations, not completed acceptance.
