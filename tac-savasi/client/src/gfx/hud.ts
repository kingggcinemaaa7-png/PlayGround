// Full HUD + scene overlays. All positions follow shared/layout.ts safe zones.
import * as PIXI from 'pixi.js';
import { panelTex, crownTex, shineTex, ringFrameTex, spikesTex, glowTex } from './textures.js';
import { tweener, Ease } from './tween.js';
import { t, fmtNum, upper, truncateNick, layoutZones } from '@tac/shared';
import { assets } from '../assets.js';
import { H as SCREEN_H, W as SCREEN_W } from '@tac/shared';

export const Z = {
  topbar: { x: 0, y: 0, w: 1080, h: 214 },
  goal: { x: 14, y: 224, w: 430, h: 56 },
  ticker: { x: 646, y: 224, w: 420, h: 56 },
  gifters: { x: 8, y: 296, w: 300, h: 470 },
  joins: { x: 812, y: 296, w: 260, h: 470 },
  center: { x: 200, y: 736, w: 680, h: 344 },
  mercy: { x: 130, y: 1104, w: 820, h: 176 },
  hero: { x: 180, y: 1296, w: 720, h: 216 },
  bossbar: { x: 86, y: 1556, w: 908, h: 76 },
  feed: { x: 236, y: 1652, w: 608, h: 50 },
};

const FONT = '"Arial Black", Impact, "Segoe UI", system-ui, sans-serif';
const FONT2 = '"Trebuchet MS", system-ui, sans-serif';
/** vertical lane between stacked announcements (safe-zone friendly) */
const LANE = 118;

function txt(s: string, size: number, color: number, opts: Partial<PIXI.TextStyleOptions> = {}): PIXI.Text {
  const t = new PIXI.Text({
    text: s,
    style: {
      fontFamily: FONT, fontSize: size, fill: color, fontWeight: '900',
      stroke: { color: 0x12081f, width: Math.max(4, size * 0.18), join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.5, blur: 5, distance: 3, angle: Math.PI / 2 },
      ...opts,
    },
  });
  t.resolution = 2;
  return t;
}
function soft(s: string, size: number, color: number): PIXI.Text {
  const t = new PIXI.Text({ text: s, style: { fontFamily: FONT2, fontSize: size, fill: color, fontWeight: '700', stroke: { color: 0x12081f, width: 3, join: 'round' } } });
  t.resolution = 2;
  return t;
}
function panel(w: number, h: number, alpha = 0.9, radius = 24): PIXI.NineSliceSprite {
  const p = new PIXI.NineSliceSprite({ texture: panelTex(radius), leftWidth: 26, topHeight: 26, rightWidth: 26, bottomHeight: 26 });
  p.width = w; p.height = h; p.alpha = alpha; p.tint = 0x0d1030;
  return p;
}

export interface GifterRow { userId: string; name: string; diamonds: number }
export interface RankRow { userId: string; name: string; kills: number; damage: number; score: number; streak: number; bestStreak: number }
export interface PicProvider { (userId: string, name: string): PIXI.Texture }

export class Hud {
  root = new PIXI.Container();
  topLayer = new PIXI.Container();
  centerLayer = new PIXI.Container();
  bottomLayer = new PIXI.Container();
  sceneLayer = new PIXI.Container();
  facecamSlot = new PIXI.Container();
  private shift = 0;

  private timerT!: PIXI.Text;
  private metaT!: PIXI.Text;
  private mutatorChip!: PIXI.Container;
  private goalFill!: PIXI.Graphics;
  private goalT!: PIXI.Text;
  private goalShine!: PIXI.Sprite;
  private tickerBox!: PIXI.Container;
  private tickerT!: PIXI.Text;
  private tickerPic?: PIXI.Sprite;
  private slotViews: SlotView[] = [];
  private gifterViews: GifterView[] = [];
  private joinViews: { box: PIXI.Container; life: number }[] = [];
  private feedViews: { box: PIXI.Container; life: number }[] = [];
  private strip?: { box: PIXI.Container; life: number };
  private bossBox = new PIXI.Container();
  private bossFill = new PIXI.Graphics();
  private bossChip = new PIXI.Graphics();
  private bossName!: PIXI.Text;
  private bossHp!: PIXI.Text;
  private hunterT!: PIXI.Text;
  private announceBox = new PIXI.Container();
  private mercyBox?: PIXI.Container;
  private mercyTimer?: PIXI.Text;
  private mercyRing = new PIXI.Graphics();
  locale = 'es-MX';
  dual = true;
  facecam = false;
  pic: PicProvider = () => PIXI.Texture.WHITE;

  constructor() {
    this.root.addChild(this.zoneLayer, this.topLayer, this.centerLayer, this.bottomLayer, this.sceneLayer, this.facecamSlot);
    this.zoneLayer.visible = false;
    this.buildTop();
    this.buildGoal();
    this.buildTicker();
    this.buildBoss();
    this.buildCastle();
    this.centerLayer.addChild(this.announceBox);
    this.setFacecam(false);
  }

  setLocale(l: string, dual: boolean) { this.locale = l; this.dual = dual; }
  private shortKills(): string {
    if (this.locale.startsWith('tr')) return 'ELEME';
    if (this.locale === 'es-ES') return 'BAJAS';
    return 'ELIM.';
  }

  setFacecam(on: boolean) {
    this.facecam = on;
    this.maxGifters = on ? 3 : 5;
    this.shift = on ? 100 : 0;
    this.topLayer.y = this.shift;
    this.giftersLayer.y = this.shift;
    this.joinsLayer.y = this.shift;
  }
  private giftersLayer = new PIXI.Container();
  private joinsLayer = new PIXI.Container();
  initLayers() {
    this.root.addChildAt(this.giftersLayer, 1);
    this.root.addChildAt(this.joinsLayer, 1);
  }

