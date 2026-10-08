import { describe, it, expect } from 'vitest';
import { Sim, POISON_DAMAGE, POISON_RADIUS } from '../src/sim.js';
import { defaultSimConfig } from '../src/types.js';

const cfg = () => defaultSimConfig();

describe('zehir aurası (AURA DE VENENO)', () => {
  it('yarıçap içindeki düşmana 0.5 saniyede bir 8 hasar verir', () => {
    const sim = new Sim(cfg(), 1);
    const a = sim.makeAvatar('u1', 'Zehir', null);
    const v = sim.makeAvatar('u2', 'Hedef', null);
    sim.addAvatar(a); sim.addAvatar(v);
    v.x = a.x + POISON_RADIUS - 2;
    v.y = a.y;
    a.poisonUntil = sim.time + 2;
    const before = v.hp;
    for (let i = 0; i < 30; i++) sim.update(1 / 60); // 0.5 s
    expect(before - v.hp).toBeGreaterThanOrEqual(POISON_DAMAGE * 0.9);
  });

  it('yarıçap dışındakine hasar vermez', () => {
    const sim = new Sim(cfg(), 2);
    const a = sim.makeAvatar('u1', 'Z', null);
    const v = sim.makeAvatar('u2', 'Uzak', null);
    sim.addAvatar(a); sim.addAvatar(v);
    v.x = a.x + POISON_RADIUS + 40;
    a.poisonUntil = sim.time + 2;
    const before = v.hp;
    for (let i = 0; i < 30; i++) sim.update(1 / 60);
    expect(v.hp).toBeCloseTo(before, 3);
  });
});

