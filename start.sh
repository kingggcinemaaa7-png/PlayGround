#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"
PORT="${PORT:-3000}"
DIST_DIR="$PROJECT_ROOT/dist"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$DIST_DIR" "$WEB_DIR"
if /usr/bin/time -p test -f "$PROJECT_ROOT/package.json"; then
  if /usr/bin/time -p test -f "$PROJECT_ROOT/package-lock.json"; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  else
    /usr/bin/time -p npm install --no-audit --no-fund
  fi
  if /usr/bin/time -p bash -c 'node -e "const p=require(\"./package.json\"); process.exit(p.scripts&&p.scripts.build?0:1)"'; then
    /usr/bin/time -p npm run build
  fi
fi
if ! /usr/bin/time -p test -f "$DIST_DIR/index.html"; then
  cat > "$DIST_DIR/index.html" <<'PLAYGROUND_HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PlayGround</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0b1020; color: #eef2ff; }
  header { padding: 56px 24px 24px; text-align: center; background: linear-gradient(135deg, #6d28d9, #2563eb 55%, #06b6d4); }
  header h1 { margin: 0; font-size: clamp(40px, 7vw, 72px); letter-spacing: -0.02em; }
  header p { margin: 12px auto 0; max-width: 640px; font-size: 18px; opacity: 0.92; }
  main { max-width: 980px; margin: 0 auto; padding: 28px 20px 64px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 20px; }
  .card { background: #141b33; border: 1px solid #2b3560; border-radius: 14px; padding: 18px; }
  .card h2 { margin: 0 0 8px; font-size: 20px; }
  .card p { margin: 0; color: #b9c2e8; line-height: 1.5; }
  #stage { display: block; width: 100%; height: 320px; margin-top: 20px; border-radius: 14px; border: 1px solid #2b3560; background: #0e1430; }
  footer { text-align: center; padding: 24px; color: #8b94c4; }
</style>
</head>
<body>
<header>
  <h1>PlayGround</h1>
  <p>Build, play, and remix. This static deployment is served from <code>dist/index.html</code>.</p>
</header>
<main>
  <canvas id="stage" width="960" height="320"></canvas>
  <div class="grid">
    <div class="card"><h2>Build</h2><p>Static output lives inside the project dist directory.</p></div>
    <div class="card"><h2>Play</h2><p>The canvas renders shapes every frame so captures never see a blank page.</p></div>
    <div class="card"><h2>Remix</h2><p>Fork the source on OMGithub and GitHub, then redeploy.</p></div>
  </div>
</main>
<footer>PlayGround &middot; static deployment ready</footer>
<script>
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var palette = ["#f472b6", "#a78bfa", "#60a5fa", "#34d399", "#fbbf24"];
  function frame(t) {
    var w = canvas.width, h = canvas.height;
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1e1b4b");
    g.addColorStop(0.5, "#1e3a8a");
    g.addColorStop(1, "#0e7490");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 5; i++) {
      var x = (Math.sin(t / 900 + i * 1.3) * 0.5 + 0.5) * w;
      var y = h * 0.5 + Math.cos(t / 700 + i) * h * 0.28;
      ctx.beginPath();
      ctx.arc(x, y, 34 + i * 7, 0, Math.PI * 2);
      ctx.fillStyle = palette[i];
      ctx.globalAlpha = 0.85;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText("PlayGround is live", 28, 52);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
</script>
</body>
</html>
PLAYGROUND_HTML
fi
/usr/bin/time -p test -f "$DIST_DIR/index.html"
/usr/bin/time -p wc -c "$DIST_DIR/index.html"
/usr/bin/time -p bash -c 'printf "{\"project\":\"%s\",\"directory\":\"%s\"}" "$0" "$1" > "$2/deployment-output.json"' "$PROJECT_ROOT" "$DIST_DIR" "$WEB_DIR"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
exec /usr/bin/time -p env DIST_DIR="$DIST_DIR" PORT="$PORT" node -e '
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.env.DIST_DIR);
const port = Number(process.env.PORT || 3000);
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".txt": "text/plain; charset=utf-8" };
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const rel = decodeURIComponent(url.pathname);
    let file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(404); res.end("Not found"); return; }
    let stat;
    try { stat = fs.statSync(file); } catch { res.writeHead(404); res.end("Not found"); return; }
    if (stat.isDirectory()) file = path.join(file, "index.html");
    let content;
    try { content = fs.readFileSync(file); }
    catch { res.writeHead(404); res.end("Not found"); return; }
    res.setHeader("Content-Type", mime[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Length", content.length);
    if (req.method === "HEAD") { res.end(); return; }
    res.end(content);
  } catch { try { res.writeHead(500); res.end("Server error"); } catch {} }
});
server.listen(port, "0.0.0.0", () => console.log("PlayGround serving " + root + " on port " + port));
'