  /* ---------- construction ---------- */
  private buildTop() {
    const bg = panel(1080, 214, 0.84, 0);
    bg.height = 214;
    this.topLayer.addChild(bg);
    const accent = new PIXI.Graphics();
    accent.rect(0, 208, 1080, 6).fill({ color: 0x39d0ff, alpha: 0.9 });
    this.topLayer.addChild(accent);

    this.timerT = txt('00:00', 54, 0xffffff);
    this.timerT.position.set(22, 14);
    this.topLayer.addChild(this.timerT);

    this.metaT = soft('', 19, 0xbfe6ff);
    this.metaT.position.set(24, 76);
    this.topLayer.addChild(this.metaT);

    this.mutatorChip = new PIXI.Container();
    const chipBg = panel(230, 44, 0.9, 16);
    const chipT = txt('', 22, 0xffe14d);
    chipT.anchor.set(0.5); chipT.position.set(115, 22);
    this.mutatorChip.addChild(chipBg, chipT);
    this.mutatorChip.position.set(22, 106);
    this.mutatorChip.visible = false;
    this.topLayer.addChild(this.mutatorChip);

    // ranked slots 2 - 1 - 3
    const colors = ['#cfd6e0', '#ffd23f', '#d98a4a'];
    for (let i = 0; i < 3; i++) {
      const order = [1, 0, 2][i];
      const v: SlotView = {
        box: new PIXI.Container(),
        pic: new PIXI.Sprite(PIXI.Texture.WHITE),
        name: txt('', 21, 0xffffff),
        stats: soft('', 16, 0xffe14d),
        ring: new PIXI.Graphics(),
      };
      v.pic.anchor.set(0.5);
      v.pic.width = v.pic.height = order === 0 ? 76 : 58;
      v.pic.position.set(0, order === 0 ? -6 : 0);
      v.name.anchor.set(0.5, 0); v.name.position.set(0, order === 0 ? 42 : 32);
      v.stats.anchor.set(0.5, 0); v.stats.position.set(0, order === 0 ? 70 : 56);
      v.box.addChild(v.ring, v.pic, v.name, v.stats);
      v.box.x = 336 + i * 252;
      v.box.y = 100;
      v.box.scale.set(0.94);
      this.topLayer.addChild(v.box);
      this.slotViews.push(v);
      void colors;
    }
  }

  private goalBox = new PIXI.Container();
  private buildGoal() {
    const box = this.goalBox;
    const bg = panel(Z.goal.w, Z.goal.h, 0.86, 18);
    this.goalFill = new PIXI.Graphics();
    this.goalT = txt('🎁 0/500', 24, 0xffe14d);
    this.goalT.position.set(18, 16);
    this.goalShine = new PIXI.Sprite(shineTex());
    this.goalShine.width = 220; this.goalShine.height = 54;
    this.goalShine.alpha = 0.35; this.goalShine.blendMode = 'add';
    box.addChild(bg, this.goalFill, this.goalShine, this.goalT);
    box.position.set(Z.goal.x, Z.goal.y);
    this.topLayer.addChild(box);
  }

  private buildTicker() {
    this.tickerBox = new PIXI.Container();
    const bg = panel(Z.ticker.w, Z.ticker.h, 0.86, 18);
    this.tickerT = soft('', 23, 0xffffff);
    this.tickerT.anchor.set(1, 0.5);
    this.tickerT.position.set(Z.ticker.w - 16, Z.ticker.h / 2);
    this.tickerBox.addChild(bg, this.tickerT);
    this.tickerBox.position.set(Z.ticker.x, Z.ticker.y);
    this.topLayer.addChild(this.tickerBox);
    this.tickerBox.visible = false;
  }

  private buildBoss() {
    this.bossBox.position.set(Z.bossbar.x, Z.bossbar.y);
    const bg = panel(Z.bossbar.w, Z.bossbar.h, 0.9, 20);
    this.bossChip = new PIXI.Graphics();
    this.bossName = txt('', 26, 0xffffff);
    this.bossName.position.set(24, 10);
    this.bossHp = txt('', 22, 0xffe14d);
    this.bossHp.position.set(560, 14);
    this.hunterT = soft('', 19, 0xffffff);
    this.hunterT.anchor.set(1, 0);
    this.hunterT.position.set(Z.bossbar.w - 20, 44);
    this.bossBox.addChild(bg, this.bossChip, this.bossFill, this.bossName, this.bossHp, this.hunterT);
    this.bottomLayer.addChild(this.bossBox);
    this.bossBox.visible = false;
  }

  private buildCastle() { /* castle HP bar lives in world space now */ }

  /* ---------- updates ---------- */
  updateTimer(remaining: number, matchNo: number, phaseLabel: string, timeOfDay: string) {
    const m = Math.floor(Math.max(0, remaining) / 60);
    const s = Math.floor(Math.max(0, remaining) % 60);
    const txtStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (this.timerT.text !== txtStr) {
      this.timerT.text = txtStr;
      if (remaining <= 10 && remaining > 0) {
        this.timerT.style.fill = 0xff4d6d;
        tweener.kill(this.timerT, 'scale');
        this.timerT.scale.set(1.35);
        tweener.to(this.timerT, 'scale', 1, 0.3, { ease: Ease.outBack });
      } else this.timerT.style.fill = 0xffffff;
    }
    this.metaT.text = `${upper(this.locale, phaseLabel)} #${matchNo} · ${upper(this.locale, timeOfDay)}`;
  }

  setMutator(label: string, color = 0xffd23f) {
    if (!label) { this.mutatorChip.visible = false; return; }
    this.mutatorChip.visible = true;
    const chipT = this.mutatorChip.children[1] as PIXI.Text;
    chipT.text = label;
    chipT.style.fill = color;
    const bg = this.mutatorChip.children[0] as PIXI.NineSliceSprite;
    bg.width = Math.max(120, chipT.width + 36);
  }

  updateGoal(cur: number, target: number) {
    const pct = Math.max(0, Math.min(1, cur / target));
    this.goalFill.clear();
    this.goalFill.roundRect(4, 4, (Z.goal.w - 8) * pct, Z.goal.h - 8, 14)
      .fill({ color: 0xffd23f, alpha: 0.92 });
    this.goalT.text = `🎁 ${fmtNum(this.locale, Math.floor(cur))}/${fmtNum(this.locale, Math.floor(target))}`;
    this.goalShine.x = -240 + ((performance.now() / 26) % (Z.goal.w + 480));
    if (pct >= 1) this.goalShine.alpha = 0.8;
  }

