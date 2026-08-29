// ---------------------------------------------------------------------------
// THE SCORE.
//
// Generated, not written, and played *by* the player rather than to them.
//
// Everything else in this project has been pushed towards silence -- the hum
// went, the room tone went, the door creak went, and a crossing is silent on
// purpose. So a soundtrack has to answer the question that killed those: what
// is it doing when nothing is happening? The answer here is nothing. The score
// has no existence of its own. It is a reading of what you are doing, and if
// you stand still and touch nothing it stops, layer by layer, until the
// building is as quiet as it was before.
//
// That is also what makes it uncanny rather than atmospheric. Music that plays
// regardless is furniture; music that starts when you start walking is
// something that is listening. The player is not told this and it is not
// announced -- it is worked out, the same way the architecture is (PLAN §2).
//
// What each thing you do sounds like:
//
//   walking          the ostinato exists at all -- it fades in with your speed
//                    and out when you stop, and every eighth footstep rewrites
//                    one note of it, so the figure you are hearing is one you
//                    walked into being
//   standing still   the pulse goes in about two seconds, the bed after
//                    sixteen, and then nothing
//   looking about    a fast turn of the head widens the detune and opens the
//                    filter -- the sound of not being settled
//   taking something a bell on a chord tone, pitched by how big the thing is,
//                    and a quiet held note that stays for as long as you carry
//                    it. You are carrying a note around the house
//   putting it down  the carried note falls a semitone and dies
//   throwing it      a dissonant cluster through the grit bus
//   an impact        a metal accent, quantised to the next sixteenth, so a
//                    dropped bucket lands *in* the music instead of over it
//   a door           the harmony moves. Doors are the strongest instrument in
//                    the building, so they get the strongest musical event:
//                    the chord advances and the organ swells
//   a room           every room owns a chord, hashed from its key and the seed.
//                    The front room sounds like the front room every time you
//                    are in it, which is exactly the evidence a player marking
//                    rooms is trying to collect
//   depth            slower, darker, heavier, and eventually a Shepard glide
//                    that never arrives anywhere
//
// And a fold makes no sound at all, ever. Depth changes when you cross one, so
// everything depth drives is eased over seconds and the glide is fired on a
// random delay -- there must be no moment in the music that lines up with the
// crossing, or the score gives away the one thing the whole building is built
// to hide.
//
// The picture is wired to it: `Music.fx` carries a note envelope, the weight
// underneath and the shine off a bell into the perception pass (35-vision.js),
// into the light pool and into the fog. All three are exactly zero until the
// music starts, so a build with the score in it draws the same pixels as one
// without -- which is what the screenshot A/B in PLAN §3 depends on.
//
// ?nomusic=1 turns it off.
// ---------------------------------------------------------------------------

