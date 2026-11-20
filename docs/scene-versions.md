# Versioned scene snapshots and explicit rollback

AVP can now make **local content-verified snapshots** of a scene's current media, caption metadata, capture report, QA report and optional named secondary footage. A snapshot preserves enough material to recover an earlier revision without automatically calling Playwright, Gemini or Remotion again.

This is a **manual snapshot/restore workflow**, not yet automatic snapshot-before-every-stage or cloud artifact storage. The editing/capture pipeline remains unchanged unless the user chooses these commands.

## Commands

```bash
# Run after a good preview or before trying a risky scene revision:
node bin/avp.mjs snapshot --project ./demo --scene scene-01-intro --label "good version"

# List available versions and content sizes:
node bin/avp.mjs versions --project ./demo --scene scene-01-intro

# Unlock a locked scene explicitly, then restore:
node bin/avp.mjs unlock --project ./demo --scene scene-01-intro
node bin/avp.mjs restore --project ./demo --scene scene-01-intro --version v0001 --confirm

# Re-check the scene and request approval:
node bin/avp.mjs status --project ./demo
node bin/avp.mjs evidence --project ./demo
node bin/avp.mjs qa --project ./demo --scene scene-01-intro
node bin/avp.mjs approve --project ./demo --stage scene --scene scene-01-intro
```

Snapshots are stored at `.avp/scenes/<scene-id>/snapshots/v0001/`, including `manifest.json`, checksums and the actual media files. They remain local and under AVP's existing `.gitignore`. Do not automatically upload this directory; product screenshots or recordings may contain private data.

## Safety and recovery behavior

- Snapshot works even for a locked/approved scene and **does not** change its approval or the final output.
- Restore requires a previously unlocked scene **and** explicit CLI `--confirm`; it verifies the selected snapshot's file hashes **before** touching active media.
- Before replacing active media, restore creates a new `pre-restore` snapshot so the previous working revision is recoverable. A maximum of **20 snapshots per scene** bounds disk usage; AVP refuses to silently overwrite/delete older versions.
- Restoring media always deletes current `qa-report.json`, clears scene approval/lock/QA state, and invalidates final output review. An older snapshot's passing QA file is never automatically trusted.
- Restored artifact state includes original input fingerprints. If the app code, narration, capture settings, source URL, voice or caption parameters changed, `staleParts` flags the affected stages; recapture or regenerate as required. **No automatic bypass of current evidence/Quality gates.**
- Backups include footage, audio, caption JSON/SRT, reports, edit plan, named secondary footage and evidence screenshots, but not temporary raw Chromium recordings or the user's complete source repo.
- A snapshot is verified by local SHA-256 digests. This catches accidental corruption but **does not provide cryptographic trust against malicious processes with write access to the entire AVP workspace**.
- Restore stages media before replacement. Disk failures or process interruption can still require manually restoring the automatically created pre-restore backup: this is not a transactional database.

## Limits / future work

Only explicit `snapshot` and `restore` are implemented in this release. Future work: bounded automatic snapshots before replacing each stage, safe pruning/export of older revisions, a scene-dependency graph to avoid source-wide invalidation, and optional artifact storage. All should reuse the same manifest contract.
