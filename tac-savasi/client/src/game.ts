// Main game orchestrator: match loop, entity rendering, live input, scoring.
import * as PIXI from 'pixi.js';
import {
  Sim, giftTier, normalizeCommand, t, fmtNum, upper, truncateNick,
  comboMult, defaultSimConfig, type LiveEvent, type AvatarState,
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

type Phase = 'intro' | 'play' | 'end' | 'table' | 'awards' | 'podium';

interface Cfg {
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
const GIFTS_UI = [
  { icon: '🌹', key: 'gift.t1', value: '1' },
  { icon: '🍦', key: 'gift.t2', value: '5' },
  { icon: '💖', key: 'gift.t3', value: '50' },
  { icon: '☄️', key: 'gift.t4', value: '200' },
  { icon: '🌪️', key: 'gift.t5', value: '1000' },
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
  bossSpawned: boolean[] = [];
  hunterName = '';
  gifters: { userId: string; name: string; diamonds: number }[] = [];
  likeAcc = new Map<string, number>();
  comboAt = new Map<string, number[]>();
  cdShield = new Map<string, number>();
  cdFire = new Map<string, number>();
  pendingGifts = new Map<string, LiveEvent[]>();
  joinedAt = new Map<string, number>();
  globalRanking: { name: string; damage: number; crowns: number; matches: number }[] = [];
  prevPos = new Map<string, { x: number; y: number }>();
  quality = 1;
  frameEMA = 16;
  stripTimer = 0;
  leaderId: string | null = null;
  leaderTitle = '';
  lastTs = 0;
  acc = 0;
  lastLightning = 0;
  telemetry: Record<string, number | string>[] = [];
  stats = { gifts: [0, 0, 0, 0, 0], goalFillSec: -1, mercyRevives: 0, bossKillSec: -1, viewers: 0, watchSum: 0, watchCount: 0 };
  awards: { title: string; name: string; detail: string; userId?: string; color: number }[] = [];
  private endSceneShown = false;
  private hudInfoOn = false;
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
    this.locale = cfg.locale.default;
    this.dual = cfg.locale.dual;
    this.duration = cfg.match.durationSec;
  }

  async boot(el: HTMLElement) {
    // asset manifest first: real art/audio overrides the procedural fallbacks
    await assets.load('assets').catch((e) => console.warn('[tac] assets', e));
    await this.loadAudioAssets();

    const { DOMAdapter, BrowserAdapter } = PIXI as unknown as { DOMAdapter: { set(a: unknown): void }; BrowserAdapter: unknown };
    try { DOMAdapter.set(BrowserAdapter); } catch { /* already set */ }
    this.app = new PIXI.Application();
    const initPr = this.app.init({ width: 1080, height: 1920, background: 0x06233b, antialias: true, preference: 'webgl' });
    await Promise.race([initPr, new Promise<never>((_, r) => setTimeout(() => r(new Error('pixi-init-timeout')), 12000))]);
    el.appendChild(this.app.canvas);
    this.fit();
    window.addEventListener('resize', () => this.fit());

    this.camera.addChild((this.world = new World()).root);
    this.ent = new EntityLayer();
    this.camera.addChild(this.ent.root);
    this.fx = new FX(this.camera);
    this.hud = new Hud();
    this.hud.initLayers();
    this.hud.facecamSlot.addChild(this.facecam.root);
    this.hud.pic = (id, name) => this.picOf(id, name);
    this.app.stage.addChild(this.camera, this.hud.root);

    this.sim = new Sim({ ...defaultSimConfig(), avatarHp: this.cfg.avatar.hp }, (Math.random() * 1e9) | 0);
    this.sim.onKill = (k) => this.onKill(k.killer, k.victim, k.streak, k.cutStreak, k.dmg);
    this.sim.onEvent = (e) => this.onSimEvent(e);
    this.sim.onRespawn = (userId) => this.flushPending(userId);

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
    const skipped: string[] = [];
    for (const [name, rel] of names) {
      const file = rel.split('/').pop()!;
      // only try what the manifest lists (or everything when it has no audio yet)
      const listed = !files.length || files.some((f) => f.includes(file) || f.includes(file.replace(/\.\w+$/, '')));
      if (!listed) { skipped.push(name); continue; }
      const stem = rel.replace(/\.[^./]+$/, '');
      const base = file.replace(/\.[^.]+$/, '');
      // accept any common extension so you can drop in a WAV or MP3 without renaming
      const tried = [rel, ...EXT.filter((e) => !rel.endsWith(e)).map((e) => `${stem}${e}`)];
      for (const cand of tried) {
        if (await audio.load(name, `assets/${cand}`)) { n++; break; }
      }
      if (!audio.has(name) && file.startsWith('sfx-')) skipped.push(name);
    }
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
    this.stats = { gifts: [0, 0, 0, 0, 0], goalFillSec: -1, mercyRevives: 0, bossKillSec: -1, viewers: this.sim.avatars.size, watchSum: 0, watchCount: 0 };
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

  private frameBody() {
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
    this.fx.applyCamera(this.camera, this.world.root, dt);
    if (this.hudInfoOn) this.hud.setInfoText(`${Math.round(this.fps)}fps · ${this.phase} · ${this.sim.avatars.size} · m${this.sim.bullets.length}`);
  }

  private renderWorld(dt: number, alpha: number) {
    const time = this.sim.time;
    // environment
    this.tideAmt = this.tideAmt + (Math.min(1, Math.max(0, (this.sim.tideUntil - time) / 14)) - this.tideAmt) * Math.min(1, dt * 2.4);
    this.stormAmt = this.stormAmt + (Math.min(1, Math.max(0, (this.sim.stormUntil - time) / 9)) - this.stormAmt) * Math.min(1, dt * 2.6);
    const progress = Math.max(0, Math.min(1, this.matchT / this.duration));
    this.world.dayProgress = progress;
    // warm grade fades in through the middle of the match, then night takes over
    const sunset = Math.max(0, Math.min(1, (progress - 0.35) / 0.3)) * 0.8;
    this.world.update(dt, { tide: this.tideAmt, storm: this.stormAmt, sunset, arena: this.arena });
    this.world.castleDamage(this.sim.castleHp / this.sim.castleMax);

    // leader
    let lead: AvatarState | null = null;
    for (const a of this.sim.avatars.values()) if (a.alive && (!lead || a.streak > lead.streak)) lead = a;
    this.leaderId = lead?.userId ?? null;
    this.leaderTitle = this.titleFor();

    // avatars
    for (const [id, a] of this.sim.avatars) {
      const v = this.ent.avatar(id);
      const prev = this.prevPos.get(id) ?? { x: a.x, y: a.y };
      const powers: { label: string; color: number; left: number }[] = [];
      if (time < a.fuerzaUntil) powers.push({ label: t(this.locale, 'power.fuerza'), color: 0xd9382b, left: a.fuerzaUntil - time });
      if (time < a.speedUntil) powers.push({ label: t(this.locale, 'power.velocidad'), color: 0x2b9bd9, left: a.speedUntil - time });
      if (time < a.poisonUntil) powers.push({ label: t(this.locale, 'power.veneno'), color: 0x7b3fc4, left: a.poisonUntil - time });
      if (time < a.healUntil) powers.push({ label: t(this.locale, 'power.curacion'), color: 0x2fb85a, left: a.healUntil - time });
      if (time < a.doubleUntil) powers.push({ label: t(this.locale, 'power.doble'), color: 0xd99a1b, left: a.doubleUntil - time });
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

    // bullets + monsters + boss
    this.ent.syncBullets(this.sim.bullets);
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
        this.hud.showGiftStrip(GIFTS_UI.map((g) => ({
          icon: g.icon, name: t(this.locale, g.key), value: `◆ ${g.value}+`,
          color: [0xff9ec4, 0x9fd8ff, 0xffb3c8, 0xffc46b, 0x9fe8ff][GIFTS_UI.indexOf(g)],
        })), 6);
      }
    }
    // gold rain visuals
    // ~8 spawns/s * 6 coins keeps the screen readable instead of a coin wall
    if (time < this.goldRainUntil && Math.random() < dt * 5) this.fx.coinRain(4);
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
            for (const a of alive) if (Math.hypot(a.x - x, a.y - y) < 120) a.speedUntil = this.sim.time + 10;
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
    const fracs = this.cfg.boss.fractions;
    for (let i = 0; i < fracs.length; i++) {
      if (this.bossSpawned[i]) continue;
      if (this.matchT / this.duration < fracs[i]) continue;
      this.bossSpawned[i] = true;
      this.spawnBossNow();
      break;
    }
    // track hunter (top damage to boss)
    if (this.sim.boss?.alive) {
      let top = 0;
      for (const a of this.sim.avatars.values()) if (a.bossDamage > top) { top = a.bossDamage; this.hunterName = a.name; }
    }
  }

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

  private onKill(killerId: string, victimId: string, streak: number, cut: number, dmg?: number) {
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
        this.hud.heroCard(k.name, k.userId, `${fmtNum(this.locale, k.score)} ${t(this.locale, 'points')}`, 0xb8901a);
      }
      this.stats.bossKillSec = this.stats.bossKillSec < 0 ? Math.round(this.matchT) : this.stats.bossKillSec;
      audio.intense = false;
      audio.syncMusicLayers();
      audio.fanfare();
    }
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

  ingest(e: LiveEvent) {
    if (!this.ingestDedupe(e)) return;
    audio.ensure();
    if (e.type === 'join') {
      const a = this.ensureAvatar(e.userId, e.name, e.pic);
      this.hud.pushJoin(e.name, e.userId);
      this.stats.viewers = Math.max(this.stats.viewers, this.sim.avatars.size);
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
      } else if (cmd === 'respond') {
        if (this.sim.mercyRespond(e.userId)) this.mercySaved(e.name);
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
        if (worstId && this.sim.time - oldest > 20) this.removeViewer(worstId);
        else return this.sim.getAvatar([...this.sim.avatars.keys()][0])!;
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
    const tier = giftTier(e.diamonds ?? 1);
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
      this.goldRainUntil = this.sim.time + this.cfg.gifts.goldRainSec;
      this.sim.goldRain = true;
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
    const T = this.sim.time;
    if (tier === 1) { a.hp = Math.min(a.maxHp, a.hp + 30); a.streak += 1; }
    if (tier === 2) { a.streak += 5; a.speedUntil = T + 10; this.randomPower(a); }
    if (tier === 3) { a.shieldUntil = T + 8; a.doubleUntil = T + 3; this.randomPower(a); }
    if (tier === 4) this.meteorFx(e, a);
    if (tier === 5) this.tornadoFx(e, a);
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
    if (tier >= 4) this.hud.heroCard(e.name, e.userId, `${t(this.locale, `gift.t${tier}`)} ◆${fmtNum(this.locale, e.diamonds ?? 0)}`, tier === 5 ? 0x2b9bd9 : 0xff7b00);
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
    const start = performance.now();
    const ticks = setInterval(() => {
      const src = this.sim.getAvatar(e.userId);
      if (!src?.alive || performance.now() - start > 5000) { clearInterval(ticks); return; }
      for (const o of this.sim.avatars.values()) {
        if (o.userId === e.userId || !o.alive) continue;
        if (Math.hypot(o.x - src.x, o.y - src.y) < 75) {
          this.sim.dealDamage(e.userId, o.userId, 15);
          this.ent.avatar(o.userId).flashAmt = 1;
        }
      }
    }, 300);
  }

  private randomPower(a: AvatarState) {
    const T = this.sim.time;
    const r = Math.random();
    if (r < 0.2) a.fuerzaUntil = T + 15;
    else if (r < 0.4) a.speedUntil = T + 15;
    else if (r < 0.6) a.doubleUntil = T + 15;
    else if (r < 0.8) a.shieldUntil = T + 10;
    else a.healUntil = T + 15;
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
    const tier = giftTier(e.diamonds ?? 1);
    const T = this.sim.time;
    if (tier === 1) { a.hp = Math.min(a.maxHp, a.hp + 30); a.streak += 1; }
    if (tier === 2) { a.streak += 5; a.speedUntil = T + 10; this.randomPower(a); }
    if (tier >= 3) a.doubleUntil = T + 3;
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
    if (p === 'end') { this.phase = 'end'; this.phaseT = this.cfg.match.endCountdownSec; this.hud.setArenaHudVisible(false); this.hud.hideAnnouncements(); this.hud.hideGiftStrip(); this.computeResults(); this.hud.sceneEnd(this.phaseT, this.locale); return; }
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
    this.ingest({
      type: 'gift', id: `cons-${this.mockSeq++}`, userId: id,
      name: this.sim.getAvatar(id)?.name ?? this.mockName(), pic: null,
      giftName: `Gift T${tier}`, diamonds: [1, 8, 99, 299, 1500][tier - 1], n: 1, repeatEnd: true,
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
