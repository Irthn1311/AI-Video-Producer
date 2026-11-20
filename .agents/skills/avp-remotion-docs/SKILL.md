---
name: avp-remotion-docs
description: Resolve Remotion API and version questions using official documentation
---

# avp-remotion-docs

## Use when
You are uncertain about Remotion APIs, supported components, browser media formats, composition props, export options or version-dependent behavior.

## Procedure
1. Inspect `package.json` and lockfile for the installed Remotion version (AVP initially declares Remotion 4.0.541 optional dependencies).
2. Search the official documentation at https://www.remotion.dev/docs/ and the official skills index at https://www.remotion.dev/docs/ai/skills.
3. Prefer docs for the exact installed version. Verify imports, hook behavior, CLI syntax and renderer options against the local package where possible.
4. Produce a minimal experiment in an isolated sample composition; verify it before editing production output.
5. Never paste an unverified snippet into the final pipeline or assume the official published skill set has been vendored.

## Exit criteria
Document which API is used and why; ensure the proposed syntax works with the project's package version. This AVP-authored guide is not the official upstream Remotion Docs skill.
