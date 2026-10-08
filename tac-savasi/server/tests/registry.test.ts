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

describe('TikTok mesaj alanlari (adapter regresyonu)', () => {
  /** 2.5.0 kutuphanesi ic ice alanlar dondurur; eski kod duz alan okuyordu
   *  ve hediyeler hic gelmiyordu. Bu test dogru yollari sabitler. */
  it('mesajlar duz degil ic ice yapidadir', () => {
    const msg = {
      common: { msgId: 'm1' },
      user: { displayId: 'u1', nickname: 'Deniz', profilePictureUrl: 'p.png' },
      gift: { name: 'Rose', describe: 'Rose', diamondCount: 1 },
      repeatCount: 3,
      repeatEnd: 0,
      logId: 'log1',
    };
    // ESKI HATALI YOL: d.userId / d.nickname / d.giftName / d.diamondCount
    expect((msg as unknown as Record<string, unknown>).userId).toBeUndefined();
    expect((msg as unknown as Record<string, unknown>).nickname).toBeUndefined();
    expect((msg as unknown as Record<string, unknown>).giftName).toBeUndefined();
    expect((msg as unknown as Record<string, unknown>).diamondCount).toBeUndefined();
    // DOGRU YOL
    expect(msg.user.nickname).toBe('Deniz');
    expect(msg.gift.diamondCount).toBe(1);
  });
});
