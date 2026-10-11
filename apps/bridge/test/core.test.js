import test from "node:test";
import assert from "node:assert/strict";
import { normalizeName, fuzzyMatch, safeDisplayName, isClean, jaro } from "../lib/normalize.mjs";
import { tierFor, streakCountable, giftTotal, Gate, EventQueue } from "../lib/tiers.mjs";
import { wrapName } from "../lib/text.mjs";

const TIERS = [
  { id: 1, name: "Katılımcı", minDiamonds: 0 },
  { id: 2, name: "Dansçı", minDiamonds: 1 },
  { id: 3, name: "Yıldız", minDiamonds: 50 },
  { id: 4, name: "Balon Pilotu", minDiamonds: 300 },
  { id: 5, name: "Onur Konuğu", minDiamonds: 1000 },
  { id: 6, name: "Baş DJ", minDiamonds: 5000 },
  { id: 7, name: "Vadi Efsanesi", minDiamonds: 20000 },
];

test("Türkçe normalizasyon: İ/ı ş ğ ü ö ç", () => {
  assert.equal(normalizeName("IŞIL ĞÜN ÖÇ"), "isil gun oc");
  assert.equal(normalizeName("@Mehmet_Yılmaz "), "mehmet_yilmaz");
});

test("bulanık eşleşme: kendi adını yazan katılımcı olur", () => {
  const r = fuzzyMatch("mehmet", "Mehmet Yılmaz", 0.82);
  assert.equal(typeof r.score, "number");
  assert.equal(fuzzyMatch("Mehmet Yılmaz", "Mehmet Yılmaz").hit, true);
  assert.equal(fuzzyMatch("tamamen baska bir sey xyz", "Mehmet").hit, false);
});

test("jaro aynı string 1", () => assert.equal(jaro("abc", "abc"), 1));

test("moderasyon: kirli isim Misafir olur", () => {
  assert.equal(safeDisplayName("küfür1 adam", ["küfür1"]), "Misafir");
  assert.equal(safeDisplayName("Elif", ["küfür1"]), "Elif");
  assert.equal(safeDisplayName("", []), "Misafir");
  assert.equal(isClean("temiz isim", ["küfür1"]), true);
});

test("basamak eşikleri", () => {
  assert.equal(tierFor(0, TIERS).id, 1);
  assert.equal(tierFor(1, TIERS).id, 2);
  assert.equal(tierFor(49, TIERS).id, 2);
  assert.equal(tierFor(50, TIERS).id, 3);
  assert.equal(tierFor(300, TIERS).id, 4);
  assert.equal(tierFor(1000, TIERS).id, 5);
  assert.equal(tierFor(5000, TIERS).id, 6);
  assert.equal(tierFor(25000, TIERS).id, 7);
});

test("streak: ara olay sayılmaz, repeatEnd toplamı sayılır", () => {
  assert.equal(streakCountable({ type: "gift", repeatEnd: false }, true), false);
  assert.equal(streakCountable({ type: "gift", repeatEnd: true }, true), true);
  assert.equal(giftTotal({ diamonds: 10, repeat: 5 }), 50);
});

test("cooldown + hız sınırı", () => {
  const g = new Gate({ cooldownSecondsPerUser: 60, maxNewParticipantsPerMinute: 2 });
  assert.equal(g.joinAllowed("u1", 1000).ok, true);
  assert.equal(g.joinAllowed("u1", 2000).reason, "cooldown");
  assert.equal(g.joinAllowed("u2", 3000).ok, true);
  assert.equal(g.joinAllowed("u3", 4000).reason, "rate");
});

test("kuyruk önceliği: gift önce", () => {
  const q = new EventQueue();
  q.push({ type: "tick" }); q.push({ type: "gift" }); q.push({ type: "chat" });
  const d = q.drain(3);
  assert.deepEqual(d.map((e) => e.type), ["gift", "chat", "tick"]);
});

test("plaka satır kırma: en fazla 3 satır, kırpma yok", () => {
  const r = wrapName("Çok Uzun Bir İsim Buraya Yazıldı Test Ediliyor", 14, 3);
  assert.ok(r.lines.length <= 3);
  assert.ok(r.lines.join(" ").length > 12); // kırpılmadı
  const s = wrapName("Elif", 14, 3);
  assert.deepEqual(s.lines, ["Elif"]);
});
