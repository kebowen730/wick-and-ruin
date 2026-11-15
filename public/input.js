// Keyboard / mouse / touch input for WICK & RUIN.
export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: innerWidth / 2 + 1, y: innerHeight / 2, down: false };
  let dashQueued = false;
  let lastAim = 0;

  // touch state
  const DEAD = 14, MAXR = 56, TAP_MS = 250, TAP_MOVE = 14;
  let moveT = null; // {id, ox, oy, x, y}
  let aimT = null; // {id, ox, oy, x, y, t0, maxd}
  let tmx = 0, tmy = 0, tfire = false;

  const typing = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  };

  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  addEventListener('keydown', (e) => {
    if (typing()) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!GAME_KEYS.has(e.code)) return;
    if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !keys.has(e.code)) dashQueued = true;
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); });
  addEventListener('blur', () => { keys.clear(); mouse.down = false; dashQueued = false; });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.button === 0) mouse.down = true;
    else if (e.button === 2) { dashQueued = true; e.preventDefault(); }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });

  // ---- touch visuals ----
  function makeCircle(size, bg, border) {
    const d = document.createElement('div');
    Object.assign(d.style, {
      position: 'fixed', left: '0', top: '0', width: size + 'px', height: size + 'px',
      marginLeft: -size / 2 + 'px', marginTop: -size / 2 + 'px', borderRadius: '50%',
      background: bg, border: border, pointerEvents: 'none', display: 'none', zIndex: 50,
      boxSizing: 'border-box',
    });
    document.body.appendChild(d);
    return d;
  }
  const mkStick = (rgb) => ({
    base: makeCircle(MAXR * 2, `rgba(${rgb},0.10)`, `2px solid rgba(${rgb},0.35)`),
    knob: makeCircle(44, `rgba(${rgb},0.35)`, `2px solid rgba(${rgb},0.6)`),
  });
  const moveV = mkStick('255,220,150');
  const aimV = mkStick('255,140,90');
  function place(v, t) {
    if (!t) { v.base.style.display = v.knob.style.display = 'none'; return; }
    const dx = t.x - t.ox, dy = t.y - t.oy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, MAXR / d);
    v.base.style.display = v.knob.style.display = 'block';
    v.base.style.transform = `translate(${t.ox}px,${t.oy}px)`;
    v.knob.style.transform = `translate(${t.ox + dx * k}px,${t.oy + dy * k}px)`;
  }

  function recompute() {
    if (moveT) {
      const dx = moveT.x - moveT.ox, dy = moveT.y - moveT.oy, d = Math.hypot(dx, dy);
      if (d > 6) { const m = Math.min(1, d / MAXR); tmx = (dx / d) * m; tmy = (dy / d) * m; }
      else { tmx = 0; tmy = 0; }
    } else { tmx = 0; tmy = 0; }
    tfire = false;
    if (aimT) {
      const dx = aimT.x - aimT.ox, dy = aimT.y - aimT.oy, d = Math.hypot(dx, dy);
      if (d > DEAD) { lastAim = Math.atan2(dy, dx); tfire = true; }
    }
    place(moveV, moveT);
    place(aimV, aimT);
  }

  function onStart(e) {
    if (e.target !== canvas && e.target !== document.body) return;
    if (typing()) return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2) {
        if (!moveT) moveT = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      } else if (!aimT) {
        aimT = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now(), maxd: 0 };
      }
    }
    e.preventDefault();
    recompute();
  }
  function onMove(e) {
    for (const t of e.changedTouches) {
      if (moveT && t.identifier === moveT.id) { moveT.x = t.clientX; moveT.y = t.clientY; }
      if (aimT && t.identifier === aimT.id) {
        aimT.x = t.clientX; aimT.y = t.clientY;
        aimT.maxd = Math.max(aimT.maxd, Math.hypot(aimT.x - aimT.ox, aimT.y - aimT.oy));
      }
    }
    if (moveT || aimT) e.preventDefault();
    recompute();
  }
  function onEnd(e) {
    for (const t of e.changedTouches) {
      if (moveT && t.identifier === moveT.id) moveT = null;
      if (aimT && t.identifier === aimT.id) {
        if (performance.now() - aimT.t0 < TAP_MS && aimT.maxd < TAP_MOVE) dashQueued = true;
        aimT = null;
      }
    }
    recompute();
  }
  canvas.addEventListener('touchstart', onStart, { passive: false });
  addEventListener('touchmove', onMove, { passive: false });
  addEventListener('touchend', onEnd);
  addEventListener('touchcancel', onEnd);

  return {
    get() {
      let mx = 0, my = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
      const l = Math.hypot(mx, my);
      if (l > 0) { mx /= l; my /= l; }
      if (moveT && (tmx || tmy)) { mx = tmx; my = tmy; }

      let aim, fire = mouse.down;
      if (aimT) { aim = lastAim; fire = fire || tfire; }
      else if (moveT || tfire || lastTouchActive()) aim = lastAim;
      else aim = Math.atan2(mouse.y - innerHeight / 2, mouse.x - innerWidth / 2);
      if (aimT || touchMode) { aim = lastAim; }
      else lastAim = aim;

      // dash: key held state or queued press (so quick taps aren't missed)
      const dash = dashQueued || keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight');
      dashQueued = false;
      return { mx, my, aim, fire: !!fire, dash: !!dash };
    },
  };

  function lastTouchActive() { return touchMode; }
}

let touchMode = false;
addEventListener('touchstart', () => { touchMode = true; }, { passive: true });
addEventListener('mousemove', () => { touchMode = false; });
