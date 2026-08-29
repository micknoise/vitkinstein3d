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
// There is no melody in here, and there is deliberately no arpeggiator. The
// first version had one and it was the wrong instrument for this building: a
// figure you can follow is a thing to enjoy, and it turned the house into a
// nice place to be. What walking drives now is a *throb* -- one distorted low
// note on an odd metre, with no tune in it to like -- and a stutter gate that
// flickers the drone the way the bulbs flicker. Every eighth footstep re-rolls
// the pattern of both, so what you are hearing is still something you walked
// into being; it just is not a tune any more.
//
// Nothing in it is a major chord. Rooms own dissonances -- a minor triad, a
// root against its own flat second, a tritone, a half-diminished -- and the
// drone always has something rubbing a semitone or a tritone against it.
//
// What each thing you do sounds like:
//
//   walking          the throb exists at all -- it fades in with your speed
//                    and out when you stop
//   standing still   the throb goes in about two seconds, the drone after
//                    sixteen, and then nothing
//   looking about    a fast turn of the head opens the grit, quickens the
//                    flicker and brings the rub up
//   taking something a bell on a chord tone, pitched by how big the thing is,
//                    and a quiet held note that stays for as long as you carry
//                    it. You are carrying a note around the house
//   putting it down  the carried note falls a semitone and dies
//   throwing it      a dissonant cluster through the grit bus
//   an impact        a metal accent, quantised to the next sixteenth, so a
//                    dropped bucket lands *in* the music instead of over it
//   a door           the harmony moves. Doors are the strongest instrument in
//                    the building, so they get the strongest musical event:
//                    the chord changes and the organ swells
//   a room           every room owns a chord, hashed from its key and the seed.
//                    The front room sounds like the front room every time you
//                    are in it, which is exactly the evidence a player marking
//                    rooms is trying to collect
//   depth            slower, dirtier, heavier, and a rising glide that never
//                    arrives anywhere and is sometimes cut off mid-climb
//
// And a fold makes no sound at all, ever. Depth changes when you cross one, so
// everything depth drives is eased over seconds and the glide is fired on a
// random delay -- there must be no moment in the music that lines up with the
// crossing, or the score gives away the one thing the whole building is built
// to hide.
//
// The picture is wired to it: `Music.fx` carries the throb, the weight
// underneath, the shine off a bell and the flicker, and the flicker takes the
// lights with it -- the stutter in the drone and the bad bulb in the ceiling
// are the same event. All of it is exactly zero until the music starts, so a
// build with the score in it draws the same pixels as one without -- which is
// what the screenshot A/B in PLAN §3 depends on.
//
// ?nomusic=1 turns it off.
// ---------------------------------------------------------------------------

