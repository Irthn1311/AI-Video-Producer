# External benchmark intake — source-only, not accepted

Candidate selection and static intake, 2026-11-24. These are independently maintained applications, not AVP fixtures. The source revisions were inspected via repository metadata and selected file reads. Neither has been downloaded, installed, launched, filmed, or independently evaluated by an AVP agent in this intake.

| Candidate | Domain | Pinned commit | Source scope |
|---|---|---|---|
| [TodoMVC React](https://github.com/tastejs/todomvc/tree/ff43b02e59dfa604386bb382034b2cd07c2bcd8a/examples/react) | Task management | ff43b02e59dfa604386bb382034b2cd07c2bcd8a | examples/react |
| [JS Paint](https://github.com/1j01/jspaint/tree/53be67ab8c47cc0d2168899e7481bc04839c4c81) | Interactive graphics editor | 53be67ab8c47cc0d2168899e7481bc04839c4c81 | browser implementation |

## Source intake findings

TodoMVC React package.json declares webpack build/dev and static dist serve; the pinned dist/index.html references app.bundle.js, app.css and base.js. This is a candidate for an authorized local static serving experiment rather than installing arbitrary dependencies. Verify all required assets and bundled source integrity; review repository/subproject license (repository metadata NOASSERTION, not a license determination). Determine whether the bundle or base.js contacts remote services. Do not start the scripts or assume visible interactions work until reviewed and tested.

JS Paint package.json declares MIT and live-server browser dev, CSS build, Electron and release scripts. index.html loads source modules including drawing tools, selection, storage, imgur, speech recognition and other optional behavior. Restrict experiment to browser-only local artwork, disposable storage, blocked outbound network, no uploads, no microphone/desktop/Electron access. Review all executable browser assets and network calls before launch; no npm install or lifecycle scripts by default. Source license metadata alone does not authorize redistribution of bundled assets.

## Independent execution brief (no scene recipes)

Give a separate agent only the pinned repository/source scope, safe runtime and objective: produce an authentic short demo for a first-time user, with a coherent story and evidence of actual functionality. Do not supply this AVP fixture's storyboard, selector list, screenshots, adapter or expected feature outcomes. The external agent must identify and justify features, required capability, environment, claims, narration and scene structure. It must report actual blockers instead of fabricating. Ask for a subsequent targeted scene edit after accepted final, preserve earlier output and collect full/repair receipts. Use an authorized local recording or explicit paid consent for real Vietnamese narration; evaluate pronunciation/sync separately.

## Go/no-go

- Review exact source, bundle, license, dependencies and entrypoint; approve safe isolated browser runtime and restricted network, disposable data, no credentials.
- Provide a distinct agent session without prior plans; record agent/version, elapsed time, consent, intervention count and actual usage if available.
- Real capture/assertions, technical QA, independent semantic review of actual preview/audio, final acceptance, scoped repair and matched v2 full baseline.
- Repeat trials, retain evidence, explicitly record failed and blocked runs. No stable tag until criteria are met.

Current status: SOURCE_INTAKE_ONLY. External execution, MathMate parity, actual Vietnamese voice and cross-platform verification are still pending. This document does not grant launch or paid permissions.
