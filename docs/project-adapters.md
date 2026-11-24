# Reviewed project-local declarative adapters (F-03b, first slice)

A project can now have its own reusable capture recipe without installing or executing arbitrary third-party code. This is a narrow declarative adapter runtime, not an OS sandbox or autonomous adapter generator.

## Create and review a recipe

Set `scene.capture.adapter` to an ID and author `.avp/adapters/<ID>.json` inside the AVP project. For example, for a canvas interaction:

```json
{
  "schemaVersion": 1,
  "id": "draw",
  "kind": "declarative-browser-v1",
  "provenance": {"kind": "project-authored"},
  "permissions": {
    "network": "app-origin-only",
    "filesystem": "none",
    "secrets": "none",
    "shell": "none"
  },
  "startState": "Fresh demo canvas",
  "endState": "Canvas received a visible pointer stroke",
  "cleanup": "close-browser-context",
  "actions": [
    {"type": "goto", "path": "/"},
    {
      "type": "pointerPath", "testId": "canvas",
      "points": [{"x": 0.15, "y": 0.2}, {"x": 0.45, "y": 0.7}, {"x": 0.85, "y": 0.3}]
    },
    {
      "type": "assertAttribute", "testId": "canvas",
      "attribute": "data-drawn", "expectedValue": "yes", "evidenceId": "drawn"
    }
  ],
  "capabilities": [{"id": "pointer-interaction", "evidenceId": "drawn"}]
}
```

The scene's `capture.actions` must exactly equal the adapter's actions. Use `capture.evidencePolicy: {"requireAssertions": true, "failOnPageError": true}`. The application must genuinely expose the asserted result; never fake a DOM attribute or app response just to pass the trial. Add `pointer-interaction` to project-level `capabilityRequirements` if the scene requires it.

Use the existing approved storyboard and coverage process. In an authorized disposable app:

```bash
node bin/avp.mjs adapter check --project ./demo --scene scene-01
node bin/avp.mjs adapter approve --project ./demo --scene scene-01 --confirm
node bin/avp.mjs build prepare --project ./demo --force
node bin/avp.mjs build rehearse --project ./demo --scene scene-01 --allow-actions
node bin/avp.mjs build check --project ./demo
node bin/avp.mjs build freeze --project ./demo --confirm
node bin/avp.mjs capture --project ./demo --scene scene-01
```

Rehearse every other planned scene as usual; planning approvals still apply. The adapter approval only authorizes a trial, not the final video. The real rehearsal and later real capture must both pass their assertions. The same action interpreter performs the pointer path in both phases.

## Integrity and permissions

- Project-authored JSON only; no arbitrary JS, Python, shell, skill installers, or MCP execution.
- A closed action vocabulary, 2–60 actions, bounded pointer coordinates and point counts. Pointer paths require a reviewed adapter and an assertion after the action.
- Approval binds recipe, scene capture config, app URL, source fingerprint and adapter/action engine contents. A change invalidates the approval, Build, and affected capture cache.
- The manifest must match the scene actions exactly. Unknown actions, unsupported permissions, mismatched manifests and symlinked recipe paths fail closed.
- A reviewed adapter removes only the matching implementation blocker. Build still requires a current successful rehearsal; approval alone is not runtime evidence.
- Fresh browser contexts close after the run. Service workers are blocked and browser request routing blocks cross-origin requests (WebSocket routing closes sockets when supported). These are browser-level controls, **not a complete network or OS security boundary**; browser redirects, app-side network calls, and server mutations are not an OS sandbox. Run only against authorized test apps. Closing a browser context does not reset backend state.
- No third-party repository is automatically trusted, pinned, installed or run. External discovery remains a separate research process. Local hashes are not signatures against a malicious workspace owner.

## Current scope

Only the new generic `pointerPath` primitive is supported as an adapter-declared capability; it can demonstrate a real stroke on a canvas or other pointer target. It does not establish arbitrary canvas semantics, handwriting recognition, OCR, device pairing, multi-context recording, GPU support or database verification. The real browser test demonstrates a controlled fixture, not MathMate parity or an unknown-app benchmark.

A3 is therefore PARTIAL: project-local contract, approval, shared rehearsal/capture, pointer action and failure handling are implemented; automatic agent authoring, third-party review and commit pinning, OS-level sandboxing, multi-device adapters, backend reset/cleanup contracts, reusable shot markers and independent domain tests remain open.
