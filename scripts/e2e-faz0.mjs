// FAZ 0 kabul testi: köprüyü ayağa kaldır, senaryoyu sok, state'i doğrula.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 8099;
const bridge = spawn("node", ["apps/bridge/server.mjs"], {
  env: { ...process.env, BRIDGE_PORT: String(PORT), BRIDGE_HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
bridge.stdout.on("data", (d) => (out += d));
bridge.stderr.on("data", (d) => (out += d));
const kill = () => { try { bridge.kill("SIGKILL"); } catch {} };
process.on("exit", kill);

async function ingest(ev) {
  const r = await fetch(`http://127.0.0.1:${PORT}/ingest`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ev),
  });
  if (!r.ok) throw new Error("ingest failed: " + (await r.text()));
}

let ok = false;
try {
  // köprü açılışını bekle
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/state`); if (r.ok) break; } catch {}
    await sleep(200);
  }
  await ingest({ type: "chat", userId: "u-elif", name: "Elif", text: "Elif" });
  await ingest({ type: "gift", userId: "u-elif", name: "Elif", giftName: "Gül", diamonds: 1, repeat: 5, repeatEnd: false }); // sayılmaz
  await ingest({ type: "gift", userId: "u-elif", name: "Elif", giftName: "Gül", diamonds: 1, repeat: 5, repeatEnd: true });  // 5 sayılır
  await ingest({ type: "gift", userId: "u-burak", name: "Burak", giftName: "Aslan", diamonds: 1500, repeat: 1, repeatEnd: true });
  await sleep(500);
  const st = await fetch(`http://127.0.0.1:${PORT}/api/state`).then((r) => r.json());
  const rep = await fetch(`http://127.0.0.1:${PORT}/api/report`).then((r) => r.json());
  console.log(JSON.stringify({ state: st.state, top: rep.leaderboard }, null, 1));
  const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
  assert(st.state.participants >= 1, "katılımcı yok");
  assert(rep.leaderboard[0]?.userId === "u-burak", "lider Burak olmalı (1500 elmas)");
  assert(rep.leaderboard.find((r) => r.userId === "u-elif")?.totalDiamonds === 5, "streak çift sayıldı ya da sayılmadı (5 olmalı)");
  assert(st.state.moon?.userId === "u-burak", "ay slotu en yüksek tekil hediyede olmalı");
  console.log("E2E FAZ0: PASS");
  ok = true;
} catch (e) {
  console.error("E2E FAZ0: FAIL —", e.message);
  console.error(out.slice(-2000));
} finally {
  kill();
  process.exit(ok ? 0 : 1);
}
