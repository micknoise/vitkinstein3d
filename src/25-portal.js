// ---------------------------------------------------------------------------
// PORTALS — the non-euclidean part.
//
// A portal is a pair of doorways that are the same doorway. Each face renders
// the view out of its twin into a texture, mapped back onto the opening in
// screen space, so you SEE the other place through it rather than being
// swallowed by a black rectangle. Walk through and you are moved by the
// transform that takes one frame to the other, turned to match, with your
// speed and whatever you are carrying.
//
// This is what lets a room be bigger than the building, or be in two places,
// or be behind a door in itself. The generator can put the far side anywhere
// at all, including exactly where you are standing, because the two are never
// connected in world space.
// ---------------------------------------------------------------------------

const PORTALS = [];              // faces, two per link
let portalQuads = [];
let portalRT = null, portalCam = null;
const PORTAL_RANGE = 14;         // don't render a view you can't make out

const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

const PORTAL_VERT = `
  varying vec4 vScreen;
  void main() {
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vScreen = p;
    gl_Position = p;
  }`;

// The render target holds linear values with no tone mapping (three skips it
// for off-screen passes), so the portal has to finish the job itself or the
// view through it comes out flat and bright compared with the room around it.
const PORTAL_FRAG = `
  uniform sampler2D tex;
  uniform float exposure;
  varying vec4 vScreen;
  vec3 rrt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  void main() {
    vec2 uv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;
    vec3 c = texture2D(tex, uv).rgb * exposure;
    const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    c = clamp(OUT * rrt(IN * c), 0.0, 1.0);
    gl_FragColor = vec4(pow(c, vec3(0.4545)), 1.0);
  }`;

// Where a portal face sits, given the space it is cut into.
function portalFrame(spaceKey, wall, at, w, h) {
  const def = SPACES[spaceKey];
  const [W, H, D] = def.size, [ox, oz] = def.origin;
  let pos, yaw;
  if (wall === 'north') { pos = [ox + at, h / 2, oz - D / 2 + WALL_T / 2]; yaw = 0; }
  else if (wall === 'south') { pos = [ox + at, h / 2, oz + D / 2 - WALL_T / 2]; yaw = Math.PI; }
  else if (wall === 'west') { pos = [ox - W / 2 + WALL_T / 2, h / 2, oz + at]; yaw = Math.PI / 2; }
  else { pos = [ox + W / 2 - WALL_T / 2, h / 2, oz + at]; yaw = -Math.PI / 2; }
  return { pos, yaw, w, h, space: spaceKey };
}

function buildPortals() {
  if (!PORTAL_LINKS.length) return;

  const rtW = Math.max(320, Math.floor(innerWidth * 0.55));
  const rtH = Math.max(200, Math.floor(innerHeight * 0.55));
  portalRT = new THREE.WebGLRenderTarget(rtW, rtH, { depthBuffer: true, stencilBuffer: false });
  portalCam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);

  for (const link of PORTAL_LINKS) {
    const fa = portalFrame(link.a.space, link.a.wall, link.a.at, link.a.w, link.a.h);
    const fb = portalFrame(link.b.space, link.b.wall, link.b.at, link.b.w, link.b.h);
    const A = makeFace(fa), B = makeFace(fb);
    A.other = B; B.other = A;
    PORTALS.push(A, B);
  }
  // each face needs its own target so two can be on screen at once
  for (const p of PORTALS) {
    p.rt = new THREE.WebGLRenderTarget(rtW, rtH, { depthBuffer: true, stencilBuffer: false });
    p.mesh.material.uniforms.tex.value = p.rt.texture;
  }
}

function makeFace(f) {
  const anchor = new THREE.Object3D();
  anchor.position.set(f.pos[0], f.pos[1], f.pos[2]);
  anchor.rotation.y = f.yaw;               // +z of the anchor points into the room
  anchor.updateMatrixWorld(true);
  scene.add(anchor);

  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, exposure: { value: 1.15 / 0.6 } },
    vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(f.w - 0.05, f.h - 0.04), mat);
  mesh.position.set(f.pos[0], f.pos[1] , f.pos[2]);
  mesh.rotation.y = f.yaw;
  mesh.userData.noRay = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  portalQuads.push(mesh);

  return {
    anchor, mesh, w: f.w, h: f.h, space: f.space,
    pos: new THREE.Vector3(f.pos[0], f.pos[1], f.pos[2]),
    yaw: f.yaw,
    normal: new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw),
    side: 0, other: null
  };
}

