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
let portalsBuilt = false, portalCam = null;
const PORTAL_RANGE = 14;         // don't render a view you can't make out
// A portal target is sampled in screen space, so what matters is its size
// relative to the actual render, not to the window. Tie it to the pixel ratio
// and the view through a doorway keeps the same sharpness it always had --
// and follows the main render down when the machine is struggling.
const PORTAL_RES = 0.32;
function portalSize() {
  const pr = renderer.getPixelRatio();
  return [Math.max(320, Math.floor(innerWidth * pr * PORTAL_RES)),
          Math.max(200, Math.floor(innerHeight * pr * PORTAL_RES))];
}


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

  const [rtW, rtH] = portalSize();
  portalsBuilt = true;
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
const _pm = new THREE.Matrix4(), _pmInv = new THREE.Matrix4();
function portalMatrix(A) {
  _pmInv.copy(A.anchor.matrixWorld).invert();
  return _pm.copy(A.other.anchor.matrixWorld).multiply(FLIP).multiply(_pmInv);
}

// --- traversal --------------------------------------------------------------

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _traverseM = new THREE.Matrix4();

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
  updateBodyPortals();
}

// --- B1: everything else that can move --------------------------------------
//
// traverse() moves the player and whatever is in their hands. Nothing else
// crossed a portal: a thrown mug went through the doorway into whatever is
// physically behind it, which is usually outside the building, and was never
// seen again. Objects are the instrument players navigate with (PLAN §2), so a
// hole in them exactly where the space folds is a hole in the method.

let bodyTraversals = 0;                 // objects that have come through, for the tests
const _bs = new THREE.Vector3(), _bq = new CANNON.Quaternion();
const _bodyM = new THREE.Matrix4(), _YUP = new THREE.Vector3(0, 1, 0);

function refreshBodySides(body) {
  const s = body._pSide || (body._pSide = []);
  _bs.set(body.position.x, body.position.y, body.position.z);
  for (let i = 0; i < PORTALS.length; i++) s[i] = Math.sign(portalSide(PORTALS[i], _bs)) || 1;
  return s;
}

function traverseBody(p, body) {
  const M = _bodyM.copy(portalMatrix(p));
  const dYaw = p.other.yaw + Math.PI - p.yaw;

  const np = _bs.set(body.position.x, body.position.y, body.position.z).applyMatrix4(M);
  body.position.set(np.x, np.y, np.z);

  const nv = _bs.set(body.velocity.x, 0, body.velocity.z).applyAxisAngle(_YUP, dYaw);
  body.velocity.set(nv.x, body.velocity.y, nv.z);

  const na = _bs.set(body.angularVelocity.x, 0, body.angularVelocity.z).applyAxisAngle(_YUP, dYaw);
  body.angularVelocity.set(na.x, body.angularVelocity.y, na.z);

  // turn the thing itself as well, or a chair arrives through the fold facing
  // a direction it was never facing
  _bq.setFromEuler(0, dYaw, 0);
  body.quaternion.copy(_bq.mult(body.quaternion));

  refreshBodySides(body);
  bodyTraversals++;
  body._pCool = 6;          // frames, so it cannot oscillate at the plane
  body.wakeUp();
}

function updateBodyPortals() {
  if (!PORTALS.length) return;
  for (const { body } of dynamicPairs) {
    if (body === held) continue;              // the player's hands already carry it
    if (body.sleepState === CANNON.Body.SLEEPING) continue;
    if (body._pCool > 0) { body._pCool--; continue; }
    const s = body._pSide || refreshBodySides(body);
    _bs.set(body.position.x, body.position.y, body.position.z);
    for (let i = 0; i < PORTALS.length; i++) {
      const p = PORTALS[i];
      const sign = Math.sign(portalSide(p, _bs)) || 1;
      if (sign === s[i] || !withinFrame(p, _bs)) { s[i] = sign; continue; }
      if (s[i] > 0 && sign <= 0) { traverseBody(p, body); break; }
      s[i] = sign;
    }
  }
}

function traverse(p) {
  const M = _traverseM.copy(portalMatrix(p));
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
    // it came through with the player, so it must not also come through on its
    // own account on the next frame
    refreshBodySides(held);
    held._pCool = 6;
  }

  // everything is now on the far side of both faces
  const cam = new THREE.Vector3(playerBody.position.x, playerBody.position.y + 0.9, playerBody.position.z);
  for (const q of PORTALS) q.side = Math.sign(portalSide(q, cam)) || 1;

  if (typeof Audio !== 'undefined' && Audio.through) Audio.through();
}

// --- rendering ---------------------------------------------------------------

const _frustum = new THREE.Frustum(), _mat4 = new THREE.Matrix4();
const _clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), _clipList = [_clipPlane], _noClip = [];

// Which faces are worth rendering a view through. Split out from the render so
// the room-visibility pass can know which far sides have to be switched on
// before anything is drawn.
const EMPTY = [];
function visiblePortals() {
  if (!PORTALS.length || !renderer) return EMPTY;
  _mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_mat4);
  // nearest first, so that when the budget bites it drops the face that
  // matters least rather than whichever came first out of the generator
  return PORTALS.filter(p =>
    p.pos.distanceTo(camera.position) < PORTAL_RANGE &&
    portalSide(p, camera.position) > -0.2 &&
    _frustum.intersectsObject(p.mesh)
  ).sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position))
   .slice(0, 2);
}

function renderPortals(visible) {
  if (!renderer) return;
  portalsDrawn = visible.length;
  // hide first, and unhide only what gets redrawn below -- on a frame with no
  // portals in view this is the whole job
  for (const q of portalQuads) q.visible = false;
  if (!visible.length) return;

  const prevTarget = renderer.getRenderTarget();
  // a doorway's worth of room, seen from several metres away, does not need
  // real-time shadows -- and this is three quarters of what the pass cost
  const hadShadows = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;

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
    _clipPlane.normal.copy(n);
    _clipPlane.constant = -n.dot(p.other.pos) + 0.02;
    renderer.clippingPlanes = _clipList;

    applyLightPoolAt(portalCam.position);
    renderer.setRenderTarget(p.rt);
    renderer.clear();
    renderer.render(scene, portalCam);
  }

  renderer.shadowMap.enabled = hadShadows;
  renderer.clippingPlanes = _noClip;
  renderer.setRenderTarget(prevTarget);

  // Only the faces that were actually redrawn this frame. A quad samples its
  // render target in screen space, so a quad that is shown without being
  // redrawn is a picture taken from where the camera used to be, stretched
  // across the doorway from where the camera is now -- which reads as the view
  // through the door skewing. It happens whenever a face is skipped: beyond the
  // two-face budget, or with the camera behind its plane, which is what backing
  // out through a doorway does.
  for (const p of visible) p.mesh.visible = true;
}

function resizePortals() {
  if (!portalsBuilt) return;
  const [w, h] = portalSize();
  for (const p of PORTALS) p.rt.setSize(w, h);
}
