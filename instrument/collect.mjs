// collect.mjs — the assess collector. Re-measures every saved take from its raw WAV (not from the
// numbers the page stored) and prints one JSON object for `assess run`.
//
//   node collect.mjs [--data ./data]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHit, analyzeNote, decodeWav } from './dsp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function collect(dataDir) {
  const book = JSON.parse(fs.readFileSync(path.join(HERE, 'phonemes.json'), 'utf8'));
  const listed = book.phonemes.reduce((n, p) => n + (p.kind === 'note' ? 3 : 1), 0);
  let lib = { takes: {} }, metrics = {};
  try { lib = JSON.parse(fs.readFileSync(path.join(dataDir, 'library.json'), 'utf8')); } catch { }
  try { metrics = JSON.parse(fs.readFileSync(path.join(dataDir, 'metrics.json'), 'utf8')); } catch { }
  const notes = [], failed = [];
  let recorded = 0, synthetic = 0;
  for (const meta of Object.values(lib.takes)) {
    const f = path.join(dataDir, 'takes', meta.id + '.wav');
    if (!fs.existsSync(f)) { failed.push(`${meta.id}: wav missing`); continue; }
    const { rate, samples } = decodeWav(fs.readFileSync(f));
    const a = meta.kind === 'note' ? analyzeNote(samples, rate, { targetMidi: meta.targetMidi }) : analyzeHit(samples, rate);
    if (!a.ok) { failed.push(`${meta.id}: ${a.why}`); continue; }
    recorded++;
    if (meta.synthetic) synthetic++;
    if (meta.kind === 'note') notes.push({ id: meta.id, spreadCents: a.spreadCents, seamDb: a.seamDb });
  }
  const sorted = k => notes.map(n => n[k]).sort((a, b) => a - b);
  const med = a => a.length ? a[a.length >> 1] : null;
  const worst = (k, dir) => notes.length ? notes.reduce((w, n) => (dir * n[k] > dir * w[k] ? n : w)) : null;
  return {
    listed, recorded, coverage: recorded / listed, synthetic, failed,
    notes: {
      count: notes.length,
      medianSpreadCents: med(sorted('spreadCents')),
      worstSpread: worst('spreadCents', 1),
      medianSeamDb: med(sorted('seamDb')),
      worstSeam: worst('seamDb', 1),
    },
    latencyMs: metrics.latencyMs ?? null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--data');
  console.log(JSON.stringify(collect(path.resolve(i > 0 ? process.argv[i + 1] : path.join(HERE, 'data'))), null, 2));
}
