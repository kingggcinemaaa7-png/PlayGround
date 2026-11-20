#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

/usr/bin/time -p npm install

DIST_DIR="$PROJECT_DIR/dist"
mkdir -p "$DIST_DIR"
/usr/bin/time -p rm -rf "$DIST_DIR"
/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p cp -a public/. "$DIST_DIR/"

mkdir -p /home/runner/work/_temp/omgithub-web
printf '{"project":"%s","directory":"%s"}' "$PROJECT_DIR" "$DIST_DIR" > /home/runner/work/_temp/omgithub-web/deployment-output.json

PORT="${PORT:-3000}"
export PORT

exec /usr/bin/time -p node server.js
