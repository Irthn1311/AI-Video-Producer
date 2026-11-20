---
name: avp-remotion-create
description: Author AVP-compatible Remotion compositions and a data-driven timeline
---

# avp-remotion-create

## Prerequisites
Node 22+, the project's Remotion packages, available approved scene previews and knowledge of output dimensions/fps. Follow `avp-remotion-workflow`.

## Steps
1. Inspect `remotion/src/index.tsx`, `src/media.mjs` (`renderRemotion`) and the current `project.json`; preserve the `AVPVideo` composition ID unless you also update its caller.
2. Read scene IDs and recorded durations from generated timeline data; do **not** assume the original storyboard target duration equals the actual encoded length.
3. Use `Composition`, `Sequence`, `Video`, `Audio` and `staticFile` from the installed Remotion API as appropriate. Derive start frames with `Math.round(seconds * fps)` using one consistent fps.
4. Keep preview assets generated from AVP state as inputs; don't invent replacement footage or claim an animation shows live app behavior.
5. Verify each scene starts/ends on the intended frame and that the total duration covers every scene without overlaps or gaps.
6. Pass a deterministic composition through the existing Remotion rendering adapter. Run smoke renders at short duration or low resolution before full export.

## Definition of done
The composition loads, scene order matches approved plans, frames/timebase are consistent, and render/QA succeed. When source editing changes a reviewed scene, clear the old review or ask to unlock it.
