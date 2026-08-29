// ---------------------------------------------------------------------------
// Sound, screen, loop.
// ---------------------------------------------------------------------------

const Audio = (() => {
  let ctx = null, master = null, toneGain = null, lastImpact = -1;   // -1, so the first
                                                                    // impact is not swallowed
  const earsAt = { x: 0, y: 1.2, z: 0 };      // last known listener position

  function noiseBuffer(sec) {
    const n = ctx.sampleRate * sec;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return b;
  }

  function start() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.62; master.connect(ctx.destination);

    renderSFX();
    scheduleFar();
    // The score shares this context and this bus -- one AudioContext, one
    // master, so the music is mixed against the building rather than over it.
    Music.start(ctx, master);
  }

  function scheduleFar() {
    const t = 14000 + Math.random() * 34000;
    setTimeout(() => {
      if (ctx) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(46 + Math.random() * 30, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(24, ctx.currentTime + 0.7);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
        // somewhere else in the building, at a bearing you could point to --
        // which is the whole point of it, and it was coming from nowhere
        const a = Math.random() * Math.PI * 2, d = 11 + Math.random() * 13;
        o.connect(g);
        g.connect(panner([earsAt.x + Math.cos(a) * d, earsAt.y - 0.3, earsAt.z + Math.sin(a) * d]));
        o.start(); o.stop(ctx.currentTime + 1.5);
      }
      scheduleFar();
    }, t);
  }

  // C2. A sound that happens somewhere should come from there. The room tone
  // stays monophonic on purpose -- it is the room itself,
  // not events in it, and giving them a position would put the room in a
  // corner. Footsteps stay monophonic too: they happen at the listener, so a
  // panner would do nothing but cost a node.
  //
  // Each event makes its own panner and lets it go when the sound ends; there
  // are only ever a handful at once.
  // --- how much building is in the way ------------------------------------
  //
  // A sound made in the room you are standing in arrives whole. One made
  // through an open door arrives with its top end gone, and one made two rooms
  // away is a thud you can barely place. One filter per sound, and the building
  // already knows everything needed to work it out.
  function occlusion(at) {
    const here = currentSpace;
    const there = spaceAt(at[0], at[2]);
    if (!here || !there || here === there) return { cut: 20000, gain: 1 };
    const near = (roomGraph[here] || []).indexOf(there) >= 0;
    return near ? { cut: 2200, gain: 0.62 } : { cut: 700, gain: 0.34 };
  }

  function panner(at) {
    const pn = ctx.createPanner();
    pn.panningModel = 'HRTF';
    pn.distanceModel = 'inverse';
    pn.refDistance = 1.6;
    pn.rolloffFactor = 1.15;
    pn.maxDistance = 45;
    if (pn.positionX) {
      pn.positionX.value = at[0]; pn.positionY.value = at[1]; pn.positionZ.value = at[2];
    } else {
      pn.setPosition(at[0], at[1], at[2]);
    }
    // input -> however much wall is in the way -> where it is -> your ears
    const occ = occlusion(at);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = occ.cut; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = occ.gain;
    lp.connect(g); g.connect(pn); pn.connect(master);
    return lp;
  }
  function dry() { return master; }

  // where the ears are, and which way they are pointing
  function listen(pos, fwd, up) {
    earsAt.x = pos.x; earsAt.y = pos.y; earsAt.z = pos.z;
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // --- the sound effects, drawn once at load ------------------------------
  //
  // These are not simulations. The physical approach -- exciting a bank of
  // resonators tuned to an object's modes -- is correct and sounds like a
  // syndrum, because what a real recording of a dropped mug contains is mostly
  // things modal synthesis does not model: the scrape of the two surfaces, the
  // rattle afterwards, the room. And it costs a filter bank per hit.
  //
  // So these are drawn, once, at load, exactly the way the textures are drawn
  // onto canvases at load: a designed waveform written into a buffer, and after
  // that playing one costs a single node. Foley rather than physics -- louder,
  // shorter and more characterful than the real thing, which is what a sound
  // effect has always been.
  //
  // Several variants of each, and a bit of pitch either way on top, because the
  // giveaway is never the sound itself, it is hearing it twice.
  const SFX = {};

  function buf(sec) { return ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * sec)), ctx.sampleRate); }
  // a decaying sine, which is the body of most things
  function tone(d, f, amp, dec, sr, drop) {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const e = Math.exp(-t * dec);
      if (e < 0.0004) break;
      d[i] += Math.sin(2 * Math.PI * f * t * (drop ? 1 - drop * Math.min(1, t * 6) : 1)) * amp * e;
    }
  }
  // and noise through a one-pole, which is the surface
  function fizz(d, amp, dec, sr, cut, hp) {
    let lp = 0, prev = 0;
    const k = Math.min(1, cut / (sr * 0.5));
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, e = Math.exp(-t * dec);
      if (e < 0.0004) break;
      lp += ((Math.random() * 2 - 1) - lp) * k;
      const v = hp ? lp - prev : lp;
      prev = lp;
      d[i] += v * amp * e;
    }
  }
  // The inside of a closed steel drum. A short delay fed back on itself twice,
  // baked into the sample at load: it is the enclosed air, and it is the whole
  // difference between a drum and a piece of sheet metal. Two lengths, neither
  // a multiple of the other, or it rings on one note.
  function boom(d, sr, ms1, ms2, g1, g2) {
    const a = Math.floor(sr * ms1 / 1000), b = Math.floor(sr * ms2 / 1000);
    for (let i = a; i < d.length; i++) d[i] += d[i - a] * g1;
    for (let i = b; i < d.length; i++) d[i] += d[i - b] * g2;
  }
  function clip(d) { for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i])); }

  function renderSFX() {
    const sr = ctx.sampleRate;
    const make = (n, sec, draw) => {
      const out = [];
      for (let v = 0; v < n; v++) { const b = buf(sec); draw(b.getChannelData(0), sr, v); clip(b.getChannelData(0)); out.push(b); }
      return out;
    };

    // a knock. Wood is a click and two low partials that die immediately.
    // A thock. The first version was a clean 190Hz partial over a click, which
    // is a woodblock -- an instrument, made to be tuned and heard. A plank
    // hitting a floor is mostly broadband with a weak low body under it, and
    // the two partials are deliberately close together so neither reads as a
    // note.
    SFX.wood = make(3, 0.26, (d, sr, v) => {
      fizz(d, 0.80, 150, sr, 2600, true);
      tone(d, 104 * (1 + v * 0.10), 0.50, 32, sr, 0.10);
      tone(d, 157 * (1 + v * 0.08), 0.20, 46, sr, 0.06);
    });
    // a clang. Long, bright, and deliberately overdone.
    // A bucket or a length of pipe, not a tuned bar. Everything an octave and
    // a half down, the tail nearly three times longer, and a lot more grit --
    // "a glockenspiel without the decay" is what you get from clean high
    // partials that stop before they have rung.
    // One metal bank could not cover a tin can and an oil drum, and it was
    // tuned somewhere between the two, so both were wrong: the can rang like a
    // bell and the drum was an octave too high. Three sizes.

    // a tin. Tiny, thin, and it does not resonate -- it clatters and stops.
    SFX.tin = make(3, 0.14, (d, sr, v) => {
      fizz(d, 0.70, 420, sr, 6500, true);
      tone(d, 640 * (1 + v * 0.12), 0.10, 70, sr, 0.06);
      tone(d, 1180 * (1 + v * 0.08), 0.05, 90, sr);
    });

    // a pipe, a bucket, a shelf bracket
    SFX.metal = make(3, 0.55, (d, sr, v) => {
      fizz(d, 0.60, 130, sr, 4000, true);
      tone(d, 150 * (1 + v * 0.09), 0.20, 9, sr, 0.03);
      tone(d, 318 * (1 + v * 0.11), 0.13, 8, sr);
      tone(d, 605 * (1 + v * 0.07), 0.07, 12, sr);
    });

    // an oil drum. Deep, and full of air: the fundamental is down where a kick
    // drum lives, and the comb tail is the inside of it.
    SFX.drum = make(3, 0.95, (d, sr, v) => {
      fizz(d, 0.45, 90, sr, 1800);
      tone(d, 58 * (1 + v * 0.07), 0.62, 5.0, sr, 0.10);
      tone(d, 94 * (1 + v * 0.06), 0.30, 6.5, sr, 0.05);
      tone(d, 163 * (1 + v * 0.08), 0.16, 8.0, sr);
      tone(d, 268 * (1 + v * 0.05), 0.07, 11, sr);
      boom(d, sr, 11.3 + v * 1.1, 17.9 + v * 1.3, 0.46, 0.30);
    });
    // a chink.
    // A bottle put down on tile is a short chink, not a struck bell. The
    // partials are brief and the noise carries it.
    SFX.glass = make(3, 0.22, (d, sr, v) => {
      fizz(d, 0.66, 300, sr, 5200, true);
      tone(d, 860 * (1 + v * 0.09), 0.14, 46, sr);
      tone(d, 1420 * (1 + v * 0.06), 0.07, 60, sr);
    });
    // a clonk. Mugs, jars, tins.
    // A cup is a small thing that stops. Almost all noise, a trace of body.
    SFX.ceramic = make(3, 0.13, (d, sr, v) => {
      fizz(d, 0.72, 460, sr, 3800, true);
      tone(d, 390 * (1 + v * 0.1), 0.10, 85, sr, 0.06);
    });
    // a thud, with nothing ringing at all.
    SFX.stone = make(3, 0.22, (d, sr, v) => {
      fizz(d, 0.50, 300, sr, 2200);
      tone(d, 96 * (1 + v * 0.12), 0.75, 26, sr, 0.18);
    });
    // a flump.
    SFX.soft = make(3, 0.20, (d, sr, v) => {
      fizz(d, 0.55, 300, sr, 900 + v * 250);
      tone(d, 74, 0.30, 40, sr, 0.25);
    });

    // the click of taking hold of something, or letting go. Two milliseconds
    // of nothing in particular.
    SFX.click = make(3, 0.05, (d, sr, v) => { fizz(d, 0.30, 900, sr, 2400 + v * 900, true); tone(d, 120, 0.10, 120, sr, 0.3); });

    // feet, by what is underfoot
    SFX.carpet = make(3, 0.16, (d, sr, v) => { fizz(d, 0.34, 340, sr, 1100 + v * 200); tone(d, 88, 0.20, 46, sr, 0.2); });
    // A footstep is a slap and a thump. The 640Hz partial that used to be in
    // here is a glockenspiel bar, which is what "footsteps on metal" was.
    SFX.tile = make(3, 0.20, (d, sr, v) => { fizz(d, 0.52, 190, sr, 3400 + v * 400, true); tone(d, 96, 0.30, 46, sr, 0.2); });
    SFX.concrete = make(3, 0.20, (d, sr, v) => { fizz(d, 0.34, 230, sr, 5200, true); tone(d, 128, 0.26, 40, sr, 0.15); });

    // going through the fold. Not a pitch-drop -- that is a sound effect from a
    // different kind of game. A held breath: everything is pulled inward and
    // then let go, with nothing where the middle of it should be.
  }

  // playing one is a single node
  function play(bank, gain, rate, at) {
    if (!ctx || !bank || !bank.length) return;
    const b = bank[(Math.random() * bank.length) | 0];
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(at ? panner(at) : dry());
    src.start();
  }

  function burst(freq, dur, gain, type, q, at) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.4);
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g);
    const out = at ? panner(at) : dry();
    g.connect(out);
    s.start(); s.stop(ctx.currentTime + dur + 0.02);
  }

  return {
    start,
    // A footstep on carpet is not a footstep on concrete, and the room already
    // knows which it is standing on.
    step: (floor) => play(SFX[floor] || SFX.tile, 0.30, 0.92 + Math.random() * 0.16),
    // A click. It used to be a tuned burst, which at 320Hz is a ping -- and a
    // ping is a notification sound, which this game does not have.
    blip: (f, d, g) => play(SFX.click, Math.min(0.5, (g || 0.05) * 3.2), 0.85 + Math.random() * 0.3),
    impact: (v, mass, at, cls, size) => {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastImpact < 0.02) return;
      lastImpact = now;
      const hit = Math.min(1, v / 5.0);
      // Small things ring higher, but only a little. This used to reach 1.9 --
      // a mug and a brick were both played most of an octave above the pitch
      // they were drawn at, which is most of why everything sounded like a toy.
      const bulk = Math.min(1.5, Math.max(0.15, (size || 0.3) + mass * 0.3));
      const r = (1.12 - (bulk - 0.15) * 0.31) * (0.95 + Math.random() * 0.10);
      play(SFX[cls] || SFX.wood, Math.min(0.46, 0.07 + 0.44 * hit * hit), Math.max(0.60, Math.min(1.18, r)), at);
    },
    listen,
    // The room tone has gone the way of the hum: it was noise under everything,
    // all the time, and it was the thing you could hear when nothing was
    // happening. Kept as a no-op so the caller does not have to care.
    setTone: () => {},
    occlusion,
    get sfx() { return SFX; }
  };
})();

