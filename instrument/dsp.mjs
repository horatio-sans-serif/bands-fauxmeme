// dsp.mjs — the sound maths, shared by the instrument page (browser) and the Node tests and
// collector. Pure functions over Float32Array, no dependencies, so both sides run the same code.

export const midiToHz = m => 440 * 2 ** ((m - 69) / 12);
export const hzToMidi = f => 69 + 12 * Math.log2(f / 440);
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = m => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

// ---------- WAV ----------

// 16-bit PCM mono. Values are clipped to [-1, 1].
export function encodeWav(x, rate) {
  const n = x.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
  return new Uint8Array(buf);
}

// Reads 16-bit PCM or 32-bit float, any channel count (mixed down to mono).
export function decodeWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let o = 12, fmt = null, data = null;
  while (o + 8 <= u8.length) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') data = { at: o + 8, size: Math.min(size, u8.length - o - 8) };
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV missing fmt or data chunk');
  const { format, channels, rate, bits } = fmt, bps = bits / 8, frames = Math.floor(data.size / (bps * channels));
  const x = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) {
      const at = data.at + (i * channels + c) * bps;
      s += format === 3 && bits === 32 ? v.getFloat32(at, true) : bits === 16 ? v.getInt16(at, true) / 32768 : NaN;
    }
    x[i] = s / channels;
  }
  if (Number.isNaN(x[0])) throw new Error(`unsupported WAV: format ${format}, ${bits}-bit`);
  return { rate, samples: x };
}

// ---------- level and trimming ----------

const db = r => 20 * Math.log10(Math.max(r, 1e-12));

function windowRms(x, rate, ms = 10) {
  const w = Math.max(1, Math.round(rate * ms / 1000)), out = new Float32Array(Math.ceil(x.length / w));
  for (let k = 0; k < out.length; k++) {
    let s = 0, n = 0;
    for (let i = k * w; i < Math.min(x.length, (k + 1) * w); i++, n++) s += x[i] * x[i];
    out[k] = Math.sqrt(s / Math.max(1, n));
  }
  return { w, out };
}

// Where the sound starts and ends: the first and last 10 ms window within floorDb of the loudest one.
export function trim(x, rate, { floorDb = -40, padMs = 20 } = {}) {
  const { w, out } = windowRms(x, rate);
  let peak = 0; for (const r of out) peak = Math.max(peak, r);
  if (peak < 1e-5) return { start: 0, end: 0, peakDb: db(peak) };
  const thr = peak * 10 ** (floorDb / 20);
  let a = out.findIndex(r => r >= thr), b = out.length - 1;
  while (b > a && out[b] < thr) b--;
  const pad = Math.round(rate * padMs / 1000);
  return { start: Math.max(0, a * w - pad), end: Math.min(x.length, (b + 1) * w + pad), peakDb: db(peak) };
}

// ---------- pitch ----------

// YIN (de Cheveigné & Kawahara 2002): cumulative-mean-normalised difference, absolute threshold,
// parabolic interpolation. frame.length must be at least twice rate/fmin.
export function yin(frame, rate, { fmin = 60, fmax = 1000, threshold = 0.15 } = {}) {
  const W = frame.length >> 1;
  const tauMin = Math.max(2, Math.floor(rate / fmax)), tauMax = Math.min(W - 1, Math.ceil(rate / fmin));
  const c = new Float32Array(tauMax + 2);
  c[0] = 1;
  let run = 0, tau = -1;
  // Computed lazily: stop one lag past the first dip under the threshold, which is usually the
  // period itself, so a low voice costs far less than scanning every lag down to fmin.
  for (let t = 1; t <= Math.min(tauMax + 1, W - 1); t++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const d = frame[i] - frame[i + t]; s += d * d; }
    run += s;
    c[t] = run > 0 ? s * t / run : 1;
    const p = t - 1;
    if (p >= tauMin && c[p] < threshold && c[t] >= c[p]) { tau = p; break; }
  }
  if (tau < 0) return { hz: NaN, clarity: 0 };
  const a = c[tau - 1], b = c[tau], d = c[tau + 1] ?? b, den = a - 2 * b + d;
  const shift = den ? Math.max(-1, Math.min(1, 0.5 * (a - d) / den)) : 0;
  return { hz: rate / (tau + shift), clarity: 1 - b };
}

