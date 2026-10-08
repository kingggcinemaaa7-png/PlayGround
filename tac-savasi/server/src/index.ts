// Bridge server: TikTok adapter (or mock) -> normalized WS broadcast (:8081).
// Auto-reconnect with backoff; game keeps running on loss. Hot-reload config.
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { TikTokAdapter } from './adapter.js';
import { Registry } from './registry.js';
import { openDb } from './db.js';
import { scenario } from './mock.js';
import type { LiveEvent } from '@tac/shared';

const PORT = Number(process.env.PORT ?? 8081);
const wss = new WebSocketServer({ port: PORT });
const reg = new Registry(60);
const db = openDb(process.env.DB ?? 'data/tac.db');
let cfg = JSON.parse(fs.readFileSync(process.env.CONFIG ?? '../config.json', 'utf8'));
try {
  fs.watch(process.env.CONFIG ?? '../config.json', () => {
    try { cfg = JSON.parse(fs.readFileSync(process.env.CONFIG ?? '../config.json', 'utf8')); console.log('[bridge] config reloaded'); }
    catch { /* keep old */ }
  });
} catch { /* noop */ }

function broadcast(obj: unknown) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}
const seen = new Set<string>();
function ingest(e: LiveEvent) {
  if (seen.has(e.id)) return; // ignore duplicated event ids
  seen.add(e.id);
  if (seen.size > 30000) { const [f] = seen; seen.delete(f); }
  reg.ensure(e);
  broadcast({ kind: 'live', event: e, maxFighters: reg.maxFighters });
  if (e.type === 'gift') {
    const v = reg.viewers.get(e.userId);
    if (v) { v.gifts += 1; v.diamonds += e.diamonds ?? 0; }
  }
}

async function runTikTok(username: string) {
  const a = new TikTokAdapter();
  a.onEvent(ingest);
  let backoff = 2000;
  while (true) {
    try {
      console.log(`[bridge] connecting @${username} ...`);
      await a.connect(username);
      backoff = 2000;
      broadcast({ kind: 'status', connected: true });
      // hold until disconnect: poll
      while (a.connected) await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      console.warn('[bridge] connection failed, retry in', backoff, String(err).slice(0, 200));
      broadcast({ kind: 'status', connected: false });
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

async function runMock(name: string, viewers: number) {
  console.log(`[bridge] mock scenario=${name} viewers=${viewers}`);
  for await (const e of scenario(name, viewers)) ingest(e);
  console.log('[bridge] mock scenario done; staying alive for WS clients');
}

const mode = process.argv[2] ?? process.env.MODE ?? 'mock';
const username = mode === 'live' ? (process.argv[3] ?? process.env.TIKTOK_USERNAME ?? '') : '';
const mockName = mode === 'live' ? 'default' : (process.argv[3] ?? process.env.MOCK ?? 'default');
const viewers = Number(process.env.VIEWERS ?? 60);
console.log(`[bridge] ws://localhost:${PORT} mode=${mode}`);
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    kind: 'hello',
    viewers: [...reg.viewers.values()].slice(0, 200),
    ranking: db.topByDamage(10),
    config: cfg,
  }));
  ws.on('message', (buf) => {
    try {
      const m = JSON.parse(String(buf));
      if (m?.kind === 'deleteMe') reg.deleteUser(m.userId);
    } catch { /* ignore */ }
  });
});

// CLI: `npm run mock -- storm` runs one-shot generator to stdout (for tests)
if (process.env.MOCK_STDOUT === '1') {
  for await (const e of scenario(mode === 'mock' ? mockName : mode, viewers)) console.log(JSON.stringify(e));
  process.exit(0);
}
if (mode === 'live' && username) runTikTok(username);
else runMock(mockName, viewers);
