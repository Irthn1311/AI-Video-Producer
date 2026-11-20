# Contributing to AI Video Producer

Thank you for helping build a portable, trustworthy video-production toolkit for AI coding agents.

## Before you start

- Read [Architecture](docs/architecture.md), [Security](docs/security.md), and [Roadmap](docs/roadmap.md).
- Use Node.js **22+** and keep the CLI operable without a paid AI service.
- Prefer small, independently testable improvements over provider-specific assumptions.
- For bug reports, include the command, sanitized configuration, expected behavior, actual behavior, and relevant local report. Never include API keys or private source code.

## Local development

```bash
npm install
npm test
node bin/avp.mjs doctor
node bin/avp.mjs help
```

FFmpeg and ffprobe are required for media integration tests. Install Playwright Chromium separately when working on capture:

```bash
npx playwright install chromium
```

## Contribution guidelines

1. **Preserve the contracts.** Changes to `project.json` or `.avp` state schemas require a version bump and a migration strategy.
2. **Test invalidation paths.** Changing review gates, cache keys, or scene locks requires regression coverage for stale and modified artifacts.
3. **Keep demos honest.** Capture authentic interactions in disposable environments; never manufacture product responses or use live customer accounts.
4. **Respect paid APIs.** Providers must fail closed when keys, consent, or budget estimates are missing. The estimate is not a provider billing guarantee.
5. **Keep integrations optional.** Do not make a specific coding agent, TTS provider, or OS a requirement for core commands.
6. **Document user-visible behavior.** Update quickstart/roadmap/skills when workflows change; avoid personal development-session notes in public docs.

Agent skills belong in `.agents/skills/<name>/SKILL.md` with YAML front matter. For new production types, isolate module-specific actions under `modules/` and keep orchestration in the core.

## Pull requests

Describe the problem, your changes, tests performed, and any compatibility impact. For media changes, include a reproducible small test fixture rather than large generated MP4 files. Please do not commit `.env`, credentials, recordings with personal data, or unlicensed assets.

This project is released under the [MIT License](LICENSE).