export function pitchTrack(x, rate, start = 0, end = x.length, { frame = 2048, hop = 512, fmin = 60, fmax = 1000 } = {}) {
  const track = [];
  for (let i = start; i + frame <= end; i += hop) {
    const f = x.subarray(i, i + frame);
    let s = 0; for (let k = 0; k < frame; k++) s += f[k] * f[k];
    const voiced = Math.sqrt(s / frame) > 1e-3;
    track.push({ at: i + frame / 2, hz: voiced ? yin(f, rate, { fmin, fmax }).hz : NaN });
  }
  return track;
}

const cents = (f, ref) => 1200 * Math.log2(f / ref);
const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };

// The steadiest stretch of the pitch track: the window of `len` frames, all voiced, whose pitch
// varies least (standard deviation in cents). This is the part that gets looped when a key is held.
export function steadiest(track, len) {
  let best = null;
  for (let i = 0; i + len <= track.length; i++) {
    const hz = track.slice(i, i + len).map(t => t.hz);
    if (hz.some(h => !Number.isFinite(h))) continue;
    const ref = median(hz), c = hz.map(h => cents(h, ref));
    const mean = c.reduce((s, v) => s + v, 0) / len;
    const sd = Math.sqrt(c.reduce((s, v) => s + (v - mean) ** 2, 0) / len);
    if (!best || sd < best.spreadCents) best = { i0: i, i1: i + len, hz: ref, spreadCents: sd };
  }
  return best;
}

// ---------- loops ----------

function risingZero(x, near, radius) {
  let best = -1;
  for (let d = 0; d <= radius; d++) {
    for (const i of [near - d, near + d]) {
      if (i > 0 && i < x.length && x[i - 1] < 0 && x[i] >= 0) { best = i; break; }
    }
    if (best >= 0) break;
  }
  return best >= 0 ? best : near;
}

// How different the two stretches that get crossfaded are, in dB of their energy: -inf when they
// are identical, about +3 dB when they are unrelated. The crossfade hides the seam either way;
// this says whether it has to hide much (an audible wobble once per loop).
export function seamDb(x, loopStart, loopEnd, xf) {
  let diff = 0, sig = 0;
  for (let i = 0; i < xf; i++) {
    const a = x[loopEnd - xf + i], b = x[loopStart - xf + i];
    diff += (a - b) ** 2; sig += a * a;
  }
  return 10 * Math.log10(Math.max(diff, 1e-20) / Math.max(sig, 1e-20));
}

// Bakes a crossfade into a copy of x so that playing [loopStart, loopEnd) on repeat has no step:
// the last xf samples before loopEnd fade into the xf samples before loopStart, so the sample
// played just before the jump equals the one that naturally precedes loopStart.
export function bakeLoop(x, loopStart, loopEnd, xf) {
  const y = Float32Array.from(x);
  xf = Math.min(xf, loopStart, loopEnd - loopStart);
  for (let i = 0; i < xf; i++) {
    const w = (i + 1) / xf;
    y[loopEnd - xf + i] = x[loopEnd - xf + i] * (1 - w) + x[loopStart - xf + i] * w;
  }
  return y;
}

