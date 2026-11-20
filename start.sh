#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd -P)"
PORT="${PORT:-3000}"
export PORT

/usr/bin/time -p npm install --no-audit --no-fund

DIST_DIR="$PROJECT_DIR/dist"
/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p rm -rf "$DIST_DIR"/*
/usr/bin/time -p cp -a public/. "$DIST_DIR"/

METADATA_DIR="${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must point to the worker metadata directory}"
/usr/bin/time -p mkdir -p "$METADATA_DIR"
/usr/bin/time -p python3 - "$METADATA_DIR/deployment-output.json" "$PROJECT_DIR" "$DIST_DIR" <<'PY'
import json, sys
out, project, directory = sys.argv[1:]
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'project': project, 'directory': directory}, f)
PY

exec /usr/bin/time -p node server.js
