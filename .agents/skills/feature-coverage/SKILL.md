---
name: feature-coverage
description: Review verified software features before drafting a demo
---

# feature-coverage

Agent inventories proposed features with route, test steps and evidence; show omissions and reasons. Do not approve an automatic draft simply because CLI generated it. Present candidate features and capture effort to human in review mode. Record decision in .avp/planning/feature-coverage.json; approve coverage only after fact checking.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.

## Strict claim evidence contract
Read `docs/claim-evidence.md` before approving coverage. `feature-coverage.json` is a candidate-feature plan, not verified runtime truth. For `verification.mode=claims`, ensure every listed feature matches `project.json` scenes, and each scene's `claims` maps narration excerpts to explicit Playwright `evidenceId` assertions. Run `avp evidence` after actual capture and do not infer truthful video solely from status fields.
