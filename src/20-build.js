// ---------------------------------------------------------------------------
// Builders. Turns SPACES into geometry + rigid bodies.
// ---------------------------------------------------------------------------

let scene, world, camera, renderer;
const dynamicPairs = [];   // {mesh, body} kept in sync every frame
const grabbables = [];     // meshes you can pick up
const doors = [];          // {pivot, body, open, t, ...}
const flickerers = [];     // lights with a nervous disposition
const spaceBounds = [];    // {key, min:[x,z], max:[x,z], fog, group}
// LIGHTING.
//
// Forward rendering shades every visible light per fragment, and -- worse --
// three.js bakes the *number* of lights into the shader program. Switching
// lights on and off by distance therefore changes the program every time you
// walk through a door, and every new count is a fresh batch of shader
// compilations mid-play. That was the stutter.
//
// So the scene contains a fixed pool of point lights that are never added,
// removed or hidden. The generated lights are kept as plain descriptions, and
// each frame the few that actually contribute anything where the camera is get
// copied into the pool. One light count, one set of programs, forever, and a
// hard ceiling on what a pixel can cost.
const allLights = [];            // descriptions: {pos, color, intensity, distance, decay}
const LIGHT_POOL = [];           // the real THREE.PointLights, always visible
const POOL_SIZE = 12;            // measured: the busiest room in the worst seed has
                                 // eighteen lights in range, and losing the weakest six
                                 // of those is not visible. Eight was, badly.
const SHADOW_SLOTS = 2;          // the two brightest slots cast; see 40-main.js
const _spillAt = new Set();      // one spill per doorway, not one per side

// Shadow maps are no longer regenerated every render. A point light's shadow is
// six full renders of the scene, and three of those was happening per frame --
// once for the view and once for each portal. Now they are redrawn only when
// something that casts one has actually moved.
let shadowsDirty = true;

let buildingSpace = null;      // which room addLight/hangDoor are being called for

function addLight(p, color, intensity, distance, decay) {
  const src = {
    space: buildingSpace,
    pos: new THREE.Vector3(p[0], p[1], p[2]),
    color: new THREE.Color(color),
    intensity,
    distance: distance || 10, decay: decay === undefined ? 2 : decay
  };
  allLights.push(src);
  return src;
}

function initLightPool() {
  for (let i = 0; i < POOL_SIZE; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.castShadow = i < SHADOW_SLOTS;
    if (l.castShadow) {
      l.shadow.mapSize.set(512, 512);
      l.shadow.bias = -0.004;
    }
    scene.add(l);
    LIGHT_POOL.push(l);
  }
}

const WALL_T = 0.14;

// Every room owns a Group, and everything built for that room goes in it. The
// group never moves -- it sits at the origin and its contents stay in world
// space -- so it is purely a switch. Turning a room off costs one boolean and
// takes its several hundred draw calls, its shadow casters and its matrix
// updates out of the frame with it.
const roomGroups = {};
let addTo = null;
function attach(o) { (addTo || scene).add(o); return o; }

// Texel density per metre. Tiles are 1024 and drawn at ~4m of detail, so these
// are half what they were when the tiles were 512.
const MATDENS = {
  wallpaper: 0.3, carpet: 0.36, plaster: 0.25, concrete: 0.16, concreteWall: 0.16,
  tile: 0.5, green: 0.3, cream: 0.34, blue: 0.3, wood: 1.1, woodLight: 1.1
};
const matCache = new Map();
function scaledMat(name, u, v) {
  const base = MAT[name];
  if (!base || !base.map) return base || MAT.plaster;
  const d = MATDENS[name] || 0.3;
  const ru = Math.max(0.25, Math.round(u * d * 4) / 4);
  const rv = Math.max(0.25, Math.round(v * d * 4) / 4);
  const key = name + '|' + ru + '|' + rv;
  if (matCache.has(key)) return matCache.get(key);
  const m = base.clone();
  m.map = base.map.clone(); m.map.repeat.set(ru, rv); m.map.needsUpdate = true;
  if (base.normalMap) { m.normalMap = base.normalMap.clone(); m.normalMap.repeat.set(ru, rv); m.normalMap.needsUpdate = true; }
  matCache.set(key, m);
  return m;
}

// --- primitives ------------------------------------------------------------

const rnd = (a, b) => rr(a, b);
const pick = arr => rpick(arr);

function register(obj3d, body, mass) {
  obj3d.userData.body = body;
  body.threeObj = obj3d;
  if (mass > 0) { dynamicPairs.push({ mesh: obj3d, body }); grabbables.push(obj3d); obj3d.userData.grabbable = true; }
}

// Shifting the UVs of each wall segment stops neighbouring pieces of the same
// wall lining their tiles up, which is half of what makes tiling visible.
function jitterUV(geo) {
  const uv = geo.attributes.uv;
  const ox = R(), oy = R();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ox, uv.getY(i) + oy);
  uv.needsUpdate = true;
  return geo;
}

