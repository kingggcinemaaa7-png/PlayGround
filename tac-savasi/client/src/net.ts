// WS bridge client with auto-reconnect.
import type { LiveEvent } from '@tac/shared';

export class Net {
  ws: WebSocket | null = null;
  queue: LiveEvent[] = [];
  connected = false;
  onStatus: ((ok: boolean) => void) | null = null;
  constructor(public url: string, public onEvent: (e: LiveEvent) => void) {}
  connect() {
    const go = () => {
      try { this.ws = new WebSocket(this.url); } catch { setTimeout(go, 3000); return; }
      this.ws.onopen = () => { this.connected = true; this.onStatus?.(true); };
      this.ws.onmessage = (m) => {
        try {
          const o = JSON.parse(String(m.data));
          if (o?.kind === 'live') this.onEvent(o.event as LiveEvent);
        } catch { /* ignore */ }
      };
      this.ws.onclose = () => { this.connected = false; this.onStatus?.(false); setTimeout(go, 3000); };
      this.ws.onerror = () => { try { this.ws?.close(); } catch { /* noop */ } };
    };
    go();
  }
  inject(e: LiveEvent) { this.onEvent(e); }
  /** Force a fresh connection (console "Bağlan" button). */
  reconnect() {
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.connect();
  }
}
