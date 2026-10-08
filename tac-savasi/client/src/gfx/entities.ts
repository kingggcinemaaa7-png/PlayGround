// Entity view rendering: interpolated movement, squash/stretch, hit flash,
// death/respawn, streak spike rings, boss composition, monster/bullet sprites.
import * as PIXI from 'pixi.js';
import {
  ringFrameTex, spikesTex, crownTex, discTex, glowTex,
  krakenTex, tentacleTex, clawTex, crabTex, sparkTex,
  boomerangTex, chainOrbTex, badgeTex, orbitStarTex, orbitTrailTex,
} from './textures.js';
import { tweener, Ease } from './tween.js';
import { truncateNick, upper } from '@tac/shared';
import { soft } from './hud.js';
import { assets } from '../assets.js';

export interface AvatarLike {
  userId: string; name: string; x: number; y: number;
  hp: number; maxHp: number; alive: boolean;
  streak: number; shieldUntil: number; trappedUntil: number;
  powerLabel?: string;
  doubleUntil: number; fuerzaUntil: number; speedUntil: number;
  poisonUntil: number; healUntil: number;
  rageUntil: number; ghostUntil: number; vampUntil: number;
  giantUntil: number; giantActive: boolean;
  reflectUntil: number; chainUntil: number;
  fireCd: number; respawnAt: number;
  aimX?: number; aimY?: number; aimT?: number;
  orbAngle: number;
}

