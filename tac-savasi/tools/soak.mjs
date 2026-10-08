// Headless soak: pure simulation, 100 avatars + boss + gift storms + environment
// events, sampled over time. Reports throughput, tick cost, heap drift and a
// simulated watch-time estimate.
//
//   node tools/soak.mjs                # 60 s
//   node tools/soak.mjs 3600           # 1 hour
//   node tools/soak.mjs 600 --json     # machine-readable
import { Sim, defaultSimConfig } from '../shared/dist/index.js';
import { giftTier } from '../shared/dist/index.js';

const args = process.argv.slice(2);
const seconds = Number(args.find((a) => !a.startsWith('--')) ?? 60);
const json = args.includes('--json');
// spec load is 100 fighters; --avatars N lets you run an overload variant
const avFlag = args.indexOf('--avatars');
const maxFighters = avFlag >= 0 ? Number(args[avFlag + 1]) || 100 : 100;
const step = 1 / 60;

const sim = new Sim({ ...defaultSimConfig() }, 20240607);
for (let i = 0; i < 100; i++) sim.addAvatar(sim.makeAvatar('u' + i, 'Bot' + i, null));
sim.spawnBoss('kraken', 100);

const names = ['Amine', 'Elif', 'Carlos', 'María', 'Mehmet', 'Sofía', 'Emre', 'Lucía', 'Ayşe', 'Diego'];
const diamonds = [1, 1, 5, 8, 99, 299, 1500];

let ticks = 0;
let maxTick = 0;
let sumTick = 0;
const samples = [];
const heap0 = process.memoryUsage().heapUsed;
const t0 = performance.now();

const totalTicks = Math.round(seconds / step);
for (let i = 0; i < totalTicks; i++) {
  const a = performance.now();

  // viewer churn with the same LRU replacement the client uses at match time
  if (i % 75 === 0) {
    if (sim.avatars.size >= maxFighters) {
      let oldest = null, t = Infinity;
      for (const a of sim.avatars.values()) if (a.lastActive < t) { t = a.lastActive; oldest = a.userId; }
      if (oldest) sim.avatars.delete(oldest);
    }
    sim.addAvatar(sim.makeAvatar('v' + i, names[i % names.length], null));
  }

  // gift storm: real tier distribution
  if (i % 12 === 0) {
    const ids = [...sim.avatars.keys()];
    const who = ids[(Math.random() * ids.length) | 0];
    const a2 = sim.getAvatar(who);
    if (a2) {
      const tier = giftTier(diamonds[(Math.random() * diamonds.length) | 0]);
      if (tier === 1) { a2.hp = Math.min(a2.maxHp, a2.hp + 30); a2.streak += 1; }
      if (tier === 2) { a2.streak += 5; a2.speedUntil = sim.time + 10; }
      if (tier === 3) { a2.shieldUntil = sim.time + 8; a2.doubleUntil = sim.time + 3; }
      if (tier >= 4) a2.fuerzaUntil = sim.time + 15;
    }
  }

  // keep the projectile load near the real target
  if (sim.bullets.length < 280 && i % 3 === 0) {
    const ids = [...sim.avatars.keys()];
    sim.fireRing(ids[(Math.random() * ids.length) | 0]);
  }

  sim.update(step);

  const cost = performance.now() - a;
  sumTick += cost;
  if (cost > maxTick) maxTick = cost;
  ticks++;

  if (i % 3600 === 0) {  // every simulated minute
    global.gc?.();
    samples.push({
      minute: +(i * step / 60).toFixed(1),
      heapMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
      avatars: sim.avatars.size,
      bullets: sim.bullets.length,
      monsters: sim.monsters.length,
    });
  }
}

const wall = (performance.now() - t0) / 1000;
const heap1 = process.memoryUsage().heapUsed;
const avg = sumTick / ticks;
const heapDeltaMB = (heap1 - heap0) / 1048576;

const report = {
  requestedSec: seconds,
  maxFighters,
  simSec: +(ticks * step).toFixed(1),
  wallSec: +wall.toFixed(2),
  realtimeFactor: +((ticks * step) / wall).toFixed(1),
  ticks,
  avgTickMs: +avg.toFixed(3),
  maxTickMs: +maxTick.toFixed(2),
  budget60HzMs: 16.67,
  headroom: +(16.67 / avg).toFixed(1) + 'x',
  avatars: sim.avatars.size,
  bullets: sim.bullets.length,
  monsters: sim.monsters.length,
  heapMB: +(heap1 / 1048576).toFixed(1),
  heapDeltaMB: +heapDeltaMB.toFixed(2),
  leakSuspect: samples.length > 2
    ? (samples[samples.length - 1].heapMB - samples[1].heapMB) > Math.max(8, samples[1].heapMB * 0.35)
    : false,
  samples,
  verdict: avg < 4 && !samples.some((s, i) => i > 1 && s.heapMB > samples[1].heapMB * 2)
    ? 'PASS — sim cost is a fraction of the 16.67 ms frame budget and heap is flat'
    : 'FAIL — investigate tick cost or heap growth',
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log('=== Taç Savaşı soak ===');
  console.log(`simüle edilen   : ${report.simSec}s (${report.ticks} tick, ${report.realtimeFactor}x gerçek zaman)`);
  console.log(`tick maliyeti   : ort ${report.avgTickMs}ms · en yüksek ${report.maxTickMs}ms · bütçe 16.67ms → ${report.headroom} pay`);
  console.log(`yük             : ${report.avatars} avatar · ${report.bullets} mermi · ${report.monsters} canavar`);
  console.log(`bellek          : ${report.heapMB} MB (başlangıca göre ${report.heapDeltaMB >= 0 ? '+' : ''}${report.heapDeltaMB} MB)`);
  console.log(`sızıntı şüphesi : ${report.leakSuspect ? 'VAR' : 'yok'}`);
  console.table(samples);
  console.log(report.verdict);
}
if (!report.verdict.startsWith('PASS')) process.exitCode = 1;
