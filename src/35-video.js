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
    float roll = fract(time * 0.13);
    float bar = smoothstep(0.055, 0.0, abs(fract(lens.y + 0.5 - roll) - 0.5) - 0.44);
    float tear = bar * (noise1(time * 40.0) - 0.5) * 0.045;

    // wobble: the tape never runs at quite the right speed
    float wob = (noise1(time * 2.3) - 0.5) * 0.0022
              + sin((lens.y + 0.5) * 90.0 + time * 5.0) * 0.0006;

    // interference: bursts of torn scan lines that come and go
    float burst = smoothstep(0.72, 0.98, noise1(time * 0.7));
    float lineJ = (hash(vec2(floor((lens.y + 0.5) * res.y * 0.5), floor(time * 30.0))) - 0.5);
    float slip = burst * lineJ * 0.03;

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
    col += grain * (0.055 + 0.09 * burst);
    col += bar * 0.055;

    // --- the tube ----------------------------------------------------------
    col *= 1.0 - 0.62 * smoothstep(0.30, 0.95, r2);      // vignette, heavy but not a tunnel
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 0.86);   // tape desaturates
    col = clamp(col * 1.03 - 0.008, 0.0, 1.0);

    // outside the lens there is no tape at all
    float inside = step(0.0, base.x) * step(base.x, 1.0) * step(0.0, base.y) * step(base.y, 1.0);
    gl_FragColor = vec4(col * inside, 1.0);
  }`;

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
      exposure: { value: renderer.toneMappingExposure * 1.28 }
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
  renderer.setRenderTarget(videoRT);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(videoScene, videoCam);
}
