import { describe, it, expect } from 'vitest';
import { normalizeCommand } from '../src/commands.js';
import { giftTier } from '../src/types.js';
import { layoutViolations } from '../src/layout.js';
import { fmtNum, upper, truncateNick } from '../src/locale.js';

describe('commands', () => {
  it('shield aliases all languages', () => {
    expect(normalizeCommand('!escudo')).toBe('shield');
    expect(normalizeCommand('!kalkan')).toBe('shield');
    expect(normalizeCommand('!shield')).toBe('shield');
    expect(normalizeCommand('!KALKAN')).toBe('shield');
  });
  it('turkish dotless I / dotted İ', () => {
    expect(normalizeCommand('!ATES')).toBe('fire'); // tr-TR lower of ATES variants
    expect(normalizeCommand('!ateş')).toBe('fire');
    expect(normalizeCommand('!ates')).toBe('fire');
    expect(normalizeCommand('!CEVAP')).toBe('respond');
  });
  it('tolerates 1-letter typo', () => {
    expect(normalizeCommand('!shild')).toBe('shield');
    expect(normalizeCommand('!fueg')).toBe('fire');
    expect(normalizeCommand('!responde')).toBe('respond');
  });
  it('rejects garbage', () => {
    expect(normalizeCommand('!hello')).toBeNull();
    expect(normalizeCommand('')).toBeNull();
  });
});

describe('gifts', () => {
  it('tier mapping', () => {
    expect(giftTier(0)).toBe(1); expect(giftTier(1)).toBe(1); expect(giftTier(4)).toBe(1);
    expect(giftTier(5)).toBe(2); expect(giftTier(49)).toBe(2);
    expect(giftTier(50)).toBe(3); expect(giftTier(199)).toBe(3);
    expect(giftTier(200)).toBe(4); expect(giftTier(999)).toBe(4);
    expect(giftTier(1000)).toBe(5); expect(giftTier(5000)).toBe(5);
  });
});

describe('layout', () => {
  it('no overlaps with/without facecam', () => {
    expect(layoutViolations(false)).toEqual([]);
    expect(layoutViolations(true)).toEqual([]);
  });
});

describe('locale', () => {
  it('number formats differ MX vs ES', () => {
    const mx = fmtNum('es-MX', 13992505);
    const es = fmtNum('es-ES', 13992505);
    expect(mx).toContain(','); expect(es).toContain('.');
  });
  it('turkish uppercase i->İ', () => {
    expect(upper('tr-TR', 'maç')).toBe('MAÇ');
    expect(upper('tr-TR', 'seri')).toBe('SERİ');
  });
  it('truncate nicknames at 14 graphemes', () => {
    expect([...truncateNick('abcdefghijklmnop')].length).toBeLessThanOrEqual(14);
  });
});
