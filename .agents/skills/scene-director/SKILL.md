---
name: scene-director
description: Review, lock and selectively rebuild video scenes
---

# scene-director

Check capture, voice, caption, preview and QA individually. In review mode show per-scene preview before avp approve --stage scene. Locked scenes are read-only until avp unlock. When rewriting content, identify affected downstream artifacts; never regenerate unrelated scenes merely because one clip changed.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.
