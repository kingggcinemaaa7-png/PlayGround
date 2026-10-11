// Basamak + streak + cooldown + hız sınırı (Master Plan §3, §4)
export function tierFor(diamonds, tiers) {
  const sorted = [...tiers].sort((a, b) => a.minDiamonds - b.minDiamonds);
  let cur = sorted[0];
  for (const t of sorted) if (diamonds >= t.minDiamonds) cur = t;
  return cur;
}

// Streak: sayım SADECE repeatEnd'de. Ara olaylar sayılmaz (çift sayım koruması).
export function streakCountable(ev, countOnRepeatEndOnly = true) {
  if (ev.type !== "gift") return true;
  if (!countOnRepeatEndOnly) return true;
  return ev.repeatEnd === true;
}

export function giftTotal(ev) {
  return (ev.diamonds || 0) * (ev.repeat || 1);
}

export class Gate {
  constructor({ cooldownSecondsPerUser = 60, maxNewParticipantsPerMinute = 30 } = {}) {
    this.cooldownMs = cooldownSecondsPerUser * 1000;
    this.maxPerMin = maxNewParticipantsPerMinute;
    this.lastJoin = new Map(); // userId -> ts
    this.joinTimes = []; // son 60sn katılım ts'leri
  }
  joinAllowed(userId, now = Date.now()) {
    const last = this.lastJoin.get(userId) ?? -Infinity;
    if (now - last < this.cooldownMs) return { ok: false, reason: "cooldown" };
    this.joinTimes = this.joinTimes.filter((t) => now - t < 60_000);
    if (this.joinTimes.length >= this.maxPerMin) return { ok: false, reason: "rate" };
    this.lastJoin.set(userId, now);
    this.joinTimes.push(now);
    return { ok: true };
  }
}

// Öncelikli sınırlı kuyruk: gift > chat(join niyeti) > tick/system düşük
const PRIO = { gift: 0, chat: 1, join_intent: 2, system: 3, tick: 9 };
export class EventQueue {
  constructor(limit = 1000) { this.q = []; this.limit = limit; }
  push(ev) {
    this.q.push(ev);
    this.q.sort((a, b) => (PRIO[a.type] ?? 5) - (PRIO[b.type] ?? 5));
    if (this.q.length > this.limit) this.q.splice(0, this.q.length - this.limit);
  }
  drain(n = 100) { return this.q.splice(0, n); }
  get size() { return this.q.length; }
}
