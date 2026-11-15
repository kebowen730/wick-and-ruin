import { C, WALLS, WATER } from '../shared/constants.js';

const NAMES = ['Sir Drips-a-Lot', 'Waxwell', 'Tallow Swift', 'Wicky McWickface', 'Lady Meltdown', 'Stubby', 'Cinderella Wax',
  'Baron Von Burn', 'Wickless Wonder', 'Candlestein', 'Pudding Flame', 'Moth Magnet', 'Drippy Pete', 'Flickerbelle',
  'Captain Cotton', 'Mr. Melty', 'Glimmer Gus', 'Waxy Rose', 'Snuffles', 'Ember Ostrich'];
const KILL_MSGS = [
  '{k} snuffed {v}', '{v} was reduced to a sad puddle by {k}', '{k} blew out {v}\'s dreams', '{v} got the wick end of {k}',
  '{k} melted {v} into a footnote', '{v} was extinguished by {k}', '{k} gave {v} a very bad day', '{v} lost their glow to {k}',
  '{k} introduced {v} to the dark', '{v} drips no more, thanks to {k}',
];
const SNUFFER_MSGS = ['The Snuffer pinched out {v}', '{v} was tucked in by the Snuffer', 'The Snuffer found {v} far too bright',
  '{v} was plucked like a daisy by the Snuffer'];
