// Minimal static file server for deployment (no dependencies).
// Usage: node scripts/serve-static.mjs <directory>   (PORT env, default 3000)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const root = resolve(process.argv[2] ?? process.cwd());
const port = Number(process.env.PORT ?? 3000);
if (!existsSync(join(root, 'index.html'))) {
  console.error(`serve-static: no index.html in ${root}`);
  process.exit(1);
}
const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};
const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + '/')) { res.writeHead(404); res.end('Not found'); return; }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) path = join(root, 'index.html'); // SPA fallback
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
server.listen(port, '0.0.0.0', () => console.log(`serve-static: serving ${root} on :${port}`));