function mkBox(w, h, d, mat, pos, rotY, mass, opts) {
  opts = opts || {};
  let geo = new THREE.BoxGeometry(w, h, d);
  if (opts.jitter) jitterUV(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.y = rotY || 0;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = true;
  attach(mesh);
  if (opts.noPhysics) return { mesh };
  const body = new CANNON.Body({ mass: mass || 0, material: PHYS.obj });
  body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
  body.position.set(pos[0], pos[1], pos[2]);
  body.quaternion.setFromEuler(0, rotY || 0, 0);
  body.linearDamping = 0.02; body.angularDamping = 0.12;
  body.allowSleep = true; body.sleepSpeedLimit = 0.12; body.sleepTimeLimit = 0.6;
  world.addBody(body);
  register(mesh, body, mass);
  return { mesh, body };
}

function mkCyl(rt, rb, h, seg, mat, pos, mass, opts) {
  opts = opts || {};
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  attach(mesh);
  if (opts.noPhysics) return { mesh };
  const body = new CANNON.Body({ mass: mass || 0, material: PHYS.obj });
  body.addShape(new CANNON.Cylinder(rt, rb, h, Math.min(seg, 10)));
  body.position.set(pos[0], pos[1], pos[2]);
  body.linearDamping = 0.02; body.angularDamping = 0.15;
  body.allowSleep = true; body.sleepSpeedLimit = 0.12; body.sleepTimeLimit = 0.6;
  world.addBody(body);
  register(mesh, body, mass);
  return { mesh, body };
}

function mkCompound(parts, pos, rotY, mass) {
  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.y = rotY || 0;
  const body = new CANNON.Body({ mass: mass || 0, material: PHYS.obj });
  for (const p of parts) {
    let geo;
    if (p.box) geo = new THREE.BoxGeometry(p.box[0], p.box[1], p.box[2]);
    else geo = new THREE.CylinderGeometry(p.cyl[0], p.cyl[1], p.cyl[2], p.cyl[3] || 12);
    const m = new THREE.Mesh(geo, p.mat);
    m.position.set(p.at[0], p.at[1], p.at[2]);
    if (p.rot) m.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (p.phys === false) continue;
    let shape;
    if (p.box) shape = new CANNON.Box(new CANNON.Vec3(p.box[0] / 2, p.box[1] / 2, p.box[2] / 2));
    else shape = new CANNON.Cylinder(p.cyl[0], p.cyl[1], p.cyl[2], Math.min(p.cyl[3] || 8, 8));
    const q = new CANNON.Quaternion();
    if (p.rot) q.setFromEuler(p.rot[0], p.rot[1], p.rot[2]);
    body.addShape(shape, new CANNON.Vec3(p.at[0], p.at[1], p.at[2]), q);
  }
  attach(group);
  body.position.set(pos[0], pos[1], pos[2]);
  body.quaternion.setFromEuler(0, rotY || 0, 0);
  body.linearDamping = 0.03; body.angularDamping = 0.2;
  body.allowSleep = true; body.sleepSpeedLimit = 0.14; body.sleepTimeLimit = 0.6;
  world.addBody(body);
  register(group, body, mass);
  return { mesh: group, body };
}

// A flat quad stuck on a wall: grime layers, mould, posters, splats.
function mkPlane(w, h, mat, pos, rotY, rotZ) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(0, rotY || 0, rotZ || 0);
  m.receiveShadow = false; m.castShadow = false;
  attach(m);
  return m;
}

// which way a wall faces into its room, and how far to stand off it
const FACE = {
  north: { rot: 0, n: [0, 0, 1] },
  south: { rot: Math.PI, n: [0, 0, -1] },
  west:  { rot: Math.PI / 2, n: [1, 0, 0] },
  east:  { rot: -Math.PI / 2, n: [-1, 0, 0] }
};

// --- space shell -----------------------------------------------------------

function buildWall(def, side, matName) {
  const [W, H, D] = def.size;
  const [ox, oz] = def.origin;
  const holes = (def.openings || []).filter(o => o.wall === side);
  const along = (side === 'north' || side === 'south') ? W : D;
  const segs = [];
  const sorted = holes.slice().sort((a, b) => a.at - b.at);
  let cursor = -along / 2;
  for (const h of sorted) {
    const l = h.at - h.w / 2, r = h.at + h.w / 2;
    if (l > cursor) segs.push({ a: cursor, b: l, y0: 0, y1: H });
    segs.push({ a: l, b: r, y0: h.h, y1: H });     // lintel over the opening
    // Every opening in this building used to run from the floor up. A window
    // does not: it needs wall under it too, which is the whole reason E2 is
    // more than a hole in a wall.
    if (h.sill > 0) segs.push({ a: l, b: r, y0: 0, y1: h.sill });
    cursor = r;
  }
  if (cursor < along / 2) segs.push({ a: cursor, b: along / 2, y0: 0, y1: H });

  const face = FACE[side];
  for (const s of segs) {
    const len = s.b - s.a; if (len <= 0.001) continue;
    const hgt = s.y1 - s.y0; if (hgt <= 0.001) continue;
    const mid = (s.a + s.b) / 2, ymid = (s.y0 + s.y1) / 2;
    let pos, w, d;
    if (side === 'north') { pos = [ox + mid, ymid, oz - D / 2 + WALL_T / 2]; w = len; d = WALL_T; }
    else if (side === 'south') { pos = [ox + mid, ymid, oz + D / 2 - WALL_T / 2]; w = len; d = WALL_T; }
    else if (side === 'west') { pos = [ox - W / 2 + WALL_T / 2, ymid, oz + mid]; w = WALL_T; d = len; }
    else { pos = [ox + W / 2 - WALL_T / 2, ymid, oz + mid]; w = WALL_T; d = len; }
    // walls still cast: they are what keeps one room's lamp out of the next.
    // the trim and linings stuck to them do not -- see buildTrim, buildLining.
    mkBox(w, hgt, d, scaledMat(matName, along, H), pos, 0, 0, { cast: true, jitter: true });

    // the anti-tiling layer: one big non-repeating smear per segment
    const gp = [pos[0] + face.n[0] * (WALL_T / 2 + 0.008), ymid, pos[2] + face.n[2] * (WALL_T / 2 + 0.008)];
    const gm = rpick(DECAL.grime);
    const gpl = mkPlane(len * 1.02, hgt * 1.02, gm, gp, face.rot);
    gpl.userData.noRay = true;
  }

  for (const h of holes) if (h.window) buildWindow(def, side, h);

  buildLining(def, side, holes);
  buildTrim(def, side, holes, matName);
}

// A window, and what is outside it.
//
// What is outside it is nothing. Not a courtyard, not a street, not a view --
// the house stops at the glass. That is done with a closed box hung outside the
// opening, unlit and the colour of the fog, so there is no surface to read as a
// surface and no far wall to judge a distance against: you look out and there
// is no out. It also seals the view, which matters, because otherwise you would
// see the backs of the other rooms floating in the dark and the answer to the
// question would be "a lot of boxes".
//
// The glass is real geometry with a rigid body, so nothing can be thrown into
// the nothing and lost, and the wall under the sill keeps you in.
function buildWindow(def, side, h) {
  const [W, H, D] = def.size, [ox, oz] = def.origin;
  const face = FACE[side];
  const y0 = h.sill || 0, hh = h.h - y0, ymid = y0 + hh / 2;

  let cx, cz;
  if (side === 'north') { cx = ox + h.at; cz = oz - D / 2 + WALL_T / 2; }
  else if (side === 'south') { cx = ox + h.at; cz = oz + D / 2 - WALL_T / 2; }
  else if (side === 'west') { cx = ox - W / 2 + WALL_T / 2; cz = oz + h.at; }
  else { cx = ox + W / 2 - WALL_T / 2; cz = oz + h.at; }

  // the pane: thin, solid, and see-through
  const gw = (side === 'east' || side === 'west') ? 0.03 : h.w - 0.06;
  const gd = (side === 'east' || side === 'west') ? h.w - 0.06 : 0.03;
  mkBox(gw, hh - 0.06, gd, MAT.glass, [cx, ymid, cz], 0, 0, { cast: false });

  // and the nothing. Big enough that its corners are never in shot, small
  // enough to sit in the gap the generator checked was empty.
  // sized to the gap the generator actually checked was empty (5.0m), not to
  // whatever looks generous -- a box of nothing sticking through the room next
  // door would be visible from inside it
  const VOID = 4.2;
  // FACE[side].n points *into* the room, and the nothing goes the other way
  const vp = [cx - face.n[0] * (VOID / 2 + 0.3), ymid, cz - face.n[2] * (VOID / 2 + 0.3)];
  const box = new THREE.Mesh(new THREE.BoxGeometry(VOID, VOID, VOID), MAT.nothing);
  box.position.set(vp[0], vp[1], vp[2]);
  box.userData.noRay = true;          // you cannot look at nothing, or take it
  box.castShadow = false; box.receiveShadow = false;
  attach(box);
}