  setTicker(text: string, userId?: string, name?: string) {
    // M7: setArenaHudVisible(false) çağrılsa bile şerid her karede geri
    // geliyordu; sonuç ekranlarının üstüne biniyordu.
    this.tickerBox.visible = this.arenaHudOn && !!text;
    if (!this.arenaHudOn) return;
    if (!text) return;
    this.tickerT.text = text;
    if (userId && this.pic) {
      if (!this.tickerPic) {
        this.tickerPic = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.tickerPic.anchor.set(0.5);
        this.tickerPic.width = this.tickerPic.height = 42;
        this.tickerBox.addChildAt(this.tickerPic, 1);
      }
      this.tickerPic.visible = true;
      this.tickerPic.texture = this.pic(userId, name ?? '');
      this.tickerT.x = Z.ticker.w - 56;
    } else if (this.tickerPic) this.tickerPic.visible = false;
  }

  updateSlots(rows: RankRow[]) {
    const order = [1, 0, 2];
    for (let i = 0; i < 3; i++) {
      const idx = order[i];
      const v = this.slotViews[i];
      const r = rows[idx];
      if (!r) { v.box.visible = false; continue; }
      v.box.visible = true;
      const tex = this.pic(r.userId, r.name);
      if (v.pic.texture !== tex) v.pic.texture = tex;
      v.name.text = truncateNick(r.name, 10);
      // M24: satır iki kez yazılıyordu ve ölü bir `if` vardı; ikinci atama
      // her karede metni yeniden ölçüp texture yüklüyordu.
      const line = `${fmtNum(this.locale, r.score)} ${t(this.locale, 'points')} · ${r.kills} ${this.shortKills()}`;
      if (v.stats.text !== line) v.stats.text = line;
      v.stats.style.fontSize = v.stats.width > 220 ? 14 : 16;
      v.ring.clear();
      const col = idx === 0 ? 0xffd23f : idx === 1 ? 0xcfd6e0 : 0xd98a4a;
      const rr = idx === 0 ? 46 : 36;
      v.ring.circle(0, idx === 0 ? -6 : 0, rr).stroke({ color: col, width: idx === 0 ? 8 : 6 });
      v.ring.circle(0, idx === 0 ? -6 : 0, rr - 9).stroke({ color: 0xffffff, width: 2, alpha: 0.35 });
      if (this.crownV !== assets.version) {
        this.crownV = assets.version;
        const old = v.box.children.find((c) => c.label === 'crown') as PIXI.Sprite | undefined;
        if (old) old.texture = assets.texOr('avatars.crown', crownTex);
      }
      if (idx === 0) {
        if (!v.box.children.find((c) => c.label === 'crown')) {
          const cr = new PIXI.Sprite(assets.texOr('avatars.crown', crownTex));
          cr.anchor.set(0.5); cr.width = 54; cr.height = 40;
          cr.position.set(0, -62); cr.label = 'crown';
          v.box.addChild(cr);
        }
      } else {
        const cr = v.box.children.find((c) => c.label === 'crown');
        if (cr) cr.visible = false;
      }
    }
  }

  updateGifters(allRows: GifterRow[]) {
    const rows = allRows.slice(0, this.maxGifters);
    if (rows.length !== this.gifterViews.length) {
      this.giftersLayer.removeChildren();
      this.gifterViews = rows.map((_, i) => {
        const box = new PIXI.Container();
        const bg = panel(272, 60, 0.8, 16);
        const pic = new PIXI.Sprite(PIXI.Texture.WHITE);
        pic.anchor.set(0.5); pic.width = pic.height = 44;
        pic.position.set(28, 30);
        const name = soft('', 18, 0xffd86b);
        name.position.set(56, 8);
        const dia = soft('', 17, 0xff8fa8);
        dia.position.set(56, 32);
        box.addChild(bg, pic, name, dia);
        box.position.set(16, Z.gifters.y + 6 + i * 66);
        this.giftersLayer.addChild(box);
        return { box, pic, name, dia };
      });
      this.gifterViews.forEach((v, i) => {
        if (i === 0) {
          const cr = new PIXI.Sprite(assets.texOr('avatars.crown', crownTex));
          cr.anchor.set(0.5); cr.width = 30; cr.height = 22;
          cr.position.set(4, 6);
          v.box.addChild(cr);
        }
      });
    }
    rows.forEach((r, i) => {
      const v = this.gifterViews[i];
      if (!v) return;
      v.pic.texture = this.pic(r.userId, r.name);
      v.name.text = truncateNick(r.name, 12);
      v.dia.text = `♥ ${fmtNum(this.locale, r.diamonds)}`;
    });
  }

  pushJoin(name: string, userId: string) {
    const box = new PIXI.Container();
    const pic = new PIXI.Sprite(this.pic(userId, name));
    pic.anchor.set(0.5); pic.width = pic.height = 40;
    pic.position.set(38, 20);
    const word = soft(`${truncateNick(name, 12)} ${upper(this.locale, t(this.locale, 'joined', { name: '' }).trim() || 'ENTRÓ')}`, 18, 0x9fe3ff);
    word.anchor.set(1, 0.5);
    word.position.set(104, 20);
    box.addChild(pic, word);
    const cap = this.facecam ? 4 : 8;
    box.position.set(Z.joins.x + 4, Z.joins.y + 8 + (this.joinViews.length % cap) * 44);
    box.alpha = 0;
    tweener.to(box, 'alpha', 1, 0.25);
    this.joinsLayer.addChild(box);
    this.joinViews.push({ box, life: 6 });
    while (this.joinViews.length > (this.facecam ? 4 : 8)) {
      const old = this.joinViews.shift()!;
      old.box.destroy({ children: true });
    }
  }

  pushFeed(text: string, color = 0xffffff) {
    const box = new PIXI.Container();
    const bg = panel(Z.feed.w, Z.feed.h, 0.8, 14);
    const label = soft(text, 19, color);
    label.anchor.set(0.5, 0.5); label.position.set(Z.feed.w / 2, Z.feed.h / 2);
    box.addChild(bg, label);
    box.position.set(Z.feed.x, Z.feed.y + this.feedViews.length * 46);
    box.alpha = 0;
    this.bottomLayer.addChild(box);
    this.feedViews.push({ box, life: 5 });
    tweener.to(box, 'alpha', 1, 0.2);
    tweener.to(box, 'x', Z.feed.x, 0.35, { from: Z.feed.x - 40 });
    while (this.feedViews.length > 3) {
      const old = this.feedViews.shift()!;
      old.box.destroy({ children: true });
    }
  }

