// Streamer control console. Lives OUTSIDE the game canvas so it is never
// captured by TikTok LIVE Studio. Toggle with F1 (or ?clean=1 to hide).
import type { Game } from '../game.js';
import type { Net } from '../net.js';
import { audio } from '../audio.js';
import { assets } from '../assets.js';
import { GIFT_ACTIONS, giftTier, type GiftAction } from '@tac/shared';

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
#tac-console .gtab{display:flex;flex-direction:column;gap:4px;margin:4px 0}
#tac-console .grow{display:grid;grid-template-columns:1fr 52px 1fr 30px 30px;gap:4px;align-items:center;
  background:#101a33;border:1px solid #2a3554;border-radius:8px;padding:3px 4px}
#tac-console .grow.off{opacity:.45}
#tac-console .grow .gname{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tac-console .grow input[type=text]{width:100%;background:#0a1020;color:#e8ecf8;border:1px solid #33406a;border-radius:6px;padding:4px;font:inherit;font-size:12px}
#tac-console .grow select{width:100%;background:#0a1020;color:#e8ecf8;border:1px solid #33406a;border-radius:6px;padding:4px;font:inherit;font-size:11px}
#tac-console .tiers button:nth-child(6){background:#3a2f6b}
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
  private lastEverConnected = false;

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
<div class="row"><input type="text" id="tac-bridge" /><button id="tac-connect">Bağlan</button></div>

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
<div class="row"><button id="tac-music">Müzik: açık</button></div>
<div class="mini" id="tac-audioinfo">ses: —</div>
<div class="mini">Kendi müziğin (mp3/wav/ogg — seçim kalıcıdır, tekrar açınca geri gelir):</div>
<div class="row"><button id="tac-muscalm">Sakin müzik seç…</button></div>
<div class="mini" id="tac-muscalm-info">sakin: hazır parça</div>
<div class="row"><button id="tac-mushot">Yoğun müzik seç…</button></div>
<div class="mini" id="tac-mushot-info">yoğun: hazır parça</div>
<div class="row"><button id="tac-musclear">Seçili müzikleri sil</button></div>

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

<h2>OTOMASYON</h2>
<div class="mini">Kapalıysa oyun kendiliğinden o esneyi yapmaz; elle tetiklersin.</div>
<div class="row">
  <label><input type="checkbox" id="tac-auto-boss" checked/> <span>BOSS otomatik</span></label>
  <label><input type="checkbox" id="tac-auto-gold" checked/> <span>Altın yağmur</span></label>
  <label><input type="checkbox" id="tac-auto-night" checked/> <span>Gece</span></label>
</div>
<div class="row">
  <label>BOSS her <input type="number" id="tac-boss-every" min="0" max="300" step="5" value="0" style="max-width:64px"/> sn
    <span class="mini">(0 = maç yüzdeleriyle)</span></label>
</div>

<h2>KALKI</h2>
<div class="row">
  <label>Yörünge silahı <input type="number" id="tac-orb-count" min="0" max="6" step="1" value="2" style="max-width:56px"/> yıldız</label>
</div>
<div class="row">
  <label>Hasar <input type="number" id="tac-orb-dmg" min="0" max="40" step="1" value="6" style="max-width:56px"/></label>
  <label>Yarıçap <input type="number" id="tac-orb-rad" min="30" max="140" step="2" value="74" style="max-width:64px"/></label>
</div>
<div class="row">
  <label><input type="checkbox" id="tac-heat" checked/> <span>Savaş ısısı (kenar efekti)</span></label>
</div>
<div class="row">
  <label><input type="checkbox" id="tac-breath" checked/> <span>Kamera nefesi</span></label>
</div>

<h2>HEDİYE ENJEKSİYONU</h2>
<div class="row grid tiers" id="tac-gifttest"></div>
<div class="row"><button id="tac-giftstorm">FIRTINA (kayıttan 30 hediye)</button></div>

