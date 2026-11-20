# Upstream Graphify skill provenance

This directory contains the Graphify Agent Skill and reference files sourced from the `graphifyy==0.9.102` Python distribution as archived at:
https://github.com/Phat-le2005/Coach_Learning/tree/chore/archive-hackathon-video-20261110/.agents/skills/graphify

Upstream project: https://github.com/Graphify-Labs/graphify
The original Apache License 2.0, historical MIT license, and NOTICE are preserved alongside the files.

To use the Graphify CLI, install its runtime independently (e.g. `uv tool install graphifyy==0.9.102` or `pipx install graphifyy==0.9.102`). A checked-in skill file is agent guidance, not the Python executable.

AVP default is economical and local-first. First use `rg`, package manifests and `avp inspect`; only build a Graphify graph for substantial structural questions. Run code-only extraction and avoid automatic semantic/LLM extraction, upload or watch modes unless explicitly authorized. See `../repo-intelligence/SKILL.md`.

The vendored third-party contents are not relicensed by AVP's own MIT LICENSE.
