// Deterministic RNG (mulberry32) + helpers.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
export const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
export const pick = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
