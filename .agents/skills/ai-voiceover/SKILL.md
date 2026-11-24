---
name: ai-voiceover
description: Generate localized speech with explicit API approval
---

# ai-voiceover

Speech text is separate from shooting actions; review exact text, language code, delivery style and provider voice. Gemini TTS requires GEMINI_API_KEY stored only in .env or environment; run voice --allow-paid-api only with explicit consent. Measure waveform and allow manual listening review. For disabled voice use silent previews. Do not claim translation or forced speech alignment is already implemented.

## Output contract

Produce artifacts or evidence in the project `.avp/` directory where relevant; keep source paths and review decision explicit. Follow `docs/security.md` and do not introduce secrets into the repository.

## Real audio timing
After obtaining the audio, consult `docs/audio-captions.md`. The local captions stage uses measured silence spans by default for speech. Review real audio and optionally add per-sentence `captionTiming.anchors` if the automatic sentence association is uncertain. Never regenerate costly TTS just to revise captions or camera timing.

## Build-time audition and timing (opt-in)
Read `docs/voice-timing.md`. Resolve actual voiceover.voice/style/language and pronunciation instructions before full-scene audition; free-text creative direction alone does not change TTS. Use `avp timing audition` only with paid permission, or import authorized exact narration. Listen and select the exact candidate hash; never claim listening verification from amplitude analysis. Compare current browser rehearsal duration and selected audio, revise the storyboard if infeasible. Production reuses selected audio instead of synthesizing again.
