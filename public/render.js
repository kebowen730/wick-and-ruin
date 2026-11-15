// WICK & RUIN renderer: camera, floor, lighting/darkness, particles, screen shake.
import { drawCandle, drawSnuffer, drawWax, drawEmber, drawWall, drawWater } from './sprites.js';
import { C, lightRadius, WALLS, WATER } from '/shared/constants.js';

const MAX_P = 600;
const TAU = Math.PI * 2;
// particle kinds
const K_DOT = 0, K_STREAK = 1, K_RING = 2, K_SMOKE = 3, K_CONFETTI = 4, K_TEXT = 5;

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makeFloorTile() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#231d2e';
  g.fillRect(0, 0, S, S);
  // flagstones: 2 rows, offset seams
  const rows = [[0, 128, 0], [128, 256, 64]];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [y0, y1, off] of rows) {
    for (let k = -1; k < 3; k++) {
      const x0 = off + k * 128;
      const shade = 50 + Math.floor(r() * 18);
      g.fillStyle = `rgb(${shade},${shade - 3},${shade + 8})`;
      g.fillRect(x0 + 2, y0 + 2, 124, y1 - y0 - 4);
      // speckles
      for (let i = 0; i < 26; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(120,110,150,0.08)';
        g.fillRect(x0 + 4 + r() * 118, y0 + 4 + r() * 116, 1 + r() * 2, 1 + r() * 2);
      }
      // highlight edge
      g.fillStyle = 'rgba(160,150,190,0.07)';
      g.fillRect(x0 + 2, y0 + 2, 124, 2);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x0 + 2, y1 - 4, 124, 2);
      // crack
      if (r() < 0.4) {
        g.strokeStyle = 'rgba(0,0,0,0.45)';
        g.lineWidth = 1;
        g.beginPath();
        let cx = x0 + 20 + r() * 80, cy = y0 + 10;
        g.moveTo(cx, cy);
        for (let i = 0; i < 4; i++) { cx += rnd(-12, 12); cy += rnd(8, 20); g.lineTo(cx, cy); }
        g.stroke();
      }
    }
  }
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');
  const tile = makeFloorTile();
  let floorPat = null;
  let vignette = null, vigW = 0, vigH = 0;

  let W = 0, H = 0, dpr = 1;
  let camX = C.WORLD_W / 2, camY = C.WORLD_H / 2, haveCam = false;
  let zoom = 1;
  let shake = 0, shakeT = 0;
  let lastMe = null;
  let lastTime = 0;
  let camSX = 0, camSY = 0; // current camera incl. shake offsets (world)

  // particle pool
  const pool = new Array(MAX_P);
  for (let i = 0; i < MAX_P; i++) {
    pool[i] = { on: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, grow: 0, r: 255, g: 255, b: 255, a: 1, drag: 0, grav: 0, add: false, rot: 0, vr: 0, str: '' };
  }
  let cursor = 0;
  function spawn(k, x, y, vx, vy, life, size, r, g, b, o) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX_P;
    p.on = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.r = r; p.g = g; p.b = b;
    p.grow = 0; p.a = 1; p.drag = 0; p.grav = 0; p.add = false; p.rot = 0; p.vr = 0; p.str = '';
    if (o) {
      if (o.grow !== undefined) p.grow = o.grow;
      if (o.a !== undefined) p.a = o.a;
      if (o.drag !== undefined) p.drag = o.drag;
      if (o.grav !== undefined) p.grav = o.grav;
      if (o.add) p.add = true;
      if (o.rot !== undefined) p.rot = o.rot;
      if (o.vr !== undefined) p.vr = o.vr;
      if (o.str !== undefined) p.str = o.str;
    }
    return p;
  }

  function prox(x, y, range = 900) {
    const d = Math.hypot(x - camX, y - camY);
    return clamp(1 - d / range, 0, 1);
  }
  function addShake(a) { if (a > shake) shake = a; }

  function resize() {
    const nd = Math.min(window.devicePixelRatio || 1, 2);
    const nw = window.innerWidth || canvas.clientWidth || 800;
    const nh = window.innerHeight || canvas.clientHeight || 600;
    const pw = Math.round(nw * nd), ph = Math.round(nh * nd);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw; canvas.height = ph;
    }
    if (dark.width !== pw || dark.height !== ph) { dark.width = pw; dark.height = ph; }
    if (canvas.style.width !== nw + 'px') canvas.style.width = nw + 'px';
    if (canvas.style.height !== nh + 'px') canvas.style.height = nh + 'px';
    W = nw; H = nh; dpr = nd;
    zoom = clamp(Math.min(W, H) / 800, 0.6, 1.6);
    if (!floorPat) floorPat = ctx.createPattern(tile, 'repeat');
    if (!vignette || vigW !== pw || vigH !== ph) {
      vigW = pw; vigH = ph;
      const g = ctx.createRadialGradient(pw / 2, ph / 2, Math.min(pw, ph) * 0.35, pw / 2, ph / 2, Math.hypot(pw, ph) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.65)');
      vignette = g;
    }
  }

  function hole(g, x, y, r, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    gr.addColorStop(0.6, 'rgba(0,0,0,' + (a * 0.85).toFixed(3) + ')');
    gr.addColorStop(0.88, 'rgba(0,0,0,' + (a * 0.3).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  function glow(x, y, r, rgb, a) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function flicker(t, i) {
    return 1 + Math.sin(t * 17 + i * 2.3) * 0.02 + Math.sin(t * 7.3 + i * 1.1) * 0.01 + Math.sin(t * 31 + i) * 0.005;
  }

  function updateParticles(dt) {
    for (let i = 0; i < MAX_P; i++) {
      const p = pool[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
    }
  }

  function drawParticles(textPass) {
    let add = false;
    for (let i = 0; i < MAX_P; i++) {
      const p = pool[i];
      if (!p.on) continue;
      if ((p.k === K_TEXT) !== textPass) continue;
      const f = p.life / p.max; // 1 -> 0
      if (p.add !== add) { ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; add = p.add; }
      const col = p.r + ',' + p.g + ',' + p.b;
      switch (p.k) {
        case K_DOT:
          ctx.fillStyle = 'rgba(' + col + ',' + (p.a * Math.min(1, f * 1.6)).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, p.size * (0.4 + 0.6 * f)), 0, TAU); ctx.fill();
          break;
        case K_STREAK: {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = p.size * 4;
          ctx.strokeStyle = 'rgba(' + col + ',' + (p.a * f).toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, p.size * 0.5);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case K_RING:
          ctx.strokeStyle = 'rgba(' + col + ',' + (p.a * f).toFixed(3) + ')';
          ctx.lineWidth = 2 + 3 * f;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.size), 0, TAU); ctx.stroke();
          break;
        case K_SMOKE:
          ctx.fillStyle = 'rgba(' + col + ',' + (p.a * f * f).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.size), 0, TAU); ctx.fill();
          break;
        case K_CONFETTI:
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.9 + 0.1);
          ctx.fillStyle = 'rgba(' + col + ',' + Math.min(1, f * 2).toFixed(3) + ')';
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
          ctx.restore();
          break;
        case K_TEXT: {
          ctx.globalAlpha = Math.min(1, f * 2);
          ctx.font = 'bold ' + p.size + 'px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(10,5,15,0.85)';
          ctx.strokeText(p.str, p.x, p.y);
          ctx.fillStyle = 'rgb(' + col + ')';
          ctx.fillText(p.str, p.x, p.y);
          ctx.globalAlpha = 1;
          break;
        }
      }
    }
    if (add) ctx.globalCompositeOperation = 'source-over';
  }

  function draw(view, dt) {
    resize();
    dt = clamp(dt || 0.016, 0, 0.1);
    const t = view.time !== undefined ? view.time : lastTime + dt;
    lastTime = t;
    const players = view.players || [];
    const embers = view.embers || [];
    const wax = view.wax || [];
    const snuffer = view.snuffer;
    lastMe = view.meId;

    // camera
    let me = null;
    for (let i = 0; i < players.length; i++) if (players[i].id === view.meId) { me = players[i]; break; }
    if (me && me.alive) { camX = me.x; camY = me.y; haveCam = true; }
    else if (me && !haveCam) { camX = me.x; camY = me.y; haveCam = true; }

    updateParticles(dt);
    shake = shake > 0.2 ? shake * Math.pow(0.0015, dt) : 0; // fast decay
    shakeT += dt;
    const sx = shake ? (Math.sin(shakeT * 83) + Math.sin(shakeT * 47 + 1)) * 0.5 * shake : 0;
    const sy = shake ? (Math.cos(shakeT * 71) + Math.sin(shakeT * 59 + 2)) * 0.5 * shake : 0;

    const k = dpr * zoom;
    const tx = dpr * (W / 2 + sx) - camX * k;
    const ty = dpr * (H / 2 + sy) - camY * k;
    // visible world rect
    const vw = W / zoom / 2 + 60, vh = H / zoom / 2 + 60;
    const vx0 = camX - vw, vx1 = camX + vw, vy0 = camY - vh, vy1 = camY + vh;

    // 1. void
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(k, 0, 0, k, tx, ty);

    // 2. floor + border
    ctx.fillStyle = floorPat;
    ctx.fillRect(0, 0, C.WORLD_W, C.WORLD_H);
    const B = 44;
    ctx.fillStyle = '#241d2c';
    ctx.fillRect(-B, -B, C.WORLD_W + 2 * B, B);
    ctx.fillRect(-B, C.WORLD_H, C.WORLD_W + 2 * B, B);
    ctx.fillRect(-B, 0, B, C.WORLD_H);
    ctx.fillRect(C.WORLD_W, 0, B, C.WORLD_H);
    ctx.strokeStyle = '#4a3f58';
    ctx.lineWidth = 4;
    ctx.strokeRect(-2, -2, C.WORLD_W + 4, C.WORLD_H + 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-B, -B, C.WORLD_W + 2 * B, C.WORLD_H + 2 * B);
    // inner shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, C.WORLD_W, 10);
    ctx.fillRect(0, C.WORLD_H - 10, C.WORLD_W, 10);
    ctx.fillRect(0, 0, 10, C.WORLD_H);
    ctx.fillRect(C.WORLD_W - 10, 0, 10, C.WORLD_H);

    // 3. water
    for (let i = 0; i < WATER.length; i++) {
      const w = WATER[i];
      if (w.x + w.r < vx0 || w.x - w.r > vx1 || w.y + w.r < vy0 || w.y - w.r > vy1) continue;
      drawWater(ctx, w, t);
    }
    // 4. wax
    for (let i = 0; i < wax.length; i++) {
      const w = wax[i];
      if (w.x < vx0 || w.x > vx1 || w.y < vy0 || w.y > vy1) continue;
      drawWax(ctx, w, t);
    }
    // 5. walls
    for (let i = 0; i < WALLS.length; i++) {
      const w = WALLS[i];
      if (w.x + w.w < vx0 || w.x > vx1 || w.y + w.h < vy0 || w.y > vy1) continue;
      drawWall(ctx, w, t);
    }
    // 6. embers, candles, snuffer
    for (let i = 0; i < embers.length; i++) drawEmber(ctx, embers[i], t);
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.alive && p.id !== view.meId) drawCandle(ctx, p, t, false);
    }
    if (me && me.alive) drawCandle(ctx, me, t, true);
    if (snuffer) drawSnuffer(ctx, snuffer, t);

    // 7. particles
    drawParticles(false);

    // 8. darkness
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.fillStyle = 'rgba(4,3,10,0.97)';
    dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.globalCompositeOperation = 'destination-out';
    dctx.setTransform(k, 0, 0, k, tx, ty);
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.alive) continue;
      const r = lightRadius(p.flame) * flicker(t, i);
      hole(dctx, p.x, p.y, r, p.id === view.meId ? 1 : 0.95);
    }
    for (let i = 0; i < embers.length; i++) hole(dctx, embers[i].x, embers[i].y, 70, 0.9);
    for (let i = 0; i < wax.length; i++) hole(dctx, wax[i].x, wax[i].y, 28, 0.4);
    // faint ambient pool where the player died so the screen is not totally lost
    dctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);

    // warm additive glow
    ctx.setTransform(k, 0, 0, k, tx, ty);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.alive) continue;
      const r = lightRadius(p.flame) * flicker(t, i);
      glow(p.x, p.y, r * 0.55, '255,170,70', p.id === view.meId ? 0.2 : 0.13);
      glow(p.x, p.y - 8, 26, '255,220,150', 0.28);
    }
    for (let i = 0; i < embers.length; i++) glow(embers[i].x, embers[i].y, 30, '255,140,50', 0.35);
    ctx.globalCompositeOperation = 'source-over';

    // snuffer eyes above darkness when near
    if (snuffer) {
      const d = Math.hypot(snuffer.x - camX, snuffer.y - camY);
      if (d < 600) {
        const a = clamp((600 - d) / 250, 0, 1);
        const R = C.SNUFFER_R;
        const bob = Math.sin(t * 2.2) * 3;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = 'rgba(150,100,230,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(snuffer.x, snuffer.y + bob, R * 1.5, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        const blink = Math.sin(t * 0.9) > 0.97 ? 0.15 : 1;
        for (let s = -1; s <= 1; s += 2) {
          const ex = snuffer.x + s * R * 0.4, ey = snuffer.y - R * 0.2 + bob;
          glow(ex, ey, 14, '190,170,255', 0.35 * blink);
          ctx.fillStyle = 'rgba(235,235,255,' + (0.95 * blink).toFixed(2) + ')';
          ctx.beginPath();
          ctx.ellipse(ex, ey, 5, 5 * blink + 0.5, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // floating text above darkness
    drawParticles(true);

    // 9. vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function event(ev) {
    if (!ev) return;
    const x = ev.x, y = ev.y;
    switch (ev.k) {
      case 'fire':
        for (let i = 0; i < 5; i++) {
          const a = rnd(0, TAU), s = rnd(40, 160);
          spawn(K_DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.2, 0.4), rnd(1.5, 2.8), 255, rnd(150, 210), 70, { add: true, drag: 3 });
        }
        break;
      case 'dash':
        for (let i = 0; i < 9; i++) {
          const a = rnd(0, TAU), s = rnd(60, 200);
          spawn(K_STREAK, x + rnd(-14, 14), y + rnd(-14, 14), Math.cos(a) * s, Math.sin(a) * s, rnd(0.2, 0.4), rnd(4, 7), 220, 225, 240, { a: 0.6, drag: 3 });
        }
        spawn(K_RING, x, y, 0, 0, 0.3, 10, 220, 230, 255, { grow: 120, a: 0.5 });
        break;
      case 'hit': {
        for (let i = 0; i < 14; i++) {
          const a = rnd(0, TAU), s = rnd(80, 280);
          spawn(K_DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.25, 0.55), rnd(2, 4), 255, rnd(90, 160), 40, { add: true, drag: 3.5 });
        }
        if (ev.dmg) {
          spawn(K_TEXT, x + rnd(-8, 8), y - 20, rnd(-10, 10), -55, 0.9, 16, 255, 190, 90, { drag: 1.2, str: String(Math.round(ev.dmg)) });
        }
        addShake(ev.id === lastMe ? 7 : 3 * prox(x, y));
        break;
      }
      case 'fizzle':
        for (let i = 0; i < 6; i++) {
          spawn(K_SMOKE, x + rnd(-4, 4), y + rnd(-4, 4), rnd(-20, 20), rnd(-40, -10), rnd(0.5, 0.9), rnd(3, 6), 150, 150, 155, { a: 0.55, grow: 14 });
        }
        break;
      case 'snuff': {
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU, s = rnd(70, 110);
          spawn(K_SMOKE, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.7, 1.1), rnd(10, 16), 55, 40, 80, { a: 0.8, grow: 14, drag: 1.5 });
        }
        spawn(K_RING, x, y, 0, 0, 0.6, 12, 150, 110, 230, { grow: 260, a: 0.7 });
        addShake(16 * prox(x, y, 1000));
        break;
      }
      case 'death': {
        for (let i = 0; i < 30; i++) {
          const a = rnd(0, TAU), s = rnd(50, 280);
          const g = Math.floor(rnd(205, 245));
          spawn(K_DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.5, 1.1), rnd(2.5, 6), g, g - 3, g - 12, { drag: 2.8 });
        }
        for (let i = 0; i < 6; i++) {
          spawn(K_SMOKE, x + rnd(-10, 10), y + rnd(-6, 6), rnd(-12, 12), rnd(-70, -35), rnd(1.2, 2), rnd(6, 10), 160, 158, 165, { a: 0.6, grow: 12 });
        }
        spawn(K_RING, x, y, 0, 0, 0.5, 14, 240, 235, 225, { grow: 220, a: 0.6 });
        addShake((ev.id === lastMe ? 14 : 11) * Math.max(prox(x, y, 1000), ev.id === lastMe ? 1 : 0));
        break;
      }
      case 'pickup':
        for (let i = 0; i < 10; i++) {
          const a = rnd(0, TAU), s = rnd(30, 120);
          spawn(K_DOT, x, y, Math.cos(a) * s, Math.sin(a) * s - 30, rnd(0.4, 0.8), rnd(1.5, 3), 255, 240, 200, { add: true, drag: 2.5, grav: -40 });
        }
        break;
      case 'spawn':
        spawn(K_RING, x, y, 0, 0, 0.7, 6, 255, 220, 150, { grow: 150, a: 0.9, add: true });
        spawn(K_RING, x, y, 0, 0, 0.5, 4, 255, 245, 210, { grow: 90, a: 0.8, add: true });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          spawn(K_DOT, x, y, Math.cos(a) * 90, Math.sin(a) * 90, 0.5, 2.5, 255, 220, 150, { add: true, drag: 2.5 });
        }
        break;
      case 'win': {
        const hw = W / zoom / 2, hh = H / zoom / 2;
        for (let i = 0; i < 160; i++) {
          const g = rnd(0, 1);
          const col = g < 0.4 ? [255, 190, 60] : g < 0.7 ? [255, 110, 40] : g < 0.85 ? [255, 235, 190] : [210, 150, 255];
          spawn(K_CONFETTI, camX + rnd(-hw, hw), camY - hh - rnd(0, hh), rnd(-60, 60), rnd(60, 220), rnd(2.5, 4.5), rnd(3, 6), col[0], col[1], col[2], { rot: rnd(0, TAU), vr: rnd(-6, 6), grav: 20 });
        }
        addShake(5);
        break;
      }
    }
  }

  return { draw, event };
}