// ---------------------------------------------------------------------------

let hud, prompt, titleEl, clock, crossEl, helpEl, shownHover = 0, targetFog = 0.055, currentSpace = '';
let stats = null;

// --- instrumentation --------------------------------------------------------
// ?perf=1 puts the numbers on screen. VK.info() returns the same thing to a
// script. Everything the optimisation work is aimed at is in here: draw calls,
// how many lights are actually being shaded, how many shader programs three has
// had to compile, and what the worst frames cost.
const QS = new URLSearchParams(location.search);
const PERF = QS.has('perf');
// The film grain is a fullscreen div blended over the canvas with mix-blend-mode
// and repainted on a keyframe animation. That is a compositor cost this side of
// WebGL, invisible to renderer.info, and it varies wildly by machine.
// ?nograin=1 takes it out so it can be A/B'd on real hardware.
if (QS.has('nograin')) addEventListener('DOMContentLoaded', () => {
  const g = document.getElementById('grain');
  if (g) g.style.display = 'none';
});

let perfEl = null;
let visibleLights = 0, portalsDrawn = 0, roomsShown = 0;
const frameTimes = new Float32Array(120);
let frameIdx = 0, lastFrameAt = 0, perfShownAt = 0;

function frameStats() {
  const sorted = Array.from(frameTimes).filter(v => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return { mean: 0, p99: 0 };
  let sum = 0;
  for (const v of sorted) sum += v;
  return {
    mean: sum / sorted.length,
    p99: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]
  };
}

