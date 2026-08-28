// ---------------------------------------------------------------------------
// The body, the hands, the doors.
// ---------------------------------------------------------------------------

const PHYS = {};
const keys = {};
let playerBody, yaw = 0, pitch = 0;
let held = null, heldDist = 0.85;
let grounded = false, walkPhase = 0, bobAmt = 0, stepAccum = 0;
let lookRay = new THREE.Raycaster();
lookRay.far = 3.0;
let hoverTarget = null;
const lastGood = { x: 0, z: 0 };
let lastGoodSpace = null;

// Are you standing on anything? This used to be `position.y < 0.42`, which is
// another way of saying "is the player on the ground floor" -- true of every
// room in the building until one of them had stairs in it. Off the ground you
// had almost no control authority (0.03 against 0.22) and could not jump, so a
// staircase was unclimbable. The contacts know the answer for any height.
function onSomething() {
  if (playerBody.position.y < 0.42) return true;          // the usual case, free
  for (const c of world.contacts) {
    // ni points from bi to bj; the ground is whichever way is down from you
    if (c.bi === playerBody) { if (c.ni.y < -0.5) return true; }
    else if (c.bj === playerBody) { if (c.ni.y > 0.5) return true; }
  }
  return false;
}

const EYE = 1.28;          // camera height above the body centre
const WALK = 2.15;         // deliberately slow. the slowness is the game.
const RUN = 3.5;

function initPhysics() {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 12;

  PHYS.obj = new CANNON.Material('obj');
  PHYS.player = new CANNON.Material('player');
  PHYS.bouncy = new CANNON.Material('bouncy');
  world.addContactMaterial(new CANNON.ContactMaterial(PHYS.obj, PHYS.obj, { friction: 0.4, restitution: 0.05 }));
  world.addContactMaterial(new CANNON.ContactMaterial(PHYS.player, PHYS.obj, { friction: 0.0, restitution: 0.0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(PHYS.bouncy, PHYS.obj, { friction: 0.3, restitution: 0.55 }));
  world.defaultContactMaterial.friction = 0.4;
}

function initPlayer() {
  const s = SPACES[START.space];
  playerBody = new CANNON.Body({ mass: 78, material: PHYS.player });
  playerBody.addShape(new CANNON.Sphere(0.34));
  playerBody.position.set(s.origin[0] + START.at[0], 0.36, s.origin[1] + START.at[1]);
  playerBody.linearDamping = 0.86;
  playerBody.fixedRotation = true;
  playerBody.updateMassProperties();
  playerBody.allowSleep = false;
  world.addBody(playerBody);
  yaw = START.look;
}

// --- input -----------------------------------------------------------------

function initInput(canvas) {
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyE') tryDoor();
    if (e.code === 'KeyF' && held) throwHeld();
    if (e.code === 'Escape') document.exitPointerLock();
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) { held ? release(false) : tryGrab(); }
    if (e.button === 2) { held ? throwHeld() : tryDoor(); }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (held) heldDist = Math.max(0.55, Math.min(1.7, heldDist + e.deltaY * 0.0012));
  }, { passive: true });

  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0021;
    pitch -= e.movementY * 0.0021;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
  });
}

// --- hands -----------------------------------------------------------------

function bodyRootOf(obj) {
  let o = obj;
  while (o) { if (o.userData && o.userData.body && o.userData.grabbable) return o; o = o.parent; }
  return null;
}

const _rayFrom = new THREE.Vector3(), _rayDir = new THREE.Vector3();
function lookedAt(list) {
  camera.updateMatrixWorld(true);
  lookRay.set(camera.getWorldPosition(_rayFrom), camera.getWorldDirection(_rayDir));
  const hits = lookRay.intersectObjects(list || rayRoots(_rayFrom, lookRay.far), true);
  // grime, decals and portal surfaces are scenery, not things
  for (const h of hits) if (!h.object.userData.noRay) return h;
  return null;
}

function tryGrab() {
  lookRay.far = 2.6;
  const hit = lookedAt(null);
  if (!hit) return;
  const root = bodyRootOf(hit.object);
  if (!root) return;
  held = root.userData.body;
  held.allowSleep = false; held.wakeUp();
  held.angularDamping = 0.85;
  heldDist = Math.min(1.1, Math.max(0.7, hit.distance * 0.8));
  Audio.blip(320, 0.04, 0.06);
}

function release(thrown) {
  if (!held) return;
  held.allowSleep = true; held.angularDamping = 0.2;
  held = null;
  if (!thrown) Audio.blip(190, 0.05, 0.05);
}

function throwHeld() {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const power = 5.5 / Math.max(0.4, Math.sqrt(held.mass));
  held.velocity.set(dir.x * power * 2.2, dir.y * power * 2.2 + 1.0, dir.z * power * 2.2);
  held.angularVelocity.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3));
  Audio.blip(140, 0.09, 0.09);
  release(true);
}

function updateHeld(dt) {
  if (!held) return;
  const cp = camera.getWorldPosition(new THREE.Vector3());
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const target = cp.clone().addScaledVector(dir, heldDist).add(new THREE.Vector3(0, -0.14, 0));
  const p = held.position;
  const v = new THREE.Vector3(target.x - p.x, target.y - p.y, target.z - p.z);
  const d = v.length();
  if (d > 2.8) { release(false); return; }        // it slipped, or something took it
  v.multiplyScalar(11);
  const max = 9;
  if (v.length() > max) v.setLength(max);
  held.velocity.set(v.x, v.y, v.z);
  held.angularVelocity.scale(0.82, held.angularVelocity);
  held.wakeUp();
}

// --- doors -----------------------------------------------------------------

