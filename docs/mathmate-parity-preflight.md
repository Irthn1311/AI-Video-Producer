# MathMate parity: upstream live-ink runtime preflight (candidate)

PR40 exact-head CI 4/4 PASS; run 45398816092, job 138461691526, head f509196fbc7b96a6bc6836c8ee61b5766bd89a78. All 5 cue/evidence anchors within declared 0.5s after two scoped repairs: Active +2.393s -> +0.337s, Completed +0.526s -> 0, Cleanup +0.686s -> +0.325s. Filter advance 2094ms planned, cleanup 386ms; full 115864ms / 21 dispatches, repairs 31507ms and 31997ms / 4 dispatches each, same voice/captions, unrelated media preserved. [Final artifact](https://github.com/Irthn1311/AI-Video-Producer/actions/runs/45398816092/artifacts/14921844029). Estimated cue alignment only; no forced alignment or natural speech approval.

## Actual MathMate source contract

Source: [Coach_Learning archive](https://github.com/Phat-le2005/Coach_Learning/tree/6d9bb4c070d0e724704bb4bd3758e113a208b87f), pinned archive branch. Reviewed `LOCAL_SETUP.md`, `CoachLearningVideo/PREPARATION.md`, `CoachLearningVideo/production/capture-solution.cjs`, `backend/tests/math_solutions/live_sync_harness.py`, `frontend/e2e/live-ink.spec.ts`, `frontend/e2e/lan-pairing.spec.ts`. Original production uses two separate browser contexts, reads pairing link from actual dialog, grants writing access, draws strokes on mobile-sized canvas, checks durable backend count and real OCR/review HTTP response. It is not equivalent to a local canvas pixel change.

This workflow executes the unchanged upstream live-ink browser test with actual Next frontend, FastAPI harness and fresh pgvector PostgreSQL. It validates real two-way draft streaming, concurrent writes, offline reconnect, reload persistence, erase/undo, clear/undo, page navigation and legacy autosave after disconnect. The original test logs QR UI only, not successful QR invitation or LAN pairing. Do not claim mobile hardware testing, AVP multi-context capture, real OCR/AI feedback or complete parity.

Dependencies are installed from the pinned upstream lockfiles in a disposable image before runtime; npm lifecycle scripts disabled, Python wheels only; image tags are version-family tags, not immutable digest locks. Runtime containers share a network-none PostgreSQL namespace (loopback only) with no host port, mounted read-only checkout, synthetic test database, no provider key, OCR disabled, no production data or database dump. App runs as unprivileged user, caps dropped, no new privileges; not a claim of absolute sandbox. The harness creates a new disposable schema; containers/volumes are removed. Only a sanitized receipt is retained, no raw session file, logs, stroke IDs, screenshots or token-bearing URLs. If install or runtime fails, report a blocker rather than mark PASS. Raw logs stay inside disposable container; diagnostic detail is deliberately limited. No tests executed yet at PR creation.

## Remaining parity steps

1. Actual upstream live ink E2E (this preflight).
2. Actual QR invitation grant and logged-out writer with LAN-enabled disposable runtime (separate upstream lan-pairing spec; not tested here).
3. AVP-reviewed multi-context adapter with separate viewport/recording clocks, scoped link binding, explicit permissions and paired evidence. Current single-page declarative adapter is insufficient.
4. Actual OCR/AI feedback on synthetic handwriting: authorized Gemini budget/key or a genuinely configured local recognizer; no response substitution. Review exact source/recognition and correct manual save before grading.
5. AVP production with synchronized desktop/mobile inset, natural speech, full QA and scoped repair. Original archived footage is historical reference, not current run evidence.

Independent Agent remains a separate experiment using docs/independent-agent-brief.md; no new Agent session has been launched.