function perfInfo() {
  const r = renderer.info;
  const f = frameStats();
  return {
    calls: r.render.calls, triangles: r.render.triangles,
    programs: r.programs ? r.programs.length : 0,
    textures: r.memory.textures, geometries: r.memory.geometries,
    visibleLights, portalsDrawn, roomsShown, rooms: SPACE_ORDER.length,
    mean: +f.mean.toFixed(2), p99: +f.p99.toFixed(2),
    fps: f.mean ? Math.round(1000 / f.mean) : 0
  };
}

function updatePerf(now) {
  if (lastFrameAt) { frameTimes[frameIdx] = now - lastFrameAt; frameIdx = (frameIdx + 1) % frameTimes.length; }
  lastFrameAt = now;
  if (!PERF || now - perfShownAt < 250) return;
  perfShownAt = now;
  if (!perfEl) {
    perfEl = document.createElement('pre');
    perfEl.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 9px;z-index:99;' +
      'font:11px/1.45 "Courier New",monospace;color:#cfe0a0;background:rgba(0,0,0,.55);pointer-events:none;white-space:pre';
    document.body.appendChild(perfEl);
  }
  const i = perfInfo();
  perfEl.textContent =
    i.fps + ' fps   ' + i.mean.toFixed(1) + 'ms  (worst ' + i.p99.toFixed(1) + ')\n' +
    'draw calls  ' + i.calls + '\n' +
    'triangles   ' + (i.triangles / 1000).toFixed(0) + 'k\n' +
    'lights lit  ' + i.visibleLights + '\n' +
    'portals     ' + i.portalsDrawn + '\n' +
    'rooms on    ' + i.roomsShown + ' / ' + i.rooms + '\n' +
    'programs    ' + i.programs + '\n' +
    'textures    ' + i.textures + '   geo ' + i.geometries + '\n' +
    'room        ' + currentSpace;
}