  showGiftStrip(items: { icon: string; name: string; value: string; color: number }[], seconds = 6) {
    this.hideGiftStrip();
    const box = new PIXI.Container();
    const bg = panel(900, 92, 0.88, 20);
    const title = soft(upper(this.locale, t(this.locale, 'giftmenu', {}) || 'REGALOS'), 20, 0xffd23f);
    title.position.set(24, 10);
    box.addChild(bg, title);
    const cw = 172;
    items.forEach((it, i) => {
      const chip = new PIXI.Container();
      const cbg = panel(cw - 14, 48, 0.94, 14);
      cbg.tint = it.color;
      const ct = soft(`${it.icon} ${it.name}`, 18, 0x12081f);
      ct.anchor.set(0, 0.5); ct.position.set(12, 15);
      const cv = soft(it.value, 17, 0x1a1030);
      cv.anchor.set(0, 0.5); cv.position.set(12, 33);
      chip.addChild(cbg, ct, cv);
      chip.position.set(22 + i * cw, 38);
      box.addChild(chip);
    });
    box.position.set(90, 1452);
    box.alpha = 0;
    this.centerLayer.addChild(box);
    tweener.to(box, 'alpha', 1, 0.3);
    tweener.to(box, 'y', 1428, 0.4, { ease: Ease.outCubic });
    this.strip = { box, life: seconds };
  }
  hideGiftStrip() {
    if (this.strip) { this.strip.box.destroy({ children: true }); this.strip = undefined; }
  }

  bossShow(name: string, pct: number, hp: number, maxHp: number, hunter: string) {
    this.bossBox.visible = this.arenaHudOn;
    this.bossName.text = name;
    this.bossHp.text = `${fmtNum(this.locale, Math.max(0, hp))} / ${fmtNum(this.locale, maxHp)}`;
    this.hunterT.text = `${t(this.locale, 'hunter', { name: hunter })}`;
    this.bossChip.clear();
    this.bossChip.roundRect(0, 56, Z.bossbar.w * Math.max(0, Math.min(1, pct)), 12).fill({ color: 0xef476f, alpha: 0.95 });
    this.bossFill.clear();
    this.bossFill.roundRect(2, 58, Z.bossbar.w - 4, 8, 4).fill({ color: 0x2a1030, alpha: 0.85 });
  }
  bossHide() { this.bossBox.visible = false; }

  castleUpdate() { /* no-op */ }

  private recent: { text: string; at: number }[] = [];

  announce(main: string, sub?: string, color = 0xffffff, size = 56) {
    const now = performance.now();
    this.recent = this.recent.filter((r) => now - r.at < 1400);
    if (this.recent.some((r) => r.text === main)) return;
    this.recent.push({ text: main, at: now });
    const box = new PIXI.Container();
    const glow = new PIXI.Sprite(glowTex());
    glow.anchor.set(0.5);
    glow.tint = color; glow.alpha = 0.35; glow.blendMode = 'add';
    glow.width = Math.min(820, Z.center.w); glow.height = 300;
    glow.position.set(0, -6);
    const MAXW = Z.center.w - 24;
    const label = txt(main, size, color);
    label.anchor.set(0.5);
    if (label.width > MAXW) label.scale.set(MAXW / label.width);
    box.addChild(glow, label);
    let second: PIXI.Text | null = null;
    if (sub) {
      second = soft(sub, Math.max(18, size * 0.42), 0xffe9a8);
      second.anchor.set(0.5);
      if (second.width > MAXW) second.scale.set(MAXW / second.width);
      second.position.set(0, (size * label.scale.y) * 0.62 + 26);
      box.addChild(second);
    }
    const shine = new PIXI.Sprite(shineTex());
    shine.anchor.set(0.5);
    shine.width = 300; shine.height = size * 1.6;
    shine.alpha = 0.5; shine.blendMode = 'add';
    box.addChild(shine);

    const count = this.announceBox.children.length;
    box.position.set(540, 0);
    box.y = 72 + count * LANE;
    box.alpha = 0;
    box.scale.set(0.4);
    this.announceBox.addChild(box);
    tweener.to(box, 'alpha', 1, 0.18, { id: 'ann-a' });
    tweener.to(box, 'scale', 1, 0.34, { ease: Ease.outBack, id: 'ann-s' });
    tweener.to(shine, 'x', 620, 0.9, { delay: 0.12, ease: Ease.inCubic });
    // NB: `children` is Pixi's live array — never mutate it, or the render
    // group cache desyncs and updateLocalTransform() crashes on a null parent.
    const kids = [...this.announceBox.children];
    for (let i = 0; i < kids.length - 1; i++) {
      tweener.to(kids[i], 'y', kids[i].y - LANE, 0.3, { ease: Ease.outCubic });
      tweener.to(kids[i], 'alpha', 0.55, 0.3);
    }
    // destroy() detaches from its parent, keeping the live array consistent
    while (this.announceBox.children.length > 3) {
      this.announceBox.children[0].destroy({ children: true });
    }
    const targetY = 72 + (this.announceBox.children.length - 1) * LANE;
    tweener.to(box, 'y', targetY, 0.3, { ease: Ease.outCubic });
    tweener.to(box, 'alpha', 0, 0.45, {
      delay: 2.6, id: 'ann-out-a', onDone: () => { box.destroy({ children: true }); },
    });
    // gentle float
    const y0 = targetY;
    const float = () => {
      if (box.destroyed) return;
      const k = (performance.now() % 2600) / 2600;
      if (box.alpha > 0.05) box.y = y0 + Math.sin(k * Math.PI * 2) * 3;
      requestAnimationFrame(float);
    };
    float();
    this.announceBox.y = Z.center.y;
  }

