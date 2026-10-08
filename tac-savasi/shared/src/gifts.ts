// Gift registry: every known gift, its diamond cost, and what it DOES.
// Streamers can add/remove gifts and re-map any gift to any command effect
// from the admin console; the registry persists to localStorage.
import { giftTier } from './types.js';

export type GiftAction =
  | 'tier'      // default effect of its diamond tier (current behavior)
  | 'shield' | 'fire' | 'power' | 'heal' | 'speed'
  | 'meteor' | 'tornado'
  | 'rage' | 'ghost' | 'vamp' | 'giant' | 'reflect' | 'chain' | 'frost' | 'clone'
  | 'streak5'   // +5 streak, nothing else
  | 'ignore';   // counted for goal/gifters, no avatar effect

export interface GiftDef {
  id: string;        // normalized key, e.g. "icecream"
  name: string;      // display name, e.g. "Ice Cream"
  icon: string;      // emoji
  diamonds: number;  // cost -> tier via giftTier()
  enabled: boolean;
  action: GiftAction;
}

export const GIFT_ACTIONS: { id: GiftAction; tr: string }[] = [
  { id: 'tier', tr: 'Varsayılan (kademe)' },
  { id: 'shield', tr: '🛡 Kalkan' },
  { id: 'fire', tr: '🔥 Ateş halkası' },
  { id: 'power', tr: '✨ Rastgele güç' },
  { id: 'heal', tr: '✚ İyileşme' },
  { id: 'speed', tr: '⚡ Hız' },
  { id: 'meteor', tr: '☄️ Meteor' },
  { id: 'tornado', tr: '🌪️ Hortum' },
  { id: 'rage', tr: '🔥 Öfke' },
  { id: 'ghost', tr: '👻 Hayalet' },
  { id: 'vamp', tr: '🧛 Vampir' },
  { id: 'giant', tr: '🦣 Dev' },
  { id: 'reflect', tr: '🪞 Yansıtma' },
  { id: 'chain', tr: '⚡ Zincir' },
  { id: 'frost', tr: '❄ Dondurma' },
  { id: 'clone', tr: '👥 Klon' },
  { id: 'streak5', tr: '+5 seri' },
  { id: 'ignore', tr: 'Yoksay (sayaç işler)' },
];

export const DEFAULT_GIFTS: GiftDef[] = [
  { id: 'rose', name: 'Rose', icon: '🌹', diamonds: 1, enabled: true, action: 'tier' },
  { id: 'icecream', name: 'Ice Cream', icon: '🍦', diamonds: 5, enabled: true, action: 'tier' },
  { id: 'heart', name: 'Heart', icon: '💖', diamonds: 10, enabled: true, action: 'tier' },
  { id: 'coffee', name: 'Coffee', icon: '☕', diamonds: 20, enabled: true, action: 'tier' },
  { id: 'donut', name: 'Donut', icon: '🍩', diamonds: 30, enabled: true, action: 'tier' },
  { id: 'crown', name: 'Crown', icon: '👑', diamonds: 99, enabled: true, action: 'tier' },
  { id: 'fireworks', name: 'Fireworks', icon: '🎆', diamonds: 150, enabled: true, action: 'tier' },
  { id: 'meteor', name: 'Meteor', icon: '☄️', diamonds: 200, enabled: true, action: 'meteor' },
  { id: 'yacht', name: 'Yacht', icon: '🛥️', diamonds: 1000, enabled: true, action: 'tornado' },
  { id: 'castle', name: 'Castle', icon: '🏰', diamonds: 5000, enabled: true, action: 'tornado' },
  // --- örnek eşlemeler: hediye -> komut ---
  { id: 'gg', name: 'GG', icon: '🎮', diamonds: 10, enabled: true, action: 'fire' },
  { id: 'gameshield', name: 'Game Shield', icon: '🛡️', diamonds: 50, enabled: true, action: 'shield' },
];

/** Normalize a gift name the same way in every language: "Ice-Cream 💖" -> "icecream". */
export function normGiftName(s: string | null | undefined): string {
  // tr-TR lower turns I into dotless ı (U+0131), which NFD does NOT decompose,
  // so map it explicitly or "Ice" would normalize to "ce".
  return (s ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '');
}

export class GiftRegistry {
  private map = new Map<string, GiftDef>();
  constructor(defs: GiftDef[] = DEFAULT_GIFTS) { this.reset(defs); }
  reset(defs: GiftDef[] = DEFAULT_GIFTS) {
    this.map = new Map(defs.map((d) => [normGiftName(d.id || d.name), { ...d, id: normGiftName(d.id || d.name) }]));
  }
  list(): GiftDef[] { return [...this.map.values()].sort((a, b) => a.diamonds - b.diamonds); }
  enabled(): GiftDef[] { return this.list().filter((d) => d.enabled); }
  lookup(giftName?: string | null): GiftDef | null {
    if (!giftName) return null;
    return this.map.get(normGiftName(giftName)) ?? null;
  }
  upsert(def: GiftDef): GiftDef {
    const id = normGiftName(def.id || def.name) || `g${Date.now()}`;
    const full = { ...def, id };
    this.map.set(id, full);
    return full;
  }
  remove(idOrName: string): boolean { return this.map.delete(normGiftName(idOrName)); }
  setEnabled(idOrName: string, on: boolean): boolean {
    const d = this.map.get(normGiftName(idOrName));
    if (!d) return false;
    d.enabled = on;
    return true;
  }
  setAction(idOrName: string, action: GiftAction): boolean {
    const d = this.map.get(normGiftName(idOrName));
    if (!d) return false;
    d.action = action;
    return true;
  }
  setDiamonds(idOrName: string, diamonds: number): boolean {
    const d = this.map.get(normGiftName(idOrName));
    if (!d || !(diamonds > 0)) return false;
    d.diamonds = Math.floor(diamonds);
    return true;
  }
  tierOf(def: GiftDef) { return giftTier(def.diamonds); }
  toJSON(): GiftDef[] { return this.list(); }
  /** Kayıtlı katalog varsayılanların TAMAMINI değiştirir (silinen hediye geri gelmez). */
  fromJSON(arr: unknown): number {
    if (!Array.isArray(arr)) return 0;
    this.map.clear();
    let n = 0;
    for (const d of arr as GiftDef[]) {
      if (!d || typeof d.name !== 'string') continue;
      this.upsert({
        id: String((d as GiftDef).id ?? (d as GiftDef).name),
        name: String((d as GiftDef).name),
        icon: String((d as GiftDef).icon ?? '🎁'),
        diamonds: Number((d as GiftDef).diamonds) || 1,
        enabled: (d as GiftDef).enabled !== false,
        action: (d as GiftDef).action ?? 'tier',
      });
      n++;
    }
    return n;
  }
}