// Line every opening. Without a lining the soffit is a downward-facing face no
// lamp can reach, and a doorway reads as a black hole in the wall.
function buildLining(def, side, holes) {
  const [W, H, D] = def.size, [ox, oz] = def.origin;
  const lin = MAT[def.lining || 'woodLight'];
  for (const h of holes) {
    if (h.blocked) continue;
    const t = 0.035, dz = WALL_T;
    const place = (w, hh, d, p) => mkBox(w, hh, d, lin, p, 0, 0, { noPhysics: true, cast: false });
    const y0 = h.sill || 0, hh = h.h - y0, ymid = y0 + hh / 2;
    if (side === 'north' || side === 'south') {
      const z = side === 'north' ? oz - D / 2 + WALL_T / 2 : oz + D / 2 - WALL_T / 2;
      place(h.w, t, dz, [ox + h.at, h.h - t / 2, z]);
      place(t, hh, dz, [ox + h.at - h.w / 2 + t / 2, ymid, z]);
      place(t, hh, dz, [ox + h.at + h.w / 2 - t / 2, ymid, z]);
      if (y0 > 0) place(h.w + 0.1, 0.05, dz + 0.05, [ox + h.at, y0 + 0.02, z]);   // the sill
      const az = side === 'north' ? z + WALL_T / 2 + 0.012 : z - WALL_T / 2 - 0.012;
      place(h.w + 0.18, 0.09, 0.025, [ox + h.at, h.h + 0.04, az]);
      place(0.09, hh + 0.09, 0.025, [ox + h.at - h.w / 2 - 0.045, ymid + 0.045, az]);
      place(0.09, hh + 0.09, 0.025, [ox + h.at + h.w / 2 + 0.045, ymid + 0.045, az]);
    } else {
      const x = side === 'west' ? ox - W / 2 + WALL_T / 2 : ox + W / 2 - WALL_T / 2;
      place(dz, t, h.w, [x, h.h - t / 2, oz + h.at]);
      place(dz, hh, t, [x, ymid, oz + h.at - h.w / 2 + t / 2]);
      place(dz, hh, t, [x, ymid, oz + h.at + h.w / 2 - t / 2]);
      if (y0 > 0) place(dz + 0.05, 0.05, h.w + 0.1, [x, y0 + 0.02, oz + h.at]);
      const axx = side === 'west' ? x + WALL_T / 2 + 0.012 : x - WALL_T / 2 - 0.012;
      place(0.025, 0.09, h.w + 0.18, [axx, h.h + 0.04, oz + h.at]);
      place(0.025, hh + 0.09, 0.09, [axx, ymid + 0.045, oz + h.at - h.w / 2 - 0.045]);
      place(0.025, hh + 0.09, 0.09, [axx, ymid + 0.045, oz + h.at + h.w / 2 + 0.045]);
    }
  }

  // light spills through a doorway in the real world; here it has to be told to
  for (const h of holes) {
    if (h.blocked || h.window) continue;   // nothing out there to spill in
    let lp;
    if (side === 'north') lp = [ox + h.at, h.h * 0.72, oz - D / 2 + WALL_T / 2];
    else if (side === 'south') lp = [ox + h.at, h.h * 0.72, oz + D / 2 - WALL_T / 2];
    else if (side === 'west') lp = [ox - W / 2 + WALL_T / 2, h.h * 0.72, oz + h.at];
    else lp = [ox + W / 2 - WALL_T / 2, h.h * 0.72, oz + h.at];
    // both rooms sharing a doorway ask for this light; only one of them gets it
    const skey = lp[0].toFixed(1) + '|' + lp[2].toFixed(1);
    if (!_spillAt.has(skey)) { _spillAt.add(skey); addLight(lp, 0xffd6a0, 1.6, 3.2, 2); }
  }

  // a doorway that goes nowhere: brick where the room should be
  for (const h of holes) {
    if (!h.blocked) continue;
    let pos;
    if (side === 'east') pos = [ox + W / 2 - 0.02, h.h / 2, oz + h.at];
    else if (side === 'west') pos = [ox - W / 2 + 0.02, h.h / 2, oz + h.at];
    else if (side === 'north') pos = [ox + h.at, h.h / 2, oz - D / 2 + 0.02];
    else pos = [ox + h.at, h.h / 2, oz + D / 2 - 0.02];
    const bw = (side === 'east' || side === 'west') ? 0.1 : h.w;
    const bd = (side === 'east' || side === 'west') ? h.w : 0.1;
    mkBox(bw, h.h, bd, MAT.rust, pos, 0, 0, { cast: false });
  }
}

