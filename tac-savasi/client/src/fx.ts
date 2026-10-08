// Pooled FX: additive glow layer, shockwaves, meteors, tornado blades,
// coin rain, confetti, lightning bolts, damage numbers, floating texts.
import * as PIXI from 'pixi.js';
import { glowTex, sparkTex, ringTex, coinTex, bladeTex, boltTex, discTex, starTex } from './gfx/textures.js';
import { tweener, Ease, Shake } from './gfx/tween.js';
import { audio } from './audio.js';
import { assets } from './assets.js';

type PKind = 0 | 1 | 2 | 3; // glow | spark | coin | debris

interface P {
  s: PIXI.Sprite; vx: number; vy: number; rot: number; spin: number;
  life: number; max: number; kind: PKind; grav: number; drag: number;
}

export class FX {
  glowLayer = new PIXI.Container();   // additive, blurred
  airLayer = new PIXI.Container();
  textLayer = new PIXI.Container();
  parts: P[] = [];
  texts: PIXI.Text[] = [];
  rings: PIXI.Sprite[] = [];
  bolts: PIXI.Sprite[] = [];
  shake = new Shake();
  zoom = 1; zoomTarget = 1;
  frozen = 0;
  flashAmt = 0;
  budget = 520;
  private flashRect = new PIXI.Graphics();
  private glowBlur: PIXI.BlurFilter;

  constructor(public stage: PIXI.Container) {
    this.glowBlur = new PIXI.BlurFilter({ strength: 8, quality: 1, resolution: 0.5 });
    this.glowLayer.filters = [this.glowBlur];
    this.glowLayer.blendMode = 'add';
    stage.addChild(this.glowLayer, this.airLayer, this.textLayer);
    stage.addChild(this.heatG);   // savaş ısısı: en üstte, her şeyin üstünde basınç
    stage.addChild(this.flashRect);

    const texes = [glowTex(), sparkTex(), coinTex(), discTex()];
    for (let i = 0; i < 620; i++) {
      const s = new PIXI.Sprite(texes[0]);
      s.anchor.set(0.5); s.visible = false;
      this.parts.push({ s, vx: 0, vy: 0, rot: 0, spin: 0, life: 0, max: 1, kind: 0, grav: 0, drag: 0.98 });
      (i % 2 ? this.airLayer : this.glowLayer).addChild(s);
    }
    for (let i = 0; i < 26; i++) {
      const r = new PIXI.Sprite(ringTex());
      r.anchor.set(0.5); r.visible = false; r.blendMode = 'add';
      this.rings.push(r); this.airLayer.addChild(r);
    }
    for (let i = 0; i < 6; i++) {
      const b = new PIXI.Sprite(boltTex());
      b.anchor.set(0.5, 0); b.visible = false; b.blendMode = 'add';
      this.bolts.push(b); this.airLayer.addChild(b);
    }
    for (let i = 0; i < 70; i++) {
      const t = new PIXI.Text({
        text: '', style: {
          fontFamily: '"Arial Black", Impact, system-ui, sans-serif',
          fontSize: 34, fill: 0xffffff, fontWeight: '900',
          stroke: { color: 0x12081f, width: 7, join: 'round' },
          dropShadow: { color: 0x000000, alpha: 0.55, blur: 4, distance: 3, angle: Math.PI / 2 },
        },
      });
      t.anchor.set(0.5); t.visible = false; t.resolution = 2;
      this.texts.push(t); this.textLayer.addChild(t);
    }
  }

  private free(): P | null {
    for (const p of this.parts) if (p.life <= 0) return p;
    return null;
  }
  private texFor(kind: PKind): PIXI.Texture {
    return kind === 1 ? sparkTex() : kind === 2 ? coinTex() : kind === 3 ? discTex() : glowTex();
  }

