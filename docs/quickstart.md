# Quickstart (humans and AI coding agents)

1. Install Node 22+, Git, FFmpeg/ffprobe; run `npm install` then `npx playwright install chromium` (needed only for browser recording). `node bin/avp.mjs doctor` shows tool availability.
2. Start `npm run demo` for the provided fixture at `http://127.0.0.1:4173`. This sample app is intentionally fake only as a self-contained **tool test** and must not be passed off as a real customer feature.
3. `node bin/avp.mjs inspect --project examples/sample-project` inventories the app's source without LLM, tokens or uploading code. Follow `.agents/skills/repo-intelligence/SKILL.md` for any actual repo investigation.
4. `node bin/avp.mjs plan --project examples/sample-project` creates planning drafts. **Agent/human edits and verifies feature coverage and narrative** before approvals. `avp plan` does not itself generate a screenplay with an LLM.
5. `node bin/avp.mjs approve --project examples/sample-project --stage coverage` and `--stage storyboard` only after inspecting the drafts.
6. `node bin/avp.mjs run --project examples/sample-project` records the first scene, generates captions, makes preview and QA; review mode stops. Watch `.avp/scenes/scene-01-intro/preview.mp4` and approve via `--stage scene --scene scene-01-intro`. Repeat `run` and scene approval for subsequent scenes.
7. `node bin/avp.mjs render --project examples/sample-project` exports `.avp/output/final.mp4`. Review final, then `avp approve --stage final` (publishing is your responsibility).

## Using your own app

`node bin/avp.mjs init /your/output/project`, then edit `/your/output/project/project.json`: `sourcePath` is relative to the project directory, `appUrl` must reference **your disposable local demo application**, and `scenes[]` needs valid Playwright actions. To let an agent write the storyboard, hand it `docs/agent-prompt.md` and have it follow `AGENTS.md` and relevant skills. Prefer stable `testId` or accessible `role` locators. Production app is read-only by policy and tests should use fake accounts.

## Languages and TTS

Set `language.script`, `language.narration` (e.g. `vi-VN`, `en-US`) and `language.subtitles` array. Set `voiceover.enabled: true`, `provider: gemini`, `voice`, `model`, `style`; copy `.env.example` to `.env` and supply `GEMINI_API_KEY` on your machine; then call `voice --allow-paid-api`. **Not** all languages/subtitle translations are automatically provided: v0.1 captions reflect the scene narration; translate the words yourself/with an agent before recording. Disable voice for a silent demo. API calls may be billed and network access is required.

## Revision workflow

Before changing a scene, unlock it (`avp unlock --scene <id>`). Update its `project.json` scene config. `avp status` shows stale steps; use `run` to regenerate only affected steps. If the app code changed but config didn't, use `capture --force` and then `captions`, `preview`, `qa` as needed. Restoring a previous scene is currently manual—store versioned backups outside `.avp` first. `avp render` uses only reviewed current scene previews.

## Common issues

- **Playwright not found:** `npm install` and `npx playwright install chromium`; check the app URL is running.
- **FFmpeg subtitles filter fails:** your FFmpeg needs libass; alternatively set `render.captionsBurned=false` (SRT is still exported) and clearly disclose the missing burnt captions.
- **No GEMINI_API_KEY:** configure local `.env`; do not commit it. `voice` requires explicit `--allow-paid-api`.
- **Review gate blocks run:** open `.avp/planning/` or scene preview, then approve the correct stage. No silent auto-approval in review mode.
- **Slow/crashed render:** use fewer scenes, lower resolution/fps for test, preserve existing artifacts; do not overwrite locked scenes.
