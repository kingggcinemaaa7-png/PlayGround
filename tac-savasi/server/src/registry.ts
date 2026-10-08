// Viewer registry: 60 fighters max, spectator queue, LRU-by-activity replacement,
// profile-pic cache (24h), profanity filter, rate limits, dedupe ids.
import type { LiveEvent } from '@tac/shared';

const BAD = ['puta', 'mierda', 'cabron', 'cabrón', 'pendejo', 'orospu', 'siktir', 'amk', 'aq', 'fuck', 'shit', 'nigger'];
export function cleanName(name: string): string {
  const s = (name ?? '?').trim().slice(0, 24) || '?';
  const low = s.toLowerCase();
  for (const b of BAD) if (low.includes(b)) return 'Player' + Math.floor(Math.random() * 900 + 100);
  return s;
}

export interface Viewer {
  userId: string; name: string; pic: string | null;
  totalDamage: number; crowns: number; gifts: number; diamonds: number;
  matches: number; lastSeen: number; active: boolean; fighter: boolean;
}

export class Registry {
  viewers = new Map<string, Viewer>();
  seenIds = new Set<string>();
  cmdAt = new Map<string, number>();
  maxFighters: number;
  picCache = new Map<string, { url: string; at: number }>();

  constructor(maxFighters = 60) { this.maxFighters = maxFighters; }

  isDup(id: string): boolean {
    if (this.seenIds.has(id)) return true;
    this.seenIds.add(id);
    if (this.seenIds.size > 20000) { const [f] = this.seenIds; this.seenIds.delete(f); }
    return false;
  }
  rateOk(userId: string, cmd: string, now: number, windowMs = 3000): boolean {
    const k = userId + ':' + cmd;
    const last = this.cmdAt.get(k) ?? -1e12;
    if (now - last < windowMs) return false;
    this.cmdAt.set(k, now);
    return true;
  }
  ensure(e: LiveEvent, now = Date.now()): Viewer {
    let v = this.viewers.get(e.userId);
    if (!v) {
      v = {
        userId: e.userId, name: cleanName(e.name), pic: this.picFor(e.userId, e.pic),
        totalDamage: 0, crowns: 0, gifts: 0, diamonds: 0,
        matches: 0, lastSeen: now, active: true, fighter: false,
      };
      this.viewers.set(e.userId, v);
    } else {
      v.name = cleanName(e.name);
      if (e.pic) v.pic = this.picFor(e.userId, e.pic);
      v.lastSeen = now; v.active = true;
    }
    this.promote(now);
    return v;
  }
  picFor(userId: string, url: string | null): string | null {
    if (!url || url.startsWith('适合')) return this.viewers.get(userId)?.pic ?? null; // hide broken/inappropriate
    const c = this.picCache.get(userId);
    if (c && c.url === url && Date.now() - c.at < 24 * 3600 * 1000) return url;
    this.picCache.set(userId, { url, at: Date.now() });
    return url;
  }
  fighters(): Viewer[] { return [...this.viewers.values()].filter((v) => v.fighter); }
  promote(now = Date.now()) {
    const fs = this.fighters();
    if (fs.length < this.maxFighters) {
      // oldest spectator becomes fighter
      const spec = [...this.viewers.values()].filter((v) => !v.fighter).sort((a, b) => a.lastSeen - b.lastSeen)[0];
      if (spec && fs.length < this.maxFighters) spec.fighter = true;
      return;
    }
    // replace least-active fighter with a waiting active spectator
    const specs = [...this.viewers.values()].filter((v) => !v.fighter && now - v.lastSeen < 120_000);
    if (!specs.length) return;
    const weakest = [...fs].sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (weakest && now - weakest.lastSeen > 90_000) {
      weakest.fighter = false;
      specs.sort((a, b) => b.lastSeen - a.lastSeen)[0].fighter = true;
    }
  }
  deleteUser(userId: string) { this.viewers.delete(userId); }
}
