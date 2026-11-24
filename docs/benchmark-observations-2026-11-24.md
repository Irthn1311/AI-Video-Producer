# Fixture observations — 2026-11-24

Source: [PR #31 CI run 45381447512](https://github.com/Irthn1311/AI-Video-Producer/actions/runs/45381447512), job 138401210589, head 06b567d4dfe3c712df9f7a4b4fcddec0ca577504. Two author-known two-scene fixtures, synthetic selected local tone, Linux x64 Node 22.23.5 and FFmpeg 8.0.1-3ubuntu2. All technical QA passed.

| Fixture | Full dispatch ms | Repair dispatch ms | Full/repair steps | Full/repair capture s | Full/repair preview s | Preserved parts | Final s |
|---|---:|---:|---|---|---|---|---:|
| Dashboard | 28217 | 8557 | 11/3 | 7.916666/0 | 8.02/4.01 | 7/8 | 8.042 |
| Canvas | 28093 | 8593 | 11/3 | 7.958333/0 | 8.02/4.01 | 7/8 | 8.042 |

Both repaired revisions only executed preview, QA and render. No paid API reservations. Observed raw differences are 19660 ms and 19500 ms, respectively; UNMATCHED_INPUT_OBSERVATION because v1 full differs from v2 repaired config. No percentage same-input savings or actual bills are claimed. No independent semantic pass or external agent benchmark was performed. This is not a wall-clock comparison and excludes Build/Agent/approval effort. Follow-up matched experiment is CI pending.
