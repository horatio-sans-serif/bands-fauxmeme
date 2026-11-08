// test.mjs — hermetic checks: maths, word parsing, the server over real HTTP, the collector, and
// that the page's module script parses. No browser, no network, no microphone.
//
//   node --test test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeNote, bakeLoop, decodeWav, encodeWav, midiToHz, nearestTake, parseWord, yin } from './dsp.mjs';
import { createServer } from './server.mjs';
import { seed, synthNote } from './seed.mjs';
import { collect } from './collect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const book = JSON.parse(fs.readFileSync(path.join(HERE, 'phonemes.json'), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fauxmeme.'));
const cents = (f, ref) => 1200 * Math.log2(f / ref);

test('WAV round trip keeps samples within one 16-bit step', () => {
  const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.9);
  const { rate, samples } = decodeWav(encodeWav(x, 44100));
  assert.equal(rate, 44100);
  assert.equal(samples.length, 1000);
  for (let i = 0; i < x.length; i++) assert.ok(Math.abs(samples[i] - x[i]) < 1 / 16000);
});

test('YIN finds a sine and a buzzy voice-like tone within 5 cents', () => {
  for (const midi of [43, 48, 53, 60]) {
    const f = midiToHz(midi), sine = Float32Array.from({ length: 2048 }, (_, i) => Math.sin(2 * Math.PI * f * i / 48000));
    assert.ok(Math.abs(cents(yin(sine, 48000).hz, f)) < 5, `sine ${midi}`);
    const buzz = synthNote('aa', midi, { sec: 0.2, lead: 0 }).subarray(2000, 4048);
    assert.ok(Math.abs(cents(yin(buzz, 48000).hz, f)) < 5, `buzz ${midi}`);
  }
});

test('analyzeNote: steady tone is steady, finds the sound, and loops cleanly', () => {
  const x = synthNote('aa', 48);
  const a = analyzeNote(x, 48000, { targetMidi: 48 });
  assert.ok(a.ok);
  assert.ok(Math.abs(a.start - 0.3 * 48000) < 0.05 * 48000, `start ${a.start}`);
  assert.ok(Math.abs(a.offTargetCents) < 3, `off ${a.offTargetCents}`);
  assert.ok(a.spreadCents < 2, `spread ${a.spreadCents}`);
  assert.ok(a.seamDb < -20, `seam ${a.seamDb}`);
  assert.ok(a.loopStart > a.start && a.loopEnd < a.end && a.loopEnd - a.loopStart > 0.1 * 48000);
});

test('analyzeNote: vibrato shows up as a wider spread', () => {
  const a = analyzeNote(synthNote('ee', 48, { vibratoCents: 40 }), 48000, { targetMidi: 48 });
  assert.ok(a.ok && a.spreadCents > TOL_SPREAD(), `spread ${a.spreadCents}`);
});
function TOL_SPREAD() { return 15; }

test('analyzeNote: silence is rejected with a reason', () => {
  const a = analyzeNote(new Float32Array(48000 * 3), 48000);
  assert.equal(a.ok, false);
  assert.match(a.why, /./);
});

test('bakeLoop: the sample before the jump equals the one before loopStart', () => {
  const x = synthNote('oo', 50, { vibratoCents: 30 });
  const a = analyzeNote(x, 48000);
  const y = bakeLoop(x, a.loopStart, a.loopEnd, a.xf);
  assert.ok(Math.abs(y[a.loopEnd - 1] - x[a.loopStart - 1]) < 1e-6);
  assert.equal(y[a.loopStart], x[a.loopStart]);
});