// Skirting, dado and picture rail. These stop at doorways -- a dado rail that
// runs straight across an open door is a very quick way to lose someone.
function buildTrim(def, side, holes, matName) {
  const [W, H, D] = def.size, [ox, oz] = def.origin;
  const runs = [];
  if (def.skirting) runs.push({ y: 0.09, t: 0.18, mat: MAT.cream });
  if (def.dado) runs.push({ y: 1.0, t: 0.07, mat: MAT.wood });
  if (def.picture_rail) runs.push({ y: H - 0.4, t: 0.05, mat: MAT.cream });
  if (!runs.length) return;

  const along = (side === 'north' || side === 'south') ? W : D;
  const e = 0.022;
  const face = FACE[side];

  for (const run of runs) {
    // cut the run wherever an opening reaches this height, plus its architrave
    const cuts = holes
      // an opening only interrupts a run if it actually spans that height: the
      // skirting runs straight under a window, which is what makes it a window
      .filter(h => h.h > run.y - run.t / 2 && (h.sill || 0) < run.y + run.t / 2)
      .map(h => [h.at - h.w / 2 - 0.1, h.at + h.w / 2 + 0.1])
      .sort((a, b) => a[0] - b[0]);
    const pieces = [];
    let cursor = -along / 2 + WALL_T;
    for (const [l, r] of cuts) {
      if (l > cursor) pieces.push([cursor, Math.min(l, along / 2 - WALL_T)]);
      cursor = Math.max(cursor, r);
    }
    if (cursor < along / 2 - WALL_T) pieces.push([cursor, along / 2 - WALL_T]);

    for (const [a, b] of pieces) {
      const len = b - a; if (len < 0.06) continue;
      const mid = (a + b) / 2;
      let pos, w, d;
      if (side === 'north') { pos = [ox + mid, run.y, oz - D / 2 + WALL_T + e / 2]; w = len; d = e; }
      else if (side === 'south') { pos = [ox + mid, run.y, oz + D / 2 - WALL_T - e / 2]; w = len; d = e; }
      else if (side === 'west') { pos = [ox - W / 2 + WALL_T + e / 2, run.y, oz + mid]; w = e; d = len; }
      else { pos = [ox + W / 2 - WALL_T - e / 2, run.y, oz + mid]; w = e; d = len; }
      mkBox(w, run.t, d, run.mat, pos, 0, 0, { noPhysics: true, cast: false });
    }
  }
}

function buildSpace(key, def) {
  const [W, H, D] = def.size, [ox, oz] = def.origin;

  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  scene.add(group);
  roomGroups[key] = group;
  addTo = group;
  buildingSpace = key;

  mkBox(W, 0.4, D, scaledMat(def.floor, W, D), [ox, -0.2, oz], 0, 0, { cast: false, jitter: true });
  mkBox(W, 0.3, D, scaledMat(def.ceiling, W, D), [ox, H + 0.15, oz], 0, 0, { cast: false, jitter: true });

  for (const side of ['north', 'south', 'east', 'west']) buildWall(def, side, def.wall);

  // door leaves, hung on the hinge edge of any opening marked door:true
  for (const o of (def.openings || [])) {
    if (!o.door) continue;
    const dw = o.w - 0.04, dh = o.h - 0.03;
    let hinge, rotY;
    if (o.wall === 'north') { hinge = [ox + o.at - dw / 2, 0, oz - D / 2 + WALL_T / 2]; rotY = 0; }
    else if (o.wall === 'south') { hinge = [ox + o.at + dw / 2, 0, oz + D / 2 - WALL_T / 2]; rotY = Math.PI; }
    else if (o.wall === 'west') { hinge = [ox - W / 2 + WALL_T / 2, 0, oz + o.at + dw / 2]; rotY = -Math.PI / 2; }
    else { hinge = [ox + W / 2 - WALL_T / 2, 0, oz + o.at - dw / 2]; rotY = Math.PI / 2; }
    makeDoor(hinge, rotY, dw, dh, 1);
  }

  for (const L of (def.lights || [])) {
    const p = [ox + L.pos[0], L.pos[1], oz + L.pos[2]];
    if (L.intensity <= 0) { deadFitting(p, L.tube, H); continue; }
    const light = addLight(p, L.color, L.intensity, L.dist || 10, L.decay || 2);
    light.base = L.intensity;
    if (L.flicker) flickerers.push({ light, base: L.intensity, amt: L.flicker, seed: R() * 100 });
    const glow = fitting(p, L.tube, H);
    light.glow = glow;
    if (L.flicker && glow) flickerers[flickerers.length - 1].glow = glow;
  }

  spaceBounds.push({ key, min: [ox - W / 2, oz - D / 2], max: [ox + W / 2, oz + D / 2], fog: def.fog || 0.05, group });

  for (const spec of (def.props || [])) placeProp(def, spec);

  addTo = null;
  buildingSpace = null;
}

// Two rooms are neighbours if a wall plane they share has openings in it that
// line up -- the same test the reachability check in test.js makes. Built once,
// at load, from the plan the generator emitted.
const roomGraph = {};
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

function wallPlane(def, wall) {
  const [W, , D] = def.size, [ox, oz] = def.origin;
  if (wall === 'north') return oz - D / 2;
  if (wall === 'south') return oz + D / 2;
  if (wall === 'west') return ox - W / 2;
  return ox + W / 2;
}
function openingAlong(def, o) {
  return (o.wall === 'north' || o.wall === 'south') ? def.origin[0] + o.at : def.origin[1] + o.at;
}

function buildRoomGraph() {
  const keys = Object.keys(SPACES);
  for (const k of keys) roomGraph[k] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const A = SPACES[keys[i]], B = SPACES[keys[j]];
      let linked = false;
      for (const oa of (A.openings || [])) {
        if (oa.blocked || linked) continue;
        for (const ob of (B.openings || [])) {
          if (ob.blocked || ob.wall !== OPPOSITE[oa.wall]) continue;
          if (Math.abs(wallPlane(A, oa.wall) - wallPlane(B, ob.wall)) > 0.5) continue;
          if (Math.abs(openingAlong(A, oa) - openingAlong(B, ob)) > 0.4) continue;
          linked = true; break;
        }
      }
      if (linked) { roomGraph[keys[i]].push(keys[j]); roomGraph[keys[j]].push(keys[i]); }
    }
  }
}


// --- E1: merge the statics ---------------------------------------------------
//
// A busy room was 334 draw calls because every skirting board, every wall
// segment and every stick of furniture was its own mesh. None of them ever
// move, and within a room most of them share a material, so they can be one
// piece of geometry per material and drawn once.
//
// What deliberately stays individual:
//   - anything with a rigid body of its own (the grabbables -- PLAN §2: they
//     are the instrument the player navigates with, and they must stay
//     takeable, placeable and separate)
//   - anything hung on a door pivot, which rotates
//   - anything transparent: the grime and mould decals are depth-sorted, and
//     sorting only works if they are still separate objects
//   - anything alone in its group, which would gain nothing

