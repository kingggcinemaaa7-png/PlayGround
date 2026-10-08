import { Game } from './game.js';
import { Net } from './net.js';
import { AdminConsole } from './admin/console.js';
import { assets } from './assets.js';
import { audio } from './audio.js';
import { showSplash, splashError, collectDiag, fetchWithTimeout } from './boot.js';
import type { LiveEvent } from '@tac/shared';

async function loadConfig() {
  try {
    const r = await fetchWithTimeout('/config.json', 4000);
    if (r.ok) return await r.json();
  } catch { /* fallback */ }
  return {
    match: { durationSec: 1500, introSec: 3, endCountdownSec: 10, tableSec: 10, awardsSec: 8, podiumSec: 7, maxFighters: 60 },
    avatar: { hp: 100 }, gifts: { goalStart: 500, goalGrowth: 1.5, goldRainSec: 10 },
    cooldowns: { shieldSec: 20, shieldDurSec: 10, fireRingSec: 10 },
    mercy: { minStreak: 10, windowSec: 10 },
    boss: { fractions: [0.1, 0.3, 0.5, 0.7, 0.88], baseHp: 1200, hpPerFighter: 60 },
    locale: { default: 'es-MX', dual: true, second: 'tr-TR' },
    facecam: { stripPx: 100, mirror: true },
    admin: { enabled: true, hotkey: 'F1', defaultBridge: 'ws://localhost:8081' },
  };
}

// NOTE: no top-level await in this module — Rollup code-splits Pixi into
// chunks with cyclic imports back to the entry, and TLA would deadlock them.
function setStage(s: string) {
  (window as unknown as { __tacBootStage?: string }).__tacBootStage = s;
}

function main(): Promise<void> {
  return (async () => {
    const q = new URLSearchParams(location.search);
    const safemode = q.get('safemode') === '1';
    setStage('modul basladi');
    showSplash(safemode);
    if (q.get('duration')) localStorage.setItem('tac-duration', q.get('duration')!);

    setStage('ayar okunuyor');
    const cfg = await loadConfig();
    const durOverride = Number(localStorage.getItem('tac-duration') ?? q.get('duration') ?? 0);
    if (durOverride > 0) cfg.match.durationSec = durOverride;
    if (q.get('locale')) cfg.locale.default = q.get('locale')!;

    const game = new Game(cfg);
    game.loadGifts();
    (window as unknown as { __game?: Game; __assets?: unknown }).__game = game;
    (window as unknown as { __assets?: unknown; __audio?: unknown }).__assets = assets;
    (window as unknown as { __audio?: unknown }).__audio = audio;
    try {
      setStage('oyun aciliyor');
      await game.boot(document.getElementById('wrap')!, safemode, setStage);
    } catch (err) {
      console.error('[tac] boot failed', err);
      (window as unknown as { __tacError?: unknown }).__tacError = String(err);
      let configState = '?';
      try {
        const r = await fetchWithTimeout('/config.json', 3000, { method: 'HEAD' });
        configState = r.ok ? 'ok' : `HTTP ${r.status}`;
      } catch (e) { configState = `erisim yok (${String(e).slice(0, 60)})`; }
      let manifestState = '?';
      try {
        const r = await fetchWithTimeout('assets/assets.manifest.json', 3000, { method: 'HEAD' });
        manifestState = r.ok ? 'ok' : `HTTP ${r.status}`;
      } catch (e) { manifestState = `erisim yok (${String(e).slice(0, 60)})`; }
      splashError('Açılış hatası', err, collectDiag({ config: configState, manifest: manifestState }));
      throw err;
    }

    // seed a few bots so screen is never empty
    const BOTS = ['Amine', 'Elif', 'Carlos', 'María', 'Mehmet', 'Sofía', 'Emre', 'Lucía'];
    BOTS.forEach((n, i) => game.ingest({ type: 'join', id: `seed-${i}`, userId: `seed${i}`, name: n, pic: null }));

    const bridge = new URLSearchParams(location.search).get('bridge')
      ?? (cfg.admin?.defaultBridge ?? `ws://${location.hostname}:8081`);
    const net = new Net(bridge, (e: LiveEvent) => game.ingest(e));
    // Faz 3.3: kopma/bağlanma duyurusu — oyun ASLA durmaz, sadece haber verir
    net.onStatus = (ok) => game.bridgeStatus(ok);
    net.connect();

    // streamer control console (never captured: lives outside the canvas)
    const clean = new URLSearchParams(location.search).get('clean') === '1';
    let admin: AdminConsole | null = null;
    if (cfg.admin?.enabled !== false && !clean) {
      admin = new AdminConsole({ game, net, defaultBridge: bridge });
    } else {
      // streaming mode: full-bleed canvas, no console chrome
      document.body.classList.add('clean');
    }

    // in-app mock panel (?mock=1)
    if (q.get('mock') === '1') {
      const panel = document.getElementById('mock')!;
      panel.style.display = 'flex';
      const mk = (label: string, fn: () => void) => {
        const b = document.createElement('button'); b.textContent = label;
        b.onclick = () => { fn(); };
        panel.appendChild(b);
      };
      let k = 0;
      mk('+10 join', () => { for (let i = 0; i < 10; i++) game.ingest({ type: 'join', id: `m${Date.now()}-${k++}`, userId: `u${(Math.random() * 90) | 0}`, name: BOTS[k % BOTS.length], pic: null }); });
      mk('gift storm', () => { for (let i = 0; i < 30; i++) game.ingest({ type: 'gift', id: `g${Date.now()}-${i}`, userId: `seed${i % 8}`, name: BOTS[i % 8], pic: null, giftName: ['Rose', 'Heart', 'Motor', 'Yacht'][i % 4], diamonds: [1, 10, 299, 1500][i % 4], n: 1, repeatEnd: true }); });
      mk('T5 tornado', () => game.ingest({ type: 'gift', id: `t5${Date.now()}`, userId: 'seed0', name: BOTS[0], pic: null, giftName: 'Yacht', diamonds: 1500, n: 1, repeatEnd: true }));
      mk('boss now', () => { (game as unknown as { matchT: number }).matchT = cfg.match.durationSec * 0.3 - 1; });
      mk('likes', () => { for (let i = 0; i < 20; i++) game.ingest({ type: 'like', id: `l${Date.now()}-${i}`, userId: `seed${i % 8}`, name: BOTS[i % 8], pic: null, n: 10 }); });
      mk('!fuego', () => game.ingest({ type: 'chat', id: `c${Date.now()}`, userId: 'seed1', name: BOTS[1], pic: null, text: '!fuego' }));
      mk('!kalkan', () => game.ingest({ type: 'chat', id: `c${Date.now()}-k`, userId: 'seed2', name: BOTS[2], pic: null, text: '!kalkan' }));
      mk('mute', () => { import('./audio.js').then((m) => m.audio.toggleMute()); });
    }

    // console readout
    let acc = 0;
    let last = performance.now();
    const pump = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      if (admin && acc >= 0.2) { admin.tick(acc, net.connected); acc = 0; }
      requestAnimationFrame(pump);
    };
    requestAnimationFrame(pump);
  })();
}

main().catch((e) => console.error('[tac] main', e));