const WATER_MSGS = ['{v} went for a swim. Candles can\'t swim.', '{v} fizzled out in the crypt water', '{v} discovered that wax and water don\'t mix'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const r1 = (n) => Math.round(n * 10) / 10;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// circle vs rect overlap
function circleRect(x, y, r, w) {
  const cx = Math.max(w.x, Math.min(x, w.x + w.w));
  const cy = Math.max(w.y, Math.min(y, w.y + w.h));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}
const inWall = (x, y, r) => WALLS.some((w) => circleRect(x, y, r, w));
const inWater = (x, y) => WATER.some((w) => (x - w.x) ** 2 + (y - w.y) ** 2 < w.r * w.r);

export class Game {
  constructor() {
    this.players = new Map();
    this.embers = [];
    this.wax = [];
    this.snuffer = { x: C.WORLD_W / 2, y: 120, target: null, stun: false };
    this.round = { phase: 'play', winner: null, timer: 0 };
    this.time = 0;
    this.events = [];
    this._id = 0;
    this._hueN = 0;
    this._waxT = 0;
    this._retarget = 0;
    this._stunT = 0;
    this._snufHitCd = 0;
  }

  nid(p) { return p + (++this._id); }

  freeSpot(r, avoidDist = 0) {
    let best = null;
    for (let i = 0; i < 60; i++) {
      const x = rnd(r + 20, C.WORLD_W - r - 20), y = rnd(r + 20, C.WORLD_H - r - 20);
      if (inWall(x, y, r + 6)) continue;
      best = { x, y };
      if (!avoidDist) return best;
      let ok = Math.hypot(x - this.snuffer.x, y - this.snuffer.y) > avoidDist;
      for (const p of this.players.values()) {
        if (p.alive && Math.hypot(x - p.x, y - p.y) < avoidDist) { ok = false; break; }
      }
      if (ok) return best;
    }
    return best || { x: 300, y: 300 };
  }

  pickHue() {
    const used = [...this.players.values()].map((p) => p.hue);
    let best = 0, bestD = -1;
    for (let i = 0; i < 24; i++) {
      const h = Math.floor((this._hueN * 137.508 + i * 15) % 360);
      const d = used.length ? Math.min(...used.map((u) => { const a = Math.abs(u - h); return Math.min(a, 360 - a); })) : 360;
      if (d > bestD) { bestD = d; best = h; }
    }
    this._hueN++;
    return best;
  }

  addPlayer(id, name, isBot = false) {
    name = String(name ?? '').trim().slice(0, 16) || pick(NAMES);
    const p = {
      id: String(id), name, x: 0, y: 0, aim: 0, flame: C.FLAME_START, alive: true, souls: 0, isBot: !!isBot,
      dashCd: 0, hue: this.pickHue(), respawn: 0,
      mx: 0, my: 0, fire: false, dash: false, fireCd: 0, dashT: 0, dx: 0, dy: 0, dashHit: new Set(),
    };
    this.players.set(p.id, p);
    this.spawn(p);
    return p;
  }

  removePlayer(id) {
    this.players.delete(String(id));
    if (this.snuffer.target === String(id)) this.snuffer.target = null;
  }

  setInput(id, inp) {
    const p = this.players.get(String(id));
    if (!p || !inp) return;
    p.mx = Math.max(-1, Math.min(1, num(inp.mx)));
    p.my = Math.max(-1, Math.min(1, num(inp.my)));
    p.aim = num(inp.aim, p.aim);
    p.fire = !!inp.fire;
    p.dash = !!inp.dash;
  }

  spawn(p) {
    const s = this.freeSpot(C.PLAYER_R, 350);
    p.x = s.x; p.y = s.y;
    p.flame = C.FLAME_START; p.alive = true; p.respawn = 0;
    p.dashT = 0; p.fireCd = 0; p.dashCd = 0;
    this.events.push({ k: 'spawn', id: p.id, x: r1(p.x), y: r1(p.y) });
  }

  kill(p, by, msgKind) {
    if (!p.alive) return;
    p.alive = false; p.flame = 0; p.respawn = C.RESPAWN; p.dashT = 0;
    const killer = by !== 'snuffer' && by !== 'water' ? this.players.get(by) : null;
    let tpl;
    if (killer && killer !== p) tpl = pick(KILL_MSGS);
    else if (by === 'water') tpl = pick(WATER_MSGS);
    else tpl = pick(SNUFFER_MSGS);
    const msg = tpl.replace('{k}', killer ? killer.name : '').replace('{v}', p.name);
    this.events.push({ k: 'death', id: p.id, by, x: r1(p.x), y: r1(p.y), msg });
    for (let i = 0; i < C.DEATH_WAX; i++) {
      let x = p.x + rnd(-40, 40), y = p.y + rnd(-40, 40);
      x = Math.max(C.WAX_R, Math.min(C.WORLD_W - C.WAX_R, x));
      y = Math.max(C.WAX_R, Math.min(C.WORLD_H - C.WAX_R, y));
      if (inWall(x, y, C.WAX_R)) { x = p.x; y = p.y; }
      this.wax.push({ id: this.nid('w'), x, y });
    }
    if (killer && killer !== p && this.round.phase === 'play') {
      killer.souls++;
      if (killer.souls >= C.WIN_SOULS) {
        this.round = { phase: 'over', winner: killer.name, timer: C.INTERMISSION };
        this.embers.length = 0;
        this.events.push({ k: 'win', id: killer.id, name: killer.name });
      }
    }
  }

  damage(p, dmg, by, x, y) {
    if (!p.alive || this.round.phase !== 'play') return;
    p.flame -= dmg;
    this.events.push({ k: 'hit', id: p.id, by, x: r1(x ?? p.x), y: r1(y ?? p.y), dmg });
    if (p.flame <= 0) this.kill(p, by);
  }

  moveCandle(p, vx, vy, dt) {
    p.x += vx * dt; p.y += vy * dt;
    const R = C.PLAYER_R;
    p.x = Math.max(R, Math.min(C.WORLD_W - R, p.x));
    p.y = Math.max(R, Math.min(C.WORLD_H - R, p.y));
    for (let it = 0; it < 3; it++) {
      for (const w of WALLS) {
        const cx = Math.max(w.x, Math.min(p.x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
        let dx = p.x - cx, dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * R; p.y = cy + (dy / d) * R;
        } else {
          // centre inside the rect: push out through nearest face
          const l = p.x - w.x, r = w.x + w.w - p.x, t = p.y - w.y, b = w.y + w.h - p.y;
          const m = Math.min(l, r, t, b);
          if (m === l) p.x = w.x - R; else if (m === r) p.x = w.x + w.w + R;
          else if (m === t) p.y = w.y - R; else p.y = w.y + w.h + R;
        }
      }
    }
    p.x = Math.max(R, Math.min(C.WORLD_W - R, p.x));
    p.y = Math.max(R, Math.min(C.WORLD_H - R, p.y));
  }

  step(dt) {
    dt = Math.min(Math.max(num(dt), 0), 0.1);
    this.time += dt;
    const playing = this.round.phase === 'play';

    // round intermission
    if (!playing) {
      this.round.timer -= dt;
      if (this.round.timer <= 0) {
        this.round = { phase: 'play', winner: null, timer: 0 };
        for (const p of this.players.values()) { p.souls = 0; this.spawn(p); }
        this.embers.length = 0;
      }
    }

    // wax spawning
    this._waxT += dt;
    if (this._waxT >= C.WAX_SPAWN_EVERY) {
      this._waxT = 0;
      if (this.wax.length < C.WAX_MAX) {
        const s = this.freeSpot(C.WAX_R);
        this.wax.push({ id: this.nid('w'), x: s.x, y: s.y });
      }
    }

    const R = C.PLAYER_R;
    for (const p of this.players.values()) {
      if (!p.alive) {
        p.respawn -= dt;
        if (p.respawn <= 0) this.spawn(p);
        continue;
      }
      p.fireCd -= dt;
      p.dashCd = Math.max(0, p.dashCd - dt);

      // movement
      let mx = p.mx, my = p.my;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      const wet = inWater(p.x, p.y);

      if (p.dash && p.dashCd <= 0 && p.dashT <= 0) {
        p.dashT = C.DASH_TIME; p.dashCd = C.DASH_CD; p.dashHit.clear();
        if (ml > 0.05) { p.dx = mx / ml; p.dy = my / ml; } else { p.dx = Math.cos(p.aim); p.dy = Math.sin(p.aim); }
        this.events.push({ k: 'dash', id: p.id, x: r1(p.x), y: r1(p.y) });
      }
      if (p.dashT > 0) {
        p.dashT -= dt;
        this.moveCandle(p, p.dx * C.DASH_SPEED, p.dy * C.DASH_SPEED, dt);
        if (playing) {
          for (const o of this.players.values()) {
            if (o === p || !o.alive || p.dashHit.has(o.id)) continue;
            if (Math.hypot(o.x - p.x, o.y - p.y) < R * 2) {
              p.dashHit.add(o.id);
              this.damage(o, C.DASH_DMG, p.id, o.x, o.y);
            }
          }
        }
      } else {
        const sp = C.SPEED * (wet ? C.WATER_SLOW : 1);
        this.moveCandle(p, mx * sp, my * sp, dt);
      }

      // flame
      if (wet && playing) {
        p.flame -= C.WATER_DRAIN * dt;
        if (p.flame <= 0) { this.kill(p, 'water'); continue; }
      }
      if (p.flame < C.REGEN_TO) p.flame = Math.min(C.REGEN_TO, p.flame + C.REGEN_RATE * dt);
      p.flame = Math.min(C.FLAME_MAX, p.flame);

      // fire
      if (playing && p.fire && p.fireCd <= 0 && p.flame > C.EMBER_COST + 1) {
        p.fireCd = C.FIRE_CD;
        p.flame -= C.EMBER_COST;
        const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
        const ex = p.x + ca * (R + C.EMBER_R), ey = p.y + sa * (R + C.EMBER_R);
        this.embers.push({ id: this.nid('e'), x: ex, y: ey, vx: ca * C.EMBER_SPEED, vy: sa * C.EMBER_SPEED, owner: p.id, life: C.EMBER_LIFE });
        this.events.push({ k: 'fire', id: p.id, x: r1(ex), y: r1(ey) });
      }

      // wax pickup
      for (let i = this.wax.length - 1; i >= 0; i--) {
        const w = this.wax[i];
        if (Math.hypot(w.x - p.x, w.y - p.y) < R + C.WAX_R) {
          this.wax.splice(i, 1);
          p.flame = Math.min(C.FLAME_MAX, p.flame + C.WAX_HEAL);
          this.events.push({ k: 'pickup', id: p.id, x: r1(w.x), y: r1(w.y) });
        }
      }
    }

    // embers
    const sn = this.snuffer;
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
      let gone = false;
      if (e.life <= 0) gone = true;
      else if (e.x < 0 || e.y < 0 || e.x > C.WORLD_W || e.y > C.WORLD_H || WALLS.some((w) => circleRect(e.x, e.y, C.EMBER_R, w))) {
        gone = true;
        this.events.push({ k: 'fizzle', x: r1(Math.max(0, Math.min(C.WORLD_W, e.x))), y: r1(Math.max(0, Math.min(C.WORLD_H, e.y))) });
      } else if (Math.hypot(e.x - sn.x, e.y - sn.y) < C.SNUFFER_R + C.EMBER_R) {
        gone = true;
        this._stunT = C.SNUFFER_STUN;
      } else if (playing) {
        for (const p of this.players.values()) {
          if (!p.alive || p.id === e.owner || p.dashT > 0) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < R + C.EMBER_R) {
            gone = true;
            this.damage(p, C.EMBER_DMG, e.owner, e.x, e.y);
            break;
          }
        }
      }
      if (gone) this.embers.splice(i, 1);
    }

    // snuffer
    this._stunT = Math.max(0, this._stunT - dt);
    this._snufHitCd = Math.max(0, this._snufHitCd - dt);
    sn.stun = this._stunT > 0;
    this._retarget -= dt;
    const cur = sn.target ? this.players.get(sn.target) : null;
    if (this._retarget <= 0 || !cur || !cur.alive) {
      if (this._retarget <= 0 || cur) this._retarget = C.SNUFFER_RETARGET;
      let best = null;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (!best || p.flame > best.flame || (p.flame === best.flame && p.souls > best.souls)) best = p;
      }
      sn.target = best ? best.id : null;
      if (!best) this._retarget = 0;
    }
    const tgt = sn.target ? this.players.get(sn.target) : null;
    if (!sn.stun && tgt && tgt.alive) {
      const dx = tgt.x - sn.x, dy = tgt.y - sn.y, d = Math.hypot(dx, dy);
      if (d > 1) {
        const s = Math.min(C.SNUFFER_SPEED * dt, d);
        sn.x += (dx / d) * s; sn.y += (dy / d) * s;
      }
    }
    if (playing && !sn.stun && this._snufHitCd <= 0) {
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - sn.x, p.y - sn.y) < C.SNUFFER_R + R) {
          this._snufHitCd = C.SNUFFER_HIT_CD;
          this.events.push({ k: 'snuff', id: p.id, x: r1(p.x), y: r1(p.y) });
          p.flame -= C.SNUFFER_DMG;
          if (p.flame <= 0) this.kill(p, 'snuffer');
          break;
        }
      }
    }
  }

  snapshot() {
    const events = this.events;
    this.events = [];
    return {
      time: r1(this.time),
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, x: r1(p.x), y: r1(p.y), aim: Math.round(p.aim * 100) / 100, flame: r1(Math.max(0, p.flame)),
        alive: p.alive, souls: p.souls, dash: p.dashT > 0, dashCd: r1(p.dashCd), hue: p.hue, bot: p.isBot,
        respawn: p.alive ? 0 : r1(Math.max(0, p.respawn)),
      })),
      embers: this.embers.map((e) => ({ id: e.id, x: r1(e.x), y: r1(e.y), vx: Math.round(e.vx), vy: Math.round(e.vy), owner: e.owner })),
      wax: this.wax.map((w) => ({ id: w.id, x: r1(w.x), y: r1(w.y) })),
      snuffer: { x: r1(this.snuffer.x), y: r1(this.snuffer.y), target: this.snuffer.target, stun: this.snuffer.stun },
      round: { phase: this.round.phase, winner: this.round.winner, timer: r1(Math.max(0, this.round.timer)) },
      events,
    };
  }
}