function mergeGeometries(entries) {
  const first = entries[0].geo;
  const names = ['position', 'normal', 'uv'].filter(n => first.attributes[n]);
  let vTotal = 0, iTotal = 0;
  for (const e of entries) {
    vTotal += e.geo.attributes.position.count;
    iTotal += e.geo.index ? e.geo.index.count : e.geo.attributes.position.count;
  }

  const out = new THREE.BufferGeometry();
  const dst = {};
  for (const n of names) dst[n] = new Float32Array(vTotal * first.attributes[n].itemSize);
  const idx = new Uint32Array(iTotal);

  const nrm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  let vAt = 0, iAt = 0;

  for (const e of entries) {
    const geo = e.geo, m = e.matrix;
    nrm.getNormalMatrix(m);
    const count = geo.attributes.position.count;

    for (const n of names) {
      const src = geo.attributes[n], size = src.itemSize, o = dst[n];
      for (let i = 0; i < count; i++) {
        if (n === 'position') {
          v.fromBufferAttribute(src, i).applyMatrix4(m);
          o[(vAt + i) * 3] = v.x; o[(vAt + i) * 3 + 1] = v.y; o[(vAt + i) * 3 + 2] = v.z;
        } else if (n === 'normal') {
          v.fromBufferAttribute(src, i).applyMatrix3(nrm).normalize();
          o[(vAt + i) * 3] = v.x; o[(vAt + i) * 3 + 1] = v.y; o[(vAt + i) * 3 + 2] = v.z;
        } else {
          for (let c = 0; c < size; c++) o[(vAt + i) * size + c] = src.getComponent(i, c);
        }
      }
    }

    if (geo.index) {
      const si = geo.index;
      for (let i = 0; i < si.count; i++) idx[iAt + i] = si.getX(i) + vAt;
      iAt += si.count;
    } else {
      for (let i = 0; i < count; i++) idx[iAt + i] = vAt + i;
      iAt += count;
    }
    vAt += count;
  }

  for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(dst[n], first.attributes[n].itemSize));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function mergeStatics() {
  const moving = new Set();
  for (const { mesh } of dynamicPairs) mesh.traverse(o => moving.add(o));
  for (const d of doors) d.pivot.traverse(o => moving.add(o));

  const inv = new THREE.Matrix4();
  let before = 0, after = 0;

  for (const key in roomGroups) {
    const g = roomGroups[key];
    g.updateMatrixWorld(true);
    inv.copy(g.matrixWorld).invert();

    const buckets = new Map();
    g.traverse(o => {
      if (!o.isMesh || moving.has(o)) return;
      before++;
      if (Array.isArray(o.material)) return;
      const mat = o.material;
      if (mat.transparent || mat.depthWrite === false) return;
      if (o.userData.noRay || o.userData.fitting) return;
      const geo = o.geometry;
      if (!geo || !geo.attributes.position) return;
      // a BoxGeometry carries six material groups even when it has one material;
      // that is harmless, the merged geometry simply has none
      // a merged mesh is drawn as one thing, so everything in a bucket has to
      // agree on how it is drawn as well as on what it is drawn with
      const k = mat.uuid + '|' + (o.castShadow ? 1 : 0) + '|' + (o.receiveShadow ? 1 : 0);
      let b = buckets.get(k);
      if (!b) buckets.set(k, b = { mat, cast: o.castShadow, receive: o.receiveShadow, entries: [], meshes: [] });
      b.entries.push({ geo, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      b.meshes.push(o);
    });

    for (const b of buckets.values()) {
      if (b.entries.length < 2) continue;
      const merged = new THREE.Mesh(mergeGeometries(b.entries), b.mat);
      merged.castShadow = b.cast;
      merged.receiveShadow = b.receive;
      merged.matrixAutoUpdate = false;
      merged.updateMatrix();
      for (const m of b.meshes) { m.parent.remove(m); m.geometry.dispose(); }
      g.add(merged);
    }

    // groups emptied by the merge -- a static compound whose parts all went
    for (const child of g.children.slice())
      if (!child.isMesh && !child.isLight && child.children.length === 0 && !moving.has(child)) g.remove(child);

    g.traverse(o => { if (o.isMesh) after++; });
  }
  mergeStats = { before, after };
}

let mergeStats = { before: 0, after: 0 };

// Positions never change after the building is up, so stop recomputing the
// matrices of a thousand things that are standing still. Anything with a rigid
// body of its own, and anything hung on a door, keeps updating.
function freezeStatics() {
  const moving = new Set();
  for (const { mesh } of dynamicPairs) mesh.traverse(o => moving.add(o));
  for (const d of doors) d.pivot.traverse(o => moving.add(o));
  for (const key in roomGroups) {
    const g = roomGroups[key];
    g.updateMatrixWorld(true);
    g.traverse(o => { if (o !== g && !moving.has(o)) o.matrixAutoUpdate = false; });
  }
}

// A look ray reaches under three metres, and three.js will happily test every
// mesh in the building against it -- invisible ones included, it does not check.
// Hand it only the rooms that are switched on and near enough to touch. Walls
// stay in the list, so you still cannot take a mug through one.
const _rayRoots = [];
function rayRoots(pos, far) {
  _rayRoots.length = 0;
  for (const b of spaceBounds) {
    if (!b.group.visible) continue;
    const dx = Math.max(b.min[0] - pos.x, 0, pos.x - b.max[0]);
    const dz = Math.max(b.min[1] - pos.z, 0, pos.z - b.max[1]);
    if (dx * dx + dz * dz < far * far) _rayRoots.push(b.group);
  }
  return _rayRoots;
}

function fitting(p, tube, H) {


  if (tube) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 1.2), MAT.tube);
    t.userData.fitting = true;
    t.position.set(p[0], p[1] + 0.06, p[2]); attach(t);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 1.35), MAT.plastic);
    h.position.set(p[0], p[1] + 0.13, p[2]); attach(h);
    return t;
  }
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), MAT.bulb);
  b.userData.fitting = true;                 // kept out of the merge so it can go out
  b.position.set(p[0], p[1], p[2]); attach(b);
  const flexLen = Math.max(0.05, H - p[1] + 0.1);
  const flex = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, flexLen, 5), MAT.dark);
  flex.position.set(p[0], p[1] + flexLen / 2, p[2]); attach(flex);
  return b;
}

function deadFitting(p, tube, H) {
  if (tube) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 1.35), MAT.plastic);
    h.position.set(p[0], p[1] + 0.13, p[2]); attach(h);
    return;
  }
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), MAT.dark);
  b.position.set(p[0], p[1], p[2]); attach(b);
  const flexLen = Math.max(0.05, H - p[1] + 0.1);
  const flex = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, flexLen, 5), MAT.dark);
  flex.position.set(p[0], p[1] + flexLen / 2, p[2]); attach(flex);
}

