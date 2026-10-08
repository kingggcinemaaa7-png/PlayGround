import { describe, it, expect } from 'vitest';
import { Registry, cleanName } from '../src/registry.js';

describe('registry', () => {
  it('caps fighters and queues spectators', () => {
    const r = new Registry(3);
    for (let i = 0; i < 5; i++) r.ensure({ type: 'join', id: `j${i}`, userId: `u${i}`, name: `N${i}`, pic: null });
    expect(r.fighters().length).toBe(3);
  });
  it('dedupes event ids', () => {
    const r = new Registry(60);
    expect(r.isDup('x')).toBe(false);
    expect(r.isDup('x')).toBe(true);
  });
  it('rate limits commands', () => {
    const r = new Registry(60);
    expect(r.rateOk('u1', 'fire', 1000)).toBe(true);
    expect(r.rateOk('u1', 'fire', 1500)).toBe(false);
    expect(r.rateOk('u1', 'fire', 5000)).toBe(true);
  });
  it('profanity filter replaces name', () => {
    expect(cleanName('amk player')).toMatch(/^Player/);
    expect(cleanName('Elif')).toBe('Elif');
  });
});
