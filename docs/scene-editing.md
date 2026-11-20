# Scene Editing: MathMate parity (opt-in)

AVP's basic FFmpeg scene preview remains the default. For scene-specific cinematography, add a `scene.edit` object. Its preview is rendered with Remotion **before scene QA and review**, so later final rendering cannot insert unreviewed edits. All edited footage still comes from real, authorized captures. No LLM, external API or new TTS request is required by the editing engine.

## Example

```json
{
  "id": "scene-02-feature",
  "durationSec": 8,
  "narration": "Click Start and observe a real result.",
  "capture": {"actions": [{"type": "goto", "path": "/"}]},
  "edit": {
    "chapter": "FEATURE / LIVE DEMO",
    "shots": [
      {
        "source": "capture",
        "durationSec": 5,
        "trimStartSec": 0.5,
        "trimEndSec": 5.5,
        "playbackRate": 1,
        "zoom": 1.05,
        "focus": {"x": 0.64, "y": 0.40},
        "label": "LIVE RESULT"
      },
      {
        "source": "capture",
        "durationSec": 3,
        "trimStartSec": 5.5,
        "playbackRate": 1,
        "zoom": 1.1
      }
    ],
    "callouts": [
      {"text": "Verified result", "startSec": 5.5, "durationSec": 2, "position": "top-right"}
    ]
  }
}
```

Audio and captions are **separate from source playback**, so sped-up footage does not speed up narration. If the clip is shorter than the planned shot, its final authentic frame is held. Playback above 1.05× is marked visibly. A shorter shot list holds the last authentic frame for the remaining scene time. Source trim points refer to the recorded clip, never to live application time.

### Multi-device inset or an additional shot

First import an authorized source as a local asset:

```bash
node bin/avp.mjs asset add --project path/to/project --scene scene-02-feature --name mobile --file /path/to/mobile-recording.webm
```

The tool normalizes video to `.avp/scenes/scene-02-feature/assets/mobile.mp4`. Only named assets under this directory may be referenced by a scene edit. Do not import private screens or recordings without permission.

```json
{
  "insets": [
    {
      "asset": "mobile",
      "startSec": 1,
      "durationSec": 5,
      "x": 0.72,
      "y": 0.1,
      "width": 0.25,
      "height": 0.72,
      "label": "Simulated mobile device"
    }
  ]
}
```

To use an asset as a full-screen shot, set `"source": "asset:mobile"` on a shot.

### Preview, QA, review

```bash
node bin/avp.mjs captions --project path/to/project --scene scene-02-feature
node bin/avp.mjs preview --project path/to/project --scene scene-02-feature
node bin/avp.mjs qa --project path/to/project --scene scene-02-feature
node bin/avp.mjs approve --project path/to/project --stage scene --scene scene-02-feature
node bin/avp.mjs render --project path/to/project
```

For edited previews, install AVP's optional Remotion/React packages (`npm install`) and a Remotion-compatible Chromium browser. The default no-edit path requires only FFmpeg. Remotion source files remain inside the AVP package so module resolution works even if the target project directory lives elsewhere.

## Contract and Quality safeguards

- `scene.edit` accepts structured shots, insets and callouts. It is validated by `assertConfig()`; no arbitrary React, HTML, shell or absolute asset path is permitted in the editing schema.
- A shot duration is output time; `trimStartSec`, `trimEndSec` and `playbackRate` control source playback time. The scene's target duration remains in `scene.durationSec`. Real voice duration may extend it; only the image track freezes.
- Editable visual properties include `zoom` (0.5–3), normalized `focus.x/y` (0–1), chapter text, per-shot label, callouts and optional picture-in-picture.
- Asset modifications invalidate preview/QA/review while leaving unaffected capture/TTS/caption files. A locked scene must be explicitly unlocked before changing its media.
- A scene must still pass the usual QA and review gates. **Technical QA remains separate from evidence/semantic QA**; visual changes cannot prove a feature exists.
- This step ports the proven MathMate edit primitives; it does not yet support the full MathMate semantic assertions, audio waveform anchors, footage version rollback or self-healing. Those are separate implementation steps.

## Original evidence and provenance

MathMate historical edit implementation: [video.tsx](https://github.com/Phat-le2005/Coach_Learning/blob/chore/archive-hackathon-video-20261110/CoachLearningVideo/production/src/video.tsx), [manifest.json](https://github.com/Phat-le2005/Coach_Learning/blob/chore/archive-hackathon-video-20261110/CoachLearningVideo/production/src/manifest.json). AVP's current implementation is a new generalized version, not a copy of MathMate's application-specific hard-coded scenes.
