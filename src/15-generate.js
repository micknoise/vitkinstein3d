// ---------------------------------------------------------------------------
// THE GENERATOR.
//
// Builds a house out of the vocabulary in 10-types.js. Rooms attach to each
// other's free walls, are rejected if they would overlap, and are dressed by
// rule against an occupancy grid so nothing lands inside anything else.
//
// It emits exactly the same SPACES structure the builder consumes, so a
// generated building and a hand-written one are the same kind of thing.
//
// Two connections are not connections at all: they are portals (25-portal.js),
// and the room on the far side of one is placed wherever it likes -- including
// on top of where you are standing.
// ---------------------------------------------------------------------------

let SPACES = {}, SPACE_ORDER = [], START = null, PORTAL_LINKS = [], LOOP_CORRIDOR = null;

const OPP = { north: 'south', south: 'north', east: 'west', west: 'east' };

function generateBuilding() {
  SPACES = {}; SPACE_ORDER = []; PORTAL_LINKS = []; LOOP_CORRIDOR = null;
  const rooms = [];        // {key, type, ox, oz, W, H, D, walls:{}}
  let counter = 0;

  const overlaps = (ox, oz, W, D) => rooms.some(r =>
    Math.abs(ox - r.ox) < (W + r.W) / 2 - 0.02 && Math.abs(oz - r.oz) < (D + r.D) / 2 - 0.02);

  function dims(typeKey, alongX) {
    const t = ROOM_TYPES[typeKey];
    let W = rr(t.w[0], t.w[1]), D = rr(t.d[0], t.d[1]);
    if (t.corridor && alongX) { const s = W; W = D; D = s; }   // corridors run away from you
    return [+W.toFixed(2), +rr(t.h[0], t.h[1]).toFixed(2), +D.toFixed(2)];
  }


  // Is the space just beyond this stretch of wall actually empty? A portal cut
  // into a wall that another room happens to back onto is a doorway into the
  // back of somebody else's plaster.
  function beyondFree(r, side, at, w) {
    const probe = 0.8;
    let x, z, hw, hd;
    if (side === 'north') { x = r.ox + at; z = r.oz - r.D / 2 - probe / 2; hw = w / 2 + 0.2; hd = probe / 2; }
    else if (side === 'south') { x = r.ox + at; z = r.oz + r.D / 2 + probe / 2; hw = w / 2 + 0.2; hd = probe / 2; }
    else if (side === 'west') { x = r.ox - r.W / 2 - probe / 2; z = r.oz + at; hw = probe / 2; hd = w / 2 + 0.2; }
    else { x = r.ox + r.W / 2 + probe / 2; z = r.oz + at; hw = probe / 2; hd = w / 2 + 0.2; }
    return !rooms.some(o => o !== r &&
      Math.abs(x - o.ox) < o.W / 2 + hw && Math.abs(z - o.oz) < o.D / 2 + hd);
  }

  // find a free wall with open space behind it, and a place along it to stand
  // a doorway that leads somewhere else entirely
  function findPortalWall(r, w) {
    const free = rshuffle(Object.keys(r.walls).filter(s => r.walls[s] === 0));
    for (const side of free) {
      const along = (side === 'east' || side === 'west') ? r.D : r.W;
      const room = along / 2 - w / 2 - 0.45;
      if (room <= 0) continue;
      for (let i = 0; i < 8; i++) {
        const at = +rr(-room, room).toFixed(2);
        if (beyondFree(r, side, at, w)) return { side, at };
      }
    }
    return null;
  }

  function addRoom(typeKey, ox, oz, W, H, D) {
    const key = typeKey + '_' + (counter++);
    const t = ROOM_TYPES[typeKey];
    const room = { key, type: typeKey, ox, oz, W, H, D, walls: { north: 0, south: 0, east: 0, west: 0 } };
    rooms.push(room);
    SPACES[key] = {
      label: rpick(t.label), size: [W, H, D], origin: [ox, oz],
      floor: t.floor, wall: t.wall, ceiling: t.ceiling, lining: t.lining,
      skirting: !!t.skirting, dado: !!t.dado, picture_rail: !!t.picture_rail,
      fog: rr(t.fog[0], t.fog[1]),
      openings: [], lights: [], props: [], _type: typeKey
    };
    SPACE_ORDER.push(key);
    return room;
  }

  // --- the first room ------------------------------------------------------
  const first = (() => { const [W, H, D] = dims('front_room', false); return addRoom('front_room', 0, 0, W, H, D); })();

  // --- grow ----------------------------------------------------------------
  const TARGET = ri(8, 12);
  let guard = 0;
  while (rooms.length < TARGET && guard++ < 600) {
    const parent = rpick(rooms.filter(r => Object.values(r.walls).some(v => v === 0)));
    if (!parent) break;
    const side = rpick(rshuffle(['north', 'south', 'east', 'west']).filter(s => parent.walls[s] === 0));
    if (!side) continue;

    const alongX = (side === 'east' || side === 'west');
    const typeKey = rpick(FOLLOWS[parent.type] || ['back_room']);
    const [W, H, D] = dims(typeKey, alongX);

    // where the two rooms touch
    const doorW = Math.min(1.05, (alongX ? Math.min(parent.D, D) : Math.min(parent.W, W)) - 0.9);
    if (doorW < 0.75) continue;

    let ox, oz, slide;
    const room = ROOM_TYPES[typeKey];
    if (side === 'north' || side === 'south') {
      const dir = side === 'north' ? -1 : 1;
      oz = parent.oz + dir * (parent.D + D) / 2;
      // the doorway sits at the child's centre, so the child may only slide as
      // far as keeps that centre inside the parent's wall too
      const limit = Math.max(0, Math.min(parent.W, W) / 2 - doorW / 2 - 0.3);
      slide = rr(-limit, limit);
      ox = parent.ox + slide;
    } else {
      const dir = side === 'east' ? 1 : -1;
      ox = parent.ox + dir * (parent.W + W) / 2;
      const limit = Math.max(0, Math.min(parent.D, D) / 2 - doorW / 2 - 0.3);
      slide = rr(-limit, limit);
      oz = parent.oz + slide;
    }
    if (overlaps(ox, oz, W, D)) continue;

    const child = addRoom(typeKey, ox, oz, W, H, D);
    parent.walls[side] = 1; child.walls[OPP[side]] = 1;

    // the doorway, cut in both walls at the same place in the world
    const doorWorld = (side === 'north' || side === 'south') ? ox : oz;
    const pAt = doorWorld - ((side === 'north' || side === 'south') ? parent.ox : parent.oz);
    const cAt = 0;
    const h = Math.min(2.15, Math.min(parent.H, H) - 0.45);
    const hasDoor = rchance(ROOM_TYPES[typeKey].corridor || ROOM_TYPES[parent.type].corridor ? 0.55 : 0.85);
    SPACES[parent.key].openings.push({ wall: side, at: +pAt.toFixed(2), w: +doorW.toFixed(2), h: +h.toFixed(2), door: hasDoor });
    SPACES[child.key].openings.push({ wall: OPP[side], at: +cAt.toFixed(2), w: +doorW.toFixed(2), h: +h.toFixed(2) });
  }

  // --- B3: the corridor that returns to itself -----------------------------
  // Both ends of one passage, linked to each other. Walk far enough down it and
  // you are back where you started, having passed the same radiator four times.
  //
  // The grow loop cannot produce the passage this needs. It orients a corridor
  // to run *away* from its parent, so the wall a corridor joins by is always
  // one of its ends, and an end that is already a doorway cannot also be a
  // portal. So this places one deliberately: a passage running *across* the
  // wall it joins, entered from its long side, with both ends free to be cut.
  //
  // Every house gets one, for now. Whether it should is the open question in
  // the verdict: a corridor that eats itself may be worth more when it is not
  // a feature of the architecture. Gating it is one rchance() away, and that
  // decision should be made from playing it, not from guessing.
  //
  // The seam that would give it away is the lighting, and there is none to get
  // wrong: the far view is the same room, so it matches itself exactly. That is
  // why this is the cheapest strong idea in the plan.
  {
    const t = ROOM_TYPES.passage, loopW = 1.0, loopH = 2.05;
    const parents = rshuffle(rooms.filter(r => Object.values(r.walls).some(v => v === 0)));
    placing:
    for (const parent of parents) {
      const sides = rshuffle(['north', 'south', 'east', 'west']).filter(s => parent.walls[s] === 0);
      for (const side of sides) {
        const alongX = (side === 'east' || side === 'west');
        // Length is what decides whether this reads as an endless corridor or as
        // a small room with a door at each end, and the short ones do not land.
        // It has to fit broadside against a house that is already standing, so
        // ask for a long one first and settle for less only if it will not go.
        for (const [lo, hi] of [[16, 21], [12, 17], [9, 13], [7, 10]]) {
          const long = rr(lo, hi), narrow = rr(t.w[0], t.w[1]);
          const W = alongX ? narrow : long, D = alongX ? long : narrow;
          const H = +rr(t.h[0], t.h[1]).toFixed(2);

          const doorW = Math.min(1.05, (alongX ? Math.min(parent.D, D) : Math.min(parent.W, W)) - 0.9);
          if (doorW < 0.75) continue;

          let ox, oz;
          if (alongX) {
            ox = parent.ox + (side === 'east' ? 1 : -1) * (parent.W + W) / 2;
            oz = parent.oz + rr(-1, 1) * Math.max(0, (D - parent.D) / 4);
          } else {
            oz = parent.oz + (side === 'north' ? -1 : 1) * (parent.D + D) / 2;
            ox = parent.ox + rr(-1, 1) * Math.max(0, (W - parent.W) / 4);
          }
          if (overlaps(ox, oz, +W.toFixed(2), +D.toFixed(2))) continue;

          const child = addRoom('passage', ox, oz, +W.toFixed(2), H, +D.toFixed(2));
          const ends = alongX ? ['north', 'south'] : ['west', 'east'];
          if (!ends.every(e => beyondFree(child, e, 0, loopW))) {
            rooms.pop(); SPACE_ORDER.pop(); delete SPACES[child.key];
            continue;
          }

          parent.walls[side] = 1; child.walls[OPP[side]] = 1;
          const doorWorld = alongX ? oz : ox;
          const pAt = doorWorld - (alongX ? parent.oz : parent.ox);
          const h = Math.min(2.15, Math.min(parent.H, H) - 0.45);
          const hasDoor = rchance(0.55);
          SPACES[parent.key].openings.push({ wall: side, at: +pAt.toFixed(2), w: +doorW.toFixed(2), h: +h.toFixed(2), door: hasDoor });
          SPACES[child.key].openings.push({ wall: OPP[side], at: 0, w: +doorW.toFixed(2), h: +h.toFixed(2) });

          const faces = ends.map(e => {
            child.walls[e] = 5;
            SPACES[child.key].openings.push({ wall: e, at: 0, w: loopW, h: loopH, portal: true });
            return { space: child.key, wall: e, at: 0, w: loopW, h: loopH };
          });
          PORTAL_LINKS.push({ a: faces[0], b: faces[1] });
          LOOP_CORRIDOR = child.key;
          break placing;
        }
      }
    }
  }

  // --- doorways that go nowhere -------------------------------------------
  for (const r of rooms) {
    if (!rchance(0.3)) continue;
    const free = Object.keys(r.walls).filter(s => r.walls[s] === 0);
    if (!free.length) continue;
    const found = findPortalWall(r, 0.9);
    if (!found) continue;
    r.walls[found.side] = 2;
    SPACES[r.key].openings.push({ wall: found.side, at: found.at, w: 0.9, h: 2.0, blocked: true });
  }

  // --- the room that cannot be there --------------------------------------
  // Placed a long way off in world space and reached only through a portal, so
  // it is free to be any size at all and to sit where the house already is.
  // Find the host wall FIRST. An opening cut for a portal that never gets made
  // is a hole in an outside wall, and you walk out of the world through it.
  const wareDoorW = 1.1, wareDoorH = 2.15;
  const hosts = rooms.filter(r => r !== first &&
    ['box_room', 'back_room', 'kitchen', 'landing', 'storeroom', 'passage'].includes(r.type));
  let host = null, hostWall = null;
  for (const cand of rshuffle(hosts.slice()).concat(rshuffle(rooms.slice()))) {
    const found = findPortalWall(cand, wareDoorW);
    if (found) { host = cand; hostWall = found; break; }
  }
  if (host) {
    const [ww, wh, wd] = dims('warehouse', false);
    const ware = addRoom('warehouse', 400, 400, ww, wh, wd);
    SPACES[ware.key].openings.push({ wall: 'south', at: 0, w: wareDoorW, h: wareDoorH });
    ware.walls.south = 3;
    host.walls[hostWall.side] = 3;
    SPACES[host.key].openings.push({ wall: hostWall.side, at: hostWall.at, w: wareDoorW, h: wareDoorH, portal: true });
    PORTAL_LINKS.push({
      a: { space: host.key, wall: hostWall.side, at: hostWall.at, w: wareDoorW, h: wareDoorH },
      b: { space: ware.key, wall: 'south', at: 0, w: wareDoorW, h: wareDoorH }
    });
  }

  // --- one more impossibility: a doorway back into a room you have been ----
  const loopCandidates = rshuffle(rooms.filter(r => r.type !== 'warehouse'));
  const picks = [];
  for (const r of loopCandidates) {
    if (picks.length === 2) break;
    const found = findPortalWall(r, 1.0);
    if (found) picks.push({ r, found });
  }
  if (picks.length === 2) {
    const faces = picks.map(({ r, found }) => {
      r.walls[found.side] = 4;
      SPACES[r.key].openings.push({ wall: found.side, at: found.at, w: 1.0, h: 2.05, portal: true });
      return { space: r.key, wall: found.side, at: found.at, w: 1.0, h: 2.05 };
    });
    PORTAL_LINKS.push({ a: faces[0], b: faces[1] });
  }

  // --- where you wake up ---------------------------------------------------
  // Standing near a wall, looking across the room. Worked out before the room
  // is furnished so that nothing is put where you are standing, and so that
  // walking forward walks you into the room rather than into plaster.
  {
    const sx = rchance(0.5) ? -1 : 1, sz = rchance(0.5) ? -1 : 1;
    const ax = sx * first.W * 0.32, az = sz * first.D * 0.32;
    START = { space: first.key, at: [+ax.toFixed(2), +az.toFixed(2)], look: Math.atan2(ax, az) };
    SPACES[first.key]._start = [ax, az];
  }

  // --- light and furnish ---------------------------------------------------
  for (const r of rooms) { lightRoom(r); dressRoom(r); }
  return { seed: SEED, rooms: rooms.length, portals: PORTAL_LINKS.length, loopCorridor: LOOP_CORRIDOR };
}

