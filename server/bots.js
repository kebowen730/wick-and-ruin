// AI bots for Wick & Ruin. Codes only against the documented Game interface.
import { C, WALLS, WATER } from '../shared/constants.js';

const NAMES = ['Lady Smolder', 'Drippy Pete', 'Old Tallow', 'Wickford', 'Nub', 'Mildew',
  'Sir Gutters', 'Waxy Maud', 'Stubbs', 'Cinder Bell', 'Dame Drip', 'Flickerwick',
  'Mothball', 'Lumpy Lou', 'Tallowbeard', 'Snuffles'];

const SIGHT = 450, FLEE_R = 220, PREF_DIST = 240;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function circleHitsRect(x, y, r, w) {
  const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}
function pointBlocked(x, y, r) {
  for (const w of WALLS) if (circleHitsRect(x, y, r, w)) return true;
  return false;
}
// is the straight segment (x0,y0)->(x1,y1) blocked by a wall (for a body of radius r)?
function segBlocked(x0, y0, x1, y1, r) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 16));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (pointBlocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r)) return true;
  }
  return false;
}
function waterAt(x, y) {
  for (const w of WATER) if (Math.hypot(x - w.x, y - w.y) < w.r) return w;
  return null;
}

export class BotManager {
  constructor(game) {
    this.game = game;
    this.seq = 0;
    this.state = new Map(); // bot id -> per-bot AI state
  }

  _newState() {
    return {
      reactT: rnd(0.2, 0.5), lastTarget: null, tx: 0, ty: 0, tvx: 0, tvy: 0, hasPrev: false,
      strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: rnd(0.6, 1.4),
      sideT: 0, sideDir: 1, lastX: null, lastY: null, stuckT: 0,
      errT: 0, err: 0, holdT: 0, pauseT: 0, dashT: 0, dashDx: 0, dashDy: 0,
      wx: 0, wy: 0, wanderT: 0,
    };
  }

  _pickName() {
    const used = new Set([...this.game.players.values()].map((p) => p.name));
    const free = NAMES.filter((n) => !used.has(n));
    if (free.length) return free[Math.floor(Math.random() * free.length)];
    return NAMES[Math.floor(Math.random() * NAMES.length)] + ' ' + (this.seq + 1);
  }

  update(dt) {
    const g = this.game;
    // drop state of bots that vanished
    for (const id of this.state.keys()) if (!g.players.has(id)) this.state.delete(id);

    let humans = 0; const bots = [];
    for (const p of g.players.values()) { if (p.isBot) bots.push(p); else humans++; }
    let total = humans + bots.length;

    while (total < C.MIN_PLAYERS && total < C.MAX_PLAYERS) {
      const id = 'bot' + (++this.seq);
      g.addPlayer(id, this._pickName(), true);
      this.state.set(id, this._newState());
      total++;
    }
    while (total > C.MIN_PLAYERS && bots.length) {
      const b = bots.pop();
      g.removePlayer(b.id);
      this.state.delete(b.id);
      total--;
    }

    for (const b of bots) {
      let s = this.state.get(b.id);
      if (!s) { s = this._newState(); this.state.set(b.id, s); }
      if (!b.alive) {
        g.setInput(b.id, { mx: 0, my: 0, aim: b.aim || 0, fire: false, dash: false });
        s.lastTarget = null; s.hasPrev = false; s.lastX = null;
        continue;
      }
      this._think(b, s, dt);
    }
  }

