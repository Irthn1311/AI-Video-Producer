---
name: avp-remotion-workflow
description: Route AVP video tasks to actionable Remotion guides and preserve scene reviews
---

# avp-remotion-workflow

## Use when
An AVP job needs more than concatenating approved clips: scene composition, typography, visual emphasis, overlays, transitions, or rendering with Remotion.

## Procedure
1. Read `AGENTS.md`, `project.json`, `docs/architecture.md`, and `.agents/skills/video-editing/SKILL.md`.
2. Run `node bin/avp.mjs status --project <project-dir>` before editing; do not replace locked scenes.
3. Load only the relevant AVP-authored guides below:
   - `avp-remotion-create` — composition and scene timeline.
   - `avp-remotion-markup` — on-screen graphics, animation and framing.
   - `avp-remotion-captions` — subtitle formatting and timing checks.
   - `avp-remotion-studio` — visual inspection during editing.
   - `avp-remotion-render` — final render, QA, delivery.
   - `avp-remotion-docs` — verify API details against the installed Remotion version.
4. Preserve the per-scene source of truth and technical QA. Artistic changes may require regeneration and reapproval but never re-capture real UI when footage is unchanged.
5. Run `node bin/avp.mjs render --project <project-dir>` only after the required gates pass.

## Outputs
A composition source, scene previews when relevant, final MP4, QA report and a clear list of changes. Never call a valid media file evidence of accurate product functionality.

## Failure and security
If Remotion dependencies are absent, explain setup and use the existing FFmpeg path when it meets the request; do not silently change a project's rendering goal. External assets must have permission/license. Never commit secrets or private footage.
