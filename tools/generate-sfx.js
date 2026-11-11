// Synthesises the overlay's seven sound effects from scratch (no samples, no
// third-party audio, no speech). Deterministic: rerunning gives identical files.
//   node tools/generate-sfx.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'overlay', 'sfx');
const TAU = Math.PI * 2;

function track(seconds, rate = 44100) {
  return { rate, data: new Float64Array(Math.ceil(seconds * rate)) };
}

// Linear congruential noise so the files are reproducible.
function noiseSource(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

/** Adds a tone. freq may be a number or (u in 0..1) => Hz. harmonics: [[multiple, amplitude], ...] */
function tone(tr, { at = 0, dur, freq, amp = 0.3, attack = 0.005, release = 0.1, harmonics = [[1, 1]], vibrato = 0 }) {
  const n = Math.floor(dur * tr.rate);
  const start = Math.floor(at * tr.rate);
  const phases = harmonics.map(() => 0);
  for (let i = 0; i < n && start + i < tr.data.length; i++) {
    const t = i / tr.rate;
    const u = i / n;
    const f = (typeof freq === 'function' ? freq(u) : freq) * (1 + vibrato * Math.sin(TAU * 5.3 * t));
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release) * Math.exp(-2.2 * u);
    let v = 0;
    harmonics.forEach(([mult, a], h) => {
      phases[h] += (TAU * f * mult) / tr.rate;
      v += a * Math.sin(phases[h]);
    });
    tr.data[start + i] += v * amp * env;
  }
}

/** Adds filtered noise (one-pole low-pass whose cutoff may sweep). */
function hiss(tr, { at = 0, dur, amp = 0.2, cutoff = 2000, seed = 1, shape = (u) => Math.sin(Math.PI * u) }) {
  const rnd = noiseSource(seed);
  const n = Math.floor(dur * tr.rate);
  const start = Math.floor(at * tr.rate);
  let y = 0;
  for (let i = 0; i < n && start + i < tr.data.length; i++) {
    const u = i / n;
    const fc = typeof cutoff === 'function' ? cutoff(u) : cutoff;
    const k = 1 - Math.exp((-TAU * fc) / tr.rate);
    y += k * (rnd() - y);
    tr.data[start + i] += y * amp * shape(u);
  }
}

function echo(tr, delay = 0.11, feedback = 0.35, mix = 0.4) {
  const d = Math.floor(delay * tr.rate);
  const wet = new Float64Array(tr.data.length);
  for (let i = d; i < tr.data.length; i++) wet[i] = tr.data[i - d] + wet[i - d] * feedback;
  for (let i = 0; i < tr.data.length; i++) tr.data[i] += wet[i] * mix;
}

function write(name, tr, peak = 0.85) {
  let max = 0;
  for (const v of tr.data) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? peak / max : 1;
  const pcm = Buffer.alloc(tr.data.length * 2);
  tr.data.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(tr.rate, 24);
  head.writeUInt32LE(tr.rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(OUT, name), Buffer.concat([head, pcm]));
  console.log(`${name}  ${(tr.data.length / tr.rate).toFixed(2)}s  ${Math.round((pcm.length + 44) / 1024)} KB`);
}

const BELL = [[1, 1], [2.01, 0.45], [3.02, 0.2], [4.2, 0.1]];
const SOFT = [[1, 1], [2, 0.25], [3, 0.08]];
const note = (semitonesFromA4) => 440 * 2 ** (semitonesFromA4 / 12);

fs.mkdirSync(OUT, { recursive: true });

// 1) cheap tier: a quick two-note "pip"
{
  const t = track(0.4);
  tone(t, { dur: 0.16, freq: (u) => note(3) * (1 + 0.06 * u), amp: 0.5, harmonics: SOFT });
  tone(t, { at: 0.09, dur: 0.26, freq: note(10), amp: 0.5, harmonics: SOFT });
  write('tier1.wav', t, 0.6);
}

// 2) mid tier: rising three-note bell arpeggio
{
  const t = track(1.0);
  [0, 4, 7].forEach((s, i) => tone(t, { at: i * 0.09, dur: 0.6, freq: note(3 + s), amp: 0.4, harmonics: BELL }));
  echo(t, 0.12, 0.3, 0.3);
  write('tier2.wav', t, 0.7);
}

// 3) rare tier: shimmer sweep into a wide chord
{
  const t = track(1.9);
  hiss(t, { dur: 0.7, amp: 0.25, cutoff: (u) => 600 + 7000 * u * u, seed: 7, shape: (u) => u * u });
  [0, 4, 7, 11, 14].forEach((s, i) =>
    tone(t, { at: 0.45 + i * 0.05, dur: 1.2, freq: note(-2 + s), amp: 0.3, harmonics: BELL, vibrato: 0.003 }),
  );
  tone(t, { at: 0.45, dur: 0.5, freq: (u) => 180 - 90 * u, amp: 0.5, harmonics: [[1, 1]] });
  echo(t, 0.16, 0.4, 0.4);
  write('tier3.wav', t, 0.8);
}