// world transform that takes something standing in front of A to standing
// in front of B, facing away from it
function portalMatrix(A) {
  const m = new THREE.Matrix4();
  m.copy(A.other.anchor.matrixWorld).multiply(FLIP).multiply(new THREE.Matrix4().copy(A.anchor.matrixWorld).invert());
  return m;
}

// --- traversal --------------------------------------------------------------

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

function portalSide(p, v) { return _v.copy(v).sub(p.pos).dot(p.normal); }

function withinFrame(p, v) {
  _v2.copy(v).sub(p.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), -p.yaw);
  return Math.abs(_v2.x) < p.w / 2 + 0.15 && Math.abs(_v2.y) < p.h / 2 + 0.35;
}

function initPortalSides() {
  const pos = new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z);
  for (const p of PORTALS) p.side = Math.sign(portalSide(p, pos)) || 1;
}

function updatePortals() {
  if (!PORTALS.length) return;
  const pos = _v2.set(playerBody.position.x, playerBody.position.y + 0.9, playerBody.position.z);
  for (const p of PORTALS) {
    const s = portalSide(p, pos);
    const sign = Math.sign(s) || 1;
    if (sign === p.side || !withinFrame(p, pos)) { p.side = sign; continue; }
    if (p.side > 0 && sign <= 0) traverse(p);
    p.side = sign;
  }
}

function traverse(p) {
  const M = portalMatrix(p);
  const dYaw = p.other.yaw + Math.PI - p.yaw;

  const np = new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z).applyMatrix4(M);
  playerBody.position.set(np.x, np.y, np.z);

  const nv = new THREE.Vector3(playerBody.velocity.x, 0, playerBody.velocity.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), dYaw);
  playerBody.velocity.set(nv.x, playerBody.velocity.y, nv.z);

  yaw += dYaw;

  if (held) {
    const hp = new THREE.Vector3(held.position.x, held.position.y, held.position.z).applyMatrix4(M);
    held.position.set(hp.x, hp.y, hp.z);
    const hv = new THREE.Vector3(held.velocity.x, 0, held.velocity.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), dYaw);
    held.velocity.set(hv.x, held.velocity.y, hv.z);
  }

  // everything is now on the far side of both faces
  const cam = new THREE.Vector3(playerBody.position.x, playerBody.position.y + 0.9, playerBody.position.z);
  for (const q of PORTALS) q.side = Math.sign(portalSide(q, cam)) || 1;

  if (typeof Audio !== 'undefined' && Audio.through) Audio.through();
}

// --- rendering ---------------------------------------------------------------

const _frustum = new THREE.Frustum(), _mat4 = new THREE.Matrix4();

function renderPortals() {
  if (!PORTALS.length || !renderer) return;
  _mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_mat4);

  const visible = PORTALS.filter(p =>
    p.pos.distanceTo(camera.position) < PORTAL_RANGE &&
    portalSide(p, camera.position) > -0.2 &&
    _frustum.intersectsObject(p.mesh)
  ).slice(0, 2);

  if (!visible.length) return;

  for (const q of portalQuads) q.visible = false;
  const prevTarget = renderer.getRenderTarget();

  for (const p of visible) {
    const M = portalMatrix(p);
    portalCam.aspect = camera.aspect;
    portalCam.fov = camera.fov;
    portalCam.updateProjectionMatrix();
    portalCam.matrixWorld.copy(M).multiply(camera.matrixWorld);
    portalCam.matrixWorld.decompose(portalCam.position, portalCam.quaternion, _v.set(1, 1, 1));
    portalCam.scale.set(1, 1, 1);
    portalCam.updateMatrixWorld(true);

    // clip away everything behind the far doorway, or you see the back of the
    // wall it is cut into
    const n = p.other.normal;
    const plane = new THREE.Plane(n.clone(), -n.dot(p.other.pos) + 0.02);
    renderer.clippingPlanes = [plane];

    cullLights(portalCam.position);
    renderer.setRenderTarget(p.rt);
    renderer.clear();
    renderer.render(scene, portalCam);
  }

  renderer.clippingPlanes = [];
  renderer.setRenderTarget(prevTarget);
  for (const q of portalQuads) q.visible = true;
  for (const p of PORTALS) p.mesh.visible = visible.includes(p) || true;
}

function resizePortals() {
  if (!portalRT) return;
  const w = Math.max(320, Math.floor(innerWidth * 0.55)), h = Math.max(200, Math.floor(innerHeight * 0.55));
  for (const p of PORTALS) p.rt.setSize(w, h);
}
