// Pure fixed-timestep simulation: no rendering, no DOM. Deterministic given seed.
import { mulberry32, type Rng, range } from './rng.js';
import { damageMultiplier } from './damage.js';
import type { AvatarState, SimConfig, Minion } from './types.js';

export interface Bullet { x: number; y: number; vx: number; vy: number; owner: string; dmg: number; life: number; bounces?: number; }
export interface Monster { x: number; y: number; hp: number; speed: number; alive: boolean; }
export interface Boss { name: string; x: number; y: number; hp: number; maxHp: number; alive: boolean; specialCd: number; top: string; topDmg: number; phase?: number; }
export type PowerKind = 'fuerza' | 'velocidad' | 'veneno' | 'curacion' | 'doble'
  | 'rage' | 'ghost' | 'vamp' | 'giant' | 'reflect' | 'chain' | 'frost' | 'shield';

export type SimEvent =
  | { type: 'trap'; victim: string; by: string }
  | { type: 'castleDown' }
  | { type: 'bossDead'; killer: string; name: string }
  | { type: 'streakTier'; userId: string; streak: number }
  /** mermi/hayalet isabeti — istemci kıvılcım + hasar sayısı + ses için */
  | { type: 'hit'; x: number; y: number; victim: string; dmg: number; crit: boolean; reflect: boolean }
  /** boss faz değişimi (can eşiği) */
  | { type: 'bossPhase'; phase: number }
  /** güç verildi — görsel kimlik efekti için */
  | { type: 'power'; userId: string; kind: string; quiet: boolean }
  /** yörünge yıldızı bir düşmana değdi (istemci parçacık çıkarır) */
  | { type: 'orbHit'; x: number; y: number; owner: string };

export interface SimEvents {
  kills: { killer: string; victim: string; streak: number; cutStreak: number }[];
  announcements: string[];
  goldRain: boolean;
}
export interface MercyState { victim: string; killer: string; until: number; done: boolean }

const ARENA_R = 430;
/**
 * Oyuncuların birbirine en yakın duracağı mesafe. Yörünge silahının yarıçapı
 * (74) BUNDAN BÜYÜK olmak zorunda: aksi halde ayrışma kuvveti iki oyuncuyu
 * birbirinden uzak tutar ve yıldız hiçbir rakibe ulaşamaz.
 */
