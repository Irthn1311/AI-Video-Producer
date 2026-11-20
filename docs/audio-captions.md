# Speech-aware captions — MathMate audio parity

MathMate's caption workflow used waveform silence boundaries and human-reviewed sentence anchors, with proportional timing only **inside** long split sentences. AVP now makes those two approaches reusable for **each scene**, without another TTS call, LLM, external transcription API or provider quota.

## Defaults and supported methods

- With `voiceover.enabled=true`, the default method is `audio-pauses`. FFmpeg's local `silencedetect=noise=-38dB:d=0.18` measures non-silent regions from the **current** `voice.wav`. If the number of speech regions equals the number of narration sentences, each is associated with one sentence; if not, sentence boundaries are **estimated** along active audio time. Both methods require listening review; they are **not word-level forced alignment** or verified ASR transcription.
- With voice disabled, captions remain text-duration estimates. This maintains silent demo compatibility; there is no speech to align with.
- For higher-importance videos, use `scene.captionTiming.mode=manual` and set one start/end pair per sentence. This mirrors MathMate's human-reviewed timing.
- `mode=proportional` is an explicit opt-out to use the old purely estimated method on any project.

### Manual anchor example

```json
{
  "narration": "This is a real product. The result appears on screen.",
  "captionTiming": {
    "mode": "manual",
    "maxChars": 80,
    "anchors": [
      {"startSec": 0.23, "endSec": 2.31},
      {"startSec": 2.94, "endSec": 5.11}
    ]
  }
}
```

Start/end times are relative to `voice.wav` for **that scene**, not the full movie. The scene duration may be extended by the real audio duration during preview; no narration playback-rate change is introduced. Anchors must be increasing, non-overlapping, within the actual file, and match the current sentence count.

### Outputs, review and cache

```bash
node bin/avp.mjs captions --project ./demo --scene scene-01-intro
node bin/avp.mjs preview  --project ./demo --scene scene-01-intro
node bin/avp.mjs qa       --project ./demo --scene scene-01-intro
```

`.avp/scenes/SCENE/captions.srt` is used by FFmpeg and `captions.json` (with `schemaVersion=2`, timing method, measured spans, warnings, rows and `voiceHash`) is used by Remotion. **Both files are covered by artifact integrity checks.** Changing the JSON after QA marks captions/preview as stale, even if SRT is unchanged.

`qa-report.json` now reports the actual timing method and `captionReviewRequired`; a technical PASS does **not** imply the words are synchronized perfectly, and a human/independent speech reviewer should check important scenes.

When text, voice, caption anchors or their settings change, only captions and dependent preview/QA become stale. The valid voice and capture remain reusable. No additional Gemini TTS call occurs for caption revision.

### Limitations

- FFmpeg detects energy/silence, **not semantic sentence or word boundaries**. It can fail with very quiet speech, background noise or continuous audio. A voiceover containing only silence fails closed instead of silently creating fraudulent "aligned" captions.
- Two sentences can be spoken without a pause, or one sentence can have multiple pauses. In these cases the result is explicitly `SILENCE_AWARE_ESTIMATED`.
- Manual anchors are operator-provided and require actual listening review; their presence alone does not prove accuracy.
- True word-level forced alignment (e.g. a local ASR/aligner plugin) is an optional future enhancement, not claimed by this implementation.
- AVP does not modify, trim or normalize the original TTS audio in this PR. Those can be implemented later as an explicit derived-audio stage with independent hashes.
