import type { SimConfig } from './types.js';

export function streakMult(streak: number, table: SimConfig['streakBonus']): number {
  for (const row of table) if (streak >= row.min) return row.mult;
  return 1;
}

export interface MultOpts {
  streak: number;
  hasDouble?: boolean;   // x2 power-up
  hasFuerza?: boolean;   // x1.5
  hasRage?: boolean;     // x2 rage
  hasGiant?: boolean;    // x1.5 giant
  mutatorDouble?: boolean; // x2 mutator
  level?: number;        // LEVEL UP: her seviye +12% hasar
  table: SimConfig['streakBonus'];
  cap: number;
}

export function damageMultiplier(o: MultOpts): number {
  let m = streakMult(o.streak, o.table);
  if (o.hasFuerza) m *= 1.5;
  if (o.hasDouble) m *= 2;
  if (o.hasRage) m *= 2;
  if (o.hasGiant) m *= 1.5;
  if (o.mutatorDouble) m *= 2;
  if ((o.level ?? 1) > 1) m *= 1 + (Math.min(o.level ?? 1, 5) - 1) * 0.12;
  return Math.min(m, o.cap);
}

export function damageFor(base: number, o: MultOpts): number {
  return base * damageMultiplier(o);
}

export type StreakTier = 0 | 5 | 15 | 30 | 50;
export function streakTier(streak: number): StreakTier {
  if (streak >= 50) return 50;
  if (streak >= 30) return 30;
  if (streak >= 15) return 15;
  if (streak >= 5) return 5;
  return 0;
}
export const STREAK_NAMES: Record<Exclude<StreakTier, 0>, { es: string; tr: string }> = {
  5: { es: 'DOBLE', tr: 'ÇİFT' },
  15: { es: 'IMPARABLE', tr: 'DURDURULAMAZ' },
  30: { es: 'LEYENDA', tr: 'EFSANE' },
  50: { es: 'MÍTICO', tr: 'MİTİK' },
};
