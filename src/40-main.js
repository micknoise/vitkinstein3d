// ---------------------------------------------------------------------------
// Sound, screen, loop.
// ---------------------------------------------------------------------------

const Audio = (() => {
  let ctx = null, master = null, toneGain = null, lastImpact = 0;
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
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(6); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.6;
    toneGain = ctx.createGain(); toneGain.gain.value = 0.09;
    src.connect(lp); lp.connect(toneGain); toneGain.connect(master);
    src.start();

    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 50;
    const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 150;
    const hg = ctx.createGain(); hg.gain.value = 0.012;
    hum.connect(hg); hum2.connect(hg); hg.connect(master);
    hum.start(); hum2.start();

    scheduleFar();
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
  // and the mains hum stay monophonic on purpose -- they are the room itself,
  // not events in it, and giving them a position would put the room in a
  // corner. Footsteps stay monophonic too: they happen at the listener, so a
  // panner would do nothing but cost a node.
  //
  // Each event makes its own panner and lets it go when the sound ends; there
  // are only ever a handful at once.
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
    pn.connect(master);
    return pn;
  }

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

  function burst(freq, dur, gain, type, q, at) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.4);
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g);
    const out = at ? panner(at) : master;
    g.connect(out);
    s.start(); s.stop(ctx.currentTime + dur + 0.02);
  }

  return {
    start,
    step: () => burst(380 + Math.random() * 180, 0.11, 0.055, 'bandpass', 0.9),
    blip: (f, d, g) => burst(f, d, g),
    impact: (v, mass, at) => {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastImpact < 0.03) return;
      lastImpact = now;
      const g = Math.min(0.35, v * 0.045);
      burst(160 + 900 / Math.max(0.3, mass), 0.07 + Math.min(0.2, mass * 0.02), g, 'bandpass', 1.6, at);
    },
    listen,
    // the sound of the room changing behind you
    through: () => {
      if (!ctx) return;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(120, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.85);
      burst(2400, 0.25, 0.03, 'highpass', 0.7);
    },
    creak: (opening, at) => {
      if (!ctx) return;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f0 = opening ? 210 : 260;
      o.frequency.setValueAtTime(f0, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(f0 * (opening ? 0.55 : 1.4), ctx.currentTime + 0.85);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      o.connect(bp); bp.connect(g); g.connect(at ? panner(at) : master);
      o.start(); o.stop(ctx.currentTime + 0.95);
    },
    setTone: (v) => { if (toneGain) toneGain.gain.value = v; }
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
  initVideo();
  initPortalSides();
  buildRoomGraph();
  mergeStatics();
  freezeStatics();
  initInput(canvas);

  for (const { body } of dynamicPairs) {
    body.addEventListener('collide', e => {
      const v = e.contact.getImpactVelocityAlongNormal();
      if (Math.abs(v) > 1.2) Audio.impact(Math.abs(v), body.mass, [body.position.x, body.position.y, body.position.z]);
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
    resizeVideo();
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
    burstAt, barAt,
    get barHalf() { return BAR_HALF; },
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

function updateSpace() {
  const sp = whichSpace();
  if (!sp) return;
  targetFog = sp.fog;
  if (sp.key === currentSpace) return;
  currentSpace = sp.key;
  _visited.add(sp.key);
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

function writeSlot(i, src) {
  const l = LIGHT_POOL[i];
  if (!src) { l.intensity = 0; return; }
  l.position.copy(src.pos);
  l.color.copy(src.color);
  l.intensity = src.intensity;
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
  else scene.fog.density += (targetFog - scene.fog.density) * 0.03;

  // the ears go where the eyes are
  Audio.listen(camera.getWorldPosition(_earPos), camera.getWorldDirection(_earFwd), _earUp);

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
  // everything you see is footage; see 35-video.js
  renderVideo(frozenAt !== null ? frozenAt : nowMs * 0.001);
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
  resizeVideo();
}

let promptTimer = null;

function showPrompt(text, ms) {
  prompt.textContent = text;
  prompt.style.opacity = '1';
  clearTimeout(promptTimer);
  promptTimer = setTimeout(() => { prompt.style.opacity = '0'; }, ms);
}

init();
