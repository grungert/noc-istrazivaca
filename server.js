// Laboratorija koja te sluša — lokalni server.
// Bez zavisnosti: služi statičke fajlove i prosljeđuje pitanja modelu
// preko Claude Code CLI-ja (`claude -p`), koji koristi postojeću pretplatu —
// nema API ključa ni dodatnog troška. Ako CLI nije dostupan, frontend
// prelazi u offline režim sa unaprijed pripremljenim scenarijima.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from './prompt.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4747);
const HOST = process.env.HOST || '127.0.0.1'; // API troši Claude pretplatu, pa po defaultu nije otvoren ka mreži
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const BRAIN = process.env.BRAIN || 'claude'; // 'claude' | 'offline'
const EFFORT = process.env.EFFORT || 'low'; // low ≈ 10–20 s po odgovoru, medium ≈ 15–35 s
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 90_000);
const MAX_INPUT = 240;

// Molekuli ne zavise od stanja scene, pa se odgovori pamte (i preživljavaju restart).
// `npm run warmup` ih unaprijed popuni prije festivala.
const CACHE_FILE = path.join(ROOT, 'cache.json');
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
const cacheKey = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
const cacheable = (a) => a.actions?.length > 0 && a.actions.every((x) => x.type === 'molecule' || x.type === 'show');

// Prazan radni folder, da CLI ne učitava CLAUDE.md ovog ili bilo kog projekta.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'laboratorija-'));

const claudeAvailable =
  BRAIN === 'claude' && spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;

const STATIC = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/')],
  ['/izazov/', path.join(ROOT, 'izazov/')],
  ['/vendor/mediapipe/', path.join(ROOT, 'node_modules/@mediapipe/tasks-vision/')],
  ['/', path.join(ROOT, 'public/')],
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const [prefix, dir] of STATIC) {
    if (!url.startsWith(prefix)) continue;
    let file = path.join(dir, url.slice(prefix.length) || 'index.html');
    if (!file.startsWith(dir)) break; // pokušaj izlaska iz foldera
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) continue;
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404).end('Nije pronađeno');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 100_000) {
        reject(new Error('Zahtjev je prevelik'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function buildPrompt({ text, state, history }) {
  const past = (history || [])
    .slice(-6)
    .map((h) => `Posjetilac: ${h.q}\nTi: ${h.a}`)
    .join('\n');
  return [
    `TRENUTNO STANJE SCENE:\n${JSON.stringify(state ?? {})}`,
    past ? `PRETHODNI RAZGOVOR:\n${past}` : '',
    `NOVO PITANJE POSJETIOCA:\n${text}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function extractJson(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Model nije vratio JSON');
  return JSON.parse(s.slice(start, end + 1));
}

// Poziva model u stream režimu: onDelta dobija svaki komadić teksta čim stigne
// (null = model još razmišlja), a promise se razrješava kompletnim, parsiranim odgovorom.
function askClaude(prompt, { onDelta, signal }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--model', MODEL,
      '--effort', EFFORT,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--system-prompt', SYSTEM_PROMPT,
      '--tools', '',
      '--setting-sources', '',
      '--strict-mcp-config',
      '--no-session-persistence',
    ];
    const child = spawn('claude', args, { cwd: SANDBOX, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let err = '';
    let result = null;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Isteklo vrijeme za odgovor'));
    }, TIMEOUT_MS);
    signal?.addEventListener('abort', () => child.kill('SIGKILL'));

    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        const d = ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' ? ev.event.delta : null;
        if (d?.type === 'text_delta') onDelta(d.text);
        else if (d?.type === 'thinking_delta') onDelta(null);
        if (ev.type === 'result') result = ev;
      }
    });
    child.stderr.on('data', (c) => (err += c));
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        if (!result) throw new Error('Nema odgovora');
        if (result.is_error) throw new Error(result.result || 'Greška modela');
        resolve(extractJson(result.result));
      } catch (e) {
        reject(new Error(`${e.message}${code ? ` (kod ${code}) ${err.slice(0, 300)}` : ''}`));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET' && req.url === '/api/status') {
    return json(200, { brain: claudeAvailable ? 'claude' : 'offline', model: MODEL });
  }

  // Odgovor je NDJSON stream: {t:"delta",text} … pa {t:"done",answer} ili {t:"error",error}.
  if (req.method === 'POST' && req.url === '/api/ask') {
    if (!claudeAvailable) return json(503, { error: 'offline' });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return json(400, { error: 'Neispravan zahtjev' });
    }
    const text = String(body.text || '').trim().slice(0, MAX_INPUT);
    if (!text) return json(400, { error: 'Prazno pitanje' });

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
    const send = (obj) => res.write(JSON.stringify(obj) + '\n');

    const key = cacheKey(text);
    if (cache[key]) {
      console.log(`[keš] ${text}`);
      send({ t: 'done', answer: { ...cache[key], cached: true } });
      return res.end();
    }

    const aborter = new AbortController();
    res.on('close', () => !res.writableFinished && aborter.abort());
    const started = Date.now();
    let first = 0;
    try {
      const answer = await askClaude(buildPrompt({ ...body, text }), {
        signal: aborter.signal,
        onDelta: (t) => {
          if (t === null) return send({ t: 'thinking' });
          first ||= Date.now() - started;
          send({ t: 'delta', text: t });
        },
      });
      const ms = Date.now() - started;
      console.log(`[prvi tekst ${(first / 1000).toFixed(1)}s, ukupno ${(ms / 1000).toFixed(1)}s] ${text}`);
      if (cacheable(answer)) {
        cache[key] = { ...answer, ms };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
      }
      send({ t: 'done', answer: { ...answer, ms, first } });
    } catch (e) {
      console.error('Greška:', e.message);
      send({ t: 'error', error: e.message });
    }
    res.end();
    return;
  }

  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Laboratorija koja te sluša → http://localhost:${PORT}`);
  console.log(`  Mozak: ${claudeAvailable ? `${MODEL}, effort ${EFFORT} (Claude Code CLI)` : 'OFFLINE režim'}`);
  console.log(`  Molekula u kešu: ${Object.keys(cache).length}\n`);
});
