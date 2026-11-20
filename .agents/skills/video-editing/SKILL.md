---
name: video-editing
description: Build AVP scene previews and render verified timeline with FFmpeg or Remotion
---

# video-editing

## Use when
A scene has current footage, caption and optional voice artifacts, and is ready for a preview or render.

## Inputs and workflow
1. Read `AGENTS.md` and `project.json`. Run `node bin/avp.mjs status --project <project-dir>`; resolve stale artifacts first.
2. Preview the current scene with `node bin/avp.mjs preview --project <project-dir> --scene <scene-id>`; run `node bin/avp.mjs qa --project <project-dir> --scene <scene-id>`.
3. Review at least opening, key action, scene ending, and caption visibility. Technical QA does not prove semantic correctness.
4. In review mode, request approval with `node bin/avp.mjs approve --project <project-dir> --stage scene --scene <scene-id>`. Do not approve without actual review.
5. Default `render.engine=ffmpeg` concatenates approved previews. When composition graphics or complex transitions are needed, load `avp-remotion-workflow` and the relevant bundled `avp-remotion-*` skills before selecting `render.engine=remotion`.
6. Render final with `node bin/avp.mjs render --project <project-dir>`, then inspect `.avp/output/final.mp4` and `final-qa.json`.

## Output and recovery
Each scene owns `.avp/scenes/<scene-id>/preview.mp4` and `qa-report.json`. Change only affected source/config; never overwrite a locked scene without explicit unlock. If a composition error occurs, keep valid footage, voice, captions and review history as evidence. A new preview requires current QA and approval.

## Privacy and truthfulness
No artificial UI success, hidden real errors, unauthorized music or external assets. Do not treat a successful FFmpeg decode as proof of what the application actually did.
