#!/usr/bin/env bash
# NEON PULSE launcher: install deps, build when needed, serve ./dist in foreground.
# App source and built output stay inside PROJECT_DIR.
# $OPENCODE_WEB_DIR (default: worker web dir) holds only deployment metadata.
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_ROOT="$(/usr/bin/time -p pwd)"
PORT="${PORT:-3000}"
export PORT
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DIST="$PROJECT_ROOT/dist"

/usr/bin/time -p test -f "$PROJECT_ROOT/package.json"
/usr/bin/time -p test -n "$PORT"
/usr/bin/time -p mkdir -p "$WEB_DIR"

# Install dependencies when vite is not present; skip otherwise.
/usr/bin/time -p test -d "$PROJECT_ROOT/node_modules/vite" || /usr/bin/time -p npm install --no-audit --no-fund

# Build when needed: dist missing/stale relative to sources.
/usr/bin/time -p test -f "$DIST/index.html" || NEEDS_BUILD=1
NEEDS_BUILD="${NEEDS_BUILD:-0}"
if /usr/bin/time -p test "$NEEDS_BUILD" -eq 0; then
  if /usr/bin/time -p test -n "$(find "$PROJECT_ROOT/src" "$PROJECT_ROOT/index.html" "$PROJECT_ROOT/package.json" "$PROJECT_ROOT/vite.config.ts" -newer "$DIST/index.html" -print -quit 2>/dev/null)"; then
    NEEDS_BUILD=1
  fi
fi
if /usr/bin/time -p test "$NEEDS_BUILD" -eq 1; then
  /usr/bin/time -p npm run build
fi
/usr/bin/time -p test -f "$DIST/index.html"

# Publish deployment metadata for the controller/tunnel.
/usr/bin/time -p /usr/bin/printf '{"project":"%s","directory":"%s"}' "$PROJECT_ROOT" "$DIST" > "$WEB_DIR/deployment-output.json"
/usr/bin/time -p test -s "$WEB_DIR/deployment-output.json"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"

# Serve the built directory in the foreground on PORT.
/usr/bin/time -p env SERVE_DIR="$DIST" node -e '
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.SERVE_DIR;
const port = Number(process.env.PORT || 3000);
const mime = {".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".wasm":"application/wasm",".glb":"model/gltf-binary"};
http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let p = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (p !== root && !p.startsWith(root + "/")) { res.writeHead(404); res.end("Not found"); return; }
    if (fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    res.setHeader("Content-Type", mime[path.extname(p)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(fs.readFileSync(p));
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, "0.0.0.0", () => console.log("serving " + root + " on :" + port));
'
