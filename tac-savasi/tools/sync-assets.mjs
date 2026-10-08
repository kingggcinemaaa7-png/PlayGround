// Copies the streamer's asset folder into the client so Vite serves it.
// Source of truth: tac-savasi/assets/  ->  client/public/assets/
// Runs automatically before dev/build (see client/package.json + start scripts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'assets');
const dest = path.join(root, 'client', 'public', 'assets');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyDir(a, b);
    else { fs.copyFileSync(a, b); n++; }
  }
  return n;
}

if (!fs.existsSync(src)) {
  console.log('[assets] assets/ yok, atlanıyor');
  process.exit(0);
}
const total = copyDir(src, dest);

// Same extension tolerance the client loader has: a .wav/.mp3 counts for a
// manifest entry written as .ogg (you should not have to rename anything).
const CANDIDATES = ['.ogg', '.wav', '.mp3', '.m4a'];
const missing = [];
const found = [];
const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'assets.manifest.json'), 'utf8'));
const entries = [...(manifest.sprites ?? []), ...(manifest.audio ?? []), ...(manifest.fonts ?? [])];
for (const rel of entries) {
  const stem = rel.replace(/\.[^./]+$/, '');
  const ext = /\.[^./]+$/.exec(rel)?.[0] ?? '';
  const alt = [rel, ...CANDIDATES.filter((e) => e !== ext).map((e) => `${stem}${e}`)];
  const hit = alt.find((p) => fs.existsSync(path.join(dest, p)));
  if (hit !== undefined) found.push(rel); else missing.push(rel);
}

const musicFound = found.filter((f) => f.startsWith('audio/music'));
const voiceFound = found.filter((f) => f.startsWith('audio/announcer'));

console.log(`[assets] ${total} dosya client/public/assets/ içine kopyalandı`);
console.log(`[assets] manifest: ${found.length}/${entries.length} hazır` +
  (missing.length ? ` · eksik: ${missing.length} (ör. ${missing.slice(0, 3).join(', ')})` : ' · tamam'));
console.log(`[assets] müzik: ${musicFound.length}/2 · spiker: ${voiceFound.length}/18`);
