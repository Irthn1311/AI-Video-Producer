#!/usr/bin/env bash
set -euo pipefail
umask 077
stage=intake
backend_pid=
frontend_pid=
cleanup() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    # Only stage/exit code, not raw logs, URLs, credentials, attempt or stroke IDs.
    printf '{"status":"BLOCKED","stage":"%s","exitCode":%s,"scope":"UPSTREAM_LIVE_INK_E2E_NOT_AVP_PRODUCTION"}\n' "$stage" "$status" > /work/public/result.json
    cat /work/public/result.json
  fi
  for pid in "$frontend_pid" "$backend_pid"; do
    if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  done
  exit "$status"
}
trap cleanup EXIT
# Network namespace is shared only with the disposable PostgreSQL container.
# Runtime egress is blocked: only the loopback interface may exist.
python - <<'PY'
import pathlib
assert sorted(p.name for p in pathlib.Path('/sys/class/net').iterdir()) == ['lo'], 'Runtime must have only loopback'
PY
cp -a /target/backend/. /work/backend/
cp -a /target/frontend/. /work/frontend/
# Refuse real runtime env files. Only synthetic local test configuration is permitted.
if find /work/backend /work/frontend -maxdepth 1 -type f \( -name '.env' -o -name '.env.local' -o -name '.env.production' -o -name '.env.development' -o -name '.env.development.local' \) | grep -q .; then
  exit 11
fi
export LIVE_QA_DATABASE_URL='postgresql+psycopg://avp_qa:avp_disposable_only@127.0.0.1:5432/avp_mathmate_qa'
export LIVE_QA_ARTIFACT_DIR=/work/private
export LIVE_QA_FRONTEND_ORIGIN=http://127.0.0.1:3050
export LIVE_QA_BIND_HOST=127.0.0.1
export MATH_OCR_PROVIDER=disabled
export AI_PROVIDER=mock
export APP_ENV=test
export API_BASE_URL=http://127.0.0.1:8050
export MATH_INK_WS_ORIGIN=ws://127.0.0.1:8050
export AUTH_SESSION_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export SESSION_COOKIE_SECURE=false
export COACH_LAN_MODE=0
export E2E_BASE_URL=http://127.0.0.1:3050
export LIVE_QA_SESSION_FILE=/work/private/qa-session.json
export CI=1
stage=backend
(cd /work/backend && exec python -m tests.math_solutions.live_sync_harness) > /work/private/backend.log 2>&1 &
backend_pid=$!
stage=frontend
(cd /work/frontend && exec node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3050) > /work/private/frontend.log 2>&1 &
frontend_pid=$!
stage=readiness
python - <<'PY'
import socket, time, pathlib, urllib.request
deadline=time.monotonic()+240
while time.monotonic()<deadline:
    try:
        if not pathlib.Path('/work/private/qa-session.json').is_file():
            raise OSError('Harness session not created')
        with socket.create_connection(('127.0.0.1',8050),timeout=2): pass
        with urllib.request.urlopen('http://127.0.0.1:3050/login',timeout=20) as response:
            if response.status==200: break
    except Exception:
        time.sleep(2)
else: raise SystemExit(12)
PY
stage=browser
cd /work/frontend
# Run unchanged upstream spec with a local config that disables traces, recordings and failure screenshots.
# The spec itself writes synthetic screenshots and raw receipt to private storage.
cat > .avp-live-ink.config.mjs <<'EOF'
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'live-ink.spec.ts',workers:1,retries:0,timeout:200000,
  outputDir:'/work/private/test-results',reporter:[['json',{outputFile:'/work/private/playwright.json'}]],
  use:{browserName:'chromium',headless:true,baseURL:'http://127.0.0.1:3050',trace:'off',video:'off',screenshot:'off'}});
EOF
node node_modules/@playwright/test/cli.js test --config .avp-live-ink.config.mjs > /work/private/browser.log 2>&1
stage=receipt
python - <<'PY'
import json, pathlib
p=pathlib.Path('/work/private')
report=json.loads((p/'playwright.json').read_text())
stats=report['stats']
assert stats['expected']==1 and stats['unexpected']==0 and stats['skipped']==0 and stats['flaky']==0
r=json.loads((p/'browser-acceptance.json').read_text())
fields=['streamBeforePointerup','twoWay','concurrent','offlineReconnect','persistedAfterReload','eraseUndo','clearUndo','pageNavigation','legacyAutosaveAfterDisconnect']
assert r['status']=='PASS' and r['source']=='BROWSER_POINTER_REPLAY'
assert all(r.get(k) is True for k in fields)
assert len(r['strokes'])==6 and len({s['id'] for s in r['strokes']})==6
assert r['pairingQr']=='UI_ONLY_LAN_UNVERIFIED'
out={'schemaVersion':1,'status':'UPSTREAM_BROWSER_E2E_PASS','sourceRevision':'6d9bb4c070d0e724704bb4bd3758e113a208b87f',
     'scope':'REAL_UPSTREAM_APP_TWO_CONTEXT_TEST_NOT_AVP_PRODUCTION',
     'expectedTests':stats['expected'],'unexpectedTests':stats['unexpected'],'skippedTests':stats['skipped'],
     'verifiedStrokeCount':len(r['strokes']),'checks':{k:r[k] for k in fields},
     'pairingQr':'UI_ONLY_LAN_UNVERIFIED','actualQrPairing':'NOT_EVALUATED','actualOCR':'NOT_EVALUATED',
     'actualAiFeedback':'NOT_EVALUATED','avpCapture':'NOT_EVALUATED','providerCalls':'DISABLED_BY_POLICY_AND_NO_EGRESS'}
(pathlib.Path('/work/public')/'result.json').write_text(json.dumps(out,indent=2)+'\n')
print('AVP_MATHMATE_RUNTIME '+json.dumps(out))
PY
