// TikTok LIVE köprüsü — tiktok-live-connector (WebcastPushConnection).
//
// ÖNEMLİ: 2.5.0 kütüphanesi ham protobuf mesajlarını verir; alanlar düz
// değil iç içedir. Doğru yollar (tiktok-live-proto v3'ten doğrulandı):
//   mesaj.user.displayId / user.nickname / user.profilePictureUrl
//   mesaj.gift.name / gift.describe / gift.diamondCount
//   mesaj.repeatCount / mesaj.repeatEnd (0 = sürüyor, 1 = bitti)
//   mesax.common.msgId
// Önceki sürüm düz `d.userId` / `d.nickname` / `d.giftName` okuyordu; alanlar
// undefined olduğu için HEDİYELER HİÇ GELMİYORDU (isim '?' , elmas 1).
import type { LiveEvent } from '@tac/shared';

export interface LiveAdapter {
  connect(username: string): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(cb: (e: LiveEvent) => void): void;
  readonly connected: boolean;
}

/** Ham protobuf kullanıcı/gift yapısı (yalnızca okuduğumuz alanlar). */
interface RawUser {
  idStr?: string;
  displayId?: string;
  nickname?: string;
  profilePictureUrl?: string;
  avatarThumb?: { urlList?: string[] };
}
interface RawGift {
  id?: string;
  name?: string;
  describe?: string;
  diamondCount?: number;
  icon?: { urlList?: string[] };
}
interface RawGiftMessage {
  common?: { msgId?: string };
  gift?: RawGift;
  user?: RawUser;
  toUser?: RawUser;
  repeatCount?: number;
  comboCount?: number;
  repeatEnd?: number;
  logId?: string;
}
interface RawChatMessage {
  common?: { msgId?: string };
  user?: RawUser;
  content?: string;
}
interface RawLikeMessage {
  common?: { msgId?: string };
  user?: RawUser;
  count?: number;
}
interface RawSimpleMessage { common?: { msgId?: string }; user?: RawUser }

/** repeatEnd 0 = kombo sürüyor, 1 = bitti (bazı sürümlerde boolean gelir). */
function isRepeatEnd(v: unknown): boolean {
  if (v === true) return true;
  if (v === 1) return true;
  return false;
}

/** Ad alanlarını normalize eder; hiçbiri yoksa null döner. */
function pickUser(u?: RawUser): { userId: string; name: string; pic: string | null } {
  const userId = String(u?.displayId ?? u?.idStr ?? '');
  const name = u?.nickname ?? '';
  const pic = u?.profilePictureUrl ?? u?.avatarThumb?.urlList?.[0] ?? null;
  return { userId, name, pic };
}

/** Benzersiz olay kimliği: aynı ms'de gelen iki mesaj çakışmasın. */
let seq = 0;
function mkId(msg?: string): string {
  seq = (seq + 1) % 1e6;
  return `${msg ?? 'e'}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export class TikTokAdapter implements LiveAdapter {
  private cb: ((e: LiveEvent) => void) | null = null;
  private client: {
    connect(): Promise<void>;
    disconnect(): void;
    on(a: string, f: (...x: unknown[]) => void): void;
    on(a: string, f: (...x: never[]) => void): void;
  } | null = null;
  connected = false;
  onEvent(cb: (e: LiveEvent) => void) { this.cb = cb; }

  async connect(username: string) {
    const mod = await import('tiktok-live-connector').catch(() => null) as unknown as {
      WebcastPushConnection: new (u: string, o?: unknown) => unknown;
    } | null;
    if (!mod) throw new Error('tiktok-live-connector not installed. Run in mock mode.');
    const Conn = mod.WebcastPushConnection;
    const c = new Conn(username, { clientParameter: { client_version: '1.0.0' } }) as never as {
      on(a: string, f: (...x: never[]) => void): void;
      connect(): Promise<void>;
      disconnect(): void;
    };
    this.client = c as never;

    c.on('chat', ((d: RawChatMessage) => {
      const u = pickUser(d.user);
      if (!u.userId) return;
      this.cb?.({
        type: 'chat', id: mkId(d.common?.msgId),
        userId: u.userId, name: u.name || '?', pic: u.pic,
        text: d.content ?? '',
      });
    }) as never);

    c.on('like', ((d: RawLikeMessage) => {
      const u = pickUser(d.user);
      if (!u.userId) return;
      this.cb?.({
        type: 'like', id: mkId(d.common?.msgId),
        userId: u.userId, name: u.name || '?', pic: u.pic,
        n: Math.max(1, Math.round(d.count ?? 1)),
      });
    }) as never);

    c.on('follow', ((d: RawSimpleMessage) => {
      const u = pickUser(d.user);
      if (!u.userId) return;
      this.cb?.({
        type: 'follow', id: mkId(d.common?.msgId),
        userId: u.userId, name: u.name || '?', pic: u.pic,
      });
    }) as never);

    c.on('member', ((d: RawSimpleMessage) => {
      const u = pickUser(d.user);
      if (!u.userId) return;
      this.cb?.({
        type: 'join', id: mkId(d.common?.msgId),
        userId: u.userId, name: u.name || '?', pic: u.pic,
      });
    }) as never);

    c.on('gift', ((d: RawGiftMessage) => {
      const u = pickUser(d.user);
      if (!u.userId) return;
      const g = d.gift;
      const repeat = Math.max(1, Math.round(d.repeatCount ?? 1));
      // Elmas: gift.diamondCount (paket başına). repeatEnd gelene kadar
      // tekrar sayısıyla çarpılır -> kombo toplamı doğru gelir.
      const per = Math.max(0, Math.round(g?.diamondCount ?? 0));
      this.cb?.({
        type: 'gift',
        // logId varsa onu kullan: TikTok her combo parçasına aynı logId verir
        id: mkId(d.logId || d.common?.msgId),
        userId: u.userId, name: u.name || '?', pic: u.pic,
        giftName: g?.name ?? g?.describe ?? '',
        diamonds: per * repeat,
        n: repeat,
        repeatEnd: isRepeatEnd(d.repeatEnd),
      });
    }) as never);

    await c.connect();
    this.connected = true;
  }

  async disconnect() {
    try { this.client?.disconnect(); } catch { /* noop */ }
    this.connected = false;
  }
}