  burst(x: number, y: number, color: number, n: number, speed = 240, life = 0.6, size = 26, kind: PKind = 0, grav = 260, spread = Math.PI * 2, dir = 0) {
    const count = Math.min(n, Math.max(10, this.budget >> 2));
    for (let i = 0; i < count; i++) {
      const p = this.free(); if (!p) break;
      const a = dir + (Math.random() - 0.5) * spread;
      p.s.texture = this.texFor(kind);
      p.s.visible = true;
      p.s.tint = color;
      p.s.position.set(x, y);
      p.s.alpha = 1;
      p.s.blendMode = kind === 0 ? 'add' : 'normal';
      const sz = size * (0.55 + Math.random() * 0.9);
      p.s.width = p.s.height = sz;
      p.vx = Math.cos(a) * speed * (0.35 + Math.random() * 0.9);
      p.vy = Math.sin(a) * speed * (0.35 + Math.random() * 0.9);
      p.rot = Math.random() * 6; p.spin = (Math.random() - 0.5) * 9;
      p.max = life * (0.6 + Math.random() * 0.8); p.life = p.max;
      p.grav = grav; p.drag = 0.97;
      p.s.rotation = p.rot;
    }
  }

  shockwave(x: number, y: number, color: number, maxR = 200, dur = 0.55, width = 0.22) {
    const r = this.rings.find((r) => !r.visible) ?? this.rings[0];
    r.visible = true;
    r.texture = ringTex();
    r.tint = color;
    r.position.set(x, y);
    r.blendMode = 'add';
    r.width = r.height = 40;
    r.alpha = 0.95;
    tweener.kill(r, 'width'); tweener.kill(r, 'height');
    tweener.to(r, 'width', maxR * 2, dur, { ease: Ease.outQuint, onUpdate: (v) => { r.height = v; } });
    tweener.to(r, 'alpha', 0, dur, { onDone: () => { r.visible = false; } });
    void width;
  }

  /**
   * Faz 2.3 — savaş ısısı: seri/kombo arttıkça ekran kenarları kızarır,
   * konfeti sıklaşır, hafif zoom ve sarsıntı hissedilir. 0..1 arası alır.
   * Sürekli bir katman olduğu için tek Graphics ile yeniden çizilir.
   */
  private heatG = new PIXI.Graphics();
  private heat = 0;
  private heatTarget = 0;
  setHeat(v: number) { this.heatTarget = Math.max(0, Math.min(1, v)); }
  getHeat() { return this.heat; }
  private drawHeat(dt: number) {
    this.heat += (this.heatTarget - this.heat) * Math.min(1, dt * 2.6);
    if (this.heat < 0.005) { this.heatG.visible = false; return; }
    this.heatG.visible = true;
    const h = this.heat;
    const pulse = 0.82 + Math.sin(this.heatPhase * 5.5) * 0.18;
    this.heatG.clear();
    // dört kenar: sıcak kırmızı-turuncu basınç (alpha savaş sıcaklığıyla artar)
    const a = h * 0.3 * pulse;
    this.heatG.rect(0, 0, 1080, 150).fill({ color: 0xff3b2e, alpha: a * 0.55 });
    this.heatG.rect(0, 1920 - 150, 1080, 150).fill({ color: 0xff3b2e, alpha: a * 0.55 });
    this.heatG.rect(0, 0, 150, 1920).fill({ color: 0xff6d00, alpha: a * 0.5 });
    this.heatG.rect(1080 - 150, 0, 150, 1920).fill({ color: 0xff6d00, alpha: a * 0.5 });
    // üstte/altta ısı çizgileri
    this.heatG.rect(0, 150, 1080, 4).fill({ color: 0xffb03a, alpha: a });
    this.heatG.rect(0, 1920 - 154, 1080, 4).fill({ color: 0xffb03a, alpha: a });
  }
  private heatPhase = 0;

  hitSpark(x: number, y: number, color = 0xbfefff, n = 6) {
    this.burst(x, y, color, n, 320, 0.32, 20, 1, 120);
    this.burst(x, y, 0xffffff, 2, 200, 0.2, 16, 0, 0);
  }

  deathBurst(x: number, y: number) {
    this.burst(x, y, 0xff3b5c, 26, 380, 0.75, 30, 3, 420);
    this.burst(x, y, 0xffffff, 12, 240, 0.4, 20, 0, 0);
    this.shockwave(x, y, 0xff7a9a, 150, 0.5);
    this.shake.add(9);
  }