const Music = (() => {

  // --- the house's own noise ---------------------------------------------
  // Its own stream, like the drift and the textures have theirs, so what a
  // house sounds like is a property of its number and does not depend on how
  // many stains got drawn or how many rooms got grown.
  const MR = mulberry32((SEED ^ 0x27d4eb2f) >>> 0);
  const mpick = a => a[Math.floor(MR() * a.length)];
  const mrr = (a, b) => a + MR() * (b - a);
  const mchance = p => MR() < p;

  // Low. All of this lives under the bottom of the piano.
  const ROOTS = [40, 41, 42, 43, 45, 47];      // E2 F2 F#2 G2 A2 B2

  // Sixteenths in a bar. 20 is five-four and 14 is seven-eight, which are the
  // two metres that will not let you settle into them; four-four is in the hat
  // so that some houses are merely grim rather than actively wrong.
  const METRES = [20, 20, 14, 14, 16];

  const HOUSE = {
    root: mpick(ROOTS),
    // what rubs against the drone, permanently: a flat second or a tritone.
    // There is no third in the bed at all, so there is nothing to hear as
    // major or minor -- only as wrong.
    rub: mchance(0.55) ? 1 : 6,
    metre: mpick(METRES),
    bpm: Math.round(mrr(74, 90))
  };

  // --- every room owns a dissonance ---------------------------------------
  // Hashed from the room's key and the seed, so it does not depend on the
  // order you find the rooms in: walk back into the front room an hour later
  // and it is the same chord it was.
  //
  // The first version stacked diatonic thirds, which in a minor mode hands you
  // bIII, bVI and bVII -- three major triads, arriving for no reason anybody
  // in the building could explain. There are no thirds above a root here that
  // are not minor, and half of these are not triads at all.
  const CHORDS = [
    { t: 0, shape: [0, 3, 7] },        // i
    { t: 0, shape: [0, 3, 7] },
    { t: 0, shape: [0, 1, 7] },        // the root against its own flat second
    { t: 0, shape: [0, 3, 6, 10] },    // half-diminished
    { t: 1, shape: [0, 3, 7] },        // bII, minor
    { t: 5, shape: [0, 3, 7] },        // iv
    { t: 6, shape: [0, 3, 6] },        // diminished, a tritone away
    { t: 8, shape: [0, 3, 7] },        // bVI taken as a minor, never the major
    { t: 3, shape: [0, 1, 6] },
    { t: 0, shape: [0, 6, 11] }        // tritone and a major seventh, together
  ];
  const _chordCache = {};
  function degreeOf(key) {
    if (key in _chordCache) return _chordCache[key];
    let h = (SEED ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
    return (_chordCache[key] = h % CHORDS.length);
  }
  function chordNotes(i, base) {
    const c = CHORDS[i % CHORDS.length];
    return c.shape.map(s => (base === undefined ? HOUSE.root : base) + c.t + s);
  }

  // The rhythm. Not a figure -- there are no pitches in it. Onsets for the
  // throb, and a second, denser pattern for the stutter gate.
  function makePattern(n, strongP, weakP) {
    const p = new Array(n).fill(false);
    for (let i = 0; i < n; i++) p[i] = (i % 4 === 0) ? MR() < strongP : MR() < weakP;
    p[0] = true;
    return p;
  }
  const THROB = makePattern(HOUSE.metre, 0.85, 0.18);
  const GATE = makePattern(HOUSE.metre, 0.5, 0.42);

  // --- what the picture is given -----------------------------------------
  // Zero until a note is actually played. See renderVision().
  const fx = { pulse: 0, sub: 0, shine: 0, tension: 0, flicker: 0 };

  // --- state --------------------------------------------------------------
  let ctx = null, running = false, timer = null;
  let bus, dry, wow, wowLfo, wowDepth, grit, gritIn, tilt, comp, outGain, duck;
  let revSend, revReturn, delIn, delOut;
  let throbBus, padBus, metalBus, bedBus, bedGate, throbDrive, stabDrive;
  let bedNodes = null, carried = null, glideUntil = 0, glideAt = 1e9;
  // The organ is the one voice here that sustains for longer than the gap
  // between the events that start it, so it is the one that has to be counted.
  // Running from room to room used to stack a fresh twelve-second swell every
  // bar, on top of one per door, until the limiter had nothing left to give
  // and the whole score ducked away to nothing.
  const padVoices = [];
  let lastSwellAt = -99, made = 0;

  // Every oscillator in here goes through this, so how much the score is
  // actually making can be measured rather than guessed at.
  function mkOsc() { made++; return ctx.createOscillator(); }

  let nextStep = 0, stepNo = 0, notes = 0;
  let chord = 0, wantChord = 0;
  const pending = [];        // events waiting for the next sixteenth
  const visq = [];           // what the picture should do, and when

  // macros, all 0..1, all smoothed -- nothing in here is allowed to snap
  const M = { motion: 0, unease: 0, depth: 0.3, presence: 0, weight: 0, flick: 0 };
  let idle = 0, lastYaw = null, walkSteps = 0;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // --- the bus ------------------------------------------------------------
  //
  //   layers -> mix -> wow -> [dry | grit] -> tilt -> duck -> limiter -> out
  //
  // The wow is one delay line of about nine milliseconds with a slow LFO on
  // it, so the whole score drifts very slightly out of tune with itself and
  // never quite sits still. It is the difference between a synthesiser and a
  // synthesiser that has been in a damp room for thirty years, and it costs a
  // single node.
  //
  // The duck is how the score drops out: a scheduled hole a couple of hundred
  // milliseconds wide, which is a much worse thing to hear than any noise.
  function buildBus(destination) {
    bus = ctx.createGain(); bus.gain.value = 1;

    wow = ctx.createDelay(0.1);
    wow.delayTime.value = 0.009;
    wowLfo = mkOsc(); wowLfo.type = 'sine'; wowLfo.frequency.value = 0.23;
    wowDepth = ctx.createGain(); wowDepth.gain.value = 0.0009;
    wowLfo.connect(wowDepth); wowDepth.connect(wow.delayTime); wowLfo.start();

    dry = ctx.createGain(); dry.gain.value = 0.75;

    // the grit path, in parallel, brought up by unease and by depth
    gritIn = ctx.createGain(); gritIn.gain.value = 0.35;
    grit = shaper(5.5);

    tilt = ctx.createBiquadFilter(); tilt.type = 'lowpass';
    tilt.frequency.value = 2600; tilt.Q.value = 0.5;

    duck = ctx.createGain(); duck.gain.value = 1;

    // A limiter, not a leveller. Set low it hands you back the same loudness
    // whatever you do, and the whole point is that standing still is quieter.
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6; comp.knee.value = 4; comp.ratio.value = 9;
    comp.attack.value = 0.004; comp.release.value = 0.25;

    outGain = ctx.createGain(); outGain.gain.value = 0.0001;

    bus.connect(wow);
    wow.connect(dry); dry.connect(tilt);
    wow.connect(gritIn); gritIn.connect(grit); grit.connect(tilt);
    tilt.connect(duck); duck.connect(comp); comp.connect(outGain); outGain.connect(destination);

    // --- the room it is all happening in ---------------------------------
    // Everything is a long way away and none of it is in the room with you.
    // A pre-delay in front of the convolver is most of what makes a space
    // sound big; without it a long tail just sounds like a long tail.
    revSend = ctx.createGain(); revSend.gain.value = 1;
    const pre = ctx.createDelay(0.2); pre.delayTime.value = 0.045;
    const conv = ctx.createConvolver();
    conv.buffer = impulse(6.0, 2.4);
    const revDark = ctx.createBiquadFilter();
    revDark.type = 'lowpass'; revDark.frequency.value = 1500; revDark.Q.value = 0.3;
    const revThin = ctx.createBiquadFilter();
    revThin.type = 'highpass'; revThin.frequency.value = 90; revThin.Q.value = 0.4;
    revReturn = ctx.createGain(); revReturn.gain.value = 1.15;
    revSend.connect(pre); pre.connect(conv); conv.connect(revDark);
    revDark.connect(revThin); revThin.connect(revReturn); revReturn.connect(bus);

    // and one dark feedback delay, off the metal and the stabs only
    delIn = ctx.createGain(); delIn.gain.value = 1;
    const d = ctx.createDelay(3.0); d.delayTime.value = 60 / HOUSE.bpm * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.48;
    const dLp = ctx.createBiquadFilter(); dLp.type = 'lowpass'; dLp.frequency.value = 1200;
    delOut = ctx.createGain(); delOut.gain.value = 0.6;
    delIn.connect(d); d.connect(dLp); dLp.connect(fb); fb.connect(d); dLp.connect(delOut);
    delOut.connect(bus);

    const layer = (rev, del) => {
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(bus);
      if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(revSend); }
      if (del > 0) { const s = ctx.createGain(); s.gain.value = del; g.connect(s); s.connect(delIn); }
      return g;
    };
    throbBus = layer(0.30, 0);
    padBus   = layer(0.95, 0.10);
    metalBus = layer(1.00, 0.45);
    bedBus   = layer(0.40, 0);

    // One shaper for the throb and one for the stabs, built once. The first
    // version made a WaveShaperNode -- and computed a 2048-point curve in
    // JavaScript -- for every note, several times a second, which is a great
    // deal of garbage to be making while a game is trying to hold a frame.
    // Drive is now the gain in front of a fixed curve, which is how a
    // distortion pedal does it anyway, and it can be an AudioParam that moves
    // smoothly instead of a new curve each time. It also sounds better: one
    // shaper for all the voices means they distort into each other.
    throbDrive = ctx.createGain(); throbDrive.gain.value = 1;
    const throbShape = shaper(3.0);
    const throbMakeup = ctx.createGain(); throbMakeup.gain.value = 0.72;
    throbDrive.connect(throbShape); throbShape.connect(throbMakeup); throbMakeup.connect(throbBus);

    stabDrive = ctx.createGain(); stabDrive.gain.value = 1;
    const stabShape = shaper(4);
    const stabMakeup = ctx.createGain(); stabMakeup.gain.value = 0.8;
    stabDrive.connect(stabShape); stabShape.connect(stabMakeup); stabMakeup.connect(metalBus);

    // the stutter sits between the drone and its own level, so a flicker
    // chops the drone and leaves its reverb tail ringing on underneath
    bedGate = ctx.createGain(); bedGate.gain.value = 1;
    bedGate.connect(bedBus);
  }

  function shaper(drive) {
    const ws = ctx.createWaveShaper(); ws.oversample = '4x';
    const n = 2048, c = new Float32Array(n);
    // tanh, then a little asymmetry, which is what makes it sound broken
    // rather than merely loud -- minus whatever that asymmetry does at zero.
    // Without that subtraction the curve outputs a constant when nothing is
    // going into it, which is a DC offset on the whole score: it makes silence
    // not silent, it makes the limiter work when there is nothing to limit,
    // and it is inaudible, so the only thing that catches it is measuring the
    // peak of a passage that is supposed to be zero.
    const dc = Math.tanh(0.18) * 0.15;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) * 0.85 + Math.tanh(x * drive * 0.5 + 0.18) * 0.15 - dc;
    }
    ws.curve = c;
    return ws;
  }

  // Noise under an exponential decay, darkening as it goes, with a handful of
  // sparse early reflections at the front -- which is what carries the size of
  // a place, rather than the tail.
  function impulse(sec, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const b = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const w = (MR() * 2 - 1) * Math.pow(1 - t, decay);
        lp += (w - lp) * (0.5 - 0.36 * t);
        d[i] = lp;
      }
      for (let k = 0; k < 9; k++) {
        const at = Math.floor(rate * (0.008 + MR() * 0.085));
        if (at < len) d[at] += (MR() * 2 - 1) * 0.55 * (1 - k / 9);
      }
    }
    return b;
  }

  // --- the voices ---------------------------------------------------------

  // The throb. One note, always the root, always the same octave: a sub sine
  // with a saw over it, hit hard, shut fast, and put through its own shaper on
  // the way out. There is nothing here to follow, which is the point -- a
  // figure with pitches in it is a tune, and a tune is something to enjoy.
  function throb(t, level, hard) {
    const f = mtof(HOUSE.root - 12);
    const o = mkOsc(); o.type = 'sine'; o.frequency.value = f;
    const w = mkOsc(); w.type = 'sawtooth'; w.frequency.value = f;
    w.detune.value = mrr(-14, 14);
    const wg = ctx.createGain(); wg.gain.value = 0.34 + 0.3 * M.depth;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 7;
    const env = ctx.createGain(); env.gain.value = 0.0001;

    o.connect(flt); w.connect(wg); wg.connect(flt);
    flt.connect(env); env.connect(throbDrive);

    const dec = hard ? 0.34 : 0.20;
    flt.frequency.setValueAtTime(hard ? 900 : 520, t);
    flt.frequency.exponentialRampToValueAtTime(70, t + dec);
    // the pitch sags on the way down, which is a thing a tape does and a
    // synthesiser does not
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.86, t + dec);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dec + 0.12);
    [o, w].forEach(n => { n.start(t); n.stop(t + dec + 0.2); });
    see(t, 'pulse', Math.min(1, level * (hard ? 5 : 3.4)));
  }

  // The organ. Additive, so it is a rank of pipes rather than a pad: the
  // fundamental, the octave, the twelfth and the two-octave, each doubled a
  // few cents out so it beats against itself. Very wet -- it is a long way
  // down a corridor, not in the room.
  // Whatever organ is already sounding is taken away as this one arrives.
  // There is only ever one chord: rooms do not stack, and a player running
  // through five of them hears five chords, not five chords at once.
  function killPads(t, fade) {
    for (const v of padVoices) {
      for (const e of v.env) { e.gain.cancelScheduledValues(t); e.gain.setTargetAtTime(0.0001, t, fade / 3); }
      for (const o of v.osc) { try { o.stop(t + fade + 0.15); } catch (err) { /* already stopped */ } }
    }
    padVoices.length = 0;
  }

  function swell(notes_, t, attack, hold, release, level, cutoff) {
    killPads(t, 0.9);
    lastSwellAt = t;
    const parts = [[1, 1], [0.55, 2], [0.26, 3], [0.30, 4], [0.12, 6]];
    const rec = { env: [], osc: [] };
    notes_.forEach((midi, i) => {
      const f = mtof(midi);
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = cutoff + i * 40; flt.Q.value = 1.4;
      const env = ctx.createGain(); env.gain.value = 0.0001;
      flt.connect(env); env.connect(padBus);
      rec.env.push(env);
      for (const [amp, mult] of parts) {
        // Two voices beat and three grind, so the fundamental gets a third a
        // long way out of tune. The partials above it make do with two: at
        // fifteen oscillators a note this was thirty per cent of everything
        // the score was making, for a beat nobody can hear that high up.
        const dets = mult === 1 ? [-5, 6, 17 * (0.4 + M.unease)] : [-5, 6];
        for (const det of dets) {
          if (f * mult > 7000) continue;
          const o = mkOsc();
          o.type = 'sine'; o.frequency.value = f * mult;
          o.detune.value = det;
          const g = ctx.createGain(); g.gain.value = amp * (Math.abs(det) > 10 ? 0.28 : 0.5);
          o.connect(g); g.connect(flt);
          o.start(t); o.stop(t + attack + hold + release + 0.4);
          rec.osc.push(o);
        }
      }
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(level, t + attack);
      env.gain.setValueAtTime(level, t + attack + hold);
      env.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    });
    padVoices.push(rec);
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
      for (const det of [0, 9 + M.unease * 11]) {
        const o = mkOsc();
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
    const c = mkOsc(); c.type = 'sine'; c.frequency.value = f;
    const m = mkOsc(); m.type = 'sine'; m.frequency.value = f * ratio;
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
    see(t, 'shine', Math.min(1, level * 4));
  }

  // A cluster with a semitone and a tritone guaranteed in it, hit hard and
  // shut fast. This is the only loud thing in here and it only happens when
  // you throw something.
  function stab(base, t, level) {
    for (const midi of [base, base + (mchance(0.5) ? 1 : 6), base + 11, base + 12]) {
      const f = mtof(midi);
      const a = mkOsc(); a.type = 'sawtooth'; a.frequency.value = f; a.detune.value = -7;
      const b = mkOsc(); b.type = 'sawtooth'; b.frequency.value = f; b.detune.value = 7;
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 7;
      const env = ctx.createGain(); env.gain.value = 0.0001;
      a.connect(flt); b.connect(flt); flt.connect(env); env.connect(stabDrive);
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
  // for ever without getting anywhere.
  //
  // Suspense is a promise that is not kept, so about a third of them are cut
  // off part-way up and leave a hole. A climb that always finishes is a build,
  // and a build is satisfying.
  function glide(t, dur, dir, cut) {
    const base = mtof(HOUSE.root + 12);
    const master = ctx.createGain(); master.gain.value = 0.0001;
    master.connect(padBus);
    const peak = 0.08 + M.depth * 0.09 + M.unease * 0.04;
    const fade = dur * 0.22;
    const end = cut ? dur * mrr(0.35, 0.7) : dur;
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(peak, t + fade);
    master.gain.setValueAtTime(peak, t + Math.max(fade, end - (cut ? 0.05 : fade)));
    master.gain.linearRampToValueAtTime(0.0001, t + end);
    if (cut) {
      // and the room goes with it
      duckFor(t + end - 0.02, 0.28);
      see(t + end, 'flicker', 1);
    }
    for (let k = 0; k < 4; k++) {
      const w = Math.sin(Math.PI * (k + 0.5) / 4);
      const f0 = base * Math.pow(2, k);
      const o = mkOsc(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f0 * Math.pow(2, dir)), t + dur);
      const g = ctx.createGain(); g.gain.value = w;
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + end + 0.3);
    }
    return end;
  }

  // --- the drone ----------------------------------------------------------
  //
  // The main event now that there is no figure. Sines and saws at the octave
  // and the twelfth below the root, a third voice a semitone or a tritone off
  // so there is always something rubbing, everything through a hard shaper,
  // and crackle over the top of it. It is the only thing in here that runs
  // continuously, and it is the first thing to go when you stop.
  function buildBed() {
    const mix = ctx.createGain(); mix.gain.value = 1;
    const sh = shaper(3.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.9;
    const breath = ctx.createGain(); breath.gain.value = 1;
    mix.connect(sh); sh.connect(lp); lp.connect(breath); breath.connect(bedGate);

    const amp = mkOsc(); amp.type = 'sine'; amp.frequency.value = 0.045;
    const ampD = ctx.createGain(); ampD.gain.value = 0.34;
    amp.connect(ampD); ampD.connect(breath.gain); amp.start();

    // a second, faster amplitude LFO at a rate that is not a multiple of the
    // first, so the two never line up and it never settles into a pattern
    const amp2 = mkOsc(); amp2.type = 'triangle'; amp2.frequency.value = 0.31;
    const ampD2 = ctx.createGain(); ampD2.gain.value = 0.16;
    amp2.connect(ampD2); ampD2.connect(breath.gain); amp2.start();

    const osc = [];
    // root -24 and -17 as before, and the rub, which is the whole difference
    // between a drone that is calm and a drone that is not
    for (const [semi, g0, saw] of [[-24, 0.55, 0.30], [-17, 0.26, 0.16], [-24 + HOUSE.rub, 0.20, 0.10]]) {
      const f = mtof(HOUSE.root + semi);
      const g = ctx.createGain(); g.gain.value = g0;
      for (const det of [-6, 7]) {
        const o = mkOsc(); o.type = 'sine';
        o.frequency.value = f; o.detune.value = det;
        o.connect(g); o.start(); osc.push(o);
      }
      if (saw > 0) {
        const s = mkOsc(); s.type = 'sawtooth';
        s.frequency.value = f; s.detune.value = 3;
        const sg = ctx.createGain(); sg.gain.value = saw;
        s.connect(sg); sg.connect(g); s.start(); osc.push(s);
      }
      g.connect(mix);
    }

    // --- crackle ---------------------------------------------------------
    // Not hiss. Sparse impulses at random, the way a bad connection or a worn
    // record crackles, drawn once into a long buffer and looped. A steady
    // noise bed is weather and you stop hearing it; something that ticks
    // irregularly you never stop hearing.
    //
    // This is the one place a noise buffer may use Math.random -- the same
    // exception the impact banks take.
    const len = ctx.sampleRate * 7;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.012 * w) / 1.012;
      d[i] = last * 2.2;                                   // the rumble under it
      if (Math.random() < 0.00042) {                       // and the crackle over it
        const n = 12 + Math.floor(Math.random() * 90);
        const amp0 = 0.3 + Math.random() * 0.7;
        for (let k = 0; k < n && i + k < len; k++)
          d[i + k] += (Math.random() * 2 - 1) * amp0 * Math.pow(1 - k / n, 3);
      }
    }
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
    const csh = shaper(2.6);
    const ng = ctx.createGain(); ng.gain.value = 0.34;
    src.connect(bp); bp.connect(csh); csh.connect(ng); ng.connect(mix); src.start();

    bedNodes = { mix, lp, osc, src, amp, bp, crackle: ng };
  }

  // --- the flicker --------------------------------------------------------
  // A stutter on the drone, in bursts, at a rate that has nothing to do with
  // the tempo. It takes the lights with it: see musicLight in 40-main.js.
  // The stutter in the drone and the bad bulb in the ceiling are the same
  // event, and neither of them is explained.
  function flickerBurst(t, dur) {
    const g = bedGate.gain;
    const rate = 0.018 + MR() * 0.05;
    let at = t;
    g.cancelScheduledValues(t);
    while (at < t + dur) {
      const on = mchance(0.45);
      g.setValueAtTime(on ? 1 : 0.06 + MR() * 0.2, at);
      see(at, 'flicker', on ? 0.15 : 0.75 + MR() * 0.25);
      at += rate * (0.6 + MR());
    }
    g.setValueAtTime(1, at);
    see(at, 'flicker', 0);
  }

  // A hole in everything. Two hundred milliseconds of nothing is the single
  // most unsettling thing available to a soundtrack and it costs one gain.
  function duckFor(t, dur) {
    const g = duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.02, t + 0.012);
    g.setValueAtTime(0.02, t + dur);
    g.linearRampToValueAtTime(1, t + dur + 0.09);
  }

  // --- what the picture should do, and when -------------------------------
  // Notes are scheduled up to a fifth of a second ahead of real time, so the
  // visual side is queued with them and fired when the sound actually lands.
  // Otherwise the room flinches slightly before the thing you can hear.
  function see(t, kind, amount) { visq.push({ t, kind, amount }); }

  // --- the scheduler ------------------------------------------------------
  function stepDur() {
    // deeper is slower: the building drags on you (PLAN C1)
    return 60 / (HOUSE.bpm * (1 - 0.16 * M.depth)) / 4;
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
      // The chord follows you into every room. The organ does not: running
      // through the house is exactly the case that used to stack swells
      // faster than they decayed, and a chord you cannot hear announced is
      // still the chord the bells and the stabs are drawn from.
      if (wantChord !== chord) {
        chord = wantChord;
        if (t - lastSwellAt > 3.2) soundChord(t);
      }
      // and the rhythm is re-rolled if you have walked far enough
      if (walkSteps >= 8) { walkSteps = 0; reroll(); }
    }

    // Anything that happened between sixteenths waits for one. If the tab has
    // been in the background the timer stops and they pile up, so anything
    // that has been waiting more than half a second is thrown away rather than
    // played in a clump the moment you come back to the window.
    while (pending.length) {
      const e = pending.shift();
      if (t - e.at < 0.6) fire(e, t);
    }

    if (M.presence < 0.02) return;

    // --- the throb ---------------------------------------------------------
    const lvl = M.motion * (0.34 + 0.30 * M.depth) * M.presence;
    if (lvl > 0.012 && THROB[bar]) {
      throb(t, lvl * (bar === 0 ? 1.3 : 1), bar === 0);
      notes++;
    }

    // --- the flicker -------------------------------------------------------
    // Rarer than the throb and never on the same grid as it. It happens more
    // the further in you are and the more you are looking about.
    if (GATE[bar] && M.presence > 0.3 && MR() < 0.020 + 0.10 * M.depth + 0.10 * M.unease)
      flickerBurst(t, stepDur() * (1 + Math.floor(MR() * 3)));

    // --- the hole ----------------------------------------------------------
    if (bar === 0 && M.presence > 0.5 && MR() < 0.018 + 0.05 * M.depth)
      duckFor(t + stepDur() * Math.floor(MR() * 4), 0.10 + MR() * 0.22);

    // --- the climb ---------------------------------------------------------
    // Fired on a delay that has nothing to do with any door you came through.
    if (t > glideAt && M.presence > 0.35) {
      const dur = 14 + MR() * 14;
      glideUntil = t + glide(t, dur, mchance(0.75) ? 1 : -1, mchance(0.35));
      glideAt = 1e9;
    }
  }

  // The rhythm you walked into being. One onset moves in each pattern -- the
  // throb keeps its downbeat, the flicker does not have to.
  function reroll() {
    const i = 1 + Math.floor(MR() * (HOUSE.metre - 1));
    THROB[i] = !THROB[i];
    GATE[Math.floor(MR() * HOUSE.metre)] = mchance(0.55);
  }

  // the room's chord, as an organ swell, a long way off
  function soundChord(t) {
    const notes_ = chordNotes(chord).map((m, i) => m + (i === 0 ? 0 : 12));
    const level = (0.055 + 0.10 * M.depth) * (0.4 + 0.6 * M.presence);
    const hold = HOUSE.metre * stepDur() * 1.6;
    swell(notes_, t, 2.4, hold, 6.0, level, 460 + (1 - M.depth) * 600);
    see(t + 2.4, 'sub', 0.8);
  }

  // --- what you did, turned into a sound ----------------------------------
  function fire(e, t) {
    const tones = chordNotes(chord);
    switch (e.kind) {
      case 'grab': {
        // big and heavy is low, small is high -- the same measure the impact
        // sounds take, so the bell agrees with the clunk
        const bulk = Math.min(1.4, Math.max(0.12, (e.size || 0.3) + (e.mass || 1) * 0.3));
        const oct = bulk > 0.9 ? 12 : bulk > 0.5 ? 24 : 36;
        const midi = oct + tones[1 + Math.floor(MR() * (tones.length - 1))];
        bell(midi, t, 0.16, 2.6 + MR() * 2.2);
        holdNote(midi - 12, t);
        break;
      }
      case 'drop':
        dropNote(t);
        break;
      case 'throw':
        dropNote(t);
        stab(tones[0] + 12, t, 0.19);
        break;
      case 'impact': {
        // quantised, so a bucket falling down the stairs lands in the bar
        const v = Math.min(1, (e.v || 0) / 6);
        if (e.cls === 'glass' || e.cls === 'metal' || e.cls === 'tin' || e.cls === 'drum')
          ring(mtof(tones[tones.length - 1] + 24), t, 2.7 + MR() * 1.6, 0.05 + 0.10 * v, 1.2 + v);
        else
          throb(t, 0.07 + 0.13 * v, true);
        break;
      }
      case 'door':
        // the strongest instrument in the building gets the strongest event
        wantChord = e.open ? (chord + 3 + Math.floor(MR() * 4)) % CHORDS.length
                           : degreeOf(currentSpace || '');
        swell(chordNotes(wantChord).map((m, i) => m + 12 * i), t,
              e.open ? 1.4 : 3.0, 1.4, e.open ? 6.0 : 8.0, 0.065 + 0.05 * M.depth, 600);
        see(t + 1.4, 'sub', 0.7);
        break;
      case 'room':
        wantChord = degreeOf(e.key);
        // a room you have already been in gets its bell again, very quietly.
        // Nothing is being told to you: it is the same chord it always was,
        // and noticing that is the player's business.
        if (e.seen) bell(chordNotes(wantChord)[1] + 36, t, 0.045, 3.2);
        break;
    }
  }

  // The note you are carrying. It is the object, held, for as long as you
  // hold it -- put it down in a room and the room goes quiet again.
  function holdNote(midi, t) {
    dropNote(t);
    const f = mtof(midi);
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 3;
    const osc = [];
    for (const det of [-8, 8]) {
      const o = mkOsc(); o.type = 'triangle';
      o.frequency.value = f; o.detune.value = det;
      o.connect(flt); o.start(t); osc.push(o);
    }
    flt.connect(g); g.connect(padBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.9);
    carried = { g, osc, f };
  }

  function dropNote(t) {
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
    fx.flicker *= Math.exp(-dt * 9);
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
      else if (v.kind === 'flicker') fx.flicker = v.amount;
      else if (v.kind === 'sub') M.weight = Math.max(M.weight, v.amount);
      visq.splice(i, 1);
    }
    if (visq.length > 96) visq.splice(0, visq.length - 96);

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

    // the next climb, once there is something to climb out of
    if (M.presence > 0.4 && glideAt > 1e8 && now > glideUntil + 18)
      glideAt = now + 8 + MR() * (34 - 18 * M.depth);
    if (M.presence < 0.15) glideAt = 1e9;

    // what the picture gets
    fx.sub = clamp01(bedLvl * 2.4 + M.weight * 0.5);
    fx.tension = clamp01(0.35 * M.unease + 0.45 * M.depth * M.presence + 0.2 * M.motion * M.presence);
  }

  // Every level and every filter, worked out from the macros. `haste` is 1 in
  // the frame loop, where nothing may move faster than its own time constant,
  // and much larger in an offline render, where there are only twelve seconds
  // and no player to be startled by a level arriving quickly.
  function levels(haste) {
    const p = M.presence;
    // the drone is the atmosphere, but it must not be so loud that walking
    // stops making a difference -- standing still has to be the quiet state
    const bedLvl = (0.055 + 0.15 * M.depth) * (0.72 + 0.28 * M.motion) * p;
    setg(bedBus, bedLvl, 1.6 / haste);
    setg(throbBus, (0.5 + 0.5 * M.motion) * p, 0.5 / haste);
    setg(padBus, (0.55 + 0.45 * M.depth) * p, 1.4 / haste);
    setg(metalBus, 0.65 * p, 0.8 / haste);
    setg(outGain, 0.34 * (0.25 + 0.75 * p), 0.9 / haste);

    // the drive that used to be a fresh curve per note is now a gain in front
    // of a fixed one, so it can simply be turned up
    setg(throbDrive, 0.7 + 2.4 * M.depth + 1.7 * M.unease, 0.8 / haste);
    setg(stabDrive, 1.0 + 0.6 * M.unease, 0.8 / haste);
    setg(gritIn, 0.22 + 0.42 * M.unease + 0.30 * M.depth, 1.2 / haste);
    setg(dry, 0.80 - 0.18 * M.depth, 1.2 / haste);
    setf(tilt, 1400 + 2400 * (1 - M.depth) * (0.55 + 0.45 * M.motion) + M.unease * 900, 1.0 / haste);
    setg(wowDepth, 0.0006 + 0.0026 * M.depth + 0.0020 * M.unease, 2.5 / haste);
    setg(revReturn, 0.95 + 0.55 * M.depth, 2.0 / haste);
    if (bedNodes) {
      setf(bedNodes.lp, 150 + 460 * M.depth, 3.0 / haste);
      setg(bedNodes.crackle, 0.24 + 0.40 * M.depth + 0.30 * M.unease, 2.0 / haste);
    }
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
      chord = wantChord = (state && state.chord) || 0;
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
      const re = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = d[off + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
      // a plain DFT over a few dozen bins is enough to say "dark"
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
      idle = 0;
      return;
    }
    if (!running) return;
    idle = 0;
    if (kind === 'impact' && (!info || (info.v || 0) < 2.2)) return;
    if (pending.length > 6) return;     // a shelf of falling tins is not a solo
    pending.push(Object.assign({ kind, at: ctx.currentTime }, info || {}));
  }

  function start(context, destination) {
    if (running || QS.has('nomusic') || !context) return;
    ctx = context;
    buildBus(destination);
    buildBed();
    chord = wantChord = degreeOf(currentSpace || START.space);
    nextStep = ctx.currentTime + 0.15;
    stepNo = 0;
    running = true;
    timer = setInterval(schedule, 25);
    soundChord(nextStep + 0.1);
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
    degreeOf, chordNotes,
    info: () => ({
      root: HOUSE.root, rub: HOUSE.rub, metre: HOUSE.metre, bpm: HOUSE.bpm, kinds: KINDS,
      throb: THROB.slice(), gate: GATE.slice(),
      onsets: THROB.filter(Boolean).length,
      chords: CHORDS.length, running, notes, chord,
      // what the score is actually making: organs sounding at once, and
      // oscillators started since the page loaded
      pads: padVoices.length, made,
      // how hard the limiter is working, in dB. This is the number that says
      // whether the score is about to duck itself away to nothing: it is the
      // one thing that was actually wrong when running between rooms stacked
      // organs faster than they decayed.
      squash: comp ? +comp.reduction.toFixed(1) : 0,
      // there is no major third anywhere in the vocabulary, and this is how
      // that is checked rather than asserted
      majors: CHORDS.filter(c => c.shape.indexOf(4) >= 0).length,
      motion: +M.motion.toFixed(3), unease: +M.unease.toFixed(3),
      depth: +M.depth.toFixed(3), presence: +M.presence.toFixed(3),
      carrying: !!carried, fx: { pulse: +fx.pulse.toFixed(3), sub: +fx.sub.toFixed(3),
                                 shine: +fx.shine.toFixed(3), tension: +fx.tension.toFixed(3),
                                 flicker: +fx.flicker.toFixed(3) }
    })
  };
})();
