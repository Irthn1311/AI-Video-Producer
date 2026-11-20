# Third-party skills and provenance

## Graphify (vendored)

Path: [`.agents/skills/graphify/`](../.agents/skills/graphify/UPSTREAM.md)

- Upstream: https://github.com/Graphify-Labs/graphify
- Archived distribution version: `graphifyy==0.9.102`
- License: Apache-2.0, with the upstream `LICENSE`, `LICENSE-MIT` and `NOTICE` retained inside the skill directory.
- The complete Agent Skill and reference files are bundled for offline agent reading. The Python `graphify` executable is **not** bundled.
- For AVP codebase research, use targeted local search first and run code-only Graphify only when it materially helps. Semantic extraction may use LLM tokens or a paid API; never run it just because a key exists.

## Remotion (AVP-authored skill guides)

The `avp-remotion-*` skills under `.agents/skills` are original AVP instructions, written to work without the upstream skill repository. They are **not** copies of or substitutes for the official Remotion Agent Skills.

Official source: https://github.com/remotion-dev/skills. That repository currently does not declare a license for republishing its entire text in a different repository, so AVP does not vendor its copyrighted skill content.

To install the official upstream skills in a local project, follow the publisher's installer (for example `npx skills add remotion-dev/skills`). Review the install target and installed files; this step downloads content from the publisher and requires network access.

Remotion runtime packages, paid services, and their licensing remain separate from the skill instruction files.
