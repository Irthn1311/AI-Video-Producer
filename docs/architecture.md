# Architecture: agent-first, local-first and scene-first

## Control plane vs execution plane

- **Agent control plane:** A coding agent (Codex, Claude Code, Gemini CLI, other) reads `AGENTS.md` and loads `.agents/skills/*/SKILL.md` selectively. It verifies product behavior, proposes feature coverage, composes a storyboard, interprets QA results, seeks approvals and invokes CLI actions. These are instructions, not hidden automatic LLM calls.
- **Deterministic execution plane:** `bin/avp.mjs` and `src/*.mjs` store the project configuration, capture with Playwright, generate optional TTS, build captions, create previews, check artifacts and combine media. Runtime steps are observable and individually rerunnable.
- **Module layer:** `modules/software-demo/module.json` lists the supported capture actions and stages. Future modules may replace capture while reusing scene and audio contracts. v0.1 currently has only this module, not a general plugin loader.
- **Providers:** Playwright, Gemini TTS, FFmpeg and optional Remotion. Future adapters are described, not implemented.

## Contracts

`project.json` specifies stable scene IDs, title, sourcePath, appUrl, languages, voice, render engine, review mode, capture actions, narration and target durations. `.avp/planning/feature-coverage.json` and `storyboard.json` are drafts for agent/human confirmation. `.avp/run-state.json` tracks approvals, artifact hashes and locks. Each `.avp/scenes/<id>/` contains `capture.mp4`, optional `voice.wav`, `captions.srt`, `preview.mp4`, capture/voice/caption reports and `qa-report.json`. Final artifact: `.avp/output/final.mp4`, `final-qa.json`.

## Invalidations

Capture input hash = capture script plus scene duration. Voice input hash = narration plus provider config and speech language. Caption input hash = narration plus subtitle language. Preview input hash = style plus duration; **rebuilt capture/voice/captions explicitly invalidate preview**. Content checksum validates on-disk outputs. Approved scenes are locked until explicit `avp unlock`.

**Known v0.1 limitation:** the CLI intentionally does not auto-detect edits to the *source application* or browser runtime. When its behavior changes, unlock affected scenes and use `--force` to re-capture. Final approval should be revalidated after a new render. The target app is NOT modified by AVP.

## Review and recovery

Review mode requires coverage and storyboard approval, plus scene approval before final rendering. A failed run preserves completed outputs. Each scene is isolated. Use `avp status` to understand stale components. On failure inspect `capture-report.json`/`qa-report.json`, correct the source/selector, explicitly unlock and rebuild the affected scene. Avoid looping on paid TTS. Autonomous mode bypasses human gates but not technical QA or paid API opt-in.

## Cross-platform policy

Node paths use `node:path`; no Windows drive paths are embedded. FFmpeg/ffprobe and node must be in PATH. Unsupported OS/provider combinations must be explicitly tested prior to claim. GitHub Actions CI currently tests command-line and unit tests on Ubuntu only; Windows/macOS are planned.
