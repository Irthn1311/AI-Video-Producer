# Adaptive Creative Director (F-04 first slice)

The agent makes creative decisions; AVP records the choices and enforces the Build boundary. This is an opt-in, deterministic contract, not an automatic video director.

In project.json, add:

```json
{
  "creative": {
    "audience": "product reviewers",
    "goal": "Show one verified user journey and its result",
    "director": {
      "mode": "interactive",
      "visualStyle": "clean product walkthrough",
      "tone": "natural, precise",
      "brand": "Example App",
      "pronunciation": "Example App",
      "voiceDirection": "clear Vietnamese narration; audition pronunciation before recording",
      "targetDurationSec": 90,
      "maxDurationSec": 105,
      "sceneDirections": {
        "scene-01-intro": {"framing": "stable framing, no zoom", "pacing": "concise"}
      }
    }
  }
}
```

Keep existing language, render, voiceover, scene and review configuration. Only refer to actual scene IDs. The contract distinguishes editorial guidance from executable edit/voice/capture settings; an agent must translate agreed choices into those settings and inspect their output. No voice audio is produced by creative commands.

1. Run `avp analyze` and `avp creative recommend`. Recommendations use bounded source signals and existing scene candidates, not observed feature proof. Resolve audience, goal and relevant questions; record decisions in project.json.
2. For interactive mode, inspect the proposal and run `avp creative approve --hash HASH --confirm` using the exact returned briefHash. Receipt history is content-addressed under .avp/creative/approvals. Changes to source, config or generated brief invalidate the current approval; old receipts remain.
3. Autonomous mode skips the creative human approval, but requires recorded audience/goal and the same duration and all existing safety gates. Existing review.mode independently controls downstream review; it is not changed by the creative mode.
4. Run `avp build prepare --force` after changing decisions, rehearse, check and freeze. Build includes the canonical creative brief in the artifact manifest, and the current creative status is checked before freeze/production. Missing intent, exceeded max duration, or pending interactive review prevents readiness. Legacy projects without creative.director retain their prior behavior.

The recommendation set adapts to static canvas, realtime, dashboard and frame orientation clues. It does not generate new scenes, verify claims, apply free-text style instructions, produce voice auditions, or infer business semantics. No paid API or third-party code is executed. Source and config changes conservatively invalidate Build approval; selective downstream reuse and semantic review remain follow-up work. A4 remains PARTIAL until tested on actual distinct apps and complete creative decision execution.
