# Roadmap and acceptance criteria

**Master execution checklist:** [MASTER_UPGRADE_CHECKLIST.md](MASTER_UPGRADE_CHECKLIST.md). This roadmap is a historical/high-level summary. For currently completed vs pending items and acceptance tests, use the master checklist and the actual CI/PR evidence.


## v0.1 implemented in repository

- Portable Node CLI, config validation, project initialization, inspection, planning artifacts, review gates, scene capture/import, optional Gemini TTS, estimated SRT, FFmpeg preview and final concat, optional Remotion adapter.
- JSON state with content fingerprints, artifact hashes, approval checks bound to current planning/QA evidence, scene locks, estimated API-call reservations, smoke tests, CI, bilingual docs, and agent skill playbooks.

## Integrated preview foundations (F-05 to F-08/F-09)

See [workflow](workflow.md), [telemetry](telemetry.md), [production quality](production-quality.md), [targeted repair](targeted-repair.md) and [benchmark protocol](benchmark.md). The deterministic executor, scoped repair, local release archive and optional declared semantic review gate are foundations, not full autonomous agent or stable release acceptance. The canonical checklist separates F-08 decision/cost policies from F-09 external benchmark/release; known-fixture CI is not independent acceptance.

## Important limitations

- `repo-intelligence` is a human/agent procedure; Graphify/Serena/Aider are *optional external* tools, not automatically installed or orchestrated.
- `plan` generates schema-aligned drafts; an AI agent must inspect the product and author the screenplay, narration and verify feature coverage.
- Browser recording requires installed Playwright/Chromium and a running demo application. Paid speech synthesis requires a provider key and explicit opt-in. Subtitle timing is now silence-aware for spoken scenes or human-anchored on request; **these are still not ASR/forced word-level alignment**, and visual/audio review remains required.
- `--allow-paid-api` is required for paid TTS. The CLI enforces an estimated per-call and project reservation budget **before network requests**, but estimates cannot cap the provider's real invoice. Retry caps are policy guidance; there is no general job scheduler.
- Local explicit scene snapshots and restore are implemented; automatic capture-stage checkpoints, retention pruning and fully transactional rollback remain open. Capture hashes include source content, app URL and viewport to detect changes inside the configured source scope; runtime/browser changes outside that scope still require explicit review. Scene locks protect the current approved artifacts.
- Automatic agent self-healing and robust true-cost accounting are future milestones.

## F-03b Project-specific adapters and checked browser trials — PARTIAL

A project can scaffold a declarative adapter, explicitly review the manifest, perform real same-origin Chromium test actions (with optional reset), then freeze the bound toolchain/plan only after positive assertions. The identical recipe is used in capture and rehearsal; hashes invalidate stale QA. The first runtime is **declarative and browser-isolated only**: arbitrary scripts, OS/container sandboxing, independent licensing audits, multi-device actions, self-generated adapters and real unknown-app acceptance remain open under A2/A3.

## F-03 Domain-aware skill/tool discovery — PARTIAL

`src/skill-discovery.mjs` matches source-derived capability needs to a curated local implementation/guidance registry; opt-in `skills search --online` searches GitHub repository metadata only for unresolved capabilities with a source/version keyed 24-hour cache. Explicit `capabilityRequirements` in `project.json` turn unimplemented abilities into Build blockers. The Build profile and toolchain lock record the trusted registry and local hashes. **External repositories remain unreviewed/unpinned/unexecuted research**, not production-ready skills. Source runtime triage, trust approvals, sandbox trials and agent-driven adapter construction remain open under A2/A3.

## F-02 Project Intelligence — PARTIAL

`src/project-intelligence.mjs` provides bounded local source inspection for framework/entrypoint candidates, route/API declarations, and domain capability signals; `avp analyze` exports a provenance-backed report and `build prepare` includes it in canonical Build artifacts. It does **not** run an autonomous agent, test feature behavior, execute app scripts, search skills online or rank a full business-domain feature inventory. Those capabilities are still open under A1/A2/A3.

## First two-phase BUILD/PRODUCTION contract (A6 — PARTIAL)

New `avp init` projects require `build prepare`, real Playwright `build rehearse`, planning review, and `build freeze` before starting media production; existing unopted legacy configs continue to work. Artifacts/lock files are hashed and a structured readiness report distinguishes `BLOCKED`, `REVIEW_REQUIRED`, `READY`. The same action executor runs in rehearsal and capture, but rehearsal proof is **not** copied to Production evidence. This is a tested foundational handoff, not full A6 acceptance on unknown repositories, dynamic capability discovery, agent orchestration or shot-level repair.

## Quality-first capability routing baseline

The project includes a declarative capability registry and non-executing `avp route` preflight with Quality as the default policy. It labels required tools, deferred MCP/Graphify escalation, semantic review requirements and estimated paid API budget. It does not measure Coding Agent subscription quota or automatically enforce capability decisions inside the existing production commands.

## Scene snapshots and manual rollback

AVP can snapshot scene media, evidence and caption metadata into local versioned folders, verify original file checksums and restore after an explicit unlock/confirm. Restoring clears scene/final approval and requires QA again. Automatic revision snapshots on each production step, retention/pruning and fine-grained source dependencies are not yet implemented.

## Audio timing parity

Audio-enabled scenes can use local FFmpeg silence analysis for estimated sentence anchors or manually reviewed sentence timings. SRT and JSON caption artifacts are protected by content hashes. Voice and capture are reused when timing changes; no additional model call is required. Continuous/noisy speech still needs manual review or an optional aligner.

## Evidence-backed claim gates

The `verification.mode=claims` contract (default for new project templates, opt-in for legacy configs) validates declared feature coverage, exact narration excerpts and explicit runtime assertion mappings. Scene QA binds matching assertions to current capture/report hashes; post-capture tampering invalidates approval. `avp evidence` reports verification readiness locally. This is **not** autonomous semantic review; agent-generated claims still need independent factual/editorial judgement.

## MathMate runtime evidence primitives

The capture engine supports opt-in DOM and network-response assertions, producing local `capture-report.json` artifacts tied by hash to scene QA. These checks do not require LLM calls and fail closed when enabled. **Claim-to-evidence binding and automated feature-coverage enforcement remain incomplete**.

## Next milestones

1. End-to-end real Playwright browser capture integration and smoke render in CI under containerized sample app.
2. Additional TTS providers, quota-aware preflight, improved usage reporting and speech-quality checks.
3. More precise scene-level source dependency tracking, versioned media assets and automatic restore/rollback.
4. Captions aligned to actual speech (Whisper/forced alignment), human audio review, dubbed subtitle translations.
5. Full multi-OS CI (Windows/macOS), Codex/Claude/Gemini CLI compatibility tests, reusable standalone CLI distribution.
6. Additional modules for explainer/marketing; sample project and external user usability study.

A release is considered usable only when a new contributor can follow README on a fresh machine and produce an authentic demo, plus a documented QA report. Tag releases only after tests run on supported platforms.
