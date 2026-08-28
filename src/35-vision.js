// ---------------------------------------------------------------------------
// PERCEPTION.
//
// One full-screen pass, and it is not a camera. There is no film, no tape, no
// lens: the defect is in the person looking. What it does is what people
// describe after two days without sleep, or on a dose of something -- visual
// snow, surfaces that will not hold still, a periphery that softens and closes
// in, edges that separate into colour, and a half-second of the last thing you
// looked at still hanging about after you have looked away.
//
// And it gets worse the further in you are. Not in metres -- in doors. Depth is
// breadth-first steps from the room you woke up in, over `roomGraph`, which is
// the only measure that means anything in a building where a doorway can put
// you half a mile away. Walk deep enough by a short route and you are fine;
// walk five rooms and you are not. See PLAN C1.
//
// Three passes: the world into a target; that mixed with the last frame into an
// accumulation buffer, which is where the trails come from; and that onto the
// canvas, warped, blurred, dimmed and grained by however far in you are.
//
// ?nofx=1 turns it off, which is what the screenshot A/B compares against.
// ---------------------------------------------------------------------------

let FX_OFF = false;

let sceneRT = null, accumRT = null, prevRT = null;
let fxScene = null, fxCam = null, accumMat = null, finalMat = null;
let fxMesh = null;

const FX_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Pass one: tone-map the world, and mix in what was there a frame ago. The
// trail is the whole reason this is a separate pass -- it needs a buffer that
// survives the frame.
const ACCUM_FRAG = `
  precision highp float;
  uniform sampler2D world;
  uniform sampler2D prev;
  uniform float exposure;
  uniform float trail;
  varying vec2 vUv;
  vec3 rrt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  void main() {
    const mat3 IN  = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    vec3 c = texture2D(world, vUv).rgb * exposure;
    c = clamp(OUT * rrt(IN * c), 0.0, 1.0);
    c = pow(c, vec3(0.4545));
    vec3 p = texture2D(prev, vUv).rgb;
    // max, not mix: an after-image is something bright that stays, not the
    // whole frame going muddy. Dark things do not leave trails.
    gl_FragColor = vec4(max(c, p * trail), 1.0);
  }`;

