# Agent Skills

Agent Skills give **instructions to a coding agent**; they are not independently running services. An agent should read [`AGENTS.md`](../AGENTS.md) and the relevant `SKILL.md` files before starting work. Agent runtimes differ in automatic skill discovery: if a directory is not indexed, open its skill file explicitly.

## Skill catalog

| Skill | Responsibility |
| --- | --- |
| [`video-producer`](../.agents/skills/video-producer/SKILL.md) | Coordinate the entire production and review workflow |
| [`repo-intelligence`](../.agents/skills/repo-intelligence/SKILL.md) | Inspect a codebase economically; use Graphify when warranted |
| [`feature-coverage`](../.agents/skills/feature-coverage/SKILL.md) | Verify demo features and document omissions |
| [`storyboard-planner`](../.agents/skills/storyboard-planner/SKILL.md) | Plan individual scenes, actions, timing, and narration |
| [`browser-capture`](../.agents/skills/browser-capture/SKILL.md) | Capture real UI behavior using Playwright |
| [`scene-director`](../.agents/skills/scene-director/SKILL.md) | Coordinate scene previews, approvals, and locks |
| [`ai-voiceover`](../.agents/skills/ai-voiceover/SKILL.md) | Configure narration language, voice, and paid-API consent |
| [`video-editing`](../.agents/skills/video-editing/SKILL.md) | Produce scene previews and assemble the final video |
| [`production-optimizer`](../.agents/skills/production-optimizer/SKILL.md) | Reuse valid artifacts and minimize unnecessary work |
| [`video-qa`](../.agents/skills/video-qa/SKILL.md) | Validate technical outputs and guide human review |

## Recommended workflow

```text
repo-intelligence → feature-coverage → storyboard-planner
             ↓
browser-capture → ai-voiceover → video-editing
             ↓
scene-director + video-qa → approved scenes → final export
             ↑
    production-optimizer (cache and incremental changes)
```

## Optional Remotion skills

Remotion publishes separately maintained skills, including `remotion-best-practices`, `remotion-create`, `remotion-render`, `remotion-captions`, `remotion-docs`, and `remotion-markup`. Consult the [official Remotion AI skills guide](https://www.remotion.dev/docs/ai/skills) for installation and licensing. AVP does not vendor those skills.

## Adding a skill

A new skill should explain **when to use it, prerequisites, inputs, outputs, validation, recovery, and security constraints**. Prefer commands and concrete paths to unbounded instructions such as "inspect everything." Skills must not silently override `AGENTS.md` or bypass human review and paid-service opt-in.
