// ---------------------------------------------------------------------------
// THE TAPE.
//
// Everything you see is footage. A camera strapped to somebody's head, on tape,
// and not good tape: a wide lens that bends the walls, scan lines, chroma that
// does not sit quite on top of the luma, interference that comes and goes, and
// the head-switching bar rolling up the frame every few seconds.
//
// This is one full-screen pass. The scene is drawn into a target instead of
// onto the canvas, and then this draws the target onto the canvas through the
// lens and the tape. Rendering to a target means three does not tone-map for
// us -- off-screen passes stay linear -- so the pass has to finish that job
// itself, exactly as the portal shader does, and it does it *first*: the
// artefacts belong to the camera and the tape, so they go on the picture after
// it has been developed, not before.
//
// ?novhs=1 turns the whole thing off, which is how the screenshot A/B compares
// what was actually rendered rather than what the tape did to it.
// ---------------------------------------------------------------------------

// QS lives in 40-main.js, which is concatenated after this file, so it cannot
// be read at the top level here -- only from inside a function, by which time
// everything has run.
let VHS_OFF = false;

let videoRT = null, videoScene = null, videoCam = null, videoMat = null;

const VIDEO_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const VIDEO_FRAG = `
  precision highp float;
  uniform sampler2D tex;
  uniform vec2  res;
  uniform float time;
  uniform float exposure;
  uniform float burstAmt;   // worked out on the CPU, see burstAt()
  uniform float barPos;     // where the head-switching bar is, 0..1 down the frame
  uniform float barHalf;    // and how deep it is, as a fraction of frame height
  varying vec2 vUv;

  // ACES, the same fit the portals use, because this pass is now the only
  // thing that tone-maps and the two have to agree
  vec3 rrt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 tonemap(vec3 c) {
    const mat3 IN  = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    c = clamp(OUT * rrt(IN * c), 0.0, 1.0);
    return pow(c, vec3(0.4545));
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise1(float x) { float i = floor(x); float f = fract(x);
    return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f)); }

  vec3 sampleTape(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
    return tonemap(texture2D(tex, uv).rgb * exposure);
  }

  void main() {
    vec2 uv = vUv;

    // --- the lens ---------------------------------------------------------
    // a wide one, bending the walls out at the corners the way a helmet camera
    // does. Chroma is pulled apart with the same distortion, harder on red.
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    float k = 0.13;
    // and scaled back in by exactly as much as the corners were pushed out, or
    // the frame is barrel-distorted into a black border
    vec2 lens = c * (1.0 + k * r2 + k * 0.55 * r2 * r2) * 0.918;

    // --- the tape ---------------------------------------------------------
    // The head-switching bar: a band a few scan lines deep that rolls up the
    // frame, dragging the picture sideways as it passes. Every few seconds,
    // not every frame, or it stops reading as a fault and starts reading as a
    // pattern.
    // Cyclic distance from the bar, 0 on it and 0.5 at the far side of the
    // frame. Written this way round on purpose: the first version was a
    // smoothstep with its edges swapped, so it came out as 1 across almost the
    // whole picture and 0 only in the band -- which dragged every scan line
    // sideways at 40Hz, all the time, and made the game unplayable. Its
    // position and its depth come in as numbers so that they can be checked,
    // rather than being a shape somebody has to squint at.
    float dy = abs(fract(lens.y + 0.5 - barPos + 0.5) - 0.5);
    float bar = 1.0 - smoothstep(0.0, barHalf, dy);
    float tear = bar * (noise1(time * 40.0) - 0.5) * 0.045;

    // Nothing moves the picture sideways except the bar and a burst. A tape
    // that is always drifting reads as a camera being shaken, and you cannot
    // aim at anything through it.
    float wob = 0.0;

    // Interference proper. Rare, and when it comes it is violent and quick --
    // a slow selector decides *whether*, a very fast one decides *what*, so a
    // burst is a fraction of a second of static rather than a permanent
    // shimmer. This is the difference between a broken tape and a bad filter.
    float burst = burstAmt;

    // per scan line, redrawn 240 times a second: at that rate the eye reads it
    // as static rather than as movement
    float lineJ = (hash(vec2(floor((lens.y + 0.5) * res.y * 0.5), floor(time * 240.0))) - 0.5);
    // and the whole frame snatches sideways with it
    float snatch = (noise1(time * 170.0) - 0.5);
    float slip = burst * (lineJ * 0.052 + snatch * 0.018);

    // the odd single line thrown right out, which only ever happens mid-burst
    float dropout = step(0.994, hash(vec2(floor((lens.y + 0.5) * res.y * 0.5), floor(time * 240.0) + 7.0)));
    slip += burst * dropout * (hash(vec2(floor(time * 240.0), 3.0)) - 0.5) * 0.16;

    vec2 off = vec2(tear + wob + slip, 0.0);

    // --- chroma, pulled apart --------------------------------------------
    vec2 base = lens + 0.5 + off;
    float rr = sampleTape(base + lens * 0.0042).r;
    vec3  gg = sampleTape(base);
    float bb = sampleTape(base - lens * 0.0030).b;
    vec3 col = vec3(rr, gg.g, bb);

    // luma smear to the right, which is what makes it read as tape and not as
    // a filter: chroma bandwidth on VHS is a fraction of luma's
    col = mix(col, sampleTape(base - vec2(2.2 / res.x, 0.0)), 0.16);

    // --- scan lines and shadow mask ---------------------------------------
    float sl = 0.5 + 0.5 * sin((lens.y + 0.5) * res.y * 3.14159);
    col *= 1.0 - 0.13 * sl;
    col *= 1.0 - 0.05 * (0.5 + 0.5 * sin((lens.x + 0.5) * res.x * 3.14159 * 0.5));

    // --- noise, and the bar itself ----------------------------------------
    float grain = hash(uv * res + fract(time) * 91.7) - 0.5;
    col += grain * (0.115 + 0.24 * burst);
    // a second, coarser grain -- tape noise is not one grain size
    float grain2 = hash(floor(uv * res * 0.5) + fract(time * 1.7) * 53.3) - 0.5;
    col += grain2 * (0.05 + 0.16 * burst);
    col += bar * 0.055;
    col += burst * 0.045;                                  // static lifts the black

    // --- the tube ----------------------------------------------------------
    col *= 1.0 - 0.62 * smoothstep(0.30, 0.95, r2);      // vignette, heavy but not a tunnel
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 0.86);   // tape desaturates
    col = clamp(col * 1.03 - 0.008, 0.0, 1.0);

    // outside the lens there is no tape at all
    float inside = step(0.0, base.x) * step(base.x, 1.0) * step(0.0, base.y) * step(base.y, 1.0);
    gl_FragColor = vec4(col * inside, 1.0);
  }`;

