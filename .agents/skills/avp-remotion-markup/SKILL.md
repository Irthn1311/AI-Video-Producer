---
name: avp-remotion-markup
description: Create professional on-screen callouts, highlighting, zooms and animations in Remotion
---

# avp-remotion-markup

## Use when
The video needs intro/outro graphics, click emphasis, zoom/pan on screenshots, feature labels, transitions or other visual storytelling.

## Steps
1. Identify the exact user action or claim that each overlay explains. Restrict effects to recorded footage and verified features.
2. Build React components with explicit frame-based animation: `useCurrentFrame()`, `useVideoConfig()`, `interpolate()`, `spring()`, `Sequence` and absolute positioning where supported by installed version.
3. Avoid browser-time CSS transitions or asynchronous animations whose visual state depends on wall-clock time; Remotion rendering must be deterministic for a requested frame.
4. Respect safe margins, font availability, text length, contrast, reading time and browser UI visibility. Do not cover error indicators or misleadingly erase failed outcomes.
5. For zoom/crop, keep the source's aspect ratio and preserve context so viewers know which interface is being shown.
6. Render stills from the opening, key interaction, caption-heavy moment and scene ending; inspect for clipping and occluded labels.
7. Keep per-scene overlay settings in data rather than hardcoded values tied to one application's route or branding.

## Output and recovery
Commit composition components/configs, not generated personal captures. If overlays are wrong, rerender only affected scenes/timeline; retain original footage, voice and subtitles when still valid. Never change application data to make an overlay seem correct.
