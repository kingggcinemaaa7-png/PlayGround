import { describe, it, expect } from 'vitest';
import { damageMultiplier, streakTier } from '../src/damage.js';
import { defaultSimConfig } from '../src/types.js';

const cfg = defaultSimConfig();
describe('damage math', () => {
  it('base x1 with no bonuses', () => {
    expect(damageMultiplier({ streak: 0, table: cfg.streakBonus, cap: 3 })).toBe(1);
  });
  it('streak tiers', () => {
    expect(streakTier(4)).toBe(0);
    expect(streakTier(5)).toBe(5);
    expect(streakTier(15)).toBe(15);
    expect(streakTier(30)).toBe(30);
    expect(streakTier(50)).toBe(50);
  });
  it('streak mult values', () => {
    expect(damageMultiplier({ streak: 5, table: cfg.streakBonus, cap: 3 })).toBeCloseTo(1.1);
    expect(damageMultiplier({ streak: 30, table: cfg.streakBonus, cap: 3 })).toBeCloseTo(1.5);
  });
  it('caps at x3', () => {
    const m = damageMultiplier({ streak: 50, table: cfg.streakBonus, cap: 3, hasDouble: true, hasFuerza: true, mutatorDouble: true });
    expect(m).toBe(3);
  });
  it('double stacks then caps', () => {
    expect(damageMultiplier({ streak: 0, table: cfg.streakBonus, cap: 3, hasDouble: true })).toBe(2);
  });
});
