import { describe, it, expect } from 'vitest';
import { Sim, POISON_DAMAGE, POISON_RADIUS } from '../src/sim.js';
import { defaultSimConfig } from '../src/types.js';

const cfg = () => defaultSimConfig();

describe('zehir aurası (AURA DE VENENO)', () => {
  it('yarıçap içindeki düşmana 0.5 saniyede bir 8 hasar verir', () => {
    const sim = new Sim(cfg(), 1);
    const a = sim.makeAvatar('u1', 'Zehir', null);
    const v = sim.makeAvatar('u2', 'Hedef', null);
    sim.addAvatar(a); sim.addAvatar(v);
    v.x = a.x + POISON_RADIUS - 2;
    v.y = a.y;
    a.poisonUntil = sim.time + 2;
    const before = v.hp;
    for (let i = 0; i < 30; i++) sim.update(1 / 60); // 0.5 s
    expect(before - v.hp).toBeGreaterThanOrEqual(POISON_DAMAGE * 0.9);
  });

  it('yarıçap dışındakine hasar vermez', () => {
    const sim = new Sim(cfg(), 2);
    const a = sim.makeAvatar('u1', 'Z', null);
    const v = sim.makeAvatar('u2', 'Uzak', null);
    sim.addAvatar(a); sim.addAvatar(v);
    v.x = a.x + POISON_RADIUS + 40;
    a.poisonUntil = sim.time + 2;
    const before = v.hp;
    for (let i = 0; i < 30; i++) sim.update(1 / 60);
    expect(v.hp).toBeCloseTo(before, 3);
  });
});

describe('puan (skor) sistemi', () => {
  it('kill +10', () => {
    const sim = new Sim(cfg(), 3);
    const a = sim.makeAvatar('u1', 'K', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    sim.dealDamage('u1', 'u2', 999);
    expect(a.score).toBe(10);
  });

  it('gold rain sırasında kill x2', () => {
    const sim = new Sim(cfg(), 4);
    sim.goldRain = true;
    const a = sim.makeAvatar('u1', 'K', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    sim.dealDamage('u1', 'u2', 999);
    expect(a.score).toBe(20);
  });

  it('boss öldürme +50 ve bossDead olayı', () => {
    const sim = new Sim(cfg(), 5);
    const a = sim.makeAvatar('u1', 'K', null);
    sim.addAvatar(a);
    let dead: { killer: string } | null = null;
    sim.onEvent = (e) => { if (e.type === 'bossDead') dead = { killer: e.killer }; };
    sim.spawnBoss('kraken', 1);
    sim.killBoss('u1');
    expect(a.score).toBe(50);
    expect(dead).not.toBeNull();
  });

  it('goldrain mutator canavar puanını 2 katlar (gold rain ile 4x)', () => {
    const sim = new Sim({ ...cfg(), mutator: 'goldrain' }, 6);
    sim.goldRain = true;
    const a = sim.makeAvatar('u1', 'K', null);
    sim.addAvatar(a);
    sim.spawnWave();
    const m = sim.monsters[0];
    m.hp = 1;
    m.x = a.x + 5; m.y = a.y;
    sim.bullets.push({ x: a.x + 5, y: a.y, vx: 0, vy: 0, owner: 'u1', dmg: 10, life: 1 });
    sim.update(1 / 60);
    expect(a.monsterKills).toBe(1);
    expect(a.score).toBe(12); // 3 * 2 (gold rain) * 2 (mutator)
  });
});

describe('kale (CASTILLO)', () => {
  it('yıkılınca olay fırlatır, can sıfırlanır ve dalga temizlenir', () => {
    const sim = new Sim(cfg(), 7);
    const a = sim.makeAvatar('u1', 'K', null);
    sim.addAvatar(a);
    sim.spawnWave();
    let down = 0;
    sim.onEvent = (e) => { if (e.type === 'castleDown') down++; };
    sim.castleHp = 1;
    sim.monsters[0].x = 540; sim.monsters[0].y = 960; // reaches the castle
    for (let i = 0; i < 120 && down === 0; i++) sim.update(1 / 60);
    expect(down).toBeGreaterThan(0);
    expect(sim.castleHp).toBe(sim.castleMax);
    expect(sim.monsters.length).toBe(0);
  });
});

describe('boss yakalama (ATRAPADA)', () => {
  it('7 saniyede bir yakalar ve olay fırlatır', () => {
    const sim = new Sim(cfg(), 8);
    const a = sim.makeAvatar('u1', 'Yakalanan', null);
    sim.addAvatar(a);
    sim.spawnBoss('kraken', 1);
    sim.boss!.x = a.x; sim.boss!.y = a.y;
    sim.boss!.specialCd = 0.01;
    let trapped = 0;
    sim.onEvent = (e) => { if (e.type === 'trap') trapped++; };
    for (let i = 0; i < 30; i++) sim.update(1 / 60);
    expect(trapped).toBe(1);
    expect(sim.getAvatar('u1')!.trappedUntil).toBeGreaterThan(sim.time);
  });
});

describe('doğuş geri çağırması (kuyruktaki hediyeler)', () => {
  it('avatar öldüğünde de doğduğunda onRespawn tetiklenir', () => {
    const sim = new Sim(cfg(), 9);
    const a = sim.makeAvatar('u1', 'D', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    const seen: string[] = [];
    sim.onRespawn = (id) => seen.push(id);
    sim.dealDamage('u1', 'u2', 999);          // v dies
    for (let i = 0; i < 60 * 4; i++) sim.update(1 / 60); // wait out the 3s respawn
    expect(seen).toContain('u2');
  });

  it('merhametle diriltmede de tetiklenir', () => {
    const sim = new Sim(cfg(), 10);
    const a = sim.makeAvatar('u1', 'M', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    v.streak = 12; v.bestStreak = 12;
    const seen: string[] = [];
    sim.onRespawn = (id) => seen.push(id);
    sim.dealDamage('u1', 'u2', 999);
    expect(sim.mercyRespond('u2')).toBe(true);
    expect(seen).toContain('u2');
  });
});

describe('seri kademe olayı', () => {
  it('5/15/30/50 eşiklerinde streakTier fırlatır', () => {
    const sim = new Sim(cfg(), 11);
    const a = sim.makeAvatar('u1', 'K', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    const tiers: number[] = [];
    sim.onEvent = (e) => { if (e.type === 'streakTier') tiers.push(e.streak); };
    for (let i = 0; i < 6; i++) { sim.dealDamage('u1', 'u2', 999); v.alive = true; v.hp = 50; }
    expect(tiers).toContain(5);
  });
});