// How hard the tape is breaking up, right now.
//
// This is worked out here rather than in the shader because it has to be
// *rare*, and rare is the one thing hash-and-smoothstep noise is bad at: you
// end up either with a permanent shimmer or, if you push the threshold up to
// stop that, with nothing at all for minutes. Here it is simply stated: a
// window every few seconds, most of them empty, and when one is not empty it
// lasts a couple of hundred milliseconds and is violent.
// The head-switching bar: a couple of scan lines deep, rolling up the frame
// about once every eight seconds.
const BAR_HALF = 0.028;           // fraction of the frame height, each side
const BAR_SPEED = 0.13;           // frames per second, so ~7.7s to cross
function barAt(t) { const p = (t * BAR_SPEED) % 1; return p < 0 ? p + 1 : p; }

const BURST_EVERY = 6.5;          // seconds between chances of one
const BURST_ODDS = 0.45;          // how many of those chances come to anything
function bhash(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }
function burstAt(t) {
  const i = Math.floor(t / BURST_EVERY);
  const pick = bhash(i);
  if (pick > BURST_ODDS) return 0;
  const dur = 0.09 + bhash(i + 101) * 0.20;
  const at = bhash(i + 57) * (BURST_EVERY - dur - 0.2);
  const u = (t - i * BURST_EVERY - at) / dur;
  if (u < 0 || u > 1) return 0;
  return Math.pow(Math.sin(u * Math.PI), 0.55);   // on hard, off hard
}

function initVideo() {
  VHS_OFF = QS.has('novhs');
  if (VHS_OFF) return;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  videoRT = new THREE.WebGLRenderTarget(size.x, size.y, {
    depthBuffer: true, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
  });
  videoMat = new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: videoRT.texture },
      res: { value: new THREE.Vector2(size.x, size.y) },
      time: { value: 0 },
      // the tape costs about a third of a stop between the scan lines, the
      // vignette and the desaturation; give it back before any of that happens
      exposure: { value: renderer.toneMappingExposure * 1.28 },
      burstAmt: { value: 0 },
      barPos: { value: 0 },
      barHalf: { value: BAR_HALF }
    },
    vertexShader: VIDEO_VERT, fragmentShader: VIDEO_FRAG,
    depthTest: false, depthWrite: false
  });
  // one triangle covering the screen; a quad has a seam down the diagonal on
  // some drivers and there is no reason to give it one
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mesh = new THREE.Mesh(g, videoMat);
  mesh.frustumCulled = false;
  videoScene = new THREE.Scene();
  videoScene.add(mesh);
  videoCam = new THREE.Camera();
}

function resizeVideo() {
  if (!videoRT) return;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  videoRT.setSize(size.x, size.y);
  videoMat.uniforms.res.value.set(size.x, size.y);
}

// Draw the world into the target, then the target onto the canvas through the
// lens and the tape. With ?novhs=1 this is an ordinary render straight to the
// canvas, tone-mapped by three in the usual way.
function renderVideo(t) {
  if (!videoRT) { renderer.render(scene, camera); return; }
  videoMat.uniforms.time.value = t;
  videoMat.uniforms.burstAmt.value = burstAt(t);
  videoMat.uniforms.barPos.value = barAt(t);
  renderer.setRenderTarget(videoRT);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(videoScene, videoCam);
}
