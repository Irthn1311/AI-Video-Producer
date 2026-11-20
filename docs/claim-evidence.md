# Evidence-backed narration and feature coverage

This optional strict workflow extends the MathMate principle: do not advertise a product result unless the capture actually verified the relevant UI or backend condition. It builds on `docs/capture-evidence.md` and the proof already recorded by Playwright. **It makes no additional model/API calls** and can reduce retries caused by misleading footage.

## Enable strict mode

In `project.json`, set `"verification": {"mode": "claims"}`. Legacy projects remain supported and keep `mode=legacy` when this field is absent. The Quality optimization profile is independent from this migration flag; strict mode is strongly recommended when migrating a project to verified production.

```json
{
  "verification": {"mode": "claims"},
  "scenes": [{
    "id": "save-demo",
    "featureIds": ["save-feature"],
    "narration": "The app saves the lesson, and shows the result.",
    "claims": [{
      "id": "saved-claim",
      "featureId": "save-feature",
      "text": "The app saves the lesson",
      "evidenceIds": ["save-api", "saved-ui"]
    }],
    "capture": {
      "evidencePolicy": {"requireAssertions": true, "failOnPageError": true},
      "actions": [
        {"type": "goto", "path": "/"},
        {"type": "clickExpectResponse", "evidenceId": "save-api",
         "role": "button", "name": "Save lesson",
         "response": {"pathContains": "/api/save", "method": "POST", "status": 200}},
        {"type": "assertText", "evidenceId": "saved-ui", "testId": "result",
         "expectedText": "Saved successfully"}
      ]
    }
  }]
}
```

`claims[].text` must occur in the narration (case-insensitive, whitespace-normalized). Every scene `featureId` must have at least one claim. Every claim must reference the feature and an explicit `evidenceId` on a configured Playwright assertion. Intros without feature IDs need no claim.

## Planned coverage vs observed evidence

Before production, `avp plan` writes `.avp/planning/feature-coverage.json` listing **candidate** features and scenes. Humans review this list and may approve it; approval never certifies runtime behavior. Strict mode checks that this candidate list exactly matches the scene-to-feature mapping.

After capture, each feature claim is checked against the current `capture-report.json`, including:
- `status: PASS`, all configured assertions and correct assertion **ID + type**;
- no failed configured assertion or unhandled page error under strict error policy;
- capture report bound to the **exact** captured footage content hash and capture input hash;
- each claim referencing a subset of successfully executed runtime assertions.

`avp qa` adds a `claimEvidence` section only when a scene advertises features in strict mode. The QA report is tied to the original captured artifacts and proof; later edits to evidence or footage invalidate QA and scene review. A failed binding makes technical QA fail closed. The final render requires a complete candidate feature mapping and valid QA for every scene, including in autonomous mode.

## Commands

```bash
node bin/avp.mjs plan --project path/to/demo
node bin/avp.mjs approve --project path/to/demo --stage coverage
node bin/avp.mjs approve --project path/to/demo --stage storyboard
node bin/avp.mjs capture --project path/to/demo --scene save-demo
node bin/avp.mjs evidence --project path/to/demo
node bin/avp.mjs captions --project path/to/demo --scene save-demo
node bin/avp.mjs preview --project path/to/demo --scene save-demo
node bin/avp.mjs qa --project path/to/demo --scene save-demo
```

Use the usual scene review and final render steps. `avp evidence` is read-only and local; it reports `UNVERIFIED` where no matching browser capture has happened.

## Limitations and threat model

- The workflow validates **declared** assertions, not all unstructured narration. It cannot ensure a model has declared every important factual claim or that a visual element communicates the claim correctly. Independent visual/editorial review remains required.
- This mechanism detects accidental tampering/stale local artifacts, **not intentional forgery by a process with write access to the entire AVP workspace**. Do not represent the files as cryptographically trusted attestations.
- Browser screenshots and output may contain sensitive data. Only use isolated authorized demo accounts; do not upload private evidence automatically.
- Strict mode does not silently promote `verifiedInBrowser: false` in the candidate coverage plan. It is deliberately separate from runtime evidence. The agent should not call a feature “verified” until after successful capture.
- No paid AI calls or additional MCP servers are needed. Project-level `verification.mode` is opt-in to avoid breaking existing users; later migrations may change default policy with explicit versioning.
