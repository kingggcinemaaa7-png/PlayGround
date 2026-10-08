// Living arena: sky/ocean, animated tide, swaying palms, crabs, seagulls,
// torches, rocks, castle with damage state, persistent decals, grading, vignette.
import * as PIXI from 'pixi.js';
import {
  tex, skyTex, waterTex, sandTex, watermarkTex, palmTex, rockTex, torchTex, flameTex,
  crabTex, gullTex, castleTex, vignetteTex, glowTex, discTex, starfishTex, skyTex as skyFactory,
} from './textures.js';
import { tweener } from './tween.js';

export type ArenaName = 'beach' | 'volcano' | 'ice' | 'night-forest' | 'sky-island';

const SAND: Record<ArenaName, 'beach' | 'volcano' | 'ice' | 'night' | 'sky'> = {
  beach: 'beach', volcano: 'volcano', ice: 'ice', 'night-forest': 'night', 'sky-island': 'sky',
};
const NIGHT_ARENAS: ArenaName[] = ['night-forest'];

interface Palm { s: PIXI.Sprite; base: number; phase: number; amp: number }
interface Torch { stick: PIXI.Sprite; flame: PIXI.Sprite; phase: number; glow: PIXI.Sprite; base: number }
interface Crab { s: PIXI.Sprite; x: number; y: number; vx: number; phase: number }
interface Starfish { s: PIXI.Sprite; base: number; phase: number }
interface Gull { s: PIXI.Sprite; x: number; y: number; vx: number; phase: number }

