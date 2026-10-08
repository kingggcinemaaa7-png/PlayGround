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
