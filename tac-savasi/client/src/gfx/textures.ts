// Procedural texture factory — every sprite is drawn on canvas at boot.
// Original art only; each texture is cached and reusable (atlas-style).
import * as PIXI from 'pixi.js';

const cache = new Map<string, PIXI.Texture>();
const SS = 2; // supersample factor for crisp scaling

export function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): PIXI.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w * SS; c.height = h * SS;
  const g = c.getContext('2d')!;
  g.scale(SS, SS);
  draw(g, w, h);
  const t = PIXI.Texture.from(c);
  cache.set(key, t);
  return t;
}

/* ---------------- generic light ---------------- */
export const glowTex = () => tex('glow', 128, 128, (g, w) => {
  const r = w / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.22, 'rgba(255,255,255,0.6)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

export const sparkTex = () => tex('spark', 64, 64, (g, w) => {
  const r = w / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r * 0.4);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(r, 5); g.lineTo(r, w - 5); g.moveTo(5, r); g.lineTo(w - 5, r); g.stroke();
});

export const ringTex = () => tex('ring', 256, 256, (g, w) => {
  const r = w / 2;
  const gr = g.createRadialGradient(r, r, r * 0.62, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  gr.addColorStop(0.82, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

export const discTex = () => tex('disc', 128, 128, (g, w) => {
  const r = w / 2;
  const gr = g.createRadialGradient(r * 0.72, r * 0.68, r * 0.1, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

/* ---------------- coins / crowns ---------------- */
export const coinTex = () => tex('coin', 128, 128, (g, w) => {
  const r = w / 2;
  const gr = g.createRadialGradient(r * 0.7, r * 0.62, r * 0.1, r, r, r);
  gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.45, '#ffd23f'); gr.addColorStop(1, '#c98a06');
  g.fillStyle = gr; g.beginPath(); g.arc(r, r, r * 0.92, 0, 7); g.fill();
  g.strokeStyle = 'rgba(140,90,0,0.85)'; g.lineWidth = 6; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.arc(r, r, r * 0.7, 0, 7); g.stroke();
  g.fillStyle = 'rgba(150,95,0,0.9)'; g.font = `bold ${r * 1.1}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('$', r, r + 2);
});

export const crownTex = () => tex('crown', 128, 96, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.45, '#ffd23f'); gr.addColorStop(1, '#d99a06');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w * 0.06, h * 0.82); g.lineTo(w * 0.06, h * 0.3); g.lineTo(w * 0.26, h * 0.56);
  g.lineTo(w * 0.5, h * 0.12); g.lineTo(w * 0.74, h * 0.56); g.lineTo(w * 0.94, h * 0.3);
  g.lineTo(w * 0.94, h * 0.82); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(120,78,0,0.9)'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#ff4fa3'; g.beginPath(); g.arc(w * 0.5, h * 0.66, 6, 0, 7); g.fill();
  g.fillStyle = '#4be07a'; g.beginPath(); g.arc(w * 0.24, h * 0.7, 4.5, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.76, h * 0.7, 4.5, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(w * 0.14, h * 0.3, w * 0.06, h * 0.4);
});

export const spikesTex = (color: string, n: number, key: string) => tex(`spikes-${key}`, 160, 160, (g, w) => {
  const cx = w / 2, cy = w / 2;
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r0 = w * 0.32, r1 = w * 0.48, hw = 0.055;
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.beginPath();
    g.moveTo(r0, -w * hw); g.lineTo(r1, 0); g.lineTo(r0, w * hw);
    g.closePath(); g.fill();
    g.restore();
  }
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, w * 0.3, 0, 7); g.stroke();
});

export const bladeTex = () => tex('blade', 96, 44, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(120,220,255,0)');
  gr.addColorStop(0.4, 'rgba(180,240,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, h / 2); g.quadraticCurveTo(w * 0.5, -h * 0.5, w, h * 0.1);
  g.quadraticCurveTo(w * 0.55, h * 0.5, 0, h / 2);
  g.fill();
});

export const boltTex = () => tex('bolt', 120, 300, (g, w, h) => {
  g.strokeStyle = 'rgba(190,215,255,0.95)'; g.lineWidth = 12; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(w * 0.62, 0); g.lineTo(w * 0.3, h * 0.42); g.lineTo(w * 0.55, h * 0.44);
  g.lineTo(w * 0.24, h); g.lineTo(w * 0.78, h * 0.5); g.lineTo(w * 0.5, h * 0.48);
  g.lineTo(w * 0.8, 0);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.stroke();
});

/* ---------------- flora / fauna ---------------- */
export const palmTex = () => tex('palm', 256, 340, (g, w, h) => {
  const bx = w / 2, by = h - 8;
  g.strokeStyle = '#6b4423'; g.lineWidth = 18; g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + 14, h * 0.55, bx - 8, h * 0.22); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(bx - 5, by); g.quadraticCurveTo(bx + 7, h * 0.55, bx - 11, h * 0.24); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3;
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    const px = bx + (1 - t) * (1 - t) * 14 - 8 * t * t;
    const py = by - t * h * 0.78;
    g.beginPath(); g.moveTo(px - 8, py); g.lineTo(px + 8, py - 2); g.stroke();
  }
  const tx = bx - 8, ty = h * 0.2;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.46;
    const len = 78 - Math.abs(i - 3) * 8;
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.92;
    const mx = tx + Math.cos(a) * len * 0.55, my = ty + Math.sin(a) * len * 0.45 - 18;
    const fg = g.createLinearGradient(tx, ty, ex, ey);
    fg.addColorStop(0, i % 2 ? '#2c9c4d' : '#3fc069');
    fg.addColorStop(1, i % 2 ? '#1e7a3c' : '#2b8f50');
    g.fillStyle = fg;
    g.beginPath(); g.moveTo(tx, ty);
    g.quadraticCurveTo(mx, my, ex, ey);
    g.quadraticCurveTo(mx, my + 18, tx, ty);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
  }
  g.fillStyle = '#6b4423';
  g.beginPath(); g.arc(tx + 8, ty + 8, 7, 0, 7); g.fill();
  g.beginPath(); g.arc(tx - 8, ty + 10, 6, 0, 7); g.fill();
});

export const rockTex = (variant = 0) => tex(`rock${variant}`, 128, 96, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, variant ? '#7f8b96' : '#98a4ae');
  gr.addColorStop(1, variant ? '#4d5660' : '#5f6a74');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w * 0.08, h * 0.9);
  g.quadraticCurveTo(w * 0.18, h * 0.3, w * 0.45, h * 0.16);
  g.quadraticCurveTo(w * 0.8, h * 0.08, w * 0.94, h * 0.9);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.ellipse(w * 0.38, h * 0.36, w * 0.16, h * 0.12, -0.4, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath(); g.ellipse(w * 0.55, h * 0.86, w * 0.36, h * 0.08, 0, 0, 7); g.fill();
});

export const flameTex = () => tex('flame', 64, 96, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.68, 2, w / 2, h * 0.6, h * 0.5);
  gr.addColorStop(0, 'rgba(255,255,220,1)');
  gr.addColorStop(0.35, 'rgba(255,190,60,0.95)');
  gr.addColorStop(0.7, 'rgba(255,110,20,0.5)');
  gr.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w / 2, h * 0.06);
  g.quadraticCurveTo(w * 0.95, h * 0.55, w * 0.5, h);
  g.quadraticCurveTo(w * 0.05, h * 0.55, w / 2, h * 0.06);
  g.fill();
});

export const torchTex = () => tex('torch', 40, 120, (g, w, h) => {
  g.fillStyle = '#5c3a1e';
  g.fillRect(w * 0.36, h * 0.32, w * 0.28, h * 0.68);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(w * 0.4, h * 0.32, w * 0.08, h * 0.68);
  g.fillStyle = '#3b2410';
  g.fillRect(w * 0.28, h * 0.26, w * 0.44, h * 0.1);
});

export const crabTex = (angry = false) => tex(`crab${angry ? 'A' : ''}`, 128, 96, (g, w, h) => {
  g.strokeStyle = '#c2382a'; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = h * (0.5 + i * 0.12), dir = i % 2 ? 1 : -1;
    g.beginPath(); g.moveTo(w * (0.5 - 0.22), y);
    g.quadraticCurveTo(w * (0.5 - 0.42), y + dir * 14, w * 0.06, y + dir * 20); g.stroke();
    g.beginPath(); g.moveTo(w * (0.5 + 0.22), y);
    g.quadraticCurveTo(w * (0.5 + 0.42), y + dir * 14, w * 0.94, y + dir * 20); g.stroke();
  }
  const gr = g.createRadialGradient(w * 0.42, h * 0.4, 4, w / 2, h / 2, w * 0.32);
  gr.addColorStop(0, '#ff7a5c'); gr.addColorStop(1, '#c9382a');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(w / 2, h * 0.56, w * 0.3, h * 0.3, 0, 0, 7); g.fill();
  g.fillStyle = '#c9382a';
  g.beginPath(); g.arc(w * 0.18, h * 0.36, w * 0.13, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.82, h * 0.36, w * 0.13, 0, 7); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(w * 0.46, h * 0.44, w * 0.07, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.6, h * 0.44, w * 0.07, 0, 7); g.fill();
  g.fillStyle = angry ? '#3a0000' : '#12121a';
  g.beginPath(); g.arc(w * 0.46, h * 0.45, w * 0.035, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.61, h * 0.45, w * 0.035, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(w * 0.44, h * 0.66); g.quadraticCurveTo(w / 2, angry ? h * 0.58 : h * 0.72, w * 0.62, h * 0.64); g.stroke();
});

export const starfishTex = () => tex('starfish', 96, 96, (g, w) => {
  const r = w / 2;
  const gr = g.createLinearGradient(0, 0, w, w);
  gr.addColorStop(0, '#ff9f68'); gr.addColorStop(1, '#e2673c');
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.3 : r * 0.86;
    const x = r + Math.cos(a) * rad, y = r + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    g.beginPath(); g.arc(r + Math.cos(a) * r * 0.34, r + Math.sin(a) * r * 0.34, r * 0.11, 0, 7); g.fill();
  }
});

export const gullTex = () => tex('gull', 96, 64, (g, w, h) => {
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(w * 0.08, h * 0.7); g.quadraticCurveTo(w * 0.3, h * 0.12, w / 2, h * 0.5);
  g.quadraticCurveTo(w * 0.7, h * 0.12, w * 0.92, h * 0.7); g.stroke();
  g.strokeStyle = 'rgba(40,50,70,0.75)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(w * 0.78, h * 0.34); g.quadraticCurveTo(w * 0.88, h * 0.26, w * 0.92, h * 0.34); g.stroke();
});

export const bubbleTex = () => tex('bubble', 64, 64, (g, w) => {
  const r = w / 2;
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
  g.beginPath(); g.arc(r, r, r * 0.8, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath(); g.arc(r, r, r * 0.78, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.ellipse(r * 0.65, r * 0.6, r * 0.16, r * 0.1, -0.6, 0, 7); g.fill();
});

export const rainTex = () => tex('rain', 24, 96, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(200,225,255,0)');
  gr.addColorStop(0.5, 'rgba(210,235,255,0.75)');
  gr.addColorStop(1, 'rgba(200,225,255,0)');
  g.fillStyle = gr;
  g.fillRect(w * 0.4, 0, w * 0.22, h);
});


/* ---------------- orbit weapon: bumerang + zincir ---------------- */
/**
 * Bumerang: kıvrık, iki uçlu keskin palet. Merkezde ısı parıltısı, uçlarda
 * beyaz kenar. Dönerek uçan, arkasında iz bırakan silah.
 */
export const boomerangTex = () => tex('boomerang', 128, 128, (g, w) => {
  const c = w / 2;
  // aura
  const aura = g.createRadialGradient(c, c, 4, c, c, c);
  aura.addColorStop(0, 'rgba(255,240,190,0.95)');
  aura.addColorStop(0.4, 'rgba(255,190,90,0.45)');
  aura.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = aura; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  // gövde: hilal (V formu) yolu
  g.beginPath();
  g.moveTo(c - 52, c - 34);
  g.quadraticCurveTo(c, c + 20, c + 52, c - 34);
  g.quadraticCurveTo(c + 40, c - 6, c + 30, c + 4);
  g.quadraticCurveTo(c, c + 26, c - 30, c + 4);
  g.quadraticCurveTo(c - 40, c - 6, c - 52, c - 34);
  g.closePath();
  const body = g.createLinearGradient(c - 52, c - 34, c + 52, c + 20);
  body.addColorStop(0, '#fff6d8');
  body.addColorStop(0.5, '#ffb43c');
  body.addColorStop(1, '#ff6a1e');
  g.fillStyle = body; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.stroke();
  // keskin uç parıltısı
  g.fillStyle = '#fffdf0';
  g.beginPath(); g.arc(c - 48, c - 31, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(c + 48, c - 31, 5, 0, Math.PI * 2); g.fill();
});

/** Zincir halkasının küçük parlak topu (iz). */
export const chainOrbTex = () => tex('chainorb', 64, 64, (g, w) => {
  const c = w / 2;
  const gr = g.createRadialGradient(c, c, 1, c, c, c);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.28, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.55, 'rgba(140,225,255,0.55)');
  gr.addColorStop(1, 'rgba(90,190,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
});

/** Buff rozeti (güç/hız/seri) — küçük yuvarlak madalyon. */
export const badgeTex = () => tex('badge', 96, 96, (g, w) => {
  const c = w / 2;
  g.fillStyle = 'rgba(10,8,22,0.92)';
  g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.fill();
  const ring = g.createLinearGradient(0, 0, w, w);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(1, '#ffd23f');
  g.strokeStyle = ring; g.lineWidth = 6; g.stroke();
});

/* ---------------- eski yıldız silahı ---------------- */
/**
 * Profil fotoğrafının etrafinde dönen silah. Üç katmanlı çizim:
 *  - dış halka: sıcak aura (additive blend ile parlar)
 *  - gövde: 5 köşeli keskin yıldız, merkezde beyaz çekirdek
 *  - iç çentik: hareket hissi için koyu hilal
 * `n` köşe sayısı, `hue` gövde rengi.
 */
export const orbitStarTex = (n = 5, hue = '#ffd23f', key = `os${n}${hue}`) =>
  tex(key, 128, 128, (g, w) => {
    const c = w / 2, R = w * 0.46;
    // aura
    const aura = g.createRadialGradient(c, c, R * 0.15, c, c, R);
    aura.addColorStop(0, hue);
    aura.addColorStop(0.45, hue + '88');
    aura.addColorStop(1, hue + '00');
    g.globalAlpha = 0.85; g.fillStyle = aura;
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    // yıldız gövdesi: iki tonlu (koyu kenar + parlak yüz)
    const star = (rad: number, inset: number) => {
      g.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / n;
        const rr = i % 2 ? rad * inset : rad;
        const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    };
    g.fillStyle = hue; star(R, 0.46); g.fill();
    g.fillStyle = '#ffffff'; star(R * 0.62, 0.46); g.fill();
    // merkez çekirdek
    g.fillStyle = '#fffdf0';
    g.beginPath(); g.arc(c, c, R * 0.2, 0, Math.PI * 2); g.fill();
  });

/** Silahın bıraktığı kuyruk parçası (ufukta uçan ince alev). */
export const orbitTrailTex = () => tex('otrail', 96, 32, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.55, 'rgba(255,225,150,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0.95)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.quadraticCurveTo(w * 0.6, 0, w, h * 0.36);
  g.lineTo(w, h * 0.64);
  g.quadraticCurveTo(w * 0.6, h, 0, h / 2);
  g.closePath(); g.fill();
});

export const starTex = () => tex('star', 96, 96, (g, w) => {
  const r = w / 2;
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.2 : r * 0.46;
    const x = r + Math.cos(a) * rad, y = r + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.fill();
});

/* ---------------- structures ---------------- */
export const castleTex = () => tex('castle', 220, 260, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#d8dbe0'); gr.addColorStop(0.5, '#b7bdc6'); gr.addColorStop(1, '#8d949d');
  g.fillStyle = gr;
  g.fillRect(w * 0.18, h * 0.22, w * 0.64, h * 0.78);
  g.fillRect(w * 0.06, h * 0.44, w * 0.88, h * 0.56);
  for (let i = 0; i < 5; i++) { g.fillRect(w * (0.08 + i * 0.17), h * 0.36, w * 0.1, h * 0.1); }
  for (let i = 0; i < 3; i++) { g.fillRect(w * (0.22 + i * 0.2), h * 0.16, w * 0.1, h * 0.08); }
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
  for (let y = h * 0.3; y < h; y += 16) { g.beginPath(); g.moveTo(w * 0.06, y); g.lineTo(w * 0.94, y); g.stroke(); }
  for (let i = 0; i < 6; i++) {
    g.beginPath(); g.moveTo(w * (0.1 + i * 0.15), h * 0.3); g.lineTo(w * (0.16 + i * 0.15), h * 0.46); g.stroke();
  }
  g.fillStyle = '#4a3a2a';
  g.beginPath(); g.moveTo(w * 0.42, h); g.lineTo(w * 0.42, h * 0.72);
  g.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.58, h * 0.72); g.lineTo(w * 0.58, h); g.closePath(); g.fill();
  g.fillStyle = 'rgba(160,220,255,0.75)';
  g.beginPath(); g.arc(w * 0.32, h * 0.52, w * 0.045, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.68, h * 0.52, w * 0.045, 0, 7); g.fill();
  // flag
  g.strokeStyle = '#6b4423'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(w * 0.5, h * 0.16); g.lineTo(w * 0.5, h * 0.02); g.stroke();
  g.fillStyle = '#e63946';
  g.beginPath(); g.moveTo(w * 0.5, h * 0.03); g.lineTo(w * 0.78, h * 0.08); g.lineTo(w * 0.5, h * 0.14); g.closePath(); g.fill();
});

export const krakenTex = () => tex('kraken', 260, 220, (g, w, h) => {
  const gr = g.createRadialGradient(w * 0.4, h * 0.34, 8, w / 2, h * 0.5, w * 0.5);
  gr.addColorStop(0, '#9b6bff'); gr.addColorStop(0.6, '#6b2fd6'); gr.addColorStop(1, '#3d138a');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(w / 2, h * 0.52, w * 0.42, h * 0.42, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath(); g.ellipse(w * 0.38, h * 0.34, w * 0.16, h * 0.1, -0.5, 0, 7); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(w * 0.38, h * 0.46, w * 0.1, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.62, h * 0.46, w * 0.1, 0, 7); g.fill();
  g.fillStyle = '#1b0033';
  g.beginPath(); g.arc(w * 0.4, h * 0.48, w * 0.05, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.64, h * 0.48, w * 0.05, 0, 7); g.fill();
  g.strokeStyle = 'rgba(30,0,60,0.6)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(w * 0.4, h * 0.68); g.quadraticCurveTo(w * 0.5, h * 0.78, w * 0.6, h * 0.68); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * (0.3 + i * 0.1), h * 0.28, 5, 0, 7); g.fill(); }
});

export const tentacleTex = (variant: number) => tex(`tentacle${variant}`, 200, 70, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#4a1e9c'); gr.addColorStop(0.6, variant % 2 ? '#7b3fe4' : '#8f5bff'); gr.addColorStop(1, '#b98bff');
  g.strokeStyle = gr; g.lineWidth = 26; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, h / 2);
  g.bezierCurveTo(w * 0.3, h * 0.1, w * 0.65, h * 0.95, w, h * 0.45);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(0, h / 2 - 6);
  g.bezierCurveTo(w * 0.3, h * 0.1 - 6, w * 0.65, h * 0.95 - 6, w, h * 0.45 - 4); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 1; i < 5; i++) { g.beginPath(); g.arc(w * (i * 0.2), h * (i % 2 ? 0.4 : 0.6), 4, 0, 7); g.fill(); }
});

export const clawTex = () => tex('claw', 150, 130, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#ffb457'); gr.addColorStop(1, '#e05a1e');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w * 0.1, h * 0.95); g.quadraticCurveTo(w * 0.06, h * 0.3, w * 0.55, h * 0.12);
  g.quadraticCurveTo(w * 0.3, h * 0.6, w * 0.5, h * 0.9);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(w * 0.55, h * 0.14); g.quadraticCurveTo(w * 0.96, h * 0.34, w * 0.9, h * 0.96);
  g.quadraticCurveTo(w * 0.72, h * 0.55, w * 0.5, h * 0.4);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.beginPath(); g.ellipse(w * 0.42, h * 0.42, w * 0.1, h * 0.16, -0.6, 0, 7); g.fill();
});

/* ---------------- UI ---------------- */
export const panelTex = (radius = 22, key = 'p') => tex(`panel-${key}-${radius}`, 96, 96, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0.96)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.86)');
  gr.addColorStop(1, 'rgba(255,255,255,0.74)');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(2, 2, w - 4, h - 4, radius);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.5; g.stroke();
});

export const shineTex = () => tex('shine', 256, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export const vignetteTex = () => tex('vignette', 540, 960, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.48, w * 0.32, w / 2, h * 0.5, w * 0.78);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(0.7, 'rgba(0,0,0,0.16)');
  gr.addColorStop(1, 'rgba(0,0,0,0.62)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export const skyTex = (kind: 'day' | 'sunset' | 'night') => tex(`sky-${kind}`, 60, 1920, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  if (kind === 'day') {
    gr.addColorStop(0, '#17a9db'); gr.addColorStop(0.12, '#4fd3e6');
    gr.addColorStop(0.2, '#f6e7bb'); gr.addColorStop(0.55, '#eed9a4'); gr.addColorStop(1, '#d9a463');
  } else if (kind === 'sunset') {
    gr.addColorStop(0, '#2b2a6b'); gr.addColorStop(0.1, '#7b4b9c');
    gr.addColorStop(0.2, '#ff7b54'); gr.addColorStop(0.55, '#ffb26b'); gr.addColorStop(1, '#e0724a');
  } else {
    gr.addColorStop(0, '#060c26'); gr.addColorStop(0.12, '#132a63');
    gr.addColorStop(0.2, '#2b3f7a'); gr.addColorStop(0.6, '#25304f'); gr.addColorStop(1, '#151b33');
  }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export const waterTex = (kind: 'day' | 'sunset' | 'night') => tex(`water-${kind}`, 60, 700, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  if (kind === 'day') { gr.addColorStop(0, '#1f9fd0'); gr.addColorStop(1, '#0d6ea3'); }
  else if (kind === 'sunset') { gr.addColorStop(0, '#c96a8f'); gr.addColorStop(1, '#7b4b9c'); }
  else { gr.addColorStop(0, '#12305e'); gr.addColorStop(1, '#08132e'); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export const sandTex = (variant: 'beach' | 'volcano' | 'ice' | 'night' | 'sky') => tex(`sand-${variant}`, 128, 128, (g, w, h) => {
  const bases = { beach: ['#f0dcae', '#dcc08a'], volcano: ['#5b3341', '#3a1f2c'], ice: ['#eaf6ff', '#c3ddf2'], night: ['#4a5a55', '#33423f'], sky: ['#f4fbff', '#d7ecf6'] };
  const [a, b] = bases[variant];
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a); gr.addColorStop(1, b);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // fine grain only — big blobs read as noise when the texture is stretched
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(90,60,20,0.09)';
    const r = Math.random() * 0.8 + 0.2;
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill();
  }
  // subtle dune ripples
  g.strokeStyle = 'rgba(120,90,40,0.06)'; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * h + Math.random() * 6;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 22 + i) * 3);
    g.stroke();
  }
});

export const watermarkTex = () => tex('watermark', 512, 512, (g, w) => {
  const r = w / 2;
  g.globalAlpha = 0.2;
  g.strokeStyle = '#6b3f12'; g.lineWidth = 8;
  g.beginPath(); g.arc(r, r, r * 0.52, 0, 7); g.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(r + Math.cos(a) * r * 0.58, r + Math.sin(a) * r * 0.58);
    g.lineTo(r + Math.cos(a) * r * 0.76, r + Math.sin(a) * r * 0.76);
    g.stroke();
  }
  g.fillStyle = '#6b3f12';
  g.font = `900 ${r * 0.2}px "Arial Black", Impact, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TAÇ SAVAŞI', r, r + 4);
  g.globalAlpha = 1;
});

export const ringFrameTex = (color: string, key: string) => tex(`frame-${key}`, 160, 160, (g, w) => {
  const r = w / 2;
  const gr = g.createLinearGradient(0, 0, 0, w);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.5, color);
  gr.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.strokeStyle = gr; g.lineWidth = 12;
  g.beginPath(); g.arc(r, r, r - 8, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
  g.beginPath(); g.arc(r, r, r - 16, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
  g.beginPath(); g.arc(r, r, r - 2, 0, 7); g.stroke();
});
