// Pure fixed-timestep simulation: no rendering, no DOM. Deterministic given seed.
import { mulberry32, type Rng, range } from './rng.js';
import { damageMultiplier } from './damage.js';
import type { AvatarState, SimConfig } from './types.js';

export interface Bullet { x: number; y: number; vx: number; vy: number; owner: string; dmg: number; life: number; }
export interface Monster { x: number; y: number; hp: number; speed: number; alive: boolean; }
export interface Boss { name: string; x: number; y: number; hp: number; maxHp: number; alive: boolean; specialCd: number; top: string; topDmg: number; }
export type SimEvent =
  | { type: 'trap'; victim: string; by: string }
  | { type: 'castleDown' }
  | { type: 'bossDead'; killer: string; name: string }
  | { type: 'streakTier'; userId: string; streak: number };

export interface SimEvents {
  kills: { killer: string; victim: string; streak: number; cutStreak: number }[];
  announcements: string[];
  goldRain: boolean;
}
export interface MercyState { victim: string; killer: string; until: number; done: boolean }

const ARENA_R = 430;
export const POISON_RADIUS = 26;
export const POISON_DAMAGE = 8;

export class Sim {
  time = 0; rng: Rng;
  avatars = new Map<string, AvatarState>();
  bullets: Bullet[] = [];
  monsters: Monster[] = [];
  boss: Boss | null = null;
  castleHp = 800; castleMax = 800;
  tideUntil = 0; stormUntil = 0; nextTide = 48; nextStorm = 55; nextMonster = 20;
  goldRainUntil = 0; goal = 0; goalTarget = 500;
  mercy: MercyState | null = null;
  grid = new Map<string, string[]>();
  pendingRespawnGift = new Map<string, (() => void)[]>();
  onKill: ((k: SimEvents['kills'][number] & { dmg?: number }) => void) | null = null;
  /** Discrete sim events (boss trap, castle fall, boss death, streak tiers). */
  onEvent: ((e: SimEvent) => void) | null = null;
  /** Fired whenever an avatar respawns (so queued gifts can be applied). */
  onRespawn: ((userId: string) => void) | null = null;
  /** Client-driven: kill/monster score is doubled during gold rain. */
  goldRain = false;
  scores = { kill: 10, monster: 3, boss: 50 };

  constructor(public cfg: SimConfig, public seed = 1234) { this.rng = mulberry32(seed); }

  addAvatar(a: AvatarState) { this.avatars.set(a.userId, a); }
  getAvatar(id: string) { return this.avatars.get(id); }

  speedOf(a: AvatarState): number {
    let s = this.cfg.avatarSpeed;
    if (this.cfg.mutator === 'speed') s *= 1.3;
    if (this.time < a.speedUntil) s *= 1.7;
    if (this.time > 0 && this.time < this.tideUntil) s *= 0.55;
    if (this.time < a.trappedUntil) s = 0;
    return s;
  }
  dmgMult(a: AvatarState): number {
    return damageMultiplier({
      streak: a.streak, table: this.cfg.streakBonus, cap: this.cfg.damageCap,
      hasDouble: this.time < a.doubleUntil,
      hasFuerza: this.time < a.fuerzaUntil,
      mutatorDouble: this.cfg.mutator === 'double',
    });
  }

  spawnPos(): { x: number; y: number } {
    const ang = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * ARENA_R;
    return { x: 540 + Math.cos(ang) * r, y: 960 + Math.sin(ang) * r * 1.2 };
  }

