---
name: browser-capture
description: Record authentic browser UI via safe Playwright actions
---

# browser-capture

Start target app in an isolated sandbox with test accounts. Prefer testId/role/label locators. Each scene must have deterministic start and final state, known app origin, timed pauses and an expected evidence screenshot. Use avp capture --scene ID and inspect capture-report. Never fake backend success, run destructive user operations or capture real confidential accounts.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.

## Verified capture (Quality workflow)
Read `docs/capture-evidence.md`. For a feature claiming real saved/API state, prefer `capture.evidencePolicy.requireAssertions=true`, `assertVisible`, `assertText`, `assertAttribute`, and `clickExpectResponse`. Store only local assertion success metadata, not provider payloads or credentials. A UI recording is not automatically evidence of success. Review `capture-report.json` before QA and never manually change a failing assertion to PASS.
