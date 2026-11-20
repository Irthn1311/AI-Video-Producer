---
name: avp-remotion-studio
description: Inspect AVP compositions in Remotion Studio before final rendering
---

# avp-remotion-studio

## Steps
1. Confirm installed dependencies via `npm install` and `node bin/avp.mjs doctor`; ensure the Remotion project/composition exists.
2. For a standalone composition, use `npx remotion studio remotion/src/index.tsx` from the AVP root if supported by the installed Remotion version. The CLI renderer creates a project-specific `.avp/remotion/src/index.tsx` and `public/timeline.json`; consult these generated files when viewing a real project.
3. Open the `AVPVideo` composition with the same props/timeline as final rendering. If Studio cannot resolve generated assets, generate them via the existing renderer or make a non-destructive local preview copy; do not bypass stage review.
4. Scrub through scene boundaries, narration starts/ends, zoom frames, caption wraps, transitions and logo frames. Check that browser UI remains legible.
5. Record exact scene ID, time/frame and issue description for each defect. Make targeted edits and inspect again.

## Exit criteria
No known empty frames, unintended crops or caption collisions in reviewed points; actual encoded render must still pass AVP QA. Studio preview does not replace final encoded-file validation.