export class AvatarView {
  root = new PIXI.Container();
  shadow = new PIXI.Graphics();
  ring = new PIXI.Sprite(PIXI.Texture.WHITE);
  spikes = new PIXI.Sprite(PIXI.Texture.WHITE);
  pic = new PIXI.Sprite(PIXI.Texture.WHITE);
  crown = new PIXI.Sprite(assets.texOr('avatars.crown', crownTex));
  assetV = -1; // bumped by EntityLayer when real art lands
  hpBg = new PIXI.Graphics();
  hp = new PIXI.Graphics();
  nameT = new PIXI.Text({ text: '', style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 21, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x12081f, width: 4, join: 'round' } } });
  pill = new PIXI.Container();
  pillT = new PIXI.Text({ text: '', style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 17, fill: 0x12081f, fontWeight: '800' } });
  pillBg = new PIXI.Graphics();
  /**
   * H7: guç hapları her karede yeniden kuruluyordu (Container + Graphics +
   * Text, 60 oyuncu x ~2 g��ç = kare başına ~360 Graphics + ~120 metin
   * ölçümü). Şimdi havuzdan alınıyor; sadece dolgu genişliği ve metin
   * değiştiğinde dokunuluyor.
   */
  pillRows: { holder: PIXI.Container; bg: PIXI.Graphics; fill: PIXI.Graphics; label: PIXI.Text; last: string; w: number }[] = [];
  static readonly MAX_PILL_ROWS = 4;
  streakT = new PIXI.Text({ text: '', style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 16, fill: 0xffffff, fontWeight: '800', stroke: { color: 0x12081f, width: 4, join: 'round' } } });
  tornadoRing = new PIXI.Graphics();
  aura = new PIXI.Graphics();
  /** nişan hattı + nişangâh (ateşe hazırlanırken uzar) */
  aim = new PIXI.Graphics();
  /** yörünge silahı: profil fotoğrafının etrafında dönen yıldızlar + izler */
  orbit = new PIXI.Container();
  orbStars: PIXI.Sprite[] = [];      // bumerang paletleri
  orbTrails: PIXI.Sprite[] = [];     // arkalarındaki ışık halesi
  orbChain: PIXI.Sprite[][] = [];   // her bumerang için 9 halka topu (zincir)
  /** can halkası: profil fotoğrafının çevresini saran gösterge */
  hpRing = new PIXI.Graphics();
  /** güç/hız/seri rozetleri (avatarın üstünde) */
  badges = new PIXI.Container();
  /** silah rengi: güç/seri durumuna göre değişir */
  orbHue = '#ffd23f';
  orbSpokes = 5;
  flashAmt = 0;
  hitOff = { x: 0, y: 0 };
  /** ölüm animasyonu: 0 = canlı, >0 ölüm zamanlayıcısı, -1 = hayalet/corpse */
  deathT = 0;
  deathFrom = { x: 0, y: 0 };
  deathSpin = 0;
  deathVy = 0;
  respawnT = 0;
  constructor() {
    this.nameT.anchor.set(0.5, 0);
    this.nameT.resolution = 2;
    this.streakT.anchor.set(0.5, 0);
    this.streakT.resolution = 2;
    this.pillT.anchor.set(0.5, 0.5);
    this.pillT.resolution = 2;
    this.shadow.ellipse(0, 34, 30, 11).fill({ color: 0x000000, alpha: 0.3 });
    this.pic.anchor.set(0.5);
    this.pic.width = this.pic.height = 56;
    this.ring.anchor.set(0.5);
    this.ring.width = this.ring.height = 66;
    this.spikes.anchor.set(0.5);
    this.spikes.width = this.spikes.height = 96;
    this.spikes.visible = false;
    this.crown.anchor.set(0.5); this.crown.width = 46; this.crown.height = 34; this.crown.visible = false;
    this.pill.addChild(this.pillBg, this.pillT);
    this.pill.visible = false;
    for (let i = 0; i < AvatarView.MAX_PILL_ROWS; i++) {
      const holder = new PIXI.Container();
      const bg = new PIXI.Graphics();
      const fill = new PIXI.Graphics();
      const label = soft('', 14, 0xffffff);
      label.anchor.set(0.5); label.position.set(0, 10);
      holder.addChild(bg, fill, label);
      holder.visible = false;
      this.pill.addChild(holder);
      this.pillRows.push({ holder, bg, fill, label, last: '', w: 0 });
    }
    this.tornadoRing.circle(0, 0, 76).stroke({ color: 0x9fe8ff, width: 4, alpha: 0.7 });
    this.tornadoRing.visible = false;
    // YÖRÜNGE SİLAHI: her bumerang için 1 palet + 9 halka topu. Toplar
    // paletin arkasında kuyruk oluşturur -> referans oyundaki "ışık zinciri".
    for (let i = 0; i < 3; i++) {
      const blade = new PIXI.Sprite(boomerangTex());
      blade.anchor.set(0.5); blade.width = 54; blade.height = 54;
      const glow = new PIXI.Sprite(glowTex());
      glow.anchor.set(0.5); glow.blendMode = 'add'; glow.tint = 0xffb43c;
      glow.width = glow.height = 124; glow.alpha = 0.45;
      const chain: PIXI.Sprite[] = [];
      const chainHolder = new PIXI.Container();
      for (let k = 0; k < 9; k++) {
        const o = new PIXI.Sprite(chainOrbTex());
        o.anchor.set(0.5); o.blendMode = 'add';
        o.width = o.height = 20 - k * 1.4;
        o.alpha = 0.8 - k * 0.08;
        chainHolder.addChild(o);
        chain.push(o);
      }
      const g = new PIXI.Container();
      g.addChild(chainHolder, glow, blade);
      g.visible = false;
      this.orbit.addChild(g);
      this.orbStars.push(blade);
      this.orbTrails.push(glow);
      this.orbChain.push(chain);
    }
    this.root.addChild(
      this.shadow, this.aura, this.tornadoRing, this.spikes, this.ring,
      this.orbit, this.aim, this.badges, this.hpRing, this.pic,
      this.hpBg, this.hp, this.crown, this.pill, this.streakT, this.nameT,
    );
  }

  /**
   * Yörünge silahını çiz: yıldızlar fotoğrafın etrafında döner, arkalarında
   * parlar iz bırakır ve hafifçe zıplar (canlılık).
   */
  syncOrbit(count: number, radius: number, angle: number, time: number, scale: number, hue: string, tint: number) {
    for (let i = 0; i < this.orbStars.length; i++) {
      const g = this.orbit.children[i] as PIXI.Container;
      if (i >= count || count <= 0) { g.visible = false; continue; }
      g.visible = true;
      const blade = this.orbStars[i];
      const glow = this.orbTrails[i];
      const chain = this.orbChain[i] ?? [];
      const spin = time * 7 + i * 2.1;            // palet kendi ekseninde döner
      const arm = angle + (i * Math.PI * 2) / count;
      const bob = Math.sin(time * 6 + i * 1.7) * 3;
      const pop = 1 + Math.sin(time * 9 + i * 2) * 0.07;

      // ZİNCİR: paletin arkasında 9 parlak top -> uçan ışık zinciri hissi
      for (let k = 0; k < chain.length; k++) {
        const back = arm - (k + 1) * 0.17;
        const br = radius * (1 - k * 0.032);
        const o = chain[k];
        o.x = Math.cos(back) * br;
        o.y = Math.sin(back) * br * 0.62;
        o.tint = tint;
        const shimmer = 0.6 + Math.sin(time * 12 - k * 0.9) * 0.4;
        o.alpha = (0.9 - k * 0.08) * shimmer;
        o.scale.set(((20 - k * 1.4) / 64) * (0.8 + shimmer * 0.4) * scale);
      }

      g.x = Math.cos(arm) * radius;
      g.y = Math.sin(arm) * radius * 0.62 + bob;
      blade.rotation = spin;
      blade.width = blade.height = 54 * scale * pop;
      blade.tint = tint;
      glow.tint = tint;
      glow.alpha = 0.32 + Math.sin(time * 8 + i * 1.3) * 0.15;
      glow.width = glow.height = 124 * scale * pop;
    }
  }
  hideOrbit() { for (const g of this.orbit.children) g.visible = false; }

  /** Can halkası: profil fotoğrafını saran yay (yeşil -> sarı -> kırmızı). */
  syncHpRing(pct: number, shield: boolean, time: number) {
    const g = this.hpRing;
    g.clear();
    const p = Math.max(0, Math.min(1, pct));
    const col = shield ? 0x7fe8ff : p > 0.55 ? 0x4be07a : p > 0.28 ? 0xffd23f : 0xff3b5c;
    const R = 34;
    g.circle(0, 0, R).stroke({ color: 0x12081f, width: 8, alpha: 0.6 });
    if (p > 0.001) {
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * p;
      g.arc(0, 0, R, start, end).stroke({ color: col, width: 6, alpha: 0.98 });
      g.circle(Math.cos(end) * R, Math.sin(end) * R, 4.5).fill({ color: 0xffffff, alpha: 0.95 });
    }
    if (p <= 0.28) {
      const k = 0.5 + Math.sin(time * 9) * 0.5;
      g.circle(0, 0, R + 7).stroke({ color: 0xff3b5c, width: 3, alpha: 0.18 + k * 0.5 });
    }
    if (shield) {
      g.circle(0, 0, R + 10).stroke({ color: 0x39d0ff, width: 2, alpha: 0.3 + Math.sin(time * 7) * 0.25 });
    }
  }

  /** Avatarın üstünde küçük rozetler (hız / öfke / seri / kalkan). */
  syncBadges(list: { icon: string; color: number }[], time: number) {
    while (this.badges.children.length < list.length) {
      const bg = new PIXI.Sprite(badgeTex());
      bg.anchor.set(0.5); bg.width = bg.height = 30;
      const ico = new PIXI.Text({
        text: '', style: { fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif', fontSize: 17 },
      });
      ico.anchor.set(0.5); ico.resolution = 2;
      const c = new PIXI.Container() as PIXI.Container & { bgRef: PIXI.Sprite; icoRef: PIXI.Text };
      c.addChild(bg, ico);
      c.bgRef = bg; c.icoRef = ico;
      this.badges.addChild(c);
    }
    const kids = this.badges.children;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i] as PIXI.Container & { bgRef: PIXI.Sprite; icoRef: PIXI.Text };
      if (i >= list.length) { c.visible = false; continue; }
      c.visible = true;
      const b = list[i];
      c.x = (i - (list.length - 1) / 2) * 31;
      c.y = -48 + Math.sin(time * 5 + i) * 2;
      if (c.icoRef.text !== b.icon) c.icoRef.text = b.icon;
      c.bgRef.tint = b.color;
      c.scale.set(0.94 + Math.sin(time * 6 + i * 1.4) * 0.06);
    }
  }
}