function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio = PR_MAX);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;      // we say when; see refreshShadows()
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050a);
  scene.fog = new THREE.FogExp2(0x0a0a0e, 0.055);

  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
  camera.rotation.order = 'YXZ';

  buildMaterials(R);
  initPhysics();
  scene.add(new THREE.HemisphereLight(0x424a5c, 0x2e2618, 0.55));

  stats = generateBuilding();
  for (const key of SPACE_ORDER) buildSpace(key, SPACES[key]);
  initLightPool();

  initPlayer();
  buildPortals();
  initVision();
  initPortalSides();
  buildRoomGraph();
  mergeStatics();
  freezeStatics();
  initInput(canvas);

  for (const { body } of dynamicPairs) {
    body.addEventListener('collide', e => {
      const v = e.contact.getImpactVelocityAlongNormal();
      if (Math.abs(v) > 1.2) {
        Audio.impact(Math.abs(v), body.mass, [body.position.x, body.position.y, body.position.z],
                     body.sndClass, body.sndSize);
        Music.event('impact', { v: Math.abs(v), mass: body.mass, cls: body.sndClass });
      }
    });
  }

  hud = document.getElementById('hud');
  crossEl = document.getElementById('cross');
  helpEl = document.getElementById('help');
  prompt = document.getElementById('prompt');
  titleEl = document.getElementById('title');
  clock = new THREE.Clock();

  const seedEl = document.getElementById('seed');
  if (seedEl) seedEl.textContent = 'house ' + SEED + ' · ' + stats.rooms + ' rooms · ' + stats.portals + ' doors that are not doors';

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    resizePortals();
    resizeVision();
  });

  const startGame = () => {
    Audio.start();
    canvas.requestPointerLock();
    titleEl.style.opacity = '0';
    setTimeout(() => { titleEl.style.display = 'none'; }, 1400);
  };
  document.getElementById('start').addEventListener('click', startGame);
  const again = document.getElementById('another');
  if (again) again.addEventListener('click', () => {
    location.href = location.pathname + '?seed=' + Math.floor(Math.random() * 1e9);
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    hud.style.opacity = locked ? '1' : '0';
    document.getElementById('paused').style.display =
      (!locked && titleEl.style.display === 'none') ? 'flex' : 'none';
  });
  document.getElementById('paused').addEventListener('click', () => canvas.requestPointerLock());

  window.VK = {
    THREE, CANNON, SEED, stats,
    get scene() { return scene; }, get camera() { return camera; },
    get world() { return world; }, get spaces() { return SPACES; },
    MAT, PROPS, doors, PORTALS, Audio,
    music: Music,
    get dose() { return dose; },
    doseFor, roomDepths, pinDose,
    get deepest() { return _deepest; },
    get mergeStats() { return mergeStats; },
    get driftCount() { return driftCount; },
    get allLights() { return allLights; },
    drift(key) { _visited.add(key); driftRoom(key); },
    get roomGroups() { return roomGroups; },
    get roomGraph() { return roomGraph; },
    get bodyTraversals() { return bodyTraversals; },
    get bodyTraversals() { return bodyTraversals; },
    freeze(t) { frozenAt = t === undefined ? 12 : t; },
    thaw() { frozenAt = null; clock.getDelta(); },
    go(x, y, z, look, tilt) {
      playerBody.position.set(x, y === undefined ? 0.36 : y, z);
      playerBody.velocity.set(0, 0, 0);
      if (look !== undefined) yaw = look;
      if (tilt !== undefined) pitch = tilt;
      updatePlayer(0.016);
      initPortalSides();
      updateSpace();
      updateRoomVisibility(EMPTY);
    },
    goSpace(key, dy) {
      const s = SPACES[key]; if (!s) return false;
      this.go(s.origin[0], 0.36 + (dy || 0), s.origin[1]);
      return true;
    },
    openAll() { doors.forEach(d => { d.open = true; }); },
    grab() { tryGrab(); return !!held; },
    drop() { release(false); },
    hurl() { if (held) throwHeld(); },
    held() { return held ? { pos: held.position.toArray(), mass: held.mass } : null; },
    press(code, on) { keys[code] = !!on; },
    player() { return { pos: playerBody.position.toArray(), vel: playerBody.velocity.toArray(), space: currentSpace }; },
    tick(n, dt) {
      dt = dt || 1 / 60;
      for (let i = 0; i < n; i++) { updatePlayer(dt); updateHeld(dt); updateDoors(dt); world.step(dt); updatePortals(); }
      syncBodies(); updateSpace();
      scene.updateMatrixWorld(true);   // so raycasts see where things actually are
    },
    aimAt(x, y, z) {
      const dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z;
      const h = Math.hypot(dx, dz);
      yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, h);
      updatePlayer(0.001);
    },
    get grabbables() { return grabbables; },
    lights() { return allLights; },          // the descriptions
    pool() { return LIGHT_POOL; },           // the twelve that are actually on
    get rooms() { return roomGroups; },
    count() {
      let meshes = 0;
      scene.traverse(o => { if (o.isMesh) meshes++; });
      return { bodies: world.bodies.length, meshes, grabbable: grabbables.length,
               rooms: SPACE_ORDER.length, portals: PORTALS.length,
               lights: allLights.length, pool: POOL_SIZE, shown: roomsShown };
    },
    get renderer() { return renderer; },
    info() { return perfInfo(); },
    resetInfo() { frameTimes.fill(0); frameIdx = 0; lastFrameAt = 0; }
  };

  animate();
}