// --- lighting ---------------------------------------------------------------

function lightRoom(r) {
  const t = ROOM_TYPES[r.type];
  const k = LIGHT_KINDS[t.lights] || LIGHT_KINDS.bare;
  const def = SPACES[r.key];
  const y = k.height === 'high' ? r.H - 1.3 : r.H - 0.22;

  let positions;
  if (t.corridor) {
    const n = Math.max(1, Math.round(r.D / 5.5));
    positions = [];
    for (let i = 0; i < n; i++) positions.push([0, y, -r.D / 2 + (i + 0.5) * (r.D / n)]);
  } else if (k.height === 'high') {
    const n = ri(3, 5);
    positions = [];
    for (let i = 0; i < n; i++) positions.push([rr(-r.W / 2 + 2, r.W / 2 - 2), y, rr(-r.D / 2 + 2, r.D / 2 - 2)]);
  } else {
    positions = [[rr(-r.W / 6, r.W / 6), y, rr(-r.D / 6, r.D / 6)]];
    if (r.W * r.D > 22 && rchance(0.6)) positions.push([rr(-r.W / 3, r.W / 3), y, rr(-r.D / 3, r.D / 3)]);
  }

  positions.forEach((p, i) => {
    const dead = rchance(0.12);          // some fittings simply do not work
    def.lights.push({
      pos: p, color: rpick(k.colors),
      intensity: dead ? 0 : rr(k.intensity[0], k.intensity[1]),
      dist: rr(k.dist[0], k.dist[1]), decay: 2,
      flicker: dead ? 0 : (rchance(0.3) ? rr(k.flicker[0] + 0.02, k.flicker[1]) : rr(0, 0.03)),
      tube: k.tube === true || (typeof k.tube === 'number' && rchance(k.tube))
    });
  });

  // a lamp on the floor of a domestic room, doing most of the work
  if (t.lights === 'domestic' && rchance(0.75)) def._lamp = true;
}