const FINAL_FRAG = `
  precision highp float;
  uniform sampler2D tex;
  uniform vec2  res;
  uniform float time;
  uniform float dose;        // 0 at the door you came in by, 1 a long way in
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // smooth value noise, two octaves -- enough for something to breathe on
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { return vnoise(p) * 0.65 + vnoise(p * 2.17 + 11.3) * 0.35; }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);

    // --- the surfaces will not hold still ---------------------------------
    // Two slow fields at different scales pulling the picture about. Slow is
    // the whole thing: fast is a wobble, slow is something breathing.
    float t = time * 0.22;
    vec2 warp = vec2(
      fbm(uv * 3.1 + vec2(t, t * 0.7)) - 0.5,
      fbm(uv * 2.7 + vec2(-t * 0.8, t * 1.1) + 31.7) - 0.5);
    warp += 0.45 * vec2(
      fbm(uv * 7.3 + vec2(-t * 1.6, t * 1.3) + 5.1) - 0.5,
      fbm(uv * 6.9 + vec2(t * 1.4, -t * 1.7) + 17.9) - 0.5);
    // worse further in, and worse away from where you are looking
    float amp = (0.0016 + 0.0090 * dose) * (0.45 + 1.9 * r2);
    vec2 suv = uv + warp * amp;

    // --- the periphery softens and lets go --------------------------------
    // A handful of taps on a ring that opens up towards the edge of vision.
    float blur = (0.4 + 3.4 * dose) * smoothstep(0.02, 0.30, r2) / res.y;
    vec3 col = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471976 + time * 0.35;
      vec2 o = vec2(cos(a), sin(a)) * blur * (1.0 + 0.6 * hash(vec2(float(i), 7.0)));
      // and the colour comes apart as it goes: red drifts out, blue drifts in
      float k = float(i) / 6.0;
      vec3 s;
      s.r = texture2D(tex, suv + o * 1.35).r;
      s.g = texture2D(tex, suv + o).g;
      s.b = texture2D(tex, suv + o * 0.70).b;
      float w = 1.0 - 0.5 * k;
      col += s * w; wsum += w;
    }
    col /= wsum;
    col = mix(texture2D(tex, suv).rgb, col, smoothstep(0.0, 0.25, blur * res.y));

    // --- visual snow ------------------------------------------------------
    // The thing everybody describes first, and it is not film grain: it is a
    // fizz that sits in front of the world rather than in it.
    vec2 gp = uv * res * 0.9;
    float g1 = hash(floor(gp) + floor(time * 24.0) * 13.7) - 0.5;
    float g2 = hash(floor(gp * 0.45) + floor(time * 11.0) * 41.3) - 0.5;
    col += (g1 * 0.62 + g2 * 0.38) * (0.055 + 0.115 * dose);

    // --- the room is not quite the colour it was --------------------------
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float sway = fbm(uv * 1.6 + vec2(time * 0.07, -time * 0.05)) - 0.5;
    col = mix(vec3(lum), col, 1.0 + dose * (0.55 + 0.8 * sway));

    // --- and it closes in -------------------------------------------------
    // It closes in, but you can still see: at 0.76 with a reach of 0.46 the
    // deep rooms came out as a black rectangle with grain on it, which is not
    // a narrowing field of view, it is a fade to black.
    float vig = 0.30 + 0.24 * dose;
    float reach = mix(1.00, 0.62, dose);
    col *= 1.0 - vig * smoothstep(0.06, reach, r2);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

// --- how far in you are ------------------------------------------------------
// Breadth-first over roomGraph from the room you woke up in. Metres are
// meaningless here: a portal can put the far side of the house one step away,
// and that is the point of it.
// A doorway costs one. A fold costs two: you have not walked further, but you
// have been taken further, and the point of the measure is dislocation rather
// than distance. roomGraph knows about doorways only -- portals are not in it,
// which is why the reachability check in test.js adds them by hand -- so this
// adds them here too, or the warehouse would have no depth at all.
const STEP_DOOR = 1, STEP_FOLD = 2;
let _depthOf = null, _deepest = 1;
function roomDepths() {
  if (_depthOf) return _depthOf;
  const d = {}, start = START.space;
  for (const k in SPACES) d[k] = Infinity;
  d[start] = 0;
  const edges = k => {
    const out = [];
    for (const n of (roomGraph[k] || [])) out.push([n, STEP_DOOR]);
    for (const p of PORTALS) {
      if (p.space === k) out.push([p.other.space, STEP_FOLD]);
      else if (p.other.space === k) out.push([p.space, STEP_FOLD]);
    }
    return out;
  };
  // a dozen rooms and two edge weights; relaxing until it settles is plenty
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const k in d) {
      if (d[k] === Infinity) continue;
      for (const [n, w] of edges(k)) if (d[n] > d[k] + w) { d[n] = d[k] + w; moved = true; }
    }
    if (!moved) break;
  }
  _deepest = Math.max(1, ...Object.values(d).filter(v => isFinite(v)));
  _depthOf = d;
  return d;
}

const DOSE_AT_START = 0.16;      // present from the first room, not absent
let dose = DOSE_AT_START;

// Scaled to this house rather than to a fixed number of doors: houses come out
// between nine and thirteen rooms and a fixed scale leaves the deepest room in
// a small one only two thirds of the way there. Wherever the far end of *this*
// building is, that is as bad as it gets.
function doseFor(spaceKey) {
  const all = roomDepths();
  const d = all[spaceKey];
  if (d === undefined || !isFinite(d)) return 1.0;
  return DOSE_AT_START + (1 - DOSE_AT_START) * Math.min(1, d / Math.max(3, _deepest));
}

// eased, so walking through a door does not snap the whole screen
function updateDose(spaceKey, dt) {
  const target = doseFor(spaceKey || START.space);
  dose += (target - dose) * Math.min(1, dt * 0.55);
  return dose;
}

function makeRT(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: true, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
  });
}

function initVision() {
  FX_OFF = QS.has('nofx');
  if (FX_OFF) return;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  sceneRT = makeRT(size.x, size.y);
  accumRT = makeRT(size.x, size.y);
  prevRT = makeRT(size.x, size.y);

  accumMat = new THREE.ShaderMaterial({
    uniforms: {
      world: { value: sceneRT.texture }, prev: { value: prevRT.texture },
      exposure: { value: renderer.toneMappingExposure * 1.06 },
      trail: { value: 0 }
    },
    vertexShader: FX_VERT, fragmentShader: ACCUM_FRAG, depthTest: false, depthWrite: false
  });
  finalMat = new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: accumRT.texture },
      res: { value: new THREE.Vector2(size.x, size.y) },
      time: { value: 0 }, dose: { value: DOSE_AT_START }
    },
    vertexShader: FX_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  fxMesh = new THREE.Mesh(g, accumMat);
  fxMesh.frustumCulled = false;
  fxScene = new THREE.Scene();
  fxScene.add(fxMesh);
  fxCam = new THREE.Camera();
}

function resizeVision() {
  if (!sceneRT) return;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  for (const rt of [sceneRT, accumRT, prevRT]) rt.setSize(size.x, size.y);
  finalMat.uniforms.res.value.set(size.x, size.y);
}

function renderVision(t, dt, spaceKey) {
  if (!sceneRT) { renderer.render(scene, camera); return; }
  const d = updateDose(spaceKey, dt);

  renderer.setRenderTarget(sceneRT);
  renderer.clear();
  renderer.render(scene, camera);

  // world + last frame -> accumulation
  accumMat.uniforms.prev.value = prevRT.texture;
  accumMat.uniforms.trail.value = 0.25 + 0.52 * d;
  fxMesh.material = accumMat;
  renderer.setRenderTarget(accumRT);
  renderer.render(fxScene, fxCam);

  // accumulation -> screen, through however far in you are
  finalMat.uniforms.tex.value = accumRT.texture;
  finalMat.uniforms.time.value = t;
  finalMat.uniforms.dose.value = d;
  fxMesh.material = finalMat;
  renderer.setRenderTarget(null);
  renderer.render(fxScene, fxCam);

  const swap = prevRT; prevRT = accumRT; accumRT = swap;
}
