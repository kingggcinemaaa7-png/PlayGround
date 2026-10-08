#!/usr/bin/env bash
# Taç Savaşı — one-command start (macOS/Linux)
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "[ERROR] Node.js 22+ required"; exit 1; }
npm install
mkdir -p client/public
cp config.json client/public/config.json
npm run build
(npx tsx server/src/index.ts mock storm &)
npm run dev --workspace=client
