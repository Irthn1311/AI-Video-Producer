# Scoped repair and release (F-07 candidate)

An external agent interprets user feedback and authors .avp/repair/request.json plus the existing .avp/planning/agent-storyboard.json proposal. Request: schemaVersion:1, baseConfigHash (storyboard context), sceneId, optional stable shotId, cause (capture-action, capture-timing, app-bug, claim, narration, caption, composition, encoding, asset), description, rationale. Actual app bug is stopped for authorized app repair or truthful revised claim. Cause is declared, not inferred root cause.

```sh
avp repair plan
avp repair apply --hash PLAN_HASH --confirm
avp build prepare --force
# Rehearse/review affected inputs as required, freeze, then production next/step.
avp release list
avp release verify --hash RELEASE_ID
avp release archive --confirm
```

The repair candidate must preserve scene order, features, unrelated story metadata, independent scene state and every unrelated current media/QA. Exact target change is evaluated with existing input fingerprints and transitive capture/voice/caption/preview dependencies. If shot capture recipe changes, recapture the whole target scene; independent shot recapture is not implemented. Voice changes may need new selected audio; no paid call is authorized by repair. Duration changes reassemble through existing measured scene offsets/global SRT. The plan hash binds config, source, existing Build lock, proposal, request and current state. Any change requires replan. No natural-language interpretation is implemented in the framework; the agent authors structured inputs.

Apply snapshots target scene (including quality sidecars), archives current approved final when valid, writes recovery checkpoint containing prior config, clears target QA/approval, then applies validated proposal. Existing Build locks fail on new config. No other scene is unlocked. If interrupted, inspect .avp/repair/<planHash>.json and snapshot, restore canonical config deliberately and re-run gates; do not restore approvals automatically. Local repair lock is not a global workspace lock. Snapshot restore failures invalidate QA and retain verified pre-restore backup. No full transaction or concurrent legacy CLI safety claimed. Archive up to 20 releases with content-addressed manifest and verified file copies. Review-mode release requires exact current final approval; autonomous release records technical pass only. This is local integrity, not filesystem immutability or offsite backup.

Use semantic context --scene ID to obtain exact preview/QA hash and claim, narration, frame candidates. External reviewer inspects actual video/audio and writes .avp/repair/semantic-review.json with schemaVersion:1, reviewHash, reviewer OPERATOR or EXTERNAL_AGENT, findings for all listed dimensions (PASS/FAIL/NOT_EVALUATED). semantic record --scene ID --hash HASH --confirm persists declared findings. Stale review cannot be recorded for changed preview. Advisory only; does not independently judge truth or change existing approval gates. Never infer semantic pass from technical QA.

Evidence timeline now permits bounded speed-up within explicit recorded pause interiors, not inferred loading/network waits; continuous ordered source coverage and normal-speed actions are still required. Approximate markers do not prove frame-perfect visible evidence. No general cut/splice of missing footage or true crossfade system yet.

CI exercises actual dashboard/canvas production, targeted composition plan/apply, archived final byte preservation, quality sidecars, unchanged scene/media hashes, rejected stale semantic review, and pure explicit-pause coverage tests. All remaining C1/C2/C3 criteria remain open until individually verified.
