// Kapadokya Beat Vadisi — veri-güdümlü oyun kuralları (spec §6-8)
// config.json + giftmap.json sözleşmesiyle birebir uyumlu.
import CONFIG from '../config/config.json';
import GIFTMAP from '../config/giftmap.json';

export const config = CONFIG;
export const giftmap = GIFTMAP;

export const TIERS = Object.entries(CONFIG.tiers)
  .map(([id, t]) => ({ id: Number(id), ...t }))
  .sort((a, b) => a.threshold - b.threshold);

export function tierForScore(score) {
  let cur = TIERS[0];
  for (const t of TIERS) if (score >= t.threshold) cur = t;
  return cur;
}

export function giftByKey(key) {
  return GIFTMAP.mappings.find((m) => m.key === String(key)) || null;
}

export class CooldownManager {
  constructor() { this.map = new Map(); }
  canTrigger(id) {
    const exp = this.map.get(id);
    return !exp || Date.now() >= exp;
  }
  trigger(id, ms) { this.map.set(id, Date.now() + ms); }
  remaining(id) {
    const exp = this.map.get(id);
    return !exp ? 0 : Math.max(0, exp - Date.now());
  }
}

export class StreakTracker {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.userId = 'sen';
    this.giftId = null;
    this.count = 0;
    this.last = 0;
  }
  // returns { count, expired } — repeatEnd mantığı (spec §8.3)
  push(giftId, now = Date.now()) {
    if (this.giftId === giftId && now - this.last <= this.windowMs) {
      this.count += 1;
      this.last = now;
      return { count: this.count, expired: false };
    }
    const expired = this.count >= 2;
    const prev = { maxCombo: this.count, giftId: this.giftId, expired };
    this.giftId = giftId;
    this.count = 1;
    this.last = now;
    return { count: 1, expired: false, prev };
  }
  comboMultiplier(count) {
    const [t3, t5, t10] = config.streak.comboThresholds;
    const [m3, m5, m10] = config.streak.comboMultipliers;
    if (count >= t10) return m10;
    if (count >= t5) return m5;
    if (count >= t3) return m3;
    return 1;
  }
  comboLabel(count) {
    const [t3, t5, t10] = config.streak.comboThresholds;
    if (count >= t10) return '×10';
    if (count >= t5) return '×5';
    if (count >= t3) return '×3';
    return '×1';
  }
}

// Yerel AI Show-Runner (spec §9'un çevrimdışı graceful-degradation karşılığı):
// cooldown'da olmayan olayı, hype + tekrarsızlık kuralıyla seçer.
const FALLBACK_LINES = [
  'Vadi sabırsızlanıyor! Hadi herkes!',
  'Balonlar yükseliyor, beat düşmek üzere!',
  'Peri bacaları bu gece senin için parlıyor!',
  'Kalabalık coştu! Hype bar dolmak üzere!'
];
export class LocalShowRunner {
  constructor() { this.recent = []; this.n = 0; }
  pick(hype, cooldowns) {
    const avail = ['yildiz_yagmuru', 'duello', 'buyuk_isik_toreni'].filter((e) => cooldowns.canTrigger(e));
    let eventId = 'yildiz_yagmuru';
    if (hype >= 80 && cooldowns.canTrigger('drop')) eventId = 'drop';
    else if (avail.length) eventId = avail[this.n % avail.length];
    else eventId = 'announce';
    // tekrar koruması: son 10'da varsa announce'a düş
    if (this.recent.slice(-config.aiRunner.repetitionWindow).includes(eventId)) eventId = 'announce';
    this.recent.push(eventId);
    this.n += 1;
    const text = FALLBACK_LINES[this.n % FALLBACK_LINES.length];
    return { eventId, text };
  }
}
