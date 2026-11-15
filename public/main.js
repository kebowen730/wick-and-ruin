// Wick & Ruin — client glue: networking, snapshot interpolation, main loop.
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const canvas = document.getElementById('game');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const audio = createAudio();
const hud = createHud();

const INTERP_DELAY = 0.085; // seconds behind the newest snapshot
let ws = null, meId = null, myName = '', joined = false;
let snaps = [];             // [{time, ...snapshot}]
let clock = null;           // estimated server time offset: serverTime - localTime
let lastMe = { x: 1200, y: 800 };

const now = () => performance.now() / 1000;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    hud.setConnected(true);
    snaps = []; clock = null;
    ws.send(JSON.stringify({ t: 'join', name: myName }));
  };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'welcome') meId = m.id;
    else if (m.t === 'state') onState(m);
  };
  ws.onclose = () => {
    hud.setConnected(false);
    setTimeout(connect, 1500);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

function onState(s) {
  const off = s.time - now();
  // track the smallest-latency offset, drifting slowly so it self-corrects
  clock = clock === null ? off : Math.max(off, clock + (off - clock) * 0.05);
  snaps.push(s);
  if (snaps.length > 30) snaps.shift();
  const view = currentView() || s;
  for (const ev of s.events || []) handleEvent(ev, view);
}

function handleEvent(ev, view) {
  try { renderer.event(ev); } catch (err) { console.error(err); }
  try { hud.event(ev, view); } catch (err) { console.error(err); }
  // positional volume
  let vol = 1;
  if (ev.x !== undefined) {
    const d = Math.hypot(ev.x - lastMe.x, ev.y - lastMe.y);
    vol = Math.max(0, 1 - d / 900);
  }
  let kind = ev.k;
  if (kind === 'hit' && ev.id === meId) kind = 'hurt';
  if (kind === 'snuff' && ev.id === meId) vol = 1;
  if (kind === 'win') vol = 1;
  if (vol > 0.03) audio.play(kind, vol);
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

function currentView() {
  if (!snaps.length) return null;
  const rt = now() + clock - INTERP_DELAY;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let i = snaps.length - 1; i > 0; i--) {
    if (snaps[i - 1].time <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
  }
  if (rt <= snaps[0].time) { a = b = snaps[0]; }
  const span = b.time - a.time;
  const t = span > 0 ? Math.min(1.25, Math.max(0, (rt - a.time) / span)) : 0;

  const prevP = new Map(a.players.map((p) => [p.id, p]));
  const players = b.players.map((p) => {
    const q = prevP.get(p.id);
    if (!q || q.alive !== p.alive || Math.hypot(p.x - q.x, p.y - q.y) > 300) return p;
    return { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t), aim: lerpAngle(q.aim, p.aim, Math.min(1, t)), flame: lerp(q.flame, p.flame, Math.min(1, t)) };
  });
  const prevE = new Map(a.embers.map((e) => [e.id, e]));
  const embers = b.embers.map((e) => {
    const q = prevE.get(e.id);
    return q ? { ...e, x: lerp(q.x, e.x, t), y: lerp(q.y, e.y, t) } : e;
  });
  const sa = a.snuffer, sb = b.snuffer;
  const snuffer = sa && sb ? { ...sb, x: lerp(sa.x, sb.x, t), y: lerp(sa.y, sb.y, t) } : sb;
  return { meId, time: now(), players, embers, wax: b.wax, snuffer, round: b.round };
}

let lastFrame = now(), lastSend = 0;
function frame() {
  const t = now();
  const dt = Math.min(0.1, t - lastFrame);
  lastFrame = t;

  if (joined && ws && ws.readyState === 1 && t - lastSend > 1 / 30) {
    lastSend = t;
    const i = input.get();
    ws.send(JSON.stringify({ t: 'in', mx: i.mx, my: i.my, aim: i.aim, fire: !!i.fire, dash: !!i.dash }));
  }

  const view = currentView() || {
    meId, time: t, players: [], embers: [], wax: [],
    snuffer: { x: -9999, y: -9999, target: null, stun: false },
    round: { phase: 'play', winner: null, timer: 0 },
  };
  const me = view.players.find((p) => p.id === meId);
  if (me) lastMe = { x: me.x, y: me.y };
  try { renderer.draw(view, dt); } catch (err) { console.error(err); }
  try { hud.update(view); } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

hud.showJoin((name) => {
  myName = (name || '').slice(0, 16);
  joined = true;
  audio.unlock();
  connect();
});
