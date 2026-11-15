import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { C } from '../shared/constants.js';
import { Game } from './game.js';
import { BotManager } from './bots.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }
  if (pathname.includes('\0')) return send(res, 400, 'Bad Request');

  let base, rel;
  if (pathname.startsWith('/shared/')) {
    base = SHARED_DIR;
    rel = pathname.slice('/shared/'.length);
  } else {
    base = PUBLIC_DIR;
    rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  }
  const file = path.resolve(base, rel);
  if (file !== base && !file.startsWith(base + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not Found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

const game = new Game();
const bots = new BotManager(game);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

let counter = 0;
let humans = 0;

wss.on('connection', (ws) => {
  const id = 'p' + (++counter);
  ws.pid = id;
  ws.joined = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});

  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary || data.length > 2048) return;
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'join') {
        if (ws.joined) return;
        if (humans >= C.MAX_PLAYERS) {
          ws.send(JSON.stringify({ t: 'full' }));
          ws.close();
          return;
        }
        const name = (typeof msg.name === 'string' ? msg.name : '').slice(0, 16).trim();
        game.addPlayer(id, name, false);
        ws.joined = true;
        humans++;
        ws.send(JSON.stringify({ t: 'welcome', id }));
      } else if (msg.t === 'in') {
        if (ws.joined) game.setInput(id, msg);
      }
    } catch (e) {
      console.error('message error', e);
    }
  });

  ws.on('close', () => {
    if (ws.joined) {
      ws.joined = false;
      humans--;
      try { game.removePlayer(id); } catch (e) { console.error('remove error', e); }
    }
  });
});

// Simulation loop
const DT = 1 / C.TICK;
const SNAP_EVERY = Math.max(1, Math.round(C.TICK / C.SNAP));
let acc = 0;
let last = performance.now();
let stepCount = 0;
let idle = true;

setInterval(() => {
  const now = performance.now();
  acc += Math.min((now - last) / 1000, 0.5);
  last = now;
  let steps = 0;
  while (acc >= DT && steps < 5) {
    acc -= DT;
    steps++;
    try {
      if (humans === 0) { idle = true; continue; }   // nobody watching: freeze the crypt
      if (idle) {                                       // first human back: fresh round
        idle = false;
        for (const p of game.players.values()) p.souls = 0;
        game.round = { phase: 'play', winner: null, timer: 0 };
      }
      bots.update(DT);
      game.step(DT);
    } catch (e) {
      console.error('step error', e);
    }
    if (++stepCount % SNAP_EVERY === 0) broadcast();
  }
  if (steps === 5 && acc > DT) acc = 0; // drop backlog
}, 1000 / C.TICK);

function broadcast() {
  let payload;
  try {
    payload = JSON.stringify({ t: 'state', ...game.snapshot() });
  } catch (e) {
    console.error('snapshot error', e);
    return;
  }
  for (const ws of wss.clients) {
    if (ws.joined && ws.readyState === 1 && ws.bufferedAmount <= 512 * 1024) ws.send(payload);
  }
}

// Heartbeat
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 15000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Wick & Ruin listening on 0.0.0.0:${PORT} (tick ${C.TICK}Hz, snap ${C.SNAP}Hz)`);
});