export class EntityLayer {
  root = new PIXI.Container();
  avatars = new Map<string, AvatarView>();
  bullets: PIXI.Sprite[] = [];
  bulletGlow: PIXI.Sprite[] = [];
  monsters = new Map<string, { root: PIXI.Container; spr: PIXI.Sprite; bob: number }>();
  bossRoot = new PIXI.Container();
  private bossAssetV = -1;
  private bossIsKraken = true;
  bossHead = new PIXI.Sprite(krakenTex());
  bossTentacles: PIXI.Sprite[] = [];
  bossClaws: PIXI.Sprite[] = [];
  bossGlow = new PIXI.Sprite(glowTex());
  clones = new Map<string, CloneView>();
  monsterTex = crabTex(true);
  /** yörünge silahı ayarları (sim config'inden gelir) */
  orbitCount = 2;
  orbitRadius = 46;
  private poolSize = 340;

  constructor() {
    for (let i = 0; i < this.poolSize; i++) {
      const g = new PIXI.Sprite(glowTex());
      g.anchor.set(0.5); g.visible = false; g.blendMode = 'add';
      g.width = 46; g.height = 26;
      this.bulletGlow.push(g);
      this.root.addChild(g);
      const s = new PIXI.Sprite(sparkTex());
      s.anchor.set(0.5); s.visible = false;
      s.width = 22; s.height = 14;
      this.bullets.push(s);
      this.root.addChild(s);
    }
    for (let i = 0; i < 12; i++) {
      const spr = new PIXI.Sprite(crabTex(true));
      spr.anchor.set(0.5); spr.visible = false;
      const root = new PIXI.Container();
      const shadow = new PIXI.Graphics();
      shadow.ellipse(0, 20, 26, 9).fill({ color: 0x000000, alpha: 0.28 });
      root.addChild(shadow, spr);
      spr.scale.set(64 / 256, 48 / 192);
      root.visible = false;
      this.root.addChild(root);
      this.monsters.set('m' + i, { root, spr, bob: Math.random() * 6 });
    }
    // boss composition: tentacles behind head, claws optional
    this.bossGlow.anchor.set(0.5);
    this.bossGlow.tint = 0xb98bff;
    this.bossGlow.alpha = 0.55;
    this.bossGlow.blendMode = 'add';
    this.bossGlow.width = this.bossGlow.height = 520;
    this.bossHead.anchor.set(0.5);
    this.bossHead.width = 260; this.bossHead.height = 220;
    this.bossRoot.addChild(this.bossGlow);
    for (let i = 0; i < 6; i++) {
      const t = new PIXI.Sprite(tentacleTex(i));
      t.anchor.set(0.5, 0.5);
      t.width = 190; t.height = 66;
      this.bossTentacles.push(t);
      this.bossRoot.addChild(t);
    }
    this.bossRoot.addChild(this.bossHead);
    for (let i = 0; i < 2; i++) {
      const c = new PIXI.Sprite(clawTex());
      c.anchor.set(0.5);
      c.width = 150; c.height = 130;
      this.bossClaws.push(c);
      this.bossRoot.addChild(c);
    }
    this.bossRoot.visible = false;
    this.root.addChild(this.bossRoot);
  }