// pos is the HINGE, not the centre of the doorway.
function makeDoor(pos, rotY, w, h, hingeSign) {
  const pivot = new THREE.Group();
  pivot.position.set(pos[0], 0, pos[2]);
  pivot.rotation.y = rotY;
  pivot.userData.baseRot = rotY;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), MAT.wood);
  leaf.position.set(hingeSign * w / 2, h / 2, 0);
  leaf.castShadow = true; leaf.receiveShadow = true;
  // panels
  for (const py of [h * 0.28, h * 0.68]) {
    const pn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h * 0.26, 0.012), MAT.woodLight);
    pn.position.set(hingeSign * w / 2, py, 0.028);
    pivot.add(pn); pn.userData.isDoorPanel = true;
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), MAT.metal);
  knob.position.set(hingeSign * (w - 0.09), h * 0.47, 0.04);
  pivot.add(knob);
  pivot.add(leaf);
  attach(pivot);

  const body = new CANNON.Body({ mass: 0, material: PHYS.obj });
  body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, 0.03)));
  const off = new THREE.Vector3(hingeSign * w / 2, h / 2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  body.position.set(pos[0] + off.x, off.y, pos[2] + off.z);
  body.quaternion.setFromEuler(0, rotY, 0);
  world.addBody(body);

  const door = { pivot, body, open: false, t: 0, dir: hingeSign, inWorld: true, meshes: [], space: buildingSpace, w, h };
  pivot.traverse(o => { if (o.isMesh) { o.userData.door = door; door.meshes.push(o); } });
  doors.push(door);
  return door;
}

function tryDoor() {
  lookRay.far = 2.4;
  const meshes = [];
  doors.forEach(d => meshes.push(...d.meshes));
  const h = lookedAt(meshes);
  if (!h) return;
  const d = h.object.userData.door;
  if (!d) return;
  d.open = !d.open;
  Audio.creak(d.open, [d.pivot.position.x, 1.0, d.pivot.position.z]);
}

function updateDoors(dt) {
  for (const d of doors) {
    const target = d.open ? 1 : 0;
    if (Math.abs(d.t - target) < 0.001) continue;
    d.t += Math.sign(target - d.t) * dt * 0.85;
    d.t = Math.max(0, Math.min(1, d.t));
    d.pivot.rotation.y = d.pivot.userData.baseRot - d.dir * d.t * 1.9;
    // the leaf stops being solid as soon as it starts to move; you can walk through
    if (d.t > 0.02 && d.inWorld) { world.removeBody(d.body); d.inWorld = false; }
    if (d.t <= 0.02 && !d.inWorld) { world.addBody(d.body); d.inWorld = true; }
  }
}

// --- the walk --------------------------------------------------------------

function updatePlayer(dt) {
  const speed = keys['ShiftLeft'] ? RUN : WALK;
  let fx = 0, fz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) fz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) fz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) fx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) fx += 1;
  const len = Math.hypot(fx, fz);
  if (len > 0) { fx /= len; fz /= len; }

  // camera forward is (-sin yaw, 0, -cos yaw); right is (cos yaw, 0, -sin yaw).
  // get this basis wrong and W walks you somewhere other than where you look.
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const wx = fx * cos + fz * sin;
  const wz = -fx * sin + fz * cos;

  grounded = onSomething();
  const k = grounded ? 0.22 : 0.03;
  playerBody.velocity.x += (wx * speed - playerBody.velocity.x) * k;
  playerBody.velocity.z += (wz * speed - playerBody.velocity.z) * k;
  if (keys['Space'] && grounded) { playerBody.velocity.y = 3.4; keys['Space'] = false; }

  // head
  const hspeed = Math.hypot(playerBody.velocity.x, playerBody.velocity.z);
  walkPhase += hspeed * dt * 3.1;
  bobAmt += ((grounded ? Math.min(hspeed / WALK, 1.2) : 0) - bobAmt) * 0.1;
  const bobY = Math.sin(walkPhase * 2) * 0.021 * bobAmt;
  const bobX = Math.sin(walkPhase) * 0.016 * bobAmt;

  camera.position.set(
    playerBody.position.x + bobX * Math.cos(yaw),
    playerBody.position.y + EYE + bobY,
    playerBody.position.z + bobX * Math.sin(yaw)
  );
  camera.rotation.set(0, 0, 0);
  camera.rotateY(yaw);
  camera.rotateX(pitch);
  camera.rotateZ(Math.sin(walkPhase) * 0.006 * bobAmt);
  camera.updateMatrixWorld(true);   // raycasts this frame need the new matrix

  // last resort: if the world ever loses you, put you back where it had you
  if (playerBody.position.y < -3) {
    const s = SPACES[lastGoodSpace || START.space];
    playerBody.position.set(lastGood.x, 0.4, lastGood.z);
    playerBody.velocity.set(0, 0, 0);
    if (typeof initPortalSides === 'function') initPortalSides();
  } else if (grounded && Math.abs(playerBody.position.y - 0.34) < 0.2) {
    lastGood.x = playerBody.position.x; lastGood.z = playerBody.position.z;
  }

  // footsteps
  stepAccum += hspeed * dt;
  if (grounded && stepAccum > 0.78) { stepAccum = 0; Audio.step(); }
}

// What the crosshair is currently over. This is a raycast, and the answer is a
// single word on the HUD, so it does not need doing sixty times a second.
let hoverTick = 0;
function updateHover() {
  if (held) { hoverTarget = 'held'; return; }
  if (hoverTick++ % 3) return;
  lookRay.far = 2.6;
  const hit = lookedAt(null);
  if (!hit) { hoverTarget = null; return; }
  if (hit.object.userData.door || (hit.object.parent && hit.object.parent.userData && hit.object.parent.userData.door)) { hoverTarget = 'door'; return; }
  hoverTarget = bodyRootOf(hit.object) ? 'grab' : null;
}
