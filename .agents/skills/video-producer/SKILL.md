---
name: video-producer
description: Orchestrate an AVP software-demo production from repository research to reviewed MP4
---

# video-producer

## Trigger
Use when the user requests a video for a repository or application using AI Video Producer. This skill orchestrates other skills and the Node CLI; it does not claim the CLI independently reasons about product features.

## Checklist
1. Open `AGENTS.md`, `docs/quickstart.md`, the target project's brief/config. Run `node bin/avp.mjs doctor`.
2. Load `repo-intelligence`; run `avp inspect` and gather targeted source/runtime evidence, avoiding full source dumps. If architectural relationships are complex, load the **bundled** `graphify` skill as needed and install its executable separately.
3. Load `feature-coverage`; create verified feature candidates with route, action, expected result and source/browser evidence. Explicitly list exclusions and uncertain claims.
4. Load `storyboard-planner`; choose only evidenced features, stable scene IDs and time budgets, write the canonical scene plan and narration. Run `avp plan` to generate review artifacts, then synchronize `project.json` and storyboard to satisfy the current contract.
5. In review mode show coverage and storyboard to the human **before** expensive calls. Record approvals through `avp approve --stage coverage` and `--stage storyboard` only after they are genuinely accepted.
6. For each scene load `browser-capture` and `scene-director`; use genuine test-environment actions. When voice is enabled load `ai-voiceover`; any paid TTS request needs its explicit opt-in. Generate captions/preview, run `video-qa`, and request scene approval.
7. Load `video-editing`. If the project requires Remotion graphics or `render.engine=remotion`, first load the **bundled** `avp-remotion-workflow` (and selected subskills) rather than fetching general advice.
8. Export after reviewing stale status, scene reviews and QA. Verify final file exists and report unresolved semantic issues and expense estimates without claiming they are proven.

## Failure handling
Use `production-optimizer` to evaluate cache and affected downstream artifacts. If a scene fails, preserve other approved scenes, read the capture/QA reports, correct only the failing step and retry within the user's limits. Never patch the target app to falsify behavior or run production-affecting actions without consent.

## Deliverables
Feature evidence, approved storyboard, per-scene footage/audio/captions and QA, final MP4, source project and an accurate status/limitations report.