  clone(id: string): CloneView {
    let v = this.clones.get(id);
    if (!v) {
      v = new CloneView();
      this.clones.set(id, v);
      this.root.addChild(v.root);
    }
    return v;
  }
  removeClone(id: string) {
    const v = this.clones.get(id);
    if (v) { v.root.destroy({ children: true }); this.clones.delete(id); }
  }
  syncClone(v: CloneView, m: { x: number; y: number; hp: number; maxHp: number }, pic: PIXI.Texture, time: number) {
    v.root.position.set(m.x, m.y + Math.sin(time * 7 + m.x * 0.05) * 2);
    if (v.pic.texture !== pic) v.pic.texture = pic;
    v.pic.rotation = Math.sin(time * 3) * 0.06;
    v.ring.clear();
    v.ring.circle(0, 0, 28 + Math.sin(time * 6) * 2).stroke({ color: 0xb9a7ff, width: 3, alpha: 0.85 });
    v.hp.clear();
    v.hp.roundRect(-20, 30, 40 * Math.max(0, m.hp / m.maxHp), 5, 2).fill({ color: 0xb9a7ff, alpha: 0.95 });
  }

  avatar(userId: string): AvatarView {
    let v = this.avatars.get(userId);
    if (!v) {
      v = new AvatarView();
      this.avatars.set(userId, v);
      this.root.addChild(v.root);
    }
    return v;
  }
  removeAvatar(userId: string) {
    const v = this.avatars.get(userId);
    if (v) { v.root.destroy({ children: true }); this.avatars.delete(userId); }
  }

