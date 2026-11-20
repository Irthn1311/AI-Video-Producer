---
name: storyboard-planner
description: Create scene IDs, shooting scripts, voice scripts and timing
---

# storyboard-planner

Use verified features, define stable scene IDs, target durations, accessible Playwright locator actions and coherent narration. Storyboard must include hook/problem/value/real demo/CTA where appropriate. Estimate reading durations; keep scenes independently replaceable and include explicit expected outcomes. Request review before capturing.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.

## Evidence-first storyboard
When the project opts into `verification.mode=claims`, write `scene.claims` with exact excerpts of `scene.narration`, `featureId`, and declared capture `evidenceIds`. Run `avp plan --force` after modifying the canonical project config so the storyboard includes these claim mappings; avoid approving stale plans. Refer to `docs/claim-evidence.md`.