  private rebuildGrid() {
    this.grid.clear();
    const CS = 120;
    const key = (x: number, y: number) => `${Math.floor(x / CS)},${Math.floor(y / CS)}`;
    for (const a of this.avatars.values()) {
      if (!a.alive) continue;
      const k = key(a.x, a.y);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(a.userId);
    }
  }
  nearestEnemy(a: AvatarState): AvatarState | Monster | Boss | null {
    let best: AvatarState | Monster | Boss | null = null; let bd = this.cfg.range;
    for (const o of this.avatars.values()) {
      if (o.userId === a.userId || !o.alive) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (this.boss?.alive) {
      const d = Math.hypot(this.boss.x - a.x, this.boss.y - a.y);
      if (d < Math.max(bd, 260)) { best = this.boss; bd = d; }
    }
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.x - a.x, m.y - a.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  update(dt: number) {
    this.time += dt;
    if (this.time >= this.nextTide) { this.tideUntil = this.time + 14; this.nextTide = this.time + 48; }
    if (this.time >= this.nextStorm) { this.stormUntil = this.time + 9; this.nextStorm = this.time + 55; }
    if (this.time >= this.nextMonster) { this.nextMonster = this.time + 20; this.spawnWave(); }
    this.rebuildGrid();
    // avatars
    for (const a of this.avatars.values()) {
      if (!a.alive) {
        if (this.time >= a.respawnAt) this.respawn(a, a.hp <= 0 && a.streak >= 0 ? this.cfg.respawnHpPct : this.cfg.respawnHpPct);
        continue;
      }
      // poison aura: 8 damage every 0.5s to enemies within 26px
      if (this.time < a.poisonUntil) {
        a.poisonTick -= dt;
        if (a.poisonTick <= 0) {
          a.poisonTick = 0.5;
          for (const o of this.avatars.values()) {
            if (o.userId === a.userId || !o.alive) continue;
            if (Math.hypot(o.x - a.x, o.y - a.y) <= POISON_RADIUS) {
              this.dealDamage(a.userId, o.userId, POISON_DAMAGE);
            }
          }
        }
      }
      if (this.time < a.healUntil) a.hp = Math.min(a.maxHp, a.hp + 10 * dt);
      // orbit the castle on a personal ring: fighters spread around the arena
      // instead of collapsing onto the centre point (readability at 60+ users)
      const sp = this.speedOf(a);
      const ring = a.orbitPhase + this.time * 0.16 * (a.orbitR < 220 ? 1 : 0.7);
      const tx = 540 + Math.cos(ring) * a.orbitR;
      const ty = 960 + Math.sin(ring) * a.orbitR * 1.15;
      const wobble = Math.sin(this.time * 1.3 + a.orbitPhase * 3) * 0.35;
      const ang = Math.atan2(ty - a.y, tx - a.x) + wobble;
      a.x += Math.cos(ang) * sp * dt; a.y += Math.sin(ang) * sp * dt;
      const dx = a.x - 540, dy = (a.y - 960) / 1.2;
      const d = Math.hypot(dx, dy);
      if (d > ARENA_R) { a.x = 540 + dx / d * ARENA_R; a.y = 960 + dy / d * ARENA_R * 1.2; }
      // fire
      a.fireCd -= dt;
      if (a.fireCd <= 0) {
        const tgt = this.nearestEnemy(a);
        if (tgt) {
          a.fireCd = this.cfg.fireInterval;
          const tx = (tgt as AvatarState).x ?? (tgt as Monster).x, ty = (tgt as AvatarState).y ?? (tgt as Monster).y;
          const ang2 = Math.atan2(ty - a.y, tx - a.x);
          const dmg = this.cfg.avatarDmg * this.dmgMult(a);
          this.bullets.push({ x: a.x, y: a.y, vx: Math.cos(ang2) * this.cfg.bulletSpeed, vy: Math.sin(ang2) * this.cfg.bulletSpeed, owner: a.userId, dmg, life: 1.4 });
        } else a.fireCd = 0.1;
      }
    }
    // bullets
    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      let hit = false;
      for (const o of this.avatars.values()) {
        if (o.userId === b.owner || !o.alive) continue;
        if (this.time < o.shieldUntil) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) < 22) {
          this.dealDamage(b.owner, o.userId, b.dmg);
          hit = true; break;
        }
      }
      if (!hit && this.boss?.alive && Math.hypot(this.boss.x - b.x, this.boss.y - b.y) < 60) {
        this.boss.hp -= b.dmg;
        const atk = this.avatars.get(b.owner);
        if (atk) { atk.damage += b.dmg; atk.bossDamage += b.dmg; }
        if (b.owner && this.boss.top !== b.owner) {
          // track top dealer approx: accumulate via damage map on boss
        }
        if (this.boss.hp <= 0) this.killBoss(b.owner);
        hit = true;
      }
      if (!hit) {
        for (const m of this.monsters) {
          if (!m.alive) continue;
          if (Math.hypot(m.x - b.x, m.y - b.y) < 24) {
            m.hp -= b.dmg;
            if (m.hp <= 0) {
              m.alive = false;
              const atk = this.avatars.get(b.owner);
              if (atk) {
                atk.monsterKills += 1;
                atk.damage += b.dmg;
                const mult = this.goldRain ? 2 : 1;
                atk.score += Math.round(this.scores.monster * mult * (this.cfg.mutator === 'goldrain' ? 2 : 1));
              }
            }
            hit = true; break;
          }
        }
      }
      if (!hit) keep.push(b);
    }
    this.bullets.length = 0; this.bullets.push(...keep);
    if (this.bullets.length > 600) this.bullets.splice(0, this.bullets.length - 600);
    // monsters march to castle (center)
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const a = Math.atan2(960 - m.y, 540 - m.x);
      m.x += Math.cos(a) * m.speed * dt; m.y += Math.sin(a) * m.speed * dt;
      if (Math.hypot(m.x - 540, m.y - 960) < 60) { m.alive = false; this.castleHp -= 40; }
    }
    if (this.castleHp <= 0) {
      this.castleHp = this.castleMax;
      this.monsters.length = 0;
      this.onEvent?.({ type: 'castleDown' });
    }
    // boss special
    if (this.boss?.alive) {
      this.boss.specialCd -= dt;
      if (this.boss.specialCd <= 0) {
        this.boss.specialCd = 7;
        let best: AvatarState | null = null; let bd = 300;
        for (const a of this.avatars.values()) {
          if (!a.alive) continue;
          const d = Math.hypot(a.x - this.boss.x, a.y - this.boss.y);
          if (d < bd) { bd = d; best = a; }
        }
        if (best) {
          best.trappedUntil = this.time + 4;
          this.onEvent?.({ type: 'trap', victim: best.userId, by: this.boss.name });
        }
      }
    }
    // mercy timeout
    if (this.mercy && !this.mercy.done && this.time >= this.mercy.until) {
      const v = this.avatars.get(this.mercy.victim);
      if (v && !v.alive) { v.alive = true; v.hp = v.maxHp * 0.25; const p = this.spawnPos(); v.x = p.x; v.y = p.y; }
      this.mercy.done = true;
    }
  }

  dealDamage(killerId: string, victimId: string, dmg: number) {
    const k = this.avatars.get(killerId), v = this.avatars.get(victimId);
    if (!v?.alive) return;
    v.hp -= dmg;
    if (k) k.damage += dmg;
    v.lastActive = this.time;
    if (k) k.lastActive = this.time;
    if (v.hp <= 0) this.kill(killerId, victimId, dmg);
  }
  kill(killerId: string, victimId: string, dmg?: number) {
    const k = this.avatars.get(killerId), v = this.avatars.get(victimId);
    if (!v) return;
    const cut = v.streak;
    v.alive = false; v.hp = 0;
    v.streak = 0;
    v.respawnAt = this.time + this.cfg.respawnSec;
    if (k) {
      k.kills += 1; k.streak += 1; k.bestStreak = Math.max(k.bestStreak, k.streak);
      k.score += Math.round(this.scores.kill * (this.goldRain ? 2 : 1));
      if (cut >= 4) { k.doubleUntil = this.time + 15; k.powerLabel = 'DOBLE'; }
      if ([5, 15, 30, 50].includes(k.streak)) {
        this.onEvent?.({ type: 'streakTier', userId: killerId, streak: k.streak });
      }
      this.onKill?.({ killer: killerId, victim: victimId, streak: k.streak, cutStreak: cut, dmg });
    }
    // mercy duel trigger
    if (v.bestStreak >= 10 || (v.streak >= 0 && cut >= 10)) {
      this.mercy = { victim: victimId, killer: killerId, until: this.time + 10, done: false };
    }
  }
  respawn(a: AvatarState, hpPct: number) {
    a.alive = true;
    a.poisonTick = 0; a.hp = a.maxHp * hpPct;
    const p = this.spawnPos(); a.x = p.x; a.y = p.y;
    a.shieldUntil = this.time + this.cfg.shieldSec;
    const q = this.pendingRespawnGift.get(a.userId);
    if (q) { q.forEach((f) => f()); this.pendingRespawnGift.delete(a.userId); }
    if (this.mercy?.victim === a.userId) this.mercy.done = true;
    this.onRespawn?.(a.userId);
  }
  mercyRespond(userId: string): boolean {
    if (!this.mercy || this.mercy.done || this.mercy.victim !== userId) return false;
    const v = this.avatars.get(userId);
    if (!v) return false;
    v.alive = true; v.hp = v.maxHp * 0.5;
    const p = this.spawnPos(); v.x = p.x; v.y = p.y;
    v.shieldUntil = this.time + 2;
    this.mercy.done = true;
    const q = this.pendingRespawnGift.get(userId);
    if (q) { q.forEach((f) => f()); this.pendingRespawnGift.delete(userId); }
    this.onRespawn?.(userId);
    return true;
  }
  spawnWave() {
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * Math.PI * 2;
      this.monsters.push({ x: 540 + Math.cos(a) * 520, y: 960 + Math.sin(a) * 560, hp: 30, speed: 40, alive: true });
    }
    if (this.monsters.length > 60) this.monsters.splice(0, this.monsters.length - 60);
  }
  spawnBoss(name: string, fighters: number) {
    const hp = 1200 + fighters * 60;
    this.boss = { name, x: 540, y: 560, hp, maxHp: hp, alive: true, specialCd: 7, top: '', topDmg: 0 };
  }
  killBoss(killerId: string) {
    if (!this.boss) return;
    const bossName = this.boss.name;
    this.boss.alive = false;
    const k = this.avatars.get(killerId);
    if (k) {
      k.kills += 1;
      k.streak += 2;
      k.score += Math.round(this.scores.boss * (this.goldRain ? 2 : 1));
    }
    this.onEvent?.({ type: 'bossDead', killer: killerId, name: bossName });
    // 40% random power-ups
    for (const a of this.avatars.values()) {
      if (!a.alive) continue;
      if (this.rng() < 0.4) {
        const r = this.rng();
        if (r < 0.25) a.fuerzaUntil = this.time + 15;
        else if (r < 0.5) a.speedUntil = this.time + 15;
        else if (r < 0.75) a.doubleUntil = this.time + 15;
        else a.shieldUntil = this.time + 10;
      }
    }
  }
  fireRing(userId: string) {
    const a = this.avatars.get(userId);
    if (!a?.alive) return;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.bullets.push({ x: a.x, y: a.y, vx: Math.cos(ang) * this.cfg.bulletSpeed, vy: Math.sin(ang) * this.cfg.bulletSpeed, owner: userId, dmg: this.cfg.avatarDmg * this.dmgMult(a), life: 1.2 });
    }
  }
  makeAvatar(userId: string, name: string, pic: string | null): AvatarState {
    const p = this.spawnPos();
    return {
      userId, name, pic, x: p.x, y: p.y, hp: this.cfg.avatarHp, maxHp: this.cfg.avatarHp,
      alive: true, respawnAt: 0, streak: 0, bestStreak: 0, kills: 0, damage: 0, monsterKills: 0, bossDamage: 0,
      gifts: 0, diamonds: 0, score: 0, poisonTick: 0,
      shieldUntil: this.time + 1, speedUntil: 0, doubleUntil: 0,
      fuerzaUntil: 0, poisonUntil: 0, healUntil: 0, trappedUntil: 0, fireCd: range(this.rng, 0, 0.5),
      likeCount: 0, lastActive: this.time,
      orbitR: 120 + this.rng() * 300, orbitPhase: this.rng() * Math.PI * 2,
    };
  }
}

export function comboMult(giftsInWindow: number): 1 | 1.5 | 2 | 3 {
  if (giftsInWindow >= 6) return 3;
  if (giftsInWindow >= 4) return 2;
  if (giftsInWindow >= 2) return 1.5;
  return 1;
}
