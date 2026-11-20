---
name: video-qa
description: Validate technical media and signal human review requirements
---

# video-qa

Run avp qa and inspect qa-report.json. Confirm video/audio streams, duration, resolution and caption artifact. Additional visual inspection, actual claim truthfulness and voice naturalness require human/agent review. Estimated caption timing is not forced alignment. Do not equate technical pass with publication approval.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.
