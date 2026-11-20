---
name: video-editing
description: Build per-scene previews and assemble approved timeline
---

# video-editing

Use avp preview and inspect clip first/last frames, frame rate, cropping, captions and sound. Use avp render only after review gates. Default FFmpeg pipeline; optional Remotion needs installed dependencies and a working bundle. Do not overwrite locked files with aesthetic tweaks; unlock and reapprove.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.