  syncAvatar(v: AvatarView, a: AvatarLike, opts: {
    px: number; py: number; alpha: number; time: number;
    isLead: boolean; leadTitle: string; locale: string; pic: PIXI.Texture;
    powerTimers: { label: string; color: number; left: number; total: number }[];
  }) {
    const x = a.x + (a.x - opts.px) * (1 - opts.alpha);
    const y = a.y + (a.y - opts.py) * (1 - opts.alpha);

    // --- ölüm / respawn zaman çizelgesi (Faz 2.2) ---
    if (!a.alive) {
      if (v.deathT === 0) {            // ölüm anı: yer + dönüş başlat
        v.deathT = 1.2;
        v.deathFrom.x = x; v.deathFrom.y = y;
        v.deathSpin = (x % 2 < 1 ? 1 : -1) * (2.4 + Math.random() * 2);
        v.deathVy = -170 - Math.random() * 90;
      }
      if (v.deathT > 0) {
        v.deathT = Math.max(0, v.deathT - 1 / 60);
        const t = 1 - v.deathT / 1.2;                 // 0 -> 1
        const gy = v.deathFrom.y + v.deathVy * t * 1.2 + 620 * t * t; // yerçekimi
        const ground = gy > v.deathFrom.y + 34;
        v.root.position.set(
          v.deathFrom.x + (ground ? Math.sin(t * 9) * 6 * (1 - t) : 0),
          Math.min(gy, v.deathFrom.y + 34),
        );
        v.root.rotation = ground ? (1 - t) * 1.45 * Math.sign(v.deathSpin) : v.deathSpin * t;
        v.root.alpha = ground ? 0.85 * (1 - Math.max(0, (t - 0.75) / 0.25)) : 1;
        v.root.scale.set(1 - t * 0.18);
        v.pic.tint = 0x8b6b8b;
        v.pic.alpha = 0.75;
        v.aura.clear();
        v.aim.clear();
        v.hideOrbit();
        v.hpRing.clear();
        v.syncBadges([], opts.time);
        v.ring.alpha = 0.25;
        v.hp.clear();
        v.hpBg.clear();
        v.spikes.visible = false;
        v.crown.visible = false;
        v.pill.visible = false;
        v.tornadoRing.visible = false;
        v.nameT.alpha = 0.5;
        v.streakT.visible = false;
        v.shadow.scale.set(1 - t * 0.4, 1);
        v.shadow.alpha = 0.22 * (1 - t * 0.5);
        v.root.visible = true;
        return;
      }
      // animasyon bitti ama hâlâ ölüyse gizle
      v.root.visible = false;
      v.root.alpha = 1;
      v.root.rotation = 0;
      v.nameT.alpha = 1;
      v.streakT.visible = true;
      return;
    }
    // canlandı: belirme efekti
    if (v.deathT === 0 && v.respawnT < 1) v.respawnT = Math.min(1, v.respawnT + 1 / 22);

    v.root.position.set(x + v.hitOff.x, y + v.hitOff.y);
    v.root.visible = true;
    v.root.alpha = v.respawnT;
    v.root.rotation = 0;

    // squash/stretch from velocity + spawn pop
    const spd = Math.hypot(a.x - opts.px, a.y - opts.py) * 60;
    const stretch = 1 + Math.min(0.18, spd / 1400);
    const bob = Math.sin(opts.time * 6 + x * 0.02) * 1.6;
    v.pic.scale.set(1 / stretch, stretch);
    v.pic.y = bob;
    v.shadow.scale.set(1 / stretch, 1);
    v.shadow.alpha = 0.3 - Math.min(0.12, spd / 4000);

    if (v.pic.texture !== opts.pic) v.pic.texture = opts.pic;

    // respawn belirme: ölçek büyümesi + parlaklık
    if (v.respawnT < 1) {
      const r = 1 - Math.pow(1 - v.respawnT, 3);
      v.root.scale.set(0.4 + r * 0.6);
    }

    // DEV / hayalet / hit flash birleşik gövde pozu
    const giant = a.giantActive && opts.time < a.giantUntil;
    const ghost = opts.time < a.ghostUntil;
    const baseScale = giant ? 1.6 : 1;
    if (v.flashAmt > 0) {
      v.flashAmt = Math.max(0, v.flashAmt - 0.09);
      const ov = v.flashAmt;
      v.pic.tint = 0xffffff;
      v.pic.alpha = 1;
      v.root.scale.set(baseScale * (1 + ov * 0.12));
    } else {
      v.root.scale.set(baseScale);
      v.pic.tint = giant ? 0xffe9c4 : 0xffffff;
      v.pic.alpha = ghost ? 0.5 : 1;
    }
    v.shadow.scale.set(baseScale / stretch, baseScale);
    v.shadow.alpha = 0.3 - Math.min(0.12, spd / 4000);

    // güç aurası (öncelik: öfke > hayalet > dev > yansıtma > vampir > zincir > zehir)
    const T = opts.time;
    const auraCol = T < a.rageUntil ? 0xff5a1e
      : T < a.ghostUntil ? 0xbfefff
      : giant ? 0xffd23f
      : T < a.reflectUntil ? 0x9fd8ff
      : T < a.vampUntil ? 0xc44dff
      : T < a.chainUntil ? 0x6bb8ff
      : T < a.poisonUntil ? 0x51d651 : null;
    v.aura.clear();
    if (auraCol !== null) {
      const pulse = 0.5 + Math.sin(T * 5) * 0.22;
      v.aura.circle(0, 0, 40).stroke({ color: auraCol, width: 5, alpha: pulse });
      v.aura.circle(0, 0, 46 + Math.sin(T * 5) * 3).stroke({ color: auraCol, width: 2, alpha: pulse * 0.6 });
      // DEV altın parıltı, ZİNCİR elektrik kıvılcımı (görsel kimlik)
      if (giant) v.aura.circle(0, 0, 52).stroke({ color: 0xfff2c4, width: 3, alpha: 0.5 + Math.sin(T * 7) * 0.2 });
      if (T < a.chainUntil) {
        const sp = (T * 22) % 6;
        for (let i = 0; i < 3; i++) {
          const an = sp + (i * Math.PI * 2) / 3;
          v.aura.circle(Math.cos(an) * 44, Math.sin(an) * 44, 3.5).fill({ color: 0xdff3ff, alpha: 0.9 });
        }
      }
    }

    // --- can halkası: profili saran gösterge (yeşil -> sarı -> kırmızı) ---
    v.syncHpRing(a.hp / a.maxHp, opts.time < a.shieldUntil, opts.time);

    // --- rozetler: hız / öfke / kalkan / seri ---
    const bl: { icon: string; color: number }[] = [];
    if (opts.time < a.speedUntil) bl.push({ icon: '⚡', color: 0x2b9bd9 });
    if (opts.time < a.rageUntil) bl.push({ icon: '🔥', color: 0xff5a1e });
    if (opts.time < a.shieldUntil) bl.push({ icon: '🛡', color: 0x39d0ff });
    if (a.streak >= 5) bl.push({ icon: '⚔', color: a.streak >= 30 ? 0xffd23f : 0xc084fc });
    v.syncBadges(bl.slice(0, 4), opts.time);

    // --- yörünge silahı: güç durumuna göre renk değiştirir ---
    const orbGiant = !!(giant && opts.time < a.giantUntil);
    const rage = opts.time < a.rageUntil;
    const shielded = opts.time < a.shieldUntil;
    const orbTint = rage ? 0xff5b3a : shielded ? 0x6fd0ff : orbGiant ? 0xfff0b0 : 0xffb43c;
    v.syncOrbit(
      this.orbitCount, this.orbitRadius * (orbGiant ? 1.5 : 1),
      a.orbAngle, opts.time, orbGiant ? 1.5 : 1, '#ffd23f', orbTint,
    );

    // nişan: hedefe kilitlenen hat + nişangâh (Faz 2.1)
    v.aim.clear();
    if (a.fireCd <= 0.24 && a.aimX !== undefined && a.aimY !== undefined && !giant) {
      const charge = 1 - Math.max(0, Math.min(1, a.fireCd / 0.24));
      const tx = a.aimX - x, ty = a.aimY - y;
      const d = Math.hypot(tx, ty) || 1;
      const len = 30 + charge * Math.min(70, d - 24);
      const ux = tx / d, uy = ty / d;
      v.aim.moveTo(ux * 30, uy * 30).lineTo(ux * len, uy * len)
        .stroke({ color: 0xfff0a8, width: 2 + charge * 2, alpha: 0.35 + charge * 0.5 });
      const hx = ux * len, hy = uy * len, hr = 9 + charge * 5;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        v.aim.moveTo(hx + sx * hr, hy + sy * hr)
          .lineTo(hx + sx * (hr + 6), hy + sy * (hr + 6))
          .stroke({ color: 0xffe14d, width: 2.5, alpha: 0.85 });
      }
    }

