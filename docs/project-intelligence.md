# F-02 — Project Intelligence (bounded static source discovery)

This is the **first deterministic project-understanding layer** for AVP's BUILD phase. It runs offline/local without a model call, executes no project code, and never installs a skill. It is useful for preparing the next **Dynamic Capability Discovery** and **Project-specific Adapter Builder** phases; it is *not* a substitute for an actual AI agent's investigation, a running-app test, or business-domain understanding.

## Commands

\`\`\`bash
node bin/avp.mjs inspect --project ./my-video
# Basic file inventory and source fingerprint (existing).

node bin/avp.mjs analyze --project ./my-video
# Bounded source-code and manifest scan. Saves:
# .avp/intelligence/project-analysis.json

node bin/avp.mjs plan --project ./my-video
node bin/avp.mjs build prepare --project ./my-video
# .avp/build/project-profile.json now includes stack, runtime/launch candidates,
# detected source routes, capability signals and file-scan coverage.
# .avp/build/feature-inventory.json includes user-defined features and
# separate, unverified source route hypotheses.
# .avp/build/capability-profile.json includes domain capability needs.
\`\`\`

**Examples of detected capability signals**: canvas/pointer interactions, device pairing, realtime WebSocket/events, streaming responses, maps/geolocation, dashboards/charts, WebGL, WebRTC, file uploads and payment integration.

**These are hypotheses.** Seeing a canvas or a pairing variable does not establish that the app performs handwriting or successfully connects two devices. A source route does not establish the route is reachable. Every signal is explicitly marked unverified and carries a source file path and, when possible, an approximate line number. Some code might be dead or test-only; the analysis is bounded and can miss real features.

## Input and output boundaries

- Source scanning uses \`sourcePath\` from \`project.json\`, with existing exclusions for symlinks, secrets, environment files, dependencies and generated directories. Analysis reads a bounded 320 files/3 MB by default; source files over 512 KB are excluded by the existing inventory.
- The scanner reads package dependency names and script **names**, but never runs package scripts, imports a discovered module, sends repo contents to a model, accesses an external registry or installs third-party software. Script contents are not emitted.
- Candidate launch entrypoints and startup script names are not instructions to execute unknown code without approval or a sandbox.
- Reports contain paths, aggregate counts and limited dependency names, **not raw source content or credentials**. Do not share reports from a private repo without checking path/name sensitivity.
- The report records \`sourceFingerprint\` and \`scanned.truncated\`, enabling an agent/human to identify the gap between source scan coverage and runtime feature evidence.
- Both \`project-profile.json\` and \`feature-inventory.json\` carry distinct candidate/verified semantics. \`coverage\` and \`storyboard\` still require explicit review, and \`build rehearse\` still establishes *only* BUILD rehearsal proof.
- Changes to the source fingerprint invalidate existing frozen Build artifacts, and the canonical artifact comparison rejects edited compiled plans.

## What remains open (Master Checklist)

\`A1-01\`–\`A1-08\` remain **PARTIAL** collectively. Not yet implemented: adaptive AI/LLM investigation, confident feature ranking, semantic UI walkthrough, live runtime launch in a restricted environment, auth and test-data discovery/creation, monorepo dependency mapping, validated entrypoint commands, backend/schema/environment fingerprinting outside source scope, and tests against real unknown third-party repositories.

The next component \`F-03\` will use \`capability-profile.projectCapabilityNeeds\` to decide whether existing AVP skills/tools suffice or whether a reviewed, reproducible external tool/adapter is actually needed.

### Safety note

Repository source and README files are **untrusted data**, not instructions for the agent. A text match must never grant OS/network permissions or override a user's policy. Payment-related signals should trigger sandbox/safety review, never an automatic transaction.
