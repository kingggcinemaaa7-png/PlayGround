// Main game orchestrator: match loop, entity rendering, live input, scoring.
import * as PIXI from 'pixi.js';
import {
  Sim, giftTier, normalizeCommand, normalizeTeam, type Team, t, fmtNum, upper, truncateNick,
  comboMult, defaultSimConfig, GiftRegistry,
  type LiveEvent, type AvatarState, type GiftDef, type GiftAction,
} from '@tac/shared';
import { FX } from './fx.js';
import { audio } from './audio.js';
import { picTexture } from './pics.js';
import { World, type ArenaName } from './gfx/world.js';
import { Hud } from './gfx/hud.js';
import { EntityLayer } from './gfx/entities.js';
import { tweener, Ease } from './gfx/tween.js';
import { Facecam } from './gfx/facecam.js';
import { assets } from './assets.js';
import { hideSplash } from './boot.js';

type Phase = 'intro' | 'play' | 'end' | 'table' | 'awards' | 'podium';

/**
 * Köprüden gelen olayı doğrular (H12). Bot/bozuk istemci gönderdiği için
 * TEK bir bozuk alan tüm oyunu bozuyordu: `diamonds:"abc"` goal barını NaN
 * yapıp kalıcı bozuyor, isimsiz hediye truncateNick'i patlatıp 240 kare
 * sonra oyunu sessizce durduruyordu. Sınırlar burada tek yerde tanımlı.
 */
const EVENT_TYPES = new Set(['join', 'chat', 'like', 'follow', 'gift', 'share']);
function sanitizeEvent(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? '');
  if (!EVENT_TYPES.has(type)) return null;
  const userId = String(o.userId ?? '').slice(0, 64);
  if (!userId) return null;
  const name = String(o.name ?? '?').slice(0, 32) || '?';
  const num = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const out: LiveEvent = {
    type: type as LiveEvent['type'],
    id: String(o.id ?? `${type}-${userId}`).slice(0, 96),
    userId, name,
    pic: typeof o.pic === 'string' ? o.pic.slice(0, 500) : null,
    repeatEnd: o.repeatEnd === true,
  };
  if (o.text !== undefined) out.text = String(o.text).slice(0, 120);
  if (o.giftName !== undefined) out.giftName = String(o.giftName).slice(0, 64);
  if (o.n !== undefined) out.n = Math.round(num(o.n, 1, 9999, 1));
  if (o.diamonds !== undefined) out.diamonds = num(o.diamonds, 0, 1e6, 1);
  return out;
}

/** Hortum: dokümana uygun 3 darbe x 15 hasar, 75px yarıçap. */
const TORNADO_TICKS = 3;
const TORNADO_TICK_SEC = 1.2;
const TORNADO_RADIUS = 75;
const TORNADO_DMG = 15;
/** Bu hasarın üstü arenada kocaman BOOM yazısı çıkarır. */
const BOOM_DMG = 30;

/** Takım vuruşu bekleme süresi (saniye) — spam'i engeller. */
const TEAM_COOLDOWN_SEC = 12;

/** sim'den gelen vuruş olayı (hasar geri bildirimi) */
interface HitEvent {
  type: 'hit'; x: number; y: number; victim: string;
  dmg: number; crit: boolean; reflect: boolean;
}

/** Kahraman kartı kuyruk öğesi (hediye fırtınasında kartlar üst üste binmez). */
interface HeroCardParams {
  name: string; userId: string; desc: string; color: number;
  icon?: string; effect?: string;
}
/** Kart ekranda ~3.55 sn kalır (çıkış 3.2 + 0.35 sönüm); sıradaki o zaman gelir. */
const HERO_CARD_SEC = 3.6;
/** Kuyruk taşmasın diye en fazla bu kadar kart bekler (fazlası düşer). */
const HERO_QUEUE_MAX = 8;

interface Cfg {
  fx: { heat: boolean; breath: boolean };
  match: { durationSec: number; introSec: number; endCountdownSec: number; tableSec: number; awardsSec: number; podiumSec: number; maxFighters: number };
  avatar: { hp: number };
  gifts: { goalStart: number; goalGrowth: number; goldRainSec: number };
  cooldowns: { shieldSec: number; shieldDurSec: number; fireRingSec: number };
  mercy: { minStreak: number; windowSec: number };
  boss: { fractions: number[]; baseHp: number; hpPerFighter: number };
  locale: { default: string; dual: boolean; second: string };
  facecam?: { stripPx: number; mirror?: boolean };
  admin?: { enabled?: boolean; hotkey?: string; defaultBridge?: string };
}

const ARENAS: ArenaName[] = ['beach', 'volcano', 'ice', 'night-forest', 'sky-island'];
const BOSSES: { key: 'kraken' | 'crab'; hpMul: number }[] = [
  { key: 'kraken', hpMul: 1 }, { key: 'crab', hpMul: 1.25 },
];
export class Game {
  app!: PIXI.Application;
  camera = new PIXI.Container();
  world!: World;
  fx!: FX;
  hud!: Hud;
  ent!: EntityLayer;
  sim!: Sim;
  cfg: Cfg;
  locale: string;
  dual = true;
  phase: Phase = 'intro';
  phaseT = 0;
  matchNo = 1;
  matchT = 0;
  duration: number;
  goal = 0; goalTarget = 500;
  goldRainUntil = -1;
  tideAmt = 0; stormAmt = 0;
  arena: ArenaName = 'beach';
  evening = false;
  mutator: 'none' | 'double' | 'goldrain' | 'speed' = 'none';
  bossIdx = 0;
  bossPhase = 1;
  bossSpawned: boolean[] = [];
  hunterName = '';
  gifters: { userId: string; name: string; diamonds: number }[] = [];
  likeAcc = new Map<string, number>();
  comboAt = new Map<string, number[]>();
  cdShield = new Map<string, number>();
  cdFire = new Map<string, number>();
  cdPower = new Map<string, number>();
  cdTeam = new Map<string, number>();
  private tornadoTicks = new Map<string, { left: number; cd: number; hitAt: Map<string, number> }>();
  pendingGifts = new Map<string, LiveEvent[]>();
  joinedAt = new Map<string, number>();
  gifts = new GiftRegistry();
  private static readonly GIFT_STORE = 'tac-gifts-v1';
  globalRanking: { name: string; damage: number; crowns: number; matches: number }[] = [];
  prevPos = new Map<string, { x: number; y: number }>();
  quality = 1;
  frameEMA = 16;
  stripTimer = 0;
  leaderId: string | null = null;
  /** 0..1 oyuncu yayılımı (kamera adaptasyonu, Faz 2.6) */
  private avatarSpread = 0.3;
  leaderTitle = '';
  lastTs = 0;
  acc = 0;
  lastLightning = 0;
  telemetry: Record<string, number | string>[] = [];
  stats = { gifts: [0, 0, 0, 0, 0], goalFillSec: -1, mercyRevives: 0, bossKillSec: -1, viewers: 0, watchSum: 0, watchCount: 0, teamPicks: 0, hits: 0, bridgeDrops: 0 };
  awards: { title: string; name: string; detail: string; userId?: string; color: number }[] = [];
  private endSceneShown = false;
  private hudInfoOn = false;

