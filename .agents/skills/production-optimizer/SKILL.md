---
name: production-optimizer
description: Minimize token, provider and render costs through caching
---

# production-optimizer

Check avp status, artifact checksums and scene dependencies; prefer rg/Graphify AST over bulk reads; reuse approved scenes. Only call paid APIs after user consent and avoid retry loops. The CLI enforces a local estimated-call budget; it cannot guarantee the provider's final bill. Record uncertainties and estimates.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.

## Bounded scene recovery
Before risky visual/audio revisions, read `docs/scene-versions.md` and create a local scene snapshot. Use `avp versions` to list revisions. Restoring is a deliberate user-approved operation with unlock and `--confirm`, always clearing prior QA/approval even if the snapshot was previously approved. Do not regenerate expensive TTS when a retained voice artifact is valid.