function placeProp(def, spec) {
  const [ox, oz] = def.origin;
  const fn = PROPS[spec.p];
  if (!fn) { console.warn('no prop builder:', spec.p); return; }
  const wx = ox + (spec.at ? spec.at[0] : 0);
  const wz = oz + (spec.at ? spec.at[1] : 0);
  fn({ def, spec, x: wx, z: wz, rot: spec.rot || 0, y: spec.y || 0 });
}

// --- props -----------------------------------------------------------------

const PROPS = {

  // second-pass wall dressing: mould, splats, torn paper
  decal: ({ def, spec }) => {
    const [W, , D] = def.size, [ox, oz] = def.origin;
    const mat = rpick(DECAL[spec.kind] || DECAL.mould);
    const s = spec.size || 0.8;
    const off = spec.at[0], y = spec.at[1];
    const face = FACE[spec.wall];
    let pos;
    if (spec.wall === 'north') pos = [ox + off, y, oz - D / 2 + WALL_T + 0.014];
    else if (spec.wall === 'south') pos = [ox + off, y, oz + D / 2 - WALL_T - 0.014];
    else if (spec.wall === 'west') pos = [ox - W / 2 + WALL_T + 0.014, y, oz + off];
    else pos = [ox + W / 2 - WALL_T - 0.014, y, oz + off];
    const ar = spec.kind === 'poster' ? 1.35 : rr(0.7, 1.4);
    mkPlane(s, s * ar, mat, pos, face.rot, spec.rot || 0).userData.noRay = true;
  },

  floorGrime: ({ spec, x, z }) => {
    const m = mkPlane(spec.size, spec.size * rr(0.6, 1.4), rpick(DECAL.grime), [x, 0.012, z], 0);
    m.rotation.set(-Math.PI / 2, 0, rr(0, 6.28));
    m.userData.noRay = true;
  },

  rug: ({ spec, x, z }) => {
    const [w, d] = spec.size || [2.5, 1.8];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.014, d), MAT.fabric);
    m.position.set(x, 0.008, z); m.rotation.y = spec.rot || 0; m.receiveShadow = true;
    attach(m);
  },

  table: ({ x, z, rot }) => {
    const w = rr(1.2, 1.6), d = rr(0.72, 0.9), h = 0.76, lt = 0.07;
    const parts = [{ box: [w, 0.05, d], mat: MAT.wood, at: [0, h - 0.025, 0] }];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push({ box: [lt, h - 0.05, lt], mat: MAT.wood, at: [sx * (w / 2 - 0.09), (h - 0.05) / 2, sz * (d / 2 - 0.09)] });
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  chair: ({ x, z, rot }) => {
    const s = 0.44, sh = 0.45, lt = 0.05;
    const parts = [{ box: [s, 0.045, s], mat: MAT.woodLight, at: [0, sh, 0] },
                   { box: [s, 0.5, 0.045], mat: MAT.woodLight, at: [0, sh + 0.26, -s / 2 + 0.03] }];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push({ box: [lt, sh, lt], mat: MAT.woodLight, at: [sx * (s / 2 - 0.04), sh / 2, sz * (s / 2 - 0.04)] });
    mkCompound(parts, [x, 0.001, z], rot, 7);
  },

  sideboard: ({ x, z, rot }) => {
    const w = rr(1.3, 1.7), h = 0.85, d = 0.46;
    const parts = [
      { box: [w, h, d], mat: MAT.wood, at: [0, h / 2, 0] },
      { box: [w * 0.44, h * 0.6, 0.02], mat: MAT.woodLight, at: [-w * 0.24, h * 0.5, d / 2 + 0.011], phys: false },
      { box: [w * 0.44, h * 0.6, 0.02], mat: MAT.woodLight, at: [w * 0.24, h * 0.5, d / 2 + 0.011], phys: false },
      { cyl: [0.02, 0.02, 0.05, 8], mat: MAT.metal, at: [-w * 0.05, h * 0.5, d / 2 + 0.04], rot: [Math.PI / 2, 0, 0], phys: false },
      { cyl: [0.02, 0.02, 0.05, 8], mat: MAT.metal, at: [w * 0.05, h * 0.5, d / 2 + 0.04], rot: [Math.PI / 2, 0, 0], phys: false }
    ];
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  units: ({ x, z, rot }) => {
    const w = rr(1.6, 2.2), h = 0.88, d = 0.6;
    const parts = [
      { box: [w, h - 0.06, d], mat: MAT.cream, at: [0, (h - 0.06) / 2, 0] },
      { box: [w + 0.04, 0.06, d + 0.04], mat: MAT.woodLight, at: [0, h - 0.03, 0] }
    ];
    const n = Math.max(2, Math.round(w / 0.5));
    for (let i = 0; i < n; i++)
      parts.push({ box: [w / n - 0.03, h * 0.62, 0.02], mat: MAT.cream, at: [-w / 2 + (i + 0.5) * (w / n), h * 0.42, d / 2 + 0.012], phys: false });
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  sink: ({ x, z, rot }) => {
    const parts = [
      { box: [1.0, 0.82, 0.58], mat: MAT.cream, at: [0, 0.41, 0] },
      { box: [1.02, 0.05, 0.6], mat: MAT.metal, at: [0, 0.845, 0] },
      { box: [0.5, 0.06, 0.42], mat: MAT.dark, at: [-0.2, 0.83, 0] },
      { cyl: [0.02, 0.02, 0.26, 8], mat: MAT.metal, at: [-0.2, 0.99, -0.22], phys: false }
    ];
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  boiler: ({ x, z, rot }) => {
    const parts = [
      { box: [0.62, 0.85, 0.42], mat: MAT.cream, at: [0, 1.25, 0] },
      { cyl: [0.05, 0.05, 0.5, 8], mat: MAT.metal, at: [0.18, 1.9, 0], phys: false },
      { cyl: [0.03, 0.03, 0.9, 8], mat: MAT.metal, at: [-0.22, 0.42, 0.1], phys: false }
    ];
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  pipes: ({ x, z, rot }) => {
    const n = ri(2, 4), h = rr(1.6, 2.6);
    for (let i = 0; i < n; i++) {
      const off = (i - n / 2) * 0.11;
      const c = mkCyl(0.032, 0.032, h, 8, rchance(0.5) ? MAT.metal : MAT.rust,
        [x + Math.cos(rot) * off, h / 2, z + Math.sin(rot) * off], 0, { noPhysics: true });
      c.mesh.castShadow = true;
    }
  },

  workbench: ({ x, z, rot }) => {
    const w = rr(2.0, 2.6), h = 0.9, d = 0.7;
    const parts = [{ box: [w, 0.07, d], mat: MAT.wood, at: [0, h, 0] },
                   { box: [w - 0.2, 0.05, d - 0.2], mat: MAT.wood, at: [0, 0.25, 0] }];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push({ box: [0.09, h, 0.09], mat: MAT.wood, at: [sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)] });
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  armchair: ({ x, z, rot }) => {
    const parts = [
      { box: [0.82, 0.36, 0.8], mat: MAT.fabric, at: [0, 0.28, 0] },
      { box: [0.82, 0.62, 0.16], mat: MAT.fabric, at: [0, 0.6, -0.32] },
      { box: [0.14, 0.28, 0.8], mat: MAT.fabric, at: [-0.34, 0.6, 0] },
      { box: [0.14, 0.28, 0.8], mat: MAT.fabric, at: [0.34, 0.6, 0] },
      { box: [0.76, 0.12, 0.72], mat: MAT.dark, at: [0, 0.06, 0] }
    ];
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  wardrobe: ({ x, z, rot }) => {
    const w = rr(0.95, 1.25), h = rr(1.9, 2.15), d = 0.58;
    const parts = [
      { box: [w, h, d], mat: MAT.wood, at: [0, h / 2, 0] },
      { box: [w * 0.46, h * 0.86, 0.02], mat: MAT.woodLight, at: [-w * 0.24, h * 0.5, d / 2 + 0.012], phys: false },
      { box: [w * 0.46, h * 0.86, 0.02], mat: MAT.woodLight, at: [w * 0.24, h * 0.5, d / 2 + 0.012], phys: false },
      { box: [w, 0.07, d + 0.06], mat: MAT.wood, at: [0, h + 0.03, 0] }
    ];
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  tv: ({ x, z, rot }) => {
    const parts = [
      { box: [0.62, 0.5, 0.52], mat: MAT.plastic, at: [0, 0.55, 0] },
      { box: [0.5, 0.38, 0.02], mat: MAT.dark, at: [0, 0.57, 0.27], phys: false },
      { box: [0.5, 0.5, 0.45], mat: MAT.wood, at: [0, 0.28, 0] }
    ];
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  radiator: ({ x, z, rot }) => {
    const parts = [{ box: [0.9, 0.55, 0.08], mat: MAT.cream, at: [0, 0.45, 0] }];
    for (let i = 0; i < 10; i++)
      parts.push({ box: [0.055, 0.5, 0.11], mat: MAT.cream, at: [-0.4 + i * 0.09, 0.45, 0], phys: false });
    mkCompound(parts, [x, 0, z], rot, 0);
  },

  coatHooks: ({ def, spec }) => {
    const [W, , D] = def.size, [ox, oz] = def.origin;
    const face = FACE[spec.wall];
    let pos;
    if (spec.wall === 'north') pos = [ox + spec.at[0], 1.65, oz - D / 2 + WALL_T + 0.02];
    else if (spec.wall === 'south') pos = [ox + spec.at[0], 1.65, oz + D / 2 - WALL_T - 0.02];
    else if (spec.wall === 'west') pos = [ox - W / 2 + WALL_T + 0.02, 1.65, oz + spec.at[0]];
    else pos = [ox + W / 2 - WALL_T - 0.02, 1.65, oz + spec.at[0]];
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]); g.rotation.y = face.rot;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.03), MAT.wood);
    board.castShadow = true; g.add(board);
    for (let i = -1; i <= 1; i++) {
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.07), MAT.metal);
      hook.position.set(i * 0.3, -0.04, 0.05); g.add(hook);
    }
    attach(g);
  },

  picture: ({ def, spec }) => {
    const [W, , D] = def.size, [ox, oz] = def.origin;
    const w = spec.w || 0.5, h = spec.h || 0.6;
    const off = spec.at[0], y = spec.at[1];
    const face = FACE[spec.wall];
    let pos;
    if (spec.wall === 'north') pos = [ox + off, y, oz - D / 2 + WALL_T + 0.03];
    else if (spec.wall === 'south') pos = [ox + off, y, oz + D / 2 - WALL_T - 0.03];
    else if (spec.wall === 'west') pos = [ox - W / 2 + WALL_T + 0.03, y, oz + off];
    else pos = [ox + W / 2 - WALL_T - 0.03, y, oz + off];
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]); g.rotation.y = face.rot;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), MAT.wood);
    frame.castShadow = true; g.add(frame);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.07, h - 0.07),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rr(0.05, 0.13), 0.25, rr(0.05, 0.24)), roughness: 0.9 }));
    inner.position.z = 0.021; g.add(inner);
    g.rotation.z = rr(-0.025, 0.025);
    attach(g);
  },

  standardLamp: ({ x, z }) => {
    mkCyl(0.16, 0.19, 0.03, 14, MAT.metal, [x, 0.015, z], 0);
    mkCyl(0.018, 0.018, 1.42, 8, MAT.metal, [x, 0.72, z], 0);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.28, 18, 1, true), MAT.shade);
    shade.position.set(x, 1.52, z); attach(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.bulb);
    bulb.position.set(x, 1.48, z); attach(bulb);
    const light = addLight([x, 1.48, z], 0xffa956, 6.0, 9, 2);
    light.base = 6.0; light.glow = bulb; bulb.userData.fitting = true;
    flickerers.push({ light, base: 6.0, amt: 0.012, seed: R() * 10, glow: bulb });
  },

  shelfRun: ({ x, z, rot, spec }) => {
    const bays = Math.min(5, spec.n || 4), bw = 1.0, h = 2.4, d = 0.6;
    for (let b = 0; b < bays; b++) {
      const off = (b - (bays - 1) / 2) * (bw + 0.02);
      const px = x + Math.sin(rot) * off, pz = z + Math.cos(rot) * off;
      const parts = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        parts.push({ box: [0.05, h, 0.05], mat: MAT.metal, at: [sx * (d / 2 - 0.03), h / 2, sz * (bw / 2 - 0.03)] });
      for (let s = 0; s < 4; s++)
        parts.push({ box: [d, 0.03, bw], mat: MAT.metal, at: [0, 0.35 + s * 0.65, 0] });
      mkCompound(parts, [px, 0, pz], rot, 0);
      for (let s = 0; s < 4; s++) {
        const n = ri(0, 2);
        for (let i = 0; i < n; i++)
          PROPS[rpick(SMALL)]({ x: px + rr(-0.18, 0.18), z: pz + rr(-0.35, 0.35), y: 0.4 + s * 0.65, rot: rr(0, 6.28) });
      }
    }
  },

  crateStack: ({ x, z, rot, spec }) => {
    const n = spec.n || 3;
    for (let i = 0; i < n; i++) {
      const s = rr(0.38, 0.52);
      mkBox(s, s * 0.7, s * 0.9, MAT.card,
        [x + rr(-0.05, 0.05), 0.02 + i * (s * 0.72), z + rr(-0.05, 0.05)], rot + rr(-0.15, 0.15), 4);
    }
  },

  pallet: ({ x, z, rot }) => {
    const parts = [];
    for (let i = 0; i < 5; i++) parts.push({ box: [1.1, 0.02, 0.11], mat: MAT.woodLight, at: [0, 0.13, -0.44 + i * 0.22] });
    for (const sz of [-0.44, 0, 0.44]) parts.push({ box: [1.1, 0.11, 0.11], mat: MAT.woodLight, at: [0, 0.055, sz] });
    mkCompound(parts, [x, 0.01, z], rot, 12);
  },

  drum: ({ x, z }) => {
    const d = mkCyl(0.29, 0.29, 0.88, 16, rchance(0.5) ? MAT.rust : MAT.metal, [x, 0.45, z], 22);
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.02, 6, 20), MAT.rust);
    rib.rotation.x = Math.PI / 2; rib.position.y = 0.15; d.mesh.add(rib);
    const rib2 = rib.clone(); rib2.position.y = -0.15; d.mesh.add(rib2);
  },

  tarp: ({ x, z, rot }) => {
    const g = new THREE.PlaneGeometry(3.2, 2.6, 10, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i);
      const edge = Math.max(Math.abs(px) / 1.6, Math.abs(py) / 1.3);
      p.setZ(i, Math.cos(edge * 1.5) * 0.55 + Math.sin(px * 2.2) * 0.06 + Math.cos(py * 3.1) * 0.05);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x33352e, roughness: 1, side: THREE.DoubleSide }));
    m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, 0.02, z);
    m.castShadow = true; m.receiveShadow = true;
    attach(m);
    mkBox(1.8, 0.9, 1.2, MAT.dark, [x, 0.45, z], rot, 0, { cast: true });
  },

  // --- things you can pick up ---------------------------------------------

  box:   ({ x, z, y, rot }) => { const s = rr(0.2, 0.32); mkBox(s, s * 0.8, s * 0.9, MAT.card, [x, (y || 0) + s * 0.4 + 0.01, z], rot || rr(0, 6.28), 1.2); },
  brick: ({ x, z, y, rot }) => mkBox(0.21, 0.09, 0.1, MAT.rust, [x, (y || 0) + 0.05, z], rot || rr(0, 6.28), 2.4),
  plank: ({ x, z, y, rot }) => mkBox(0.9, 0.035, 0.14, MAT.woodLight, [x, (y || 0) + 0.02, z], rot || rr(0, 6.28), 1.6),
  book:  ({ x, z, y, rot }) => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rr(0, 0.12), 0.35, rr(0.12, 0.3)), roughness: 0.95 });
    mkBox(0.15, 0.04, 0.21, m, [x, (y || 0) + 0.02, z], rot || rr(0, 6.28), 0.6);
  },
  folder: ({ x, z, y, rot }) => mkBox(0.24, 0.03, 0.32, MAT.paper, [x, (y || 0) + 0.016, z], rot || rr(0, 6.28), 0.4),
  bottle: ({ x, z, y }) => {
    const b = mkCyl(0.036, 0.042, 0.24, 12, MAT.glass, [x, (y || 0) + 0.12, z], 0.7);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.09, 10), MAT.glass);
    neck.position.y = 0.155; b.mesh.add(neck);
  },
  jar: ({ x, z, y }) => mkCyl(0.055, 0.055, 0.14, 12, MAT.glass, [x, (y || 0) + 0.07, z], 0.6),
  tin: ({ x, z, y }) => mkCyl(0.043, 0.043, 0.11, 12, MAT.metal, [x, (y || 0) + 0.055, z], 0.5),
  mug: ({ x, z, y }) => {
    const c = mkCyl(0.042, 0.036, 0.095, 12, MAT.plastic, [x, (y || 0) + 0.048, z], 0.35);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 5, 10, Math.PI * 1.4), MAT.plastic);
    h.position.set(0.048, 0, 0); h.rotation.y = Math.PI / 2; c.mesh.add(h);
  },
  ball: ({ x, z, y }) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), MAT.red);
    mesh.position.set(x, (y || 0) + 0.08, z); mesh.castShadow = true; mesh.receiveShadow = true;
    attach(mesh);
    const body = new CANNON.Body({ mass: 0.5, material: PHYS.bouncy });
    body.addShape(new CANNON.Sphere(0.075));
    body.position.set(x, (y || 0) + 0.08, z);
    body.linearDamping = 0.05; body.angularDamping = 0.1;
    world.addBody(body); register(mesh, body, 0.5);
  },
  bucket: ({ x, z, y }) => {
    const b = mkCyl(0.15, 0.11, 0.28, 14, MAT.plastic, [x, (y || 0) + 0.14, z], 1.0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 16), MAT.plastic);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.14; b.mesh.add(rim);
  },
  telephone: ({ x, z, y, rot }) => {
    const parts = [
      { box: [0.22, 0.07, 0.19], mat: MAT.dark, at: [0, 0.035, 0] },
      { box: [0.2, 0.045, 0.06], mat: MAT.dark, at: [0, 0.09, -0.05] },
      { cyl: [0.045, 0.045, 0.015, 12], mat: MAT.plastic, at: [0, 0.078, 0.04], phys: false }
    ];
    mkCompound(parts, [x, (y || 0) + 0.005, z], rot || 0, 1.4);
  },

  scatter: ({ def, spec, x, z }) => {
    const [aw, ad] = spec.area;
    for (let i = 0; i < spec.n; i++)
      PROPS[rpick(SMALL)]({ def, spec: {}, x: x + rr(-aw / 2, aw / 2), z: z + rr(-ad / 2, ad / 2), y: 0, rot: rr(0, 6.28) });
  }
};
