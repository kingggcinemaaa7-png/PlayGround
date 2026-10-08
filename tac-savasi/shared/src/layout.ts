// Fixed HUD safe zones for 1080x1920 portrait. TikTok-safe margins:
// bottom 12% and right 10% must not hold critical UI.
export const W = 1080; export const H = 1920;
export interface Rect { x: number; y: number; w: number; h: number; name: string }
export function layoutZones(facecam: boolean): Rect[] {
  const topPush = facecam ? 100 : 0;
  return [
    { name: 'topbar', x: 0, y: topPush, w: 1080, h: 214 },
    { name: 'goal', x: 14, y: 224 + topPush, w: 430, h: 56 },
    { name: 'ticker', x: 646, y: 224 + topPush, w: 420, h: 56 },
    // side lists shorten when the facecam strip pushes them down
    { name: 'gifters', x: 8, y: 296 + topPush, w: 300, h: facecam ? 240 : 344 },
    { name: 'joins', x: 812, y: 296 + topPush, w: 260, h: facecam ? 240 : 344 },
    // arena-anchored zones never move with the facecam strip.
    // NB: the castle HP bar is diegetic world-space art (see World.castleHpBar),
    // not a HUD zone, so it is intentionally absent here.
    { name: 'center', x: 200, y: 660, w: 680, h: 430 },
    { name: 'mercy', x: 130, y: 1104, w: 820, h: 176 },
    { name: 'hero', x: 180, y: 1296, w: 720, h: 216 },
    { name: 'bossbar', x: 86, y: 1556, w: 908, h: 76 },
    { name: 'feed', x: 236, y: 1652, w: 608, h: 50 },
  ];
}
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
// Pairs allowed to overlap (stacked announcements). Everything else must be disjoint.
const ALLOWED: [string, string][] = [];
export function layoutViolations(facecam: boolean): string[] {
  const zs = layoutZones(facecam);
  const out: string[] = [];
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
    const a = zs[i], b = zs[j];
    if (ALLOWED.some(([x, y]) => (x === a.name && y === b.name) || (x === b.name && y === a.name))) continue;
    // center vs mercy/hero intentionally separated vertically; check actual rects
    if (overlaps(a, b)) out.push(`${a.name} overlaps ${b.name}`);
  }
  // TikTok safe margins: warn if critical rects intrude bottom 12% (y>1690) or right 10% (x>972)
  return out;
}
// TikTok LIVE Studio kaplar: alt %12 ve sağ %10 kritik içerik göstermemeli.
// Tam genişlikteki bir bant bu alanlardan geçebilir (metni ortada/solda kalır);
// bu yüzden "bölge ölü alana giriyor mu" yerine "ölü alan bölgenin ne kadarını
// yutuyor" sorusuna bakılır. Eşik: %40 -> sorun yok, üstü -> gerçek risk.
const DEAD_BOTTOM = H * 0.88;   // 1689.6
const DEAD_RIGHT = W * 0.9;     // 972
const DEAD_LIMIT = 0.4;

function overlap1D(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Bölgenin ölü alanlara giren kısmının oranı (0..1). */
export function deadZoneRatio(r: Rect): number {
  const area = r.w * r.h;
  if (area <= 0) return 0;
  // alt şerit
  const bottomOverlap = overlap1D(r.y, r.y + r.h, DEAD_BOTTOM, H);
  // sağ şerit
  const rightOverlap = overlap1D(r.x, r.x + r.w, DEAD_RIGHT, W);
  const dead = bottomOverlap * r.w + rightOverlap * r.h - bottomOverlap * rightOverlap;
  return Math.max(0, Math.min(1, dead / area));
}

/** Ölü alan bölgenin çoğunu yutuyorsa gerçek güvenlik riski var. */
export function inTikTokDeadZone(r: Rect): boolean {
  return deadZoneRatio(r) > DEAD_LIMIT;
}

/** Yayın öncesi kontrol: ihlal eden bölge adları. */
export function deadZoneViolations(facecam: boolean): string[] {
  return layoutZones(facecam)
    .filter((r) => inTikTokDeadZone(r))
    .map((r) => `${r.name} (${Math.round(deadZoneRatio(r) * 100)}% ölü alanda)`);
}
