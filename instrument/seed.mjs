// seed.mjs — writes a synthetic voice library, for tests and for trying the page before recording.
//
//   node seed.mjs --data <dir> [--only aa,k,m] [--mid 48]
//
// Notes are a buzzy harmonic tone shaped by each vowel's rough first two formants; hits are shaped
// noise bursts. It sounds like a machine, not like Brian — that is the point: never seed the real
// data/ directory.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHit, analyzeNote, encodeWav, midiToHz } from './dsp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RATE = 48000;
const FORMANTS = { ee: [270, 2290], ih: [390, 1990], eh: [530, 1840], ae: [660, 1720], aa: [730, 1090], aw: [570, 840], uh: [640, 1190], uu: [440, 1020], oo: [300, 870], er: [490, 1350] };

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1; }

export function synthNote(code, midi, { sec = 3, vibratoCents = 0, lead = 0.3 } = {}) {
  const [f1, f2] = FORMANTS[code] || FORMANTS[code?.[0] + code?.[0]] || [500, 1500];
  const n = Math.round((sec + lead + 0.2) * RATE), x = new Float32Array(n), f0 = midiToHz(midi);
  let phase = 0;
  for (let i = Math.round(lead * RATE); i < n - Math.round(0.2 * RATE); i++) {
    const t = i / RATE, f = f0 * 2 ** (vibratoCents * Math.sin(2 * Math.PI * 5.5 * t) / 1200);
    phase += 2 * Math.PI * f / RATE;
    let s = 0;
    for (let h = 1; h * f0 < 5000; h++) {
      const fh = h * f0, w = 1 / h + 0.8 * Math.exp(-(((fh - f1) / 120) ** 2)) + 0.4 * Math.exp(-(((fh - f2) / 200) ** 2));
      s += w * Math.sin(h * phase);
    }
    const env = Math.min(1, (t - lead) / 0.05);
    x[i] = 0.12 * env * s;
  }
  return x;
}

export function synthHit(code, seed = 1) {
  const r = rng(seed + code.length * 97 + code.charCodeAt(0));
  const long = ['s', 'sh', 'f', 'th', 'h', 'z', 'zh', 'v', 'dh'].includes(code);
  const sec = long ? 0.6 : 0.12, n = Math.round((sec + 0.4) * RATE), x = new Float32Array(n), a = Math.round(0.2 * RATE);
  let lp = 0;
  for (let i = a; i < a + sec * RATE; i++) {
    const t = (i - a) / RATE, env = long ? Math.min(1, t / 0.03) * Math.min(1, (sec - t) / 0.05) : Math.exp(-t / 0.025);
    lp += (r() - lp) * (code === 'sh' ? 0.3 : 0.9);
    x[i] = 0.5 * env * lp;
  }
  return x;
}

export function seed(dataDir, { only = null, mid = 48 } = {}) {
  const book = JSON.parse(fs.readFileSync(path.join(HERE, 'phonemes.json'), 'utf8'));
  fs.mkdirSync(path.join(dataDir, 'takes', 'old'), { recursive: true });
  const takes = {};
  for (const p of book.phonemes) {
    if (only && !only.includes(p.code)) continue;
    const slots = p.kind === 'note' ? [['low', mid - 5], ['mid', mid], ['high', mid + 5]] : [['hit', null]];
    for (const [slot, target] of slots) {
      const id = `${p.code}@${slot}`, x = p.kind === 'note' ? synthNote(p.code, target) : synthHit(p.code);
      const a = p.kind === 'note' ? analyzeNote(x, RATE, { targetMidi: target }) : analyzeHit(x, RATE);
      fs.writeFileSync(path.join(dataDir, 'takes', id + '.wav'), encodeWav(x, RATE));
      takes[id] = { ...a, id, phoneme: p.code, slot, kind: p.kind, targetMidi: target, rate: RATE, synthetic: true };
    }
  }
  fs.writeFileSync(path.join(dataDir, 'library.json'), JSON.stringify({ takes }, null, 2) + '\n');
  return takes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n, f) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : f; };
  const dir = arg('--data');
  if (!dir) { console.error('usage: node seed.mjs --data <dir>   (never the real data/ directory)'); process.exit(2); }
  if (path.resolve(dir) === path.join(HERE, 'data')) { console.error('refusing to seed the real library at data/'); process.exit(2); }
  const t = seed(path.resolve(dir), { only: arg('--only')?.split(','), mid: Number(arg('--mid', 48)) });
  console.log(`seeded ${Object.keys(t).length} synthetic takes into ${path.resolve(dir)}`);
}