function whichSpace() {
  const x = playerBody.position.x, z = playerBody.position.z;
  for (const b of spaceBounds)
    if (x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1]) return b;
  return null;
}

// whichSpace() answers for the player. This answers for anything -- a mug
// bouncing two rooms away needs to know which room it is bouncing in before we
// can work out how much wall is between it and your ears.
function spaceAt(x, z) {
  for (const b of spaceBounds)
    if (x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1]) return b.key;
  return null;
}

function updateSpace() {
  const sp = whichSpace();
  if (!sp) return;
  targetFog = sp.fog;
  if (sp.key === currentSpace) return;
  currentSpace = sp.key;
  const seenBefore = _visited.has(sp.key);
  _visited.add(sp.key);
  Music.event('room', { key: sp.key, seen: seenBefore });
  const label = SPACES[sp.key].label;
  if (label && label !== '—' && prompt) showPrompt(label, 2600);
  Audio.setTone(SPACES[sp.key]._type === 'warehouse' ? 0.13 : 0.09);
}

// Fill the fixed light pool from wherever the camera is (see 20-build.js for
// why the pool exists). Score is the light's actual contribution at that point
// -- brightness over the square of the distance -- so the ones that win are the
// ones you could tell were missing.
const _slotSrc = new Array(POOL_SIZE).fill(null);   // which source each slot holds
const _cand = [];

function pickLights(pos) {
  _cand.length = 0;
  for (const l of allLights) {
    const dx = l.pos.x - pos.x, dy = l.pos.y - pos.y, dz = l.pos.z - pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > l.distance * l.distance) continue;      // past its range it is off
    l._score = l.intensity / (1 + d2);               // what it is actually worth here
    _cand.push(l);
  }
  _cand.sort((a, b) => b._score - a._score);
  if (_cand.length > POOL_SIZE) _cand.length = POOL_SIZE;
  return _cand;
}

