// Entity sprites for WICK & RUIN. All drawn in world coords, full brightness.
import { C } from '/shared/constants.js';

const TAU = Math.PI * 2;
const OUT = '#1a1020';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// deterministic pseudo-random in [0,1) from integer-ish seeds
function hash(a, b = 0, c = 0) {
  let h = (Math.imul(Math.floor(a) | 0, 374761393) + Math.imul(Math.floor(b) | 0, 668265263) + Math.imul(Math.floor(c) | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function hashStr(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function teardrop(ctx, w, h, wob) {
  // base at (0,0), tip at (wob,-h)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(w * 1.1, -h * 0.05, w * 0.7, -h * 0.55, wob, -h);
  ctx.bezierCurveTo(-w * 0.7, -h * 0.55, -w * 1.1, -h * 0.05, 0, 0);
  ctx.closePath();
}

export function drawCandle(ctx, p, t, isMe) {
  const R = C.PLAYER_R;
  const seed = hashStr(p.id || p.name || 'x') % 1000;
  const aim = p.aim || 0;
  const ax = Math.cos(aim), ay = Math.sin(aim);
  const low = p.flame < 30;
  const bob = Math.sin(t * 5 + seed) * 0.8;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // isMe ring under
  if (isMe) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,90,0.85)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 14;
    ctx.beginPath();
    ctx.arc(0, 2, R + 8, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, R * 0.7, R * 1.05, R * 0.5, 0, 0, TAU);
  ctx.fill();

  // dash smear / afterimages opposite aim
  if (p.dash) {
    for (let i = 4; i >= 1; i--) {
      ctx.globalAlpha = 0.14 * (5 - i);
      ctx.fillStyle = `hsl(${p.hue},60%,80%)`;
      ctx.beginPath();
      ctx.ellipse(-ax * i * 11, -ay * i * 11, R * (1 - i * 0.08), R * (0.9 - i * 0.1), aim, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,230,170,0.5)';
    ctx.lineWidth = 3;
    for (let k = -1; k <= 1; k++) {
      const ox = -ay * k * 9, oy = ax * k * 9;
      ctx.beginPath();
      ctx.moveTo(ox - ax * 8, oy - ay * 8);
      ctx.lineTo(ox - ax * 52, oy - ay * 52);
      ctx.stroke();
    }
    ctx.restore();
  }

  // body (squash a bit when dashing)
  ctx.save();
  if (p.dash) { ctx.rotate(aim); ctx.scale(1.25, 0.82); ctx.rotate(-aim); }
  const bodyCol = `hsl(${p.hue},55%,72%)`;
  const dark = `hsl(${p.hue},50%,48%)`;
  const light = `hsl(${p.hue},65%,88%)`;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = OUT;
  ctx.fillStyle = bodyCol;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, R, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // shaded lower rim
  ctx.fillStyle = dark;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, R - 1.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.arc(0, bob * 0.3 - 3, R - 4, 0.85 * Math.PI, 0.15 * Math.PI, true);
  ctx.fill();
  ctx.globalAlpha = 1;
  // wax drips around the rim (deterministic by seed)
  ctx.fillStyle = light;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = (seed * 0.37 + i * 1.7) % TAU;
    const len = 4 + ((seed + i * 13) % 5) + Math.sin(t * 1.5 + i) * 0.8;
    const dx = Math.cos(a) * (R - 1), dy = Math.sin(a) * (R - 1);
    ctx.beginPath();
    ctx.arc(dx + Math.cos(a) * len * 0.5, dy + Math.sin(a) * len * 0.5, 3.2, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.35, -R * 0.45, R * 0.35, R * 0.18, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  // wick
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.75 + bob * 0.3);
  ctx.lineTo(0, -R * 1.05);
  ctx.stroke();

  // eyes
  const ex = ax * 3, ey = ay * 2.5 + 1;
  const spread = 6.2;
  const er = low ? 5.2 : 6.2;
  for (let s = -1; s <= 1; s += 2) {
    const cx = s * spread + ex * 0.6, cy = ey - 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, er, low ? er * 0.8 : er * 1.05, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // pupil: googly, drifts toward aim with a little wobble
    const wob = low ? Math.sin(t * 30 + s) * 0.9 : Math.sin(t * 4 + s + seed) * 0.4;
    const pr = low ? 2.2 : 3;
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.arc(ax * (er - pr - 0.6) + wob, ay * (er - pr - 0.6) + (low ? 0.8 : 0), pr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ax * (er - pr - 0.6) + wob - 1, ay * (er - pr - 0.6) - 1, 0.9, 0, TAU);
    ctx.fill();
    if (low) {
      // worried brow + squint lid
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-s * 3.5 - 0, -er - 3.5);
      ctx.lineTo(s * 4.5, -er - 1);
      ctx.stroke();
      ctx.fillStyle = bodyCol;
      ctx.beginPath();
      ctx.rect(-er - 1, -er - 1, er * 2 + 2, er * 0.7);
      ctx.fill();
    }
    ctx.restore();
  }
  // mouth
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (low) {
    ctx.arc(ex * 0.5, 11 + ey * 0.3, 3, Math.PI * 1.1, Math.PI * 1.9);
  } else {
    ctx.arc(ex * 0.5, 7 + ey * 0.3, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();

  // flame
  const f = clamp(p.flame, 0, C.FLAME_MAX);
  let sc = 0.22 + (f / 70) * 0.78;       // 70 -> 1.0
  if (f > 100) sc += (f - 100) / 50 * 0.45;
  const fl = 1 + Math.sin(t * 17 + seed) * 0.08 + Math.sin(t * 29 + seed * 2) * 0.06;
  const spark = f < 15 ? (Math.sin(t * 40 + seed) > 0.2 ? 1 : 0.25) : 1;
  const fw = 7 * sc * fl * spark, fh = 20 * sc * (fl + 0.05) * spark;
  const wobx = Math.sin(t * 11 + seed) * 1.8 * sc;
  ctx.save();
  ctx.translate(0, -R * 1.05);
  ctx.globalCompositeOperation = 'lighter';
  const gr = 26 * sc + 8;
  const g = ctx.createRadialGradient(0, -fh * 0.4, 1, 0, -fh * 0.4, gr);
  g.addColorStop(0, `rgba(255,170,60,${0.55 * spark})`);
  g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -fh * 0.4, gr, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.5;
  teardrop(ctx, fw, fh, wobx);
  ctx.fillStyle = '#ff9a2a';
  ctx.fill();
  ctx.stroke();
  teardrop(ctx, fw * 0.68, fh * 0.72, wobx * 0.7);
  ctx.fillStyle = '#ffd84a';
  ctx.fill();
  teardrop(ctx, fw * 0.36, fh * 0.42, wobx * 0.4);
  ctx.fillStyle = '#fff6d0';
  ctx.fill();
  ctx.restore();

  // name + souls
  ctx.font = 'bold 13px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(15,8,22,0.9)';
  const label = p.souls > 0 ? `${p.name}  ☠ ${p.souls}` : p.name;
  const ly = -R - 20 - 20 * sc * 0.6 - (p.flame > 100 ? 6 : 0);
  ctx.strokeText(label, 0, ly);
  ctx.fillStyle = isMe ? '#ffd24a' : '#fff';
  ctx.fillText(label, 0, ly);
  if (isMe) {
    ctx.fillStyle = '#ffd24a';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ly + 4);
    ctx.lineTo(-4, ly - 0);
    ctx.lineTo(4, ly - 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSnuffer(ctx, s, t) {
  const R = C.SNUFFER_R;
  const stun = !!s.stun;
  const breathe = 1 + Math.sin(t * 1.6) * 0.06 + Math.sin(t * 0.7) * 0.03;
  const k = (stun ? 0.72 : 1) * breathe;
  ctx.save();
  ctx.translate(s.x, s.y);
  if (stun) ctx.translate(Math.sin(t * 60) * 2, Math.cos(t * 55) * 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // violet aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const ar = R * 2.3 * k;
  const g = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, ar);
  g.addColorStop(0, stun ? 'rgba(120,110,140,0.25)' : 'rgba(150,60,220,0.35)');
  g.addColorStop(1, 'rgba(90,20,160,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, ar, 0, TAU);
  ctx.fill();
  ctx.restore();

  const body = stun ? '#2c2a33' : '#08040f';
  const rim = stun ? 'rgba(170,160,190,0.7)' : 'rgba(170,80,255,0.85)';

  // trailing smoke tendrils
  const tn = 7;
  for (let i = 0; i < tn; i++) {
    const a = (i / tn) * TAU + Math.sin(t * 0.5) * 0.4;
    const len = R * (1.5 + 0.5 * Math.sin(t * 1.3 + i * 2)) * k;
    ctx.beginPath();
    const bx = Math.cos(a) * R * 0.6 * k, by = Math.sin(a) * R * 0.6 * k;
    ctx.moveTo(bx, by);
    let px = bx, py = by;
    const segs = 4;
    for (let sgi = 1; sgi <= segs; sgi++) {
      const d = (sgi / segs);
      const sway = Math.sin(t * 2.2 + i * 1.7 + sgi * 0.9) * R * 0.35 * d;
      const nx = Math.cos(a) * (R * 0.6 + len * d) * k - Math.sin(a) * sway;
      const ny = Math.sin(a) * (R * 0.6 + len * d) * k + Math.cos(a) * sway;
      ctx.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
      px = nx; py = ny;
    }
    ctx.lineWidth = R * 0.5;
    ctx.strokeStyle = rim;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.lineWidth = R * 0.34;
    ctx.strokeStyle = body;
    ctx.globalAlpha = 0.95;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // claw fingers radiating (the hand)
  const fingers = 5;
  for (let i = 0; i < fingers; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.55 + Math.sin(t * 1.1 + i) * 0.12;
    const l = R * (stun ? 1.1 : 1.55 + 0.12 * Math.sin(t * 2 + i * 1.3));
    const x0 = Math.cos(a) * R * 0.5 * k, y0 = Math.sin(a) * R * 0.5 * k;
    const x1 = Math.cos(a + 0.18) * l * k, y1 = Math.sin(a + 0.18) * l * k;
    ctx.beginPath();
    ctx.moveTo(x0 - Math.sin(a) * R * 0.22, y0 + Math.cos(a) * R * 0.22);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x0 + Math.sin(a) * R * 0.22, y0 - Math.cos(a) * R * 0.22);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // main blob with wobbly edge
  ctx.beginPath();
  const pts = 20;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * TAU;
    const r = R * k * (1 + Math.sin(a * 3 + t * 1.4) * 0.09 + Math.sin(a * 5 - t * 2.1) * 0.05);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rim;
  ctx.shadowColor = stun ? 'rgba(160,150,180,0.8)' : 'rgba(170,70,255,0.9)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // eyes
  const ey = -R * 0.1 * k, ex = R * 0.34 * k;
  for (let sd = -1; sd <= 1; sd += 2) {
    ctx.save();
    ctx.translate(sd * ex, ey);
    if (stun) {
      ctx.strokeStyle = '#cfc8e0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-4, -4); ctx.lineTo(4, 4);
      ctx.moveTo(4, -4); ctx.lineTo(-4, 4);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
      eg.addColorStop(0, 'rgba(230,240,200,0.8)');
      eg.addColorStop(1, 'rgba(180,200,150,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#eef3d8';
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 5 * (0.85 + 0.15 * Math.sin(t * 0.9 + sd)), sd * 0.25, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawWax(ctx, w, t) {
  const seed = (w.x * 7 + w.y * 13) | 0;
  ctx.save();
  ctx.translate(w.x, w.y);
  const R = C.WAX_R;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 3, R * 1.1, R * 0.6, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUT;
  ctx.fillStyle = '#f6e7bf';
  ctx.beginPath();
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const r = R * (0.85 + hash(seed, i) * 0.35);
    const x = Math.cos(a) * r * 1.1, y = Math.sin(a) * r * 0.8;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.ellipse(-R * 0.3, -R * 0.2, R * 0.4, R * 0.2, -0.4, 0, TAU);
  ctx.fill();
  // twinkle
  const tw = Math.max(0, Math.sin(t * 3 + seed));
  if (tw > 0.05) {
    const sz = 3 + tw * 5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(R * 0.35, -R * 0.45);
    ctx.fillStyle = `rgba(255,250,210,${0.4 + tw * 0.6})`;
    ctx.beginPath();
    ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.25, -sz * 0.25); ctx.lineTo(sz, 0);
    ctx.lineTo(sz * 0.25, sz * 0.25); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.25, sz * 0.25);
    ctx.lineTo(-sz, 0); ctx.lineTo(-sz * 0.25, -sz * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function drawEmber(ctx, e, t) {
  const sp = Math.hypot(e.vx, e.vy) || 1;
  const dx = e.vx / sp, dy = e.vy / sp;
  const r = C.EMBER_R;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  // tail
  const tl = 26 + Math.sin(t * 40) * 3;
  ctx.strokeStyle = 'rgba(255,120,30,0.5)';
  ctx.lineWidth = r * 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-dx * tl, -dy * tl);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,200,90,0.7)';
  ctx.lineWidth = r * 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-dx * tl * 0.6, -dy * tl * 0.6);
  ctx.stroke();
  // glow
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.2);
  g.addColorStop(0, 'rgba(255,240,200,0.9)');
  g.addColorStop(0.4, 'rgba(255,140,40,0.5)');
  g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff6e0';
  ctx.beginPath();
  ctx.arc(0, 0, r * (0.65 + Math.sin(t * 50) * 0.08), 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawWall(ctx, rect, t) {
  const { x, y, w, h } = rect;
  const sd = (x * 31 + y * 17) | 0;
  ctx.save();
  ctx.lineJoin = 'round';
  // drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 5, y + 7, w, h);
  // body
  ctx.fillStyle = '#5b5470';
  ctx.fillRect(x, y, w, h);
  // top bevel highlight / bottom shade
  const b = Math.min(7, Math.min(w, h) * 0.18);
  ctx.fillStyle = '#7d7596';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - b, y + b); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + h - b); ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3e3850';
  ctx.beginPath();
  ctx.moveTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x + b, y + h - b); ctx.lineTo(x + w - b, y + h - b); ctx.lineTo(x + w - b, y + b); ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  // inner slab face
  ctx.fillStyle = '#665e7e';
  ctx.fillRect(x + b, y + b, w - b * 2, h - b * 2);
  // stone speckle blocks
  ctx.fillStyle = 'rgba(30,20,50,0.18)';
  const cells = Math.floor((w * h) / 900) + 2;
  for (let i = 0; i < cells; i++) {
    const px = x + b + hash(sd, i, 1) * (w - b * 2 - 8);
    const py = y + b + hash(sd, i, 2) * (h - b * 2 - 8);
    ctx.fillRect(px, py, 4 + hash(sd, i, 3) * 9, 3 + hash(sd, i, 4) * 6);
  }
  // cracks
  ctx.strokeStyle = 'rgba(20,12,34,0.7)';
  ctx.lineWidth = 1.6;
  const cracks = 1 + Math.floor(Math.min(w, h) / 60) + (w * h > 20000 ? 1 : 0);
  for (let i = 0; i < cracks; i++) {
    let cx = x + b + hash(sd, i, 10) * (w - b * 2);
    let cy = y + b + hash(sd, i, 11) * (h - b * 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let j = 0; j < 4; j++) {
      cx += (hash(sd, i, 20 + j) - 0.5) * 22;
      cy += (hash(sd, i, 30 + j) - 0.3) * 18;
      cx = clamp(cx, x + 2, x + w - 2);
      cy = clamp(cy, y + 2, y + h - 2);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  // moss specks on edges
  ctx.fillStyle = '#4f7a4a';
  const moss = 4 + Math.floor((w + h) / 40);
  for (let i = 0; i < moss; i++) {
    const side = Math.floor(hash(sd, i, 40) * 4);
    const u = hash(sd, i, 41);
    const px = side === 0 ? x + u * w : side === 1 ? x + w - 3 : side === 2 ? x + u * w : x + 1;
    const py = side === 0 ? y + 1 : side === 1 ? y + u * h : side === 2 ? y + h - 4 : y + u * h;
    ctx.beginPath();
    ctx.arc(px, py, 2 + hash(sd, i, 42) * 3, 0, TAU);
    ctx.fill();
  }
  // engraving
  const m = Math.min(w, h);
  if (m >= 40) {
    const cxm = x + w / 2, cym = y + h / 2;
    ctx.strokeStyle = 'rgba(25,16,40,0.65)';
    ctx.fillStyle = 'rgba(25,16,40,0.65)';
    ctx.lineCap = 'round';
    if (w >= 140 && h >= 140) {
      ctx.font = `bold ${Math.floor(m * 0.28)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RIP', cxm, cym + m * 0.12);
      ctx.lineWidth = 4;
      const cs = m * 0.16;
      ctx.beginPath();
      ctx.moveTo(cxm, cym - m * 0.38); ctx.lineTo(cxm, cym - m * 0.38 + cs * 1.6);
      ctx.moveTo(cxm - cs * 0.5, cym - m * 0.38 + cs * 0.55); ctx.lineTo(cxm + cs * 0.5, cym - m * 0.38 + cs * 0.55);
      ctx.stroke();
    } else if (w >= 140 || h >= 140) {
      ctx.lineWidth = 3;
      const cs = m * 0.22;
      ctx.beginPath();
      ctx.moveTo(cxm, cym - cs); ctx.lineTo(cxm, cym + cs);
      ctx.moveTo(cxm - cs * 0.6, cym - cs * 0.3); ctx.lineTo(cxm + cs * 0.6, cym - cs * 0.3);
      ctx.stroke();
    }
  }
  // outline
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

export function drawWater(ctx, c, t) {
  const sd = (c.x * 3 + c.y * 5) | 0;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.beginPath();
  ctx.arc(0, 0, c.r, 0, TAU);
  ctx.fillStyle = 'rgba(14,52,62,0.82)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // inner depth
  ctx.fillStyle = 'rgba(6,28,38,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, c.r * 0.7, 0, TAU);
  ctx.fill();
  // ripple rings
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const ph = ((t * 0.18 + i / 3 + hash(sd) ) % 1);
    const cx = Math.sin(sd + i * 2) * c.r * 0.3;
    const cy = Math.cos(sd * 0.7 + i * 3) * c.r * 0.3;
    ctx.strokeStyle = `rgba(120,210,200,${0.38 * (1 - ph)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ph * c.r * 0.85, ph * c.r * 0.6, 0, 0, TAU);
    ctx.stroke();
  }
  // highlight
  ctx.strokeStyle = 'rgba(190,255,240,0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, c.r * 0.72, Math.PI * 1.1 + Math.sin(t * 0.4) * 0.1, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
  // rim
  ctx.strokeStyle = 'rgba(8,24,30,0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, c.r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,170,170,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, c.r - 3, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
