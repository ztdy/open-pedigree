#!/usr/bin/env bash
# Runs the full desktop test suite. Node unit tests need no display; Electron
# scenario tests need one (WSL: DISPLAY=:0, CI: xvfb-run).
set -u
cd "$(dirname "$0")"

ELECTRON=./node_modules/.bin/electron
DISPLAY="${DISPLAY:-:0}"
export DISPLAY
fail=0

run() { echo "===== $1 ====="; shift; "$@"; [ $? -ne 0 ] && fail=1; echo; }

echo "##### unit (pure Node) #####"
node test-documentstore.js || fail=1
echo
node test-library-management.js || fail=1
echo
node test-i18n.js || fail=1
echo

echo "##### scenario (Electron) #####"
for t in smoke.js test-s1-roundtrip.js test-s4-dirty-close.js test-s2-library.js test-s2b-statemachine.js test-s3-import.js test-proband-clear.js test/opdata-protocol.test.js test-disorders-offline.js test-i18n-library.js test-i18n-editor-sync.js test-library-xss.js; do
  echo "----- $t -----"
  timeout 150 "$ELECTRON" "$t" 2>/dev/null | grep -E "PASS|FAIL|===="
  # propagate failure from the electron exit code
  ec=${PIPESTATUS[0]}
  [ "$ec" -ne 0 ] && { echo "  ($t exit $ec)"; fail=1; }
  echo
done

if [ "$fail" -eq 0 ]; then echo "ALL SUITES PASSED"; else echo "SOME SUITES FAILED"; fi
exit $fail
