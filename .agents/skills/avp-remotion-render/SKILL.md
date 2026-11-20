---
name: avp-remotion-render
description: Render AVP-approved scenes and verify Remotion final MP4
---

# avp-remotion-render

## Prerequisites
Completed technical QA for current scene previews; reviews/locks consistent with `project.json`; Remotion dependencies installed; FFmpeg and ffprobe available.

## Procedure
1. Run `node bin/avp.mjs status --project <project-dir>` and resolve `stale` components before rendering. If review mode is active, obtain the recorded approvals first.
2. Set `render.engine` to `remotion` in the project config **before** building/approving the current timeline. A configuration change can invalidate existing output/reviews.
3. Run `node bin/avp.mjs render --project <project-dir>`. The current adapter bundles a composition named `AVPVideo`, selects it, and outputs `.avp/output/final.mp4`.
4. Check the generated `final-qa.json` for codec, dimensions, fps and duration; run `ffprobe` on final output and decode it with FFmpeg if diagnosis is needed.
5. Watch the beginning, every scene boundary, critical claims and ending. Verify narration/visual agreement separately from technical QA.
6. If a render fails, inspect missing media, asset paths, incompatible Remotion versions or temporal frame calculations; do not regenerate TTS/capture unless inputs are actually stale.

## Output
Current final MP4, QA evidence, identified caveats and the exact changes needed if QA fails. Rendering is not publishing: honor the final approval gate.
