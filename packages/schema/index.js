import { z } from "zod";

// ---- Ortak alanlar ----
export const userId = z.string().min(1).max(128);
export const displayName = z.string().max(120).default("");

// ---- Girdi olayları (TikTok/simülatör -> köprü) ----
// Master Plan §9: tek şema (gift, chat, join_intent, tick, system)
export const giftEvent = z.object({
  type: z.literal("gift"),
  userId,
  name: displayName,
  avatarUrl: z.string().max(512).optional().default(""),
  giftName: z.string().min(1).max(120),
  giftId: z.string().max(120).optional().default(""),
  diamonds: z.number().nonnegative(),
  repeat: z.number().int().min(1).default(1),
  repeatEnd: z.boolean().default(true),
  comment: z.string().max(280).optional().default(""),
  ts: z.number().default(() => Date.now()),
});

export const chatEvent = z.object({
  type: z.literal("chat"),
  userId,
  name: displayName,
  text: z.string().max(500),
  ts: z.number().default(() => Date.now()),
});

export const joinIntentEvent = z.object({
  type: z.literal("join_intent"),
  userId,
  name: displayName,
  avatarUrl: z.string().max(512).optional().default(""),
  ts: z.number().default(() => Date.now()),
});

export const tickEvent = z.object({
  type: z.literal("tick"),
  ts: z.number().default(() => Date.now()),
});

export const systemEvent = z.object({
  type: z.literal("system"),
  kind: z.enum(["reset", "drop", "duel_start", "duel_end", "quality", "ai_toggle", "ban"]),
  payload: z.record(z.unknown()).default({}),
  ts: z.number().default(() => Date.now()),
});

export const inputEvent = z.discriminatedUnion("type", [
  giftEvent, chatEvent, joinIntentEvent, tickEvent, systemEvent,
]);

// ---- Köprü -> oyun delta komutları ----
export const deltaCmd = z.object({
  kind: z.enum([
    "participant_add", "dancer_add", "dancer_promote", "tier_up",
    "announce", "hype", "drop", "leaderboard", "moon", "star7",
    "window_lit", "duel", "toast", "state_full",
  ]),
  payload: z.record(z.unknown()).default({}),
  ts: z.number().default(() => Date.now()),
});

// ---- Config şeması (§4 eşikleri) ----
export const tierCfg = z.object({
  id: z.number().int().min(1).max(7),
  name: z.string(),
  minDiamonds: z.number().nonnegative(),
  maxDiamonds: z.number().nonnegative().optional(),
  scope: z.string().optional(),
  moonSlot: z.boolean().optional(),
  cinematic: z.boolean().optional(),
  stageSeconds: z.array(z.number()).optional(),
  skySeconds: z.number().optional(),
  kind: z.string().optional(),
});

export const configSchema = z.object({
  language: z.string().default("tr"),
  tiers: z.array(tierCfg).min(7).max(7),
  join: z.object({
    cooldownSecondsPerUser: z.number().default(60),
    maxNewParticipantsPerMinute: z.number().default(30),
    fuzzyThreshold: z.number().min(0).max(1).default(0.82),
  }),
  streak: z.object({ countOnRepeatEndOnly: z.boolean().default(true) }).passthrough(),
  frontRow: z.object({
    frontSlots: z.number().default(12), backSlots: z.number().default(24),
    promoteNewestGifters: z.boolean().default(true),
  }).passthrough(),
  nameplate: z.object({
    baseFontPx: z.number().default(68), maxLines: z.number().default(3),
    minScaleOnOverflow: z.number().default(0.9),
  }).passthrough(),
  hype: z.object({
    perDiamond: z.number().default(1), decayPerSecond: z.number().default(2),
    dropAt: z.number().default(1000),
  }).passthrough(),
  duel: z.object({
    durationSeconds: z.number().default(40),
    teamKeywords: z.record(z.array(z.string())).default({ left: ["sol"], right: ["sag", "sağ"] }),
  }).passthrough(),
}).passthrough();

// ---- AI yönetmen çıktısı (§8) ----
export const aiPlan = z.object({
  scene_phase: z.enum(["intro", "warm", "rise", "peak", "breath", "finale"]).default("warm"),
  event: z.object({
    type: z.string(),
    participants: z.array(z.string()).default([]),
    duration_s: z.number().default(40),
  }).nullable().default(null),
  palette: z.string().default("amber_blue"),
  camera_bias: z.array(z.string()).default([]),
  laser_pattern: z.string().default("cross_slow"),
  announcements: z.array(z.object({
    text: z.string().max(280), target: z.string().default(""), priority: z.number().default(2),
  })).default([]),
  cta: z.string().max(280).default(""),
});
