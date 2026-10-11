import test from "node:test";
import assert from "node:assert/strict";
import { inputEvent, configSchema, aiPlan } from "../index.js";

test("gift şeması: streak alanları", () => {
  const g = inputEvent.parse({ type: "gift", userId: "u1", name: "Elif", giftName: "Gül", diamonds: 1, repeat: 5, repeatEnd: false });
  assert.equal(g.repeat, 5);
  assert.equal(g.repeatEnd, false);
});

test("chat şeması", () => {
  const c = inputEvent.parse({ type: "chat", userId: "u2", name: "Burak", text: "Burak" });
  assert.equal(c.type, "chat");
});

test("config şeması: 7 basamak zorunlu", () => {
  const tiers = [0, 1, 50, 300, 1000, 5000, 20000].map((m, i) => ({ id: i + 1, name: "T" + (i + 1), minDiamonds: m }));
  const c = configSchema.parse({ tiers, join: {}, streak: {}, frontRow: {}, nameplate: {}, hype: {}, duel: {} });
  assert.equal(c.tiers.length, 7);
  assert.throws(() => configSchema.parse({ tiers: tiers.slice(0, 6) }));
});

test("AI plan şeması: bozuk çıktı elenir", () => {
  const p = aiPlan.parse({ scene_phase: "peak", event: { type: "dance_duel", participants: ["u1", "u2"], duration_s: 40 }, palette: "amber_blue", camera_bias: ["front_low"], laser_pattern: "cross_fast", announcements: [{ text: "Haydi!" }], cta: "Ön sıra!" });
  assert.equal(p.scene_phase, "peak");
  assert.throws(() => aiPlan.parse({ scene_phase: "bozuk-faz" }));
});