export class World {
  root = new PIXI.Container();
  sky: PIXI.Sprite = new PIXI.Sprite();
  skyNight: PIXI.Sprite = new PIXI.Sprite();
  nightAmt = 0;
  ocean: PIXI.Sprite = new PIXI.Sprite();
  waveG = new PIXI.Graphics();
  foamG = new PIXI.Graphics();
  sandLayer = new PIXI.Container();
  decalLayer = new PIXI.Container();
  fxGround = new PIXI.Container();   // splats, sparks on ground
  entityLayer = new PIXI.Container();
  fxAir = new PIXI.Container();
  propsBack = new PIXI.Container();
  propsFront = new PIXI.Container();
  overlay = new PIXI.Container();     // tide/storm/grade/vignette/flash
  vignette!: PIXI.Sprite;
  stars = new PIXI.Graphics();
  palms: Palm[] = [];
  torches: Torch[] = [];
  crabs: Crab[] = [];
  starfish: Starfish[] = [];
  gulls: Gull[] = [];
  castle: PIXI.Sprite | null = null;
  castleHp = 800;
  castleMaxHp = 800;
  castleSmoke = 0;
  private castleHpG = new PIXI.Graphics();
  private castleHpLabel = new PIXI.Text({ text: '', style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 17, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x12081f, width: 3, join: 'round' } } });

  arena: ArenaName = 'beach';
  night = false;
  sunset = 0;          // 0..1 warm grade
  tideLevel = 0;       // 0..1
  storm = 0;           // 0..1
  rainSprites: PIXI.Sprite[] = [];
  rainVY: number[] = [];
  decals: { s: PIXI.Sprite; life: number; max: number }[] = [];
  time = 0;
  /** 0..1 position in the match, drives the day -> dusk -> night ramp. */
  dayProgress = 0;
  private frameParity = 0;
  private lastTideLvl = 0;

  constructor() {
    this.castleHolder();
    this.buildRim();              // kenar ışık halkası + taşlar (Faz 1.1)
    this.root.addChild(
      this.stars,
      this.sky,
      this.skyNight,
      this.ocean,
      this.waveG,
      this.propsBack,
      this.sandLayer,
      this.propsFront,
      this.watermarkSprite(),
      this.decalLayer,
      this.fxGround,
      this.entityLayer,
      this.fxAir,
      this.foamG,
      this.rimStatic,              // kenar taşları (statik)
      this.rimG,                   // arena sınırı nabzı (dinamik)
      this.overlay,
    );
    // atmos katmanları: ışık lekesi -> ton -> mevcut grade/vignette
    this.lightG.blendMode = 'add';
    this.moodG.blendMode = 'add';
    this.overlay.addChildAt(this.lightG, 0);
    this.overlay.addChildAt(this.moodG, 1);
  }
  private watermarkSprite() {
    const s = new PIXI.Sprite(watermarkTex());
    s.anchor.set(0.5); s.position.set(540, 960);
    s.width = s.height = 620; s.alpha = 0.5;
    return s;
  }
  private castleHolder() {
    if (!this.castle) {
      this.castle = new PIXI.Sprite(castleTex());
      this.castle.anchor.set(0.5, 1);
      this.castle.position.set(540, 1004);
      this.castle.width = 268; this.castle.height = 316;
    }
    return this.propsBack;
  }

  build(arena: ArenaName, night: boolean, evening: boolean) {
    this.arena = arena;
    this.buildCastleHpBar();   // aksi halde setCastleHp() çizimi ekran dışında kalır
    this.night = night || NIGHT_ARENAS.includes(arena);
    // DİKKAT: alanlar yeniden ATANMAMALI. Sprite'lar constructor'da sahneye
    // eklendi; yeniden new yapmak eskisini sahneden koparır ve gökyüzü/okyanus
    // hiç çizilmez. Sadece dokuyu değiştir.
    this.sky.texture = skyTex(this.night ? 'night' : evening ? 'sunset' : 'day');
    this.sky.width = 1080; this.sky.height = 1920;
    this.skyNight.texture = skyFactory('night');
    this.skyNight.width = 1080; this.skyNight.height = 1920;
    this.skyNight.alpha = 0;
    this.ocean.texture = waterTex(this.night ? 'night' : evening ? 'sunset' : 'day');
    this.ocean.width = 1080; this.ocean.height = 430;
    this.ocean.y = 250;

    // sand plateau
    this.sandLayer.removeChildren();
    const sandSprite = new PIXI.Sprite(sandTex(SAND[arena]));
    sandSprite.anchor.set(0.5);
    sandSprite.width = 1180; sandSprite.height = 1420;
    sandSprite.position.set(540, 980);
    // island silhouette: mask the sand into an organic ellipse
    const islandMask = new PIXI.Graphics();
    islandMask.ellipse(540, 980, 470, 560).fill(0xffffff);
    islandMask.ellipse(300, 1180, 150, 180).fill(0xffffff);
    islandMask.ellipse(800, 1290, 130, 150).fill(0xffffff);
    this.sandLayer.addChild(islandMask);
    sandSprite.mask = islandMask;
    this.sandLayer.addChild(sandSprite);
    const edge = new PIXI.Graphics();
    // wet sand rim + foam line
    edge.ellipse(540, 980, 474, 564).stroke({ color: 0x0b3d52, alpha: 0.35, width: 22 });
    edge.ellipse(540, 980, 486, 576).stroke({ color: 0xffffff, alpha: 0.55, width: 9 });
    edge.ellipse(540, 992, 452, 546).stroke({ color: 0xffffff, alpha: 0.16, width: 5 });
    this.sandLayer.addChild(edge);

    // stars (night)
    this.stars.clear();
    if (this.night) {
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * 1080, y = Math.random() * 700, r = Math.random() * 1.8 + 0.6;
        this.stars.circle(x, y, r).fill({ color: 0xffffff, alpha: Math.random() * 0.8 + 0.2 });
      }
    }

    // props
    this.palms = []; this.torches = []; this.crabs = []; this.gulls = []; this.decals = [];
    this.propsFront.removeChildren(); this.propsBack.removeChildren();
    if (this.castle) this.propsFront.addChild(this.castle);

    const palmSpots: [number, number, number][] = [
      [70, 300, 1], [1010, 260, -1], [55, 640, 1], [1030, 700, -1], [90, 1560, 1], [1000, 1640, -1],
    ];
    for (const [x, y, f] of palmSpots) {
      const s = new PIXI.Sprite(palmTex());
      s.anchor.set(0.5, 1); s.position.set(x, y); s.scale.x = f;
      const h = 340 * (arena === 'volcano' ? 0.8 : 1);
      s.height = h; s.width = h * 0.75;
      this.propsBack.addChild(s);
      this.palms.push({ s, base: f > 0 ? 0.02 : -0.02, phase: Math.random() * 6, amp: 0.03 + Math.random() * 0.025 });
    }
    const rockSpots: [number, number, number][] = [
      [130, 1180, 120], [960, 1260, 150], [140, 1740, 100], [950, 1780, 130],
    ];
    for (const [x, y, w] of rockSpots) {
      const s = new PIXI.Sprite(rockTex(Math.random() > 0.5 ? 1 : 0));
      s.anchor.set(0.5, 1); s.position.set(x, y);
      s.width = w; s.height = w * 0.75;
      this.propsBack.addChild(s);
    }
    for (const [x, y] of [[70, 1000], [1010, 1040], [70, 1400], [1010, 1440]] as [number, number][]) {
      const stick = new PIXI.Sprite(torchTex());
      stick.anchor.set(0.5, 1); stick.position.set(x, y); stick.height = 110; stick.width = 40;
      const flame = new PIXI.Sprite(flameTex());
      flame.anchor.set(0.5, 1); flame.position.set(x, y - 100); flame.width = 52; flame.height = 78;
      const glow = new PIXI.Sprite(glowTex());
      glow.anchor.set(0.5); glow.position.set(x, y - 118); glow.width = 320; glow.height = 320;
      glow.tint = 0xff9a3c; glow.alpha = 0.5; glow.blendMode = 'add';
      this.propsBack.addChild(glow, stick, flame);
      this.torches.push({ stick, flame, glow, phase: Math.random() * 6, base: y - 100 });
    }
    // starfish scattered on the sand (slow shimmer)
    this.starfish = [];
    for (let i = 0; i < 7; i++) {
      const st = new PIXI.Sprite(starfishTex());
      st.anchor.set(0.5);
      st.width = 30 + Math.random() * 22; st.height = st.width;
      st.position.set(150 + Math.random() * 780, 620 + Math.random() * 900);
      st.rotation = Math.random() * Math.PI;
      st.alpha = 0.85;
      this.propsFront.addChild(st);
      this.starfish.push({ s: st, base: st.rotation, phase: Math.random() * 6 });
    }
    for (let i = 0; i < 4; i++) {
      const s = new PIXI.Sprite(crabTex(i % 2 === 1));
      s.anchor.set(0.5); s.width = 66; s.height = 50;
      const x = 200 + Math.random() * 700, y = 700 + Math.random() * 900;
      s.position.set(x, y);
      this.propsFront.addChild(s);
      this.crabs.push({ s, x, y, vx: (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 10), phase: Math.random() * 6 });
    }
    for (let i = 0; i < 3; i++) {
      const s = new PIXI.Sprite(gullTex());
      s.anchor.set(0.5); s.width = 62; s.height = 42;
      s.position.set(Math.random() * 1080, 210 + Math.random() * 420);
      this.propsBack.addChild(s);
      this.gulls.push({ s, x: s.x, y: s.y, vx: 26 + Math.random() * 22, phase: Math.random() * 6 });
    }

    // vignette
    if (!this.vignette) {
      this.vignette = new PIXI.Sprite(vignetteTex());
      this.vignette.width = 1080; this.vignette.height = 1920;
    }
    this.overlay.removeChildren();
    // atmos katmanları korunur (build sırasında yeniden eklenir)
    this.lightG.blendMode = 'add';
    this.moodG.blendMode = 'add';
    this.overlay.addChild(this.lightG, this.moodG, this.vignette);
    this.buildRain();
    this.castleHp = this.castleMaxHp = 800;
  }

  /** Diegetic castle HP bar, anchored to the castle (world space, not HUD). */
  buildCastleHpBar() {
    if (this.castleHpG.parent) this.castleHpG.parent.removeChild(this.castleHpG);
    if (this.castleHpLabel.parent) this.castleHpLabel.parent.removeChild(this.castleHpLabel);
    const bg = new PIXI.Graphics();
    bg.roundRect(400, 1024, 280, 40, 14).fill({ color: 0x0b1024, alpha: 0.78 });
    bg.roundRect(400, 1024, 280, 40, 14).stroke({ color: 0xffffff, width: 2, alpha: 0.22 });
    this.castleHpLabel.anchor.set(0.5); this.castleHpLabel.position.set(540, 1064);
    this.fxGround.addChild(bg, this.castleHpG, this.castleHpLabel);
    this.castleHpBg = bg;
  }
  private castleHpBg?: PIXI.Graphics;
  setCastleHp(pct: number, label: string) {
    this.castleHpG.clear();
    const w = Math.max(0, Math.min(1, pct));
    this.castleHpG.roundRect(406, 1058, 268 * w, 26, 9)
      .fill({ color: w > 0.5 ? 0x4be07a : w > 0.2 ? 0xffd23f : 0xff3b5c, alpha: 0.95 });
    this.castleHpLabel.text = label;
  }

  private buildRain() {
    this.rainSprites = []; this.rainVY = [];
    for (let i = 0; i < 70; i++) {
      const s = new PIXI.Sprite(tex('rain', 24, 96, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(200,225,255,0)');
        gr.addColorStop(0.5, 'rgba(210,235,255,0.8)');
        gr.addColorStop(1, 'rgba(200,225,255,0)');
        g.fillStyle = gr; g.fillRect(w * 0.38, 0, w * 0.24, h);
      }));
      s.anchor.set(0.5);
      s.width = 10; s.height = 70;
      s.position.set(Math.random() * 1080, Math.random() * 1920);
      s.visible = false;
      this.overlay.addChild(s);
      this.rainSprites.push(s);
      this.rainVY.push(900 + Math.random() * 500);
    }
  }

  splatter(x: number, y: number, color = 0x8c2b2b, size = 60, life = 14) {
    const s = new PIXI.Sprite(discTex());
    s.anchor.set(0.5);
    s.tint = color;
    s.width = size * (0.8 + Math.random() * 0.6);
    s.height = s.width * 0.62;
    s.position.set(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 12);
    s.rotation = Math.random() * 6;
    s.alpha = 0.38;
    this.decals.splice(0, Math.max(0, this.decals.length - 26));
    this.fxGround.addChild(s);
    this.decals.push({ s, life, max: life });
  }

  castleDamage(pct: number) {
    this.castleHp = pct;
    const damaged = pct < 0.6;   // pct ORAN (0..1); HP ile karşılaştırılıyordu
    if (this.castle) this.castle.tint = damaged ? 0xd8b0b0 : 0xffffff;
    this.castleSmoke = damaged ? 1 : 0;
  }

  update(dt: number, opts: { tide: number; storm: number; sunset: number; arena: ArenaName }) {
    this.time += dt;
    const t = this.time;
    this.tideLevel += (opts.tide - this.tideLevel) * Math.min(1, dt * 2.2);
    this.storm += (opts.storm - this.storm) * Math.min(1, dt * 2.5);
    this.sunset = opts.sunset;

    this.frameParity = (this.frameParity + 1) & 1;
    const heavy = this.frameParity === 0;
    // Faz 1.1/1.2: derinlik + ışık + sanat yönetimi (her karede)
    this.updateAtmos(dt);
    this.updateLight();
    // ocean bob + wave lines
    this.ocean.y = 250 + Math.sin(t * 0.8) * 6;
    const waveY = 250 + this.ocean.height;
    if (!heavy) { /* wave overlay refreshed every other frame */ } else {
    this.waveG.clear();
    const lvl = waveY + this.tideLevel * 640;
    this.lastTideLvl = lvl;
    this.waveG.rect(0, 0, 1080, lvl).fill({ color: this.night ? 0x0d2b52 : 0x1f9fd0, alpha: 0.55 + this.tideLevel * 0.35 });
    for (let i = 0; i < 4; i++) {
      const yy = 250 + i * 26 + Math.sin(t * 1.4 + i) * 5;
      this.waveG.moveTo(0, yy);
      for (let x = 0; x <= 1080; x += 24) this.waveG.lineTo(x, yy + Math.sin(x / 90 + t * 2.2 + i * 1.3) * 6);
      this.waveG.stroke({ color: 0xffffff, alpha: 0.35 - i * 0.06, width: 4 });
    }
    }
    // tide foam edge
    if (heavy) this.foamG.clear();
    if (heavy && this.tideLevel > 0.02) {
      const fy = this.lastTideLvl;
      this.foamG.moveTo(0, fy);
      for (let x = 0; x <= 1080; x += 18) this.foamG.lineTo(x, fy + Math.sin(x / 70 + t * 3) * 9);
      this.foamG.stroke({ color: 0xffffff, alpha: 0.85, width: 7 });
      for (let i = 0; i < 6; i++) {
        const bx = ((t * 40 + i * 190) % 1200) - 60;
        this.foamG.circle(bx, fy + Math.sin(bx / 70 + t * 3) * 9, 10 + i).fill({ color: 0xffffff, alpha: 0.25 });
      }
    }

    // palms sway
    for (const p of this.palms) {
      p.s.rotation = p.base + Math.sin(t * 1.25 + p.phase) * p.amp + Math.sin(t * 3.1 + p.phase) * p.amp * 0.25;
    }
    // torches flicker
    for (const tt of this.torches) {
      const f = 0.85 + Math.sin(t * 17 + tt.phase) * 0.12 + Math.sin(t * 29 + tt.phase * 2) * 0.06;
      tt.flame.scale.set((52 / 52) * f, (78 / 78) * (0.9 + (f - 0.85) * 1.6));
      tt.flame.position.y = tt.base - (f - 0.85) * 12;
      tt.glow.alpha = 0.34 + (f - 0.85) * 1.1;
      tt.glow.scale.set((320 / 128) * (0.9 + (f - 0.85)), (320 / 128) * (0.9 + (f - 0.85)));
    }
    // crabs scuttle
    for (const c of this.crabs) {
      c.x += c.vx * dt;
      if (c.x < 140 || c.x > 940) { c.vx *= -1; c.s.scale.x = Math.sign(c.vx); }
      c.s.x = c.x;
      c.s.y = c.y + Math.abs(Math.sin(t * 7 + c.phase)) * 4;
      c.s.rotation = Math.sign(c.vx) * 0.08 + Math.sin(t * 7 + c.phase) * 0.06;
    }
    // gulls fly + flap
    for (const g of this.gulls) {
      g.x += g.vx * dt;
      if (g.x > 1140) { g.x = -60; g.y = 260 + Math.random() * 520; }
      g.s.x = g.x;
      g.s.y = g.y + Math.sin(t * 1.6 + g.phase) * 22;
      g.s.scale.y = (42 / 128) * (0.55 + Math.abs(Math.sin(t * 6.5 + g.phase)) * 0.65);
      g.s.scale.x = 62 / 192;
    }
    // stars twinkle
    if (this.night) {
      this.stars.alpha = 0.7 + Math.sin(t * 2.2) * 0.2;
    }
    // starfish shimmer
    for (const st of this.starfish) {
      st.s.rotation = st.base + Math.sin(t * 0.5 + st.phase) * 0.08;
      st.s.alpha = 0.7 + Math.sin(t * 1.3 + st.phase) * 0.18;
    }
    // smooth AFTERNOON -> SUNSET -> NIGHT crossfade (driven by the match clock)
    const target = this.night ? 1 : Math.max(0, Math.min(1, (this.dayProgress - 0.55) / 0.45));
    this.nightAmt += (target - this.nightAmt) * Math.min(1, dt * 0.8);
    this.skyNight.alpha = this.nightAmt * 0.92;
    if (this.nightAmt > 0.02) {
      this.skyNight.tint = 0xffffff;
      // warm the moonlit scene a touch less at the start of the night
      this.skyNight.alpha = 0.92 * Math.min(1, this.nightAmt * 1.2);
    }
    // decals fade slowly
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) {
        d.s.destroy();
        this.decals.splice(i, 1);
      } else if (d.life < 3) {
        d.s.alpha = 0.38 * (d.life / 3);
      }
    }
    // rain
    const raining = this.storm > 0.35;
    for (let i = 0; i < this.rainSprites.length; i++) {
      const s = this.rainSprites[i];
      s.visible = raining;
      if (!raining) continue;
      s.y += this.rainVY[i] * dt * this.storm;
      s.x -= 120 * dt;
      if (s.y > 1940) { s.y = -60; s.x = Math.random() * 1080; }
    }
    // storm darkening + sunset grade
    if (!this.gradeG) this.gradeG = new PIXI.Graphics();
    if (!this.gradeG.parent) this.overlay.addChildAt(this.gradeG, 2);
    this.gradeG.clear();
    if (this.sunset > 0.01 && this.nightAmt < 0.9) {
      this.gradeG.rect(0, 0, 1080, 1920).fill({ color: 0xff6d00, alpha: this.sunset * 0.16 * (1 - this.nightAmt) });
    }
    if (this.storm > 0.01) {
      this.gradeG.rect(0, 0, 1080, 1920).fill({ color: 0x1b2440, alpha: this.storm * 0.4 });
    }
    // castle smoke
    if (this.castleSmoke > 0) {
      if (Math.random() < dt * 6) {
        const puff = new PIXI.Sprite(discTex());
        puff.anchor.set(0.5); puff.tint = 0x555555; puff.alpha = 0.4;
        puff.width = 40; puff.height = 40;
        puff.position.set(500 + Math.random() * 80, 830);
        this.fxAir.addChild(puff);
        tweener.to(puff, 'y', 700, 1.6, { onDone: () => puff.destroy() });
        tweener.to(puff, 'alpha', 0, 1.6, { ease: undefined });
      }
    }
  }
  private gradeG?: PIXI.Graphics;

  /* ---- Faz 1.1: parallax + ışık/renk yönetimi ---- */
  /** 0=gündüz, 1=akşam, 2=fırtına, 3=boss, 4=final — sanat yönetimi modu */
  mood: 'day' | 'sunset' | 'storm' | 'boss' | 'final' = 'day';
  private moodAmt = 0;
  private breathe = 0;
  private rimStatic = new PIXI.Graphics();
  private rimG = new PIXI.Graphics();
  private moodG = new PIXI.Graphics();
  private lightG = new PIXI.Graphics();
  private rimPts: { x: number; y: number; a: number }[] = [];
  private moodColor = 0xff6d00;
  private moodTarget = 0;
  private moodPow = 1;
  setMood(m: 'day' | 'sunset' | 'storm' | 'boss' | 'final') { this.mood = m; }
  /** Faz 4: kamera nefesi aç/kapa (konsoldan). */
  breath = true;

  /** Arena kenarı ışık halkası + taşlar (bir kere kurulur). */
  private buildRim() {
    this.rimStatic.clear();
    const cx = 540, cy = 960, rx = 452, ry = 452 * 1.2;
    // dış ışık halkası: arena çevresinde sıcak parlama
    for (let i = 0; i < 3; i++) {
      this.rimStatic.ellipse(cx, cy, rx + i * 7, ry + i * 7)
        .stroke({ color: 0xffe9a8, width: 3 - i, alpha: 0.16 - i * 0.045 });
    }
    // kenar taşları (düzensiz, doğal)
    for (let i = 0; i < 26; i++) {
      const an = (i / 26) * Math.PI * 2 + 0.21;
      const wob = 1 + Math.sin(i * 2.7) * 0.028 + Math.cos(i * 1.3) * 0.02;
      const x = cx + Math.cos(an) * (rx + 20) * wob;
      const y = cy + Math.sin(an) * (ry + 20) * wob;
      const s = 9 + (i % 4) * 4;
      const shade = 0.5 + Math.sin(i * 1.9) * 0.22;
      this.rimStatic.ellipse(x, y + s * 0.5, s * 1.35, s * 0.62)
        .fill({ color: 0x6b5a44, alpha: 0.5 });
      this.rimStatic.ellipse(x, y, s, s * 0.8)
        .fill({ color: 0x8d7a5e, alpha: shade });
      this.rimStatic.ellipse(x - s * 0.22, y - s * 0.26, s * 0.6, s * 0.4)
        .fill({ color: 0xbfae8c, alpha: shade * 0.8 });
      this.rimPts.push({ x, y, a: 0.4 + shade * 0.4 });
    }
    // iç arena çizgisi: oyuncuların savaştığı sınır burada belli olsun
    this.rimStatic.ellipse(cx, cy, 430, 430 * 1.2)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.1 });
  }

  /** Sanat yönetimi rengi: moda göre ekran tonu. */
  private moodSpec(): { c: number; a: number } {
    switch (this.mood) {
      case 'storm': return { c: 0x2a3c66, a: 0.4 };
      case 'boss': return { c: 0xff2e3f, a: 0.2 };
      case 'final': return { c: 0xffa03a, a: 0.24 };
      case 'sunset': return { c: 0xff6d00, a: 0.17 };
      default: return { c: 0xffe9a8, a: 0.05 };
    }
  }

  /** Faz 1.2: her karede derinlik + ışık + nefes. */
  private updateAtmos(dt: number) {
    const t = this.time;
    this.breathe += dt;
    // kamera nefesi: çok hafif salınım (canlılık hissi)
    const amp = this.breath ? 1 : 0;
    const bx = Math.sin(this.breathe * 0.55) * 3.2 * amp;
    const by = Math.cos(this.breathe * 0.42) * 2.6 * amp;
    // parallax: uzak katman yavaş, yakın katman hızlı kayar
    const wind = Math.sin(t * 0.18) * 0.5 + 0.5;
    this.sky.position.set(bx * 0.15 + wind * 4, by * 0.15);
    this.skyNight.position.set(bx * 0.18, by * 0.18);
    this.stars.position.set(bx * 0.1, by * 0.1);
    this.ocean.x = bx * 0.5;
    this.waveG.x = bx * 0.62;
    this.foamG.x = bx * 0.62;
    this.propsBack.x = bx * 0.78;
    this.sandLayer.x = bx * 0.9;
    this.propsFront.x = bx * 1.05;

    // sanat yönetimi tonu
    const spec = this.moodSpec();
    if (spec.a !== this.moodTarget || spec.c !== this.moodColor) {
      this.moodTarget = spec.a;
      this.moodColor = spec.c;
    }
    this.moodAmt += (this.moodTarget - this.moodAmt) * Math.min(1, dt * 2.4);
    this.moodPow = this.moodAmt;
    this.moodG.clear();
    if (this.moodPow > 0.005) {
      const pulse = 1 + Math.sin(t * 2.1) * 0.06;
      this.moodG.rect(0, 0, 1080, 1920)
        .fill({ color: this.moodColor, alpha: this.moodPow * pulse });
    }

    // kenar ışığı: boss/final'de nabız atar
    const rimPulse = this.mood === 'boss' ? 0.5 + Math.sin(t * 5.5) * 0.4
      : this.mood === 'final' ? 0.45 + Math.sin(t * 3.4) * 0.35 : 0;
    const rimCol = this.mood === 'final' ? 0xffc46b : this.mood === 'boss' ? 0xff5b5b : 0xffe9a8;
    this.rimG.clear();
    const glowA = 0.1 + rimPulse * 0.42;
    this.rimG.ellipse(540, 960, 456, 456 * 1.2)
      .stroke({ color: rimCol, width: 4 + rimPulse * 4, alpha: glowA });
    this.rimG.ellipse(540, 960, 470 + rimPulse * 10, (470 + rimPulse * 10) * 1.2)
      .stroke({ color: rimCol, width: 2, alpha: glowA * 0.4 });
    if (rimPulse > 0.02) {
      for (const p of this.rimPts) {
        const a = p.a * (0.5 + rimPulse * 0.8) * (this.night ? 0.75 : 1);
        this.rimG.ellipse(p.x, p.y, 11, 9).fill({ color: rimCol, alpha: a * 0.5 });
      }
    }
  }

  /** Arena üstünde yumuşak ışık lekesi (merkez odak). */
  private updateLight() {
    const t = this.time;
    this.lightG.clear();
    // sıcak güneş lekesi soldan
    const sunX = 300 + Math.sin(t * 0.07) * 90;
    this.lightG.ellipse(sunX, 520, 520, 460).fill({ color: 0xfff0b8, alpha: 0.06 });
    // gece ay ışığı sağdan
    if (this.nightAmt > 0.05) {
      this.lightG.ellipse(820, 460, 440, 400)
        .fill({ color: 0xa8c8ff, alpha: 0.07 * this.nightAmt });
    }
    // boss kırmızı alan basıncı
    if (this.mood === 'boss') {
      const p = 0.5 + Math.sin(t * 5.5) * 0.5;
      this.lightG.ellipse(540, 960, 520, 600).fill({ color: 0xff2e3f, alpha: 0.05 + p * 0.05 });
    }
    // final: altın basınç
    if (this.mood === 'final') {
      const p = 0.5 + Math.sin(t * 3.2) * 0.5;
      this.lightG.ellipse(540, 1100, 600, 520).fill({ color: 0xffa03a, alpha: 0.05 + p * 0.06 });
    }
  }
}
