// ---------------------------------------------------------------------------
// Sound, screen, loop.
// ---------------------------------------------------------------------------

const Audio = (() => {
  let ctx = null, master = null, toneGain = null, lastImpact = 0;

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
        o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 1.5);
      }
      scheduleFar();
    }, t);
  }

  function burst(freq, dur, gain, type, q) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.4);
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(); s.stop(ctx.currentTime + dur + 0.02);
  }

  return {
    start,
    step: () => burst(380 + Math.random() * 180, 0.11, 0.055, 'bandpass', 0.9),
    blip: (f, d, g) => burst(f, d, g),
    impact: (v, mass) => {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastImpact < 0.03) return;
      lastImpact = now;
      const g = Math.min(0.35, v * 0.045);
      burst(160 + 900 / Math.max(0.3, mass), 0.07 + Math.min(0.2, mass * 0.02), g, 'bandpass', 1.6);
    },
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
    creak: (opening) => {
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
      o.connect(bp); bp.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + 0.95);
    },
    setTone: (v) => { if (toneGain) toneGain.gain.value = v; }
  };
})();

// ---------------------------------------------------------------------------

let hud, prompt, titleEl, clock, targetFog = 0.055, currentSpace = '';
let stats = null;

function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  initPlayer();
  buildPortals();
  initPortalSides();
  initInput(canvas);

  for (const { body } of dynamicPairs) {
    body.addEventListener('collide', e => {
      const v = e.contact.getImpactVelocityAlongNormal();
      if (Math.abs(v) > 1.2) Audio.impact(Math.abs(v), body.mass);
    });
  }

  hud = document.getElementById('hud');
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
    MAT, PROPS, doors, PORTALS,
    go(x, y, z, look, tilt) {
      playerBody.position.set(x, y === undefined ? 0.36 : y, z);
      playerBody.velocity.set(0, 0, 0);
      if (look !== undefined) yaw = look;
      if (tilt !== undefined) pitch = tilt;
      updatePlayer(0.016);
      initPortalSides();
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
    count() { return { bodies: world.bodies.length, meshes: scene.children.length, grabbable: grabbables.length, rooms: SPACE_ORDER.length, portals: PORTALS.length }; }
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
  const label = SPACES[sp.key].label;
  if (label && label !== '—' && prompt) showPrompt(label, 2600);
  Audio.setTone(SPACES[sp.key]._type === 'warehouse' ? 0.13 : 0.09);
}

// forward rendering shades every visible light per fragment, so light what is
// near enough to matter and nothing else
function cullLights(pos) {
  for (const l of allLights) {
    const d2 = (l.position.x - pos.x) ** 2 + (l.position.z - pos.z) ** 2;
    const r = (l.distance || 10) + 6;
    l.visible = d2 < r * r;
  }
}

function syncBodies() {
  for (const { mesh, body } of dynamicPairs) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}

let acc = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updatePlayer(dt);
  updateHeld(dt);
  updateDoors(dt);

  acc += dt;
  let steps = 0;
  while (acc >= 1 / 60 && steps < 4) { world.step(1 / 60); acc -= 1 / 60; steps++; }

  updatePortals();
  syncBodies();

  const t = performance.now() * 0.001;
  for (const f of flickerers) {
    const n = Math.sin(t * 11.3 + f.seed) * Math.sin(t * 3.7 + f.seed * 2.1) * Math.sin(t * 27.1 + f.seed);
    const drop = (f.amt > 0.2 && Math.sin(t * 1.7 + f.seed) > 0.986) ? 0.15 : 1;
    f.light.intensity = Math.max(0, f.base * (1 + n * f.amt) * drop);
  }


  updateSpace();
  scene.fog.density += (targetFog - scene.fog.density) * 0.03;

  updateHover();
  document.getElementById('cross').className = hoverTarget ? 'on' : '';
  document.getElementById('help').textContent =
    hoverTarget === 'grab' ? 'take' :
    hoverTarget === 'door' ? 'open' :
    hoverTarget === 'held' ? 'drop · right-click to throw' : '';

  camera.updateMatrixWorld(true);
  renderPortals();
  cullLights(camera.position);
  renderer.render(scene, camera);
}

let promptTimer = null;
function showPrompt(text, ms) {
  prompt.textContent = text;
  prompt.style.opacity = '1';
  clearTimeout(promptTimer);
  promptTimer = setTimeout(() => { prompt.style.opacity = '0'; }, ms);
}

init();
