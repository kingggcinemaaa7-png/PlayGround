import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim.js';
import { defaultSimConfig } from '../src/types.js';

describe('sim', () => {
  it('kills increment streak + cut bonus', () => {
    const sim = new Sim(defaultSimConfig(), 42);
    const a = sim.makeAvatar('u1', 'A', null);
    const b = sim.makeAvatar('u2', 'B', null);
    b.streak = 5; b.bestStreak = 5;
    sim.addAvatar(a); sim.addAvatar(b);
    sim.dealDamage('u1', 'u2', 9999);
    expect(a.kills).toBe(1); expect(a.streak).toBe(1);
    expect(sim.time < a.doubleUntil).toBe(true); // cut-the-streak DOBLE
  });
  it('mercy triggers on streak>=10 death and respond revives', () => {
    const sim = new Sim(defaultSimConfig(), 7);
    const a = sim.makeAvatar('u1', 'A', null);
    const b = sim.makeAvatar('u2', 'B', null);
    b.streak = 12; b.bestStreak = 12;
    sim.addAvatar(a); sim.addAvatar(b);
    sim.dealDamage('u1', 'u2', 9999);
    expect(sim.mercy?.victim).toBe('u2');
    expect(sim.mercyRespond('u2')).toBe(true);
    expect(sim.getAvatar('u2')?.alive).toBe(true);
  });
  it('boss spawns scaled + kill grants powerups', () => {
    const sim = new Sim(defaultSimConfig(), 9);
    for (let i = 0; i < 10; i++) sim.addAvatar(sim.makeAvatar('u' + i, 'N' + i, null));
    sim.spawnBoss('Kraken', 10);
    expect(sim.boss!.maxHp).toBe(1200 + 10 * 60);
    sim.killBoss('u0');
    expect(sim.boss!.alive).toBe(false);
  });
  it('deterministic with same seed', () => {
    const run = (seed: number) => {
      const s = new Sim(defaultSimConfig(), seed);
      for (let i = 0; i < 5; i++) s.addAvatar(s.makeAvatar('u' + i, 'N', null));
      for (let i = 0; i < 120; i++) s.update(1 / 60);
      return [...s.avatars.values()].map((a) => [a.x.toFixed(3), a.y.toFixed(3)].join(',')).join('|');
    };
    expect(run(123)).toBe(run(123));
    expect(run(123)).not.toBe(run(999));
  });
});

describe('seviye (LEVEL UP skilleri)', () => {
  it('levelUp +1 verir, maxHp ve can artar', () => {
    const sim = new Sim(defaultSimConfig(), 11);
    const a = sim.makeAvatar('u1', 'A', null);
    sim.addAvatar(a);
    const hp0 = a.maxHp;
    expect(sim.levelUp('u1', 1)).toBe(2);
    expect(a.level).toBe(2);
    expect(a.maxHp).toBe(hp0 + 25);
  });
  it('seviye 5 tavani asilmaz', () => {
    const sim = new Sim(defaultSimConfig(), 12);
    const a = sim.makeAvatar('u1', 'A', null);
    sim.addAvatar(a);
    expect(sim.levelUp('u1', 9)).toBe(5);
    expect(a.level).toBe(5);
    expect(sim.levelUp('u1', 1)).toBe(5);
  });
  it('olu avatar seviye alamaz', () => {
    const sim = new Sim(defaultSimConfig(), 13);
    const a = sim.makeAvatar('u1', 'A', null);
    const b = sim.makeAvatar('u2', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    sim.dealDamage('u2', 'u1', 9999);
    expect(a.alive).toBe(false);
    expect(sim.levelUp('u1', 1)).toBe(0);
  });
  it('yuksek seviye daha cok vurur', () => {
    const sim = new Sim(defaultSimConfig(), 14);
    const a = sim.makeAvatar('u1', 'A', null);
    const b = sim.makeAvatar('u2', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    const d1 = sim.dmgMult(a);
    sim.levelUp('u1', 4);
    expect(sim.dmgMult(a)).toBeGreaterThan(d1);
  });
});

describe('emilim (ABSORB skilli)', () => {
  it('hasari yariya indirir, yarisini cana cevirir', () => {
    const sim = new Sim(defaultSimConfig(), 15);
    const a = sim.makeAvatar('u1', 'A', null);
    const b = sim.makeAvatar('u2', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    b.hp = 60;
    b.absorbUntil = sim.time + 10;
    sim.dealDamage('u1', 'u2', 40);
    // 40 hasar -> 20 hasar + 20 can: 60 - 20 + 20 = 60
    expect(b.hp).toBe(60);
  });
  it('sure bitince normal hasar', () => {
    const sim = new Sim(defaultSimConfig(), 16);
    const a = sim.makeAvatar('u1', 'A', null);
    const b = sim.makeAvatar('u2', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    b.hp = 100;
    b.absorbUntil = sim.time + 0.01;
    for (let i = 0; i < 10; i++) sim.update(1 / 60);
    sim.dealDamage('u1', 'u2', 40);
    expect(b.hp).toBe(60);
  });
});
