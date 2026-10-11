// Köprü: TikTok soyutlaması + normalizasyon + kuyruk + durum + WS + REST (FAZ 0/1 çekirdek)
// Master Plan §9. REST sadece localhost. Anahtarlar .env'de, koda gömülmez.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { inputEvent, deltaCmd, configSchema } from "@vadi/schema";
import { normalizeName, fuzzyMatch, safeDisplayName } from "./lib/normalize.mjs";
import { tierFor, streakCountable, giftTotal, Gate, EventQueue } from "./lib/tiers.mjs";
import { wrapName } from "./lib/text.mjs";
import { openStore } from "./lib/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const cfg = configSchema.parse(JSON.parse(readFileSync(join(ROOT, "config", "config.json"), "utf8")));
const giftmap = JSON.parse(readFileSync(join(ROOT, "config", "giftmap.json"), "utf8"));
const moderation = JSON.parse(readFileSync(join(ROOT, "config", "moderation.json"), "utf8"));

const PORT = Number(process.env.BRIDGE_PORT ?? 8081);
const HOST = process.env.BRIDGE_HOST ?? "127.0.0.1";

const store = openStore(join(ROOT, "data", "vadi.sqlite"));
const gate = new Gate(cfg.join);
const queue = new EventQueue(1000);
const sockets = new Set();

// ---- Durum yöneticisi (tek doğruluk kaynağı) ----
const state = {
  startedAt: Date.now(),
  participants: new Map(), // userId -> {name, avatarUrl, total, tier}
  leaderboard: [],
  moon: null, // {userId,name,amount}
  hype: 0,
  windowsLit: 0,
  drops: 0,
  recentAnnounces: [],
};

function broadcast(cmd) {
  const parsed = deltaCmd.parse(cmd);
  const msg = JSON.stringify(parsed);
  for (const ws of sockets) { try { ws.send(msg); } catch {} }
}

function fullState() {
  return {
    leaderboard: state.leaderboard,
    moon: state.moon,
    hype: Math.round(state.hype),
    windowsLit: state.windowsLit,
    participants: state.participants.size,
    drops: state.drops,
  };
}

function announce(text, target = "", priority = 2) {
  state.recentAnnounces.push(text);
  if (state.recentAnnounces.length > 50) state.recentAnnounces.shift();
  broadcast({ kind: "announce", payload: { text, target, priority } });
}

// ---- Olay işleme ----
export function handleInput(raw) {
  const ev = inputEvent.parse(raw);
  queue.push(ev);
  for (const e of queue.drain(100)) processEvent(e);
  return { queued: queue.size };
}

