#!/usr/bin/env bash
# Serve the built Taç Savaşı game (static) in the foreground.
# Writes deployment-output.json for the controller, then execs a static server.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$PWD"
/usr/bin/time -p test -n "${PROJECT_DIR:?}"
PORT="${PORT:-3000}"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
APP_SRC="$PROJECT_DIR/tac-savasi"
OUT_DIR="$APP_SRC/client/dist"

/usr/bin/time -p test -d "$APP_SRC"
/usr/bin/time -p test -f "$APP_SRC/package.json"

/usr/bin/time -p mkdir -p "$WEB_DIR"

# Install workspace dependencies once (skipped when present).
if /usr/bin/time -p test ! -d "$APP_SRC/node_modules"; then
  /usr/bin/time -p npm --prefix "$APP_SRC" install --no-audit --no-fund
fi

# Build only when the output is missing or sources are newer.
need_build=1
if /usr/bin/time -p test -f "$OUT_DIR/index.html"; then
  need_build=0
  if [ -n "$(/usr/bin/time -p find "$APP_SRC/shared/src" "$APP_SRC/server/src" "$APP_SRC/client/src" "$APP_SRC/config.json" "$APP_SRC/package.json" -newer "$OUT_DIR/index.html" 2>/dev/null | head -n 1)" ]; then
    need_build=1
  fi
fi
if [ "$need_build" = 1 ]; then
  /usr/bin/time -p npm --prefix "$APP_SRC" run build
fi
/usr/bin/time -p test -f "$OUT_DIR/index.html"
/usr/bin/time -p cp -f "$APP_SRC/config.json" "$OUT_DIR/config.json"

/usr/bin/time -p node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({project: process.argv[2], directory: process.argv[3]}))" \
  "$WEB_DIR/deployment-output.json" "$PROJECT_DIR" "$OUT_DIR"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
echo

# Foreground static server (controller owns the tmux session).
exec /usr/bin/time -p node "$PROJECT_DIR/scripts/serve-static.mjs" "$OUT_DIR"
