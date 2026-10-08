// Generates the two starter music loops as 16-bit mono WAV files.
// Loop-safe by construction: every partial completes an integer number of
// cycles over the loop length, envelopes return to ~silence at the boundary.
// Original synth compositions — replace with your own tracks freely.
//
//   node tools/gen-music.mjs        -> assets/audio/music-{calm,intense}.wav
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;
const DUR = 8;                       // seconds; all partials are integer-cycle over this
const N = SR * DUR;

function writeWav(file, samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.42 / peak : 1;   // leave headroom for the in-game mix
  const data = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] * gain));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
  console.log(`${file}: ${(data.length / 1024).toFixed(0)} KB, peak-normalized`);
}

const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
// short pluck with fast decay (loop-safe: ~silent 0.5s after attack)
const pluck = (f, t0, t, amp, tau = 0.12) =>
  t < t0 ? 0 : amp * Math.exp(-(t - t0) / tau) * sine(f, t - t0);

// ---- calm: A-major ambient (pad swell + slow pentatonic arpeggio) ----
function calm() {
  const out = new Float64Array(N);
  const padFreqs = [220, 275, 330];           // A2 C#3 E3 — integer-cycle over 8s
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const swell = 0.5 + 0.5 * sine(1 / DUR, t); // 1 swell per loop, 0 at both ends
    let v = 0;
    for (const f of padFreqs) v += 0.055 * sine(f, t) * (0.6 + 0.4 * swell);
    v += 0.04 * sine(110, t);                  // soft sub root
    out[i] = v;
  }
  const seq = [440, 550, 660, 550, 740, 660, 880, 660, 740, 550, 660, 550, 440, 550, 440, 550];
  seq.forEach((f, k) => {
    const t0 = k * 0.5;
    for (let i = Math.floor(t0 * SR); i < N; i++) {
      const t = i / SR;
      out[i] += pluck(f, t0, t, 0.16) + 0.4 * pluck(f * 2, t0 + 0.02, t, 0.05);
    }
  });
  return out;
}

// ---- intense: A-minor drive (pulsing bass + minor arpeggio) ----
function intense() {
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let v = 0.05 * sine(220, t) + 0.045 * sine(264, t) + 0.04 * sine(330, t);
    out[i] = v;
  }
  for (let k = 0; k < 32; k++) {              // 8th-note bass, A1/E2
    const t0 = k * 0.25;
    const f = k % 2 ? 165 : 110;
    const i0 = Math.floor(t0 * SR);
    for (let i = i0; i < N && i < i0 + SR * 0.5; i++) {
      const t = i / SR;
      out[i] += pluck(f, t0, t, 0.15, 0.08);
    }
  }
  const seq = [440, 528, 660, 528, 440, 660, 528, 440, 528, 660, 880, 660, 528, 440, 528, 440];
  seq.forEach((f, k) => {
    const t0 = k * 0.5;
    for (let i = Math.floor(t0 * SR); i < N; i++) {
      const t = i / SR;
      out[i] += pluck(f, t0, t, 0.11) + 0.4 * pluck(f * 2, t0 + 0.02, t, 0.04);
    }
  });
  return out;
}

const dir = path.resolve('assets', 'audio');
fs.mkdirSync(dir, { recursive: true });
writeWav(path.join(dir, 'music-calm.wav'), calm());
writeWav(path.join(dir, 'music-intense.wav'), intense());

// loop-continuity self-check: boundary samples must match for a click-free loop
for (const f of ['music-calm.wav', 'music-intense.wav']) {
  const buf = fs.readFileSync(path.join(dir, f));
  const data = buf.subarray(44);
  const first = data.readInt16LE(0);
  const last = data.readInt16LE(data.length - 2);
  console.log(`${f}: boundary ${first} -> ${last} ${Math.abs(first - last) < 400 ? '(loop-safe)' : '(CLICK RISK!)'}`);
}