  /* ---- hediye kayıt defteri (konsoldan yönetilir, localStorage'da saklanır) ---- */
  loadGifts() {
    try {
      const raw = localStorage.getItem(Game.GIFT_STORE);
      if (raw) this.gifts.fromJSON(JSON.parse(raw));
    } catch { /* varsayılan katalog */ }
  }
  saveGifts() {
    try { localStorage.setItem(Game.GIFT_STORE, JSON.stringify(this.gifts.toJSON())); } catch { /* kota */ }
  }
  giftList(): GiftDef[] { return this.gifts.list(); }
  giftAdd(def: GiftDef): GiftDef { const d = this.gifts.upsert(def); this.saveGifts(); return d; }
  giftRemove(id: string): boolean { const ok = this.gifts.remove(id); this.saveGifts(); return ok; }
  giftSet(id: string, patch: Partial<GiftDef>): boolean {
    const cur = this.gifts.lookup(id);
    if (!cur) return false;
    if (patch.diamonds !== undefined) this.gifts.setDiamonds(id, patch.diamonds);
    if (patch.action !== undefined) this.gifts.setAction(id, patch.action as GiftAction);
    if (patch.enabled !== undefined) this.gifts.setEnabled(id, patch.enabled);
    if (patch.name !== undefined || patch.icon !== undefined) {
      this.gifts.upsert({ ...cur, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.icon !== undefined ? { icon: patch.icon } : {}) });
    }
    this.saveGifts();
    return true;
  }
  giftReset() { this.gifts.reset(); this.saveGifts(); }
  private watchAcc = 0;
  /** how many real audio files were found at boot (0 = synth only) */
  audioLoaded = 0;
  lastEventUser: { id: string; name: string } = { id: '', name: '' };
  facecam = new Facecam();
  paused = false;
  autoGifts = false;
  autoGiftTimer = 0;
  mockSeq = 0;
  fps = 60;
  lastTable: AvatarState[] = [];

  constructor(cfg: Cfg) {
    this.cfg = cfg;
    // görsel anahtarlar: config.json ya da konsoldan gelebilir, yoksa açık
    cfg.fx = { heat: cfg.fx?.heat !== false, breath: cfg.fx?.breath !== false };
    this.locale = cfg.locale.default;
    this.dual = cfg.locale.dual;
    this.duration = cfg.match.durationSec;
  }

  async boot(el: HTMLElement, safemode = false, onStage?: (s: string) => void) {
    const stage = (s: string) => { try { onStage?.(s); } catch { /* noop */ } };
    if (safemode) audio.setEnabled(false);
    // Asset/audio probing runs in the BACKGROUND: the game boots instantly on
    // procedural fallbacks, and real files swap in live when they arrive
    // (see assets.version). A slow tunnel must never delay the first frame.
    stage('varliklar araniyor');
    if (!safemode) {
      assets.load('assets')
        .catch((e) => console.warn('[tac] assets', e))
        .then(() => this.loadAudioAssets()
          .catch((e) => console.warn('[tac] audio', e))
          .then(() => audio.syncMusicLayers()));
    } else {
      console.info('[tac] safemode: varlık/ses taraması atlandı');
    }
    // konsoldan seçilip kaydedilmiş müzikler (IndexedDB) her modda geri yüklenir
    audio.restoreSaved().catch(() => undefined);

    stage('pixi baslatiliyor');
    const { DOMAdapter, BrowserAdapter } = PIXI as unknown as { DOMAdapter: { set(a: unknown): void }; BrowserAdapter: unknown };
    try { DOMAdapter.set(BrowserAdapter); } catch { /* already set */ }
    this.app = new PIXI.Application();
    const initPr = this.app.init({ width: 1080, height: 1920, background: 0x06233b, antialias: true, preference: 'webgl' });
    await Promise.race([initPr, new Promise<never>((_, r) => setTimeout(() => r(new Error('pixi-init-timeout')), 12000))]);
    stage('sahne kuruluyor');
    el.appendChild(this.app.canvas);
    this.fit();
    window.addEventListener('resize', () => this.fit());

    this.camera.addChild((this.world = new World()).root);
    this.ent = new EntityLayer();
    this.camera.addChild(this.ent.root);
    this.fx = new FX(this.camera);
    // taze mermi namludan çıkarken kısa parlaması olur (kuyruklu yıldız doğumu)
    this.ent.onMuzzle = (x, y) => { this.fx.burst(x, y, 0xfff6d8, 3, 130, 0.22, 15); };
    this.hud = new Hud();
    this.hud.initLayers();
    this.hud.facecamSlot.addChild(this.facecam.root);
    this.hud.pic = (id, name) => this.picOf(id, name);
    this.app.stage.addChild(this.camera, this.hud.root);

    this.sim = new Sim({ ...defaultSimConfig(), avatarHp: this.cfg.avatar.hp }, (Math.random() * 1e9) | 0);
    this.sim.onKill = (k) => this.onKill(k.killer, k.victim, k.streak, k.cutStreak, k.dmg, k.chain);
    this.sim.onEvent = (e) => this.onSimEvent(e);
    this.sim.onRespawn = (userId) => this.flushPending(userId);
    this.ent.orbitCount = this.sim.cfg.orbit.count;
    this.ent.orbitRadius = this.sim.cfg.orbit.radius;

    stage('mac basliyor');
    audio.syncMusicLayers();
    this.startMatch();
    this.app.canvas.addEventListener('pointerdown', () => audio.ensure());
    this.lastTs = performance.now();
    this.app.ticker.add(() => this.frame());
  }

  fit() {
    const s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    this.app.canvas.style.width = `${Math.floor(1080 * s)}px`;
    this.app.canvas.style.height = `${Math.floor(1920 * s)}px`;
  }

  private picCache = new Map<string, PIXI.Texture>();
  private picOf(userId: string, name: string): PIXI.Texture {
    const hit = this.picCache.get(userId);
    if (hit) return hit;
    const a = this.sim.getAvatar(userId);
    const tex = picTexture(userId, name, a?.pic ?? null);
    this.picCache.set(userId, tex);
    return tex;
  }
  refreshPic(userId: string) { this.picCache.delete(userId); }

  /** Pull real audio files named in the manifest (music + SFX + announcer). */
  private async loadAudioAssets() {
    const files = assets.manifest?.audio ?? [];
    const names: [string, string][] = [
      ['music-calm', 'audio/music-calm.ogg'],
      ['music-intense', 'audio/music-intense.ogg'],
    ];
    for (const n of ['shot', 'hit', 'kill', 'meteor', 'tornado', 'thunder', 'roar', 'tick', 'fanfare', 'tide'] as const) {
      names.push([`sfx-${n}`, `audio/sfx-${n}.wav`]);
    }
    for (const tier of [1, 2, 3, 4, 5] as const) names.push([`sfx-gift-t${tier}`, `audio/sfx-gift-t${tier}.wav`]);
    for (const tier of [5, 15, 30, 50] as const) names.push([`sfx-streak-${tier}`, `audio/sfx-streak-${tier}.wav`]);
    for (const loc of ['es-MX', 'es-ES', 'tr-TR']) {
      for (const k of ['match.start', 'match.end', 'goldrain', 'mercy', 'boss', 'streak']) {
        names.push([`announcer-${loc}-${k}`, `audio/announcer/${loc}/${k}.wav`]);
      }
    }
    const EXT = ['.ogg', '.wav', '.mp3', '.m4a'];
    let n = 0;
    // bounded parallelism: fast on localhost, polite on a slow tunnel
    const CONC = 6;
    const queue = names.filter(([, rel]) => {
      const file = rel.split('/').pop()!;
      // only try what the manifest lists (or everything when it has no audio yet)
      return !files.length || files.some((f) => f.includes(file) || f.includes(file.replace(/\.\w+$/, '')));
    });
    const workers = Array.from({ length: Math.min(CONC, queue.length) }, async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) return;
        const [name, rel] = job;
        const stem = rel.replace(/\.[^./]+$/, '');
        // accept any common extension so you can drop in a WAV or MP3 without renaming
        const tried = [rel, ...EXT.filter((e) => !rel.endsWith(e)).map((e) => `${stem}${e}`)];
        for (const cand of tried) {
          if (await audio.load(name, `assets/${cand}`)) { n++; break; }
        }
      }
    });
    await Promise.all(workers);
    this.audioLoaded = n;
    return n;
  }

  /* ---------------- match flow ---------------- */
  startMatch() {
    this.phase = 'intro';
    this.phaseT = this.cfg.match.introSec;
    this.matchT = 0;
    this.goal = 0;
    this.goalTarget = this.cfg.gifts.goalStart;
    this.goldRainUntil = -1;
    this.nextBossAt = 0;
    this.mutator = (['none', 'double', 'goldrain', 'speed'] as const)[this.matchNo % 4];
    this.sim.cfg.mutator = this.mutator;
    this.arena = ARENAS[(this.matchNo - 1) % ARENAS.length];
    this.evening = this.matchNo % 2 === 0;
    this.world.build(this.arena, this.evening && this.matchNo % 4 === 3, this.evening);
    this.ent.bossHide();
    this.hud.bossHide();
    this.hud.mercyHide();
    this.hud.clearScene();
    this.bossSpawned = [false, false, false, false, false];
    this.stripTimer = 6;
    this.endSceneShown = false;
    this.stats = { gifts: [0, 0, 0, 0, 0], goalFillSec: -1, mercyRevives: 0, bossKillSec: -1, viewers: this.sim.avatars.size, watchSum: 0, watchCount: 0, teamPicks: 0, hits: 0, bridgeDrops: 0 };
    for (const [id] of this.ent.avatars) this.ent.removeAvatar(id);
    this.picCache.clear();
    const arenaLabel = t(this.locale, `arena.${this.arena}`);
    const dayLabel = t(this.locale, this.evening ? 'time.dusk' : 'time.day');
    const mutLabel = this.mutator === 'none' ? '' : upper(this.locale, t(this.locale, `mutator.${this.mutator}`));
    this.hud.sceneIntro(this.locale, this.matchNo, arenaLabel, dayLabel, mutLabel);
    this.hud.setMutator(mutLabel);
    audio.fanfare();
  }

  private computeResults() {
    const rows = [...this.sim.avatars.values()];
    this.lastTable = rows.sort((a, b) => b.score - a.score || b.kills - a.kills || b.damage - a.damage);
    // persist totals into global ranking (in-memory mirror of DB)
    for (const a of this.lastTable) {
      const g = this.globalRanking.find((g) => g.name === a.name);
      if (g) { g.damage += a.damage; if (this.lastTable[0]?.userId === a.userId) g.crowns++; g.matches++; }
      else this.globalRanking.push({ name: a.name, damage: a.damage, crowns: this.lastTable[0]?.userId === a.userId ? 1 : 0, matches: 1 });
    }
    const best = (f: (a: AvatarState) => number) => [...rows].sort((a, b) => f(b) - f(a))[0];
    const monsterHunter = best((a) => a.monsterKills);
    this.awards = [
      { title: t(this.locale, 'award.kills'), name: best((a) => a.kills)?.name ?? '—', detail: `${best((a) => a.kills)?.kills ?? 0} ${t(this.locale, 'kills')}`, userId: best((a) => a.kills)?.userId, color: 0xb03030 },
      { title: t(this.locale, 'award.streak'), name: best((a) => a.bestStreak)?.name ?? '—', detail: `${upper(this.locale, t(this.locale, 'streak'))} x${best((a) => a.bestStreak)?.bestStreak ?? 0}`, userId: best((a) => a.bestStreak)?.userId, color: 0xc06a14 },
      { title: t(this.locale, 'award.hunter'), name: monsterHunter?.name ?? '—', detail: `${fmtNum(this.locale, monsterHunter?.monsterKills ?? 0)} ${t(this.locale, 'monsters', { n: '' }).trim() || 'monstruos'}`, userId: monsterHunter?.userId, color: 0x8a2a9e },
      { title: t(this.locale, 'award.star'), name: this.gifters[0]?.name ?? '—', detail: `♥ ${fmtNum(this.locale, this.gifters[0]?.diamonds ?? 0)}`, userId: this.gifters[0]?.userId, color: 0xb8901a },
    ];
    const avgWatch = this.stats.watchCount ? this.stats.watchSum / this.stats.watchCount : 0;
    this.telemetry.push({
      match: this.matchNo,
      viewers: this.sim.avatars.size,
      gifts: this.stats.gifts.join('/'),
      goalFillSec: this.stats.goalFillSec,
      mercyRevives: this.stats.mercyRevives,
      bossKillSec: this.stats.bossKillSec,
      avgWatchSec: +avgWatch.toFixed(1),
    });
    try {
      const csv = 'match,viewers,gifts,goalFillSec,mercyRevives,bossKillSec\n'
        + this.telemetry.map((r) => Object.values(r).join(',')).join('\n');
      localStorage.setItem('tac-telemetry', csv);
    } catch { /* quota */ }
  }

  private nextPhase() {
    if (this.phase === 'end') { this.phase = 'table'; this.phaseT = this.cfg.match.tableSec; }
    else if (this.phase === 'table') { this.phase = 'awards'; this.phaseT = this.cfg.match.awardsSec; }
    else if (this.phase === 'awards') { this.phase = 'podium'; this.phaseT = this.cfg.match.podiumSec; }
    else { this.matchNo++; this.startMatch(); }
  }

  /* ---------------- frame ---------------- */
  private frameErrors = 0;

  frame() {
    // A 4-hour stream must never go black because one frame threw.
    try {
      this.frameBody();
    } catch (err) {
      this.frameErrors++;
      if (this.frameErrors === 1 || this.frameErrors % 60 === 0) {
        console.error('[tac] frame error', err);
      }
      if (this.frameErrors > 240) { this.paused = true; this.frameErrors = 0; }
    }
  }

  private booted = false;

  private frameBody() {
    if (!this.booted) {
      this.booted = true;
      (window as unknown as { __tacBooted?: boolean }).__tacBooted = true;
      hideSplash();
    }
    const now = performance.now();
    let dt = (now - this.lastTs) / 1000;
    this.lastTs = now;
    if (dt > 0.1) dt = 0.1;

    this.frameEMA = this.frameEMA * 0.94 + dt * 1000 * 0.06;
    if (dt > 0) this.fps = this.fps * 0.9 + (1 / dt) * 0.1;
    this.facecam.update();
    if (this.frameEMA > 18 && this.quality > 0.35) { this.quality -= 0.08; this.fx.setQuality(this.quality); }
    else if (this.frameEMA < 12.5 && this.quality < 1) { this.quality += 0.05; this.fx.setQuality(this.quality); }

    if (this.paused) { this.renderWorld(0, 1); this.hud.update(0); return; }
    this.hitBudget = 8; // kare başına kıvılcım tavanı (olay yağmuruna karşı)
    const frozen = this.fx.update(dt);
    if (!frozen) {
      this.acc += dt;
      const step = 1 / 60;
      let n = 0;
      while (this.acc >= step && n < 5) { this.tickSim(step); this.acc -= step; n++; }
    }
    const alpha = Math.max(0, Math.min(1, this.acc * 60));
    this.renderWorld(dt, alpha);
    this.hud.update(dt);
    // Faz 2.6: kamera adaptasyonu — dağılma ve kalabalığa göre yumuşak zoom
    this.fx.autoZoomFor(this.avatarSpread, this.sim.avatars.size, !!this.sim.boss?.alive);
    this.fx.applyCamera(this.camera, this.world.root, dt);
    if (this.hudInfoOn) this.hud.setInfoText(`${Math.round(this.fps)}fps · ${this.phase} · ${this.sim.avatars.size} · m${this.sim.bullets.length}`);
  }

  /**
   * Faz 2.3 — savaş ısısı: en yüksek seri + canlı oyuncu sayısı + boss/final
   * durumundan 0..1 üretilir. Ekran kenarları ısınır, müzik yoğunlaşır.
   */
  private updateHeat() {
    let maxStreak = 0, alive = 0;
    for (const a of this.sim.avatars.values()) {
      if (!a.alive) continue;
      alive++;
      if (a.streak > maxStreak) maxStreak = a.streak;
    }
    const streakH = Math.min(1, maxStreak / 12);
    const crowdH = Math.min(1, Math.max(0, (alive - 2) / 10));
    const bossH = this.sim.boss?.alive ? 0.35 : 0;
    const remain = this.duration - this.matchT;
    const finalH = remain <= 60 ? 0.45 : 0;
    const combat = Math.min(1, Math.min(1, this.sim.bullets.length / 60) * 0.6);
    const target = Math.min(1, streakH * 0.42 + crowdH * 0.18 + bossH + finalH + combat);
    this.fx.setHeat(target);
    // ısı yükseldikçe müzik yoğunlaşır (boss hariç: boss kendi müziğini kullanır)
    if (!this.sim.boss?.alive) {
      const intense = target > 0.62;
      if (audio.intense !== intense) {
        audio.intense = intense;
        audio.syncMusicLayers();
      }
    }
    // yüksek ısıda hafif zoom gerilimi
    if (target > 0.7 && this.fx.zoomTarget < 1.02) this.fx.punchZoom(1.015);
  }

  /**
   * Faz 3.2 — son 60 saniye finali: sayaç vurgusu, altın basınç, son sıra
   * önizlemesi ve bitiş sertleşmesi. Tek seferlik geçişler.
   */
  private finaleShown = { s60: false, s30: false, s10: false };
  private updateFinale() {
    const remain = this.duration - this.matchT;
    if (remain > 60) { this.finaleShown = { s60: false, s30: false, s10: false }; return; }
    const tr = this.secondLocale;
    const mark = (key: 's60' | 's30' | 's10', remainLimit: number, locKey: string, color: number, size: number) => {
      if (this.finaleShown[key] || remain > remainLimit) return;
      this.finaleShown[key] = true;
      this.sayAnnounce(locKey,
        upper(this.locale, t(this.locale, locKey)),
        this.dual ? upper(tr, t(tr, locKey)) : undefined,
        color, size);
      this.fx.flash(0.22);
      this.fx.shake.add(12);
      this.fx.confettiBurst(540, 500, 90);
      audio.fanfare();
      audio.intense = true;
      audio.syncMusicLayers();
    };
    mark('s60', 60, 'final.last60', 0xffa03a, 60);
    mark('s30', 30, 'final.sprint', 0xff5b5b, 58);
    mark('s10', 10, 'match.last10', 0xff3b5c, 54);
  }

  /** Sanat yönetimi: boss > final > fırtına > akşam > gündüz (Faz 1.2). */
  private updateMood(progress: number) {
    const remain = this.duration - this.matchT;
    const mood: 'day' | 'sunset' | 'storm' | 'boss' | 'final' =
      this.sim.boss?.alive ? 'boss'
        : remain <= 60 && this.phase === 'play' ? 'final'
          : this.stormAmt > 0.35 ? 'storm'
            : this.world.nightAmt > 0.15 || progress > 0.62 ? 'sunset'
              : 'day';
    if (mood !== this.world.mood) this.world.setMood(mood);
  }

  private renderWorld(dt: number, alpha: number) {
    const time = this.sim.time;
    // sinematik kart kuyruğu: fırtınada kartlar sırayla, üst üste binmeden
    this.flushHeroQueue(dt);
    // environment
    this.tideAmt = this.tideAmt + (Math.min(1, Math.max(0, (this.sim.tideUntil - time) / 14)) - this.tideAmt) * Math.min(1, dt * 2.4);
    this.stormAmt = this.stormAmt + (Math.min(1, Math.max(0, (this.sim.stormUntil - time) / 9)) - this.stormAmt) * Math.min(1, dt * 2.6);
    const progress = Math.max(0, Math.min(1, this.matchT / this.duration));
    this.world.dayProgress = progress;
    // warm grade fades in through the middle of the match, then night takes over
    const sunset = Math.max(0, Math.min(1, (progress - 0.35) / 0.3)) * 0.8;
    // Faz 1.2/3.2: sanat yönetimi modu — en güçlü bağlam kazanır
    this.updateMood(progress);
    this.world.breath = this.cfg.fx.breath;
    if (!this.cfg.fx.heat) this.fx.setHeat(0);
    if (!this.automation.night) this.world.dayProgress = 0;
    this.world.update(dt, { tide: this.tideAmt, storm: this.stormAmt, sunset, arena: this.arena });
    this.world.castleDamage(this.sim.castleHp / this.sim.castleMax);

    // yayılım: canlı oyuncular merkeze ne kadar uzak (0..1)
    let spread = 0, live = 0;
    for (const a of this.sim.avatars.values()) {
      if (!a.alive) continue;
      live++;
      const d = Math.hypot(a.x - 540, (a.y - 960) / 1.2) / 430;
      if (d > spread) spread = d;
    }
    const targetSpread = live > 1 ? spread : 0.15;
    this.avatarSpread += (targetSpread - this.avatarSpread) * Math.min(1, dt * 1.6);

    // leader
    let lead: AvatarState | null = null;
    for (const a of this.sim.avatars.values()) if (a.alive && (!lead || a.streak > lead.streak)) lead = a;
    this.leaderId = lead?.userId ?? null;
    this.leaderTitle = this.titleFor();

    // avatars
    for (const [id, a] of this.sim.avatars) {
      const v = this.ent.avatar(id);
      const prev = this.prevPos.get(id) ?? { x: a.x, y: a.y };
      const powers: { label: string; color: number; left: number; total: number }[] = [];
      const timed: [string, number][] = [
        ['fuerza', a.fuerzaUntil], ['velocidad', a.speedUntil], ['veneno', a.poisonUntil],
        ['curacion', a.healUntil], ['doble', a.doubleUntil], ['rage', a.rageUntil],
        ['ghost', a.ghostUntil], ['vamp', a.vampUntil], ['giant', a.giantUntil],
        ['reflect', a.reflectUntil], ['chain', a.chainUntil],
      ];
      for (const [kind, until] of timed) {
        if (time < until) {
          const meta = (Game.POWER_META as Record<string, { color: number; icon: string; total: number }>)[kind];
          powers.push({ label: `${meta.icon} ${t(this.locale, `power.${kind}`)}`, color: meta.color, left: until - time, total: meta.total });
        }
      }
      this.ent.syncAvatar(v, a, {
        px: prev.x, py: prev.y, alpha, time,
        isLead: lead?.userId === id,
        leadTitle: lead && lead.userId === id ? `MVP · ${this.titleFor()}` : '',
        locale: this.locale,
        pic: this.picOf(id, a.name),
        powerTimers: powers,
      });
    }
    for (const id of [...this.ent.avatars.keys()]) {
      if (!this.sim.avatars.has(id)) this.ent.removeAvatar(id);
    }

    // shadow clones follow their owners
    for (const m of this.sim.minions) {
      const owner = this.sim.getAvatar(m.owner);
      const v = this.ent.clone(m.id);
      this.ent.syncClone(v, m, this.picOf(m.owner, owner?.name ?? '?'), this.sim.time);
    }
    for (const id of [...this.ent.clones.keys()]) {
      if (!this.sim.minions.some((m) => m.id === id)) this.ent.removeClone(id);
    }

    // bullets + monsters + boss
    this.ent.syncBullets(this.sim.bullets, time);
    this.ent.syncMonsters(this.sim.monsters.map((m, i) => ({ id: String(i), x: m.x, y: m.y, hp: m.hp })), time);
    this.ent.syncBoss(time);

    // hud pieces
    const rows = [...this.sim.avatars.values()]
      .sort((a, b) => b.score - a.score || b.kills - a.kills || b.damage - a.damage).slice(0, 3)
      .map((a) => ({ userId: a.userId, name: a.name, kills: a.kills, damage: a.damage, score: a.score, streak: a.streak, bestStreak: a.bestStreak }));
    this.hud.updateSlots(rows);
    this.hud.updateGifters(this.gifters.map((g) => ({ userId: g.userId, name: g.name, diamonds: g.diamonds })));
    this.hud.updateGoal(this.goal, this.goalTarget);
    this.world.setCastleHp(this.sim.castleHp / this.sim.castleMax, upper(this.locale, t(this.locale, 'castle')));
    if (this.sim.boss?.alive) {
      this.hud.bossShow(
        upper(this.locale, t(this.locale, this.sim.boss.name.includes('Kraken') || this.sim.boss.name.includes('kraken') ? 'boss.kraken' : 'boss.crab')),
        this.sim.boss.hp / this.sim.boss.maxHp, this.sim.boss.hp, this.sim.boss.maxHp, this.hunterName || '—',
      );
    } else this.hud.bossHide();

    const phaseLabel = t(this.locale, `phase.${this.phase}`);
    const remain = this.phase === 'play' ? Math.max(0, this.duration - this.matchT) : this.phaseT;
    const dayLabel = this.evening ? 'time.dusk' : 'time.day';
    this.hud.updateTimer(remain, this.matchNo, phaseLabel, t(this.locale, dayLabel));

    // ticker
    if (this.tideAmt > 0.15) this.hud.setTicker(`🌊 ${upper(this.locale, t(this.locale, 'tide'))}`, this.lastEventUser.id, this.lastEventUser.name);
    else if (this.stormAmt > 0.15) this.hud.setTicker(`⛈ ${upper(this.locale, t(this.locale, 'storm'))}`, this.lastEventUser.id, this.lastEventUser.name);
    else if (time < this.goldRainUntil) this.hud.setTicker(`🌧 ${upper(this.locale, t(this.locale, 'goldrain'))}`, this.lastEventUser.id, this.lastEventUser.name);
    else this.hud.setTicker('');

    // gift menu strip every 30s for 6s
    if (this.phase === 'play') {
      this.stripTimer -= dt;
      if (this.stripTimer <= 0) {
        this.stripTimer = 30;
        const strip = this.gifts.enabled().slice(0, 5);
        const palette = [0xff9ec4, 0x9fd8ff, 0xffb3c8, 0xffc46b, 0x9fe8ff];
        this.hud.showGiftStrip(strip.map((d, i) => ({
          icon: d.icon, name: d.name, value: `◆ ${fmtNum(this.locale, d.diamonds)}`,
          color: palette[i % palette.length],
        })), 6);
      }
    }
    // gold rain visuals
    // ~8 spawns/s * 6 coins keeps the screen readable instead of a coin wall
    // H3: bayrak her karede gerçek duruma eşitlenmeliydi; aksi halde ilk
    // altın yağmurdan sonra tüm maç boyunca puanlar 2x kalıyordu.
    this.sim.goldRain = time < this.goldRainUntil;
    if (this.sim.goldRain && Math.random() < dt * 5) this.fx.coinRain(4);
  }

  private titleFor(): string {
    if (this.tideAmt > 0.2) return upper(this.locale, t(this.locale, 'tt.tide'));
    if (this.stormAmt > 0.2) return upper(this.locale, t(this.locale, 'tt.storm'));
    if (this.sim.boss?.alive) return upper(this.locale, t(this.locale, 'tt.boss'));
    return upper(this.locale, t(this.locale, 'tt.def'));
  }

  /* ---------------- sim tick ---------------- */
  tickSim(dt: number) {
    if (this.phase === 'intro') {
      for (const [id, a] of this.sim.avatars) this.prevPos.set(id, { x: a.x, y: a.y });
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'play';
        this.hud.clearScene();
        this.hud.setArenaHudVisible(true);
        this.hud.announce(t(this.locale, 'match.start'), this.dual ? t(this.cfg.locale.second, 'match.start') : undefined, 0xffe14d, 62);
      }
      return;
    }
    if (this.phase === 'play') {
      for (const [id, a] of this.sim.avatars) this.prevPos.set(id, { x: a.x, y: a.y });
      this.matchT += dt;
      this.sim.update(dt);
      this.maybeBoss();
      // lightning during storm
      if (this.stormAmt > 0.4) {
        this.lastLightning -= dt;
        if (this.lastLightning <= 0) {
          this.lastLightning = 0.7;
          const x = 120 + Math.random() * 840;
          const y = 500 + Math.random() * 500;
          this.fx.lightning(x, 0, y);
          for (const m of this.sim.monsters) if (m.alive && Math.hypot(m.x - x, m.y - y) < 90) m.hp -= 40;
          const alive = [...this.sim.avatars.values()].filter((a) => a.alive);
          if (alive.length) {
            for (const a of alive) {
              if (Math.hypot(a.x - x, a.y - y) < 120) {
                a.speedUntil = this.sim.time + 10;
                if (Math.random() < 0.3) {
                  const pool = Game.POWER_POOL;
                  this.grantPower(a, pool[(Math.random() * pool.length) | 0], true);
                }
              }
            }
          }
        }
      }
      if (this.sim.mercy && !this.sim.mercy.done) {
        this.hud.mercyTick(this.sim.mercy.until - this.sim.time);
      }
      // watch-time estimation: a viewer counts while they are within 90s of
      // their last event (matches TikTok's own engagement window closely enough)
      this.watchAcc = (this.watchAcc ?? 0) + dt;
      if (this.watchAcc >= 1) {
        const step = this.watchAcc;
        this.watchAcc = 0;
        for (const a of this.sim.avatars.values()) {
          if (this.sim.time - a.lastActive <= 90) {
            this.stats.watchSum += step;
            this.stats.watchCount++;
          }
        }
      }

      // Faz 2.3/3.2: savaş ısısı + son 60 saniye finali
      this.tornadoStep(dt);
      this.updateHeat();
      this.updateFinale();

      // idle-stream filler: simulated gifts so the arena never goes quiet
      if (this.autoGifts) {
        this.autoGiftTimer -= dt;
        if (this.autoGiftTimer <= 0) {
          this.autoGiftTimer = 1.4 + Math.random() * 3.2;
          this.spawnMockViewer(1);
          if (Math.random() < 0.75) {
            const tier = Math.random() < 0.04 ? 5 : Math.random() < 0.12 ? 4 : Math.random() < 0.3 ? 3 : Math.random() < 0.6 ? 2 : 1;
            this.ingest({
              type: 'gift', id: `auto-${this.mockSeq++}`, userId: `auto${(Math.random() * 40) | 0}`,
              name: this.mockName(), pic: null, giftName: `Auto${tier}`,
              diamonds: [1, 8, 99, 299, 1500][tier - 1], n: 1, repeatEnd: true,
            });
          }
        }
      }
      if (this.matchT >= this.duration) {
        this.phase = 'end';
        this.phaseT = this.cfg.match.endCountdownSec;
        this.hud.hideAnnouncements();
        this.hud.hideGiftStrip();
        this.hud.setArenaHudVisible(false);
        this.computeResults();
        this.sayAnnounce('match.end', upper(this.locale, t(this.locale, 'match.end')), this.dual ? upper(this.secondLocale, t(this.secondLocale, 'match.end')) : undefined, 0xff5b5b, 66);
        this.renderSceneTimer();
        this.ent.bossHide();
        audio.tick();
      }
      return;
    }
    // scenes
    for (const [id, a] of this.sim.avatars) this.prevPos.set(id, { x: a.x, y: a.y });
    this.sim.update(dt);
    this.phaseT -= dt;
    const prev = Math.ceil(this.phaseT + dt);
    if (prev !== Math.ceil(this.phaseT) && this.phase !== 'table') audio.tick();
    if (this.phaseT <= 0) this.advanceScene();
  }

  private advanceScene() {
    const from = this.phase;
    // result scenes own the screen: clear transient arena UI
    if (from !== 'play') { this.hud.hideAnnouncements(); this.hud.hideGiftStrip(); }
    this.nextPhase();
    if (from === 'end' && this.phase === 'table') {
      this.hud.clearScene();
      this.hud.mercyHide();
      this.hud.sceneTable(this.locale, this.lastTable.slice(0, 5).map((a) => ({
        userId: a.userId, name: a.name, kills: a.kills, damage: a.damage, score: a.score, streak: a.streak, bestStreak: a.bestStreak,
      })), this.globalRanking.slice().sort((x, y) => y.damage - x.damage));
    } else if (from === 'table' && this.phase === 'awards') {
      this.hud.clearScene();
      this.hud.sceneAwards(this.locale, this.awards, this.phaseT);
    } else if (from === 'awards' && this.phase === 'podium') {
      this.hud.clearScene();
      this.hud.scenePodium(this.locale, this.lastTable.slice(0, 3).map((a) => ({
        userId: a.userId, name: a.name, kills: a.kills, damage: a.damage, score: a.score, streak: a.streak, bestStreak: a.bestStreak,
      })), this.gifters, null);
      this.fx.confettiBurst(540, 700, 170);
      audio.fanfare();
    } else if (from === 'end' && this.phase === 'podium') { /* jump */ }
  }

  private maybeBoss() {
    if (!this.automation.boss) return; // otomasyon kapalı: boss yalnız konsoldan gelir
    // (a) sabit aralık modu: her bossEverySec saniyede bir boss (0 = kapalı)
    const every = Math.max(0, this.bossEverySec);
    if (every > 0) {
      if (this.matchT >= this.nextBossAt) {
        this.nextBossAt = this.matchT + every;
        this.spawnBossNow();
      }
    } else {
      // (b) varsayılan: maçın belirli yüzdelerinde boss
      const fracs = this.cfg.boss.fractions;
      for (let i = 0; i < fracs.length; i++) {
        if (this.bossSpawned[i]) continue;
        if (this.matchT / this.duration < fracs[i]) continue;
        this.bossSpawned[i] = true;
        this.spawnBossNow();
        break;
      }
    }
    // track hunter (top damage to boss)
    if (this.sim.boss?.alive) {
      let top = 0;
      for (const a of this.sim.avatars.values()) if (a.bossDamage > top) { top = a.bossDamage; this.hunterName = a.name; }
    }
  }

  /** Faz 3.4 — sahne otomasyonu: konsoldan açılıp kapanabilir. */
  automation = { boss: true, goldRain: true, night: true };
  /** 0 = maç yüzdeleriyle boss; >0 = bu kadar saniyede bir boss */
  bossEverySec = 0;
  private nextBossAt = 0;

  private spawnBossNow() {
    if (this.sim.boss?.alive) return;
    {
      const def = BOSSES[this.bossIdx % 2];
      this.bossIdx++;
      const fighters = this.sim.avatars.size;
      const hp = Math.round((this.cfg.boss.baseHp + fighters * this.cfg.boss.hpPerFighter) * def.hpMul);
      this.sim.boss = { name: def.key, x: 540, y: 620, hp, maxHp: hp, alive: true, specialCd: 7, top: '', topDmg: 0 };
      this.ent.bossShow(def.key, 540, 620);
      this.fx.shockwave(540, 620, def.key === 'kraken' ? 0xb98bff : 0xff8a3a, 520, 0.9);
      this.fx.flash(0.22);
      this.fx.shake.add(20);
      audio.roar();
      audio.intense = true;
      audio.syncMusicLayers();
      this.sayAnnounce('boss',
        `${upper(this.locale, t(this.locale, 'boss.spawn', { boss: '' }))} ${upper(this.locale, t(this.locale, `boss.${def.key}`))}`,
        this.dual ? upper(this.secondLocale, t(this.secondLocale, `boss.${def.key}`)) : undefined,
        0xff5b5b, 54);
    }
  }

  /** Secondary locale for dual-language subtitles: es <-> tr */
  private get secondLocale(): string {
    return this.locale.startsWith('tr') ? 'es-MX' : 'tr-TR';
  }

  /* ---------------- kills & streaks ---------------- */
  /** Announce on screen AND through the voice pack. */
  private sayAnnounce(key: string, main: string, sub?: string, color = 0xffffff, size = 56) {
    this.hud.announce(main, sub, color, size);
    audio.say(this.locale, key, main);
  }

  private onKill(killerId: string, victimId: string, streak: number, cut: number, dmg?: number, chain?: { x: number; y: number }[]) {
    const kk = this.sim.getAvatar(killerId);
    if (kk && chain?.length) {
      let px = kk.x, py = kk.y;
      for (const p of chain) {
        this.fx.arc(px, py, p.x, p.y, 0x6bb8ff);
        px = p.x; py = p.y;
      }
      this.fx.shake.add(7);
      audio.thunder();
    }
    const k = this.sim.getAvatar(killerId);
    const v = this.sim.getAvatar(victimId);
    audio.kill();
    if (v) {
      this.fx.deathBurst(v.x, v.y);
      this.world.splatter(v.x, v.y, 0x8c2b2b, 70, 16);
      this.fx.dmgNum(v.x, v.y, dmg ?? 30, (dmg ?? 30) >= 40);
      this.ent.avatar(victimId).flashAmt = 1;
    }
    const tr = this.secondLocale;
    if (cut >= 4 && k && v) {
      this.hud.announce(
        `${upper(this.locale, t(this.locale, 'cut', { killer: truncateNick(k.name, 10), victim: truncateNick(v.name, 10), n: cut }))}`,
        this.dual ? upper(tr, t(tr, 'cut', { killer: truncateNick(k.name, 10), victim: truncateNick(v.name, 10), n: cut })) : undefined,
        0xff9f1c, 40,
      );
      this.fx.star(k.x, k.y, 0xffd23f, 8);
      this.grantPower(k, 'reflect', true);
      this.fx.floatText(k.x, k.y - 70, `🪞 ${t(this.locale, 'power.reflect')}`, 0x9fd8ff, 28);
    }
    if ([5, 15, 30, 50].includes(streak)) {
      const key = `streak.${streak}`;
      this.sayAnnounce('streak',
        upper(this.locale, t(this.locale, key, { n: streak })),
        this.dual ? upper(tr, t(tr, key, { n: streak })) : undefined,
        0xc084fc, 64);
      this.fx.shake.add(streak >= 30 ? 20 : 11);
      this.fx.hitStop(streak >= 30 ? 150 : 80);
      audio.streak(streak);
      if (k) { this.fx.star(k.x, k.y, 0xc084fc, 10); this.fx.floatText(k.x, k.y - 60, `x${streak}`, 0xd9a8ff, 40); }
    } else if (streak >= 20) {
      this.hud.announce(
        upper(this.locale, t(this.locale, 'streak.any', { n: streak })),
        this.dual ? upper(tr, t(tr, 'streak.any', { n: streak })) : undefined,
        0xc084fc, 42,
      );
    }
    if (this.sim.mercy && !this.sim.mercy.done && this.sim.mercy.victim === victimId) {
      const vv = this.sim.getAvatar(victimId), kk = this.sim.getAvatar(killerId);
      if (vv && kk) {
        this.hud.mercyShow(vv.name, kk.name, vv.userId, kk.userId);
        this.sayAnnounce('mercy',
          upper(this.locale, t(this.locale, 'mercy', { name: truncateNick(vv.name, 12), s: '10' })),
          this.dual ? upper(tr, t(tr, 'mercy', { name: truncateNick(vv.name, 12), s: '10' })) : undefined,
          0x7b2ff7, 46);
        audio.duck(3);
      }
    }
  }

  private mercySaved(name: string) {
    this.stats.mercyRevives++;
    const tr = this.secondLocale;
    this.hud.announce(
      upper(this.locale, t(this.locale, 'mercy.saved', { name: truncateNick(name, 12) })),
      this.dual ? upper(tr, t(tr, 'mercy.saved', { name: truncateNick(name, 12) })) : undefined,
      0x2fe08a, 52,
    );
    this.hud.mercyHide();
    audio.fanfare();
  }

  /** Discrete sim events -> on-screen feedback. */
  private onSimEvent(e: { type: string; [k: string]: unknown }) {
    const tr = this.secondLocale;
    if (e.type === 'hit') { this.onHitEvent(e as unknown as HitEvent); return; }
    if (e.type === 'power') {
      const kind = String(e.kind);
      const meta = Game.POWER_META[kind];
      const a = this.sim.getAvatar(String(e.userId));
      if (a && meta) {
        // her güç kendi rengiyle parlar (Faz 2.5 görsel kimlik)
        this.fx.spawnRing(a.x, a.y, meta.color, 96);
        this.fx.burst(a.x, a.y, meta.color, 10, 200, 0.5, 22);
        // etiket dile baglanir: POWER_META.label Turkce oldugu icin
        // Ispanyolca yayinda Turkce metin siziyordu
        this.fx.floatText(a.x, a.y - 46, `${meta.icon} ${t(this.locale, `power.${kind}`)}`, meta.color, 26, 70);
      }
      return;
    }
    if (e.type === 'orbHit') {
      // yörünge yıldızı değdiği an: kıvılcım + ışık halkası
      const o = this.sim.getAvatar(String(e.owner));
      const hot = o ? this.sim.time < o.rageUntil : false;
      const x = Number(e.x), y = Number(e.y);
      this.fx.burst(x, y, hot ? 0xff7a5a : 0xffe6a0, 5, 190, 0.32, 16);
      this.fx.spawnRing(x, y, hot ? 0xffb0a0 : 0xfff0b0, 26);
      return;
    }
    if (e.type === 'bossPhase') { this.onBossPhase(Number(e.phase) || 2); return; }
    if (e.type === 'streakTier') return; // istemci zaten onKill'da işliyor
    if (e.type === 'castleDown') {
      this.fx.shockwave(540, 1004, 0xff5b5b, 620, 1.1);
      this.fx.shake.add(26);
      this.fx.flash(0.3);
      audio.meteor();
      this.sayAnnounce('match.end',
        upper(this.locale, t(this.locale, 'castle.down')),
        this.dual ? upper(tr, t(tr, 'castle.down')) : undefined,
        0xff5b5b, 62);
      this.hud.pushFeed(`${upper(this.locale, t(this.locale, 'castle'))} 0 HP`, 0xff5b5b);
    } else if (e.type === 'trap') {
      const v = this.sim.getAvatar(String(e.victim));
      if (!v) return;
      this.hud.announce(
        `${upper(this.locale, t(this.locale, 'boss.trap'))} ${truncateNick(v.name, 12)}`,
        this.dual ? upper(tr, t(tr, 'boss.trap')) : undefined,
        0xb06bff, 46,
      );
      this.fx.spawnRing(v.x, v.y, 0xb06bff, 70);
      this.fx.shake.add(9);
      this.fx.hitStop(90);
      audio.roar();
    } else if (e.type === 'bossDead') {
      const k = this.sim.getAvatar(String(e.killer));
      if (k) {
        this.fx.confettiBurst(k.x, k.y, 90);
        this.fx.star(k.x, k.y, 0xffd23f, 12);
        // boss kartı öne geçer (kuyruğun başına)
        this.queueHeroCard({
          name: k.name, userId: k.userId,
          desc: `${fmtNum(this.locale, k.score)} ${t(this.locale, 'points')}`,
          color: 0xb8901a,
        }, true);
      }
      this.stats.bossKillSec = this.stats.bossKillSec < 0 ? Math.round(this.matchT) : this.stats.bossKillSec;
      audio.intense = false;
      audio.syncMusicLayers();
      audio.fanfare();
    }
  }

  /** Vuruş geri bildirimi (Faz 1.3): kıvılcım + hasar sayısı + ses + mikro sarsıntı. */
  private hitBudget = 0;
  /** Sinematik kart kuyruğu: fırtınada kartlar sırayla görünür, üst üste binmez. */
  private heroQueue: HeroCardParams[] = [];
  private heroTimer = 0;
  /** Son JOIN GAME! başlığı (katılma seli kısması). */
  private lastJoinBanner = -99;
  /** Karta al, gerekirse kuyruğa koy (boss kartı öne geçer). */
  private queueHeroCard(p: HeroCardParams, priority = false) {
    if (priority) this.heroQueue.unshift(p);
    else this.heroQueue.push(p);
    if (this.heroQueue.length > HERO_QUEUE_MAX) {
      this.heroQueue.splice(priority ? 1 : 0, this.heroQueue.length - HERO_QUEUE_MAX);
    }
  }
  /** Her karede sıradaki kartın zamanı geldiyse göster. */
  private flushHeroQueue(dt: number) {
    if (this.heroTimer > 0) { this.heroTimer -= dt; return; }
    const p = this.heroQueue.shift();
    if (!p) return;
    this.hud.heroCard(p.name, p.userId, p.desc, p.color, p.icon, p.effect);
    this.heroTimer = HERO_CARD_SEC;
  }
  private onHitEvent(e: HitEvent) {
    // köprü/spam koruması: kare başına en fazla 8 kıvılcım
    if (this.hitBudget <= 0) return;
    this.hitBudget--;
    this.stats.hits++;
    const x = Number(e.x) || 0, y = Number(e.y) || 0;
    const victim = this.sim.getAvatar(e.victim);
    if (victim) this.ent.avatar(victim.userId).flashAmt = 1;
    const col = e.reflect ? 0x9fd8ff : e.victim === 'boss' ? 0xffb03a : e.crit ? 0xff7a3a : 0xfff3c4;
    this.fx.hitSpark(x, y, col, e.crit ? 10 : 5);
    if (e.crit) { this.fx.dmgNum(x, y, Number(e.dmg) || 0, true); this.fx.punchZoom(1.05); }
    else if (Number(e.dmg) >= 8) this.fx.dmgNum(x, y, Number(e.dmg) || 0, false);
    // ağır darbe: arenada kocaman BOOM yazısı (referans oyundaki etki)
    if (Number(e.dmg) >= BOOM_DMG) {
      this.fx.floatText(x, y - 70, 'BOOM!', 0xffa03a, 64, 110);
      this.fx.shockwave(x, y, 0xffb03a, 130, 0.45);
    }
    this.fx.shake.add(e.crit ? 6 : 1.6);
    audio.hit();
  }

  /** Boss faz geçişi (Faz 2.4): can barı kırılır, ekran sarsılır, müzik sertleşir. */
  private onBossPhase(phase: number) {
    const b = this.sim.boss;
    if (!b) return;
    this.bossPhase = phase;
    this.fx.shockwave(b.x, b.y, phase === 3 ? 0xff3b5c : 0xffa03a, 320, 0.7);
    this.fx.shake.add(14 + phase * 6);
    this.fx.flash(0.18);
    this.fx.hitStop(120);
    this.hud.announce(
      `${upper(this.locale, t(this.locale, 'boss.phase'))} ${phase}/3`,
      this.dual ? upper(this.secondLocale, t(this.secondLocale, 'boss.phase')) : undefined,
      phase === 3 ? 0xff5b5b : 0xffb03a, 52,
    );
    audio.roar();
    audio.intense = true;
    audio.syncMusicLayers();
  }

  /* ---------------- live input ---------------- */
  /** Bounded dedupe so a reconnecting bridge cannot replay old events. */
  private seenEvents = new Set<string>();
  private ingestDedupe(e: LiveEvent): boolean {
    if (!e.id) return true;
    if (this.seenEvents.has(e.id)) return false;
    this.seenEvents.add(e.id);
    if (this.seenEvents.size > 20000) {
      const first = this.seenEvents.values().next().value;
      if (first) this.seenEvents.delete(first);
    }
    return true;
  }

  ingest(raw: LiveEvent) {
    const e = sanitizeEvent(raw);
    if (!e) return;
    if (!this.ingestDedupe(e)) return;
    audio.ensure();
    if (e.type === 'join') {
      const isNew = !this.sim.getAvatar(e.userId);
      const a = this.ensureAvatar(e.userId, e.name, e.pic);
      this.hud.pushJoin(e.name, e.userId);
      this.stats.viewers = Math.max(this.stats.viewers, this.sim.avatars.size);
      // JOIN GAME!: ilk katılımda sinematik giriş (referans menü #1).
      // Katılma selinde banner spam'i olmasın diye 6sn kısma var.
      if (isNew && a.alive) {
        if (this.sim.time - this.lastJoinBanner > 6) {
          this.lastJoinBanner = this.sim.time;
          this.skillShow('skill.join', 0x51d651, e.name);
        }
        this.fx.spawnRing(a.x, a.y, 0x51d651, 90);
        this.fx.star(a.x, a.y - 40, 0x51d651, 8);
        audio.ui();
      }
      void a;
    } else if (e.type === 'follow') {
      const a = this.ensureAvatar(e.userId, e.name, e.pic);
      a.streak += 1; a.lastActive = this.sim.time;
      this.fx.floatText(a.x, a.y - 70, '★', 0xffd23f, 40);
      this.fx.star(a.x, a.y - 40, 0xffd23f, 6);
    } else if (e.type === 'like') {
      const a = this.ensureAvatar(e.userId, e.name, e.pic);
      a.likeCount += e.n ?? 1;
      const cur = this.likeAcc.get(e.userId) ?? 0;
      const tot = cur + (e.n ?? 1);
      this.likeAcc.set(e.userId, tot % 10);
      if (tot >= 10) {
        a.speedUntil = this.sim.time + 5;
        this.fx.floatText(a.x, a.y - 70, '⚡', 0x39d0ff, 38);
      }
    } else if (e.type === 'chat') {
      const cmd = normalizeCommand(e.text ?? '');
      const a = this.ensureAvatar(e.userId, e.name, e.pic);
      if (cmd === 'shield') {
        if ((this.cdShield.get(e.userId) ?? -99) + this.cfg.cooldowns.shieldSec < this.sim.time) {
          this.cdShield.set(e.userId, this.sim.time);
          a.shieldUntil = this.sim.time + this.cfg.cooldowns.shieldDurSec;
          this.fx.spawnRing(a.x, a.y, 0x39d0ff, 60);
          this.fx.floatText(a.x, a.y - 70, '🛡', 0x39d0ff, 40);
          audio.ui();
        }
      } else if (cmd === 'fire') {
        if ((this.cdFire.get(e.userId) ?? -99) + this.cfg.cooldowns.fireRingSec < this.sim.time) {
          this.cdFire.set(e.userId, this.sim.time);
          this.sim.fireRing(e.userId);
          this.fx.shockwave(a.x, a.y, 0xffd23f, 150, 0.4);
          audio.shot();
        }
      } else if (cmd === 'power') {
        if ((this.cdPower.get(e.userId) ?? -999) + 30 < this.sim.time) {
          this.cdPower.set(e.userId, this.sim.time);
          const pool = Game.POWER_POOL;
          this.grantPower(a, pool[(Math.random() * pool.length) | 0]);
        }
      } else if (cmd === 'respond') {
        if (this.sim.mercyRespond(e.userId)) this.mercySaved(e.name);
      } else if (cmd === 'team') {
        // H5: bekleme süresi yoktu; seyirci chat spam'leyerek sınırsız kalkan
        // + hasar alabiliyordu. Diğer komutlarla aynı koruma.
        if ((this.cdTeam.get(e.userId) ?? -999) + TEAM_COOLDOWN_SEC >= this.sim.time) {
          this.hud.pushFeed(`⚔ ${truncateNick(e.name, 10)}: bekleniyor…`, 0x9fe3ff);
        } else {
          this.cdTeam.set(e.userId, this.sim.time);
          this.applyTeamChoice(a, normalizeTeam(e.text ?? ''));
        }
      } else if (cmd === 'help') {
        this.hud.announce(
          t(this.locale, 'cmd.help'),
          this.dual ? t(this.secondLocale, 'cmd.help') : undefined,
          0x9fe3ff, 40,
        );
        this.hud.pushFeed(`💬 ${truncateNick(e.name, 12)}: ${t(this.locale, 'cmd.help')}`, 0x9fe3ff);
      } else if ((e.text ?? '').toLowerCase().includes('deleteme')) {
        this.removeViewer(e.userId);
      }
    } else if (e.type === 'gift') {
      if (!e.repeatEnd) { this.comboAnim(e); return; }
      this.applyGift(e);
    } else if (e.type === 'share') {
      this.ensureAvatar(e.userId, e.name, e.pic);
    }
  }

  /**
   * Faz 3.5 — takım seçimi: seyirci kırmızıya maviyi, maviye kırmızıyı vurur.
   * Ritim hissi verir: kalabalık iki tarafa dağılır, seyirci etkileşir.
   */
  teamScore: Record<'rojo' | 'azul', number> = { rojo: 0, azul: 0 };
  private applyTeamChoice(a: AvatarState, team: Team) {
    const T = this.sim.time;
    if (team) {
      this.teamScore[team] += 1;
      this.stats.teamPicks++;
      // dostuna kalkan, düşmana hasar
      a.shieldUntil = Math.max(a.shieldUntil, T + 5);
      const color = team === 'rojo' ? 0xff5b5b : 0x3fb6ff;
      this.fx.spawnRing(a.x, a.y, color, 70);
      this.fx.floatText(a.x, a.y - 70, team === 'rojo' ? '🔴' : '🔵', color, 38);
      audio.ui();
      // rakip taraftaki en yakın düşmana küçük hasar
      let best: AvatarState | null = null;
      let bd = 260;
      for (const o of this.sim.avatars.values()) {
        if (!o.alive || o.userId === a.userId) continue;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        this.sim.dealDamage(a.userId, best.userId, 15);
        this.ent.avatar(best.userId).flashAmt = 1;
        this.fx.hitSpark(best.x, best.y, color, 6);
      }
      this.hud.pushFeed(
        `⚔️ ${truncateNick(a.name, 10)} → ${team === 'rojo' ? '🔴 ROJO' : '🔵 AZUL'} (${this.teamScore.rojo}-${this.teamScore.azul})`,
        color,
      );
      // takım dengesi büyükse arena tonu
      if (this.teamScore.rojo + this.teamScore.azul > 0 && (this.teamScore.rojo + this.teamScore.azul) % 10 === 0) {
        this.sayAnnounce('team',
          `🔴 ${this.teamScore.rojo} — ${this.teamScore.azul} 🔵`,
          undefined, 0xffd23f, 50);
      }
      return;
    }
    // renk verilmedi: oyuncunun rengi ne ise rastgele bir hedef seç
    this.applyTeamChoice(a, Math.random() < 0.5 ? 'rojo' : 'azul');
  }

  /**
   * Faz 3.3 — köprü durumu. Maç KESİNİYLE devam eder; yalnızca ekranda
   * kısa bir uyarı görünür ve konsol kırmızıya döner. Geri gelince
   * telemetri notu düşülür, oyuncular yerinde kalır.
   */
  private bridgeOk = true;
  private bridgeSince = 0;
  bridgeStatus(ok: boolean) {
    const tr = this.secondLocale;
    this.bridgeSince = performance.now();
    if (ok === this.bridgeOk) return;
    this.bridgeOk = ok;
    this.stats.bridgeDrops += ok ? 0 : 1;
    if (ok) {
      this.hud.announce(
        upper(this.locale, t(this.locale, 'bridge.back')),
        this.dual ? upper(tr, t(tr, 'bridge.back')) : undefined,
        0x2fe08a, 44,
      );
      audio.ui();
    } else {
      this.hud.announce(
        upper(this.locale, t(this.locale, 'bridge.down')),
        this.dual ? upper(tr, t(tr, 'bridge.down')) : undefined,
        0xffa03a, 44,
      );
      this.hud.pushFeed(`⚠ ${t(this.locale, 'bridge.down')}`, 0xffa03a);
      audio.ui();
    }
  }
  get bridgeConnected() { return this.bridgeOk; }

  removeViewer(userId: string) {
    this.sim.avatars.delete(userId);
    this.ent.removeAvatar(userId);
    this.picCache.delete(userId);
    this.hud.pushFeed(`🗑 ${t(this.locale, 'deleted', { name: '' })}`.trim() || '🗑', 0x9fe3ff);
  }

  ensureAvatar(userId: string, name: string, pic: string | null): AvatarState {
    let a = this.sim.getAvatar(userId);
    if (!a) {
      if (this.sim.avatars.size >= this.cfg.match.maxFighters) {
        let worstId: string | null = null, oldest = Infinity;
        for (const [id, v] of this.sim.avatars) if (v.lastActive < oldest) { oldest = v.lastActive; worstId = id; }
        // H4: 60 kişi doluyken YENİ izleyicinin hediyesi haritada ilk sıradaki
        // (ölü olabilecek) RASTGELE bir oyuncuya yazılıyordu. Şimdi en eski
        // izleyici yerine geçilir; o da çok yeniyse izleyici izleyici kalır.
        if (worstId) this.removeViewer(worstId);
        else {
          // Sadece taze oyuncular varsa arena dolu demektir: yeni gelen oyuncu
          // sadece seyirci olur, kimsenin bedenine hediye/isabet yazılmaz.
          const spectator = this.sim.makeAvatar(userId, name, pic);
          spectator.alive = false; spectator.hp = 0;
          return spectator;
        }
      }
      a = this.sim.makeAvatar(userId, name, pic);
      this.sim.addAvatar(a);
      this.joinedAt.set(userId, this.sim.time);
      this.prevPos.set(userId, { x: a.x, y: a.y });
      this.ent.avatar(userId);
      // squash/stretch spawn pop
      const v = this.ent.avatar(userId);
      v.root.scale.set(0.1);
      tweener.to(v.root, 'scale', 1, 0.5, { ease: Ease.outBack });
      this.fx.respawnWave(a.x, a.y);
    } else {
      a.name = name;
      if (pic && pic !== a.pic) { a.pic = pic; this.refreshPic(userId); }
      a.lastActive = this.sim.time;
    }
    return a;
  }

  private comboAnim(e: LiveEvent) {
    const a = this.sim.getAvatar(e.userId);
    if (a) {
      this.fx.floatText(a.x, a.y - 90, `${upper(this.locale, t(this.locale, 'combo', { n: e.n ?? 1 }))}`, 0xc084fc, 28, 40);
    }
  }

  applyGift(e: LiveEvent) {
    const def = this.gifts.lookup(e.giftName);
    const tier = giftTier(e.diamonds ?? def?.diamonds ?? 1);
    if (def && !def.enabled) {
      this.hud.pushFeed(`🚫 ${truncateNick(e.name, 12)} ${def.icon} ${def.name}`, 0x8fa0c8);
      return; // konsoldan kapatılmış hediye oyuna karışmaz
    }
    this.stats.gifts[tier - 1]++;
    this.lastEventUser = { id: e.userId, name: e.name };
    const g = this.gifters.find((x) => x.userId === e.userId);
    if (g) { g.diamonds += e.diamonds ?? 0; g.name = e.name; }
    else this.gifters.push({ userId: e.userId, name: e.name, diamonds: e.diamonds ?? 0 });
    this.gifters.sort((x, y) => y.diamonds - x.diamonds);
    this.gifters = this.gifters.slice(0, 5);
    const now = performance.now() / 1000;
    const arr = (this.comboAt.get(e.userId) ?? []).filter((ts) => now - ts < 10);
    arr.push(now); this.comboAt.set(e.userId, arr);
    const cm = comboMult(arr.length);

    this.goal += (e.diamonds ?? 1) * cm;
    if (this.goal >= this.goalTarget) {
      this.goal = 0;
      this.goalTarget = Math.round(this.goalTarget * this.cfg.gifts.goalGrowth);
      // Faz 3.4: altın yağmur otomasyonu kapalıysa yine sürer, sadece görsel/duyuru olmaz
      if (this.automation.goldRain) {
        this.goldRainUntil = this.sim.time + this.cfg.gifts.goldRainSec;
        this.sim.goldRain = true;
      }
      const tr = this.secondLocale;
      this.sayAnnounce('goldrain',
        upper(this.locale, t(this.locale, 'goldrain')),
        this.dual ? upper(tr, t(tr, 'goldrain')) : undefined,
        0xffd23f, 72);
      this.fx.confettiBurst(540, 640, 140);
      this.fx.flash(0.3);
      this.fx.hitStop(150);
      this.fx.shake.add(16);
      audio.fanfare();
      audio.intense = true;
      audio.syncMusicLayers();
      if (this.stats.goalFillSec < 0) this.stats.goalFillSec = Math.round(this.matchT);
    }

    const a = this.ensureAvatar(e.userId, e.name, e.pic);
    if (!a.alive) {
      const q = this.pendingGifts.get(e.userId) ?? [];
      q.push(e); this.pendingGifts.set(e.userId, q);
      if (this.sim.mercy?.victim === e.userId && !this.sim.mercy.done && this.sim.mercyRespond(e.userId)) {
        this.flushPending(e.userId); this.mercySaved(e.name);
      }
      this.hud.pushFeed(`🎁 ${truncateNick(e.name, 12)} ${e.giftName ?? ''} (${t(this.locale, 'queued', { s: '' }).trim() || 'en cola'})`, 0x9fe3ff);
      return;
    }
    // kayıtlı eylem varsa kademe yerine o çalışır (hediye -> komut eşleme)
    if (def && def.action !== 'tier') this.applyGiftAction(a, e, def.action);
    else this.applyTierEffect(a, e, tier);
    if (arr.length >= 2) {
      const tr = this.secondLocale;
      this.hud.announce(
        upper(this.locale, t(this.locale, 'combo', { n: arr.length })),
        this.dual ? upper(tr, t(tr, 'combo', { n: arr.length })) : undefined,
        0xc084fc, 44,
      );
    }
    audio.gift(tier);
    this.fx.burst(a.x, a.y, 0xffd23f, 12 + tier * 8, 300, 0.7, 24 + tier * 4, tier >= 4 ? 2 : 0, 200);
    this.fx.spawnRing(a.x, a.y, 0xffd23f, 50 + tier * 18);
    this.fx.shake.add(3 + tier * 3);
    this.hud.pushFeed(`🎁 ${truncateNick(e.name, 12)} ×${fmtNum(this.locale, e.diamonds ?? 0)}💎 ${e.giftName ?? ''}${cm > 1 ? ` ×${cm}` : ''}`, tier >= 4 ? 0xffd23f : 0xffffff);
    // Faz 1.4: HER hediye büyük kahraman kartı + isim şeridi (T4+ daha da büyük)
    const color = tier === 5 ? 0x2b9bd9 : tier === 4 ? 0xff7b00 : tier === 3 ? 0xc084fc : tier === 2 ? 0x2fb85a : 0x3fb6d8;
    // kademe hediyesinde etiket zaten başlıkta var; sadece özel eylemlerde göster
    const effect = def && def.action !== 'tier' ? (Game.ACTION_LABEL[def.action] ?? def.action) : '';
    this.queueHeroCard({
      name: e.name, userId: e.userId,
      desc: `${t(this.locale, `gift.t${tier}`)} ◆${fmtNum(this.locale, e.diamonds ?? 0)}${cm > 1 ? ` ×${cm}` : ''}`,
      color, icon: def?.icon ?? '🎁', effect,
    });
    if (tier >= 4) {
      this.fx.confettiBurst(a.x, a.y, tier === 5 ? 70 : 40);
      this.fx.punchZoom(1.04);
    }
  }

  /** Kademe varsayılan etkisi (T1-T5). */
  private applyTierEffect(a: AvatarState, e: LiveEvent, tier: number) {
    const T = this.sim.time;
    if (tier === 1) { a.hp = Math.min(a.maxHp, a.hp + 30); a.streak += 1; }
    if (tier === 2) { a.streak += 5; a.speedUntil = T + 10; this.randomPower(a); }
    if (tier === 3) {
      a.shieldUntil = T + 8; a.doubleUntil = T + 3;
      this.randomPower(a);
      if (Math.random() < 0.5) this.grantPower(a, 'frost');
    }
    if (tier === 4) { this.meteorFx(e, a); this.grantPower(a, 'rage', true); }
    if (tier === 5) { this.tornadoFx(e, a); this.grantPower(a, 'ghost', true); this.sim.spawnClone(e.userId); }
  }

  /**
   * Skill vitrini: büyük çizgi-roman başlığı + gönderen adı.
   * Referans oyunun (AvatarBattle) mantığı: her hediye isimli bir SKILL'dir.
   */
  private skillShow(key: string, color: number, sender: string) {
    const tr = this.secondLocale;
    this.hud.skillBanner(
      upper(this.locale, t(this.locale, key)),
      this.dual
        ? `${truncateNick(sender, 14)} · ${upper(tr, t(tr, key))}`
        : truncateNick(sender, 14),
      color,
    );
  }

  /** Canlı düşmanlar (sahibi hariç, karıştırılmış). */
  private foesOf(userId: string): AvatarState[] {
    const list = [...this.sim.avatars.values()].filter((o) => o.alive && o.userId !== userId);
    for (let i = list.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /** Kayıtlı hediye eylemi: hediye -> komut/güç eşlemesi buradan çalışır. */
  private applyGiftAction(a: AvatarState, e: LiveEvent, action: GiftAction) {
    const T = this.sim.time;
    switch (action) {
      case 'tier': this.applyTierEffect(a, e, giftTier(e.diamonds ?? 1)); break;
      case 'shield':
        a.shieldUntil = T + 10;
        this.fx.spawnRing(a.x, a.y, 0x39d0ff, 60);
        this.fx.floatText(a.x, a.y - 70, '🛡', 0x39d0ff, 40);
        audio.ui();
        break;
      case 'fire':
        this.sim.fireRing(e.userId);
        this.fx.shockwave(a.x, a.y, 0xffd23f, 150, 0.4);
        audio.shot();
        break;
      case 'power': this.randomPower(a); break;
      case 'heal':
        a.hp = Math.min(a.maxHp, a.hp + 50);
        this.fx.floatText(a.x, a.y - 70, '✚50', 0x2fb85a, 36);
        this.fx.burst(a.x, a.y, 0x2fb85a, 12, 200, 0.6, 20, 0, -60);
        break;
      case 'speed':
        a.speedUntil = T + 10;
        this.fx.floatText(a.x, a.y - 70, '⚡', 0x39d0ff, 38);
        break;
      case 'meteor': this.meteorFx(e, a); break;
      case 'tornado': this.tornadoFx(e, a); break;
      case 'streak5':
        a.streak += 5; a.bestStreak = Math.max(a.bestStreak, a.streak);
        this.fx.floatText(a.x, a.y - 70, '+5', 0xc084fc, 36);
        break;
      case 'ignore': break; // sayaçlar işler, bedene dokunulmaz
      // ---- isimli SKILL'ler (referans: AvatarBattle 12'li menü) ----
      case 'lightning': { // LIGHTNING STORM: 5 yıldırım, rastgele düşmanlara
        this.skillShow('skill.lightning', 0x6fc4ff, e.name);
        const targets = this.foesOf(e.userId).slice(0, 5);
        for (const o of targets) {
          this.fx.lightning(o.x, 0, o.y);
          this.sim.dealDamage(e.userId, o.userId, 25);
          this.ent.avatar(o.userId).flashAmt = 1;
        }
        this.fx.flash(0.18);
        this.fx.shake.add(10);
        audio.thunder();
        break;
      }
      case 'randomAttack': { // RANDOM ATTACK: tek rastgele düşmana suikast
        const target = this.foesOf(e.userId)[0];
        this.skillShow('skill.randomAttack', 0xff8a3c, e.name);
        if (target) {
          this.fx.lightning(target.x, 0, target.y);
          this.fx.spawnRing(target.x, target.y, 0xff8a3c, 90);
          this.sim.dealDamage(e.userId, target.userId, 70);
          this.ent.avatar(target.userId).flashAmt = 1;
          this.fx.hitStop(140);
          this.fx.punchZoom(1.06);
          this.fx.shake.add(12);
          audio.thunder();
        }
        break;
      }
      case 'powerAttack': { // POWER ATTACK: en güçlü düşmana infaz vuruşu
        const foes = this.foesOf(e.userId);
        const best = foes.sort((p, q) => q.hp - p.hp)[0];
        this.skillShow('skill.powerAttack', 0xff3b5c, e.name);
        if (best) {
          this.fx.meteor(best.x, best.y);
          this.sim.dealDamage(e.userId, best.userId, 120);
          this.ent.avatar(best.userId).flashAmt = 1;
          this.fx.hitStop(180);
          this.fx.punchZoom(1.08);
          this.fx.flash(0.22);
          this.fx.shake.add(14);
          audio.meteor();
        }
        break;
      }
      case 'shieldAll': { // SHIELD DEFENSE: sahip + yakın dostlara kubbe
        this.skillShow('skill.shieldAll', 0x39d0ff, e.name);
        const covered = [a];
        for (const o of this.sim.avatars.values()) {
          if (!o.alive || o.userId === e.userId) continue;
          if (Math.hypot(o.x - a.x, o.y - a.y) > 220) continue;
          covered.push(o);
        }
        for (const o of covered) {
          o.shieldUntil = Math.max(o.shieldUntil, T + 8);
          this.fx.spawnRing(o.x, o.y, 0x39d0ff, 70);
        }
        this.fx.floatText(a.x, a.y - 70, '🛡️', 0x39d0ff, 44);
        audio.ui();
        break;
      }
      case 'absorb': { // ABSORB (Adsorpsiyon): hasarı cana çevirme aurası
        this.skillShow('skill.absorb', 0xc44dff, e.name);
        a.absorbUntil = T + 10;
        this.fx.spawnRing(a.x, a.y, 0xc44dff, 80);
        this.fx.burst(a.x, a.y, 0xc44dff, 14, 200, 0.6, 20, 0, -60);
        this.fx.floatText(a.x, a.y - 70, '🌀', 0xc44dff, 40);
        audio.ui();
        break;
      }
      case 'healBig': { // LARGE HEALTH: tam can + yeşil patlama
        this.skillShow('skill.healBig', 0x2fb85a, e.name);
        a.hp = a.maxHp;
        this.fx.floatText(a.x, a.y - 70, `✚${a.maxHp}`, 0x2fb85a, 38);
        this.fx.burst(a.x, a.y, 0x2fb85a, 18, 240, 0.7, 22, 0, -60);
        this.fx.spawnRing(a.x, a.y, 0x2fb85a, 80);
        audio.fanfare();
        break;
      }
      case 'levelup': { // LEVEL UP (küçük): +1 seviye
        const lv = this.sim.levelUp(e.userId, 1);
        this.skillShow('skill.levelup', 0xffd23f, e.name);
        if (lv > 0) {
          this.fx.floatText(a.x, a.y - 70, `⭐Lv${lv}`, 0xffd23f, 40);
          this.fx.star(a.x, a.y - 40, 0xffd23f, 10);
          this.fx.spawnRing(a.x, a.y, 0xffd23f, 80);
          audio.fanfare();
        }
        break;
      }
      case 'levelupBig': { // LEVEL UP (büyük): +2 seviye
        const lv = this.sim.levelUp(e.userId, 2);
        this.skillShow('skill.levelupBig', 0x6fb7ff, e.name);
        if (lv > 0) {
          this.fx.floatText(a.x, a.y - 70, `⭐Lv${lv}`, 0x6fb7ff, 44);
          this.fx.star(a.x, a.y - 40, 0x6fb7ff, 14);
          this.fx.spawnRing(a.x, a.y, 0x6fb7ff, 100);
          this.fx.confettiBurst(a.x, a.y - 40, 30);
          audio.fanfare();
        }
        break;
      }
      case 'speedSmall': { // SPEED UP (hafif): 6sn hız
        this.skillShow('skill.speedSmall', 0x51d651, e.name);
        a.speedUntil = T + 6;
        this.fx.floatText(a.x, a.y - 70, '🥾💨', 0x51d651, 38);
        audio.ui();
        break;
      }
      case 'speedBig': { // SPEED UP (mükemmel): 15sn hız + iz
        this.skillShow('skill.speedBig', 0xff9f1c, e.name);
        a.speedUntil = T + 15;
        this.fx.floatText(a.x, a.y - 70, '🚀💨', 0xff9f1c, 42);
        this.fx.burst(a.x, a.y, 0xff9f1c, 12, 260, 0.5, 18);
        audio.streak(15);
        break;
      }
      case 'aoeAttack': { // AOE ATTACK: arena geneli halka hasar
        this.skillShow('skill.aoeAttack', 0xff6a1e, e.name);
        this.fx.shockwave(540, 960, 0xff6a1e, 700, 0.8);
        this.fx.shockwave(540, 960, 0xffd23f, 500, 0.6);
        this.fx.flash(0.25);
        this.fx.hitStop(150);
        this.fx.shake.add(16);
        for (const o of this.sim.avatars.values()) {
          if (o.userId === e.userId || !o.alive) continue;
          this.sim.dealDamage(e.userId, o.userId, 35);
          this.ent.avatar(o.userId).flashAmt = 1;
        }
        audio.meteor();
        audio.intense = true;
        audio.syncMusicLayers();
        break;
      }
      default:
        // rage | ghost | vamp | giant | reflect | chain | frost | clone
        if (action === 'clone') this.sim.spawnClone(e.userId);
        else this.grantPower(a, action);
        break;
    }
  }

  private meteorFx(e: LiveEvent, a: AvatarState) {
    this.fx.meteor(a.x, a.y);
    for (const o of this.sim.avatars.values()) {
      if (o.userId === e.userId || !o.alive) continue;
      if (Math.hypot(o.x - a.x, o.y - a.y) < 90) {
        this.sim.dealDamage(e.userId, o.userId, 60);
        this.ent.avatar(o.userId).flashAmt = 1;
      }
    }
  }
  private tornadoFx(e: LiveEvent, a: AvatarState) {
    a.shieldUntil = this.sim.time + 5;
    this.fx.tornado(e.userId, (id) => {
      const v = this.sim.getAvatar(id);
      return v ? { x: v.x, y: v.y } : null;
    });
    // H6: 300ms'de bir setInterval 5 saniye boyunca ~17 tik atıyordu (dokümana
    // göre 3). Hem denge bozuktu hem de sim durumunu sabit adımın dışından
    // değiştiriyordu. Artık tam olarak TORNADO_TICKS darbe, sabit adımda.
    this.tornadoTicks.set(e.userId, { left: TORNADO_TICKS, cd: 0, hitAt: new Map() });
  }

  /** Hortum darbeleri — sabit adımda çalışır (deterministik). */
  private tornadoStep(dt: number) {
    if (!this.tornadoTicks.size) return;
    for (const [id, t] of this.tornadoTicks) {
      const src = this.sim.getAvatar(id);
      if (!src?.alive || t.left <= 0) { this.tornadoTicks.delete(id); continue; }
      t.cd -= dt;
      if (t.cd > 0) continue;
      t.cd = TORNADO_TICK_SEC;
      t.left--;
      for (const o of this.sim.avatars.values()) {
        if (o.userId === id || !o.alive) continue;
        // aynı kişiye art arda iki darbe gitmesin
        if ((t.hitAt.get(o.userId) ?? -99) > this.sim.time - 1.2) continue;
        if (Math.hypot(o.x - src.x, o.y - src.y) > TORNADO_RADIUS) continue;
        t.hitAt.set(o.userId, this.sim.time);
        this.sim.dealDamage(id, o.userId, TORNADO_DMG);
        this.ent.avatar(o.userId).flashAmt = 1;
        this.fx.hitSpark(o.x, o.y, 0x9fe8ff, 5);
      }
    }
  }

  /** Hediye eylemi -> kartta görünen kısa etiket (Faz 1.4). */
  static readonly ACTION_LABEL: Record<string, string> = {
    tier: '', ignore: '', power: 'PODER', shield: 'KALKAN', fire: 'FUEGO',
    meteor: 'METEORO', tornado: 'TORNADO', heal: 'VIDA', speed: 'VELOCIDAD',
    streak5: 'RACHA +5', rage: 'ÖFKE', ghost: 'HAYALET', vamp: 'VAMPİR',
    giant: 'DEV', reflect: 'YANSITMA', chain: 'ZİNCİR', frost: 'DONMA', clone: 'KLON',
    lightning: 'YILDIRIM', randomAttack: 'SUİKAST', powerAttack: 'SÜPER SALDIRI',
    shieldAll: 'KUBBE', absorb: 'EMİLİM', healBig: 'TAM CAN',
    levelup: 'SEVİYE+1', levelupBig: 'SEVİYE+2',
    speedSmall: 'HIZ', speedBig: 'SÜPER HIZ', aoeAttack: 'ALAN SALDIRISI',
  };
  /** Güç vitrini: renk + ikon + süre + parçacık stili. */
  static readonly POWER_META: Record<string, { color: number; icon: string; label: string; total: number; fx: string }> = {
    fuerza: { color: 0xd9382b, icon: '💪', label: 'FUERZA', total: 15, fx: 'crack' },
    velocidad: { color: 0x2b9bd9, icon: '⚡', label: 'VELOCIDAD', total: 15, fx: 'streak' },
    veneno: { color: 0x51d651, icon: '☠', label: 'VENENO', total: 15, fx: 'drip' },
    curacion: { color: 0x2fb85a, icon: '✚', label: 'CURACIÓN', total: 15, fx: 'rise' },
    doble: { color: 0xd99a1b, icon: '✌', label: 'DOBLE', total: 15, fx: 'star' },
    rage: { color: 0xff5a1e, icon: '🔥', label: 'ÖFKE', total: 8, fx: 'flame' },
    ghost: { color: 0xbfefff, icon: '👻', label: 'HAYALET', total: 4, fx: 'wisp' },
    vamp: { color: 0xc44dff, icon: '🧛', label: 'VAMPİR', total: 10, fx: 'drip' },
    giant: { color: 0xffd23f, icon: '🦣', label: 'DEV', total: 8, fx: 'shock' },
    reflect: { color: 0x9fd8ff, icon: '🪞', label: 'YANSITMA', total: 6, fx: 'shard' },
    chain: { color: 0x6bb8ff, icon: '⚡', label: 'ZİNCİR', total: 10, fx: 'bolt' },
    frost: { color: 0xa8e8ff, icon: '❄', label: 'DONMA', total: 3, fx: 'crystal' },
    shield: { color: 0x39d0ff, icon: '🛡', label: 'KALKAN', total: 10, fx: 'shield' },
  };
  /** T2+ rastgele havuz (imza efektler hariç hepsi). */
  static readonly POWER_POOL = ['fuerza', 'velocidad', 'veneno', 'curacion', 'doble',
    'rage', 'ghost', 'vamp', 'giant', 'reflect', 'chain', 'frost'] as const;

  /**
   * Merkezi güç dağıtımı: sim süresini kurar, görseli + sesi + yazıyı basar.
   * Hediyeler, seri kesme, boss, şimşek, !güç komutu — hepsi buradan geçer.
   */
  grantPower(a: AvatarState, kind: string, quiet = false): boolean {
    if (!a?.alive) return false;
    if (kind === 'clone') {
      if (!this.sim.spawnClone(a.userId)) return false;
      const meta = { color: 0xb9a7ff, icon: '👥' };
      if (!quiet) {
        this.fx.spawnRing(a.x, a.y, meta.color, 70);
        this.fx.burst(a.x, a.y, meta.color, 16, 240, 0.6, 20, 0, 120);
        this.fx.floatText(a.x, a.y - 70, `${meta.icon} ${truncateNick(a.name, 10)}`, meta.color, 30);
        audio.gift(2);
      }
      a.lastActive = this.sim.time;
      return true;
    }
    if (!this.sim.grant(a.userId, kind)) return false;
    const meta = (Game.POWER_META as Record<string, { color: number; icon: string; total: number }>)[kind];
    if (!meta) return true;
    if (!quiet) {
      this.fx.spawnRing(a.x, a.y, meta.color, 60);
      this.fx.burst(a.x, a.y, meta.color, 14, 260, 0.6, 20, 0, 160);
      const label = t(this.locale, `power.${kind}`);
      this.fx.floatText(a.x, a.y - 70, `${meta.icon} ${label}`, meta.color, 30);
      if (kind === 'frost') {
        this.fx.burst(a.x, a.y, 0xbfefff, 26, 340, 0.8, 24, 0, 60);
        this.fx.shake.add(8);
        audio.thunder();
      } else if (kind === 'giant') {
        this.fx.shockwave(a.x, a.y, meta.color, 240, 0.6);
        this.fx.shake.add(10);
        audio.roar();
      } else if (kind === 'ghost') {
        audio.ui();
      } else {
        audio.gift(2);
      }
    }
    return true;
  }

  private randomPower(a: AvatarState) {
    const pool = Game.POWER_POOL;
    this.grantPower(a, pool[(Math.random() * pool.length) | 0]);
  }

  flushPending(userId: string) {
    const q = this.pendingGifts.get(userId);
    if (!q?.length) return;
    this.pendingGifts.delete(userId);
    q.forEach((e) => this.applyGiftCore(e));
  }
  private applyGiftCore(e: LiveEvent) {
    const a = this.sim.getAvatar(e.userId);
    if (!a || !a.alive) return;
    const def = this.gifts.lookup(e.giftName);
    if (def && !def.enabled) return;
    const tier = giftTier(e.diamonds ?? def?.diamonds ?? 1);
    if (def && def.action !== 'tier') { this.applyGiftAction(a, e, def.action); return; }
    if (tier === 1) { a.hp = Math.min(a.maxHp, a.hp + 30); a.streak += 1; }
    if (tier === 2) { a.streak += 5; this.grantPower(a, 'velocidad', true); this.randomPower(a); }
    if (tier === 3) { this.grantPower(a, 'shield', true); this.grantPower(a, 'doble', true); this.randomPower(a); }
    if (tier === 4) this.grantPower(a, 'rage', true);
    if (tier === 5) { this.grantPower(a, 'ghost', true); this.sim.spawnClone(e.userId); }
    this.fx.burst(a.x, a.y, 0xffd23f, 14, 280, 0.6, 22, 0, 180);
  }

  /* ================= admin / streamer console API ================= */

  setLocale(l: string) {
    this.locale = l;
    this.hud.setLocale(l, this.dual);
    this.hud.announce(upper(l, t(l, 'match.start')), undefined, 0x39d0ff, 44);
  }
  getLocale() { return this.locale; }
  setDual(on: boolean) { this.dual = on; this.hud.setLocale(this.locale, on); }
  setDuration(sec: number) { this.duration = sec; this.cfg.match.durationSec = sec; }
  setPaused(p: boolean) { this.paused = p; }
  togglePause() { this.paused = !this.paused; return this.paused; }
  setAutoGifts(on: boolean) { this.autoGifts = on; if (!on) this.autoGiftTimer = 0; }
  resetMatch() { this.matchNo = 1; this.globalRanking = []; this.startMatch(); }
  nextPhaseNow() { this.phaseT = 0.02; }

  forcePhase(p: 'intro' | 'play' | 'end' | 'table' | 'awards' | 'podium') {
    if (p === 'play') { this.phase = 'play'; this.hud.clearScene(); this.hud.setArenaHudVisible(true); return; }
    if (p === 'end') { this.phase = 'end'; this.phaseT = this.cfg.match.endCountdownSec; this.hud.setArenaHudVisible(false); this.hud.hideAnnouncements(); this.hud.hideGiftStrip(); this.computeResults(); this.endSceneShown = true; this.hud.sceneEnd(this.phaseT, this.locale); return; }
    if (p === 'table') { this.computeResults(); this.phase = 'end'; this.phaseT = 0.02; return; }
    if (p === 'awards') { this.computeResults(); this.phase = 'table'; this.phaseT = 0.02; return; }
    if (p === 'podium') { this.computeResults(); this.phase = 'awards'; this.phaseT = 0.02; return; }
    if (p === 'intro') { this.startMatch(); }
  }
  /** Spawn the next boss immediately instead of waiting for its time slot. */
  forceBoss() { this.spawnBossNow(); }
  forceEvent(kind: 'tide' | 'storm' | 'goldrain') {
    if (kind === 'tide') this.sim.tideUntil = this.sim.time + 14;
    if (kind === 'storm') this.sim.stormUntil = this.sim.time + 9;
    if (kind === 'goldrain') { this.goldRainUntil = this.sim.time + 10; this.hud.announce(upper(this.locale, t(this.locale, 'goldrain')), undefined, 0xffd23f, 66); }
  }

  private MOCK_NAMES = ['Amine', 'Elif', 'Carlos', 'María', 'Mehmet', 'Sofía', 'Emre', 'Lucía', 'Ayşe', 'Diego', 'Zeynep', 'Juan', 'Fatma', 'Pedro', 'Deniz', 'Selin', 'Camila', 'Kaan'];
  mockName() { return this.MOCK_NAMES[(Math.random() * this.MOCK_NAMES.length) | 0]; }

  /** Spawn n simulated viewers (joins) with deterministic ids. */
  spawnMockViewer(n = 1, prefix = 'mock') {
    for (let i = 0; i < n; i++) {
      const k = this.mockSeq++;
      const id = `${prefix}${k % 400}`;
      this.ingest({ type: 'join', id: `${prefix}-j${k}`, userId: id, name: this.mockName(), pic: null });
    }
  }
  /** Inject a gift as if a viewer sent it. */
  injectGift(tier: 1 | 2 | 3 | 4 | 5, userId?: string) {
    const id = userId ?? `mock${this.mockSeq % 400}`;
    const pool = this.gifts.enabled().filter((d) => giftTier(d.diamonds) === tier);
    const pick = pool.length ? pool[(Math.random() * pool.length) | 0] : null;
    this.ingest({
      type: 'gift', id: `cons-${this.mockSeq++}`, userId: id,
      name: this.sim.getAvatar(id)?.name ?? this.mockName(), pic: null,
      giftName: pick?.name ?? `Gift T${tier}`,
      diamonds: pick?.diamonds ?? [1, 8, 99, 299, 1500][tier - 1],
      n: 1, repeatEnd: true,
    });
  }
  /** Kayıtlı hediyeyi ismiyle enjekte et (konsol test düğmeleri için). */
  injectGiftById(giftId: string, userId?: string) {
    const def = this.gifts.lookup(giftId);
    if (!def) return;
    const id = userId ?? `mock${this.mockSeq % 400}`;
    this.ingest({
      type: 'gift', id: `cons-${this.mockSeq++}`, userId: id,
      name: this.sim.getAvatar(id)?.name ?? this.mockName(), pic: null,
      giftName: def.name, diamonds: def.diamonds, n: 1, repeatEnd: true,
    });
  }
  /** Send a chat line as if a viewer typed it (runs command normalization). */
  injectChat(text: string, userId?: string) {
    const id = userId ?? `mock${this.mockSeq % 400}`;
    this.ingest({
      type: 'chat', id: `cons-c${this.mockSeq++}`, userId: id,
      name: this.sim.getAvatar(id)?.name ?? this.mockName(), pic: null, text,
    });
  }
  injectLike(n = 10) {
    const id = `mock${this.mockSeq % 400}`;
    this.ingest({ type: 'like', id: `cons-l${this.mockSeq++}`, userId: id, name: this.sim.getAvatar(id)?.name ?? this.mockName(), pic: null, n });
  }
  deleteViewer(userId: string) { this.removeViewer(userId); }

  async setFacecam(on: boolean, test = false) {
    if (!on) { this.facecam.stop(); this.hud.setFacecam(false); return false; }
    const strip = this.cfg.facecam?.stripPx ?? 100;
    const ok = test ? (await this.facecam.startTestPattern(strip), true) : await this.facecam.start(strip);
    this.hud.setFacecam(ok);
    return ok;
  }

  setZonesVisible(on: boolean) { this.hud.showZones(on); }
  setHudInfo(on: boolean) { this.hudInfoOn = on; this.hud.showInfo(on); }

  statsSnapshot() {
    const perf = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      fps: Math.round(this.fps),
      frameMs: +this.frameEMA.toFixed(2),
      quality: +this.quality.toFixed(2),
      phase: this.phase,
      phaseLeft: +Math.max(0, this.phaseT).toFixed(1),
      matchNo: this.matchNo,
      matchLeft: +Math.max(0, this.duration - this.matchT).toFixed(1),
      avatars: this.sim.avatars.size,
      bullets: this.sim.bullets.length,
      monsters: this.sim.monsters.length,
      boss: this.sim.boss?.alive ? `${this.sim.boss.name} ${Math.round(this.sim.boss.hp)}/${this.sim.boss.maxHp}` : null,
      castle: Math.round(this.sim.castleHp),
      goal: `${Math.floor(this.goal)}/${Math.floor(this.goalTarget)}`,
      gifters: this.gifters.length,
      goldRain: this.sim.time < this.goldRainUntil,
      tide: this.tideAmt > 0.1, storm: this.stormAmt > 0.1,
      paused: this.paused,
      facecam: this.facecam.active,
      heapMB: perf ? +(perf.usedJSHeapSize / 1048576).toFixed(1) : null,
      audioFiles: this.audioLoaded,
      telemetryRows: this.telemetry.length,
      avgWatchSec: this.stats.watchCount ? +(this.stats.watchSum / this.stats.watchCount).toFixed(1) : 0,
      globalTop: this.globalRanking.slice().sort((a, b) => b.damage - a.damage).slice(0, 3).map((g) => g.name),
    };
  }

  telemetryCsv(): string {
    const head = 'match,viewers,gifts,goalFillSec,mercyRevives,bossKillSec,avgWatchSec';
    if (!this.telemetry.length) return head + '\n';
    return head + '\n' + this.telemetry.map((r) => Object.values(r).join(',')).join('\n') + '\n';
  }
  clearRanking() {
    this.globalRanking = [];
    this.telemetry = [];
    try { localStorage.removeItem('tac-telemetry'); } catch { /* noop */ }
  }

  /* ---------------- phases rendering ---------------- */
  renderSceneTimer() {
    if (this.phase === 'end' && !this.endSceneShown) { this.endSceneShown = true; this.hud.sceneEnd(this.phaseT, this.locale); }
  }
}
