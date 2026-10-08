// Streamer control console. Lives OUTSIDE the game canvas so it is never
// captured by TikTok LIVE Studio. Toggle with F1 (or ?clean=1 to hide).
import type { Game } from '../game.js';
import type { Net } from '../net.js';
import { audio } from '../audio.js';
import { assets } from '../assets.js';

const STYLE = `
#tac-console{position:fixed;top:0;right:0;width:330px;max-height:100vh;overflow-y:auto;z-index:50;
  background:#0e1426f2;border-left:1px solid #2a3554;color:#e8ecf8;font:13px/1.45 "Trebuchet MS",system-ui,sans-serif;
  padding:10px 12px 24px;box-shadow:-8px 0 30px #0008;backdrop-filter:blur(6px)}
#tac-console.hidden{display:none}
#tac-console h2{font:900 15px/1 "Arial Black",Impact,sans-serif;margin:14px 0 8px;color:#ffd23f;letter-spacing:.5px;
  border-bottom:1px solid #2a3554;padding-bottom:5px}
#tac-console .row{display:flex;gap:6px;align-items:center;margin:5px 0;flex-wrap:wrap}
#tac-console label{display:flex;gap:6px;align-items:center;flex:1;min-width:120px}
#tac-console select,#tac-console input[type=text]{flex:1;min-width:0;background:#16203a;color:#e8ecf8;
  border:1px solid #33406a;border-radius:7px;padding:5px 7px;font:inherit}
#tac-console button{flex:1;background:#1b2748;color:#e8ecf8;border:1px solid #33406a;border-radius:7px;
  padding:6px 8px;font:inherit;font-weight:600;font-size:12px;line-height:1.2;cursor:pointer;transition:transform .06s,background .15s}
#tac-console button:hover{background:#27365f}
#tac-console button:active{transform:translateY(1px)}
#tac-console button.on{background:#1f7a4d;border-color:#2fe08a;color:#fff}
#tac-console button.warn{background:#7a2a2a;border-color:#ff6b6b}
#tac-console .grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
#tac-console .tiers button:nth-child(1){background:#7a2f52}
#tac-console .tiers button:nth-child(2){background:#2b5f8a}
#tac-console .tiers button:nth-child(3){background:#8a2f5f}
#tac-console .tiers button:nth-child(4){background:#8a5a1f}
#tac-console .tiers button:nth-child(5){background:#1f6a8a}
#tac-console .stats{background:#0a1020;border:1px solid #2a3554;border-radius:8px;padding:8px;font:11.5px/1.5 ui-monospace,Menlo,Consolas,monospace}
#tac-console .stats b{color:#7ee8ff;font-weight:700}
#tac-console .stats .st{display:flex;gap:8px;justify-content:space-between;border-bottom:1px dotted #223}
#tac-console .stats .st span:first-child{color:#8fa0c8}
#tac-console .stats .st span:last-child{color:#e8ecf8;text-align:right}
#tac-console .stats .bad{color:#ff6b6b}
#tac-console .dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#ff4d4d;margin-right:6px}
#tac-console .dot.ok{background:#2fe08a}
#tac-console input[type=range]{width:100%}
#tac-console .mini{color:#8fa0c8;font-size:11px;margin:2px 0}
#tac-toggle{position:fixed;top:8px;right:8px;z-index:51;background:#0e1426cc;color:#ffd23f;
  border:1px solid #33406a;border-radius:8px;padding:5px 9px;font:700 12px "Trebuchet MS",system-ui;cursor:pointer}
`;

export interface ConsoleOpts {
  game: Game;
  net: Net;
  defaultBridge: string;
}

export class AdminConsole {
  el: HTMLElement;
  private statsEl!: HTMLElement;
  private bridgeInput!: HTMLInputElement;
  private dot!: HTMLElement;
  private timer = 0;
  visible = true;
  private lastStatus = false;

