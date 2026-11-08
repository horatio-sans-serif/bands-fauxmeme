// server.mjs — serves the instrument page and keeps the voice library on disk.
//
//   node server.mjs [--port 4797] [--data ./data]
//
// Loopback only. Zero dependencies. The library is plain files so it survives the browser:
//   data/takes/<id>.wav          the raw take, exactly as recorded (untrimmed)
//   data/takes/old/<id>.<ts>.wav every take that a re-record replaced — nothing is deleted
//   data/library.json            { takes: { <id>: analysis } }
//   data/settings.json           pads, pad channel/base, middle note, word
//   data/metrics.json            what the page measured (audio latency)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/dsp.mjs': 'dsp.mjs', '/phonemes.json': 'phonemes.json' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav' };
export const TAKE_ID = /^[a-z]{1,3}@(low|mid|high|hit)$/;
const MAX_BODY = 20 * 1024 * 1024;

function arg(name, fallback) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; }

export function createServer(dataDir) {
  const takes = path.join(dataDir, 'takes'), old = path.join(takes, 'old');
  fs.mkdirSync(old, { recursive: true });
  const file = name => path.join(dataDir, name);
  const readJson = (name, fallback) => { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; } };
  const writeAtomic = (p, data) => { const tmp = p + '.tmp-' + process.pid; fs.writeFileSync(tmp, data); fs.renameSync(tmp, p); };
  const writeJson = (name, v) => writeAtomic(file(name), JSON.stringify(v, null, 2) + '\n');

  const send = (res, code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const body = req => new Promise((ok, fail) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { fail(new Error('body too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts)));
    req.on('error', fail);
  });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x'), p = url.pathname;
      if (req.method === 'GET' && STATIC[p]) {
        const f = path.join(HERE, STATIC[p]);
        return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)]);
      }
      if (req.method === 'GET' && p === '/api/library') return send(res, 200, readJson('library.json', { takes: {} }));
      let m = p.match(/^\/takes\/([a-z@]+)\.wav$/);
      if (req.method === 'GET' && m) {
        if (!TAKE_ID.test(m[1])) return send(res, 404, { error: 'no such take' });
        const f = path.join(takes, m[1] + '.wav');
        return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), TYPES['.wav']) : send(res, 404, { error: 'no such take' });
      }
      m = p.match(/^\/api\/take\/([^/]+)$/);
      if (req.method === 'PUT' && m) {
        const id = decodeURIComponent(m[1]);
        if (!TAKE_ID.test(id)) return send(res, 400, { error: `bad take id ${JSON.stringify(id)}` });
        let meta;
        try { meta = JSON.parse(decodeURIComponent(req.headers['x-take-meta'] || '')); } catch { return send(res, 400, { error: 'x-take-meta header must be URL-encoded JSON' }); }
        const wav = await body(req);
        if (wav.length < 44 || wav.toString('latin1', 0, 4) !== 'RIFF') return send(res, 400, { error: 'body is not a WAV file' });
        const dest = path.join(takes, id + '.wav');
        if (fs.existsSync(dest)) fs.renameSync(dest, path.join(old, `${id}.${Date.now()}.wav`));
        writeAtomic(dest, wav);
        const lib = readJson('library.json', { takes: {} });
        lib.takes[id] = { ...meta, id, bytes: wav.length, savedAt: new Date().toISOString() };
        writeJson('library.json', lib);
        return send(res, 200, lib.takes[id]);
      }
      if (p === '/api/settings' && req.method === 'GET') return send(res, 200, readJson('settings.json', {}));
      if (p === '/api/settings' && req.method === 'PUT') {
        const v = JSON.parse((await body(req)).toString('utf8') || '{}');
        if (typeof v !== 'object' || Array.isArray(v) || v === null) return send(res, 400, { error: 'settings must be an object' });
        writeJson('settings.json', v);
        return send(res, 200, v);
      }
      if (p === '/api/metrics' && req.method === 'POST') {
        const v = JSON.parse((await body(req)).toString('utf8') || '{}');
        const merged = { ...readJson('metrics.json', {}), ...v, at: new Date().toISOString() };
        writeJson('metrics.json', merged);
        return send(res, 200, merged);
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(arg('--port', 4797)), dataDir = path.resolve(arg('--data', path.join(HERE, 'data')));
  createServer(dataDir).listen(port, '127.0.0.1', () => console.log(`fauxmeme instrument: http://127.0.0.1:${port}/  (library: ${dataDir})`));
}
