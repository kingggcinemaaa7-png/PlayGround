#!/usr/bin/env bash
# Kapadokya Beat Vadisi — önizleme sunucusu.
# dist/ içine statik derleme üretir, deployment-output.json yazar, PORT'ta (varsayılan 3000) foreground servis eder.
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_DIR="$PWD"
DIST="$PROJECT_DIR/dist"
PORT="${PORT:-3000}"
export PORT
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"

/usr/bin/time -p mkdir -p "$DIST/game" "$DIST/admin" "$WEB_DIR"
/usr/bin/time -p cp preview/index.html "$DIST/index.html"
/usr/bin/time -p cp -r apps/game/public/. "$DIST/game/"
/usr/bin/time -p cp -r apps/admin/public/. "$DIST/admin/"
/usr/bin/time -p npm install --no-audit --no-fund
/usr/bin/time -p node -e 'const fs=require("node:fs");fs.writeFileSync(process.argv[1],JSON.stringify({project:process.argv[2],directory:process.argv[3]})+"\n")' "$WEB_DIR/deployment-output.json" "$PROJECT_DIR" "$DIST"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
/usr/bin/time -p node scripts/serve-dist.mjs "$DIST"
