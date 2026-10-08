import { describe, it, expect } from 'vitest';
import { GiftRegistry, normGiftName, DEFAULT_GIFTS } from '../src/gifts.js';
import { giftTier } from '../src/types.js';

describe('hediye ismi normalizasyonu', () => {
  it('emoji/bosluk/tire temizler, Turkce kucultur', () => {
    expect(normGiftName('Ice-Cream 💖')).toBe('icecream');
    expect(normGiftName('  GAME Shield ')).toBe('gameshield');
    expect(normGiftName('GÜL')).toBe('gul');
  });
});

describe('kayit defteri', () => {
  it('varsayilan katalog yuklenir', () => {
    const r = new GiftRegistry();
    expect(r.list().length).toBe(DEFAULT_GIFTS.length);
    expect(r.lookup('Rose')?.diamonds).toBe(1);
    expect(r.lookup('🌹rose!!')?.id).toBe('rose');
  });
  it('bilinmeyen hediye null doner (kademe yedegi oyunda)', () => {
    expect(new GiftRegistry().lookup('olmayan')).toBeNull();
  });
  it('ekle/duzenle/sil', () => {
    const r = new GiftRegistry();
    r.upsert({ id: '', name: 'Dragon', icon: '🐉', diamonds: 500, enabled: true, action: 'rage' });
    expect(r.lookup('dragon')?.action).toBe('rage');
    expect(r.setDiamonds('dragon', 1500)).toBe(true);
    expect(r.tierOf(r.lookup('dragon')!)).toBe(5);
    expect(r.setEnabled('dragon', false)).toBe(true);
    expect(r.lookup('dragon')?.enabled).toBe(false);
    expect(r.remove('dragon')).toBe(true);
    expect(r.lookup('dragon')).toBeNull();
  });
  it('kaydet/yukle birlesir', () => {
    const r = new GiftRegistry();
    r.setAction('rose', 'fire');
    const json = r.toJSON();
    const r2 = new GiftRegistry();
    expect(r2.fromJSON(json)).toBeGreaterThan(0);
    expect(r2.lookup('rose')?.action).toBe('fire');
  });
  it('bozuk kayit guvenli atlanir', () => {
    const r = new GiftRegistry();
    expect(r.fromJSON([{ nope: 1 }, null, 'x'] as unknown as never[])).toBe(0);
  });
  it('kayitli katalog varsayilanlari tamamen degistirir (silinen donmez)', () => {
    const r = new GiftRegistry();
    r.fromJSON([{ id: 'dragon', name: 'Dragon', icon: '🐉', diamonds: 500, enabled: true, action: 'rage' }]);
    expect(r.list()).toHaveLength(1);
    expect(r.lookup('rose')).toBeNull();
    expect(r.lookup('dragon')?.action).toBe('rage');
  });
  it('bos kayit bos katalog verir', () => {
    const r = new GiftRegistry();
    r.fromJSON([]);
    expect(r.list()).toHaveLength(0);
  });
  it('reset varsayilanlari geri getirir', () => {
    const r = new GiftRegistry();
    r.remove('rose');
    r.reset();
    expect(r.lookup('rose')?.action).toBe('tier');
  });
  it('kademe eslemesi dogru', () => {
    expect(giftTier(1)).toBe(1);
    expect(giftTier(200)).toBe(4);
    expect(giftTier(1000)).toBe(5);
  });
});
