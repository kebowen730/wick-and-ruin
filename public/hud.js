import { C } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);
const KEY = 'wickruin.name';

export function createHud() {
  const el = {
    join: $('join'), form: $('joinform'), name: $('name'),
    feed: $('feed'), rows: $('rows'), warn: $('snuffwarn'), puddle: $('puddle'),
    round: $('round'), roundwin: $('roundwin'), roundnext: $('roundnext'),
    flamefill: $('flamefill'), flamelabel: $('flamelabel'),
    dashfill: $('dashfill'), conn: $('conn'),
  };
  const last = {};
  // set only when changed
  const setText = (k, node, v) => { if (last[k] !== v) { last[k] = v; node.textContent = v; } };
  const setShow = (k, node, show) => { if (last[k] !== show) { last[k] = show; node.classList.toggle('hidden', !show); } };
  const setStyle = (k, node, prop, v) => { if (last[k] !== v) { last[k] = v; node.style[prop] = v; } };
  const setCls = (k, node, cls, on) => { if (last[k] !== on) { last[k] = on; node.classList.toggle(cls, on); } };

  let meId = null;

  function showJoin(onJoin) {
    try { const n = localStorage.getItem(KEY); if (n) el.name.value = n.slice(0, 16); } catch (e) {}
    el.join.classList.remove('gone');
    let done = false;
    el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (done) return;
      done = true;
      const name = el.name.value.trim().slice(0, 16);
      try { localStorage.setItem(KEY, name); } catch (err) {}
      el.join.classList.add('gone');
      el.name.blur();
      onJoin(name);
    });
    setTimeout(() => { try { el.name.focus(); } catch (e) {} }, 50);
  }

  function update(view) {
    if (!view) return;
    meId = view.meId;
    const players = view.players || [];
    const me = players.find((p) => p.id === view.meId);

    // flame + dash
    if (me) {
      const fl = Math.max(0, me.flame || 0);
      setStyle('ff', el.flamefill, 'width', Math.min(100, (fl / C.FLAME_MAX) * 100).toFixed(1) + '%');
      setCls('low', el.flamefill, 'low', fl < 30);
      setText('fl', el.flamelabel, String(Math.round(fl)));
      const ready = 1 - Math.min(1, Math.max(0, (me.dashCd || 0) / C.DASH_CD));
      setStyle('df', el.dashfill, 'width', (ready * 100).toFixed(0) + '%');
      setCls('dr', el.dashfill, 'ready', ready >= 1);
    }

    // scoreboard
    const sorted = players.slice().sort((a, b) => (b.souls || 0) - (a.souls || 0)).slice(0, 8);
    const sig = sorted.map((p) => p.id + '|' + p.name + '|' + p.souls + '|' + (p.id === view.meId ? 1 : 0)).join('~');
    if (last.board !== sig) {
      last.board = sig;
      el.rows.textContent = '';
      for (const p of sorted) {
        const r = document.createElement('div');
        r.className = 'row' + (p.id === view.meId ? ' me' : '');
        const n = document.createElement('span'); n.className = 'n'; n.textContent = p.name;
        const s = document.createElement('span'); s.textContent = '☠ ' + (p.souls || 0);
        r.append(n, s);
        el.rows.append(r);
      }
    }

    // snuffer warning
    const hunted = !!(view.snuffer && view.snuffer.target === view.meId && me && me.alive);
    setShow('warn', el.warn, hunted);

    // puddle
    const dead = !!(me && !me.alive);
    setShow('pud', el.puddle, dead);
    if (dead) setText('pudt', el.puddle, 'You are a puddle. Relighting in ' + Math.max(1, Math.ceil(me.respawn || 0)) + '…');

    // round over
    const over = !!(view.round && view.round.phase === 'over');
    setShow('over', el.round, over);
    if (over) {
      setText('rw', el.roundwin, (view.round.winner || 'Nobody') + ' burns brightest!');
      setText('rn', el.roundnext, 'next round in ' + Math.max(0, Math.ceil(view.round.timer || 0)));
    }
  }

  function event(ev) {
    if (!ev || ev.k !== 'death' || !ev.msg) return;
    const line = document.createElement('div');
    line.className = 'line' + ((ev.id === meId || ev.by === meId) && meId ? ' me' : '');
    line.textContent = ev.msg;
    el.feed.append(line);
    while (el.feed.children.length > 5) el.feed.removeChild(el.feed.firstChild);
    setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 5100);
  }

  function setConnected(ok) {
    setShow('conn', el.conn, !ok);
  }

  return { showJoin, update, event, setConnected };
}