describe('puan (skor) sistemi', () => {
  it('kill +10', () => {
    const sim = new Sim(cfg(), 3);
    const a = sim.makeAvatar('u1', 'K', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    sim.dealDamage('u1', 'u2', 999);
    expect(a.score).toBe(10);
  });

  it('gold rain sırasında kill x2', () => {
    const sim = new Sim(cfg(), 4);
    sim.goldRain = true;
    const a = sim.makeAvatar('u1', 'K', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    sim.dealDamage('u1', 'u2', 999);
    expect(a.score).toBe(20);
  });

  it('boss öldürme +50 ve bossDead olayı', () => {
    const sim = new Sim(cfg(), 5);
    const a = sim.makeAvatar('u1', 'K', null);
    sim.addAvatar(a);
    let dead: { killer: string } | null = null;
    sim.onEvent = (e) => { if (e.type === 'bossDead') dead = { killer: e.killer }; };
    sim.spawnBoss('kraken', 1);
    sim.killBoss('u1');
    expect(a.score).toBe(50);
    expect(dead).not.toBeNull();
  });

  it('goldrain mutator canavar puanını 2 katlar (gold rain ile 4x)', () => {
    const sim = new Sim({ ...cfg(), mutator: 'goldrain' }, 6);
    sim.goldRain = true;
    const a = sim.makeAvatar('u1', 'K', null);
    sim.addAvatar(a);
    sim.spawnWave();
    const m = sim.monsters[0];
    m.hp = 1;
    m.x = a.x + 5; m.y = a.y;
    sim.bullets.push({ x: a.x + 5, y: a.y, vx: 0, vy: 0, owner: 'u1', dmg: 10, life: 1 });
    sim.update(1 / 60);
    expect(a.monsterKills).toBe(1);
    expect(a.score).toBe(12); // 3 * 2 (gold rain) * 2 (mutator)
  });
});

describe('kale (CASTILLO)', () => {
  it('yıkılınca olay fırlatır, can sıfırlanır ve dalga temizlenir', () => {
    const sim = new Sim(cfg(), 7);
    const a = sim.makeAvatar('u1', 'K', null);
    sim.addAvatar(a);
    sim.spawnWave();
    let down = 0;
    sim.onEvent = (e) => { if (e.type === 'castleDown') down++; };
    sim.castleHp = 1;
    sim.monsters[0].x = 540; sim.monsters[0].y = 960; // reaches the castle
    for (let i = 0; i < 120 && down === 0; i++) sim.update(1 / 60);
    expect(down).toBeGreaterThan(0);
    expect(sim.castleHp).toBe(sim.castleMax);
    expect(sim.monsters.length).toBe(0);
  });
});

describe('boss yakalama (ATRAPADA)', () => {
  it('7 saniyede bir yakalar ve olay fırlatır', () => {
    const sim = new Sim(cfg(), 8);
    const a = sim.makeAvatar('u1', 'Yakalanan', null);
    sim.addAvatar(a);
    sim.spawnBoss('kraken', 1);
    sim.boss!.x = a.x; sim.boss!.y = a.y;
    sim.boss!.specialCd = 0.01;
    let trapped = 0;
    sim.onEvent = (e) => { if (e.type === 'trap') trapped++; };
    for (let i = 0; i < 30; i++) sim.update(1 / 60);
    expect(trapped).toBe(1);
    expect(sim.getAvatar('u1')!.trappedUntil).toBeGreaterThan(sim.time);
  });
});

describe('doğuş geri çağırması (kuyruktaki hediyeler)', () => {
  it('avatar öldüğünde de doğduğunda onRespawn tetiklenir', () => {
    const sim = new Sim(cfg(), 9);
    const a = sim.makeAvatar('u1', 'D', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    const seen: string[] = [];
    sim.onRespawn = (id) => seen.push(id);
    sim.dealDamage('u1', 'u2', 999);          // v dies
    for (let i = 0; i < 60 * 4; i++) sim.update(1 / 60); // wait out the 3s respawn
    expect(seen).toContain('u2');
  });

  it('merhametle diriltmede de tetiklenir', () => {
    const sim = new Sim(cfg(), 10);
    const a = sim.makeAvatar('u1', 'M', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    v.streak = 12; v.bestStreak = 12;
    const seen: string[] = [];
    sim.onRespawn = (id) => seen.push(id);
    sim.dealDamage('u1', 'u2', 999);
    expect(sim.mercyRespond('u2')).toBe(true);
    expect(seen).toContain('u2');
  });
});

describe('seri kademe olayı', () => {
  it('5/15/30/50 eşiklerinde streakTier fırlatır', () => {
    const sim = new Sim(cfg(), 11);
    const a = sim.makeAvatar('u1', 'K', null);
    const v = sim.makeAvatar('u2', 'V', null);
    sim.addAvatar(a); sim.addAvatar(v);
    const tiers: number[] = [];
    sim.onEvent = (e) => { if (e.type === 'streakTier') tiers.push(e.streak); };
    for (let i = 0; i < 6; i++) { sim.dealDamage('u1', 'u2', 999); v.alive = true; v.hp = 50; }
    expect(tiers).toContain(5);
  });
});

describe('yeni güçler', () => {
  it('ÖFKE x2 + DEV x1.5 verir, tavan x3 korunur', () => {
    const sim = new Sim(cfg(), 21);
    const a = sim.makeAvatar('u1', 'R', null);
    sim.addAvatar(a);
    expect(sim.grant('u1', 'rage')).toBe(true);
    expect(sim.dmgMult(a)).toBeCloseTo(2);
    expect(sim.grant('u1', 'giant')).toBe(true);
    expect(a.maxHp).toBe(200); // +100 dev canı
    expect(sim.dmgMult(a)).toBe(3); // 2*1.5 tavana takılır
  });

  it('DEV süresi bitince +100 can geri alınır', () => {
    const sim = new Sim(cfg(), 22);
    const a = sim.makeAvatar('u1', 'D', null);
    sim.addAvatar(a);
    sim.grant('u1', 'giant');
    for (let i = 0; i < 60 * 9; i++) sim.update(1 / 60);
    expect(a.giantActive).toBe(false);
    expect(a.maxHp).toBe(100);
  });

  it('HAYALET mermiyi geçirir ve hedeflenemez', () => {
    const sim = new Sim(cfg(), 23);
    const a = sim.makeAvatar('u1', 'A', null);
    const g = sim.makeAvatar('u2', 'G', null);
    sim.addAvatar(a); sim.addAvatar(g);
    g.x = a.x + 5; g.y = a.y;
    sim.grant('u2', 'ghost');
    const before = g.hp;
    sim.bullets.push({ x: a.x, y: a.y, vx: 100, vy: 0, owner: 'u1', dmg: 20, life: 1 });
    for (let i = 0; i < 30; i++) sim.update(1 / 60);
    expect(g.hp).toBeCloseTo(before, 3);
    expect(sim.nearestEnemy(a)).not.toBe(g);
  });

  it('YANSITMA mermiyi sahibine geri yollar (%20 güçlü)', () => {
    const sim = new Sim(cfg(), 24);
    const a = sim.makeAvatar('u1', 'A', null);
    const r = sim.makeAvatar('u2', 'R', null);
    sim.addAvatar(a); sim.addAvatar(r);
    // NOT: eski konumlar (100,100) arena DIŞINDAYDI ve her kare arenaya
    // zorlanıyordu; test kırılgandı. Arena içinde geçerli noktalar kullanılır.
    a.x = 440; a.y = 960; r.x = 500; r.y = 960;
    sim.grant('u2', 'reflect');
    sim.bullets.push({ x: 470, y: 960, vx: 200, vy: 0, owner: 'u1', dmg: 10, life: 1 });
    for (let i = 0; i < 180 && a.hp === a.maxHp; i++) sim.update(1 / 60);
    expect(a.hp).toBeLessThan(a.maxHp); // kendi mermisi geri döndü
  });

  it('VAMPİR verdiği hasarın %35ini can olarak alır', () => {
    const sim = new Sim(cfg(), 25);
    const a = sim.makeAvatar('u1', 'V', null);
    const v = sim.makeAvatar('u2', 'K', null);
    sim.addAvatar(a); sim.addAvatar(v);
    a.hp = 50;
    sim.grant('u1', 'vamp');
    sim.dealDamage('u1', 'u2', 20);
    expect(a.hp).toBeCloseTo(57, 3);
  });

  it('DONMA 130px içindekileri 3 sn dondurur', () => {
    const sim = new Sim(cfg(), 26);
    const a = sim.makeAvatar('u1', 'F', null);
    const v = sim.makeAvatar('u2', 'D', null);
    const w = sim.makeAvatar('u3', 'U', null);
    sim.addAvatar(a); sim.addAvatar(v); sim.addAvatar(w);
    v.x = a.x + 50; v.y = a.y;
    w.x = a.x + 500; w.y = a.y;
    expect(sim.frostNova('u1')).toBe(1);
    expect(v.trappedUntil).toBeGreaterThan(sim.time + 2.5);
    expect(w.trappedUntil).toBe(0);
  });

  it('ZİNCİR öldürmede en yakın 3 düşmana vurur, özyineleme yapmaz', () => {
    const sim = new Sim(cfg(), 27);
    const a = sim.makeAvatar('u1', 'Z', null);
    sim.addAvatar(a);
    const victims: string[] = ['u2', 'u3', 'u4', 'u5'].map((id, i) => {
      const v = sim.makeAvatar(id, 'V' + i, null);
      v.x = a.x + 20 + i * 30; v.y = a.y;
      sim.addAvatar(v);
      return id;
    });
    sim.grant('u1', 'chain');
    const chains: { x: number; y: number }[][] = [];
    const orig = sim.onKill;
    sim.onKill = (k) => { if (k.chain) chains.push(k.chain); orig?.(k); };
    sim.dealDamage('u1', 'u2', 999);
    expect(chains.length).toBeGreaterThan(0);
    expect(chains[0].length).toBeLessThanOrEqual(3);
    void victims;
  });

  it('GÖLGE KLON takip eder, ateş eder ve 12 sn sonra gider', () => {
    const sim = new Sim(cfg(), 28);
    const a = sim.makeAvatar('u1', 'K', null);
    const v = sim.makeAvatar('u2', 'D', null);
    sim.addAvatar(a); sim.addAvatar(v);
    v.x = a.x + 100; v.y = a.y;
    expect(sim.spawnClone('u1')).toBe(true);
    expect(sim.minions.length).toBe(1);
    const m0 = { x: sim.minions[0].x, y: sim.minions[0].y };
    for (let i = 0; i < 60; i++) sim.update(1 / 60);
    const moved = Math.hypot(sim.minions[0].x - m0.x, sim.minions[0].y - m0.y);
    expect(moved).toBeGreaterThan(5); // sahibi takip etti
    for (let i = 0; i < 60 * 12; i++) sim.update(1 / 60);
    expect(sim.minions.length).toBe(0); // süresi doldu
  });

  it('grant() ölü avatara uygulanmaz', () => {
    const sim = new Sim(cfg(), 29);
    const a = sim.makeAvatar('u1', 'O', null);
    const k = sim.makeAvatar('u2', 'K', null);
    sim.addAvatar(a); sim.addAvatar(k);
    sim.dealDamage('u2', 'u1', 999);
    expect(sim.grant('u1', 'rage')).toBe(false);
  });
});

describe('yorunge silahi', () => {
  it('yildiz doner ve dusmana hasar verir', () => {
    const sim = new Sim(defaultSimConfig(), 11);
    const a = sim.makeAvatar('a', 'A', null);
    const b = sim.makeAvatar('b', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    // b'yi a'nın yildiz yarıçapına sabitle
    b.x = a.x + 74; b.y = a.y;
    const hp0 = b.hp;
    const ang0 = a.orbAngle;
    for (let i = 0; i < 120; i++) {
      b.x = a.x + 74; b.y = a.y;   // yildiz yolunu takip ettir
      sim.update(1 / 60);
    }
    expect(a.orbAngle).not.toBe(ang0);
    expect(b.hp).toBeLessThan(hp0);
  });

  /**
   * Mermi hasarı da devrede olduğu için "silah kapalıyken hasar olmaz" gibi
   * mutlak ölçüm yanıltıcıdır. Aynı senaryoyu silah AÇIK ve KAPALI çalıştırıp
   * can farkını ölçüyoruz (diferansiyel test).
   */
  const scenario = (orbitCount: number) => {
    const cfg = { ...defaultSimConfig() };
    cfg.orbit = { count: orbitCount, radius: 74, spin: 2.6, dmg: 6, cd: 0.75 };
    const sim = new Sim(cfg, 13);
    const a = sim.makeAvatar('a', 'A', null);
    const b = sim.makeAvatar('b', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    // kurşunun işlemediği ama yıldızın ulaşabildiği mesafe: 74px
    a.x = 540; a.y = 960;
    b.x = a.x + 74; b.y = a.y;
    for (let i = 0; i < 300; i++) {
      // b'yi sabit tut ki senaryo deterministik kalsin
      b.x = a.x + 74; b.y = a.y;
      sim.update(1 / 60);
    }
    return b.hp;
  };

  it('yildiz dogrudan hasar verir (silah acikken daha fazla hasar)', () => {
    const withOrb = scenario(2);
    const withoutOrb = scenario(0);
    expect(withOrb).toBeLessThan(withoutOrb);
  });

  it('sayisi sifirlanabilir (silah kapali)', () => {
    const cfg = { ...defaultSimConfig() };
    cfg.orbit = { count: 0, radius: 74, spin: 2.6, dmg: 6, cd: 0.75 };
    const sim = new Sim(cfg, 13);
    const a = sim.makeAvatar('a', 'A', null);
    const b = sim.makeAvatar('b', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    let orbHits = 0;
    sim.onEvent = (e) => { if (e.type === 'orbHit') orbHits++; };
    for (let i = 0; i < 300; i++) { b.x = a.x + 74; b.y = a.y; sim.update(1 / 60); }
    expect(orbHits).toBe(0);
  });

  it('olay yayinlar (orbHit)', () => {
    const sim = new Sim(defaultSimConfig(), 14);
    const a = sim.makeAvatar('a', 'A', null);
    const b = sim.makeAvatar('b', 'B', null);
    sim.addAvatar(a); sim.addAvatar(b);
    let hits = 0;
    sim.onEvent = (e) => { if (e.type === 'orbHit') hits++; };
    for (let i = 0; i < 300; i++) { b.x = a.x + 74; b.y = a.y; sim.update(1 / 60); }
    expect(hits).toBeGreaterThan(0);
  });
});

describe('merhamet penceresi (duzeltildi)', () => {
  it('onKill icinde HENUZ gorunur olur (banner acilmali)', () => {
    const sim = new Sim(cfg(), 31);
    const k = sim.makeAvatar('k', 'K', null);
    const v = sim.makeAvatar('v', 'V', null);
    sim.addAvatar(k); sim.addAvatar(v);
    v.streak = 12;   // merhamet kosulu kurbanin oldugu seriye bakar
    let mercySeenInOnKill: unknown = null;
    sim.onKill = () => { mercySeenInOnKill = sim.mercy; };
    sim.dealDamage('k', 'v', 999);
    expect(mercySeenInOnKill).not.toBeNull();
  });

  it('otomatik dirilme pencereyi 3 saniyeye dusmez', () => {
    const sim = new Sim(cfg(), 32);
    const k = sim.makeAvatar('k', 'K', null);
    const v = sim.makeAvatar('v', 'V', null);
    sim.addAvatar(k); sim.addAvatar(v);
    v.streak = 12;   // merhamet kosulu kurbanin oldugu seriye bakar
    sim.dealDamage('k', 'v', 999);
    expect(sim.mercy).not.toBeNull();
    // 3 saniye sonra normal respawn olur; pencere ACIK kalmali
    for (let i = 0; i < 240; i++) sim.update(1 / 60);
    expect(sim.mercy?.done).toBe(false);
  });

  it('zaman asimi dirilmesi onRespawn tetikler (kuyruk bosalmaz)', () => {
    const sim = new Sim(cfg(), 33);
    const k = sim.makeAvatar('k', 'K', null);
    const v = sim.makeAvatar('v', 'V', null);
    sim.addAvatar(k); sim.addAvatar(v);
    v.streak = 12;   // merhamet kosulu kurbanin oldugu seriye bakar
    let respawned = false;
    sim.onRespawn = () => { respawned = true; };
    sim.dealDamage('k', 'v', 999);
    const until = sim.mercy!.until;
    while (sim.time < until + 0.1) sim.update(1 / 60);
    expect(respawned).toBe(true);
    expect(v.alive).toBe(true);
  });

  it('ayni kisiye kisa aralikla tekrar merhamet acilmaz', () => {
    const sim = new Sim(cfg(), 34);
    const k = sim.makeAvatar('k', 'K', null);
    const v = sim.makeAvatar('v', 'V', null);
    sim.addAvatar(k); sim.addAvatar(v);
    v.streak = 12;   // merhamet kosulu kurbanin oldugu seriye bakar
    sim.dealDamage('k', 'v', 999);
    const first = sim.mercy!.until;
    sim.dealDamage('k', 'v', 999);
    expect(sim.mercy!.until).toBe(first);
  });
});