<h2>HEDİYE YÖNETİMİ</h2>
<div class="mini">Hediyeye tıkla = oyuncuya gönder (test). Tablo: elmas, kademe, eylem, açık/kapalı, sil.</div>
<div id="tac-gifttable"></div>
<div class="row">
  <input type="text" id="tac-gnew-name" placeholder="Ad (örn. Dragon)" />
  <input type="text" id="tac-gnew-icon" placeholder="🎁" style="max-width:44px" />
  <input type="text" id="tac-gnew-dia" placeholder="💎" style="max-width:70px" />
</div>
<div class="row">
  <select id="tac-gnew-action"></select>
  <button id="tac-gnew-add">Ekle</button>
</div>
<div class="row">
  <button id="tac-greset">Varsayılana dön</button>
</div>

<h2>KOMUTLAR</h2>
<div class="row grid">
  <button data-cmd="!kalkan">🛡 !kalkan</button>
  <button data-cmd="!fuego">🔥 !fuego</button>
  <button data-cmd="!responde">⚔ !responde</button>
  <button data-cmd="!güç">✨ !güç</button>
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
    // M15: deger innerHTML ile yaziliyordu; ?bridge= k parametresi sayfaya
    // script enjekte edebiliyordu. Artik ozellik olarak ataniyor.
    (this.$('tac-bridge') as unknown as HTMLInputElement).value = this.o.defaultBridge;

    this.on('tac-test', 'click', () => { audio.ensure(); audio.fanfare(); });
    const musicBtn = this.$('tac-music');
    musicBtn.classList.add('on');
    musicBtn.onclick = () => {
      audio.ensure();
      const on = !audio.musicEnabled;
      audio.setMusicEnabled(on);
      musicBtn.textContent = on ? 'Müzik: açık' : 'Müzik: kapalı';
      musicBtn.classList.toggle('on', on);
      this.flash(musicBtn);
    };
    this.bindMusicPicker('tac-muscalm', 'tac-muscalm-info', 'music-calm', 'sakin');
    this.bindMusicPicker('tac-mushot', 'tac-mushot-info', 'music-intense', 'yoğun');
    this.refreshMusicInfo();
    this.on('tac-musclear', 'click', async () => {
      const { idbClear } = await import('../audioIdb.js');
      await idbClear('music-calm');
      await idbClear('music-intense');
      audio.files.delete('music-calm');
      audio.files.delete('music-intense');
      audio.syncMusicLayers();
      this.refreshMusicInfo();
      this.flash(this.$('tac-musclear'));
    });
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

    // Faz 3.4/4: otomasyon ve kalıcı görsel ayarlar
    this.chk('tac-auto-boss', g.automation.boss, (v) => { g.automation.boss = v; });
    this.chk('tac-auto-gold', g.automation.goldRain, (v) => { g.automation.goldRain = v; });
    this.chk('tac-auto-night', g.automation.night, (v) => { g.automation.night = v; });
    this.chk('tac-heat', g.cfg.fx.heat, (v) => { g.cfg.fx.heat = v; });
    this.num('tac-orb-count', g.sim.cfg.orbit.count, (v) => {
      g.sim.cfg.orbit.count = Math.max(0, Math.min(6, Math.round(v)));
      g.ent.orbitCount = g.sim.cfg.orbit.count;
    });
    this.num('tac-orb-dmg', g.sim.cfg.orbit.dmg, (v) => {
      g.sim.cfg.orbit.dmg = Math.max(0, Math.min(40, v));
    });
    this.num('tac-orb-rad', g.sim.cfg.orbit.radius, (v) => {
      g.sim.cfg.orbit.radius = Math.max(30, Math.min(140, v));
      g.ent.orbitRadius = g.sim.cfg.orbit.radius;
    });
    this.chk('tac-breath', g.cfg.fx.breath, (v) => { g.cfg.fx.breath = v; });
    this.num('tac-boss-every', g.bossEverySec, (v) => { g.bossEverySec = Math.max(0, v); });

    this.renderGiftTest();
    this.renderGiftTable();
    // eylem seçenekleri (ekleme formu)
    const actSel = this.$('tac-gnew-action') as unknown as HTMLSelectElement;
    actSel.innerHTML = GIFT_ACTIONS.map((a) => `<option value="${a.id}">${a.tr}</option>`).join('');
    this.on('tac-giftstorm', 'click', () => {
      for (let i = 0; i < 30; i++) g.injectGift((Math.random() < 0.1 ? 5 : Math.random() < 0.25 ? 4 : Math.random() < 0.5 ? 3 : Math.random() < 0.8 ? 2 : 1) as 1 | 2 | 3 | 4 | 5);
    });
    this.on('tac-gnew-add', 'click', () => {
      const name = (this.$('tac-gnew-name') as unknown as HTMLInputElement).value.trim();
      const icon = (this.$('tac-gnew-icon') as unknown as HTMLInputElement).value.trim() || '🎁';
      const diamonds = Math.max(1, Math.floor(Number((this.$('tac-gnew-dia') as unknown as HTMLInputElement).value) || 1));
      if (!name) return;
      g.giftAdd({ id: '', name, icon, diamonds, enabled: true, action: actSel.value as GiftAction });
      (this.$('tac-gnew-name') as unknown as HTMLInputElement).value = '';
      this.renderGiftTest();
      this.renderGiftTable();
    });
    this.on('tac-greset', 'click', () => {
      g.giftReset();
      this.renderGiftTest();
      this.renderGiftTable();
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
  private musicNames: Record<string, string> = {};

  /** onay kutusu: anlık uygular, kalıcı değildir (konsol ayarı) */
  private chk(id: string, initial: boolean, apply: (v: boolean) => void) {
    const el = this.$(id) as unknown as HTMLInputElement;
    el.checked = initial;
    el.onchange = () => apply(el.checked);
  }
  /** sayı kutusu: boş/geçersizse son geçerli değer korunur */
  private num(id: string, initial: number, apply: (v: number) => void) {
    const el = this.$(id) as unknown as HTMLInputElement;
    el.value = String(initial);
    el.onchange = () => {
      const v = Number(el.value);
      if (Number.isFinite(v)) apply(v); else el.value = String(initial);
    };
  }

  /** Dosya seçici: mp3/wav/ogg seç, çöz, çal, kalıcı kaydet. */
  private bindMusicPicker(btnId: string, infoId: string, slot: string, label: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a';
    input.style.display = 'none';
    document.body.appendChild(input);
    this.$(btnId).onclick = () => {
      audio.ensure();
      input.click();
    };
    input.onchange = async () => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      const info = this.$(infoId);
      info.textContent = `${label}: çözülüyor…`;
      const ok = await audio.loadBlob(slot, f);
      if (!ok) {
        info.textContent = `${label}: dosya okunamadı (${f.name})`;
        return;
      }
      try {
        const { idbSave } = await import('../audioIdb.js');
        await idbSave(slot, f, f.name);
      } catch { /* kalıcı olmazsa da çalar */ }
      this.musicNames[slot] = f.name;
      this.refreshMusicInfo();
    };
  }

  /** Kayıttaki ilk 5 aktif hediye = hızlı test düğmeleri. */
  private renderGiftTest() {
    const box = this.$('tac-gifttest');
    box.innerHTML = '';
    for (const d of this.o.game.giftList().filter((x) => x.enabled).slice(0, 5)) {
      const b = document.createElement('button');
      b.textContent = `${d.icon} ${d.name} · ${d.diamonds}`;
      b.title = `${d.name} gönder (test)`;
      b.onclick = () => this.o.game.injectGiftById(d.id);
      box.appendChild(b);
    }
    const storm = document.createElement('button');
    storm.textContent = '🎲 Karışık 5';
    storm.title = 'Kayıttan rastgele 5 hediye';
    storm.onclick = () => {
      const en = this.o.game.giftList().filter((x) => x.enabled);
      for (let i = 0; i < 5 && en.length; i++) {
        this.o.game.injectGiftById(en[(Math.random() * en.length) | 0].id);
      }
    };
    box.appendChild(storm);
  }

  /** Hediye kayıt tablosu: elmas / eylem / açık-kapalı / sil. */
  private renderGiftTable() {
    const g = this.o.game;
    const box = this.$('tac-gifttable');
    box.innerHTML = '';
    const table = document.createElement('div');
    table.className = 'gtab';
    for (const d of g.giftList()) {
      const row = document.createElement('div');
      row.className = 'grow' + (d.enabled ? '' : ' off');

      const nm = document.createElement('button');
      nm.className = 'gname';
      nm.textContent = `${d.icon} ${d.name}`;
      nm.title = 'Gönder (test)';
      nm.onclick = () => g.injectGiftById(d.id);

      const dia = document.createElement('input');
      dia.type = 'text';
      dia.value = String(d.diamonds);
      dia.title = 'Elmas (T' + giftTier(d.diamonds) + ')';
      dia.onchange = () => {
        const v = Math.max(1, Math.floor(Number(dia.value) || d.diamonds));
        g.giftSet(d.id, { diamonds: v });
        this.renderGiftTest();
        this.renderGiftTable();
      };

      const sel = document.createElement('select');
      sel.innerHTML = GIFT_ACTIONS.map((a) => `<option value="${a.id}">${a.tr}</option>`).join('');
      sel.value = d.action;
      sel.title = 'Bu hediye ne yapsın';
      sel.onchange = () => {
        g.giftSet(d.id, { action: sel.value as GiftAction });
        this.renderGiftTable();
      };

      const tog = document.createElement('button');
      tog.textContent = d.enabled ? '●' : '○';
      tog.title = d.enabled ? 'Kapat' : 'Aç';
      tog.classList.toggle('on', d.enabled);
      tog.onclick = () => {
        g.giftSet(d.id, { enabled: !d.enabled });
        this.renderGiftTest();
        this.renderGiftTable();
      };

      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Sil';
      del.classList.add('warn');
      del.onclick = () => {
        g.giftRemove(d.id);
        this.renderGiftTest();
        this.renderGiftTable();
      };

      row.append(nm, dia, sel, tog, del);
      table.appendChild(row);
    }
    box.appendChild(table);
  }

  private refreshMusicInfo() {
    const calm = this.musicNames['music-calm'] ?? audio.savedNames.get('music-calm');
    const hot = this.musicNames['music-intense'] ?? audio.savedNames.get('music-intense');
    this.$('tac-muscalm-info').textContent =
      'sakin: ' + (calm ?? (audio.has('music-calm') ? 'hazır parça' : 'yok (synth)'));
    this.$('tac-mushot-info').textContent =
      'yoğun: ' + (hot ?? (audio.has('music-intense') ? 'hazır parça' : 'yok (synth)'));
  }

  private musicTick = 0;

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
      // Faz 3.3: kopma/yeniden bağlanma gürültüsü yalnızca bir kez
      if (this.lastEverConnected) {
        console.warn(connected ? '[tac] köprü yeniden bağlandı' : '[tac] KÖPRÜ KOPTU — oyun devam ediyor');
      }
      this.lastEverConnected = true;
    }
    // kopma süresi gösterilir (streamer "ne kadar süredir bağlı değil" görür)
    if (!connected) {
      const secs = Math.floor(this.o.net.downSeconds());
      this.$('tac-conn').textContent = secs > 0 ? `KÖPRÜ YOK — ${secs}s (oyun devam)` : 'TikTok köprüsü YOK';
      this.dot.classList.remove('ok');
    }
    if (this.timer > 0) return;
    this.timer = 0.25;
    // müzik satırları arka planda geç yüklenebilir — gerçeği yansıt
    this.musicTick += 0.25;
    if (this.musicTick >= 2) {
      this.musicTick = 0;
      this.refreshMusicInfo();
      // Faz 4.2: ses standardizasyonu göstergesi (hedef ≈ -20 RMS, tavan -3 tepe)
      const a = audio.audioStatus();
      const el = this.$('tac-audioinfo');
      el.textContent = a.rms <= -99
        ? 'ses: sessiz (ses çal düğmesine bas)'
        : `ses: ${a.rms.toFixed(1)} dBFS RMS · tepe ${a.peak.toFixed(1)}${a.clipping ? ' ⚠ KIRPMA' : ''}`;
      el.style.color = a.clipping ? '#ff6b6b' : a.rms < -30 ? '#ffd23f' : '#7ee8ff';
    }
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