    // ring (shield / rank)
    v.ring.texture = ringFrameTex(shielded ? '#39d0ff' : opts.isLead ? '#ffd23f' : '#e8ecf5', shielded ? 'sh' : opts.isLead ? 'lead' : 'n');
    v.ring.alpha = shielded ? 0.9 + Math.sin(opts.time * 9) * 0.25 : 1;

    // streak spike ring
    if (a.streak >= 15) {
      v.spikes.visible = true;
      v.spikes.texture = a.streak >= 30 ? spikesTex('#ffd23f', 18, 'gold18') : spikesTex('#ff3b5c', 14, 'red14');
      v.spikes.rotation = opts.time * (a.streak >= 30 ? 2.6 : 1.7);
      v.spikes.scale.set(0.62 + Math.sin(opts.time * 4) * 0.03);
    } else v.spikes.visible = false;

    // hp bar
    const pct = Math.max(0, Math.min(1, a.hp / a.maxHp));
    v.hpBg.clear();
    v.hpBg.roundRect(-26, 40, 52, 7, 3).fill({ color: 0x12081f, alpha: 0.6 });
    v.hp.clear();
    const col = pct > 0.5 ? 0x4be07a : pct > 0.25 ? 0xffd23f : 0xff3b5c;
    v.hp.roundRect(-25, 41, 50 * pct, 5, 2).fill({ color: col, alpha: 0.98 });