// Everything the instrument needs to know about one sung take.
export function analyzeNote(x, rate, { targetMidi = null, steadySec = 0.6, loopSec = 0.4, xfSec = 0.03 } = {}) {
  const { start, end, peakDb } = trim(x, rate);
  const hop = 512, frame = 2048;
  const track = pitchTrack(x, rate, start, end, { frame, hop });
  const len = Math.max(3, Math.min(track.length, Math.round(steadySec * rate / hop)));
  const st = steadiest(track, len) || steadiest(track, Math.max(3, len >> 1));
  if (!st) return { ok: false, why: 'no steady pitched stretch found — sing longer, or closer to the mic', start, end, peakDb };
  const hz = st.hz, period = rate / hz, xf = Math.round(xfSec * rate);
  const segA = track[st.i0].at, segB = track[st.i1 - 1].at;
  const loopStart = risingZero(x, Math.max(start + xf, segA), Math.round(period));
  // A period is rarely a whole number of samples, so try loops of several period counts and a
  // sample either side, and keep the join that matches best.
  const k0 = Math.max(1, Math.round(Math.min(loopSec, (segB - loopStart) / rate) * hz));
  let loopEnd = Math.round(loopStart + k0 * period), bestErr = Infinity;
  for (let k = Math.max(1, k0 - 6); k <= k0 + 6; k++) {
    for (let d = -1; d <= 1; d++) {
      const i = Math.round(loopStart + k * period) + d;
      if (i <= loopStart + xf || i >= x.length || i > segB + period) continue;
      const e = seamDb(x, loopStart, i, xf);
      if (e < bestErr) { bestErr = e; loopEnd = i; }
    }
  }
  return {
    ok: true, start, end, peakDb, hz, midi: hzToMidi(hz),
    spreadCents: st.spreadCents,
    offTargetCents: targetMidi == null ? null : cents(hz, midiToHz(targetMidi)),
    loopStart, loopEnd, xf, seamDb: seamDb(x, loopStart, loopEnd, xf),
  };
}

export function analyzeHit(x, rate) {
  const { start, end, peakDb } = trim(x, rate, { floorDb: -45, padMs: 5 });
  if (end <= start) return { ok: false, why: 'nothing heard — closer to the mic', start, end, peakDb };
  return { ok: true, start, end, peakDb, lengthMs: (end - start) / rate * 1000 };
}

// ---------- words ----------

// Splits typed text into syllables. Codes match longest first ("ng" before "n"); aliases let a
// single vowel letter stand for a code. A space or hyphen ends a syllable; inside one token, each
// vowel starts a new syllable and takes one consonant before it as its onset.
export function parseWord(text, phonemes, aliases = {}) {
  const table = new Map(phonemes.map(p => [p.code, p]));
  for (const [a, code] of Object.entries(aliases)) if (!table.has(a)) table.set(a, table.get(code));
  const keys = [...table.keys()].sort((p, q) => q.length - p.length);
  const syllables = [], unknown = [];
  for (const token of String(text).toLowerCase().split(/[\s\-]+/).filter(Boolean)) {
    const seq = [];
    for (let i = 0; i < token.length;) {
      const k = keys.find(key => token.startsWith(key, i));
      if (!k) { unknown.push(token[i]); i++; continue; }
      seq.push(table.get(k).code); i += k.length;
    }
    const isV = c => table.get(c)?.vowel === true;
    const vowels = seq.map((c, i) => isV(c) ? i : -1).filter(i => i >= 0);
    if (!vowels.length) { if (seq.length) syllables.push({ onset: seq, nucleus: null, coda: [] }); continue; }
    let from = 0;
    vowels.forEach((v, n) => {
      const next = vowels[n + 1];
      const codaEnd = next == null ? seq.length : Math.max(v + 1, next - 1);
      syllables.push({ onset: seq.slice(from, v), nucleus: seq[v], coda: seq.slice(v + 1, codaEnd) });
      from = codaEnd;
    });
  }
  return { syllables, unknown };
}

export const syllableText = s => [...s.onset, s.nucleus ?? '', ...s.coda].join('');

// The take recorded closest to the wanted pitch, so the sampler shifts it as little as possible.
export function nearestTake(takes, midi) {
  let best = null;
  for (const t of takes) if (!best || Math.abs(t.midi - midi) < Math.abs(best.midi - midi)) best = t;
  return best;
}