// Every lamp in the pool is scaled by the score: a note lifts the room a few
// per cent and the weight underneath pulls it down again. It is well below
// what reads as a light doing something -- it reads as the room having a
// pulse. Exactly 1 when the music is not running, so a build with the score in
// it renders the same pixels as one without.
let musicLight = 1;

function writeSlot(i, src) {
  const l = LIGHT_POOL[i];
  if (!src) { l.intensity = 0; return; }
  l.position.copy(src.pos);
  l.color.copy(src.color);
  l.intensity = src.intensity * musicLight;
  l.distance = src.distance;
  l.decay = src.decay;
}

// The steady, player-following version: slots keep hold of the source they had
// so the pool does not reshuffle every frame, which would make the shadows jump.
function updateLightPool(pos) {
  const want = pickLights(pos);
  const taken = new Array(POOL_SIZE).fill(false);
  const placed = new Set();
  for (let i = 0; i < POOL_SIZE; i++) {
    if (_slotSrc[i] && want.includes(_slotSrc[i])) { taken[i] = true; placed.add(_slotSrc[i]); }
    else _slotSrc[i] = null;
  }
  let next = 0;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (taken[i]) continue;
    while (next < want.length && placed.has(want[next])) next++;
    _slotSrc[i] = next < want.length ? want[next++] : null;
    if (_slotSrc[i]) { placed.add(_slotSrc[i]); shadowsDirty = true; }
  }
  for (let i = 0; i < POOL_SIZE; i++) writeSlot(i, _slotSrc[i]);
  visibleLights = want.length;
}

// The throwaway version, for a portal view: no slot memory, no shadows to keep
// still, just put the right lights in for one render.
function applyLightPoolAt(pos) {
  const want = pickLights(pos);
  for (let i = 0; i < POOL_SIZE; i++) writeSlot(i, want[i] || null);
}

// Redraw the shadow maps only when a caster has moved -- a door swinging, or
// something you have picked up or thrown that has not yet settled -- and never
// on consecutive frames.
let shadowFrame = 0;
function refreshShadows() {
  shadowFrame++;
  if (!shadowsDirty) {
    for (const { body } of dynamicPairs) if (!body.sleepState) { shadowsDirty = true; break; }
    if (!shadowsDirty) for (const d of doors) if (Math.abs(d.t - (d.open ? 1 : 0)) > 0.001) { shadowsDirty = true; break; }
  }
  if (shadowsDirty && (shadowFrame & 1) === 0) {
    renderer.shadowMap.needsUpdate = true;
    shadowsDirty = false;
  }
}

// --- what is switched on ----------------------------------------------------
// The room you are in, whatever it opens onto, and -- one step further out --
// any room beyond that which is actually in front of you. Plus the far side of
// any portal being rendered, and its neighbours, because that view is a real
// render of a real place and the place has to be there for it.
const _visRooms = new Set();
const _shown = new Set();
const _roomBox = new THREE.Box3();
const _roomFrustum = new THREE.Frustum();
const _roomMat = new THREE.Matrix4();

function addRoomAndNeighbours(key, depth) {
  if (!key || _visRooms.has(key)) return;
  _visRooms.add(key);
  if (depth <= 0) return;
  for (const n of (roomGraph[key] || [])) {
    if (_visRooms.has(n)) continue;
    if (depth === 1 && !roomInView(n)) continue;   // two rooms out, only if you could see it
    addRoomAndNeighbours(n, depth - 1);
  }
}

function roomInView(key) {
  const b = spaceBounds.find(s => s.key === key);
  if (!b) return false;
  const def = SPACES[key];
  _roomBox.min.set(b.min[0], 0, b.min[1]);
  _roomBox.max.set(b.max[0], def.size[1], b.max[1]);
  return _roomFrustum.intersectsBox(_roomBox);
}

// --- A1a: the house changes behind your back ---------------------------------
//
// A room you come back to is not quite the room you left. One change per visit,
// made while the room is switched off, so it is never seen happening.
//
// What it may touch: the light fittings and the doors -- things the house owns.
// What it may never touch: anything you can pick up. Players mark rooms with
// objects to work out whether they have been there before (PLAN §2), and that
// instrument has to stay trustworthy or the doubt it produces is worthless.
// Moving a marker is a different experiment, A1b, and it is not this one.
//
// Its own random stream, so a drift does not depend on how many rooms you
// happened to walk through, and ?nodrift=1 turns it off for the screenshot A/B.
const DRIFT_OFF = QS.has('nodrift');
const DR = mulberry32((SEED ^ 0x5bf03635) >>> 0);
const _visited = new Set();
let driftCount = 0;

