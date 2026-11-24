# F-03b — Reviewed project adapters and real browser trials

This release adds a **project-scoped declarative Playwright adapter contract**. An adapter is a structured, reviewable recipe for a single scene, not an arbitrary JavaScript/Python/CLI script. It is useful for reproducibly testing and capturing a custom DOM/API flow in an application without hardcoding that feature into the AVP core.

**Scope limit:** this is a browser-context isolation and approval workflow, **not an OS/container security sandbox**. App server code must be launched separately by the authorized user in an isolated test environment. It might independently read files, access credentials or call external services, even if AVP blocks cross-origin requests inside the Playwright browser.

## Lifecycle: draft → review → trial → BUILD gate → production

```bash
# Configure sourcePath and appUrl to point to a locally served disposable test app.
node bin/avp.mjs analyze --project ./my-video
node bin/avp.mjs skills recommend --project ./my-video

# Choose the scene and the capabilities actually needed for that scene:
node bin/avp.mjs adapters init --project ./my-video \
  --scene scene-01-intro --id intro-flow --capability app-feature-demo

# Add capture.adapter="intro-flow" to that scene in project.json.
# Set capture.actions=[]; leave capture.evidencePolicy.requireAssertions=true.
# Edit ./my-video/avp-adapters/intro-flow/manifest.json:
# - actions: real deterministic UI/API actions, including explicit evidence IDs
# - expectedEvidenceIds: ordered list matching every assertVisible/assertText/etc
# - startState, endState, cleanup, appOrigin and a bounded resetActions recipe

# Read the manifest before confirming (this is operator acceptance, NOT a security audit).
node bin/avp.mjs adapters status --project ./my-video --scene scene-01-intro
node bin/avp.mjs adapters approve --project ./my-video --scene scene-01-intro --confirm

# Explicitly authorize a real-browser trial against the local disposable app:
node bin/avp.mjs adapters trial --project ./my-video --scene scene-01-intro --allow-actions

# Compile fresh Build artifacts to include trial and approval hashes.
node bin/avp.mjs plan --project ./my-video
node bin/avp.mjs build prepare --project ./my-video --force
node bin/avp.mjs build rehearse --project ./my-video \
  --scene scene-01-intro --allow-actions
node bin/avp.mjs build check --project ./my-video
# After covering/reviewing every scene and accepting the production plan:
node bin/avp.mjs build freeze --project ./my-video --confirm
node bin/avp.mjs capture --project ./my-video --scene scene-01-intro
```

Review steps for coverage/storyboard and other scenes still apply. A trial and rehearsal are not evidence of the video that will later be captured.

## Contract and per-project storage

`avp-adapters/<id>/manifest.json` is part of the **project workspace**, can be committed with source control, and should remain reviewed with any upstream changes. The manifest declares: adapter ID, semantic version, *project-authored* provenance/license claim, scene binding, required capabilities, exact test-app origin, restricted permissions, intended start/end state, cleanup strategy, Playwright action list and ordered expected evidence IDs.

Sample key fields:

```json
{
  "schemaVersion": 1,
  "id": "intro-flow",
  "kind": "declarative-playwright",
  "version": "0.1.0",
  "provenance": {
    "type": "project-authored",
    "license": "project-owned",
    "repository": null,
    "commit": null
  },
  "sceneId": "scene-01-intro",
  "capabilities": ["app-feature-demo"],
  "appOrigin": "http://127.0.0.1:4173",
  "permissions": {
    "network": "same-origin-loopback",
    "filesystem": "none",
    "subprocess": false,
    "secrets": false,
    "externalApis": false
  },
  "startState": "Disposable test data, fresh browser context",
  "endState": "Real UI/API assertions passed",
  "cleanup": "Dispose browser context; reset app state when necessary",
  "actions": [
    {"type": "goto", "path": "/"},
    {"type": "assertVisible", "role": "heading", "name": "Dashboard", "evidenceId": "dashboard"}
  ],
  "resetActions": [],
  "expectedEvidenceIds": ["dashboard"]
}
```

The manifest contains **only existing AVP declarative capture actions**. It must contain at least one actual assertion. It rejects unknown action commands, arbitrary eval/script/exec, external origins, filesystem/secrets/subprocess permissions and externally sourced executable recipes. For other domain capabilities (handwriting/pointer gestures, multi-device synchronization, WebGL internals, payment settlement), a passing ordinary UI trial **does not prove those features**. Such requirements remain blocked until AVP has a suitable specialized adapter runtime and evidence model.

**Local-only review/trial records:** `.avp/adapters/<id>/review.json`, `trial-report.json`, `trial-receipt.json`. The review binds the manifest and current project source hash. The trial executes the manifest against a fresh Chromium context, blocks browser requests outside the configured same-origin loopback application, records assertion outcomes and page errors, attempts declared reset actions and writes a content-hash-bound receipt **only on success**.

The Build Package stores adapter selection, manifest/approval/trial receipt and checked capability hashes in `capability-profile.json`, `toolchain-lock.json` and the frozen `production-plan.json`. An adapter change, approval change, source change or trial-report/receipt change invalidates the previous Build and capture QA. A non-adapter scene retains its legacy capture hash, avoiding unnecessary recapture.

## Threat model, limitations and approval meaning

- The new mechanism is **not arbitrary agent-generated code execution**. It never imports or executes third-party GitHub repositories/MCP tools, installs dependencies, uses an OS sandbox or silently downloads external scripts.
- **Browser isolation is not full machine isolation.** The target app server is outside AVP's browser network control; use disposable data, loopback addresses, an unprivileged local account and a separately controlled/test container if the source is untrusted. Trial actions can mutate backend state; a fresh browser context alone does not reset the backend.
- `approve --confirm` records an operator decision locally; it does not authenticate a reviewer identity or prove licensing/security compliance. File hashes detect accidental edits and mismatches; they are **not cryptographic attestations against an attacker who can rewrite the whole local workspace**.
- Browser same-origin restrictions apply to adapter-based trial, Build rehearsal and production capture; they do not guarantee that a server cannot call the Internet.
- A successful trial means the **declared assertions** passed in the trial. It is not an independent semantic audit of the app, nor evidence that future production footage is correct. Production still generates separate capture evidence and QA.
- Domain capability declarations outside the small provable v1 set remain **unproven even after trial**. In particular, a simple DOM click must not satisfy `multi-context-browser` or `pointer-interaction`.
- The first implementation has a structured `cleanup` declaration and optional `resetActions`; backend fixture reversion cannot be guaranteed without a project-specific test dataset/reset endpoint.

See [Master Checklist](MASTER_UPGRADE_CHECKLIST.md): A3-01, A3-06 and A2-05/A2-08 are **PARTIAL**. Still missing: isolation of arbitrary scripts in a container, vetted external skill provenance/commit/license/permissions, automatic adapter authoring, multi-browser/device support, domain-specific API/DB assertions, and benchmark on unfamiliar real applications.
