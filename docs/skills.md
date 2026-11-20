# Agent Skills

AVP ships **actual instruction files** in `.agents/skills/`, not only links. Clone the repository and direct the agent to `AGENTS.md`; Claude Code and Gemini CLI entrypoints reference the same instructions. Some agents do not autodiscover `.agents/skills`, so open the relevant `SKILL.md` explicitly. The skills guide an agent; they are not a standalone LLM or automatic executable.

## Production skills (bundled, AVP-authored)

| Skill | Responsibility |
| --- | --- |
| [`video-producer`](../.agents/skills/video-producer/SKILL.md) | End-to-end orchestration and review checkpoints |
| [`repo-intelligence`](../.agents/skills/repo-intelligence/SKILL.md) | Low-token codebase research |
| [`feature-coverage`](../.agents/skills/feature-coverage/SKILL.md) | Real feature evidence and omissions |
| [`storyboard-planner`](../.agents/skills/storyboard-planner/SKILL.md) | Narrative, actions, timing, narration |
| [`browser-capture`](../.agents/skills/browser-capture/SKILL.md) | Playwright capture of actual UI |
| [`scene-director`](../.agents/skills/scene-director/SKILL.md) | Scene review, locking and selective reruns |
| [`ai-voiceover`](../.agents/skills/ai-voiceover/SKILL.md) | Optional TTS with provider/key approval |
| [`video-editing`](../.agents/skills/video-editing/SKILL.md) | Preview and timeline assembly |
| [`production-optimizer`](../.agents/skills/production-optimizer/SKILL.md) | Cache, cost and dependency planning |
| [`video-qa`](../.agents/skills/video-qa/SKILL.md) | Technical QA and semantic review guidance |

## Bundled Remotion workflow skills (AVP-authored)

These are usable instructions in the repository **without downloading the official Remotion skill text**. They describe AVP's actual render adapter rather than claiming every Remotion feature is already implemented.

| Skill | Use |
| --- | --- |
| [`avp-remotion-workflow`](../.agents/skills/avp-remotion-workflow/SKILL.md) | Router for editing and render tasks |
| [`avp-remotion-create`](../.agents/skills/avp-remotion-create/SKILL.md) | Composition and frame-driven timeline |
| [`avp-remotion-markup`](../.agents/skills/avp-remotion-markup/SKILL.md) | Overlays, zooms, callouts and transitions |
| [`avp-remotion-captions`](../.agents/skills/avp-remotion-captions/SKILL.md) | Subtitles and timing review |
| [`avp-remotion-studio`](../.agents/skills/avp-remotion-studio/SKILL.md) | View compositions interactively |
| [`avp-remotion-render`](../.agents/skills/avp-remotion-render/SKILL.md) | Render `AVPVideo` and verify output |
| [`avp-remotion-docs`](../.agents/skills/avp-remotion-docs/SKILL.md) | Check installed-version APIs |

## Bundled upstream Graphify skill

The complete [`graphify` Agent Skill](../.agents/skills/graphify/SKILL.md) and eight supporting reference files are vendored with the original Apache-2.0 license and NOTICE. It is useful for structural code relationships **when search and local inventory are insufficient**.

`graphifyy==0.9.102` is the pinned skill provenance; the Python CLI is **not** vendored. Install it only when needed with `uv tool install graphifyy==0.9.102` or `pipx install graphifyy==0.9.102`. Do not auto-run semantic or paid extraction just because a TTS API key exists. Read `repo-intelligence` before invoking Graphify.

## Official Remotion Agent Skills

The upstream publisher maintains [official Remotion Agent Skills](https://github.com/remotion-dev/skills). These are **not** bundled because that upstream repository does not declare a reusable redistribution license. To download the publisher's copy into a local project when desired, use:

```bash
npx skills add remotion-dev/skills
```

This step requires network access, may prompt for agent targets, and can add files. Inspect its changes before committing them. The official content and AVP-authored `avp-remotion-*` skills are deliberately named differently to avoid confusion.

See [third-party licenses and provenance](third-party-skills.md).

## Operational order

```text
video-producer
  repo-intelligence -> feature-coverage -> storyboard-planner
                          |                    |
                          v                    v
                  browser-capture -> ai-voiceover -> video-editing
                         |                              |
                         +-------- scene-director ------+
                                            |
                                       video-qa -> export
```

`production-optimizer` checks every costly or repeated step. Use `avp-remotion-workflow` only if the job requires Remotion composition, graphics or a Remotion render. Avoid loading large upstream Graphify instructions until the research question justifies it.

## Authoring and testing skills

Each new skill must include valid `name` and `description` frontmatter, a clear trigger, expected inputs, commands/tools, outputs, QA and failure/security behavior. Run `npm test` to check presence and syntax of the bundled skill pack. README is for users, not an internal session log.
