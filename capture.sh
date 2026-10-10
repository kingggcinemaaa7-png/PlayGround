#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the running app.
# Env: CAPTURE_URL (exact preview URL), CAPTURE_DIR (output dir, outside source).
# Exit 75 = transient navigation/browser infrastructure failure.
# Exit 1  = script usage error or rendering defect. The app server is left running.
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_ROOT="$(/usr/bin/time -p pwd)"

/usr/bin/time -p test -n "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL.}"
/usr/bin/time -p test -n "${CAPTURE_DIR:?Set CAPTURE_DIR to the screenshot output directory.}"
CAPTURE_DIR="${CAPTURE_DIR%/}"
export CAPTURE_URL CAPTURE_DIR

# Keep capture evidence outside the project source tree.
/usr/bin/time -p test "$CAPTURE_DIR" != "$PROJECT_ROOT"
case "$CAPTURE_DIR" in
  "$PROJECT_ROOT"/*) echo "CAPTURE_DIR must stay outside the project source." >&2; exit 1;;
esac

# Project default: dismiss the concert start gate so WebGL renders (overridable).
export CAPTURE_START_SELECTOR="${CAPTURE_START_SELECTOR:-#startBtn}"
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

STATUS=0
/usr/bin/time -p node "${RUNTIME_DIR:?Set RUNTIME_DIR to the runtime directory.}/scripts/default-capture.mjs" || STATUS=$?
if /usr/bin/time -p test "$STATUS" -ne 0; then
  exit "$STATUS"
fi

# Rendering defect if the expected captures are missing despite exit 0.
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
/usr/bin/time -p ls -la "$CAPTURE_DIR"
exit 0
