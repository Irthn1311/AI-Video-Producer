# Capability Router — Quality-first policy

AVP defaults to **Quality** for new projects and for existing projects that do not specify an optimization profile. `economy` and `balanced` remain available via `project.json`: `"optimization": {"profile": "quality"}`.

## Design principle

Quality means **stronger evidence, verification and review**, not indiscriminate model calls. Every task should start with reusable local evidence and deterministic tools. Load expensive agent reasoning, MCP tool descriptions, large code graphs or visual reviewers only when there is a concrete question that requires them.

Capabilities are described in `config/capabilities.json`. The initial `src/capabilities.mjs` router is a **deterministic planning/preflight layer**. It **does not** install MCP servers, invoke models, measure vendor subscription quota, or verify a product. Only real execution and approved evidence can complete a production gate.

## Policy contract

- **Reliability:** runtime assertions and QA cannot be skipped for quota savings. Technical QA and semantic QA are separate; neither alone proves the entire video.
- **Progressive loading:** read a skill's description/entrypoint first; load its references only when necessary. MCP integrations are opt-in and connected by the host agent, not loaded by default.
- **Deterministic-first:** local source scan, targeted `rg`, Playwright assertions and FFmpeg before another model call; Graphify/Serena and DevTools only for a clearly complex problem or failure.
- **Independent verification:** high-risk feature or scene claims need an independent agent review if available, otherwise a human review checkpoint. Do not silently accept an unverified claim.
- **Cost and quota:** cache verified artifacts using hashes; plan costs before paid APIs; use bounded retries. Provider subscription quotas are generally unknown to AVP and must not be invented.
- **Safety:** source code, screenshots, narrations and credentials may contain private information. External agents/providers and MCP connections require trust and explicit authorization where necessary.
- **Quality gates:** absence of a required capability returns `blocked`; a human review returns `review-required`, not `passed`. A planning response is never a substitute for validation evidence.

## CLI preview

```bash
node bin/avp.mjs route --project examples/sample-project --task repo-research --complexity complex
node bin/avp.mjs route --project examples/sample-project --task feature-verification --risk high --available playwright-runtime
node bin/avp.mjs route --project examples/sample-project --task video-qa --available ffprobe-qa,agent-visual-review
```

`--available` declares capabilities that the **host has already checked**. The CLI automatically probes `rg`, `ffprobe`, Playwright package presence, and FFmpeg. It does not provision new MCP servers or trust a supplied tool ID as proof that it works. The CLI returns a plan with evidence expectations, blockers, human checkpoints, and quota uncertainty.

Paid provider preflight can be previewed via `route --task voice --available gemini-tts --estimated-usd 0.2 --allow-paid-api`. This preview **does not spend or reserve money**, and the real `avp voice` still enforces its opt-in and project budget.

## Forthcoming integrations

The router is deliberately lightweight: tool declarations and staged selection are implemented, but the production commands are not yet orchestrated through it. The next integration will use the router's plan as a preflight for each production stage, attach evidence hashes to stage results, and collect measured per-agent/tool usage when supported by the provider. That work must be covered by e2e tests before claiming automated Quality enforcement.

## Test criteria

1. Quality is the effective default; all three names are validated.
2. A high-risk feature cannot be marked ready without browser verification.
3. Missing semantic verification results in review-required or blocked, never silently passed.
4. No paid stage is planned without explicit permission and sufficient estimated budget.
5. An unknown external subscription quota is explicitly marked unknown.
6. Complex analysis does not connect extra MCP tools automatically; it requests available tools on demand.
