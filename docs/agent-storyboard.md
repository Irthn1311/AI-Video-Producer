# Agent-authored storyboard (F-04b)

This opt-in workflow lets a coding agent author new scenes instead of treating the initial sample project as the final storyboard. The CLI validates the proposal and compiles it into the existing project configuration; the agent, not a hardcoded template, chooses the story.

## Workflow

1. Configure creative.director and verification.mode=claims. Run `avp storyboard context` to obtain baseConfigHash, sourceFingerprint, creative context, source candidates and eligible file hashes. Inspect source and authorized runtime independently. File references are not proof of behavior.
2. Write a proposal to `.avp/planning/agent-storyboard.json`. Keep this file local and omit credentials. Use the fields below. For each selected feature, explain why it matters and cite at least one eligible source file by exact path/hash; if absent from the bounded preview, consult the local eligible inventory (`avp inspect` gives important/UI candidates) and inspect the source. For every feature-bearing scene, declare exact narration excerpts and assertion evidence IDs using the existing claim contract.
3. Run `avp storyboard check`. Inspect the diff, scope, feasibility and proposalHash. No app actions are run. Run `avp storyboard apply --hash HASH --confirm` only after authorized review/decision. The config is written atomically; old media and receipts remain. Locked scenes cannot be altered/deleted; existing production dependency maps require manual reconciliation.
4. Run `avp plan --force` and `avp build prepare --force`, renew creative/coverage/storyboard approvals where applicable, rehearse every scene, then check/freeze Build. Old approvals cannot authorize the new config. The real assertions must pass. Editing the applied scene list/source requires reauthoring the proposal.
5. A scene with cross-scene dependencies is reported but not allowed to reach READY: runtime dependency orchestration is not implemented. Design independent setup/reset where possible, or keep the blocker. Start/end/fallback descriptions are guidance, not executed resets.

## Proposal structure

```json
{
  "schemaVersion": 1,
  "baseConfigHash": "<from context>",
  "sourceFingerprint": "<from context>",
  "storyRationale": "Show the problem, a single real workflow, and its observable outcome.",
  "features": [
    {"id": "dashboard", "reason": "Shows the starting point", "sourceRefs": [
      {"path": "src/app.js", "sha256": "<actual file hash>"}
    ]}
  ],
  "scenes": [
    {
      "role": "workflow",
      "purpose": "Show the actual dashboard",
      "startState": "Disposable demo account, fresh browser context",
      "endState": "Dashboard heading visible",
      "fallback": "Stop and return to Build if assertions fail",
      "dependsOn": [],
      "direction": {"framing": "stable framing"},
      "scene": {
        "id": "scene-dashboard",
        "title": "Dashboard",
        "durationSec": 8,
        "featureIds": ["dashboard"],
        "narration": "Open the learning dashboard.",
        "capture": {
          "actions": [
            {"type": "goto", "path": "/"},
            {"type": "assertVisible", "role": "heading", "name": "Learning Dashboard", "evidenceId": "heading"}
          ],
          "evidencePolicy": {"requireAssertions": true, "failOnPageError": true}
        },
        "claims": [{"id": "dashboard-visible", "featureId": "dashboard", "text": "learning dashboard", "evidenceIds": ["heading"]}]
      }
    }
  ]
}
```

The example is illustrative: replace all names/actions with observed project-specific information. Scene role is hook/problem/workflow/result/conclusion/transition. Existing scene edit and captionTiming contracts are accepted. Direct actions are restricted to the existing supported action types; special interactions must use a reviewed adapter. Source hash validation proves a reference exists, not that it supports the agent's semantic claim. Feature-less narration and editorial choices require semantic review too. No API calls or external code execution; all existing security and budget gates remain. This does not yet implement shot-level repair, automated narrative generation, measured voice timing, cross-scene dependencies or real-app benchmark.