// --- dressing ---------------------------------------------------------------

function dressRoom(r) {
  const t = ROOM_TYPES[r.type];
  const def = SPACES[r.key];
  const CELL = 0.25;
  const nx = Math.ceil(r.W / CELL), nz = Math.ceil(r.D / CELL);
  const grid = new Uint8Array(nx * nz);

  const markRect = (cx, cz, w, d, pad) => {
    pad = pad || 0;
    const x0 = Math.floor((cx - w / 2 - pad + r.W / 2) / CELL), x1 = Math.ceil((cx + w / 2 + pad + r.W / 2) / CELL);
    const z0 = Math.floor((cz - d / 2 - pad + r.D / 2) / CELL), z1 = Math.ceil((cz + d / 2 + pad + r.D / 2) / CELL);
    for (let z = Math.max(0, z0); z < Math.min(nz, z1); z++)
      for (let x = Math.max(0, x0); x < Math.min(nx, x1); x++) grid[z * nx + x] = 1;
  };
  const freeRect = (cx, cz, w, d) => {
    if (Math.abs(cx) + w / 2 > r.W / 2 - 0.2 || Math.abs(cz) + d / 2 > r.D / 2 - 0.2) return false;
    const x0 = Math.floor((cx - w / 2 + r.W / 2) / CELL), x1 = Math.ceil((cx + w / 2 + r.W / 2) / CELL);
    const z0 = Math.floor((cz - d / 2 + r.D / 2) / CELL), z1 = Math.ceil((cz + d / 2 + r.D / 2) / CELL);
    for (let z = Math.max(0, z0); z < Math.min(nz, z1); z++)
      for (let x = Math.max(0, x0); x < Math.min(nx, x1); x++) if (grid[z * nx + x]) return false;
    return true;
  };

  // keep the doorways clear, and a metre of floor in front of each
  for (const o of def.openings) {
    const clear = 1.15;
    if (o.wall === 'north') markRect(o.at, -r.D / 2 + clear / 2, o.w + 0.7, clear);
    else if (o.wall === 'south') markRect(o.at, r.D / 2 - clear / 2, o.w + 0.7, clear);
    else if (o.wall === 'west') markRect(-r.W / 2 + clear / 2, o.at, clear, o.w + 0.7);
    else markRect(r.W / 2 - clear / 2, o.at, clear, o.w + 0.7);
  }

  // and nothing goes where the player is standing when the lights come on
  if (def._start) markRect(def._start[0], def._start[1], 1.3, 1.3);

  const wallRot = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

  function attempt(kind, where, fpOverride) {
    const fp = fpOverride || PROP_INFO[kind] || [0.5, 0.5];
    for (let tries = 0; tries < 22; tries++) {
      let x, z, rot = 0, w = fp[0], d = fp[1];
      if (where === 'wall') {
        const side = rpick(['north', 'south', 'east', 'west']);
        rot = wallRot[side];
        if (side === 'east' || side === 'west') { w = fp[1]; d = fp[0]; }
        const inset = (side === 'east' || side === 'west') ? w / 2 + 0.1 : d / 2 + 0.1;
        if (side === 'north') { z = -r.D / 2 + inset; x = rr(-r.W / 2 + w / 2 + 0.2, r.W / 2 - w / 2 - 0.2); }
        else if (side === 'south') { z = r.D / 2 - inset; x = rr(-r.W / 2 + w / 2 + 0.2, r.W / 2 - w / 2 - 0.2); }
        else if (side === 'west') { x = -r.W / 2 + inset; z = rr(-r.D / 2 + d / 2 + 0.2, r.D / 2 - d / 2 - 0.2); }
        else { x = r.W / 2 - inset; z = rr(-r.D / 2 + d / 2 + 0.2, r.D / 2 - d / 2 - 0.2); }
      } else if (where === 'corner') {
        const sx = rchance(0.5) ? -1 : 1, sz = rchance(0.5) ? -1 : 1;
        x = sx * (r.W / 2 - Math.max(w, d) / 2 - 0.25);
        z = sz * (r.D / 2 - Math.max(w, d) / 2 - 0.25);
        rot = rr(0, Math.PI * 2);
        w = d = Math.max(w, d);
      } else if (where === 'centre') {
        x = rr(-r.W / 6, r.W / 6); z = rr(-r.D / 6, r.D / 6); rot = rr(0, Math.PI * 2);
        w = d = Math.max(w, d);
      } else {
        x = rr(-r.W / 2 + w, r.W / 2 - w); z = rr(-r.D / 2 + d, r.D / 2 - d);
        rot = rr(0, Math.PI * 2);
        w = d = Math.max(w, d);
      }
      if (!freeRect(x, z, w, d)) continue;
      markRect(x, z, w, d, 0.05);
      return { x, z, rot, fp };
    }
    return null;
  }

  // things on top of other things
  function putOn(entry, placed, kind) {
    if (!entry.on) return;
    const surfaceY = { table: 0.79, sideboard: 0.86, workbench: 0.94, units: 0.9, shelfRun: 0 }[kind] || 0.8;
    if (!surfaceY) return;
    const fp = PROP_INFO[kind];
    for (const [what, lo, hi] of entry.on) {
      const n = ri(lo, hi);
      for (let i = 0; i < n; i++) {
        def.props.push({
          p: what, y: surfaceY,
          at: [placed.x + rr(-fp[0] / 2 + 0.12, fp[0] / 2 - 0.12), placed.z + rr(-fp[1] / 2 + 0.1, fp[1] / 2 - 0.1)],
          rot: rr(0, Math.PI * 2)
        });
      }
    }
  }

  for (const entry of t.dress) {
    if (entry.p === 'scatter') {
      const n = ri(entry.n[0], entry.n[1]);
      for (let i = 0; i < n; i++) {
        const kind = rpick(SMALL);
        const p = attempt(kind, 'floor');
        if (p) def.props.push({ p: kind, at: [p.x, p.z], rot: p.rot });
      }
      continue;
    }
    if (entry.where === 'hang') {
      const n = ri(entry.n[0], entry.n[1]);
      for (let i = 0; i < n; i++) {
        const side = rpick(['north', 'south', 'east', 'west']);
        const along = (side === 'east' || side === 'west') ? r.D : r.W;
        const at = rr(-along / 2 + 0.5, along / 2 - 0.5);
        if (def.openings.some(o => o.wall === side && Math.abs(o.at - at) < o.w / 2 + 0.45)) continue;
        if (entry.p === 'picture') def.props.push({ p: 'picture', wall: side, at: [+at.toFixed(2), rr(1.45, Math.min(1.95, r.H - 0.55))], w: rr(0.35, 0.9), h: rr(0.3, 0.85) });
        else def.props.push({ p: entry.p, wall: side, at: [+at.toFixed(2), 1.6] });
      }
      continue;
    }
    const n = ri(entry.n[0], entry.n[1]);
    for (let i = 0; i < n; i++) {
      let bays = 0, fp = null;
      if (entry.p === 'shelfRun') {
        bays = ri(2, Math.max(2, Math.min(5, Math.floor((Math.min(r.W, r.D) - 1.2) / 1.05))));
        fp = [0.75, bays * 1.02 + 0.15];
      }
      const p = attempt(entry.p, entry.where, fp);
      if (!p) continue;
      const spec = { p: entry.p, at: [+p.x.toFixed(2), +p.z.toFixed(2)], rot: +p.rot.toFixed(3) };
      if (entry.p === 'crateStack') spec.n = ri(1, 4);
      if (entry.p === 'shelfRun') spec.n = bays;
      if (entry.p === 'rug') spec.size = [rr(1.8, Math.min(3.4, r.W - 1)), rr(1.4, Math.min(2.6, r.D - 1))];
      def.props.push(spec);
      putOn(entry, p, entry.p);
    }
  }

  if (def._lamp) {
    const p = attempt('standardLamp', 'corner');
    if (p) def.props.push({ p: 'standardLamp', at: [+p.x.toFixed(2), +p.z.toFixed(2)] });
  }

  // --- the second pass over the walls: mould, splats, torn paper ----------
  const dn = ri(t.decals[0], t.decals[1]);
  for (let i = 0; i < dn; i++) {
    const side = rpick(['north', 'south', 'east', 'west']);
    const along = (side === 'east' || side === 'west') ? r.D : r.W;
    const at = rr(-along / 2 + 0.4, along / 2 - 0.4);
    if (def.openings.some(o => o.wall === side && Math.abs(o.at - at) < o.w / 2 + 0.3)) continue;
    const kind = rpick(['mould', 'mould', 'splat', 'poster', 'poster']);
    const size = kind === 'poster' ? rr(0.5, 0.85) : rr(0.5, 1.7);
    const y = kind === 'poster' ? rr(1.1, Math.min(1.9, r.H - 0.6))
            : kind === 'mould' ? (rchance(0.5) ? rr(0.15, 0.9) : rr(r.H - 1.1, r.H - 0.25))
            : rr(0.3, 1.6);
    def.props.push({ p: 'decal', kind, wall: side, at: [+at.toFixed(2), +y.toFixed(2)], size: +size.toFixed(2), rot: rchance(0.5) ? 0 : rr(-0.35, 0.35) });
  }

  // and grime on the floor, which no amount of light makes look clean
  if (rchance(0.5)) def.props.push({ p: 'floorGrime', at: [rr(-r.W / 4, r.W / 4), rr(-r.D / 4, r.D / 4)], size: rr(1.5, Math.min(4, r.W)) });
}