const Music = (() => {

  // --- the house's own tune ---------------------------------------------
  // Its own stream, like the drift and the textures have theirs, so what a
  // house sounds like is a property of its number and does not depend on how
  // many stains got drawn or how many rooms got grown.
  const MR = mulberry32((SEED ^ 0x27d4eb2f) >>> 0);
  const mpick = a => a[Math.floor(MR() * a.length)];
  const mrr = (a, b) => a + MR() * (b - a);
  const mchance = p => MR() < p;

  const MODES = {
    aeolian:  [0, 2, 3, 5, 7, 8, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10]     // the flat second: the Carpenter note
  };
  // Low. All of this lives under the middle of the piano and most of it under
  // the bottom of it.
  const ROOTS = [40, 41, 42, 43, 45, 47];      // E2 F2 F#2 G2 A2 B2

  // Sixteenths in a bar. 20 is five-four and 14 is seven-eight, which are the
  // two metres that will not let you settle into them; four-four is in the hat
  // so that some houses are merely grim rather than actively wrong.
  const METRES = [20, 20, 14, 14, 16];

  const HOUSE = {
    root: mpick(ROOTS),
    mode: mchance(0.55) ? 'phrygian' : 'aeolian',
    metre: mpick(METRES),
    bpm: Math.round(mrr(76, 94))
  };

  const SCALE = MODES[HOUSE.mode];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // degree may run past the top of the scale and out the other side
  function deg(d) {
    const n = SCALE.length;
    const i = ((d % n) + n) % n;
    return SCALE[i] + 12 * Math.floor(d / n);
  }

  // The ostinato. A short figure, mostly root, on a rhythm that is dense at
  // the front of the bar and ragged after it -- which is what stops an odd
  // metre reading as a waltz. Held as scale degrees so it can be moved to
  // whatever chord the room you are in owns.
  const CELL_TONES = HOUSE.mode === 'phrygian'
    ? [0, 0, 0, 0, 4, 4, 2, 1, 7, 5]        // root, fifth, b3, b2, octave, b6
    : [0, 0, 0, 0, 4, 4, 2, 5, 7, 6];
  function makeCell() {
    const n = HOUSE.metre, cell = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const strong = (i % 4 === 0) ? 0.92 : (i % 2 === 0) ? 0.38 : 0.16;
      if (i === 0 || MR() < strong) cell[i] = mpick(CELL_TONES);
    }
    cell[0] = 0;                                   // the bar starts on the floor
    return cell;
  }
  const CELL = makeCell();

  // --- every room owns a chord -------------------------------------------
  // Hashed from the room's key and the seed, so it does not depend on the
  // order you find the rooms in: walk back into the front room an hour later
  // and it is the same chord it was. Weighted hard towards the tonic, because
  // a building where every room is a different chord is a tour, and this is
  // meant to be a pedal you keep coming back to.
  const DEGREES = [0, 0, 0, 0, 5, 5, 3, 4, 1, 6];
  const _degCache = {};
  function degreeOf(key) {
    if (key in _degCache) return _degCache[key];
    let h = (SEED ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
    return (_degCache[key] = DEGREES[h % DEGREES.length]);
  }

  // --- what the picture is given -----------------------------------------
  // Zero until a note is actually played. See renderVision().
  const fx = { pulse: 0, sub: 0, shine: 0, tension: 0 };

  // --- state --------------------------------------------------------------
  let ctx = null, running = false, timer = null;
  let bus, dry, wow, wowLfo, wowDepth, grit, gritIn, tilt, comp, outGain;
  let revSend, revReturn, delIn, delOut;
  let pulseBus, bassBus, padBus, metalBus, bedBus;
  let bedNodes = null, carried = null, shepardUntil = 0, shepardAt = 1e9;

  let nextStep = 0, stepNo = 0, notes = 0;
  let degree = 0, wantDegree = 0;
  const pending = [];        // events waiting for the next sixteenth
  const visq = [];           // what the picture should do, and when

  // macros, all 0..1, all smoothed -- nothing in here is allowed to snap
  const M = { motion: 0, unease: 0, depth: 0.3, presence: 0, weight: 0 };
  let idle = 0, lastYaw = null, accent = 0, walkSteps = 0;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  // --- the bus ------------------------------------------------------------
  //
  // layers -> mix -> wow -> grit (parallel) -> tilt -> compressor -> out
  //
  // The wow is one delay line of about nine milliseconds with a slow LFO on
  // it, so the whole score drifts very slightly out of tune with itself and
  // never quite sits still. It is the difference between a synthesiser and a
  // synthesiser that has been in a damp room for thirty years, and it costs a
  // single node. Depth rises with how far in you are.
  function buildBus(destination) {
    bus = ctx.createGain(); bus.gain.value = 1;

    wow = ctx.createDelay(0.1);
    wow.delayTime.value = 0.009;
    wowLfo = ctx.createOscillator(); wowLfo.type = 'sine'; wowLfo.frequency.value = 0.23;
    wowDepth = ctx.createGain(); wowDepth.gain.value = 0.0009;
    wowLfo.connect(wowDepth); wowDepth.connect(wow.delayTime); wowLfo.start();

    dry = ctx.createGain(); dry.gain.value = 1;

    // the grit path: a hard curve in parallel, brought up by unease
    gritIn = ctx.createGain(); gritIn.gain.value = 0.12;
    grit = ctx.createWaveShaper(); grit.oversample = '2x';
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 4.2); }
    grit.curve = curve;

    tilt = ctx.createBiquadFilter(); tilt.type = 'lowpass';
    tilt.frequency.value = 2600; tilt.Q.value = 0.5;

    // A limiter, not a leveller. At -20 and 6:1 it was catching the bed as
    // well as the stabs, and the whole point of the thing is that standing
    // still is quieter than walking -- a compressor set that low hands you
    // back the same loudness whatever you do.
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6; comp.knee.value = 4; comp.ratio.value = 9;
    comp.attack.value = 0.004; comp.release.value = 0.25;

    outGain = ctx.createGain(); outGain.gain.value = 0.0001;

    bus.connect(wow);
    wow.connect(dry); dry.connect(tilt);
    wow.connect(gritIn); gritIn.connect(grit); grit.connect(tilt);
    tilt.connect(comp); comp.connect(outGain); outGain.connect(destination);

    // one reverb, dark and long, drawn the way everything else here is drawn
    revSend = ctx.createGain(); revSend.gain.value = 1;
    const conv = ctx.createConvolver();
    conv.buffer = impulse(3.4, 3.0);
    const revDark = ctx.createBiquadFilter();
    revDark.type = 'lowpass'; revDark.frequency.value = 1900; revDark.Q.value = 0.3;
    revReturn = ctx.createGain(); revReturn.gain.value = 0.7;
    revSend.connect(conv); conv.connect(revDark); revDark.connect(revReturn); revReturn.connect(bus);

    // and one dark feedback delay, off the metal and the stabs only
    delIn = ctx.createGain(); delIn.gain.value = 1;
    const d = ctx.createDelay(3.0); d.delayTime.value = 60 / HOUSE.bpm * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const dLp = ctx.createBiquadFilter(); dLp.type = 'lowpass'; dLp.frequency.value = 1300;
    delOut = ctx.createGain(); delOut.gain.value = 0.5;
    delIn.connect(d); d.connect(dLp); dLp.connect(fb); fb.connect(d); dLp.connect(delOut);
    delOut.connect(bus);

    const layer = (rev, del) => {
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(bus);
      if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(revSend); }
      if (del > 0) { const s = ctx.createGain(); s.gain.value = del; g.connect(s); s.connect(delIn); }
      return g;
    };
    pulseBus = layer(0.16, 0);
    bassBus  = layer(0.08, 0);
    padBus   = layer(0.45, 0);
    metalBus = layer(0.60, 0.35);
    bedBus   = layer(0.10, 0);
  }

  // Noise under an exponential decay, darkening as it goes. Drawn once.
  function impulse(sec, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const b = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const w = (MR() * 2 - 1) * Math.pow(1 - t, decay);
        lp += (w - lp) * (0.55 - 0.4 * t);      // the tail loses its top end
        d[i] = lp;
      }
    }
    return b;
  }

  // --- the voices ---------------------------------------------------------

  // The ostinato note. Two saws a few cents apart and a square under them,
  // through a resonant lowpass that opens on the attack and shuts behind it.
  function pluck(midi, t, level, cutoff, q) {
    const f = mtof(midi);
    const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = f;
    const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = f;
    b.detune.value = 7 + M.unease * 22;
    const s = ctx.createOscillator(); s.type = 'square'; s.frequency.value = f / 2;
    const sg = ctx.createGain(); sg.gain.value = 0.28;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = q;
    const env = ctx.createGain(); env.gain.value = 0.0001;

    a.connect(flt); b.connect(flt); s.connect(sg); sg.connect(flt);
    flt.connect(env); env.connect(pulseBus);

    const atk = 0.006, dec = 0.19 + M.depth * 0.14;
    flt.frequency.setValueAtTime(cutoff, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.22), t + atk + dec);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
    const stop = t + atk + dec + 0.06;
    a.start(t); a.stop(stop); b.start(t); b.stop(stop); s.start(t); s.stop(stop);
  }

  // The floor. A sine and a saw an octave down, punched and shut.
  function low(midi, t, level) {
    const f = mtof(midi);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const w = ctx.createOscillator(); w.type = 'sawtooth'; w.frequency.value = f;
    const wg = ctx.createGain(); wg.gain.value = 0.22;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 6;
    const env = ctx.createGain(); env.gain.value = 0.0001;
    o.connect(flt); w.connect(wg); wg.connect(flt); flt.connect(env); env.connect(bassBus);
    flt.frequency.setValueAtTime(420, t);
    flt.frequency.exponentialRampToValueAtTime(90, t + 0.30);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    [o, w].forEach(n => { n.start(t); n.stop(t + 0.5); });
  }

  // The organ. Additive, so it is a rank of pipes rather than a pad: the
  // fundamental, the octave, the twelfth and the two-octave, each doubled a
  // few cents out so it beats against itself.
  function swell(notes_, t, attack, hold, release, level, cutoff) {
    const parts = [[1, 1], [0.62, 2], [0.24, 3], [0.34, 4], [0.10, 6]];
    notes_.forEach((midi, i) => {
      const f = mtof(midi);
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = cutoff + i * 40; flt.Q.value = 1.4;
      const env = ctx.createGain(); env.gain.value = 0.0001;
      flt.connect(env); env.connect(padBus);
      for (const [amp, mult] of parts) {
        for (const det of [-4, 5]) {
          if (f * mult > 7000) continue;
          const o = ctx.createOscillator();
          o.type = 'sine'; o.frequency.value = f * mult;
          o.detune.value = det * (1 + M.unease);
          const g = ctx.createGain(); g.gain.value = amp * 0.5;
          o.connect(g); g.connect(flt);
          o.start(t); o.stop(t + attack + hold + release + 0.4);
        }
      }
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(level, t + attack);
      env.gain.setValueAtTime(level, t + attack + hold);
      env.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    });
  }

  // A bell, and it is deliberately not in tune with itself: inharmonic
  // partials with a beating partner a few cents off each.
  function bell(midi, t, level, decay) {
    const f = mtof(midi);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = f * 0.7; hp.Q.value = 0.5;
    const env = ctx.createGain(); env.gain.value = 0.0001;
    hp.connect(env); env.connect(metalBus);
    for (const [amp, mult] of [[1, 1], [0.42, 2.76], [0.24, 3.93], [0.11, 5.42]]) {
      for (const det of [0, 7 + M.unease * 9]) {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * mult; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = amp * (det ? 0.35 : 1);
        o.connect(g); g.connect(hp);
        o.start(t); o.stop(t + decay + 0.3);
      }
    }
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    see(t, 'shine', Math.min(1, level * 3.2));
  }

  // Ring modulation, which is a carrier through a gain the modulator is
  // driving: the sum and difference of two frequencies that are not related,
  // which is the sound of something metal that is not a note.
  function ring(f, t, ratio, level, decay) {
    const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = f;
    const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = f * ratio;
    const r = ctx.createGain(); r.gain.value = 0;
    const md = ctx.createGain(); md.gain.value = 1;
    m.connect(md); md.connect(r.gain); c.connect(r);
    const up = ctx.createGain(); up.gain.value = 2.0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f * (ratio + 1); bp.Q.value = 1.1;
    const env = ctx.createGain(); env.gain.value = 0.0001;
    r.connect(up); up.connect(bp); bp.connect(env); env.connect(metalBus);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    [c, m].forEach(o => { o.start(t); o.stop(t + decay + 0.2); });
  }

  // A cluster with a semitone and a tritone guaranteed in it, hit hard and
  // shut fast. This is the only loud thing in here and it only happens when
  // you throw something.
  function stab(base, t, level) {
    const notes_ = [base, base + (mchance(0.5) ? 1 : 6), base + 11, base + 12];
    for (const midi of notes_) {
      const f = mtof(midi);
      const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = f; a.detune.value = -6;
      const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = f; b.detune.value = 6;
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 7;
      const env = ctx.createGain(); env.gain.value = 0.0001;
      a.connect(flt); b.connect(flt); flt.connect(env); env.connect(metalBus);
      flt.frequency.setValueAtTime(4800, t);
      flt.frequency.exponentialRampToValueAtTime(420, t + 0.42);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(level, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      [a, b].forEach(o => { o.start(t); o.stop(t + 0.5); });
    }
    see(t, 'shine', 1);
    see(t, 'pulse', 1);
  }

  // Octave-spaced sines gliding together under a fixed amplitude window, so
  // the loudest part of the stack never moves and the thing appears to climb
  // for ever without getting anywhere. Deep rooms only.
  function shepard(t, dur, dir) {
    const base = mtof(HOUSE.root + 12);
    const master = ctx.createGain(); master.gain.value = 0.0001;
    master.connect(padBus);
    const peak = 0.09 + M.depth * 0.07;
    const fade = dur * 0.25;
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(peak, t + fade);
    master.gain.setValueAtTime(peak, t + dur - fade);
    master.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (let k = 0; k < 4; k++) {
      const w = Math.sin(Math.PI * (k + 0.5) / 4);
      const f0 = base * Math.pow(2, k);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f0 * Math.pow(2, dir)), t + dur);
      const g = ctx.createGain(); g.gain.value = w;
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.3);
    }
  }

  // --- the bed ------------------------------------------------------------
  // Two sine pairs an octave and a fifth below the root, a slow breath on
  // them, and a band of brown noise well under 300Hz. It is the only thing in
  // here that runs continuously, and it is the first thing to go when you stop.
  function buildBed() {
    const mix = ctx.createGain(); mix.gain.value = 1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.7;
    const breath = ctx.createGain(); breath.gain.value = 1;
    mix.connect(lp); lp.connect(breath); breath.connect(bedBus);

    const amp = ctx.createOscillator(); amp.type = 'sine'; amp.frequency.value = 0.045;
    const ampD = ctx.createGain(); ampD.gain.value = 0.3;
    amp.connect(ampD); ampD.connect(breath.gain); amp.start();

    const osc = [];
    for (const [semi, g0] of [[-24, 0.6], [-17, 0.3]]) {
      const f = mtof(HOUSE.root + semi);
      const g = ctx.createGain(); g.gain.value = g0;
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = f; o.detune.value = det;
        o.connect(g); o.start(); osc.push(o);
      }
      g.connect(mix);
    }
    // the pressure: brown noise, kept low enough that it is weather rather
    // than hiss. This is the one place a noise buffer may use Math.random --
    // the same exception the impact banks take.
    const len = ctx.sampleRate * 4;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.012 * w) / 1.012; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 150; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.30;
    src.connect(bp); bp.connect(ng); ng.connect(mix); src.start();

    bedNodes = { mix, lp, osc, src, amp };
  }

  // --- what the picture should do, and when -------------------------------
  // Notes are scheduled up to a fifth of a second ahead of real time, so the
  // visual side is queued with them and fired when the sound actually lands.
  // Otherwise the room flinches slightly before the thing you can hear.
  function see(t, kind, amount) { visq.push({ t, kind, amount }); }

  // --- the scheduler ------------------------------------------------------
  function stepDur() {
    // deeper is slower: the building drags on you (PLAN C1)
    return 60 / (HOUSE.bpm * (1 - 0.14 * M.depth)) / 4;
  }

  function schedule() {
    if (!running) return;
    const ahead = ctx.currentTime + 0.2;
    let guard = 0;
    while (nextStep < ahead && guard++ < 64) {
      step(stepNo, nextStep);
      nextStep += stepDur();
      stepNo++;
    }
    // if the tab has been away, do not try to catch up on a thousand steps
    if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.05;
  }

  function step(n, t) {
    const bar = n % HOUSE.metre;

    if (bar === 0) {
      // the chord only ever moves on a bar line
      if (wantDegree !== degree) { degree = wantDegree; sound_chord(t); }
      // and one note of the figure is rewritten if you have walked far enough
      if (walkSteps >= 8) { walkSteps = 0; mutate(); }
    }

    // anything that happened between sixteenths waits for one
    while (pending.length) fire(pending.shift(), t);

    if (M.presence < 0.02) return;

    const lvl = M.motion * (0.20 + 0.22 * M.depth) * M.presence;
    if (lvl > 0.012) {
      const tone = CELL[bar];
      if (tone !== null) {
        const acc = (bar === 0 || accent > 0) ? 1.35 : 1;
        if (accent > 0) accent--;
        const midi = HOUSE.root + 12 + deg(tone + degree);
        const cut = 620 + (1 - M.depth) * 900 + M.unease * 1100;
        pluck(midi, t, lvl * acc, cut, 5 + M.unease * 9 + M.depth * 4);
        notes++;
        see(t, 'pulse', Math.min(1, lvl * acc * 4.5));
      }
      // the floor, on the strong beats only, and only once there is something
      // above it to hold up
      if (bar % 8 === 0) {
        low(HOUSE.root - 12, t, 0.16 + 0.16 * M.depth);
        see(t, 'sub', 1);
      }
    }

    // the glide, deep in, on a delay that has nothing to do with anything
    if (t > shepardAt && M.depth > 0.72 && M.presence > 0.4) {
      const dur = 16 + MR() * 12;
      shepard(t, dur, mchance(0.7) ? 1 : -1);
      shepardUntil = t + dur;
      shepardAt = 1e9;
    }
  }

  function mutate() {
    const i = Math.floor(MR() * HOUSE.metre);
    if (i === 0) return;                                  // the downbeat stays
    CELL[i] = CELL[i] === null ? mpick(CELL_TONES) : (mchance(0.45) ? null : mpick(CELL_TONES));
  }

  // the room's chord, as an organ swell
  function sound_chord(t) {
    const chord = [0, 2, 4].map(s => HOUSE.root + deg(degree + s));
    const spread = [chord[0], chord[1] + 12, chord[2] + 12];
    const level = (0.05 + 0.09 * M.depth) * (0.4 + 0.6 * M.presence);
    const hold = HOUSE.metre * stepDur() * 1.6;
    swell(spread, t, 2.2, hold, 4.5, level, 500 + (1 - M.depth) * 700);
    see(t + 2.2, 'sub', 0.8);
  }

  // --- what you did, turned into a sound ----------------------------------
  function fire(e, t) {
    switch (e.kind) {
      case 'grab': {
        // big and heavy is low, small is high -- the same measure the impact
        // sounds take, so the bell agrees with the clunk
        const bulk = Math.min(1.4, Math.max(0.12, (e.size || 0.3) + (e.mass || 1) * 0.3));
        const oct = bulk > 0.9 ? 12 : bulk > 0.5 ? 24 : 36;
        const midi = HOUSE.root + oct + deg(degree + (mchance(0.5) ? 2 : 4));
        bell(midi, t, 0.16, 1.8 + MR() * 1.4);
        hold_note(midi - 12, t);
        break;
      }
      case 'drop':
        drop_note(t);
        break;
      case 'throw':
        drop_note(t);
        stab(HOUSE.root + 12 + deg(degree), t, 0.19);
        break;
      case 'impact': {
        // quantised, so a bucket falling down the stairs lands in the bar
        const v = Math.min(1, (e.v || 0) / 6);
        if (e.cls === 'glass' || e.cls === 'metal' || e.cls === 'tin' || e.cls === 'drum')
          ring(mtof(HOUSE.root + 24 + deg(degree + 4)), t, 2.7 + MR() * 1.6, 0.05 + 0.10 * v, 0.9 + v);
        else
          low(HOUSE.root - 12 + deg(degree), t, 0.06 + 0.12 * v);
        see(t, 'pulse', 0.3 + 0.5 * v);
        break;
      }
      case 'door':
        // the strongest instrument in the building gets the strongest event
        wantDegree = e.open ? DEGREES[(DEGREES.indexOf(degree) + 3) % DEGREES.length] : degreeOf(currentSpace || '');
        swell([HOUSE.root + deg(degree), HOUSE.root + 12 + deg(degree + 4)], t,
              e.open ? 1.4 : 3.0, 1.2, e.open ? 5.0 : 7.0, 0.06 + 0.05 * M.depth, 620);
        see(t + 1.4, 'sub', 0.7);
        break;
      case 'room':
        wantDegree = degreeOf(e.key);
        // a room you have already been in gets its bell again, very quietly.
        // Nothing is being told to you: it is the same chord it always was,
        // and noticing that is the player's business.
        if (e.seen) bell(HOUSE.root + 36 + deg(degreeOf(e.key) + 2), t, 0.045, 2.6);
        break;
    }
  }

  // The note you are carrying. It is the object, held, for as long as you
  // hold it -- put it down in a room and the room goes quiet again.
  function hold_note(midi, t) {
    drop_note(t);
    const f = mtof(midi);
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 3;
    const osc = [];
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = f; o.detune.value = det;
      o.connect(flt); o.start(t); osc.push(o);
    }
    flt.connect(g); g.connect(padBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.9);
    carried = { g, osc, f };
  }

  function drop_note(t) {
    if (!carried) return;
    const c = carried; carried = null;
    c.g.gain.cancelScheduledValues(t);
    c.g.gain.setValueAtTime(Math.max(0.0001, c.g.gain.value), t);
    c.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    for (const o of c.osc) {
      o.frequency.setValueAtTime(c.f, t);
      o.frequency.exponentialRampToValueAtTime(c.f * 0.944, t + 0.7);   // it falls a semitone
      o.stop(t + 0.8);
    }
  }

  // --- the frame ----------------------------------------------------------
  //
  // Everything here is smoothed. Nothing the player does may produce a step
  // change in a level, because a step change is legible as a cue, and the
  // moment the score is legible as a cue it is telling you things about the
  // building instead of about you.
  function update(dt, s) {
    // the picture decays whether or not the music is running
    fx.pulse *= Math.exp(-dt * 5.5);
    fx.shine *= Math.exp(-dt * 2.4);
    if (!running) { fx.sub *= Math.exp(-dt * 2); fx.tension *= Math.exp(-dt * 2); return; }

    // Not a queue in time order: a swell books its arrival two seconds ahead
    // and a note booked after it lands first, so anything that only looked at
    // the head would sit behind the swell and every bell in that window would
    // be seen and not shown.
    const now = ctx.currentTime;
    for (let i = visq.length - 1; i >= 0; i--) {
      const v = visq[i];
      if (v.t > now) continue;
      if (v.kind === 'pulse') fx.pulse = Math.max(fx.pulse, v.amount);
      else if (v.kind === 'shine') fx.shine = Math.max(fx.shine, v.amount);
      else if (v.kind === 'sub') M.weight = Math.max(M.weight, v.amount);
      visq.splice(i, 1);
    }
    if (visq.length > 64) visq.splice(0, visq.length - 64);

    // how fast you are going, as a fraction of a walk
    const speed = Math.min(1, (s.speed || 0) / 2.0);
    M.motion += (speed - M.motion) * Math.min(1, dt * (speed > M.motion ? 2.4 : 0.9));

    // how much you are looking about. A head that will not settle is the
    // cheapest read there is on somebody who is not comfortable.
    let turn = 0;
    if (lastYaw !== null) {
      let d = (s.yaw || 0) - lastYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turn = Math.abs(d) / Math.max(dt, 1e-3);
    }
    lastYaw = s.yaw || 0;
    const uneaseTarget = clamp01(turn / 3.2);
    M.unease += (uneaseTarget - M.unease) * Math.min(1, dt * (uneaseTarget > M.unease ? 1.6 : 0.35));

    // how far in you are, eased hard. A fold changes this, so nothing driven
    // by it may arrive anywhere near the crossing.
    const depth = s.dose === undefined ? 0.3 : s.dose;
    M.depth += (depth - M.depth) * Math.min(1, dt * 0.18);

    // and whether anything at all is happening
    if (M.motion > 0.06) idle = 0; else idle += dt;
    const want = idle > 16 ? 0 : 1;
    M.presence += (want - M.presence) * Math.min(1, dt * (want > M.presence ? 0.5 : 0.12));

    M.weight *= Math.exp(-dt * 0.8);
    const bedLvl = levels(1);

    // deep enough for the glide, and it will happen at some point that has
    // nothing to do with the door you came through
    if (M.depth > 0.74 && shepardAt > 1e8 && now > shepardUntil + 30) shepardAt = now + 6 + MR() * 22;
    if (M.depth < 0.66) shepardAt = 1e9;

    // what the picture gets
    fx.sub = clamp01(bedLvl * 1.8 + M.weight * 0.5);
    fx.tension = clamp01(0.35 * M.unease + 0.45 * M.depth * M.presence + 0.2 * M.motion * M.presence);
  }

  // Every level and every filter, worked out from the macros. `haste` is 1 in
  // the frame loop, where nothing may move faster than its own time constant,
  // and much larger in an offline render, where there are only twelve seconds
  // and no player to be startled by a level arriving quickly.
  function levels(haste) {
    const p = M.presence;
    const bedLvl = (0.045 + 0.16 * M.depth) * p;
    setg(bedBus, bedLvl, 1.6 / haste);
    setg(pulseBus, (0.55 + 0.35 * M.motion) * p, 0.5 / haste);
    setg(bassBus, (0.5 + 0.5 * M.motion) * p, 0.6 / haste);
    setg(padBus, (0.55 + 0.45 * M.depth) * p, 1.4 / haste);
    setg(metalBus, 0.6 * p, 0.8 / haste);
    setg(outGain, 0.30 * (0.25 + 0.75 * p), 0.9 / haste);

    setg(gritIn, 0.08 + 0.30 * M.unease + 0.14 * M.depth, 1.2 / haste);
    setf(tilt, 1500 + 2600 * (1 - M.depth) * (0.55 + 0.45 * M.motion) + M.unease * 900, 1.0 / haste);
    setg(wowDepth, 0.0004 + 0.0022 * M.depth + 0.0016 * M.unease, 2.5 / haste);
    if (bedNodes) setf(bedNodes.lp, 150 + 420 * M.depth, 3.0 / haste);
    return bedLvl;
  }

  function setg(node, v, tau) { node.gain.setTargetAtTime(v, ctx.currentTime, tau); }
  function setf(node, v, tau) { node.frequency.setTargetAtTime(v, ctx.currentTime, tau); }

  // --- drawing the score offline, so it can be measured -------------------
  //
  // A sound in this project gets judged as a number -- the impacts were, the
  // walls were, the footsteps were -- and a score that only exists while
  // somebody is playing cannot be. So it will render itself into a buffer at
  // whatever state you name, and the test suite asks it how loud and how dark
  // it is instead of taking my word for it. `npm run music` writes the same
  // thing out as a wav to listen to.
  //
  // The live context is left alone: this refuses to run while the game is
  // playing, because there is one module and one graph and they cannot both
  // have it.
  function render(seconds, state) {
    if (running) return Promise.reject(new Error('the score is playing; stop it first'));
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 44100;
    const saved = { ctx, bedNodes, carried };
    ctx = new OC(1, Math.floor(sr * seconds), sr);
    carried = null;
    try {
      buildBus(ctx.destination);
      buildBed();
      Object.assign(M, { motion: 0.9, unease: 0.15, depth: 0.4, presence: 1, weight: 0 }, state || {});
      degree = wantDegree = (state && state.degree) || 0;
      levels(60);                       // no time to ease anything in here
      let t = 0.05, n = 0;
      const events = (state && state.events) || [];
      while (t < seconds - 0.6) {
        for (const e of events) if (e.at !== undefined && e.at >= t && e.at < t + stepDur()) fire(e, t);
        step(n++, t);
        t += stepDur();
      }
      return ctx.startRendering().then(buf => {
        const d = buf.getChannelData(0);
        let peak = 0, sum = 0;
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
        return { buffer: buf, data: d, rate: buf.sampleRate,
                 peak: +peak.toFixed(4), rms: +Math.sqrt(sum / d.length).toFixed(4),
                 centroid: +centroid(d, buf.sampleRate).toFixed(1), steps: n };
      }).finally(() => { ctx = saved.ctx; bedNodes = saved.bedNodes; carried = saved.carried; });
    } catch (e) {
      ctx = saved.ctx; bedNodes = saved.bedNodes; carried = saved.carried;
      return Promise.reject(e);
    }
  }

  // Where the energy sits, in Hz. The same measure the footsteps and the
  // impacts were pitched down against.
  function centroid(d, rate) {
    const N = 4096;
    let num = 0, den = 0, frames = 0;
    for (let off = 0; off + N < d.length; off += N * 4) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = d[off + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
      // a plain DFT over a few dozen log-spaced bins is enough to say "dark"
      for (let k = 1; k < 160; k++) {
        const f = k * 20;                       // 20Hz .. 3.2kHz
        let sr_ = 0, si = 0;
        const w = 2 * Math.PI * f / rate;
        for (let i = 0; i < N; i += 4) { sr_ += re[i] * Math.cos(w * i); si -= re[i] * Math.sin(w * i); }
        const mag = Math.sqrt(sr_ * sr_ + si * si);
        num += mag * f; den += mag;
      }
      frames++;
      if (frames >= 3) break;
    }
    return den > 0 ? num / den : 0;
  }

  // --- the surface --------------------------------------------------------
  function event(kind, info) {
    if (kind === 'step') {
      walkSteps++;
      accent = 1;                       // the next note of the figure is yours
      idle = 0;
      return;
    }
    if (!running) return;
    idle = 0;
    if (kind === 'impact' && (!info || (info.v || 0) < 2.2)) return;
    if (pending.length > 6) return;     // a shelf of falling tins is not a solo
    pending.push(Object.assign({ kind }, info || {}));
  }

  function start(context, destination) {
    if (running || QS.has('nomusic') || !context) return;
    ctx = context;
    buildBus(destination);
    buildBed();
    degree = wantDegree = degreeOf(currentSpace || START.space);
    nextStep = ctx.currentTime + 0.15;
    stepNo = 0;
    running = true;
    timer = setInterval(schedule, 25);
    sound_chord(nextStep + 0.1);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearInterval(timer); timer = null;
    outGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  }

  // The events the score answers to. There is deliberately nothing here for a
  // fold: crossing one is silent, and the depth it changes is eased over
  // seconds so that nothing in the music can be lined up with the crossing.
  const KINDS = ['step', 'grab', 'drop', 'throw', 'impact', 'door', 'room'];

  return {
    start, stop, update, event, fx, render, KINDS,
    get running() { return running; },
    degreeOf,
    info: () => ({
      root: HOUSE.root, mode: HOUSE.mode, metre: HOUSE.metre, bpm: HOUSE.bpm, kinds: KINDS,
      cell: CELL.slice(), onsets: CELL.filter(v => v !== null).length,
      running, notes, degree,
      motion: +M.motion.toFixed(3), unease: +M.unease.toFixed(3),
      depth: +M.depth.toFixed(3), presence: +M.presence.toFixed(3),
      carrying: !!carried, fx: { pulse: +fx.pulse.toFixed(3), sub: +fx.sub.toFixed(3),
                                 shine: +fx.shine.toFixed(3), tension: +fx.tension.toFixed(3) }
    })
  };
})();