  _think(b, s, dt) {
    const g = this.game;
    const over = g.round && g.round.phase === 'over';
    const R = C.PLAYER_R;

    // --- timers
    s.strafeT -= dt; if (s.strafeT <= 0) { s.strafeDir = -s.strafeDir; s.strafeT = rnd(0.5, 1.6); }
    s.errT -= dt; if (s.errT <= 0) { s.err = rnd(-0.13, 0.13); s.errT = rnd(0.2, 0.45); }
    s.sideT -= dt; s.dashT -= dt; s.wanderT -= dt;
    // burst-fire rhythm: fire for a while, then pause (keeps them beatable)
    if (s.holdT > 0) { s.holdT -= dt; if (s.holdT <= 0) s.pauseT = rnd(0.25, 0.7); }
    else { s.pauseT -= dt; if (s.pauseT <= 0) s.holdT = rnd(0.5, 1.4); }

    // --- stuck detection
    if (s.lastX !== null) {
      const moved = Math.hypot(b.x - s.lastX, b.y - s.lastY);
      if (moved < 30 * dt) s.stuckT += dt; else s.stuckT = 0;
    }
    s.lastX = b.x; s.lastY = b.y;
    if (s.stuckT > 0.5 && s.sideT <= 0) {
      s.sideT = rnd(0.3, 0.6); s.sideDir = Math.random() < 0.5 ? 1 : -1; s.stuckT = 0;
    }

    // --- perceive
    let nearest = null, nd = Infinity;
    for (const p of g.players.values()) {
      if (p.id === b.id || !p.alive) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < nd) { nd = d; nearest = p; }
    }
    const sn = g.snuffer;
    const snD = sn ? Math.hypot(sn.x - b.x, sn.y - b.y) : Infinity;

    // target tracking (velocity estimate for leading)
    const target = nearest && nd <= SIGHT ? nearest : null;
    if (target) {
      if (s.lastTarget !== target.id) { s.lastTarget = target.id; s.reactT = rnd(0.25, 0.55); s.hasPrev = false; }
      if (s.hasPrev && dt > 0) {
        const k = 0.35;
        s.tvx += ((target.x - s.tx) / dt - s.tvx) * k;
        s.tvy += ((target.y - s.ty) / dt - s.tvy) * k;
      } else { s.tvx = 0; s.tvy = 0; }
      s.tx = target.x; s.ty = target.y; s.hasPrev = true;
      if (s.reactT > 0) s.reactT -= dt;
    } else { s.lastTarget = null; s.hasPrev = false; }

    // --- movement desire
    let dx = 0, dy = 0, wantDash = false;
    const toward = (x, y) => { const d = Math.hypot(x - b.x, y - b.y) || 1; return [(x - b.x) / d, (y - b.y) / d]; };
    const inWater = waterAt(b.x, b.y);

    if (snD < FLEE_R) {
      [dx, dy] = toward(sn.x, sn.y); dx = -dx; dy = -dy;
      // slide a bit sideways so we don't just pin against walls
      dx += -dy * 0.3 * s.strafeDir; dy += dx * 0.3 * s.strafeDir;
      if (snD < 110 && b.dashCd <= 0 && !sn.stun) wantDash = true;
    } else if (inWater) {
      dx = b.x - inWater.x; dy = b.y - inWater.y;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    } else {
      // dodge incoming embers
      let dodge = null;
      for (const e of g.embers) {
        if (e.owner === b.id) continue;
        const rx = b.x - e.x, ry = b.y - e.y;
        const sp = Math.hypot(e.vx, e.vy) || 1;
        const along = (rx * e.vx + ry * e.vy) / sp;
        if (along < 0 || along > 170) continue;
        const perp = (rx * -e.vy + ry * e.vx) / sp;
        if (Math.abs(perp) < 26) { dodge = { px: -e.vy / sp, py: e.vx / sp, side: perp >= 0 ? 1 : -1 }; break; }
      }
      if (dodge && Math.random() < 0.6) {
        dx = dodge.px * dodge.side; dy = dodge.py * dodge.side;
        if (b.dashCd <= 0 && b.flame > 25 && Math.random() < 0.25) wantDash = true;
      } else {
        // nearest wax not sitting in water
        let wax = null, wd = Infinity;
        for (const w of g.wax) {
          if (waterAt(w.x, w.y)) continue;
          const d = Math.hypot(w.x - b.x, w.y - b.y);
          if (d < wd) { wd = d; wax = w; }
        }
        const hungry = b.flame < 60 || (b.flame < 100 && wax && wd < 200 && !target);
        if (hungry && wax) {
          [dx, dy] = toward(wax.x, wax.y);
        } else if (target) {
          const ux = (target.x - b.x) / (nd || 1), uy = (target.y - b.y) / (nd || 1);
          let rad = 0;
          if (nd > PREF_DIST + 60) rad = 1; else if (nd < PREF_DIST - 80) rad = -0.7;
          // low flame: be more cautious
          if (b.flame < 35 && nd < 330) rad = -1;
          dx = ux * rad + -uy * s.strafeDir * 0.9;
          dy = uy * rad + ux * s.strafeDir * 0.9;
          if (nd < 130 && b.dashCd <= 0 && b.flame > 30 && !over && Math.random() < 0.08) {
            wantDash = true; dx = ux; dy = uy; // ram them
          }
        } else if (nearest) {
          [dx, dy] = toward(nearest.x, nearest.y);
        } else {
          if (s.wanderT <= 0 || Math.hypot(s.wx - b.x, s.wy - b.y) < 60) {
            s.wx = rnd(150, C.WORLD_W - 150); s.wy = rnd(150, C.WORLD_H - 150); s.wanderT = rnd(3, 6);
          }
          [dx, dy] = toward(s.wx, s.wy);
        }
      }
    }