// A door is the strongest change available and the one most likely to break the
// promise: a leaf swinging through a mug somebody left in the doorway has moved
// their marker, whatever the intention was. So a door only changes if its swing
// is empty.
const _swing = new THREE.Vector3();
function doorSwingClear(d) {
  const reach = d.w + 0.4;
  for (const { mesh, body } of dynamicPairs) {
    _swing.set(body.position.x - d.pivot.position.x, 0, body.position.z - d.pivot.position.z);
    if (body.position.y < d.h + 0.3 && _swing.lengthSq() < reach * reach) return false;
  }
  return true;
}

function driftRoom(key) {
  if (DRIFT_OFF || !_visited.has(key)) return;   // it has to have been seen to be different
  if (DR() > 0.45) return;                       // not every time you leave

  const lit = [], dark = [], shut = [], ajar = [];
  for (const l of allLights) {
    if (l.space !== key || !l.glow || !l.base) continue;
    (l.intensity > 0 ? lit : dark).push(l);
  }
  for (const d of doors) if (d.space === key && doorSwingClear(d)) (d.open ? ajar : shut).push(d);

  // prefer taking something away: a room that has gone dark is worth more than
  // a room that has come on
  const options = [];
  if (lit.length > 1) options.push('off');       // never the last light in a room
  if (dark.length) options.push('on');
  if (ajar.length) options.push('shut');
  if (shut.length) options.push('open');
  if (!options.length) return;

  const pick = options[Math.floor(DR() * options.length)];
  if (pick === 'off' || pick === 'on') {
    const pool = pick === 'off' ? lit : dark;
    const l = pool[Math.floor(DR() * pool.length)];
    l.intensity = pick === 'off' ? 0 : l.base;
    if (l.glow) {
      // the fitting is kept out of the merge for exactly this; give it a
      // material of its own the first time rather than dimming every bulb
      if (!l.glow.userData.ownMat) {
        l.glow.material = l.glow.material.clone();
        l.glow.userData.ownMat = true;
        l.glow.userData.litColor = l.glow.material.color.clone();
      }
      l.glow.material.color.copy(pick === 'off'
        ? l.glow.userData.litColor.clone().multiplyScalar(0.13)
        : l.glow.userData.litColor);
    }
    for (const f of flickerers) if (f.light === l) f.base = l.intensity;
  } else {
    const d = (pick === 'shut' ? ajar : shut)[Math.floor(DR() * (pick === 'shut' ? ajar : shut).length)];
    d.open = pick === 'open';
  }
  driftCount++;
  shadowsDirty = true;
}

function updateRoomVisibility(portals) {
  _roomMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _roomFrustum.setFromProjectionMatrix(_roomMat);

  _visRooms.clear();
  addRoomAndNeighbours(currentSpace || START.space, 2);
  for (const p of portals) addRoomAndNeighbours(p.other.space, 1);

  // only touch the ones that changed
  for (const key of _visRooms) if (!_shown.has(key)) roomGroups[key].visible = true;
  for (const key of _shown) if (!_visRooms.has(key)) { roomGroups[key].visible = false; driftRoom(key); }
  _shown.clear();
  for (const key of _visRooms) _shown.add(key);
  roomsShown = _visRooms.size;
}

// An object's mesh is parented to the room it was built in, and rooms are shown
// and hidden as whole groups. So an object that travels -- carried through a
// portal, thrown next door, or simply put down in the next room as a marker --
// keeps the visibility of a room it is no longer in, and stops being drawn the
// moment that room switches off. Players navigate by these objects (PLAN §2),
// so an object has to be drawn wherever it actually is. Room groups are all at
// the origin with no rotation, so re-parenting does not move anything.
function reroom(mesh) {
  const x = mesh.position.x, z = mesh.position.z;
  let near = null, nd = Infinity;
  for (const b of spaceBounds) {
    if (x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1]) {
      if (mesh.parent !== b.group) b.group.add(mesh);
      return;
    }
    // rooms are separate rectangles with walls between them, so a doorway --
    // and an object standing in one -- is inside none of them. Falling back to
    // the nearest keeps it drawn instead of leaving it with the visibility of
    // whichever room it happened to be built in.
    const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
    const dz = Math.max(b.min[1] - z, 0, z - b.max[1]);
    const d = dx * dx + dz * dz;
    if (d < nd) { nd = d; near = b; }
  }
  if (near && mesh.parent !== near.group) near.group.add(mesh);
}

function syncBodies() {
  for (const { mesh, body } of dynamicPairs) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    reroom(mesh);
  }
}

