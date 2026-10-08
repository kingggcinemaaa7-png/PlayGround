import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import esMX from '../src/locales/es-MX.json';
import esES from '../src/locales/es-ES.json';
import en from '../src/locales/en.json';
import trTR from '../src/locales/tr-TR.json';

const TABLES: Record<string, Record<string, string>> = {
  'es-MX': esMX as Record<string, string>,
  'es-ES': esES as Record<string, string>,
  en: en as Record<string, string>,
  'tr-TR': trTR as Record<string, string>,
};

describe('locale butunlugu', () => {
  it('dort tablo da ayni anahtar kumesine sahip', () => {
    const ref = Object.keys(TABLES['es-MX']).sort();
    for (const [name, tbl] of Object.entries(TABLES)) {
      expect(Object.keys(tbl).sort(), `${name} farkli anahtar sayisinda`).toEqual(ref);
    }
  });

  it('hicbir deger bos degil', () => {
    for (const [name, tbl] of Object.entries(TABLES)) {
      for (const [k, v] of Object.entries(tbl)) {
        expect(typeof v === 'string' && v.trim().length > 0, `${name}.${k} bos`).toBe(true);
      }
    }
  });

  it('yer tutucu {n} her tabloda ayni sekilde geciyor', () => {
    const ph = /\{[a-zA-Z]+\}/g;
    const ref = TABLES['es-MX'];
    for (const [name, tbl] of Object.entries(TABLES)) {
      for (const [k, v] of Object.entries(ref)) {
        const a = [...v.matchAll(ph)].map((m) => m[0]).sort().join(',');
        const b = [...(tbl[k] ?? '').matchAll(ph)].map((m) => m[0]).sort().join(',');
        expect(b, `${name}.${k} yer tutucu farki`).toBe(a);
      }
    }
  });

  it('en tablosu Ispanyolca metin kopyasi birakmamis', () => {
    // en icin uretilmis degerler: Turkce/Ispanyolca ozel karakterler olmamali
    for (const [k, v] of Object.entries(TABLES.en)) {
      expect(/[áéíóúñ¡¿]/i.test(v), `en.${k} Ispanyolca birakiyor: ${v}`).toBe(false);
    }
  });

  it('tum dosyalar gecerli JSON ve satir sonu ile bitiyor', () => {
    for (const f of ['es-MX', 'es-ES', 'en', 'tr-TR']) {
      const raw = readFileSync(new URL(`../src/locales/${f}.json`, import.meta.url), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(raw.endsWith('\n')).toBe(true);
    }
  });
});
