// Shared normalized event (bridge -> game).
export type LiveEventType = 'join' | 'chat' | 'like' | 'follow' | 'gift' | 'share';
export interface LiveEvent {
  type: LiveEventType;
  id: string;       // dedupe id
  userId: string;
  name: string;
  pic: string | null;
  text?: string;
  n?: number;       // count (likes, repeat)
  diamonds?: number;
  giftName?: string;
  repeatEnd?: boolean; // true only when combo streak ended
  ts?: number;
}
export type GiftTier = 1 | 2 | 3 | 4 | 5;

export function giftTier(diamonds = 0): GiftTier {
  if (diamonds >= 1000) return 5;
  if (diamonds >= 200) return 4;
  if (diamonds >= 50) return 3;
  if (diamonds >= 5) return 2;
  return 1;
}

export interface AvatarState {
  userId: string; name: string; pic: string | null;
  x: number; y: number; hp: number; maxHp: number;
  alive: boolean; respawnAt: number;
  streak: number; bestStreak: number; kills: number; damage: number; monsterKills: number; bossDamage: number;
  gifts: number; diamonds: number; score: number; poisonTick: number;
  shieldUntil: number; speedUntil: number; doubleUntil: number;
  fuerzaUntil: number; poisonUntil: number; healUntil: number;
  rageUntil: number; ghostUntil: number; vampUntil: number;
  giantUntil: number; giantActive: boolean;
  reflectUntil: number; chainUntil: number;
  trappedUntil: number; fireCd: number; likeCount: number;
  /** seviye (LEVEL UP skilleriyle kalıcı büyür, max 5): +maxHp ve +hasar */
  level: number;
  /** emilim (ABSORB): gelen hasar yarıya iner, yarısı cana dönüşür */
  absorbUntil: number;
  /** yörünge silahı: yıldızların açısal konumu (radyan) ve faz hız çarpanı */
  orbAngle: number; orbCd: number;
  lastActive: number; powerLabel?: string;
  orbitR: number; orbitPhase: number;
  /** son atışın nişan yönü (radyan) + hazırlık t=1 ateşe yaklaşıyor */
  aimX: number; aimY: number; aimT: number;
}

export interface Minion {
  id: string; owner: string;
  x: number; y: number; hp: number; maxHp: number;
  until: number; cd: number;
}

export interface SimConfig {
  avatarHp: number; avatarDmg: number; avatarSpeed: number;
  fireInterval: number; range: number; bulletSpeed: number;
  respawnSec: number; respawnHpPct: number; shieldSec: number;
  damageCap: number;
  /** yörünge silahı: kaç yıldız, yarıçap, tur/sn, hasar, bekleme */
  orbit: { count: number; radius: number; spin: number; dmg: number; cd: number };
  streakBonus: { min: number; mult: number }[];
  mutator: 'none' | 'double' | 'goldrain' | 'speed';
}
export function defaultSimConfig(): SimConfig {
  return {
    avatarHp: 100, avatarDmg: 10, avatarSpeed: 55,
    fireInterval: 0.55, range: 190, bulletSpeed: 260,
    respawnSec: 3, respawnHpPct: 0.5, shieldSec: 2,
    damageCap: 3,
    orbit: { count: 2, radius: 74, spin: 2.6, dmg: 6, cd: 0.75 },
    streakBonus: [
      { min: 50, mult: 1.6 }, { min: 30, mult: 1.5 },
      { min: 15, mult: 1.25 }, { min: 5, mult: 1.1 },
    ],
    mutator: 'none',
  };
}
