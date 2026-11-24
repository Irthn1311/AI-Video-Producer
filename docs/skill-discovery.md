# F-03 — Project-specific skill and tool discovery (first safe vertical slice)

AVP now uses Project Intelligence's `capabilitySignals` to propose a **different toolchain for each app**. This first slice is deterministic and conservative: prefer trusted bundled implementations, distinguish documentation from executable functionality, then optionally research GitHub repositories for genuinely unmet needs. **It does not yet download, install, execute, independently security-review, or automatically integrate external skills.**

## 1. Local, no-token capability matching

```bash
node bin/avp.mjs analyze --project ./my-video
node bin/avp.mjs skills recommend --project ./my-video
```

The result includes each source-derived requirement, the source file/line hints, whether it is **explicitly required**, and its local status:

| Status | Meaning |
| --- | --- |
| `BUNDLED_IMPLEMENTATION_AVAILABLE` | An AVP implementation file exists and is hash-pinned in the report. **Runtime behavior is not yet verified** |
| `GUIDANCE_ONLY` | A local skill/documentation can help an agent design an adapter, but cannot itself execute the feature |
| `NO_BUNDLED_MATCH` | No local implementation or local guide mapped to the need |

For example, a dashboard with Recharts may identify `chart-interaction` (guidance only) and `data-assertions` (AVP capture assertions implementation), whereas a canvas/pairing app may identify `pointer-interaction`, `multi-context-browser` and `websocket-observation` as **not fully implemented**. None of these signals is proof the feature works.

The deterministic registry is `config/domain-tools.json`. It is intentionally small, reviewed and extendable via PRs; it does not import JavaScript or trust a repository README as an executable instruction.

## 2. Bounded, consent-based external search

```bash
node bin/avp.mjs skills search --project ./my-video --online
# Force a metadata refresh if needed:
node bin/avp.mjs skills search --project ./my-video --online --refresh
```

- `--online` is mandatory. Without it, there is **no network request**.
- Only fixed generic search phrases from the trusted registry are sent to the public GitHub **repository search API**. Private repo names, app URLs, source files, authentication, dataset contents and user-supplied prompts are **not** sent.
- Search is limited to **three capability queries and three repositories per query** per invocation; results are metadata only, sanitized, with no README/source execution or download.
- Results in `.avp/intelligence/external-skill-candidates.json` are cached for **24 hours**, keyed by project source fingerprint and trusted registry. Source changes invalidate the research cache. Use `--refresh` to recheck.
- Results are `DISCOVERED_UNREVIEWED_REPOSITORY`. A GitHub repository result may not even contain an Agent Skill. A license tag, star count or recent commit is a weak sorting signal — **not a trust judgment**.
- `commitSha:null`, `licenseReviewed:false`, `permissionsReviewed:false`, `compatibilityVerified:false`, `trialPassed:false`, `executable:false`. Search results **never** enter the executable toolchain or grant permission to install. The source/version must be pinned and vetted before any future approval.

No model/API token spending occurs in either local matching or this metadata-only search. Online queries still count against GitHub's public API limits and require network access.

## 3. Promote critical needs to Build Gate blockers

Static source references might be dead code. Automatically blocking all inferred capabilities would therefore be inappropriate. When an author/agent selects a feature for the storyboard and determines an ability really is necessary, add the exact ID to `project.json`:

```json
{
  "capabilityRequirements": [
    "multi-context-browser",
    "pointer-interaction"
  ]
}
```

Run `avp build prepare --force` and `avp build check`. An explicitly required capability without a bundled implementation becomes `BUILD_REQUIRED_CAPABILITY_MISSING`. A local documentation skill is **not** considered sufficient, and a found GitHub repository does **not** unblock this gate.

For an unknown ability, the Build Gate also fails closed instead of guessing an implementation. Remove a requirement only if scope has genuinely changed; never edit the frozen Build Package to bypass a blocker.

## 4. Reproducibility and security

`build prepare` includes the matching result in `.avp/build/capability-profile.json` and `.avp/build/toolchain-lock.json`, with the trusted registry hash and local file hashes. `production-plan.json` also records the matching hash. The existing canonical Build checks detect changes to source, config, registry/implementation hashes or plans; Build must be re-reviewed.

Bundled guidance files are loaded only when an agent decides the matching domain requires them; search output does not inject its instructions into an agent context.

Before any **future** external tool/skill execution, the next phase must implement: publisher identity and source-code review, exact commit pinning, explicit permissions, license review, supported OS/agent verification, privacy scope, sandboxed trial and measured benefit, with audit logs. The present slice intentionally **does not bypass this missing security gate**.

## 5. Unfinished Master Checklist criteria

`A2-01`, `A2-02`, `A2-03`, `A2-06`, `A2-09` have partial implementations. `A2-04` has only a metadata prioritization heuristic, not a security or compatibility score. `A2-05`, `A2-07`, and `A2-08` (independent vetting, runtime skill invocation, evidence-backed trials) are **not complete**.

The full A2 Done condition requires **two real, previously unfamiliar applications**, different toolchains, verifiable trial evidence and reproducibility. Fixture unit tests alone do not certify it.

**Next:** F-03b — trusted adapter package format, versioned approval and sandbox trial gate; F-04 — Creative Director; F-05 — production orchestration. Follow `docs/MASTER_UPGRADE_CHECKLIST.md` rather than prematurely checking A2 boxes.
