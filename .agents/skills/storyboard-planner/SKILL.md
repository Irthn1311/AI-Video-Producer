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

## Agent-authored storyboard (opt-in)
When creative.director and verification.mode=claims are configured, use `avp storyboard context` for source fingerprint and current creative context. Inspect actual source and authorized runtime, then author `.avp/planning/agent-storyboard.json` according to `docs/agent-storyboard.md`. Do not merely copy old scenes: select a coherent journey, explain inclusion choices, author real actions/assertions and keep stable IDs. Run `avp storyboard check`, review the diff and apply the exact hash with `--confirm` only when authorized. Rebuild and reapprove creative/coverage/storyboard as applicable; never mark candidate source references as observed features. Keep dependent workflows blocked until they can run independently or the orchestrator supports them.

## Visual design contract
For opt-in creative.visual projects, read `docs/visual-direction.md` and author executable `scene.edit.design` and explicit stable-ID shots in the same agent storyboard. Explain framing, cuts, speed changes, and the purpose of each shot. Validate with storyboard check and visual check. Inspect actual footage and preview for legibility and evidence visibility; no synthetic replacement of real results. Shot diff describes specs, not independent rendering or cache guarantees.