  mercyShow(victimName: string, killerName: string, victimId: string, killerId: string) {
    this.mercyHide();
    const box = new PIXI.Container();
    const bg = panel(Z.mercy.w, Z.mercy.h, 0.94, 26);
    bg.tint = 0x5b21b6;
    const title = txt(`${upper(this.locale, t(this.locale, 'mercy.title', {}))} ${this.locale.startsWith('tr') ? '' : '¿'}${upper(this.locale, t(this.locale, 'mercy.ask', {}))}?`, 40, 0xffe14d);
    title.anchor.set(0.5); title.position.set(Z.mercy.w / 2, 36);
    const vPic = new PIXI.Sprite(this.pic(victimId, victimName));
    vPic.anchor.set(0.5); vPic.width = vPic.height = 86;
    vPic.position.set(180, 104);
    const kPic = new PIXI.Sprite(this.pic(killerId, killerName));
    kPic.anchor.set(0.5); kPic.width = kPic.height = 86;
    kPic.position.set(Z.mercy.w - 180, 104);
    const vs = txt('VS', 46, 0xff4d6d);
    vs.anchor.set(0.5); vs.position.set(Z.mercy.w / 2, 100);
    const vName = soft(truncateNick(victimName, 12), 22, 0xffffff);
    vName.anchor.set(0.5); vName.position.set(180, 152);
    const kName = soft(truncateNick(killerName, 12), 22, 0xffffff);
    kName.anchor.set(0.5); kName.position.set(Z.mercy.w - 180, 152);
    this.mercyRing.clear();
    this.mercyTimer = txt('10', 40, 0xffffff);
    this.mercyTimer.anchor.set(0.5); this.mercyTimer.position.set(Z.mercy.w / 2, 104);
    box.addChild(bg, vPic, kPic, vs, vName, kName, this.mercyRing, this.mercyTimer);
    box.position.set(Z.mercy.x, Z.mercy.y);
    box.alpha = 0;
    this.centerLayer.addChild(box);
    this.mercyBox = box;
    tweener.to(box, 'alpha', 1, 0.22);
    tweener.to(box, 'scale', 1, 0.4, { from: 0.8, ease: Ease.outBack });
    vPic.scale.set(1);
    tweener.to(vPic, 'scale', 1, 0.001, { from: 0.1 });
    tweener.to(kPic, 'scale', 1, 0.001, { from: 0.1 });
  }
  mercyTick(sec: number) {
    if (!this.mercyBox || !this.mercyTimer) return;
    this.mercyTimer.text = String(Math.max(0, Math.ceil(sec)));
    this.mercyRing.clear();
    this.mercyRing.circle(Z.mercy.w / 2, 104, 30).stroke({ color: 0xffffff, width: 4, alpha: 0.25 });
    this.mercyRing.circle(Z.mercy.w / 2, 104, 30).stroke({
      color: sec <= 3 ? 0xff4d6d : 0xffe14d, width: 6,
      // arc approximation via short segments
    });
  }
  mercyHide() {
    if (this.mercyBox) {
      const b = this.mercyBox;
      tweener.to(b, 'alpha', 0, 0.2, { onDone: () => b.destroy({ children: true }) });
      this.mercyBox = undefined; this.mercyTimer = undefined;
    }
  }