// 4) legendary tier: long riser, impact, bright sustained chord
{
  const t = track(3.4);
  hiss(t, { dur: 1.1, amp: 0.3, cutoff: (u) => 300 + 9000 * u ** 3, seed: 11, shape: (u) => u ** 1.5 });
  tone(t, { dur: 1.1, freq: (u) => 110 * 2 ** (2 * u), amp: 0.25, release: 0.02, harmonics: [[1, 1], [2, 0.5], [3, 0.3]] });
  tone(t, { at: 1.1, dur: 0.9, freq: (u) => 120 - 70 * u, amp: 0.9, harmonics: [[1, 1], [0.5, 0.6]] });
  hiss(t, { at: 1.1, dur: 0.5, amp: 0.4, cutoff: (u) => 6000 - 5000 * u, seed: 13, shape: (u) => (1 - u) ** 2 });
  [-12, 0, 4, 7, 12, 16, 19].forEach((s, i) =>
    tone(t, { at: 1.12 + i * 0.035, dur: 2.2, freq: note(-5 + s), amp: 0.26, harmonics: BELL, vibrato: 0.004 }),
  );
  echo(t, 0.19, 0.45, 0.45);
  write('tier4.wav', t, 0.9);
}

// 5) leaderboard change: short two-step "tick-up"
{
  const t = track(0.7);
  tone(t, { dur: 0.12, freq: note(7), amp: 0.4, harmonics: [[1, 1], [3, 0.3], [5, 0.12]] });
  tone(t, { at: 0.11, dur: 0.12, freq: note(7), amp: 0.3, harmonics: [[1, 1], [3, 0.3], [5, 0.12]] });
  tone(t, { at: 0.22, dur: 0.42, freq: note(14), amp: 0.45, harmonics: BELL });
  write('leaderboard.wav', t, 0.6);
}

// 6) season finale: slow four-chord fanfare
{
  const t = track(6.2);
  const chords = [
    [-12, 0, 4, 7],
    [-10, 2, 5, 9],
    [-7, 0, 5, 9],
    [-12, 0, 4, 7, 12, 16],
  ];
  chords.forEach((ch, c) =>
    ch.forEach((s, i) =>
      tone(t, { at: c * 1.05 + i * 0.03, dur: c === 3 ? 3.0 : 1.3, freq: note(-9 + s), amp: 0.24, harmonics: BELL, vibrato: 0.003 }),
    ),
  );
  [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(t, { at: 3.2 + i * 0.11, dur: 1.4, freq: note(3 + s), amp: 0.16, harmonics: SOFT }));
  hiss(t, { at: 2.6, dur: 0.65, amp: 0.2, cutoff: (u) => 500 + 8000 * u * u, seed: 5, shape: (u) => u * u });
  echo(t, 0.23, 0.45, 0.45);
  write('season.wav', t, 0.9);
}

// 7) idle bed: a 32 s drone. Every partial and LFO completes a whole number of
//    cycles in 32 s, so the file loops without a click; the overlay also drifts
//    its volume on unrelated periods so the loop point is not audible as a pattern.
{
  const LEN = 32;
  const t = track(LEN, 22050);
  const partials = [
    [3520 / 32, 0.5, 1 / 32, 0],
    [5280 / 32, 0.35, 2 / 32, 1.3],
    [7040 / 32, 0.28, 3 / 32, 2.1],
    [8864 / 32, 0.16, 5 / 32, 0.7],
    [10560 / 32, 0.12, 4 / 32, 4.0],
    [14080 / 32, 0.06, 7 / 32, 2.9],
  ];
  for (let i = 0; i < t.data.length; i++) {
    const s = i / t.rate;
    let v = 0;
    for (const [f, a, lfo, ph] of partials) v += a * (0.55 + 0.45 * Math.sin(TAU * lfo * s + ph)) * Math.sin(TAU * f * s);
    t.data[i] = v;
  }
  hiss(t, { dur: LEN, amp: 0.5, cutoff: 500, seed: 3, shape: (u) => 0.5 + 0.5 * Math.sin(TAU * 3 * u) ** 2 });
  const fade = Math.floor(0.05 * t.rate); // noise layer is not periodic: crossfade its seam
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    t.data[i] = t.data[i] * k + t.data[t.data.length - fade + i] * (1 - k);
  }
  t.data = t.data.subarray(0, t.data.length - fade);
  write('idle.wav', t, 0.5);
}
