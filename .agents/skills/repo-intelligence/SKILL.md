---
name: repo-intelligence
description: Understand a repository with minimal LLM tokens
---

# repo-intelligence

Tier 0: rg and package manifests, READMEs, routes. Tier 1: static inventory using avp inspect. Tier 2: optional code-only Graphify (graphifyy, AST locally without semantic extraction) for large cross-module dependency questions; use Serena symbol lookup or Aider RepoMap when appropriate. Do not blindly build huge graphs; limit context to 1000-2500 tokens per question. Verify static findings against app UI. No uploading secrets/source without authorization. Store evidence in feature-coverage.json.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.
