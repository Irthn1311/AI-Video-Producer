# External quality follow-up (CI pending)

PR34 real JS Paint pilot passed; run 45385962233, job 138416798221, exact head d58c122f37c5045b0ee1f9f95d7fa56581915018. Source 53be67ab8c47cc0d2168899e7481bc04839c4c81; verified 2,945 files / 53,832,980 bytes. Canvas 683x384: black pixel count 0 -> 427 (stroke), 0 -> 613 (zigzag). Full 28,623 ms, 9 steps, 17.833334s capture, 18s preview; caption repair 3,856 ms, 4 steps, zero regenerated capture, 9s preview. Final 18.021333s in both. Technical QA PASS, zero paid reservations; unmatched config. [Artifact](https://github.com/Irthn1311/AI-Video-Producer/actions/runs/45385962233/artifacts/14916022679) retained through December 1, 2026.

Actual final MP4 was downloaded and sampled at two-second intervals. Both shapes are visible; much of the image is unused gray desktop, pencil movement is too brief for a guided demo and result holds are lengthy. Captions are readable in sampled frames. These are sample-frame observations, not full playback, independent semantic acceptance or listening review.

## Follow-up

Keep the baseline pilot. Quality variant uses a smaller real browser viewport (960x540) rather than fabricating cropped evidence, 7s scenes, a paced real pointerPath durationMs=2400, Vietnamese captions, locally synthesized speech from eSpeak NG vi-sgn (not natural human or Gemini speech), selected through existing timing import/select, gain-only master target -20 LUFS chosen for conservative speech peak headroom. CI tests measured pointer duration, selected voice copies, quality gates, actual footage, scoped Vietnamese narration/voice/caption repair and retained captures. No paid provider call. Scripted selections test the receipt path only, not a listening decision. Technical audio checks do not prove intelligibility or pronunciation. Both variants produce video artifacts. Advisory QA reports approximate time after the last declared action and measured pointer durations, not a claim of static footage. No automatic timing trim or changing accepted scene artifacts. The variants differ in inputs; do not claim a controlled latency improvement. An actual user/independent reviewer must inspect and listen before acceptance. CI result is pending.

## Independent Agent run

See independent-agent-brief.md. Do not give the candidate pilot code, recipes, selectors, or expected outputs to the evaluated Agent. Record actual decisions, blockers, intervention count, tool usage and receipt hashes. A separate agent session and authorized runtime are required; this PR does not launch one.
