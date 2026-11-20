#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

: "${CAPTURE_URL:?Set CAPTURE_URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR}"

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

RUNTIME_CAPTURE="/home/runner/work/_temp/omgithub-runtime/scripts/default-capture.mjs"
if [[ -f "$RUNTIME_CAPTURE" ]]; then
  set +e
  /usr/bin/time -p env CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR="$CAPTURE_DIR" CAPTURE_STRICT="${CAPTURE_STRICT:-1}" node "$RUNTIME_CAPTURE"
  status=$?
  set -e
else
  echo "Capture infrastructure unavailable: $RUNTIME_CAPTURE" >&2
  status=75
fi

if [[ $status -ne 0 ]]; then
  exit "$status"
fi

for image in "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"; do
  if [[ ! -s "$image" ]]; then
    echo "Rendering defect: missing or empty screenshot $image" >&2
    exit 1
  fi
done

exit 0
