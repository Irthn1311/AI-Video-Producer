# Fresh Agent onboarding (candidate)

Use a separate checkout of AVP and a disposable target app. The following command creates a separate workspace without sample dashboard features or claims:

```sh
node bin/avp.mjs init ../demo-workspace --source ../target-app --app-url http://127.0.0.1:4173 --goal "Introduce the app to first-time users" --audience "New users" --language vi --voice off --mode review
node bin/avp.mjs workflow next --project ../demo-workspace
```

Paths may contain spaces; quote them for your shell. Source and workspace must be separate, non-overlapping directories. The app URL is a disposable loopback origin, not permission to start the app. Voice defaults off. Use --voice local for timing-gated authorized local audio; supply/listen/select each exact scene audio before freeze. No paid provider permission is granted. Review is default; --mode autonomous selects autonomous creative/production policy but declared semantic review remains required. Read AGENTS.md and the entry skill. The init command creates only project.json and a non-production sentinel; it never executes source, writes to target or generates a sample claim. Creative Director requires an applied source-linked storyboard even for direct Build freeze.

Run workflow next, then workflow step --hash HASH only when NEXT and authorized. AGENT_REQUIRED means author actual source-linked proposal; use storyboard context/check/apply. REVIEW_REQUIRED means obtain real approval (creative, coverage/storyboard, scene semantic/approval and final as applicable). Do not auto-approve. Run actual app in isolated test environment; use explicit --allow-actions/--allow-launch only with consent. Use --voice local with user-provided audio or approved local speech. Record blockers, no fake PASS. See independent-agent-brief.md for the independent acceptance experiment and targeted repair.

CI candidate: clean-checkout intake test on Linux/Windows/macOS, no npm dependencies, app launch, media rendering or provider calls. This checks path handling, source immutability, handoff and fail-closed freeze, not platform-wide media compatibility or a real separate Agent. Codex/Claude Code/Gemini CLI must be run in a separate session by an operator; no such agent was launched here. 

PR38 observed focus timing (run 45394149404, job 138445336213): 37.666667s final, full 114737ms/21 dispatches, repair 31879ms/4 dispatches, 14/16 preserved, no paid calls; 2/5 cue/evidence anchors within .5s (create -0.2s, complete 0s), filter +2.383/+1.417s and cleanup +.692s outside. This is a real diagnostic, not forced alignment or natural speech acceptance. [Video artifact](https://github.com/Irthn1311/AI-Video-Producer/actions/runs/45394149404/artifacts/14919858832). The filter and cleanup still require scene-level timing repair. Do not mark independent Agent acceptance based on this scripted pilot.