  meteor(x: number, y: number) {
    this.burst(x, y, 0xff7b00, 70, 520, 0.9, 42, 0, 240);
    this.burst(x, y, 0xffd166, 34, 340, 1.1, 34, 3, 380);
    this.shockwave(x, y, 0xffc46b, 420, 0.8);
    this.shockwave(x, y, 0xffffff, 240, 0.5);
    this.shake.add(26);
    this.zoomTarget = 1.06;
    this.hitStop(150);
    this.flash(0.25);
    audio.meteor();
  }

  tornado(ownerId: string, getPos: (id: string) => { x: number; y: number } | null) {
    const blades: PIXI.Sprite[] = [];
    for (let i = 0; i < 6; i++) {
      const s = new PIXI.Sprite(bladeTex());
      s.anchor.set(0.5); s.width = 120; s.height = 52;
      s.blendMode = 'add';
      s.tint = 0x9fe8ff;
      this.airLayer.addChild(s);
      blades.push(s);
    }
    const start = performance.now();
    const dur = 5000;
    const tick = () => {
      const p = getPos(ownerId);
      const el = performance.now() - start;
      if (!p || el > dur) {
        blades.forEach((b) => b.destroy());
        return;
      }
      blades.forEach((b, i) => {
        const a = el / 260 + (i / blades.length) * Math.PI * 2;
        const r = 75;
        b.position.set(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.55);
        b.rotation = a;
        b.alpha = Math.min(1, (dur - el) / 600);
      });
      if (Math.random() < 0.5) this.burst(p.x, p.y, 0x9fe8ff, 2, 120, 0.5, 18, 0, -40);
      requestAnimationFrame(tick);
    };
    tick();
    this.shockwave(getPos(ownerId)?.x ?? 540, getPos(ownerId)?.y ?? 960, 0x9fe8ff, 220, 0.7);
    audio.meteor();
  }

  coinRain(count = 6) {
    for (let i = 0; i < count; i++) {
      const p = this.free(); if (!p) break;
      p.s.texture = assets.texOr('fx.coin', coinTex);
      p.s.visible = true; p.s.tint = 0xffffff; p.s.blendMode = 'normal';
      p.s.position.set(Math.random() * 1080, -40 - Math.random() * 500);
      p.s.width = p.s.height = 44 + Math.random() * 22;
      p.vx = (Math.random() - 0.5) * 60; p.vy = 320 + Math.random() * 220;
      p.rot = Math.random() * 6; p.spin = (Math.random() - 0.5) * 6;
      p.max = 3.4; p.life = p.max; p.grav = 60; p.drag = 0.995;
    }
  }

  confettiBurst(cx = 540, cy = 620, n = 150) {
    const colors = [0xff3b7f, 0xffd23f, 0x2fe08a, 0x8a5cf6, 0x39d0ff, 0xff7b00];
    for (let i = 0; i < n; i++) {
      const p = this.free(); if (!p) break;
      p.s.texture = discTex();
      p.s.visible = true;
      p.s.tint = colors[i % colors.length];
      p.s.position.set(cx + (Math.random() - 0.5) * 900, cy + (Math.random() - 0.5) * 260);
      p.s.width = 12 + Math.random() * 16; p.s.height = p.s.width * 0.6;
      p.vx = (Math.random() - 0.5) * 260; p.vy = -220 - Math.random() * 320;
      p.rot = Math.random() * 6; p.spin = (Math.random() - 0.5) * 14;
      p.max = 2.4 + Math.random(); p.life = p.max; p.grav = 380; p.drag = 0.99;
    }
  }

