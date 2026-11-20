#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR for capture evidence}"

mkdir -p "$CAPTURE_DIR"
export CAPTURE_URL CAPTURE_DIR

/usr/bin/time -p bash -n capture.sh
/usr/bin/time -p node "${RUNTIME_DIR:?}/scripts/default-capture.mjs"
