# Architecture: agent-first, local-first and scene-first

## Revision snapshots and safe rollback

`src/revisions.mjs` provides local SHA-256 manifests, snapshot/list/restore for a scene's media and evidence, plus a pre-restore backup. Restore invalidates QA/approval and the final render state, and preserves original artifact input fingerprints so the existing cache rules can reject stale media after config/source changes. Snapshots are explicit and local; no automatic snapshot retention/pruning/cloud sync exists yet. Read [Scene Versions](scene-versions.md).

## Audio-aware sentence captions and metadata integrity

`src/audio-timing.mjs` detects silence via FFmpeg and offers human-provided sentence anchor timing. `src/media.mjs` generates caption SRT and canonical JSON with provenance, actual measured speech spans and review warnings. `src/state.mjs` hashes **both** SRT and captions JSON, so changing a Remotion caption timestamp invalidates QA/approval. This does not require external AI calls and is not forced alignment. See [Speech-Aware Captions](audio-captions.md).

## Claims, candidate coverage and binding to current runtime proof

`src/evidence.mjs` implements an opt-in `verification.mode=claims` contract: a narration excerpt references a declared feature and the exact Playwright assertion IDs that must pass for its scene. The pre-capture `feature-coverage.json` remains a **candidate planning artifact**, not a false verified-state claim. Per-scene QA verifies current capture/report hashes and matching assertion IDs/types; final rendering checks complete scene coverage. Use `avp evidence` for local inspection and read [Claim Evidence](claim-evidence.md). This is evidence integrity and declarative linkage, not an LLM semantic correctness guarantee.

## Capture evidence and opt-in semantic safeguards

`src/capture-assertions.mjs` adds local Playwright assertion actions for DOM and same-origin HTTP responses. When an individual scene enables `capture.evidencePolicy.requireAssertions`, technical scene QA requires a PASS capture report and binds the report hash to scene approval. This is runtime proof of the specified assertions, not a general proof of truthful narration. See [Capture Evidence](capture-evidence.md).

## Opt-in scene editing and preview parity

The new `src/editing.mjs` module validates a frame-accurate scene-edit contract (source trims, speed, zoom/focus, hold, callouts, insets). `src/remotion-preview.mjs` renders opted-in scenes with `remotion/src/scene-preview.tsx`; scenes without `scene.edit` preserve FFmpeg previews. Because this happens **before** QA/review, a later final render can only consume already-reviewed edited previews. External secondary footage comes exclusively from named local assets, with hashes included in preview staleness. See [Scene Editing](scene-editing.md).

## Quality-first capability preflight

`src/capabilities.mjs` and `config/capabilities.json` provide a deterministic capability planner for Quality (default), Balanced and Economy. It reports stage requirements, available candidates, semantic review checkpoints and paid-API preflight; no external tools, models, MCP connections or quota queries are executed by the router. This planner is not yet wired as a hard gate into the capture/render workflow. See [Capability Router](capability-router.md).

## Control plane vs execution plane

- **Agent control plane:** A coding agent (Codex, Claude Code, Gemini CLI, other) reads `AGENTS.md` and loads `.agents/skills/*/SKILL.md` selectively. It verifies product behavior, proposes feature coverage, composes a storyboard, interprets QA results, seeks approvals and invokes CLI actions. These are instructions, not hidden automatic LLM calls.
- **Deterministic execution plane:** `bin/avp.mjs` and `src/*.mjs` store the project configuration, capture with Playwright, generate optional TTS, build captions, create previews, check artifacts and combine media. Runtime steps are observable and individually rerunnable.
- **Module layer:** `modules/software-demo/module.json` lists the supported capture actions and stages. Future modules may replace capture while reusing scene and audio contracts. v0.1 currently has only this module, not a general plugin loader.
- **Providers:** Playwright, Gemini TTS, FFmpeg and optional Remotion. Future adapters are described, not implemented.

## Contracts

`project.json` specifies stable scene IDs, title, sourcePath, appUrl, languages, voice, render engine, review mode, capture actions, narration and target durations. `.avp/planning/feature-coverage.json` and `storyboard.json` are drafts for agent/human confirmation. `.avp/run-state.json` tracks approvals, artifact hashes and locks. Each `.avp/scenes/<id>/` contains `capture.mp4`, optional `voice.wav`, `captions.srt`, `preview.mp4`, capture/voice/caption reports and `qa-report.json`. Final artifact: `.avp/output/final.mp4`, `final-qa.json`.

## Dependency hashes and approvals

Capture input hash includes **source file content fingerprints**, scene actions, scene duration, app origin and render viewport/fps. Voice input hash includes narration, language and provider settings. Caption input hash includes narration, subtitle language and voice artifact hash. Preview input hash includes rendering settings and its capture/voice/caption artifact hashes.

Scene QA records the current preview checksum and preview input hash; a regenerated preview **invalidates previous QA and review approval**. Coverage/storyboard approval records the current project config hash and actual planning-file checksum. A storyboard must agree with the canonical `project.json` scene list before approval. Final QA and approval are bound to the current exported MP4 and per-scene QA hashes, including in autonomous mode.

Changes to code **inside `sourcePath`** conservatively invalidate capture. External runtime changes (such as an API deployment or installed browser update) are not automatically fingerprinted; recapture explicitly if the behavior differs. Locks require explicit `avp unlock` before replacing an approved scene. Project budget reservations are local **estimated USD limits**, not provider-side billing caps.

## Review and recovery

Review mode requires coverage and storyboard approval, plus scene approval before final rendering. A failed run preserves completed outputs. Each scene is isolated. Use `avp status` to understand stale components. On failure inspect `capture-report.json`/`qa-report.json`, correct the source/selector, explicitly unlock and rebuild the affected scene. Avoid looping on paid TTS. Autonomous mode bypasses human gates but not technical QA or paid API opt-in.

## Cross-platform policy

Node paths use `node:path`; no Windows drive paths are embedded. FFmpeg/ffprobe and node must be in PATH. Unsupported OS/provider combinations must be explicitly tested prior to claim. GitHub Actions CI currently tests command-line and unit tests on Ubuntu only; Windows/macOS are planned.