  /**
   * Kahraman kartı (Faz 1.4): HER hediye için büyük, animasyonlu kart.
   * `icon` hediye simgesi, `effect` ne yaptığını söyler. Kart üstten kayar,
   * parlar ve kaybolur; ardından isim ekranın üstünden yükselip uçar.
   */
  heroCard(name: string, userId: string, desc: string, color: number, icon?: string, effect?: string) {
    const box = new PIXI.Container();
    const bg = panel(Z.hero.w, Z.hero.h, 0.95, 26);
    bg.tint = color;
    const pic = new PIXI.Sprite(this.pic(userId, name));
    pic.anchor.set(0.5); pic.width = pic.height = 120;
    pic.position.set(110, 110);
    const glow = new PIXI.Sprite(glowTex());
    glow.anchor.set(0.5); glow.tint = color; glow.alpha = 0.5; glow.blendMode = 'add';
    glow.width = 320; glow.height = 320; glow.position.set(110, 110);
    // hediye rozeti: kartın sol üstünde büyük ikon
    let badge: PIXI.Container | null = null;
    if (icon) {
      badge = new PIXI.Container();
      const halo = new PIXI.Sprite(glowTex());
      halo.anchor.set(0.5); halo.tint = color; halo.alpha = 0.75; halo.blendMode = 'add';
      halo.width = halo.height = 190; halo.position.set(60, 52);
      const ico = new PIXI.Text({
        text: icon,
        style: { fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif', fontSize: 84 },
      });
      ico.anchor.set(0.5); ico.resolution = 2; ico.position.set(60, 52);
      badge.addChild(halo, ico);
    }
    const title = txt(`★ ${truncateNick(name, 14)}`, 44, 0xffffff);
    title.anchor.set(0, 0.5); title.position.set(190, 78);
    const sub = soft(desc, 28, 0xfff3c4);
    sub.anchor.set(0, 0.5); sub.position.set(192, 132);
    const eff = effect ? soft(effect, 24, 0xffffff) : null;
    if (eff) { eff.anchor.set(0, 0.5); eff.position.set(192, 176); eff.alpha = 0.9; }
    box.addChild(bg, glow, pic, ...(badge ? [badge] : []), title, sub, ...(eff ? [eff] : []));
    // giriş: yukarıdan düş + geri sekmeli büyüme + parlak şimşek
    box.position.set(Z.hero.x, Z.hero.y - 90);
    box.alpha = 0; box.scale.set(0.7);
    this.centerLayer.addChild(box);
    tweener.to(box, 'y', Z.hero.y, 0.4, { ease: Ease.outBack, id: 'hero-y' });
    tweener.to(box, 'alpha', 1, 0.16, { id: 'hero-a' });
    tweener.to(box, 'scale', 1, 0.42, { ease: Ease.outBack, id: 'hero-s' });
    if (badge) tweener.to(badge, 'scale', 1, 0.5, { ease: Ease.outElastic, id: 'hero-b' });
    tweener.to(glow, 'alpha', 0.95, 0.3, { delay: 0.2, id: 'hero-g1' });
    tweener.to(glow, 'alpha', 0.4, 0.5, { delay: 0.8, id: 'hero-g2' });
    // çıkış: küçülüp kaybol (id'li -> girişi silmez)
    tweener.to(box, 'scale', 0.86, 0.35, { delay: 3.2, ease: Ease.inCubic, id: 'hero-out-s' });
    tweener.to(box, 'alpha', 0, 0.35, { delay: 3.2, id: 'hero-out-a', onDone: () => box.destroy({ children: true }) });
    // isim kartı yukarıdan kayarak geçer (her hediyede tekrar eden görsel ritim)
    this.nameFly(name, color, 0.12);
  }

  /** Kahraman kartından sonra ekranın üstünden yükselip uçan isim şeridi. */
  private nameFly(name: string, color: number, delay = 0) {
    const c = new PIXI.Container();
    const glow = new PIXI.Sprite(glowTex());
    glow.anchor.set(0.5); glow.tint = color; glow.alpha = 0.7; glow.blendMode = 'add';
    glow.width = glow.height = 520; glow.position.set(0, -14);
    const bar = panel(700, 104, 0.92, 20);
    bar.tint = color;
    const label = txt(`★ ${truncateNick(name, 14)}`, 54, 0xffffff);
    label.anchor.set(0.5); label.position.set(0, -18);
    const sub = soft(upper(this.locale, t(this.locale, 'gifted')), 26, 0xfff3c4);
    sub.anchor.set(0.5); sub.position.set(0, 30);
    c.addChild(glow, bar, label, sub);
    c.position.set(540, 1700);
    this.centerLayer.addChild(c);
    tweener.to(c, 'y', 1560, 1.5, { delay, ease: Ease.outCubic, id: 'fly-y' });
    tweener.to(c, 'alpha', 0, 0.5, { delay: delay + 1.0, id: 'fly-a' });
    tweener.to(c, 'scale', 1.08, 1.5, { delay, ease: Ease.outCubic, id: 'fly-s' });
    tweener.to(glow, 'alpha', 0, 1.2, { delay: delay + 0.3, id: 'fly-g' });
    setTimeout(() => c.destroy({ children: true }), (delay + 2.2) * 1000);
  }

  update(dt: number) {
    for (let i = this.joinViews.length - 1; i >= 0; i--) {
      const j = this.joinViews[i];
      j.life -= dt;
      if (j.life <= 0) {
        tweener.to(j.box, 'alpha', 0, 0.25, { onDone: () => { j.box.destroy({ children: true }); } });
        this.joinViews.splice(i, 1);
      }
    }
    for (let i = this.feedViews.length - 1; i >= 0; i--) {
      const f = this.feedViews[i];
      f.life -= dt;
      if (f.life <= 0) {
        tweener.to(f.box, 'alpha', 0, 0.25, { onDone: () => { f.box.destroy({ children: true }); } });
        this.feedViews.splice(i, 1);
      }
    }
    if (this.strip) {
      this.strip.life -= dt;
      if (this.strip.life <= 0) {
        const s = this.strip.box;
        tweener.to(s, 'alpha', 0, 0.3, { onDone: () => s.destroy({ children: true }) });
        this.strip = undefined;
      }
    }
    // crimson pulse on mercy timer
    if (this.mercyTimer) {
      const sec = Number(this.mercyTimer.text) || 0;
      if (sec <= 3) {
        const k = 1 + Math.abs(Math.sin(performance.now() / 90)) * 0.25;
        this.mercyTimer.scale.set(k);
      } else this.mercyTimer.scale.set(1);
    }
  }

  clearScene() { this.sceneLayer.removeChildren(); }

  /** Small always-on info card (FPS / phase / viewers) for the streamer. */
  showInfo(on: boolean) {
    if (on && !this.info) {
      this.info = soft('', 15, 0x9fe3ff);
      this.info.position.set(14, 1712);
      this.info.alpha = 0.9;
      this.bottomLayer.addChild(this.info);
    }
    if (this.info) this.info.visible = on;
  }
  setInfoText(s: string) { if (this.info) this.info.text = s; }
  private info: PIXI.Text | null = null;

  /** QA overlay: draws the HUD safe zones so overlaps are visible on stream. */
  showZones(on: boolean) {
    this.zoneLayer.visible = on;
    if (!on) return;
    this.zoneLayer.removeChildren();
    for (const z of layoutZones(this.facecam)) {
      const g = new PIXI.Graphics();
      g.rect(z.x, z.y, z.w, z.h).stroke({ color: 0x39d0ff, width: 2, alpha: 0.9 });
      g.rect(z.x, z.y, z.w, z.h).fill({ color: 0x39d0ff, alpha: 0.06 });
      const lb = soft(z.name, 16, 0x9fe3ff);
      lb.position.set(z.x + 4, z.y + 2);
      this.zoneLayer.addChild(g, lb);
    }
    // TikTok UI dead zones (bottom 12%, right 10%)
    const dz = new PIXI.Graphics();
    dz.rect(0, SCREEN_H * 0.88, SCREEN_W, SCREEN_H * 0.12).fill({ color: 0xff3b5c, alpha: 0.08 });
    dz.rect(SCREEN_W * 0.9, 0, SCREEN_W * 0.1, SCREEN_H).fill({ color: 0xff3b5c, alpha: 0.08 });
    dz.rect(0, SCREEN_H * 0.88, SCREEN_W, SCREEN_H * 0.12).stroke({ color: 0xff3b5c, width: 2, alpha: 0.7 });
    dz.rect(SCREEN_W * 0.9, 0, SCREEN_W * 0.1, SCREEN_H).stroke({ color: 0xff3b5c, width: 2, alpha: 0.7 });
    this.zoneLayer.addChild(dz);
  }

  private zoneLayer = new PIXI.Container();
  hideAnnouncements() {
    for (const c of [...this.announceBox.children]) c.destroy({ children: true });
  }
  setArenaHudVisible(on: boolean) {
    this.arenaHudOn = on;
    this.goalBox.visible = on;
    this.tickerBox.visible = on && !!this.tickerT.text;
    this.giftersLayer.visible = on;
    this.joinsLayer.visible = on;
    this.topLayer.visible = on;
    if (!on) this.bossBox.visible = false;
  }
  private arenaHudOn = true;
  private maxGifters = 5;
  private crownV = -1;

  /* ---------- scenes ---------- */
  sceneDim(alpha = 0.82) {
    const g = new PIXI.Graphics();
    g.rect(0, 0, 1080, 1920).fill({ color: 0x06030f, alpha });
    this.sceneLayer.addChild(g);
    return g;
  }

  sceneEnd(seconds: number, locale: string) {
    this.sceneDim(0.8);
    const box = new PIXI.Container();
    const title = txt(upper(locale, t(locale, 'match.end')), 62, 0xff5b5b);
    title.anchor.set(0.5); title.position.set(540, 700);
    const count = txt(String(Math.ceil(seconds)), 190, 0xffffff);
    count.anchor.set(0.5); count.position.set(540, 940);
    box.addChild(title, count);
    this.sceneLayer.addChild(box);
    const t0 = performance.now();
    const tick = () => {
      if (box.destroyed) return;
      const k = (performance.now() - t0) / 1000;
      const s = Math.max(0, seconds - k);
      count.text = String(Math.ceil(s));
      count.scale.set(1 + Math.abs(Math.sin(k * 4)) * 0.05);
      if (s > 0) requestAnimationFrame(tick);
    };
    tick();
    tweener.to(title, 'scale', 1, 0.5, { from: 1.4, ease: Ease.outBack });
  }

  sceneTable(locale: string, rows: RankRow[], global: { name: string; damage: number; crowns: number; matches: number }[]) {
    this.sceneDim(0.88);
    const mk = (titleStr: string, y: number, items: { name: string; line1: string; line2?: string; id?: string }[]) => {
      const title = txt(upper(locale, titleStr), 34, 0xffd23f);
      title.anchor.set(0.5); title.position.set(540, y);
      this.sceneLayer.addChild(title);
      items.forEach((it, i) => {
        const row = new PIXI.Container();
        const bg = panel(880, 62, i === 0 ? 0.95 : 0.78, 16);
        if (i === 0) bg.tint = 0x8a6d1f;
        const rank = txt(String(i + 1), 28, i === 0 ? 0xffd23f : 0xffffff);
        rank.anchor.set(0.5); rank.position.set(36, 31);
        const pic = new PIXI.Sprite(it.id ? this.pic(it.id, it.name) : PIXI.Texture.WHITE);
        pic.anchor.set(0.5); pic.width = pic.height = 44; pic.position.set(78, 31);
        if (!it.id) pic.alpha = 0;
        const name = soft(truncateNick(it.name, 16), 22, 0xffffff);
        name.anchor.set(0, 0.5); name.position.set(110, 22);
        const l1 = soft(it.line1, 19, 0xffe9a8);
        l1.anchor.set(0, 0.5); l1.position.set(110, 45);
        row.addChild(bg, rank, pic, name, l1);
        row.position.set(100, y + 40 + i * 70);
        row.alpha = 0;
        row.x = 60;
        this.sceneLayer.addChild(row);
        tweener.to(row, 'alpha', 1, 0.25, { delay: i * 0.09 });
        tweener.to(row, 'x', 100, 0.35, { delay: i * 0.09, from: 60, ease: Ease.outCubic });
        void it.line2;
      });
    };
    mk(t(locale, 'table'), 300, rows.slice(0, 5).map((r) => ({
      id: r.userId, name: r.name,
      line1: `${fmtNum(locale, r.score)} ${t(locale, 'points')} · ${r.kills} ${t(locale, 'kills')} · ${fmtNum(locale, r.damage)} ${t(locale, 'damage')}`,
    })));
    mk(t(locale, 'ranking'), 1010, global.slice(0, 5).map((g) => ({
      name: g.name,
      line1: `${fmtNum(locale, Math.round(g.damage))} ${t(locale, 'damage')} · 👑${g.crowns} · ${g.matches}`,
      id: undefined,
    })));
  }

  sceneAwards(locale: string, awards: { title: string; name: string; detail: string; userId?: string; color: number }[], secondsLeft: number) {
    this.sceneDim(0.86);
    // Faz 1.5: sahne girişi — başlık düşer, kartlar sırayla parlar
    const title = txt(upper(locale, t(locale, 'awards')), 46, 0xffd23f);
    title.anchor.set(0.5); title.position.set(540, 230);
    this.sceneLayer.addChild(title);
    tweener.to(title, 'y', 290, 0.55, { from: 130, ease: Ease.outBack });
    tweener.to(title, 'alpha', 1, 0.25, { from: 0 });
    const shine = new PIXI.Sprite(shineTex());
    shine.anchor.set(0.5); shine.blendMode = 'add'; shine.alpha = 0.9;
    shine.width = 520; shine.height = 130; shine.position.set(540, 290);
    this.sceneLayer.addChild(shine);
    tweener.to(shine, 'alpha', 0, 0.6, { delay: 0.5 });
    awards.forEach((a, i) => {
      const box = new PIXI.Container();
      const bg = panel(880, 150, 0.95, 22);
      bg.tint = a.color;
      // kart ışıması: her kart geldiğinde bir parlama
      const flash = new PIXI.Sprite(glowTex());
      flash.anchor.set(0.5); flash.tint = 0xffffff; flash.blendMode = 'add'; flash.alpha = 0;
      flash.width = flash.height = 900; flash.position.set(440, 75);
      const pic = new PIXI.Sprite(a.userId ? this.pic(a.userId, a.name) : PIXI.Texture.WHITE);
      pic.anchor.set(0.5); pic.width = pic.height = 104; pic.position.set(96, 75);
      if (!a.userId) pic.alpha = 0;
      const at = soft(upper(locale, a.title), 24, 0xffe9a8);
      at.anchor.set(0, 0.5); at.position.set(180, 46);
      const nm = txt(truncateNick(a.name, 16), 38, 0xffffff);
      nm.anchor.set(0, 0.5); nm.position.set(180, 88);
      const dt2 = soft(a.detail, 22, 0xffffff);
      dt2.anchor.set(0, 0.5); dt2.position.set(182, 124);
      box.addChild(bg, flash, pic, at, nm, dt2);
      box.position.set(100, 430 + i * 172);
      box.alpha = 0; box.x = 40;
      this.sceneLayer.addChild(box);
      const d = 0.15 * i + 0.2;
      tweener.to(box, 'alpha', 1, 0.25, { delay: d });
      tweener.to(box, 'x', 100, 0.4, { delay: d, from: 40, ease: Ease.outCubic });
      tweener.to(box, 'scale', 1, 0.5, { delay: d, from: 0.9, ease: Ease.outBack });
      tweener.to(flash, 'alpha', 0.75, 0.18, { delay: d });
      tweener.to(flash, 'alpha', 0, 0.5, { delay: d + 0.2 });
      // kart içeri sonra hafifçe geri otursun (canlı duruş)
      tweener.to(box, 'y', 430 + i * 172 - 6, 0.8, { delay: d + 0.7, ease: Ease.outCubic });
      tweener.to(box, 'y', 430 + i * 172, 0.6, { delay: d + 1.5, ease: Ease.outCubic });
    });
    const hint = soft(upper(locale, `${t(locale, 'nextIn')}  ${Math.ceil(secondsLeft)}`), 30, 0xffffff);
    hint.anchor.set(0.5); hint.position.set(540, 1400);
    this.sceneLayer.addChild(hint);
    tweener.to(hint, 'alpha', 1, 0.4, { from: 0 });
  }

  scenePodium(locale: string, top: RankRow[], gifters: GifterRow[], viewerId: string | null) {
    this.sceneDim(0.86);
    const title = txt(upper(locale, t(locale, 'podium')), 52, 0xffd23f);
    title.anchor.set(0.5); title.position.set(540, 280);
    this.sceneLayer.addChild(title);

    const slots: { x: number; h: number; color: number }[] = [
      { x: 250, h: 150, color: 0xcfd6e0 },
      { x: 540, h: 260, color: 0xffd23f },
      { x: 830, h: 110, color: 0xd98a4a },
    ];
    const order = [1, 0, 2];
    order.forEach((idx, slot) => {
      const r = top[idx];
      if (!r) return;
      const s = slots[slot];
      const box = new PIXI.Container();
      const block = new PIXI.Graphics();
      block.roundRect(-110, -s.h, 220, s.h, 14).fill({ color: s.color, alpha: 0.95 });
      block.roundRect(-110, -s.h, 220, 26, 14).fill({ color: 0xffffff, alpha: 0.25 });
      block.roundRect(-110, -s.h, 220, s.h, 14).stroke({ color: 0x12081f, width: 4, alpha: 0.5 });
      const rank = txt(String(idx + 1), 68, 0x12081f);
      rank.anchor.set(0.5); rank.position.set(0, -s.h * 0.42);
      const pic = new PIXI.Sprite(this.pic(r.userId, r.name));
      pic.anchor.set(0.5); pic.width = pic.height = 120;
      pic.position.set(0, -s.h - 68);
      const name = txt(truncateNick(r.name, 14), 30, 0xffffff);
      name.anchor.set(0.5); name.position.set(0, -s.h - 182);
      const stats = soft(`${fmtNum(locale, r.score)} ${t(locale, 'points')} · ${r.kills} ${t(locale, 'kills')}`, 20, 0xffe9a8);
      stats.anchor.set(0.5); stats.position.set(0, -s.h - 150);
      box.addChild(block, rank, pic, name, stats);
      if (idx === 0) {
        const cr = new PIXI.Sprite(assets.texOr('avatars.crown', crownTex));
        cr.anchor.set(0.5); cr.width = 110; cr.height = 80;
        cr.position.set(0, -s.h - 226);
        box.addChild(cr);
        tweener.to(cr, 'rotation', 0.12, 0.6, { ease: Ease.outElastic });
        tweener.to(cr, 'rotation', 0, 0.6, { delay: 0.6 });
        if (viewerId === r.userId) {
          const you = txt(upper(locale, t(locale, 'congrats')), 40, 0x7ee8ff);
          you.anchor.set(0.5); you.position.set(540, 300);
          this.sceneLayer.addChild(you);
          tweener.to(you, 'scale', 1, 0.6, { from: 1.5, ease: Ease.outBack });
        }
      }
      box.position.set(s.x, 1180);
      this.sceneLayer.addChild(box);
      tweener.to(box, 'y', 1180 - s.h, 0.6, { from: 1180, delay: 0.1 * slot, ease: Ease.outCubic });
      box.alpha = 0;
      tweener.to(box, 'alpha', 1, 0.3, { delay: 0.1 * slot });
    });

    const gl = txt(upper(locale, t(locale, 'gifts')), 26, 0xffd86b);
    gl.anchor.set(0.5); gl.position.set(540, 1480);
    this.sceneLayer.addChild(gl);
    gifters.slice(0, 3).forEach((g, i) => {
      const row = new PIXI.Container();
      const bg = panel(520, 58, 0.85, 16);
      const pic = new PIXI.Sprite(this.pic(g.userId, g.name));
      pic.anchor.set(0.5); pic.width = pic.height = 42; pic.position.set(34, 29);
      const nm = soft(truncateNick(g.name, 14), 20, 0xffffff);
      nm.anchor.set(0, 0.5); nm.position.set(66, 29);
      const dv = soft(`♥ ${fmtNum(locale, g.diamonds)}`, 20, 0xff8fa8);
      dv.anchor.set(1, 0.5); dv.position.set(500, 29);
      row.addChild(bg, pic, nm, dv);
      row.position.set(280, 1520 + i * 64);
      row.alpha = 0;
      this.sceneLayer.addChild(row);
      tweener.to(row, 'alpha', 1, 0.25, { delay: 0.5 + i * 0.1 });
    });
  }

  sceneIntro(locale: string, matchNo: number, arena: string, timeOfDay: string, mutator: string) {
    this.sceneDim(0.5);
    const box = new PIXI.Container();
    const title = txt('TAÇ SAVAŞI', 92, 0xffe14d);
    title.anchor.set(0.5); title.position.set(540, 760);
    const sub = soft(`${upper(locale, arena)} · ${upper(locale, timeOfDay)} · ${mutator}`, 30, 0xffffff);
    sub.anchor.set(0.5); sub.position.set(540, 840);
    const num = txt(`#${matchNo}`, 44, 0x39d0ff);
    num.anchor.set(0.5); num.position.set(540, 910);
    box.addChild(title, sub, num);
    box.alpha = 0;
    this.sceneLayer.addChild(box);
    tweener.to(box, 'alpha', 1, 0.3);
    tweener.to(title, 'scale', 1, 0.7, { from: 2.2, ease: Ease.outExpo });
    tweener.to(title, 'alpha', 0, 0.4, { delay: 2.4 });
    tweener.to(sub, 'alpha', 0, 0.4, { delay: 2.4 });
    tweener.to(num, 'alpha', 0, 0.4, { delay: 2.4 });
  }

  bossCrown() {
    const cr = new PIXI.Sprite(assets.texOr('avatars.crown', crownTex));
    cr.anchor.set(0.5);
    this.topLayer.addChild(cr);
    return cr;
  }
}

interface SlotView { box: PIXI.Container; pic: PIXI.Sprite; name: PIXI.Text; stats: PIXI.Text; ring: PIXI.Graphics }
interface GifterView { box: PIXI.Container; pic: PIXI.Sprite; name: PIXI.Text; dia: PIXI.Text }
export { txt, soft, panel, ringFrameTex, spikesTex };