test('parseWord splits into syllables, with consonants before and after', () => {
  const p = t => parseWord(t, book.phonemes, book.aliases);
  assert.deepEqual(p('kaa lu mi nos').syllables, [
    { onset: ['k'], nucleus: 'aa', coda: [] }, { onset: ['l'], nucleus: 'oo', coda: [] },
    { onset: ['m'], nucleus: 'ee', coda: [] }, { onset: ['n'], nucleus: 'oh', coda: ['s'] },
  ]);
  assert.deepEqual(p('kaalsmi').syllables.map(s => [s.onset, s.nucleus, s.coda]), [[['k'], 'aa', ['l', 's']], [['m'], 'ee', []]]);
  assert.deepEqual(p('shng').syllables, [{ onset: ['sh', 'ng'], nucleus: null, coda: [] }]);
  assert.deepEqual(p('kaq').unknown, ['q']);
});

test('nearestTake picks the closest recorded pitch', () => {
  assert.equal(nearestTake([{ midi: 43 }, { midi: 48 }, { midi: 53 }], 51).midi, 53);
  assert.equal(nearestTake([], 51), null);
});

async function withServer(fn) {
  const dir = tmp(), srv = createServer(dir);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, dir); } finally { srv.close(); }
}

test('server: a take saved over HTTP comes back byte-identical, and a re-record keeps the old one', () => withServer(async (base, dir) => {
  const wav = encodeWav(synthNote('aa', 48, { sec: 1 }), 48000);
  const put = (body, meta) => fetch(`${base}/api/take/aa%40mid`, { method: 'PUT', body, headers: { 'x-take-meta': encodeURIComponent(JSON.stringify(meta)) } });
  assert.equal((await put(wav, { kind: 'note', n: 1 })).status, 200);
  const lib = await (await fetch(`${base}/api/library`)).json();
  assert.equal(lib.takes['aa@mid'].n, 1);
  const back = new Uint8Array(await (await fetch(`${base}/takes/aa@mid.wav`)).arrayBuffer());
  assert.deepEqual(back, wav);
  assert.equal((await put(wav, { kind: 'note', n: 2 })).status, 200);
  assert.equal(fs.readdirSync(path.join(dir, 'takes', 'old')).length, 1);
  assert.equal((await (await fetch(`${base}/api/library`)).json()).takes['aa@mid'].n, 2);
}));

test('server: refuses bad ids, non-WAV bodies, and paths outside the library', () => withServer(async base => {
  const meta = { 'x-take-meta': encodeURIComponent('{}') };
  assert.equal((await fetch(`${base}/api/take/..%2Fx`, { method: 'PUT', body: 'RIFF', headers: meta })).status, 400);
  assert.equal((await fetch(`${base}/api/take/aa%40mid`, { method: 'PUT', body: 'hello there, not audio', headers: meta })).status, 400);
  assert.equal((await fetch(`${base}/takes/..%2F..%2Fserver.wav`)).status, 404);
  assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/`)).status, 200);
}));

test('server: settings and metrics round-trip', () => withServer(async base => {
  await fetch(`${base}/api/settings`, { method: 'PUT', body: JSON.stringify({ midNote: 45, pads: ['k'] }) });
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), { midNote: 45, pads: ['k'] });
  await fetch(`${base}/api/metrics`, { method: 'POST', body: JSON.stringify({ latencyMs: 12 }) });
  const m = await (await fetch(`${base}/api/metrics`, { method: 'POST', body: '{}' })).json();
  assert.equal(m.latencyMs, 12);
}));

test('collector: a full synthetic library covers every slot and passes the maths criteria', () => {
  const dir = tmp();
  seed(dir);
  const c = collect(dir);
  assert.equal(c.recorded, c.listed);
  assert.equal(c.coverage, 1);
  assert.equal(c.synthetic, c.listed);
  assert.deepEqual(c.failed, []);
  assert.ok(c.notes.medianSpreadCents < 15 && c.notes.medianSeamDb < -10, JSON.stringify(c.notes));
});

test('page: the module script parses, and every element id it looks up exists', () => {
  const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const f = path.join(tmp(), 'page.mjs');
  fs.writeFileSync(f, js);
  execFileSync(process.execPath, ['--check', f]);
  const ids = [...js.matchAll(/\$\('([a-z]+)'\)/g)].map(m => m[1]);
  for (const id of new Set(ids)) assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
});
