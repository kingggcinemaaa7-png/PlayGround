#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the deployed app.
# Env: CAPTURE_URL (exact URL to open), CAPTURE_DIR (output dir, outside source).
# Exit 75 = temporary navigation/browser infrastructure failure.
# Exit  1 = script usage error or rendering defect.
set -euo pipefail
cd "$(dirname "$0")"
CAPTURE_URL="${CAPTURE_URL:?CAPTURE_URL environment variable is required}"
CAPTURE_DIR="${CAPTURE_DIR:?CAPTURE_DIR environment variable is required}"
DESK="$CAPTURE_DIR/final-desktop.png"
MOB="$CAPTURE_DIR/final-mobile.png"

fail_temp() { echo "capture: temporary infrastructure failure: $*" >&2; exit 75; }
fail_perm() { echo "capture: defect: $*" >&2; exit 1; }

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

cleanup() {
  /usr/bin/time -p playwright-cli -s tac-cap-desktop close >/dev/null 2>&1 || true;
  /usr/bin/time -p playwright-cli -s tac-cap-mobile close >/dev/null 2>&1 || true;
}
trap cleanup EXIT

# The URL itself must answer HTTP first; otherwise this is infra, not the app.
if ! /usr/bin/time -p curl --fail --silent --location --max-time 20 -o /dev/null "$CAPTURE_URL"; then
  fail_temp "CAPTURE_URL did not answer HTTP: $CAPTURE_URL"
fi

# Wait until the app has rendered (a <canvas> exists). Returns 0 on success,
# 75 if the browser/eval channel breaks, 1 on timeout (rendering defect).
wait_render() {
  local session="$1" i out n rc
  for i in $(/usr/bin/time -p seq 1 30); do
    out=$(/usr/bin/time -p playwright-cli -s "$session" eval "() => document.querySelectorAll('canvas').length" 2>/dev/null) || rc=$?
    rc=${rc:-0}
    if [ "$rc" -ne 0 ]; then return 75; fi
    n=$(/usr/bin/time -p printf '%s' "$out" | grep -oE '[0-9]+' | head -n 1)
    if [ -n "${n:-}" ] && [ "$n" -gt 0 ]; then
      echo "capture: [$session] rendered with $n canvas element(s)"
      return 0
    fi
    /usr/bin/time -p sleep 2
  done
  return 1
}

/usr/bin/time -p playwright-cli -s tac-cap-desktop open "$CAPTURE_URL" || fail_temp "desktop browser open failed"
wait_render tac-cap-desktop || exit "$?"
/usr/bin/time -p playwright-cli -s tac-cap-desktop resize 1366 900 || fail_temp "desktop resize failed"
/usr/bin/time -p sleep 2
/usr/bin/time -p playwright-cli -s tac-cap-desktop screenshot --filename "$DESK" || fail_temp "desktop screenshot failed"
/usr/bin/time -p playwright-cli -s tac-cap-desktop close || fail_temp "desktop browser close failed"

/usr/bin/time -p playwright-cli -s tac-cap-mobile open --mobile "$CAPTURE_URL" || fail_temp "mobile browser open failed"
wait_render tac-cap-mobile || exit "$?"
/usr/bin/time -p sleep 2
/usr/bin/time -p playwright-cli -s tac-cap-mobile screenshot --filename "$MOB" || fail_temp "mobile screenshot failed"
/usr/bin/time -p playwright-cli -s tac-cap-mobile close || fail_temp "mobile browser close failed"

/usr/bin/time -p test -s "$DESK" || fail_perm "desktop screenshot missing or empty: $DESK"
/usr/bin/time -p test -s "$MOB" || fail_perm "mobile screenshot missing or empty: $MOB"
echo "capture: wrote $DESK and $MOB"