  lightning(x: number, yTop = 0, yBot = 900) {
    const b = this.bolts.find((b) => !b.visible) ?? this.bolts[0];
    b.visible = true;
    b.position.set(x, yTop);
    b.width = 120 + Math.random() * 90;
    b.height = yBot - yTop;
    b.rotation = (Math.random() - 0.5) * 0.5;
    b.alpha = 1;
    tweener.kill(b, 'alpha');
    tweener.to(b, 'alpha', 0, 0.28, { ease: Ease.inQuad, onDone: () => { b.visible = false; } });
    this.flash(0.5);
    this.shake.add(12);
    this.shockwave(x, yBot * 0.6, 0xbfe0ff, 260, 0.5);
    audio.thunder();
  }

  /** Jagged lightning arc between two points (chain lightning, reflect zap). */
  arc(x1: number, y1: number, x2: number, y2: number, color = 0x9fe8ff) {
    const segs = 5;
    let px = x1, py = y1;
    for (let i = 1; i <= segs; i++) {
      const k = i / segs;
      const nx = x1 + (x2 - x1) * k + (i < segs ? (Math.random() - 0.5) * 34 : 0);
      const ny = y1 + (y2 - y1) * k + (i < segs ? (Math.random() - 0.5) * 34 : 0);
      const p = this.free();
      if (p) {
        p.s.texture = sparkTex();
        p.s.visible = true; p.s.tint = color; p.s.blendMode = 'add';
        p.s.position.set((px + nx) / 2, (py + ny) / 2);
        p.s.rotation = Math.atan2(ny - py, nx - px);
        p.s.width = Math.hypot(nx - px, ny - py) + 14;
        p.s.height = 13;
        p.vx = 0; p.vy = 0; p.rot = 0; p.spin = 0;
        p.max = 0.22; p.life = 0.22; p.grav = 0; p.drag = 1;
      }
      px = nx; py = ny;
    }
    this.burst(x2, y2, color, 5, 200, 0.3, 16, 1, 0);
  }

  spawnRing(x: number, y: number, color: number, r: number) {
    const ring = this.rings.find((s) => !s.visible);
    if (!ring) return;
    ring.visible = true; ring.texture = ringTex(); ring.tint = color;
    ring.position.set(x, y); ring.width = ring.height = r * 2; ring.alpha = 0.7;
    tweener.kill(ring, 'scale');
    tweener.to(ring, 'alpha', 0, 0.6, { onDone: () => { ring.visible = false; } });
  }

  respawnWave(x: number, y: number, color = 0x66ccff) {
    this.shockwave(x, y, color, 190, 0.55);
    this.burst(x, y, color, 20, 260, 0.6, 24, 0, -60);
  }

  flash(a = 0.3) { this.flashAmt = Math.max(this.flashAmt, a); }
  hitStop(ms: number) { this.frozen = Math.max(this.frozen, ms / 1000); }
  punchZoom(z = 1.08) { this.zoomTarget = Math.max(this.zoomTarget, z); }

  dmgNum(x: number, y: number, dmg: number, crit = false) {
    const t = this.texts.find((t) => !t.visible); if (!t) return;
    t.visible = true;
    t.text = `-${Math.round(dmg)}`;
    t.style.fontSize = crit ? 46 : dmg >= 22 ? 38 : 30;
    t.style.fill = crit ? 0xffe14d : 0xffffff;
    t.alpha = 1;
    t.position.set(x + (Math.random() - 0.5) * 26, y - 30);
    t.scale.set(0.3);
    tweener.kill(t, 'scale'); tweener.kill(t, 'y'); tweener.kill(t, 'alpha');
    tweener.to(t, 'scale', 1, 0.22, { ease: Ease.outBack });
    tweener.to(t, 'y', y - 78, 0.7, { ease: Ease.outCubic });
    tweener.to(t, 'alpha', 0, 0.34, { delay: 0.36, onDone: () => { t.visible = false; } });
  }

  floatText(x: number, y: number, s: string, color = 0xffffff, size = 34, rise = 60) {
    const t = this.texts.find((t) => !t.visible); if (!t) return;
    t.visible = true; t.text = s;
    t.style.fontSize = size;
    t.style.fill = color;
    t.alpha = 1;
    t.position.set(x, y);
    t.scale.set(0.4);
    tweener.kill(t, 'scale'); tweener.kill(t, 'y'); tweener.kill(t, 'alpha');
    tweener.to(t, 'scale', 1, 0.26, { ease: Ease.outBack });
    tweener.to(t, 'y', y - rise, 1.1, { ease: Ease.outCubic });
    tweener.to(t, 'alpha', 0, 0.4, { delay: 0.7, onDone: () => { t.visible = false; } });
  }

