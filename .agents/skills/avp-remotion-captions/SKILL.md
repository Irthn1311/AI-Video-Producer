---
name: avp-remotion-captions
description: Integrate accurate readable captions into Remotion scene compositions
---

# avp-remotion-captions

## Before editing
Use the scene narration, selected language(s), `.avp/scenes/<scene-id>/captions.srt`, and actual audio waveform/duration. AVP v0.1 captions are proportional estimates; they are **not** verified word/sentence alignment.

## Procedure
1. Validate that narration text equals the actual spoken text. For another subtitle language, first obtain an explicitly reviewed translation—changing `language.subtitles` alone does not translate speech.
2. Use real timestamps from a verified transcription/alignment process where available. If only estimated SRT exists, tell the reviewer and check timing manually.
3. Convert SRT timestamp ranges into the composition's fps timebase; account for scene offset if working on the combined timeline.
4. Show at most a few readable lines, maintain safe margins, avoid splitting formulas or product names awkwardly, and keep contrast on bright/dark footage.
5. Do not place subtitles where the demonstrated app displays critical feedback. Use a reserved caption region or alternate layout when necessary.
6. Check initial, midpoint and final captions against actual speech. Never claim that an exported SRT alone proves synchronization.

## Outputs
The reviewed SRT/JSON timing source, caption styling configuration, rendered example frames, QA note on whether timing was measured or estimated. A corrected caption track invalidates downstream preview QA/approval.