// A screenshot A/B is only evidence if the two builds are asked to draw the
// same instant. They are not, by default: physics steps on wall-clock delta and
// the lamps flicker off performance.now(), so the same build photographed twice
// differs as much as a real change does. VK.freeze(t) pins the clock -- no time
// passes in the frame loop, and the flicker is evaluated at exactly t -- which
// leaves physics driven only by VK.tick() and the picture reproducible.
let frozenAt = null;

const _earPos = new THREE.Vector3(), _earFwd = new THREE.Vector3(), _earUp = new THREE.Vector3(0, 1, 0);

let acc = 0;
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  updatePerf(nowMs);
  adaptResolution(nowMs);
  const dt = frozenAt !== null ? (clock.getDelta(), 0) : Math.min(clock.getDelta(), 0.05);

  updatePlayer(dt);
  updateHeld(dt);
  updateDoors(dt);

  acc += dt;
  let steps = 0;
  while (acc >= 1 / 60 && steps < 4) { world.step(1 / 60); acc -= 1 / 60; steps++; }

  updatePortals();
  syncBodies();
  refreshShadows();

  const t = frozenAt !== null ? frozenAt : performance.now() * 0.001;
  for (const f of flickerers) {
    const n = Math.sin(t * 11.3 + f.seed) * Math.sin(t * 3.7 + f.seed * 2.1) * Math.sin(t * 27.1 + f.seed);
    const drop = (f.amt > 0.2 && Math.sin(t * 1.7 + f.seed) > 0.986) ? 0.15 : 1;
    f.light.intensity = Math.max(0, f.base * (1 + n * f.amt) * drop);   // a description; the pool picks it up
  }


  updateSpace();
  if (frozenAt !== null) scene.fog.density = targetFog;
  else scene.fog.density += (targetFog * (1 + 0.05 * Music.fx.sub) - scene.fog.density) * 0.03;

  // the ears go where the eyes are
  Audio.listen(camera.getWorldPosition(_earPos), camera.getWorldDirection(_earFwd), _earUp);

  // and the score reads what you are doing: how fast you are going, how much
  // you are looking about, and how far in you are. See 38-music.js.
  // `vision` is how hard the perception pass is actually working -- how far
  // in you are, times ?fx=N. The score reads it and dirties itself to match,
  // so the two halves of the thing move together: turn the pass up and the
  // music distorts with it, turn it down and the music cleans up.
  Music.update(dt, {
    speed: Math.hypot(playerBody.velocity.x, playerBody.velocity.z),
    yaw, dose, vision: dose * FX_GAIN
  });
  // The stutter in the drone and the bad bulb in the ceiling are the same
  // event. Nothing explains either.
  musicLight = 1 + Music.fx.pulse * 0.09 - Music.fx.sub * 0.045 - Music.fx.flicker * 0.34;

  updateHover();
  if (hoverTarget !== shownHover) {
    shownHover = hoverTarget;
    crossEl.className = hoverTarget ? 'on' : '';
    helpEl.textContent =
      hoverTarget === 'grab' ? 'take' :
      hoverTarget === 'door' ? 'open' :
      hoverTarget === 'held' ? 'drop · right-click to throw' : '';
  }

  camera.updateMatrixWorld(true);
  const shownPortals = visiblePortals();
  updateRoomVisibility(shownPortals);
  renderPortals(shownPortals);
  updateLightPool(camera.position);
  // the defect is in the person looking; see 35-vision.js
  renderVision(frozenAt !== null ? frozenAt : nowMs * 0.001,
               frozenAt !== null ? 1 : dt, currentSpace);
}

// If the machine cannot hold the frame, give it fewer pixels rather than a
// worse building. Comes back up on its own when the room gets cheaper.
// ?pr=N pins the ratio and turns the adaptation off, so a rendering change can
// be compared against another build without this moving underneath it.
const PR_PIN = QS.has('pr') ? parseFloat(QS.get('pr')) : 0;
const PR_MAX = PR_PIN || Math.min(devicePixelRatio, 1.25), PR_MIN = 0.75;
let pixelRatio = PR_MAX, prCheckedAt = 0;

function adaptResolution(now) {
  if (PR_PIN || now - prCheckedAt < 1000) return;
  prCheckedAt = now;
  const mean = frameStats().mean;
  if (!mean) return;
  let next = pixelRatio;
  if (mean > 18 && pixelRatio > PR_MIN) next = Math.max(PR_MIN, pixelRatio - 0.25);
  else if (mean < 12 && pixelRatio < PR_MAX) next = Math.min(PR_MAX, pixelRatio + 0.25);
  if (next === pixelRatio) return;
  pixelRatio = next;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  resizePortals();
  resizeVision();
}

let promptTimer = null;

function showPrompt(text, ms) {
  prompt.textContent = text;
  prompt.style.opacity = '1';
  clearTimeout(promptTimer);
  promptTimer = setTimeout(() => { prompt.style.opacity = '0'; }, ms);
}

init();
