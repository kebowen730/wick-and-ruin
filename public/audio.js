// WICK & RUIN — synthesised audio (WebAudio only, no assets)
export function createAudio() {
  let ctx = null, master = null, sfxBus = null, out = null, amb = null, noiseBuf = null;
  const last = {};
  const rnd = (a, b) => a + Math.random() * (b - a);

  function makeNoise() {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function env(g, t, a, peak, dur) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // oscillator with optional frequency slide, enveloped
  function tone(dest, type, f0, f1, t, dur, peak, a = 0.005) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, peak, dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // filtered noise burst with filter sweep
  function noise(dest, t, dur, peak, ftype, f0, f1, q = 1, a = 0.005) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  const kinds = {
    fire(t) {
      noise(out, t, 0.09, 0.35, 'bandpass', 2500, 900, 0.8);
      tone(out, 'square', 380, 900, t, 0.1, 0.08);
    },
    dash(t) {
      noise(out, t, 0.3, 0.45, 'bandpass', 400, 3200, 2, 0.06);
      noise(out, t + 0.05, 0.25, 0.2, 'highpass', 3000, 1500, 0.5, 0.08);
    },
    hit(t) {
      tone(out, 'sine', 160, 50, t, 0.18, 0.7);
      noise(out, t, 0.12, 0.5, 'lowpass', 1800, 300, 1);
      tone(out, 'sawtooth', 120, 60, t, 0.08, 0.15);
    },
    hurt(t) {
      tone(out, 'sine', 100, 38, t, 0.3, 0.8);
      noise(out, t, 0.15, 0.4, 'lowpass', 900, 200, 1);
      tone(out, 'square', 466, 440, t + 0.02, 0.22, 0.09); // dissonant minor-2nd pair
      tone(out, 'square', 493, 466, t + 0.02, 0.22, 0.07);
    },
    death(t) {
      tone(out, 'sine', 900, 120, t, 0.9, 0.3, 0.02).frequency.setValueAtTime(900, t);
      tone(out, 'triangle', 905, 125, t, 0.9, 0.12, 0.02);
      noise(out, t + 0.25, 0.7, 0.28, 'highpass', 4500, 2500, 0.7, 0.05);
    },
    pickup(t) {
      tone(out, 'sine', 659, 659, t, 0.2, 0.3);
      tone(out, 'sine', 988, 988, t + 0.08, 0.3, 0.3);
      tone(out, 'triangle', 1976, 1976, t + 0.08, 0.15, 0.05);
    },
    fizzle(t) {
      noise(out, t, 0.2, 0.3, 'highpass', 5000, 3000, 0.7, 0.01);
    },
    snuff(t) {
      tone(out, 'sine', 70, 28, t, 1.4, 0.9, 0.01);
      tone(out, 'triangle', 140, 45, t, 0.9, 0.25, 0.01);
      noise(out, t, 0.9, 0.35, 'lowpass', 150, 1800, 1, 0.8); // swell-up
      noise(out, t + 0.9, 0.4, 0.3, 'lowpass', 1800, 100, 1, 0.01);
    },
    spawn(t) {
      noise(out, t, 0.12, 0.3, 'bandpass', 4000, 6000, 1.5, 0.01); // match strike
      noise(out, t + 0.1, 0.25, 0.15, 'lowpass', 1200, 400, 1, 0.05);
      tone(out, 'sine', 300, 700, t + 0.2, 0.1, 0.35);
    },
    win(t) {
      // minor arpeggio up, ending on a raised, slightly off-kilter top
      [220, 261.6, 329.6, 440, 523.3, 659.3].forEach((f, i) => {
        tone(out, 'triangle', f, f, t + i * 0.11, 0.5, 0.25);
        tone(out, 'sine', f * 2.01, f * 2.01, t + i * 0.11, 0.4, 0.08);
      });
      tone(out, 'sawtooth', 110, 110, t, 1.2, 0.08, 0.3);
    },
  };

  // --- ambience ---
  const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
  function musicNote() {
    const oct = [0, 12, 12, 24][Math.floor(Math.random() * 4)];
    const f = 261.63 * Math.pow(2, (SCALE[Math.floor(Math.random() * 5)] + oct) / 12);
    const t = ctx.currentTime + 0.02, len = rnd(1.2, 2.4);
    tone(amb, 'triangle', f, f, t, len, 0.07, 0.004);
    tone(amb, 'sine', f * 2, f * 2, t, len * 0.5, 0.025, 0.004);
    if (Math.random() < 0.35) { // echo-ish second note
      const f2 = 261.63 * Math.pow(2, (SCALE[Math.floor(Math.random() * 5)] + 12) / 12);
      tone(amb, 'triangle', f2, f2, t + 0.28, len, 0.05, 0.004);
    }
    setTimeout(musicNote, rnd(2200, 5500));
  }
  function drip() {
    const t = ctx.currentTime + 0.01, f = rnd(900, 2000);
    const g = ctx.createGain(); g.gain.value = rnd(0.3, 1);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = rnd(-0.8, 0.8); g.connect(p).connect(amb); } else g.connect(amb);
    tone(g, 'sine', f * 1.4, f, t, 0.18, 0.1, 0.002);
    setTimeout(drip, rnd(1500, 6000));
  }
  function startAmbience() {
    const t = ctx.currentTime;
    // drone
    const dg = ctx.createGain(); dg.gain.value = 0.09; dg.connect(amb);
    [55, 55.4].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(dg); o.start(t);
    });
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.04;
    lfo.connect(lg).connect(dg.gain); lfo.start(t);
    // wind
    const ws = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
    ws.buffer = noiseBuf; ws.loop = true;
    wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.9;
    wg.gain.value = 0.05;
    const l2 = ctx.createOscillator(), l2g = ctx.createGain();
    l2.frequency.value = 0.045; l2g.gain.value = 0.04;
    l2.connect(l2g).connect(wg.gain); l2.start(t);
    const l3 = ctx.createOscillator(), l3g = ctx.createGain();
    l3.frequency.value = 0.06; l3g.gain.value = 180;
    l3.connect(l3g).connect(wf.frequency); l3.start(t);
    ws.connect(wf).connect(wg).connect(amb); ws.start(t);
    setTimeout(drip, 2000);
    setTimeout(musicNote, 3000);
  }

  function unlock() {
    try {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 4;
      comp.attack.value = 0.005; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.5;
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
      amb = ctx.createGain(); amb.gain.value = 0.8;
      sfxBus.connect(comp); amb.connect(comp);
      comp.connect(master).connect(ctx.destination);
      noiseBuf = makeNoise();
      if (ctx.state === 'suspended') ctx.resume();
      startAmbience();
    } catch (e) { ctx = null; }
  }

  function play(kind, vol = 1) {
    if (!ctx || !noiseBuf || ctx.state !== 'running') return;
    const fn = kinds[kind];
    if (!fn) return;
    vol = Number.isFinite(+vol) ? Math.max(0, Math.min(1, +vol)) : 1;
    if (vol <= 0) return;
    const now = performance.now();
    if (last[kind] !== undefined && now - last[kind] < 40) return;
    last[kind] = now;
    try {
      const g = ctx.createGain(); g.gain.value = vol; g.connect(sfxBus);
      out = g;
      fn(ctx.currentTime + 0.005);
    } catch (e) { /* ignore */ }
  }
  return { unlock, play };
}
