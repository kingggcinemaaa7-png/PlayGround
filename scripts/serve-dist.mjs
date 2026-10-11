// Statik dist sunucusu (foreground). Kullanım: node scripts/serve-dist.mjs [distDir]
// PORT env (varsayılan 3000), 0.0.0.0 dinler. Sadece statik dosya servis eder.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join, extname } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const port = Number(process.env.PORT || 3000);

if (!existsSync(join(root, "index.html"))) {
  console.error(`Static root missing index.html: ${root}`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + "/")) {
      res.writeHead(404); res.end("Not found"); return;
    }
    try {
      if (statSync(path).isDirectory()) path = join(path, "index.html");
    } catch { res.writeHead(404); res.end("Not found"); return; }
    res.setHeader("Content-Type", MIME[extname(path)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(readFileSync(path));
  } catch { res.writeHead(404); res.end("Not found"); }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[serve-dist] serving ${root} on http://0.0.0.0:${port}/`);
});
