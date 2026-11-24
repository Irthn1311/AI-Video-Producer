# Quickstart (humans and AI coding agents)

1. Install Node 22+, Git, FFmpeg/ffprobe; run `npm install` then `npx playwright install chromium` (needed only for browser recording). `node bin/avp.mjs doctor` shows tool availability.
2. Start `npm run demo` for the provided fixture at `http://127.0.0.1:4173`. This sample app is intentionally fake only as a self-contained **tool test** and must not be passed off as a real customer feature.
3. `node bin/avp.mjs inspect --project examples/sample-project` inventories the app's source without LLM, tokens or uploading code. Follow `.agents/skills/repo-intelligence/SKILL.md` for any actual repo investigation.
4. `node bin/avp.mjs plan --project examples/sample-project` creates planning drafts. New examples and new `avp init` projects use `verification.mode=claims`: every scene feature has a narration excerpt linked to Playwright assertions. The generated feature list is a **candidate plan**, not verified runtime evidence. **Agent/human reviews the feature list and storyboard** before approvals; `avp plan` does not call an LLM or certify features.
5. `node bin/avp.mjs approve --project examples/sample-project --stage coverage` and `--stage storyboard` only after inspecting the drafts.
6. `node bin/avp.mjs run --project examples/sample-project` records the first scene, verifies configured UI assertions, generates captions, makes preview and QA; review mode stops. Watch `.avp/scenes/scene-01-intro/preview.mp4` and approve via `--stage scene --scene scene-01-intro`. Repeat `run` and scene approval for subsequent scenes.
7. Run `node bin/avp.mjs evidence --project examples/sample-project` after capturing scenes: `VERIFIED_ASSERTIONS` means the configured conditions were observed against current footage, **not independent semantic validation**. Then `node bin/avp.mjs render --project examples/sample-project` exports `.avp/output/final.mp4`. Review final, then `avp approve --stage final` (publishing is your responsibility).

## BUILD first for newly initialized projects

New `avp init` projects require a verified Build Package before any capture/voice/preview/render. After approving the candidate coverage and storyboard, run `avp build prepare`, `avp build rehearse --scene ID --allow-actions` for every scene on a disposable app, `avp build check`, then `avp build freeze --confirm`. The `READY` gate prevents using stale Build inputs for new video production. **The repository's legacy sample project intentionally retains the old flow for compatibility tests.** Read [BUILD → PRODUCTION](build-production.md).

## Quality capability preflight

New projects default to `optimization.profile=quality` and `verification.mode=claims`; older configs without verification continue in legacy mode for compatibility. Inspect the local capability plan:

```bash
node bin/avp.mjs route --project examples/sample-project --task repo-research
node bin/avp.mjs route --project examples/sample-project --task feature-verification --risk high
```

A blocked plan indicates a missing required capability; `review-required` indicates outstanding human review. Both are **planning states**, never proof of passing QA. See [Capability Router](capability-router.md).

## Using your own app

`node bin/avp.mjs init /your/output/project`, then edit `/your/output/project/project.json`: replace the **sample-specific** scene feature IDs, claims and Playwright assertions with checks appropriate to your app; `sourcePath` is relative to the project directory, `appUrl` must reference **your disposable local demo application**, and `scenes[]` needs valid Playwright actions. To let an agent write the storyboard, hand it `docs/agent-prompt.md` and have it follow `AGENTS.md` and relevant skills. Prefer stable `testId` or accessible `role` locators. Production app is read-only by policy and tests should use fake accounts.

## Languages and TTS

Set `language.script`, `language.narration` (e.g. `vi-VN`, `en-US`) and `language.subtitles` array. Set `voiceover.enabled: true`, `provider: gemini`, `voice`, `model`, `style`, and a positive `estimatedUsdPerCall`; copy `.env.example` to `.env` and supply `GEMINI_API_KEY` on your machine; then call `voice --allow-paid-api`. The CLI reserves estimated USD before network calls and applies configured per-run/project limits; actual provider billing may differ. **Not** all languages/subtitle translations are automatically provided: v0.1 captions reflect the scene narration; translate the words yourself/with an agent before recording. Disable voice for a silent demo. API calls may be billed and network access is required.

## Speech-aware captions

When `voiceover.enabled=true`, the captions stage measures silence in `voice.wav` with FFmpeg and produces an SRT and `captions.json` with timing provenance. Use `scene.captionTiming` for manual sentence anchors in important scenes; read [Audio Captions](audio-captions.md). The resulting timing is **not forced word alignment**. TTS audio is reused when only caption timing changes.

## Scene versions and rollback

Before changing a working scene, consider `avp snapshot --scene <id> --label "before edit"`. Inspect `avp versions --scene <id>`, unlock the scene if it is approved, and use `avp restore --scene <id> --version v0001 --confirm` to recover an older version. Restoring does **not** restore QA or scene approval; rebuild if stale, rerun QA and approve. See [Scene Versions](scene-versions.md).

## Revision workflow

Before changing a scene, unlock it (`avp unlock --scene <id>`). Update its `project.json` scene config. `avp status` shows stale steps; use `run` to regenerate only affected steps. Changes inside `sourcePath` invalidate cached capture based on file content, even if file sizes are unchanged; run `avp status` and rebuild after unlocking the affected scene. For runtime changes outside `sourcePath`, use `capture --force` and then rebuild preview/QA as needed. Restoring a previous scene is currently manual—store versioned backups outside `.avp` first. `avp render` uses only reviewed current scene previews.

## Common issues

- **Playwright not found:** `npm install` and `npx playwright install chromium`; check the app URL is running.
- **FFmpeg subtitles filter fails:** your FFmpeg needs libass; alternatively set `render.captionsBurned=false` (SRT is still exported) and clearly disclose the missing burnt captions.
- **No GEMINI_API_KEY:** configure local `.env`; do not commit it. `voice` requires explicit `--allow-paid-api`.
- **Review gate blocks run:** open `.avp/planning/` or scene preview, then approve the correct stage. No silent auto-approval in review mode.
- **Slow/crashed render:** use fewer scenes, lower resolution/fps for test, preserve existing artifacts; do not overwrite locked scenes.