function processEvent(ev) {
  const now = Date.now();
  if (ev.type === "gift") {
    const countable = streakCountable(ev, cfg.streak.countOnRepeatEndOnly);
    if (!countable) {
      broadcast({ kind: "toast", payload: { text: `combo ${ev.repeat}x…`, userId: ev.userId } });
      return; // ara olay: sadece sayaç animasyonu, sayım yok (§3)
    }
    const total = giftTotal(ev);
    const name = safeDisplayName(ev.name, moderation.patterns);
    const prev = state.participants.get(ev.userId);
    const prevTotal = prev?.total ?? 0;
    const prevTier = prev?.tier ?? 1;
    const next = prevTotal + total;
    const tier = tierFor(next, cfg.tiers);
    state.participants.set(ev.userId, { name, avatarUrl: ev.avatarUrl, total: next, tier: tier.id });

    store.upsertGift({ userId: ev.userId, name, avatarUrl: ev.avatarUrl, total, bestSingle: total, bestTier: tier.id, now });
    store.log("gift", ev.userId, { giftName: ev.giftName, total, tier: tier.id });

    // hype + DROP
    state.hype += total * (cfg.hype.perDiamond ?? 1);
    broadcast({ kind: "hype", payload: { hype: Math.round(state.hype) } });
    if (state.hype >= (cfg.hype.dropAt ?? 1000)) {
      state.hype = 0; state.drops++;
      broadcast({ kind: "drop", payload: { n: state.drops } });
      announce("DROP! Vadi ışıkla patladı!");
    }

    // terfi animasyonu
    if (tier.id > prevTier) {
      broadcast({ kind: "tier_up", payload: { userId: ev.userId, name, from: prevTier, to: tier.id, tierName: tier.name } });
      announce(`${name}, ${tier.name} oldu!`, ev.userId, 1);
    }

    // dansçı ekle (ön sıra garantisi §6: en yeni hediyeci öne)
    const wrapped = wrapName(name);
    broadcast({ kind: "dancer_add", payload: { userId: ev.userId, name, lines: wrapped.lines, tier: tier.id, diamonds: total, front: true } });

    // özel hediye eşlemesi
    const key = normalizeName(ev.giftName);
    if (giftmap.byName?.[key]) broadcast({ kind: "toast", payload: { text: `${name}: ${giftmap.byName[key].event}`, userId: ev.userId } });

    // ay slotu: en yüksek tek-seferlik (§5.3)
    if (!state.moon || total > state.moon.amount) {
      const prevMoon = state.moon;
      state.moon = { userId: ev.userId, name, amount: total };
      broadcast({ kind: "moon", payload: { ...state.moon, prev: prevMoon?.userId ?? null } });
      if (prevMoon && prevMoon.userId !== ev.userId) announce(`${name}, Ay'ı ${prevMoon.name}'den aldı!`, ev.userId, 1);
    }

    // sıralama + Büyükayı ilk 7 (§5.2) + "seni geçtiler" (§5.7)
    const before = state.leaderboard.map((r) => r.userId);
    state.leaderboard = [...state.participants.entries()]
      .map(([userId, p]) => ({ userId, name: p.name, totalDiamonds: p.total }))
      .sort((a, b) => b.totalDiamonds - a.totalDiamonds);
    broadcast({ kind: "leaderboard", payload: { top: state.leaderboard.slice(0, 7) } });
    const after = state.leaderboard.map((r) => r.userId);
    const me = after.indexOf(ev.userId);
    if (me > 0 || (me >= 0 && before[me] !== ev.userId)) {
      const passed = before.find((id, i) => i >= me && id !== ev.userId);
      if (passed) {
        const p = state.participants.get(passed);
        announce(`${name}, ${p?.name ?? "rakibini"} geçti!`, ev.userId, 2);
      }
    }

    // pencere yak (§5.1): her Yıldız+ bir pencere yakar
    if (tier.id >= 3) {
      state.windowsLit++;
      broadcast({ kind: "window_lit", payload: { userId: ev.userId, name, count: state.windowsLit } });
    }
  } else if (ev.type === "chat") {
    // katılım kapısı §3: sadece kendi adını/@adını yazan katılımcı olur
    const text = String(ev.text ?? "");
    const m1 = fuzzyMatch(text, ev.name, cfg.join.fuzzyThreshold);
    const m2 = fuzzyMatch(text.replace(/^@/, ""), ev.userId, cfg.join.fuzzyThreshold);
    if (m1.hit || m2.hit) {
      const g = gate.joinAllowed(ev.userId, now);
      if (!g.ok) return;
      const name = safeDisplayName(ev.name, moderation.patterns);
      store.touchJoin({ userId: ev.userId, name, now });
      store.log("join", ev.userId, { via: "chat" });
      if (!state.participants.has(ev.userId)) state.participants.set(ev.userId, { name, total: 0, tier: 1 });
      broadcast({ kind: "participant_add", payload: { userId: ev.userId, name, lines: wrapName(name).lines } });
      announce(`${name} vadiye katıldı!`, ev.userId, 3);
    }
  } else if (ev.type === "join_intent") {
    const g = gate.joinAllowed(ev.userId, now);
    if (!g.ok) return;
    const name = safeDisplayName(ev.name, moderation.patterns);
    store.touchJoin({ userId: ev.userId, name, now });
    if (!state.participants.has(ev.userId)) state.participants.set(ev.userId, { name, total: 0, tier: 1 });
    broadcast({ kind: "participant_add", payload: { userId: ev.userId, name, lines: wrapName(name).lines } });
  } else if (ev.type === "system") {
    if (ev.kind === "reset") {
      state.participants.clear(); state.leaderboard = []; state.moon = null;
      state.hype = 0; state.windowsLit = 0;
      broadcast({ kind: "state_full", payload: fullState() });
    } else if (ev.kind === "drop") {
      state.drops++;
      broadcast({ kind: "drop", payload: { n: state.drops, manual: true } });
    }
  }
  // tick: hype çürümesi
  if (ev.type === "tick") {
    state.hype = Math.max(0, state.hype - (cfg.hype.decayPerSecond ?? 2));
  }
}

// periyodik anlık görüntü (çökme dayanıklılığı §0)
setInterval(() => { try { store.snapshot(fullState()); } catch {} }, 30_000);

// ---- HTTP + WS ----
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css" };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  // localhost dışı REST engeli (güvenlik §11)
  const remote = req.socket.remoteAddress ?? "";
  const local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";

  if (req.method === "POST" && url.pathname === "/ingest") {
    if (!local) { res.writeHead(403); res.end("localhost only"); return; }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { handleInput(JSON.parse(body)); res.writeHead(200); res.end('{"ok":true}'); }
      catch (e) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: String(e?.message ?? e) })); }
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, state: fullState() }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/report") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, leaderboard: store.leaderboard(20), state: fullState() }));
    return;
  }
  // statik: game + admin
  let file = null;
  if (url.pathname === "/" || url.pathname === "/game") file = join(ROOT, "apps", "game", "public", "index.html");
  else if (url.pathname === "/admin") file = join(ROOT, "apps", "admin", "public", "index.html");
  else if (url.pathname.startsWith("/game/")) file = join(ROOT, "apps", "game", "public", url.pathname.slice(6));
  else if (url.pathname.startsWith("/admin/")) file = join(ROOT, "apps", "admin", "public", url.pathname.slice(7));
  if (file && existsSync(file)) {
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(404); res.end("not found");
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  sockets.add(ws);
  ws.send(JSON.stringify({ kind: "state_full", payload: fullState(), ts: Date.now() }));
  ws.on("message", (data) => {
    try { handleInput(JSON.parse(String(data))); } catch {}
  });
  ws.on("close", () => sockets.delete(ws));
});

server.listen(PORT, HOST, () => console.log(`[bridge] http://${HOST}:${PORT} game=/game admin=/admin`));