  star(x: number, y: number, color = 0xffe14d, n = 6) {
    for (let i = 0; i < n; i++) {
      const s = new PIXI.Sprite(starTex());
      s.anchor.set(0.5); s.tint = color; s.blendMode = 'add';
      const a = (i / n) * Math.PI * 2;
      const d = 70 + Math.random() * 60;
      s.width = s.height = 46;
      s.position.set(x, y);
      this.airLayer.addChild(s);
      let done = false;
      const kill = () => { if (!done) { done = true; s.destroy(); } };
      tweener.to(s, 'x', x + Math.cos(a) * d, 0.5, { ease: Ease.outCubic });
      tweener.to(s, 'y', y + Math.sin(a) * d, 0.5, { ease: Ease.outCubic });
      tweener.to(s, 'scale.x', 0.2, 0.5, { onUpdate: (v) => { if (s.scale) s.scale.y = v; }, onDone: kill });
      tweener.to(s, 'alpha', 0, 0.5, { onDone: kill });
    }
  }

  update(dt: number): boolean {
    // returns true if simulation should be frozen (hit-stop)
    if (this.frozen > 0) { this.frozen -= dt; this.drawHeat(dt); return true; }
    this.heatPhase += dt;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.s.rotation = p.rot;
      const k = p.life / p.max;
      p.s.alpha = k > 0.6 ? 1 : k / 0.6;
      if (p.s.y > 1560 && p.vy > 0) { p.vy *= -0.32; p.s.y = 1560; }
    }
    tweener.update(dt);
    if (this.flashAmt > 0) this.flashAmt = Math.max(0, this.flashAmt - dt * 2.2);
    this.flashRect.clear();
    if (this.flashAmt > 0.005) {
      this.flashRect.rect(0, 0, 1080, 1920).fill({ color: 0xffffff, alpha: this.flashAmt });
    }
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 6);
    this.zoomTarget += (1 - this.zoomTarget) * Math.min(1, dt * 3.4);
    this.drawHeat(dt);
    return false;
  }
  /**
   * Faz 2.6 — kamera adaptasyonu. Oyuncular dağılınca uzaklaş, toplanınca
   * yaklaş; boss gelince hafif uzaklaş ki koca boss görünsün. Hedef zoom
   * her karede yumuşak değişir, aniden zıplama olmaz.
   */
  private frameZoom = 1;
  /** 0..1: oyuncuların merkeze ne kadar yayıldığı */
  autoZoomFor(spread: number, crowd: number, bossAlive: boolean) {
    const target = 1.045
      - Math.min(0.07, spread * 0.07)      // dağılma -> uzaklaş
      + Math.min(0.03, crowd * 0.012)      // kalabalık -> hafif yaklaş
      - (bossAlive ? 0.045 : 0);          // boss -> görüş alanı aç
    this.frameZoom = target;
  }
  applyCamera(c: PIXI.Container, world: PIXI.Container, dt: number) {
    const s = this.shake.update(dt);
    c.position.set(s.x, s.y);
    const z = this.zoom * (this.frameZoom / 1.045);
    world.scale.set(z, z);
    world.position.set(540 - 540 * world.scale.x, 960 - 960 * world.scale.y);
  }
  setQuality(q: number) {
    this.budget = Math.floor(520 * q);
    // blur is by far the heaviest pass — drop it entirely on weak GPUs
    const wantBlur = q > 0.55;
    if (this.glowLayer.filters.length > 0 !== wantBlur) {
      this.glowLayer.filters = wantBlur ? [this.glowBlur] : [];
    }
    if (wantBlur) this.glowBlur.quality = q > 0.8 ? 2 : 1;
  }
}
