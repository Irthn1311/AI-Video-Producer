---
name: production-optimizer
description: Minimize token, provider and render costs through caching
---

# production-optimizer

Check avp status, artifact checksums and scene dependencies; prefer rg/Graphify AST over bulk reads; reuse approved scenes. Only call paid APIs after user consent and avoid retry loops. v0.1 configured USD cap is advisory, not actual billing enforcement. Record uncertainties and estimates.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.
