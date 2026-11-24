# BUILD → frozen plan → PRODUCTION (first executable vertical slice)

AVP is developing toward an agentic two-phase workflow. This first implementation establishes a canonical **Build Package**, a real Playwright rehearsal and a **hard CLI production gate**. It deliberately does **not** claim to have built full project intelligence, external skill search, autonomous creative direction or general agent orchestration.

## New projects vs legacy projects

`avp init NEW_DIR` writes `project.json` with `workflow.requireBuild=true`; production commands are blocked until a Build Package has been rehearsed, reviewed and frozen.

Existing project configs without `workflow.requireBuild` continue with their old CLI semantics **until** `avp build prepare` creates a Build state for that project. From then on, Build Gate is enforced even if the config did not explicitly require Build.

## Commands

```bash
# One-time: start an authorized test/demo application, install Playwright/Chromium.
node bin/avp.mjs init ./my-video
# Edit project.json: sourcePath, appUrl, feature IDs, claims, storyboard and scenes.

node bin/avp.mjs analyze --project ./my-video
# Inspect source-derived stack/routes/capability hypotheses; these are not verified features.
node bin/avp.mjs plan --project ./my-video
# Inspect .avp/planning/feature-coverage.json and storyboard.json
node bin/avp.mjs approve --stage coverage --project ./my-video
node bin/avp.mjs approve --stage storyboard --project ./my-video

node bin/avp.mjs build prepare --project ./my-video
# Review .avp/build/creative-brief.json and production-plan.json.
# This command only compiles drafts and checks bundled tools. It does NOT automatically
# search GitHub skills, create an untrusted adapter, or verify runtime behavior.

# Explicit approval for a potentially state-changing browser rehearsal:
node bin/avp.mjs build rehearse --project ./my-video \
  --scene scene-01-intro --allow-actions
node bin/avp.mjs build rehearse --project ./my-video \
  --scene scene-02-feature --allow-actions

node bin/avp.mjs build check --project ./my-video
# BLOCKED: critical missing tools, stale inputs, unknown adapters or rehearsal failures
# REVIEW_REQUIRED: planning/creative approval and/or frozen plan still required

node bin/avp.mjs build freeze --project ./my-video --confirm
node bin/avp.mjs build gate --project ./my-video  # READY

# NOW start production using the existing scene-level workflow:
node bin/avp.mjs run --project ./my-video
# Review and approve scenes, rerun, final render, QA and final approval as usual.
```

`--allow-actions` means you have authorized running the real project actions, including clicks/forms. Run against disposable test data, NEVER production payment, deletion or live customer accounts. BUILD rehearsal does not record a film, and its report is `scope=BUILD_REHEARSAL_ONLY`. Actual `capture-report.json` of Production must be generated separately.

## Artifact handoff

The directory `.avp/build/` contains:

```text
project-profile.json       # bounded source stack/routes/capability signals; NO runtime claims
feature-inventory.json     # configured feature candidates + source route hypotheses, UNVERIFIED
capability-profile.json    # built-in capabilities and unresolved adapters
toolchain-lock.json        # actual local bundled tool availability; no Internet install
creative-brief.json        # draft creative settings from explicit project config
storyboard.json            # snapshot of reviewed storyboard data
production-plan.json       # compiled capture recipes, claims, scene/shot IDs, dependencies
rehearsals/SCENE.json      # real non-recording Playwright results (separate from Production)
build-report.json          # BLOCKED / REVIEW_REQUIRED / READY, plus actionable issues
build-lock.json            # frozen hashes of plan, config, source, artifacts and rehearsals
build-state.json           # phase marker and initial stage statuses
```

Existing `project.json` remains the **canonical source for authoring** at this stage. Build data is a deterministic compiled snapshot, not an alternative editable script. Edit the project config and planning artifacts then regenerate Build; never modify frozen `production-plan.json` to bypass the gate.

Build checks current source/config hashes, storyboard/coverage approvals, the complete set of non-recording browser rehearsal results, bundled-tool availability and selected adapter restrictions. It detects plan mutation and invalidated rehearsal. If any required input changes, freeze becomes stale and Production is blocked until renewed inspection, rehearsal and approval.

## Limits that remain on the MASTER checklist

- `analyze` adds bounded, static stack/routes/capability signals but is **not** autonomous Repository Intelligence: no live feature validation, business logic investigation or third-party skill search. See [Project Intelligence](project-intelligence.md).
- Build currently supports **built-in declarative** capture actions. A custom adapter requirement causes `BLOCKED`; it is not silently executed. Reviewed sandboxed adapter runtime comes in A3.
- Creative brief is derived from project settings and reviewed during explicit freeze; no proactive interview/Creative Director is implemented yet.
- The first contract stores basic shot IDs but no proven shot-isolation/dependency DAG. It does **not** enable shot-level repair.
- Source fingerprint is scoped to configured source content; runtime changes outside that scope may require fresh rehearsal.
- Built-in toolchain availability/version is recorded; this is **not** a full externally sourced permission/license lockfile.
- `READY` means required Build checks passed; it does not certify the final footage or audio quality, and does not replace Production scene QA.
- Existing public CLI entrypoints are guarded for opted-in projects. This is not yet a resilient distributed job scheduler or an AI agent that automatically resolves blockers.

See [MASTER_UPGRADE_CHECKLIST.md](MASTER_UPGRADE_CHECKLIST.md), particularly `A6`, `A1`–`A5`, `B1` and acceptance scenarios `AC-01`/`AC-03`.
