// Profile pictures: download+cache (24h localStorage), circular crop, fallback initial.
import * as PIXI from 'pixi.js';

const mem = new Map<string, PIXI.Texture>();
const PALETTE = [0xef476f, 0xf78c2b, 0x06d6a0, 0x8a5cf6, 0x118ab2, 0xffd166];

export function colorFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export function initialOf(name: string): string {
  const g = [...(name ?? '?')];
  return (g[0] ?? '?').toLocaleUpperCase();
}

export function picTexture(userId: string, name: string, url: string | null): PIXI.Texture {
  void (async () => { await loadPic(userId, name, url); })();
  return mem.get(userId) ?? mem.get('fb:' + userId) ?? fallback(userId, name);
}

async function loadPic(userId: string, name: string, url: string | null): Promise<void> {
  const key = userId;
  if (mem.has(key)) return;
  if (!url) { fallback(userId, name); mem.set(key, mem.get('fb:' + userId)!); return; }
  try {
    const cached = localStorage.getItem('pic:' + userId);
    const now = Date.now();
    if (cached) {
      const { at, data } = JSON.parse(cached);
      if (now - at < 24 * 3600 * 1000 && data) {
        const t = await PIXI.Assets.load({ src: data, loadParser: 'loadTextures' }).catch(() => null) as PIXI.Texture | null;
        if (t) { mem.set(key, t); return; }
      }
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode().catch(() => { throw new Error('decode'); });
    // circular crop to 128
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.clip();
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
    const dataUrl = c.toDataURL();
    try { localStorage.setItem('pic:' + userId, JSON.stringify({ at: now, data: dataUrl })); } catch { /* quota */ }
    const tex = PIXI.Texture.from(dataUrl);
    mem.set(key, tex);
  } catch {
    const fb = fallback(userId, name);
    mem.set(key, fb);
  }
}

function fallback(userId: string, name: string): PIXI.Texture {
  if (mem.has('fb:' + userId)) return mem.get('fb:' + userId)!;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const col = '#' + colorFor(userId).toString(16).padStart(6, '0');
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, col); grad.addColorStop(1, '#0b2237');
  g.fillStyle = grad; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(initialOf(name), 64, 68);
  const tex = PIXI.Texture.from(c);
  mem.set('fb:' + userId, tex);
  return tex;
}