    // --- steering around walls / water
    let m = Math.hypot(dx, dy);
    if (m > 0.001) {
      dx /= m; dy /= m;
      if (s.sideT > 0) {
        const sx = -dy * s.sideDir, sy = dx * s.sideDir;
        dx = sx * 0.9 + dx * 0.2; dy = sy * 0.9 + dy * 0.2;
      } else if (segBlocked(b.x, b.y, b.x + dx * 70, b.y + dy * 70, R + 3)) {
        // try rotated headings, pick the first free one
        let found = false;
        for (const a of [0.7, -0.7, 1.3, -1.3, 1.9, -1.9]) {
          const c = Math.cos(a), sn2 = Math.sin(a);
          const nx = dx * c - dy * sn2, ny = dx * sn2 + dy * c;
          if (!segBlocked(b.x, b.y, b.x + nx * 70, b.y + ny * 70, R + 3)) { dx = nx; dy = ny; found = true; break; }
        }
        if (!found) { s.sideT = rnd(0.3, 0.6); s.sideDir = -s.sideDir; }
      }
      // don't wander into water voluntarily (unless fleeing the Snuffer)
      if (!inWater && snD >= FLEE_R) {
        const wa = waterAt(b.x + dx * 60, b.y + dy * 60);
        if (wa) {
          const sx = -dy, sy = dx;
          const side = ((wa.x - b.x) * sx + (wa.y - b.y) * sy) > 0 ? -1 : 1;
          dx = sx * side; dy = sy * side;
        }
      }
    }
    // keep inside world
    const mg = 40;
    if (b.x < mg && dx < 0) dx = 0.3; if (b.x > C.WORLD_W - mg && dx > 0) dx = -0.3;
    if (b.y < mg && dy < 0) dy = 0.3; if (b.y > C.WORLD_H - mg && dy > 0) dy = -0.3;

    // --- dash handling (held state for a short window)
    if (wantDash && s.dashT <= 0 && b.dashCd <= 0) { s.dashT = C.DASH_TIME * 0.7; s.dashDx = dx; s.dashDy = dy; }
    let dash = false;
    if (s.dashT > 0) { dash = true; dx = s.dashDx; dy = s.dashDy; }

    // --- aim & fire
    let aim = b.aim || 0, fire = false;
    if (target) {
      const dist = Math.hypot(target.x - b.x, target.y - b.y);
      const tt = dist / C.EMBER_SPEED;
      const lead = 0.7;
      const px = target.x + s.tvx * tt * lead, py = target.y + s.tvy * tt * lead;
      aim = Math.atan2(py - b.y, px - b.x) + s.err;
      const clear = !segBlocked(b.x, b.y, target.x, target.y, 3);
      fire = !over && clear && s.reactT <= 0 && s.holdT > 0 && dist <= SIGHT &&
        b.flame > C.EMBER_COST + 12 && !dash;
    } else if (snD < FLEE_R * 1.5 && sn) {
      aim = Math.atan2(sn.y - b.y, sn.x - b.x); // glare at the Snuffer, but don't waste flame
    } else if (m > 0.001) {
      aim = Math.atan2(dy, dx);
    }
    if (over) fire = false;

    g.setInput(b.id, { mx: dx, my: dy, aim, fire, dash });
  }
}
