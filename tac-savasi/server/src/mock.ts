// Mock event generator: CLI + programmatic scenarios (storm, boss, mercy, tide, reconnect).
import type { LiveEvent } from '@tac/shared';

const NAMES = ['Amine', 'Elif', 'Carlos', 'María', 'Mehmet', 'Sofía', 'Emre', 'Lucía', 'Ayşe', 'Diego', 'Zeynep', 'Juan', 'Fatma', 'Pedro', 'Deniz'];
const GIFTS: [string, number][] = [['Rose', 1], ['Heart', 5], ['Coffee', 30], ['Hat', 99], ['Motor', 299], ['Yacht', 1000], ['Castle', 5000]];

export function mockJoin(i: number): LiveEvent {
  const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + Math.floor(i / NAMES.length) : '');
  return { type: 'join', id: `j${i}-${Date.now()}`, userId: `u${i}`, name, pic: null };
}
export function mockGift(i: number, big = false): LiveEvent {
  const [giftName, diamonds] = big ? GIFTS[5 + (i % 2)] : GIFTS[i % GIFTS.length];
  return { type: 'gift', id: `g${i}-${Date.now()}-${Math.random()}`, userId: `u${i % 40}`, name: NAMES[i % NAMES.length], pic: null, giftName, diamonds, n: 1, repeatEnd: true };
}

export async function* scenario(name: string, viewers = 60): AsyncGenerator<LiveEvent> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  if (name === 'storm' || name === 'giftstorm') {
    for (let i = 0; i < viewers; i++) { yield mockJoin(i); }
    for (let i = 0; i < 200; i++) { yield mockGift(i, i % 7 === 0); await wait(15); }
  } else if (name === 'boss') {
    for (let i = 0; i < 30; i++) yield mockJoin(i);
    for (let i = 0; i < 20; i++) yield mockGift(i);
    yield { type: 'chat', id: 'boss-now', userId: 'u1', name: NAMES[1], pic: null, text: '!fuego' };
  } else if (name === 'mercy') {
    for (let i = 0; i < 10; i++) yield mockJoin(i);
    yield { type: 'chat', id: 'm1', userId: 'u2', name: NAMES[2], pic: null, text: '!responde' };
    yield mockGift(1, true);
  } else if (name === 'tide') {
    for (let i = 0; i < viewers; i++) yield mockJoin(i);
    for (let i = 0; i < 50; i++) { yield { type: 'like', id: `l${i}`, userId: `u${i % 20}`, name: NAMES[i % NAMES.length], pic: null, n: 10 }; await wait(20); }
  } else { // reconnect / default soak
    for (let i = 0; i < viewers; i++) yield mockJoin(i);
    let k = 0;
    while (true) { yield mockGift(k++, k % 20 === 0); await wait(100); if (k > 60) break; }
  }
}

// CLI runner: `tsx src/mock.ts storm --viewers 100` prints JSONL to stdout.
const entry = process.argv[1] ?? '';
if (entry.endsWith('mock.ts')) {
  const cliName = process.argv[2] ?? 'default';
  const vi = process.argv.indexOf('--viewers');
  const cliViewers = vi >= 0 ? Number(process.argv[vi + 1] ?? 60) : 60;
  for await (const e of scenario(cliName, cliViewers)) console.log(JSON.stringify(e));
  process.exit(0);
}
