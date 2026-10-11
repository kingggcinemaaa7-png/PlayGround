// Simülatör: sahte yayın + kayıt/oynatma (Master Plan §0, §9)
// Kullanım:
//   node sim.mjs --scenario scenario-3min.mjs [--record out.jsonl]
//   node sim.mjs --play out.jsonl [--speed 10]
//   node sim.mjs --burst 500  (500 olay patlaması — kaos testi)
import { readFileSync, createWriteStream } from "node:fs";
import WebSocket from "ws";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) =>
  a.startsWith("--") ? [a.slice(2), arr[i + 1]?.startsWith("--") ? true : arr[i + 1]] : []).filter(Boolean));
const URL = process.env.BRIDGE_URL ?? "ws://127.0.0.1:8081";
const REST = URL.replace(/^ws/, "http");

async function send(ev) {
  const r = await fetch(`${REST}/ingest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ev) });
  if (!r.ok) throw new Error("ingest " + r.status + " " + await r.text());
}

async function scenarioFile(f, record) {
  const mod = await import(f);
  const events = mod.default ?? mod.events;
  const out = record ? createWriteStream(record) : null;
  for (const ev of events) {
    if (ev.waitMs) { await new Promise((r) => setTimeout(r, ev.waitMs)); continue; }
    await send(ev);
    out?.write(JSON.stringify(ev) + "\n");
    console.log(">", ev.type, ev.userId ?? ev.kind ?? "", ev.giftName ?? ev.text ?? "");
  }
  out?.end();
}

async function play(file, speed = 1) {
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  let t0 = null;
  for (const ev of lines) {
    await send(ev);
    console.log("replay>", ev.type, ev.userId ?? "");
    await new Promise((r) => setTimeout(r, 1000 / speed / 10));
  }
}

async function burst(n = 500) {
  for (let i = 0; i < n; i++) {
    await send({ type: "gift", userId: "u-burst-" + (i % 50), name: "Burst " + (i % 50), giftName: "Gül", diamonds: 1, repeat: 1, repeatEnd: true });
  }
  console.log(`burst done: ${n}`);
}

if (args.play) await play(args.play, Number(args.speed ?? 1));
else if (args.burst) await burst(Number(typeof args.burst === "string" ? args.burst : 500));
else await scenarioFile(args.scenario ?? "./scenario-3min.mjs", args.record);
console.log("sim OK");
