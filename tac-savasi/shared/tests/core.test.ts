import { describe, it, expect } from 'vitest';
import { normalizeCommand, normalizeTeam } from '../src/commands.js';
import { giftTier } from '../src/types.js';
import { Sim } from '../src/sim.js';
import { defaultSimConfig } from '../src/types.js';
import { layoutViolations, layoutZones, inTikTokDeadZone, deadZoneRatio, deadZoneViolations } from '../src/layout.js';
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
  it('takim komutu renkli ve renksiz', () => {
    expect(normalizeCommand('!takim rojo')).toBe('team');
    expect(normalizeCommand('!equipo azul')).toBe('team');
    expect(normalizeCommand('!team red')).toBe('team');
    expect(normalizeCommand('!takim kırmızı')).toBe('team');
    expect(normalizeCommand('!takim')).toBe('team');
    expect(normalizeCommand('!equipo')).toBe('team');
  });
  it('yardim komutu', () => {
    expect(normalizeCommand('!ayuda')).toBe('help');
    expect(normalizeCommand('!yardım')).toBe('help');
    expect(normalizeCommand('!help')).toBe('help');
  });
});

describe('takim rengi', () => {
  it('renk ayrımı', () => {
    expect(normalizeTeam('!takim rojo')).toBe('rojo');
    expect(normalizeTeam('!takim azul')).toBe('azul');
    expect(normalizeTeam('!team red')).toBe('rojo');
    expect(normalizeTeam('!team blue')).toBe('azul');
    expect(normalizeTeam('!takim')).toBeNull();
    expect(normalizeTeam('!takim morado')).toBeNull();
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

describe('kenar guvenligi (Faz 4.1)', () => {
  it('tum HUD bolgeleri TikTok olu bolgelerine girmemeli', () => {
    for (const facecam of [false, true]) {
      const bad = layoutZones(facecam).filter((r) => inTikTokDeadZone(r)).map((r) => r.name);
      expect(bad).toEqual([]);
    }
  });
  it('bolgeler birbirine girmemeli', () => {
    expect(layoutViolations(false)).toEqual([]);
    expect(layoutViolations(true)).toEqual([]);
  });
  it('kafa seridi aktifken de guvenli kalir', () => {
    const zs = layoutZones(true);
    const top = zs.find((z) => z.name === 'topbar')!;
    expect(top.y).toBeGreaterThan(0);
    expect(top.h).toBeLessThanOrEqual(220);
  });
});
describe('dead zone orani', () => {
  it('tam genislik bant riskli sayilmaz', () => {
    expect(deadZoneRatio({ x: 0, y: 0, w: 1080, h: 200, name: 'x' })).toBeLessThan(0.4);
  });
  it('sag kenarda kucuk kutu riskli', () => {
    expect(deadZoneRatio({ x: 1000, y: 800, w: 80, h: 80, name: 'x' })).toBeGreaterThan(0.4);
  });
  it('alt kenar seridi riskli', () => {
    expect(deadZoneRatio({ x: 400, y: 1840, w: 280, h: 80, name: 'x' })).toBeGreaterThan(0.4);
  });
  it('merkez guvenli', () => {
    expect(inTikTokDeadZone({ x: 300, y: 900, w: 400, h: 300, name: 'x' })).toBe(false);
  });
});

describe('ayrisma (Faz 2.6)', () => {
  it('yaklasan oyuncular ust uste binmez', () => {
    const sim = new Sim(defaultSimConfig(), 7);
    // ayni noktaya 4 oyuncu koy -> birbirlerini itmeleri gerek
    for (let i = 0; i < 4; i++) {
      const a = sim.makeAvatar(`u${i}`, `P${i}`, null);
      a.x = 540; a.y = 960; a.alive = true;
      sim.addAvatar(a);
    }
    for (let i = 0; i < 40; i++) sim.update(1 / 60);
    let tooClose = 0;
    const list = [...sim.avatars.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < 12) tooClose++;
      }
    }
    expect(tooClose).toBe(0);
  });
});
