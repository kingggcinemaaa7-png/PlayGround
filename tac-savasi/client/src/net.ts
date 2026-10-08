// WS bridge client with auto-reconnect.
import type { LiveEvent } from '@tac/shared';

export class Net {
  ws: WebSocket | null = null;
  queue: LiveEvent[] = [];
  connected = false;
  onStatus: ((ok: boolean) => void) | null = null;
  /** bağlantı durumu geçmişi: oyun bunu "koptu/bağlandı" duyuruları için okur */
  everConnected = false;
  lastChangeAt = 0;
  downSince = 0;
  retries = 0;
  private stopped = false;

  constructor(public url: string, public onEvent: (e: LiveEvent) => void) {}

  connect() {
    this.stopped = false;
    const go = () => {
      if (this.stopped) return;
      try {
        this.ws = new WebSocket(this.url);
      } catch {
        this.markDown();
        setTimeout(go, 3000);
        return;
      }
      this.ws.onopen = () => {
        this.connected = true;
        this.retries = 0;
        this.lastChangeAt = performance.now();
        this.everConnected = true;
        this.onStatus?.(true);
      };
      this.ws.onmessage = (m) => {
        try {
          const o = JSON.parse(String(m.data));
          if (o?.kind === 'live') this.onEvent(o.event as LiveEvent);
        } catch { /* ignore */ }
      };
      // KOPMA: oyun devam etmeli. Üstel geri çekilme + durum yayını.
      this.ws.onclose = () => {
        this.connected = false;
        this.markDown();
        this.onStatus?.(false);
        const wait = Math.min(30000, 1500 * Math.pow(1.6, this.retries++));
        setTimeout(go, wait);
      };
      this.ws.onerror = () => { try { this.ws?.close(); } catch { /* noop */ } };
    };
    go();
  }
  private markDown() {
    const now = performance.now();
    if (this.connected || this.downSince) return;
    this.downSince = now;
    this.lastChangeAt = now;
  }
  /** kopma süresi (sn) — 0 = bağlı */
  downSeconds() {
    if (this.connected || !this.downSince) return 0;
    return (performance.now() - this.downSince) / 1000;
  }
  inject(e: LiveEvent) { this.onEvent(e); }
  /** Force a fresh connection (console "Bağlan" button). */
  reconnect() {
    this.retries = 0;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.connect();
  }
  /** Kapat (sayfa değişimi / unmount). Yeniden bağlanmayı durdurur. */
  stop() {
    this.stopped = true;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.connected = false;
  }
}