    // name + streak
    v.nameT.text = truncateNick(a.name, 13);
    v.nameT.position.set(0, 54);
    if (a.streak >= 5) {
      v.streakT.visible = true;
      v.streakT.text = `${upper(opts.locale, 'RACHA')} ${a.streak}`;
      v.streakT.position.set(0, 74);
      v.streakT.style.fill = a.streak >= 30 ? 0xffd23f : a.streak >= 15 ? 0xff8fa3 : 0xffffff;
    } else v.streakT.visible = false;

    // crown + mvp title
    if (v.assetV !== assets.version) {
      v.assetV = assets.version;
      v.crown.texture = assets.texOr('avatars.crown', crownTex);
    }
    if (opts.isLead) {
      v.crown.visible = true;
      v.crown.position.set(0, -44 + Math.sin(opts.time * 3) * 2);
      const hasPower = opts.powerTimers.length > 0;
      const y = -74 - opts.powerTimers.length * 22;
      v.pill.visible = true;
      v.pill.position.set(0, y);
      v.pillT.text = opts.leadTitle;
      const MAXPILL = 300;
      v.pillT.scale.set(v.pillT.width > MAXPILL ? MAXPILL / v.pillT.width : 1);
      const w = Math.max(120, Math.min(MAXPILL, v.pillT.width) + 34);
      v.pillBg.clear();
      v.pillBg.roundRect(-w / 2, -15, w, 30, 15).fill({ color: 0x2b1a4d, alpha: 0.92 });
      v.pillBg.roundRect(-w / 2, -15, w, 30, 15).stroke({ color: 0xffd23f, width: 2.5, alpha: 0.85 });
      v.pillT.style.fill = 0xffd23f;
      void hasPower;
    } else {
      v.crown.visible = false;
      v.pill.visible = false;
    }

    // power-up pills
    if (!opts.isLead && opts.powerTimers.length > 0) {
      this.renderPowerPills(v, opts.powerTimers);
    } else if (!opts.isLead) {
      v.pill.visible = false;
    }

