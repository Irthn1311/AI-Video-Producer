# Roadmap and acceptance criteria

## v0.1 implemented in repository

- Portable Node CLI, config validation, project initialization, inspection, planning artifacts, review gates, scene capture/import, optional Gemini TTS, estimated SRT, FFmpeg preview and final concat, optional Remotion adapter.
- JSON state with content fingerprints, artifact hashes, approval checks bound to current planning/QA evidence, scene locks, estimated API-call reservations, smoke tests, CI, bilingual docs, and agent skill playbooks.

## Important limitations

- `repo-intelligence` is a human/agent procedure; Graphify/Serena/Aider are *optional external* tools, not automatically installed or orchestrated.
- `plan` generates schema-aligned drafts; an AI agent must inspect the product and author the screenplay, narration and verify feature coverage.
- Browser recording requires installed Playwright/Chromium and a running demo application. Paid speech synthesis requires a provider key and explicit opt-in. Subtitle timing uses estimated sentence durations rather than forced alignment.
- `--allow-paid-api` is required for paid TTS. The CLI enforces an estimated per-call and project reservation budget **before network requests**, but estimates cannot cap the provider's real invoice. Retry caps are policy guidance; there is no general job scheduler.
- Scene history and automatic restore of old media versions are not implemented. Capture hashes include source content, app URL and viewport to detect changes inside the configured source scope; runtime/browser changes outside that scope still require explicit review. Scene locks protect the current approved artifacts.
- Automatic agent self-healing and robust true-cost accounting are future milestones.

## Quality-first capability routing baseline

The project includes a declarative capability registry and non-executing `avp route` preflight with Quality as the default policy. It labels required tools, deferred MCP/Graphify escalation, semantic review requirements and estimated paid API budget. It does not measure Coding Agent subscription quota or automatically enforce capability decisions inside the existing production commands.

## Next milestones

1. End-to-end real Playwright browser capture integration and smoke render in CI under containerized sample app.
2. Additional TTS providers, quota-aware preflight, improved usage reporting and speech-quality checks.
3. More precise scene-level source dependency tracking, versioned media assets and automatic restore/rollback.
4. Captions aligned to actual speech (Whisper/forced alignment), human audio review, dubbed subtitle translations.
5. Full multi-OS CI (Windows/macOS), Codex/Claude/Gemini CLI compatibility tests, reusable standalone CLI distribution.
6. Additional modules for explainer/marketing; sample project and external user usability study.

A release is considered usable only when a new contributor can follow README on a fresh machine and produce an authentic demo, plus a documented QA report. Tag releases only after tests run on supported platforms.