  constructor(private o: ConsoleOpts) {
    if (!document.getElementById('tac-console-style')) {
      const st = document.createElement('style');
      st.id = 'tac-console-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    this.el = document.createElement('aside');
    this.el.id = 'tac-console';
    this.el.innerHTML = this.html();
    document.body.appendChild(this.el);
    this.bind();
    const toggle = document.createElement('button');
    toggle.id = 'tac-toggle';
    toggle.textContent = '⚙ Yönetim (F1)';
    toggle.onclick = () => this.toggle();
    document.body.appendChild(toggle);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' || (e.ctrlKey && e.shiftKey && e.key === 'C')) { e.preventDefault(); this.toggle(); }
    });
  }

  private html(): string {
    const g = this.o.game;
    return `
<div class="row"><span class="dot" id="tac-dot"></span><b id="tac-conn">TikTok köprüsü</b></div>
<div class="row"><input type="text" id="tac-bridge" value="${this.o.defaultBridge}" /><button id="tac-connect">Bağlan</button></div>

<h2>YAYIN</h2>
<div class="row">
  <label><input type="checkbox" id="tac-pause"/> <span>Duraklat</span></label>
  <label><input type="checkbox" id="tac-auto"/> <span>Otomatik hediye</span></label>
</div>
<div class="row">
  <select id="tac-locale">
    <option value="es-MX"${g.getLocale() === 'es-MX' ? ' selected' : ''}>Español (México)</option>
    <option value="es-ES"${g.getLocale() === 'es-ES' ? ' selected' : ''}>Español (España)</option>
    <option value="tr-TR"${g.getLocale() === 'tr-TR' ? ' selected' : ''}>Türkçe</option>
    <option value="en"${g.getLocale() === 'en' ? ' selected' : ''}>English</option>
  </select>
  <label><input type="checkbox" id="tac-dual" checked/> <span>Çift dil</span></label>
</div>
<div class="row">
  <label><input type="checkbox" id="tac-cam"/> <span>Kamera şeridi</span></label>
  <button id="tac-camtest">Kamera testi</button>
</div>
<div class="mini" id="tac-caminfo"></div>

<h2>SES</h2>
<div class="row"><label>Genel <input type="range" id="tac-vol" min="0" max="100" value="55"/></label></div>
<div class="row"><label>Müzik <input type="range" id="tac-volm" min="0" max="100" value="35"/></label></div>
<div class="row"><label>Efekt <input type="range" id="tac-vols" min="0" max="100" value="60"/></label></div>
<div class="row"><button id="tac-mute">Sessiz (M)</button><button id="tac-test">Ses çal</button></div>

<h2>MAÇ</h2>
<div class="row">
  <select id="tac-dur">
    <option value="90">1:30</option>
    <option value="300">5:00</option>
    <option value="1500" selected>25:00</option>
  </select>
  <button id="tac-reset">Yeni maç</button>
</div>
<div class="row grid">
  <button data-phase="play">OYUN</button>
  <button data-phase="end">BİTİŞ</button>
  <button data-phase="table">TABLO</button>
  <button data-phase="awards">ÖDÜLLER</button>
  <button data-phase="podium">PODYUM</button>
  <button data-phase="intro">İNTRO</button>
</div>

<h2>OLAYLAR</h2>
<div class="row grid">
  <button id="tac-boss">BOSS</button>
  <button id="tac-tide">GELGİT</button>
  <button id="tac-storm">FIRTINA</button>
  <button id="tac-gold">ALTIN YAĞMUR</button>
  <button id="tac-zones">GÜVENLİ BÖLGE</button>
  <button id="tac-hudinfo">HUD BİLGİ</button>
</div>
<div class="row">
  <button id="tac-join1">+1 izleyici</button>
  <button id="tac-join10">+10 izleyici</button>
  <button id="tac-join50">+50 izleyici</button>
</div>

<h2>HEDİYE ENJEKSİYONU</h2>
<div class="row grid tiers">
  <button data-tier="1">🌹 T1 · 1</button>
  <button data-tier="2">🍦 T2 · 5</button>
  <button data-tier="3">💖 T3 · 50</button>
  <button data-tier="4">☄️ T4 · 200</button>
  <button data-tier="5">🌪️ T5 · 1000</button>
  <button id="tac-giftstorm">FIRTINA</button>
</div>

<h2>KOMUTLAR</h2>
<div class="row grid">
  <button data-cmd="!kalkan">🛡 !kalkan</button>
  <button data-cmd="!fuego">🔥 !fuego</button>
  <button data-cmd="!responde">⚔ !responde</button>
  <button id="tac-likes">♥ 10 beğeni</button>
</div>
<div class="row"><input type="text" id="tac-cmd" placeholder="!escudo / !ateş / !escudo… (Enter)"/></div>

<h2>VERİ</h2>
<div class="row grid">
  <button id="tac-csv">Telemetri CSV</button>
  <button id="tac-clear" class="warn">Sıralama sil</button>
</div>
<div class="row stats" id="tac-stats"></div>`;
  }

  private $(id: string): HTMLElement { return this.el.querySelector('#' + id) as HTMLElement; }
  private on(id: string, ev: string, fn: () => void) {
    (this.$(id) as unknown as HTMLElement).addEventListener(ev, fn);
  }

  private bind() {
    const g = this.o.game;
    this.dot = this.$('tac-dot');
    this.statsEl = this.$('tac-stats');
    this.bridgeInput = this.$('tac-bridge') as unknown as HTMLInputElement;

    this.on('tac-connect', 'click', () => {
      const url = this.bridgeInput.value.trim();
      this.o.net.url = url || this.o.defaultBridge;
      this.o.net.reconnect();
    });

    const pause = this.$('tac-pause') as unknown as HTMLInputElement;
    pause.onchange = () => { g.setPaused(pause.checked); this.flash(pause); };

    const auto = this.$('tac-auto') as unknown as HTMLInputElement;
    auto.onchange = () => { g.setAutoGifts(auto.checked); this.flash(auto); };

    (this.$('tac-locale') as unknown as HTMLSelectElement).onchange = (e) => {
      g.setLocale((e.target as HTMLSelectElement).value);
    };
    const dual = this.$('tac-dual') as unknown as HTMLInputElement;
    dual.onchange = () => g.setDual(dual.checked);

    const cam = this.$('tac-cam') as unknown as HTMLInputElement;
    cam.onchange = async () => {
      const ok = await g.setFacecam(cam.checked, false);
      cam.checked = ok;
      if (!ok) this.$('tac-caminfo').textContent = `Kamera hatası: ${g.facecam.error || 'izin yok'}`;
      else this.$('tac-caminfo').textContent = `Kamera açık (${g.cfg.facecam?.stripPx ?? 100}px şerit, aynalanmış)`;
      this.flash(cam);
    };
    this.on('tac-camtest', 'click', async () => {
      await g.setFacecam(true, true);
      cam.checked = true;
      this.$('tac-caminfo').textContent = 'Test deseni aktif (gerçek kamera yok)';
      this.flash(cam);
    });

    const vol = (id: string, v: () => number) => (this.$(id) as unknown as HTMLInputElement).oninput =
      (e) => { const val = Number((e.target as HTMLInputElement).value) / 100; this.last = [val, v(), v()]; audio.setVolumes(val, v(), v()); };
    vol('tac-vol', () => Number((this.$('tac-volm') as unknown as HTMLInputElement).value) / 100);
    vol('tac-volm', () => Number((this.$('tac-vols') as unknown as HTMLInputElement).value) / 100);
    vol('tac-vols', () => Number((this.$('tac-vol') as unknown as HTMLInputElement).value) / 100);
    this.last = [0.6, 0.5, 0.7];

    const muteBtn = this.$('tac-mute');
    muteBtn.onclick = () => {
      const m = audio.toggleMute();
      muteBtn.textContent = m ? 'Sessiz (M) ✓' : 'Sessiz (M)';
      muteBtn.classList.toggle('on', m);
    };
    this.on('tac-test', 'click', () => { audio.ensure(); audio.fanfare(); });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'm' || e.key === 'M') (muteBtn as unknown as HTMLButtonElement).click();
    });

    (this.$('tac-dur') as unknown as HTMLSelectElement).onchange = (e) => {
      g.setDuration(Number((e.target as HTMLSelectElement).value));
    };
    this.on('tac-reset', 'click', () => g.resetMatch());

    this.el.querySelectorAll<HTMLButtonElement>('[data-phase]').forEach((b) => {
      b.onclick = () => g.forcePhase(b.dataset.phase as never);
    });
    this.on('tac-boss', 'click', () => g.forceBoss());
    this.on('tac-tide', 'click', () => g.forceEvent('tide'));
    this.on('tac-storm', 'click', () => g.forceEvent('storm'));
    this.on('tac-gold', 'click', () => g.forceEvent('goldrain'));
    const zb = this.$('tac-zones');
    zb.onclick = () => { const on = !zb.classList.contains('on'); zb.classList.toggle('on', on); g.setZonesVisible(on); };
    const hb = this.$('tac-hudinfo');
    hb.onclick = () => { const on = !hb.classList.contains('on'); hb.classList.toggle('on', on); g.setHudInfo(on); };

    this.on('tac-join1', 'click', () => g.spawnMockViewer(1));
    this.on('tac-join10', 'click', () => g.spawnMockViewer(10));
    this.on('tac-join50', 'click', () => g.spawnMockViewer(50));

    this.el.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((b) => {
      b.onclick = () => g.injectGift(Number(b.dataset.tier) as 1 | 2 | 3 | 4 | 5);
    });
    this.on('tac-giftstorm', 'click', () => {
      for (let i = 0; i < 30; i++) g.injectGift((Math.random() < 0.1 ? 5 : Math.random() < 0.25 ? 4 : Math.random() < 0.5 ? 3 : Math.random() < 0.8 ? 2 : 1) as 1 | 2 | 3 | 4 | 5);
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => {
      b.onclick = () => g.injectChat(b.dataset.cmd!);
    });
    this.on('tac-likes', 'click', () => g.injectLike(10));
    const cmd = this.$('tac-cmd') as unknown as HTMLInputElement;
    cmd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && cmd.value.trim()) { g.injectChat(cmd.value.trim()); cmd.value = ''; }
    });

    this.on('tac-csv', 'click', () => {
      const blob = new Blob([g.telemetryCsv()], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tac-savasi-telemetri-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    this.on('tac-clear', 'click', () => { g.clearRanking(); this.flash(this.$('tac-clear')); });
  }

  private last = [0.55, 0.35, 0.6];
  private flash(btn: Element) {
    btn.classList.add('on');
    setTimeout(() => btn.classList.remove('on'), 220);
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
    document.body.classList.toggle('clean', !this.visible);
    const t = document.getElementById('tac-toggle');
    if (t) (t as HTMLElement).style.display = this.visible ? 'none' : 'block';
  }

  /** Called every frame by main(); refreshes the readout at 4 Hz. */
  tick(dt: number, connected: boolean) {
    this.timer -= dt;
    if (connected !== this.lastStatus) {
      this.lastStatus = connected;
      this.dot.classList.toggle('ok', connected);
      this.$('tac-conn').textContent = connected ? 'TikTok köprüsü BAĞLI' : 'TikTok köprüsü YOK';
    }
    if (this.timer > 0) return;
    this.timer = 0.25;
    const s = this.o.game.statsSnapshot();
    const bad = (v: boolean) => (v ? 'bad' : '');
    const mm = Math.floor(Math.max(0, s.matchLeft) / 60);
    const ss = Math.floor(Math.max(0, s.matchLeft) % 60);
    const row = (k: string, v: string, cls = '') => `<div class="st"><span>${k}</span><span class="${cls}">${v}</span></div>`;
    this.statsEl.innerHTML =
      row('FPS', `${s.fps}${s.fps < 50 ? ' ⚠' : ''} · ${s.frameMs}ms · q${s.quality}`, bad(s.fps < 50))
      + row('Faz', `${s.phase} (${s.phaseLeft}s)`)
      + row('Maç', `#${s.matchNo} · ${mm}:${String(ss).padStart(2, '0')}`)
      + row('Oyuncular', `${s.avatars} · mermi ${s.bullets} · canavar ${s.monsters}`)
      + row('Boss', s.boss ?? '—')
      + row('Kale / Hedef', `${s.castle} · ${s.goal}`)
      + row('Olaylar', `altın ${s.goldRain ? 'EVET' : '—'} · gelgit ${s.tide ? 'EVET' : '—'} · fırtına ${s.storm ? 'EVET' : '—'}`)
      + row('Ses', `${audio.measureLevel().toFixed(0)} dBFS (hedef ≈ -16)`)
      + row('Durum', `${s.paused ? 'DURAKLADI' : 'akıyor'} · kamera ${s.facecam ? 'açık' : 'kapalı'}`)
      + row('Bellek', `${s.heapMB ?? '—'} MB · telemetri ${s.telemetryRows} satır`)
      + row('Ort. izlenme', `${s.avgWatchSec}s`)
      + row('Varlıklar', `${assets.report().slots} yuva · ${s.audioFiles} ses dosyası`)
      + row('Global top', s.globalTop.join(', ') || '—');
  }
}
