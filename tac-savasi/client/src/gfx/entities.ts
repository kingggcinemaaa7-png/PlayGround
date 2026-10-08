// Entity view rendering: interpolated movement, squash/stretch, hit flash,
// death/respawn, streak spike rings, boss composition, monster/bullet sprites.
import * as PIXI from 'pixi.js';
import {
  ringFrameTex, spikesTex, crownTex, discTex, glowTex,
  krakenTex, tentacleTex, clawTex, crabTex, sparkTex,
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
}

export class AvatarView {
  root = new PIXI.Container();
  shadow = new PIXI.Graphics();
  ring = new PIXI.Sprite(PIXI.Texture.WHITE);
  spikes = new PIXI.Sprite(PIXI.Texture.WHITE);
  pic = new PIXI.Sprite(PIXI.Texture.WHITE);
  crown = new PIXI.Sprite(crownTex());
  hpBg = new PIXI.Graphics();
  hp = new PIXI.Graphics();
  nameT = new PIXI.Text({ text: '', style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 21, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x12081f, width: 4, join: 'round' } } });
  pill = new PIXI.Container();
  pillT = new PIXI.Text({ text: '', style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 17, fill: 0x12081f, fontWeight: '800' } });
  pillBg = new PIXI.Graphics();
  streakT = new PIXI.Text({ text: '', style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 16, fill: 0xffffff, fontWeight: '800', stroke: { color: 0x12081f, width: 4, join: 'round' } } });
  tornadoRing = new PIXI.Graphics();
  flashAmt = 0;
  hitOff = { x: 0, y: 0 };
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
    this.tornadoRing.circle(0, 0, 76).stroke({ color: 0x9fe8ff, width: 4, alpha: 0.7 });
    this.tornadoRing.visible = false;
    this.root.addChild(
      this.shadow, this.tornadoRing, this.spikes, this.ring, this.pic,
      this.hpBg, this.hp, this.crown, this.pill, this.streakT, this.nameT,
    );
  }
}

export class EntityLayer {
  root = new PIXI.Container();
  avatars = new Map<string, AvatarView>();
  bullets: PIXI.Sprite[] = [];
  bulletGlow: PIXI.Sprite[] = [];
  monsters = new Map<string, { root: PIXI.Container; spr: PIXI.Sprite; bob: number }>();
  bossRoot = new PIXI.Container();
  bossHead = new PIXI.Sprite(krakenTex());
  bossTentacles: PIXI.Sprite[] = [];
  bossClaws: PIXI.Sprite[] = [];
  bossGlow = new PIXI.Sprite(glowTex());
  monsterTex = crabTex(true);
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
    powerTimers: { label: string; color: number; left: number }[];
  }) {
    const x = a.x + (a.x - opts.px) * (1 - opts.alpha);
    const y = a.y + (a.y - opts.py) * (1 - opts.alpha);
    v.root.position.set(x + v.hitOff.x, y + v.hitOff.y);
    v.root.visible = a.alive;

    // squash/stretch from velocity + spawn pop
    const spd = Math.hypot(a.x - opts.px, a.y - opts.py) * 60;
    const stretch = 1 + Math.min(0.18, spd / 1400);
    const bob = Math.sin(opts.time * 6 + x * 0.02) * 1.6;
    v.pic.scale.set(1 / stretch, stretch);
    v.pic.y = bob;
    v.shadow.scale.set(1 / stretch, 1);
    v.shadow.alpha = 0.3 - Math.min(0.12, spd / 4000);

    if (v.pic.texture !== opts.pic) v.pic.texture = opts.pic;

    // hit flash
    if (v.flashAmt > 0) {
      v.flashAmt = Math.max(0, v.flashAmt - 0.09);
      const c = Math.floor(v.flashAmt * 255);
      v.pic.tint = c > 250 ? 0xffffff : 0xffffff;
      const ov = v.flashAmt;
      v.pic.alpha = 1;
      v.root.scale.set(1 + ov * 0.12);
    } else {
      v.root.scale.set(1);
      v.pic.tint = 0xffffff;
    }

    // ring (shield / rank)
    const shielded = opts.time < a.shieldUntil;
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
      this.renderPowerPills(v, opts.powerTimers, a);
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

  private renderPowerPills(v: AvatarView, timers: { label: string; color: number; left: number }[], a: AvatarLike) {
    v.pill.visible = true;
    v.pill.removeChildren();
    let y = -62;
    for (const tm of timers) {
      const holder = new PIXI.Container();
      const bg = new PIXI.Graphics();
      const w = 108;
      bg.roundRect(-w / 2, 0, w, 20, 10).fill({ color: tm.color, alpha: 0.95 });
      bg.roundRect(-w / 2, 0, w * Math.max(0, Math.min(1, tm.left / 15)), 20, 10).fill({ color: 0xffffff, alpha: 0.28 });
      const label = soft(tm.label, 14, 0xffffff);
      label.anchor.set(0.5); label.position.set(0, 10);
      holder.addChild(bg, label);
      holder.position.set(0, y);
      y -= 22;
      v.pill.addChild(holder);
    }
    v.pill.position.set(0, y + 22);
    void a;
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
    this.bossRoot.visible = true;
    const isKraken = kind === 'kraken';
    this.bossTentacles.forEach((t) => { t.visible = isKraken; });
    this.bossClaws.forEach((c) => { c.visible = !isKraken; });
    const override = assets.textures.get(isKraken ? 'boss.kraken' : 'boss.crab');
    this.bossHead.texture = override ?? (isKraken ? krakenTex() : crabTex(true));
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