export const SEPARATION_PX = 52;
/** Merhamet penceresi ve bekleme süreleri (dokümana birebir uyar). */
export const MERCY_WINDOW_SEC = 10;
export const MERCY_COOLDOWN_SEC = 25;
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
  onKill: ((k: SimEvents['kills'][number] & { dmg?: number; chain?: { x: number; y: number }[] }) => void) | null = null;
  /** Discrete sim events (boss trap, castle fall, boss death, streak tiers). */
  onEvent: ((e: SimEvent) => void) | null = null;
  /** Fired whenever an avatar respawns (so queued gifts can be applied). */
  onRespawn: ((userId: string) => void) | null = null;
  /** Client-driven: kill/monster score is doubled during gold rain. */
  goldRain = false;
  scores = { kill: 10, monster: 3, boss: 50 };
  minions: Minion[] = [];
  private cloneSeq = 0;
  private chainDepth = 0;
  /** son merhamet teklifi (aynı kişiye spam engeli) */
  private mercyAt = new Map<string, number>();

  constructor(public cfg: SimConfig, public seed = 1234) { this.rng = mulberry32(seed); }

  /** tek noktadan olay yayını (istemci görsel/ses geri bildirimi için) */
  private emit(e: SimEvent) { this.onEvent?.(e); }
  addAvatar(a: AvatarState) { this.avatars.set(a.userId, a); }
  getAvatar(id: string) { return this.avatars.get(id); }

  speedOf(a: AvatarState): number {
    let s = this.cfg.avatarSpeed;
    if (this.cfg.mutator === 'speed') s *= 1.3;
    if (this.time < a.speedUntil) s *= 1.7;
    if (this.time < a.ghostUntil) s *= 1.4;
    if (this.time < a.rageUntil) s *= 1.25;
    if (this.time > 0 && this.time < this.tideUntil) s *= 0.55;
    if (this.time < a.trappedUntil) s = 0;
    return s;
  }
  dmgMult(a: AvatarState): number {
    return damageMultiplier({
      streak: a.streak, table: this.cfg.streakBonus, cap: this.cfg.damageCap,
      hasDouble: this.time < a.doubleUntil,
      hasFuerza: this.time < a.fuerzaUntil,
      hasRage: this.time < a.rageUntil,
      hasGiant: this.time < a.giantUntil && a.giantActive,
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
      if (this.time < o.ghostUntil) continue; // hayalet hedeflenemez
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (this.boss?.alive) {
      const d = Math.hypot(this.boss.x - a.x, this.boss.y - a.y);
      // ÖNCEKİ HALİ `Math.max(bd, 260)` idi: 100px'teki bir rakibe karşı
      // 240px'teki boss seçiliyordu. Sadece gerçekten en yakın olan kazanır.
      if (d < bd) { best = this.boss; bd = d; }
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
        if (this.time >= a.respawnAt) this.respawn(a, this.cfg.respawnHpPct);
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
      // Faz 2.6 — ayrışma: aynı noktaya üşüşen oyuncuları hafifçe it.
      // Kalabalık arttıkça itme gücü artar, arena genişlemeden okunurluk korunur.
      let sepX = 0, sepY = 0, near = 0;
      for (const o of this.avatars.values()) {
        if (o.userId === a.userId || !o.alive) continue;
        const ox = o.x - a.x, oy = o.y - a.y;
        const od = Math.hypot(ox, oy);
        if (od > SEPARATION_PX || od < 0.001) continue;
        near++;
        const push = (SEPARATION_PX - od) / SEPARATION_PX;
        sepX -= (ox / od) * push;
        sepY -= (oy / od) * push;
      }
      if (near > 0) {
        const crowd = Math.min(2.2, 1 + near * 0.18);
        a.x += sepX * 46 * crowd * dt;
        a.y += sepY * 46 * crowd * dt;
      }
      a.x += Math.cos(ang) * sp * dt; a.y += Math.sin(ang) * sp * dt;
      const dx = a.x - 540, dy = (a.y - 960) / 1.2;
      const d = Math.hypot(dx, dy);
      if (d > ARENA_R) { a.x = 540 + dx / d * ARENA_R; a.y = 960 + dy / d * ARENA_R * 1.2; }
      // fire
      a.fireCd -= dt;
      if (a.fireCd <= 0) {
        const tgt = this.nearestEnemy(a);
        if (tgt) {
          const tx = (tgt as AvatarState).x ?? (tgt as Monster).x, ty = (tgt as AvatarState).y ?? (tgt as Monster).y;
          const ang2 = Math.atan2(ty - a.y, tx - a.x);
          // nişan göstergesi: hedefe kilitlen + atış öncesi kısa hazırlık
          a.aimX = tx; a.aimY = ty; a.aimT = 0;
          a.fireCd = this.cfg.fireInterval;
          const dmg = this.cfg.avatarDmg * this.dmgMult(a);
          this.bullets.push({ x: a.x, y: a.y, vx: Math.cos(ang2) * this.cfg.bulletSpeed, vy: Math.sin(ang2) * this.cfg.bulletSpeed, owner: a.userId, dmg, life: 1.4 });
        } else a.fireCd = 0.1;
      } else if (a.fireCd < 0.22) {
        // atışa hazırlanırken nişan çizgisi uzar
        a.aimT = 1 - a.fireCd / 0.22;
      }

      // --- yörünge silahı: profil fotoğrafının etrafında dönen yıldızlar ---
      // Her avatar iki yıldız taşır; yıldız bir düşmana değdiğinde hasar verir.
      // Dönüş hızı güçlerle değişir, DEV iki kat yörüngedir.
      if (this.cfg.orbit.count > 0) {
        const orbGiant = a.giantActive && this.time < a.giantUntil;
        const spinMul = (orbGiant ? 1.35 : 1) * (this.time < a.rageUntil ? 1.5 : 1);
        a.orbAngle = (a.orbAngle + dt * this.cfg.orbit.spin * spinMul) % (Math.PI * 2);
        a.orbCd -= dt;
        if (a.orbCd <= 0) {
          a.orbCd = this.cfg.orbit.cd;
          const R = this.cfg.orbit.radius * (orbGiant ? 1.5 : 1);
          const n = this.cfg.orbit.count;
          for (let i = 0; i < n; i++) {
            const an = a.orbAngle + (i * Math.PI * 2) / n;
            const ox = a.x + Math.cos(an) * R;
            const oy = a.y + Math.sin(an) * R;
            // en yakın düşmana değdiyse vur (canavar/boss dahil değil: onlar
            // zaten çok kalabalık, yıldız onları öldürürdü)
            let victim: AvatarState | null = null;
            let bd = 30;
            for (const o of this.avatars.values()) {
              if (o.userId === a.userId || !o.alive) continue;
              const d = Math.hypot(o.x - ox, o.y - oy);
              if (d < bd) { bd = d; victim = o; }
            }
            if (victim) {
              this.dealDamage(a.userId, victim.userId, this.cfg.orbit.dmg * this.dmgMult(a));
              this.emit({
                type: 'hit', x: victim.x, y: victim.y, victim: victim.userId,
                dmg: Math.round(this.cfg.orbit.dmg * this.dmgMult(a)), crit: false, reflect: false,
              });
              this.emit({ type: 'orbHit', x: ox, y: oy, owner: a.userId });
            }
          }
        }
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
        if (this.time < o.ghostUntil) continue; // mermi icinden gecer
        if (this.time < o.shieldUntil) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) < 22) {
          if (this.time < o.reflectUntil && (b.bounces ?? 0) < 2) {
            // YANSITMA: mermi sahibine geri doner, %20 guclenir
            const src = this.avatars.get(b.owner);
            if (src?.alive) {
              const ang = Math.atan2(src.y - o.y, src.x - o.x);
              b.owner = o.userId;
              b.vx = Math.cos(ang) * this.cfg.bulletSpeed;
              b.vy = Math.sin(ang) * this.cfg.bulletSpeed;
              b.dmg *= 1.2; b.life = Math.min(b.life, 1.2);
              b.bounces = (b.bounces ?? 0) + 1;
            }
            this.emit({ type: 'hit', x: o.x, y: o.y, victim: o.userId, dmg: Math.round(b.dmg), crit: false, reflect: true });
            hit = true; break;
          }
          this.dealDamage(b.owner, o.userId, b.dmg);
          this.emit({ type: 'hit', x: o.x, y: o.y, victim: o.userId, dmg: Math.round(b.dmg), crit: b.dmg >= this.cfg.avatarDmg * 2, reflect: false });
          hit = true; break;
        }
      }
      if (!hit && this.boss?.alive && Math.hypot(this.boss.x - b.x, this.boss.y - b.y) < 60) {
        this.boss.hp -= b.dmg;
        const atk = this.avatars.get(b.owner);
        if (atk) { atk.damage += b.dmg; atk.bossDamage += b.dmg; }
        this.emit({ type: 'hit', x: this.boss.x, y: this.boss.y, victim: 'boss', dmg: Math.round(b.dmg), crit: true, reflect: false });
        // faz geçişleri: can %66 / %33 eşikleri
        const pct = this.boss.hp / this.boss.maxHp;
        const ph = pct <= 0.33 ? 3 : pct <= 0.66 ? 2 : 1;
        if (ph > (this.boss.phase ?? 1)) { this.boss.phase = ph; this.emit({ type: 'bossPhase', phase: ph }); }
        if (this.boss.hp <= 0) this.killBoss(b.owner);
        hit = true;
      }
      if (!hit) {
        for (const m of this.monsters) {
          if (!m.alive) continue;
          if (Math.hypot(m.x - b.x, m.y - b.y) < 24) {
            m.hp -= b.dmg;
            this.emit({ type: 'hit', x: m.x, y: m.y, victim: 'monster', dmg: Math.round(b.dmg), crit: false, reflect: false });
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
    this.updateMinions(dt);
    // DEV süresi bitince +100 can geri alınır
    for (const a of this.avatars.values()) {
      if (a.giantActive && this.time >= a.giantUntil) {
        a.giantActive = false;
        a.maxHp = Math.max(1, a.maxHp - 100);
        a.hp = Math.min(a.hp, a.maxHp);
      }
    }
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
      this.emit({ type: 'castleDown' });
    }
    // boss special
    if (this.boss?.alive) {
      this.boss.specialCd -= dt;
      if (this.boss.specialCd <= 0) {
        this.boss.specialCd = 7;
        let best: AvatarState | null = null; let bd = 300;
        for (const a of this.avatars.values()) {
          if (!a.alive) continue;
          if (this.time < a.ghostUntil) continue;
          const d = Math.hypot(a.x - this.boss.x, a.y - this.boss.y);
          if (d < bd) { bd = d; best = a; }
        }
        if (best) {
          best.trappedUntil = this.time + 4;
          this.emit({ type: 'trap', victim: best.userId, by: this.boss.name });
        }
      }
    }
    // mercy timeout
    if (this.mercy && !this.mercy.done && this.time >= this.mercy.until) {
      const v = this.avatars.get(this.mercy.victim);
      this.mercy.done = true;
      // respawn() kullanılır: onRespawn tetiklenir, bekleyen hediye akışı boşalmaz
      if (v && !v.alive) this.respawn(v, 0.25);
    }
  }

  dealDamage(killerId: string, victimId: string, dmg: number) {
    const k = this.avatars.get(killerId), v = this.avatars.get(victimId);
    if (!v?.alive) return;
    v.hp -= dmg;
    if (k) {
      k.damage += dmg;
      if (this.time < k.vampUntil) k.hp = Math.min(k.maxHp, k.hp + dmg * 0.35);
    }
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
      let chain: { x: number; y: number }[] | undefined;
      if (this.chainDepth === 0 && this.time < k.chainUntil) {
        this.chainDepth++;
        try {
          chain = [];
          const near = [...this.avatars.values()]
            .filter((o) => o.userId !== killerId && o.alive && this.time >= o.ghostUntil)
            .map((o) => ({ o, d: Math.hypot(o.x - v.x, o.y - v.y) }))
            .filter((e) => e.d <= 160)
            .sort((p, q) => p.d - q.d)
            .slice(0, 3);
          for (const e of near) {
            this.dealDamage(killerId, e.o.userId, (dmg ?? 10) * 0.6);
            chain.push({ x: e.o.x, y: e.o.y });
          }
        } finally { this.chainDepth = 0; }
        if (!chain.length) chain = undefined;
      }
      if ([5, 15, 30, 50].includes(k.streak)) {
        this.emit({ type: 'streakTier', userId: killerId, streak: k.streak });
      }
      // Merhamet penceresi onKill'den ÖNCE açılmalı: istemci (game.onKill)
      // bannerı bu anda gösteriyor. Önce kurulmadığında hiç görünmüyordu.
      if (this.shouldOfferMercy(v, cut) && !this.mercyFor(victimId)) {
        this.mercy = { victim: victimId, killer: killerId, until: this.time + MERCY_WINDOW_SEC, done: false };
        this.mercyAt.set(victimId, this.time);
      }
      this.onKill?.({ killer: killerId, victim: victimId, streak: k.streak, cutStreak: cut, dmg, chain });
    }
  }
  /**
   * Merhamet koşulu: yalnızca ÖLÜM ANINDAKİ seri/cut verisine bakar.
   * `bestStreak` hayatta kaldıktan sonra da >=10 kalıcı olduğu için önceden
   * kullanılıyordu ve merhamet sürekli yeniden tetikleniyordu.
   */
  private shouldOfferMercy(v: AvatarState, cut: number): boolean {
    const pre = Math.max(cut, 0);
    return pre >= 10 || v.streak >= 10;
  }
  /** Aynı kişiye kısa sürede tekrar merhamet açılmaz. */
  private mercyFor(userId: string): boolean {
    const last = this.mercyAt.get(userId) ?? -1e9;
    return this.time - last < MERCY_COOLDOWN_SEC;
  }
  respawn(a: AvatarState, hpPct: number) {
    a.alive = true;
    a.poisonTick = 0; a.hp = a.maxHp * hpPct;
    const p = this.spawnPos(); a.x = p.x; a.y = p.y;
    a.shieldUntil = this.time + this.cfg.shieldSec;
    const q = this.pendingRespawnGift.get(a.userId);
    if (q) { q.forEach((f) => f()); this.pendingRespawnGift.delete(a.userId); }
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
  // ---- güç sistemi ----

  static readonly POWER_DURATION: Record<string, number> = {
    fuerza: 15, velocidad: 15, veneno: 15, curacion: 15, doble: 15,
    rage: 8, ghost: 4, vamp: 10, giant: 8, reflect: 6, chain: 10,
    frost: 0, shield: 10,
  };

  /** Merkezi güç dağıtımı: süreleri kurar, DEV canını ekler, DONMA anında patlar. */
  grant(userId: string, kind: string): boolean {
    const a = this.avatars.get(userId);
    if (!a?.alive) return false;
    const T = this.time;
    const dur = (Sim.POWER_DURATION as Record<string, number>)[kind] ?? 0;
    switch (kind) {
      case 'fuerza': a.fuerzaUntil = T + dur; break;
      case 'velocidad': a.speedUntil = T + dur; break;
      case 'veneno': a.poisonUntil = T + dur; break;
      case 'curacion': a.healUntil = T + dur; break;
      case 'doble': a.doubleUntil = T + dur; break;
      case 'rage': a.rageUntil = T + dur; break;
      case 'ghost': a.ghostUntil = T + dur; break;
      case 'vamp': a.vampUntil = T + dur; break;
      case 'giant':
        a.giantUntil = T + dur;
        if (!a.giantActive) { a.giantActive = true; a.maxHp += 100; a.hp = Math.min(a.maxHp, a.hp + 100); }
        break;
      case 'reflect': a.reflectUntil = T + dur; break;
      case 'chain': a.chainUntil = T + dur; break;
      case 'shield': a.shieldUntil = T + dur; break;
      case 'frost': this.frostNova(userId); break;
      default: return false;
    }
    a.lastActive = T;
    this.emit({ type: 'power', userId, kind, quiet: false });
    return true;
  }

  /** DONMA: 130px içindeki düşmanları 3 sn dondurur. Dondurulan sayısını döndürür. */
  frostNova(userId: string, radius = 130, dur = 3): number {
    const a = this.avatars.get(userId);
    if (!a?.alive) return 0;
    let n = 0;
    for (const o of this.avatars.values()) {
      if (o.userId === userId || !o.alive) continue;
      if (Math.hypot(o.x - a.x, o.y - a.y) <= radius) {
        o.trappedUntil = Math.max(o.trappedUntil, this.time + dur);
        n++;
      }
    }
    return n;
  }

  /** GÖLGE KLON: 12 sn yaşayan, sahibinin %70 hasarıyla ateş eden kopya. */
  spawnClone(userId: string): boolean {
    const a = this.avatars.get(userId);
    if (!a?.alive) return false;
    const old = this.minions.find((m) => m.owner === userId);
    if (old) { old.until = this.time + 12; old.hp = old.maxHp; return true; }
    if (this.minions.length >= 24) return false;
    this.minions.push({
      id: `${userId}#${++this.cloneSeq}`, owner: userId,
      x: a.x + 60, y: a.y, hp: 50, maxHp: 50, until: this.time + 12, cd: 0,
    });
    return true;
  }

  private updateMinions(dt: number) {
    const keep: Minion[] = [];
    for (const m of this.minions) {
      const o = this.avatars.get(m.owner);
      if (!o?.alive || this.time >= m.until || m.hp <= 0) continue;
      // sahibi etrafında yörüngede takip
      const ang = this.time * 2 + (m.id.charCodeAt(m.id.length - 1) % 6);
      const tx = o.x + Math.cos(ang) * 70, ty = o.y + Math.sin(ang) * 70;
      const d = Math.hypot(tx - m.x, ty - m.y);
      if (d > 4) { m.x += ((tx - m.x) / d) * 150 * dt; m.y += ((ty - m.y) / d) * 150 * dt; }
      // ateş
      m.cd -= dt;
      if (m.cd <= 0) {
        let best: { x: number; y: number } | null = null; let bd = this.cfg.range;
        for (const e of this.avatars.values()) {
          if (e.userId === m.owner || !e.alive) continue;
          if (this.time < e.ghostUntil) continue;
          const dd = Math.hypot(e.x - o.x, e.y - o.y);
          if (dd < bd) { bd = dd; best = e; }
        }
        if (best) {
          m.cd = 0.7;
          const a2 = Math.atan2(best.y - m.y, best.x - m.x);
          const om = this.avatars.get(m.owner);
          const dmg = this.cfg.avatarDmg * (om ? this.dmgMult(om) : 1) * 0.7;
          this.bullets.push({ x: m.x, y: m.y, vx: Math.cos(a2) * this.cfg.bulletSpeed, vy: Math.sin(a2) * this.cfg.bulletSpeed, owner: m.owner, dmg, life: 1.2 });
        } else m.cd = 0.15;
      }
      keep.push(m);
    }
    this.minions.length = 0; this.minions.push(...keep);
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
    this.emit({ type: 'bossDead', killer: killerId, name: bossName });
    // 40% random power-ups (full pool, new powers included)
    const pool = ['fuerza', 'velocidad', 'doble', 'shield', 'rage', 'ghost', 'vamp', 'giant', 'reflect', 'chain'];
    for (const a of this.avatars.values()) {
      if (!a.alive) continue;
      if (this.rng() < 0.4) this.grant(a.userId, pool[Math.floor(this.rng() * pool.length)]);
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
      fuerzaUntil: 0, poisonUntil: 0, healUntil: 0,
      rageUntil: 0, ghostUntil: 0, vampUntil: 0,
      giantUntil: 0, giantActive: false,
      reflectUntil: 0, chainUntil: 0,
      trappedUntil: 0, fireCd: range(this.rng, 0, 0.5),
      likeCount: 0, lastActive: this.time,
      orbitR: 120 + this.rng() * 300, orbitPhase: this.rng() * Math.PI * 2,
      aimX: p.x, aimY: p.y, aimT: 0,
      orbAngle: this.rng() * Math.PI * 2, orbCd: this.cfg.orbit.cd,
    };
  }
}

export function comboMult(giftsInWindow: number): 1 | 1.5 | 2 | 3 {
  if (giftsInWindow >= 6) return 3;
  if (giftsInWindow >= 4) return 2;
  if (giftsInWindow >= 2) return 1.5;
  return 1;
}
