#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
RUNTIME_DIR="${RUNTIME_DIR:-/home/runner/work/_temp/omgithub-runtime}"
if ! /usr/bin/time -p test -n "${CAPTURE_URL:-}"; then
  echo "capture.sh: CAPTURE_URL is not set." >&2
  exit 1
fi
if ! /usr/bin/time -p test -n "${CAPTURE_DIR:-}"; then
  echo "capture.sh: CAPTURE_DIR is not set." >&2
  exit 1
fi
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
if ! /usr/bin/time -p test -f "$RUNTIME_DIR/scripts/default-capture.mjs"; then
  echo "capture.sh: runtime capture script not found at $RUNTIME_DIR/scripts/default-capture.mjs." >&2
  exit 1
fi
set +e
/usr/bin/time -p env CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR="$CAPTURE_DIR" node "$RUNTIME_DIR/scripts/default-capture.mjs"
status=$?
set -e
if /usr/bin/time -p test "$status" -ne 0; then
  exit "$status"
fi
if ! /usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"; then
  echo "capture.sh: final-desktop.png was not rendered." >&2
  exit 1
fi
if ! /usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"; then
  echo "capture.sh: final-mobile.png was not rendered." >&2
  exit 1
fi
/usr/bin/time -p ls -la "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"
