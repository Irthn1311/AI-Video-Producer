# F-05f — integrated agentic execution validation

## Acceptance evidence
Run `npm test` and `AVP_INTEGRATED_SMOKE=1 node --test tests/integrated-build-smoke.test.mjs` with installed Playwright Chromium, FFmpeg, and Remotion. CI runs these suites. Require success on the exact PR head before merge.

| Area | Test evidence | Scope / remaining work |
|---|---|---|
| A6-02/08/09 | Workflow task hashes, cache/dispatch bounds, interrupted Build journal stops | No hard deadline or cross-command global lock |
| A6-03/04/06/07/10 | Real rehearsal, freeze, authorization and stale/tampered input denial | No independent semantic or external tool trust assessment |
| B1-01/02/03/05/07 | Dashboard/canvas fixture workflow dispatch, real browser capture, QA, review, MP4, failure and resume | Scene steps, not independent shot execution; no general agent LLM loop |
| B1-04 | Managed Node fixture, launch/readiness/fresh process/cleanup | No DB seed/auth, OS isolation or descendant recovery |
| B1-06 | Not implemented | Multi-device capture remains open |
| D-01/03/06/08 | Agent handoffs, explicit review, typed assertion failure, interrupted checkpoint reconciliation | Human/agent decisions scripted; no automatic repair |
| D-04/05/07/09 | Local telemetry, zero paid calls in fixture, provider mocked failure, retained artifact hashes, per-revision reservation guard | No actual billing/token/quota or general capability ranking |
| D-02/10 | Not independently established | Real agent role/semantic evaluation and unknown-repo benchmark remain open |

The dashboard and canvas cases now route actual Build and Production through the unified CLI, including source-linked storyboard handoff, adapter approval/trial, risk-first rehearsal, selected audio, planning/creative review, freeze, scene/final review and scoped edit repair. The managed fixture checks autonomous Production without scene/final operator approvals but still requires explicit launch/actions and Build freeze. Fixture storyboard, review confirmations and synthetic tones are not LLM generation, human review quality or actual narration tests.

The interrupted Production test removes the terminal journal event after real capture, emulating a crash between artifact persistence and journal completion. It checks explicit reconciliation without replay and the retained capture hash. This is deterministic fault injection, not a real process SIGKILL experiment. The Build interruption test writes a RUNNING checkpoint and checks fail-closed behavior. The provider test uses a mocked HTTP response, never a real paid request.

No checklist criterion is marked complete solely on these fixture results. Production quality and targeted shot/scene repair, broader environment support, unknown repository benchmark, semantic evidence after editing, real speech and final review remain separate acceptance work.
