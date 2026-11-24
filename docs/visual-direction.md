# Visual direction and shot composition (F-04d)

Opt in with `"creative": {"visual": {"consistentTheme": true}}` in project.json, preserving existing creative settings. This requires Build. Every scene must contain explicit `edit.design` and a complete shot sequence; the existing agent storyboard proposal accepts this configuration. Agent authors the actual edit based on source, creative brief and runtime rehearsal; no fixed story or provider call is made here.

Example scene.edit (use real shot IDs, timings and evidence):

```json
{
  "design": {
    "rationale": "Keep the user workflow visible, then focus on the result.",
    "framing": "adaptive",
    "theme": {"background":"#101820","panel":"#1B263B","text":"#FFFFFF","accent":"#70D6FF"}
  },
  "shots": [
    {"id":"context","durationSec":6,"camera":"static","purpose":"Establish page and controls"},
    {"id":"result","durationSec":4,"camera":"push","zoom":1.15,"focus":{"x":0.65,"y":0.4},
     "trimStartSec":8,"trimEndSec":12,"editReason":"Omit only reviewed idle wait; keep observed result",
     "purpose":"Focus on the actual result","transitionIn":{"type":"fade","durationSec":0.2}}
  ]
}
```

Shot durations must add to scene.durationSec. Use stable unique shot IDs within each scene; when inserting a shot, do not rename existing IDs. Camera modes: static (zoom 1), pulse (existing smooth zoom in/out), push (smooth zoom in), hold (constant zoom). Stable framing requires static/zoom 1. An optional fade is a bounded in-shot fade from the theme background; it is not a cross-scene crossfade. A trim or changed playback rate requires an explicit reason. Designed trimEndSec cannot exceed actual measured media duration at render. Existing callout, chapter and inset primitives remain available. At least one shot must use capture source; this alone does not establish semantic truth. Panel/text colors must meet a 4.5:1 contrast ratio. By default all scenes use the same palette, unless consistentTheme=false.

Use `avp storyboard check` for the proposal diff (including shot spec changes), then apply its exact hash, reprepare and review. Use `avp visual check` for structural validation. Build blocks missing or invalid designs. Real runtime rehearsal, timing, asset availability at render, claims and scene preview QA are still required. Inspect the edited preview: neither a passing assertion nor a cut justification proves the asserted result remains visible. Acceleration is labeled using the existing renderer. No scene timing allowance is inferred from cuts; existing measured-action overflow remains blocking.

Remotion uses the specified camera modes, in-shot fades and palette for chapter/callout/caption/inset overlays. All footage remains in the existing trusted asset/capture pipeline. Shot IDs propagate to production and compiled edit-plan. Spec diffs do not imply isolated shot render or media reuse; existing scene-level preview invalidation applies. Changing only editing retains unchanged capture and voice inputs. No automatic semantic visual QA, animated cross-scene transition handles, or shot-level repair/cache is claimed. Tests use synthetic clips for actual rendering, not product feature proof.
