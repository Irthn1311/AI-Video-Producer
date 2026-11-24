# Managed app lifecycle (F-05c)

Existing externally started apps remain supported. Opt-in managed Node fixtures use a direct source entrypoint, not a shell command or npm script. Configure project.json:

```json
"appUrl": "http://127.0.0.1:4173",
"appRuntime": {
  "mode": "managed-node",
  "entrypoint": "server.mjs",
  "readinessPath": "/health",
  "startupTimeoutMs": 10000,
  "reset": "fresh-process",
  "isolation": "operator-approved-disposable-local-fixture"
}
```

The entrypoint is relative to sourcePath, must be a scanned regular Node source file, and must honor HOST=127.0.0.1 and PORT. Use only an independently reviewed, disposable app with ephemeral process-local state. No real credentials, persistent database, payment, background workers, or production services. AVP does not install dependencies or execute discovered scripts automatically. No shell or inherited provider environment variables are passed to the child. This is not an OS sandbox; reviewed code can still access local files/network and spawn descendants. The source scan excludes dependencies and some files, so approval is not a full supply-chain attestation.

1. Inspect launch candidates with avp analyze, review code and choose an entrypoint.
2. Run avp app status, review the exact manifest hash, then avp app approve --hash HASH --confirm.
3. Run avp app trial --allow-launch. The direct child starts only if the local port is free, returns a successful HTTP readiness response without redirects, and exits after cleanup. Review/trial invalidates on scanned source, manifest, Node version or lifecycle engine drift.
4. Prepare Build after the trial. Adapter trial, Build rehearsal and capture require --allow-launch and --allow-actions for managed apps. Each starts a fresh direct child, checks readiness, runs the operation, and terminates the child in finally. Production step accepts both flags; legacy capture/run obey the same managed launch boundary.
5. Session logs in .avp/app-runtime/sessions contain bounded metadata, not child stdout/stderr. A local lock prevents concurrent managed sessions. Occupied port fails closed; AVP never kills unrelated processes. A failed cleanup retains the lock for manual inspection. Crash/SIGKILL can leave a child alive; manually inspect PID, port and session before clearing the lock. No automatic descendant termination or crash recovery is claimed.
6. Fresh process is not a database reset. Browser contexts are fresh, but filesystem, database, network and descendant effects are not reset or sandboxed. App readiness does not prove feature behavior. Actual rehearsal and capture assertions remain mandatory. Managed app launch does not grant paid API access.

Use an external authorized test environment for other runtimes or stateful/authenticated applications until their project-specific setup/reset is independently verified. Do not represent this slice as universal app startup.
