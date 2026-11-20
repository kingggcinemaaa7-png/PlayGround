#!/usr/bin/env bash
# Development / preview launcher. Installs deps, syncs the Three.js vendor
# bundle and runs the Express + Socket.IO server in the foreground on $PORT.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
export PORT

if [[ ! -d node_modules/three ]]; then
  npm install --no-audit --no-fund
fi
node scripts/sync-vendor.mjs >/dev/null

if [[ -n "${OPENCODE_WEB_DIR:-}" ]]; then
  node -e 'const fs=require("fs"),p=require("path");fs.writeFileSync(p.join(process.env.OPENCODE_WEB_DIR,"deployment-output.json"),JSON.stringify({project:process.cwd(),directory:p.join(process.cwd(),"public")}))'
fi

exec node server.js
