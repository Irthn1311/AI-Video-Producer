# Roadmap and acceptance criteria

## v0.1 implemented in repository

- Portable Node CLI, config validation, project initialization, inspection, planning artifacts, review gates, scene capture/import, optional Gemini TTS, estimated SRT, FFmpeg preview and final concat, optional Remotion adapter.
- JSON state with scene hashes, approvals, locks, invalidation, source reports, smoke tests, CI, bilingual getting-started docs and agent skill playbooks.

## Important limitations

- `repo-intelligence` is a human/agent procedure; Graphify/Serena/Aider are *optional external* tools, not automatically installed or orchestrated.
- `plan` generates schema-aligned drafts; an AI agent must inspect the product and author the screenplay, narration and verify feature coverage.
- Browser automated capture is tested by users after installing Chromium, not by the offline unit suite. TTS is live/provider-dependent. Subtitle timings are estimated, not word-aligned.
- `--allow-paid-api` is necessary but the budget configuration is advisory, not a provider billing limit. Retry caps are a policy instruction, not yet a general job scheduler.
- Scene source version history and production dependency hashes across app revisions are not fully implemented. Locks protect current approved artifacts; back up versions externally if needed.
- Automatic agent self-healing and robust true-cost accounting are future milestones.

## Next milestones

1. End-to-end real Playwright browser capture integration and smoke render in CI under containerized sample app.
2. Provider adapters with actual cost ceilings, quota guards, cached TTS and language-aware speech quality gates.
3. Source repo fingerprinting, change impact analysis, versioned scene assets and automatic QA invalidation.
4. Captions aligned to actual speech (Whisper/forced alignment), human audio review, dubbed subtitle translations.
5. Full multi-OS CI (Windows/macOS), Codex/Claude/Gemini CLI compatibility tests, reusable standalone CLI distribution.
6. Additional modules for explainer/marketing; sample project and external user usability study.

A release is considered usable only when a new contributor can follow README on a fresh machine and produce an authentic demo, plus a documented QA report. Tag releases only after tests run on supported platforms.
