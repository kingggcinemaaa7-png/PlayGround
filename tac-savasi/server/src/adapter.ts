// Adapter interface — swap tiktok-live-connector without touching game code.
import type { LiveEvent } from '@tac/shared';

export interface LiveAdapter {
  connect(username: string): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(cb: (e: LiveEvent) => void): void;
  readonly connected: boolean;
}

// Real TikTok adapter (lazy import so missing dep doesn't crash mock mode).
export class TikTokAdapter implements LiveAdapter {
  private cb: ((e: LiveEvent) => void) | null = null;
  private client: { connect(): Promise<void>; disconnect(): void; on(a: string, f: (...x: unknown[]) => void): void } | null = null;
  connected = false;
  onEvent(cb: (e: LiveEvent) => void) { this.cb = cb; }
  async connect(username: string) {
    const mod = await import('tiktok-live-connector').catch(() => null) as unknown as { WebcastPushConnection: new (u: string) => unknown } | null;
    if (!mod) throw new Error('tiktok-live-connector not installed. Run in mock mode.');
    const Conn = mod.WebcastPushConnection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = new Conn(username) as any;
    this.client = c;
    c.on('chat', (d: { userId?: string; nickname?: string; profilePictureUrl?: string; comment?: string; msgId?: string }) =>
      this.cb?.({ type: 'chat', id: d.msgId ?? `${Date.now()}`, userId: String(d.userId ?? d.nickname), name: d.nickname ?? '?', pic: d.profilePictureUrl ?? null, text: d.comment ?? '' }));
    c.on('like', (d: { userId?: string; nickname?: string; profilePictureUrl?: string; count?: number; msgId?: string }) =>
      this.cb?.({ type: 'like', id: `${d.msgId ?? Date.now()}-${Math.random()}`, userId: String(d.userId ?? d.nickname), name: d.nickname ?? '?', pic: d.profilePictureUrl ?? null, n: d.count ?? 1 }));
    c.on('follow', (d: { userId?: string; nickname?: string; profilePictureUrl?: string; msgId?: string }) =>
      this.cb?.({ type: 'follow', id: d.msgId ?? `${Date.now()}`, userId: String(d.userId ?? d.nickname), name: d.nickname ?? '?', pic: d.profilePictureUrl ?? null }));
    c.on('gift', (d: { userId?: string; nickname?: string; profilePictureUrl?: string; giftName?: string; diamondCount?: number; repeatEnd?: boolean; repeatCount?: number; msgId?: string }) =>
      this.cb?.({ type: 'gift', id: d.msgId ?? `${Date.now()}-${Math.random()}`, userId: String(d.userId ?? d.nickname), name: d.nickname ?? '?', pic: d.profilePictureUrl ?? null, giftName: d.giftName, diamonds: (d.diamondCount ?? 1) * (d.repeatCount ?? 1), n: d.repeatCount ?? 1, repeatEnd: d.repeatEnd ?? true }));
    c.on('member', (d: { userId?: string; nickname?: string; profilePictureUrl?: string; msgId?: string }) =>
      this.cb?.({ type: 'join', id: d.msgId ?? `${Date.now()}-${Math.random()}`, userId: String(d.userId ?? d.nickname), name: d.nickname ?? '?', pic: d.profilePictureUrl ?? null }));
    await c.connect();
    this.connected = true;
  }
  async disconnect() { try { this.client?.disconnect(); } catch { /* noop */ } this.connected = false; }
}