    // trap / tornado ring
    const trapped = opts.time < a.trappedUntil;
    v.tornadoRing.visible = trapped;
    if (trapped) {
      v.tornadoRing.clear();
      const seg = 14;
      for (let i = 0; i < seg; i += 2) {
        v.tornadoRing.arc(0, 0, 44, (i / seg) * 6.283, ((i + 1) / seg) * 6.283);
      }
      v.tornadoRing.stroke({ color: 0xb06bff, width: 3 });
    }
  }

  private renderPowerPills(v: AvatarView, timers: { label: string; color: number; left: number; total: number }[]) {
    v.pill.visible = timers.length > 0;
    const n = Math.min(timers.length, AvatarView.MAX_PILL_ROWS);
    let y = -62;
    for (let i = 0; i < AvatarView.MAX_PILL_ROWS; i++) {
      const row = v.pillRows[i];
      if (i >= n) { row.holder.visible = false; continue; }
      const tm = timers[i];
      row.holder.visible = true;
      row.holder.position.set(0, y);
      y -= 22;
      const w = 108;
      const pct = Math.max(0, Math.min(1, tm.left / Math.max(1, tm.total)));
      // yalnızca etiket/renk değiştiyse yeniden çiz (metin ölçümü pahalıdır)
      const key = `${tm.label}|${tm.color}`;
      if (row.last !== key || row.w !== w) {
        row.last = key; row.w = w;
        row.bg.clear();
        row.bg.roundRect(-w / 2, 0, w, 20, 10).fill({ color: tm.color, alpha: 0.95 });
        row.label.text = tm.label;
      }
      const fw = Math.round(w * pct);
      if (row.fill.width !== fw) {
        row.fill.clear();
        if (fw > 0) row.fill.roundRect(-w / 2, 0, fw, 20, 10).fill({ color: 0xffffff, alpha: 0.28 });
      }
    }
    v.pill.position.set(0, y + 22);
  }

  syncBullets(list: { x: number; y: number; vx: number; vy: number }[]) {
    const n = Math.min(list.length, this.poolSize);
    for (let i = 0; i < this.poolSize; i++) {
      const s = this.bullets[i], g = this.bulletGlow[i];
      if (i < n) {
        const b = list[i];
        s.visible = true; g.visible = true;
        const ang = Math.atan2(b.vy, b.vx);
        s.position.set(b.x, b.y); s.rotation = ang;
        s.width = 24; s.height = 13;
        g.position.set(b.x - Math.cos(ang) * 10, b.y - Math.sin(ang) * 10);
        g.rotation = ang;
        g.width = 54; g.height = 28;
      } else { s.visible = false; g.visible = false; }
    }
  }

  syncMonsters(list: { id: string; x: number; y: number; hp: number }[], time: number) {
    const keys = [...this.monsters.keys()];
    for (let i = 0; i < keys.length; i++) {
      const view = this.monsters.get(keys[i])!;
      const m = list[i];
      if (!m) { view.root.visible = false; continue; }
      view.root.visible = true;
      view.root.position.set(m.x, m.y);
      const bob = Math.sin(time * 8 + view.bob) * 3;
      view.spr.position.set(0, bob);
      const k = (1 + Math.sin(time * 16 + view.bob) * 0.05);
      view.spr.scale.set(64 / 256 * (2 - k), 48 / 192 * k);
      view.spr.rotation = Math.sin(time * 4 + view.bob) * 0.06;
    }
  }

  bossShow(kind: 'kraken' | 'crab', x: number, y: number) {
    this.bossIsKraken = kind === 'kraken';
    this.bossAssetV = -1; // force texture refresh on next sync
    this.bossRoot.visible = true;
    const isKraken = kind === 'kraken';
    this.bossTentacles.forEach((t) => { t.visible = isKraken; });
    this.bossClaws.forEach((c) => { c.visible = !isKraken; });
    this.bossHead.texture = assets.texOr(isKraken ? 'boss.kraken' : 'boss.crab',
      () => (isKraken ? krakenTex() : crabTex(true)));
    this.bossHead.width = isKraken ? 260 : 320;
    this.bossHead.height = isKraken ? 220 : 240;
    this.bossGlow.tint = isKraken ? 0xb98bff : 0xff8a3a;
    this.bossRoot.position.set(x, y);
    this.bossRoot.alpha = 0;
    this.bossRoot.scale.set(0.2);
    tweener.kill(this.bossRoot, 'alpha');
    tweener.kill(this.bossRoot, 'scale');
    tweener.to(this.bossRoot, 'alpha', 1, 0.4);
    tweener.to(this.bossRoot, 'scale', 1, 0.7, { ease: Ease.outBack });
  }
  bossHide() {
    if (!this.bossRoot.visible) return;
    tweener.kill(this.bossRoot, 'alpha'); tweener.kill(this.bossRoot, 'scale');
    tweener.to(this.bossRoot, 'alpha', 0, 0.5, {
      onDone: () => { this.bossRoot.visible = false; },
    });
    tweener.to(this.bossRoot, 'scale', 0.2, 0.5, { ease: Ease.inCubic });
  }
  syncBoss(time: number) {
    if (!this.bossRoot.visible) return;
    // late-arriving art swaps in without a reload
    if (this.bossAssetV !== assets.version) {
      this.bossAssetV = assets.version;
      this.bossHead.texture = assets.texOr(this.bossIsKraken ? 'boss.kraken' : 'boss.crab',
        () => (this.bossIsKraken ? krakenTex() : crabTex(true)));
    }
    const bob = Math.sin(time * 2.2) * 10;
    this.bossHead.position.set(0, bob);
    this.bossHead.rotation = Math.sin(time * 1.5) * 0.06;
    this.bossGlow.position.set(0, bob);
    this.bossGlow.alpha = 0.42 + Math.sin(time * 4) * 0.16;
    this.bossGlow.scale.set((520 / 128) * (1 + Math.sin(time * 4) * 0.06));
    this.bossTentacles.forEach((t, i) => {
      const a = (i / 6) * Math.PI * 2;
      t.rotation = a + Math.sin(time * 1.8 + i) * 0.4;
      t.position.set(Math.cos(a) * 96, Math.sin(a) * 60 + 40 + bob * 0.4);
    });
    this.bossClaws.forEach((c, i) => {
      const s = i === 0 ? -1 : 1;
      c.position.set(s * 190, bob * 0.6 + Math.sin(time * 2.6 + i) * 16);
      c.rotation = s * (0.5 + Math.sin(time * 2.6 + i) * 0.22);
      c.scale.y = (130 / 130) * (1 + Math.sin(time * 5 + i) * 0.08);
    });
  }
}
export { discTex };

/** Gölge klon görünümü: sahibin fotoğrafıyla yarı saydam, küçük halka + mini can barı. */
export class CloneView {
  root = new PIXI.Container();
  pic = new PIXI.Sprite(PIXI.Texture.WHITE);
  ring = new PIXI.Graphics();
  hp = new PIXI.Graphics();
  shadow = new PIXI.Graphics();
  constructor() {
    this.pic.anchor.set(0.5);
    this.pic.width = this.pic.height = 44;
    this.pic.alpha = 0.78;
    this.shadow.ellipse(0, 26, 22, 8).fill({ color: 0x000000, alpha: 0.28 });
    this.root.addChild(this.shadow, this.ring, this.pic, this.hp);
  }
}
