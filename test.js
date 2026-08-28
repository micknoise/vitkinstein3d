const { chromium } = require('playwright');
let fails = 0;
const assert = (c, m) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + m); };

const SEEDS = process.argv[2] ? [process.argv[2]] : [7, 1234, 99999, 424242, 8675309];

(async () => {
  const b = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  for (const seed of SEEDS) {
    console.log('\nhouse ' + seed);
    const p = await b.newPage({ viewport: { width: 480, height: 300 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + __dirname + '/index.html?seed=' + seed);
    await p.waitForFunction(() => !!window.VK, null, { timeout: 60000 });
    await p.evaluate(() => document.getElementById('title').style.display = 'none');

    // --- the building ------------------------------------------------------
    const plan = await p.evaluate(() => {
      const rooms = Object.entries(VK.spaces).map(([k, s]) => ({
        k, type: s._type, W: s.size[0], H: s.size[1], D: s.size[2], ox: s.origin[0], oz: s.origin[1],
        openings: s.openings, props: s.props.length, lights: s.lights.length
      }));
      return { rooms, count: VK.count() };
    });
    assert(plan.rooms.length >= 8, plan.rooms.length + ' rooms generated');

    let overlap = null;
    for (let i = 0; i < plan.rooms.length && !overlap; i++)
      for (let j = i + 1; j < plan.rooms.length; j++) {
        const a = plan.rooms[i], c = plan.rooms[j];
        if (Math.abs(a.ox - c.ox) < (a.W + c.W) / 2 - 0.05 && Math.abs(a.oz - c.oz) < (a.D + c.D) / 2 - 0.05) { overlap = a.k + ' / ' + c.k; break; }
      }
    assert(!overlap, 'no two rooms occupy the same space' + (overlap ? ' — ' + overlap : ''));

    // every room reachable from the start, counting portals as connections
    const reach = await p.evaluate(() => {
      const adj = {};
      const keys = Object.keys(VK.spaces);
      keys.forEach(k => adj[k] = new Set());
      const OPP = { north: 'south', south: 'north', east: 'west', west: 'east' };
      // rooms that share a wall plane with aligned openings are connected
      for (const a of keys) for (const c of keys) {
        if (a === c) continue;
        const A = VK.spaces[a], C = VK.spaces[c];
        for (const oa of A.openings) {
          if (oa.blocked) continue;
          for (const oc of C.openings) {
            if (oc.blocked || oc.wall !== OPP[oa.wall]) continue;
            const ax = oa.wall === 'north' || oa.wall === 'south' ? A.origin[0] + oa.at : A.origin[1] + oa.at;
            const cx = oc.wall === 'north' || oc.wall === 'south' ? C.origin[0] + oc.at : C.origin[1] + oc.at;
            const near = Math.abs(ax - cx) < 0.4;
            const touching = Math.abs((oa.wall === 'north' ? A.origin[1] - A.size[2] / 2 : oa.wall === 'south' ? A.origin[1] + A.size[2] / 2 : oa.wall === 'west' ? A.origin[0] - A.size[0] / 2 : A.origin[0] + A.size[0] / 2)
              - (oc.wall === 'north' ? C.origin[1] - C.size[2] / 2 : oc.wall === 'south' ? C.origin[1] + C.size[2] / 2 : oc.wall === 'west' ? C.origin[0] - C.size[0] / 2 : C.origin[0] + C.size[0] / 2)) < 0.5;
            if (near && touching) { adj[a].add(c); adj[c].add(a); }
          }
        }
      }
      VK.PORTALS.forEach(pt => { adj[pt.space].add(pt.other.space); adj[pt.other.space].add(pt.space); });
      const start = VK.player().space || keys[0];
      const seen = new Set([start]), q = [start];
      while (q.length) for (const n of adj[q.pop()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
      return { seen: seen.size, total: keys.length, missing: keys.filter(k => !seen.has(k)) };
    });
    assert(reach.seen === reach.total, 'every room is reachable (' + reach.seen + '/' + reach.total + ')' + (reach.missing.length ? ' missing ' + reach.missing.join(',') : ''));

    // --- the body ----------------------------------------------------------
    const st = await p.evaluate(() => { VK.tick(60); return VK.player(); });
    assert(Math.abs(st.pos[1] - 0.34) < 0.15, 'player rests on the floor (y=' + st.pos[1].toFixed(2) + ')');
    assert(!!st.space, 'player starts inside a room (' + st.space + ')');

    const moved = await p.evaluate(() => {
      // whichever way is not immediately a wall
      let best = 0;
      for (const k of ['KeyW', 'KeyA', 'KeyD', 'KeyS']) {
        const a = VK.player().pos; VK.press(k, true); VK.tick(90); VK.press(k, false); VK.tick(20);
        const c = VK.player().pos;
        best = Math.max(best, Math.hypot(c[0] - a[0], c[2] - a[2]));
      }
      return best;
    });
    assert(moved > 1.2, 'walking moves you (' + moved.toFixed(2) + 'm in 1.5s)');

    const forward = await p.evaluate(() => {
      VK.go(VK.spaces[Object.keys(VK.spaces)[0]].origin[0], 0.36, VK.spaces[Object.keys(VK.spaces)[0]].origin[1]);
      return true;
    });

    const inside = await p.evaluate(() => {
      VK.press('KeyW', true); VK.tick(60 * 8); VK.press('KeyW', false);
      const pl = VK.player();
      const anyRoom = Object.values(VK.spaces).some(s =>
        Math.abs(pl.pos[0] - s.origin[0]) < s.size[0] / 2 + 0.4 && Math.abs(pl.pos[2] - s.origin[1]) < s.size[2] / 2 + 0.4);
      return { anyRoom, y: pl.pos[1] };
    });
    assert(inside.anyRoom, 'you cannot walk out of the building');
    assert(inside.y > -0.5, 'you cannot fall through the floor (y=' + inside.y.toFixed(2) + ')');

    // --- hands -------------------------------------------------------------
    // try a handful of nearby objects -- some will be behind a shelf, which is
    // the world working correctly, not the grab failing
    const grab = await p.evaluate(() => {
      const cands = [];
      VK.grabbables.forEach(o => {
        cands.push({ o, d: o.position.distanceTo(VK.camera.position) });
      });
      cands.sort((a, b) => a.d - b.d);
      let tried = 0;
      for (const c of cands.slice(0, 10)) {
        tried++;
        const t = c.o.position.clone();
        for (const off of [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]) {
          VK.go(t.x + off[0], 0.36, t.z + off[1]);
          VK.tick(3);
          VK.aimAt(t.x, t.y, t.z);
          if (!VK.grab()) continue;
          VK.tick(45);
          const h = VK.held();
          return { ok: true, tried, d: h ? Math.hypot(h.pos[0] - VK.camera.position.x, h.pos[1] - VK.camera.position.y, h.pos[2] - VK.camera.position.z) : -1 };
        }
      }
      return { ok: false, tried, d: -1, why: 'nothing in reach could be taken' };
    });
    assert(grab.ok, 'you can pick something up (tried ' + grab.tried + ')' + (grab.why ? ' — ' + grab.why : ''));
    assert(grab.d > 0 && grab.d < 1.6, 'it stays in your hands (' + (grab.d > 0 ? grab.d.toFixed(2) + 'm' : 'dropped') + ')');
    assert(await p.evaluate(() => { VK.hurl(); VK.tick(90); return VK.held() === null; }), 'throwing lets go of it');

    // --- doors -------------------------------------------------------------
    const dr = await p.evaluate(() => { VK.openAll(); VK.tick(150); return { n: VK.doors.length, open: VK.doors.filter(d => d.t > 0.9).length }; });
    assert(dr.n > 0 && dr.open === dr.n, dr.n + ' doors, all swing fully open');

    // --- trim must not cross a doorway -------------------------------------
    const trim = await p.evaluate(() => {
      const T = VK.THREE;
      const bad = [];
      let checked = 0;
      for (const [k, s] of Object.entries(VK.spaces)) {
        if (!s.dado && !s.skirting) continue;
        // a stairwell's floor is a staircase: a ray fired across it at skirting
        // height hits the flight, which is the flight doing its job
        if (s.stairs) continue;
        for (const o of s.openings) {
          // anything with a sill is supposed to have wall under it -- that is
          // the difference between a window, or a door at the head of a
          // staircase, and a doorway
          if (o.blocked || o.sill > 0.3) continue;
          const [W, , D] = s.size, [ox, oz] = s.origin;
          let c, n;
          if (o.wall === 'north') { c = new T.Vector3(ox + o.at, 0, oz - D / 2); n = new T.Vector3(0, 0, -1); }
          else if (o.wall === 'south') { c = new T.Vector3(ox + o.at, 0, oz + D / 2); n = new T.Vector3(0, 0, 1); }
          else if (o.wall === 'west') { c = new T.Vector3(ox - W / 2, 0, oz + o.at); n = new T.Vector3(-1, 0, 0); }
          else { c = new T.Vector3(ox + W / 2, 0, oz + o.at); n = new T.Vector3(1, 0, 0); }
          for (const y of [0.09, 1.0]) {          // skirting height, dado height
            if (y > o.h) continue;
            const origin = c.clone().addScaledVector(n, -1.0); origin.y = y;
            const rc = new T.Raycaster(origin, n.clone(), 0.01, 1.35);
            // Only static trim counts. Earlier checks in this run throw things
            // about and swing every door open, so by now an object may be
            // sitting in a doorway -- which is a mug in a doorway, not a dado
            // rail across one.
            const loose = o => { let x = o; while (x) { if (x.userData && x.userData.grabbable) return true; x = x.parent; } return false; };
            const hit = rc.intersectObjects(VK.scene.children, true)
              .filter(h => !h.object.userData.noRay && !loose(h.object))[0];
            checked++;
            if (hit && hit.distance < 1.25) bad.push(k + ' ' + o.wall + ' @' + y + ' hit at ' + hit.distance.toFixed(2));
          }
        }
      }
      return { checked, bad: bad.slice(0, 4), n: bad.length };
    });
    assert(trim.n === 0, 'no skirting or dado runs across a doorway (' + trim.checked + ' checked)' + (trim.n ? ' — ' + trim.bad.join('; ') : ''));

    // --- portals -----------------------------------------------------------
    const port = await p.evaluate(() => {
      if (!VK.PORTALS.length) return { none: true };
      const a = (VK.PORTALS.find(q => q.pos.y < 2) || VK.PORTALS[0]), bq = a.other;
      const before = a.pos.clone();
      // stand a metre in front of face A, facing it, and walk
      const p0 = a.pos.clone().addScaledVector(a.normal, 1.1);
      VK.go(p0.x, 0.36, p0.z);
      VK.aimAt(a.pos.x, 0.36 + 1.28, a.pos.z);
      VK.press('KeyW', true); VK.tick(150); VK.press('KeyW', false); VK.tick(20);
      const pl = VK.player();
      const dFromA = Math.hypot(pl.pos[0] - before.x, pl.pos[2] - before.z);
      const dFromB = Math.hypot(pl.pos[0] - bq.pos.x, pl.pos[2] - bq.pos.z);
      return { dFromA, dFromB, space: pl.space, target: bq.space };
    });
    if (port.none) assert(false, 'the building has portals');
    else {
      assert(port.dFromB < 4.0, 'walking into a portal puts you at its far side (' + port.dFromB.toFixed(2) + 'm from it)');
      assert(port.space === port.target, 'and in the room that door opens onto (' + port.space + ')');
    }

    // --- how far in you are, and what it does to you --------------------------
    // The pass is meant to be present in the first room and much worse a long
    // way in, and "a long way in" means doors, not metres -- a portal can put
    // the far side of the house one step away. See PLAN C1.
    const vision = await p.evaluate(async () => {
      const raf = () => new Promise(r => requestAnimationFrame(() => r()));
      const depths = VK.roomDepths();
      const start = VK.spaces[Object.keys(VK.spaces)[0]] ? null : null;
      const vals = Object.keys(VK.spaces).map(k => ({ k, d: depths[k], dose: VK.doseFor(k) }));
      const reachable = vals.filter(v => v.d <= 90);
      const near = reachable.filter(v => v.d === 0);
      const far = reachable.filter(v => v.d >= 3);
      // it has to actually move when you walk in
      for (let i = 0; i < 3; i++) await raf();
      const rt = VK.renderer.getRenderTarget();
      return {
        rooms: vals.length, reachable: reachable.length,
        atStart: near.length ? near[0].dose : null,
        deepest: Math.max(...reachable.map(v => v.dose)),
        spread: far.length ? Math.min(...far.map(v => v.dose)) - (near.length ? near[0].dose : 0) : null,
        onScreen: rt === null,
        lost: VK.renderer.getContext().isContextLost()
      };
    });
    assert(vision.lost === false, 'the vision pass does not lose the context');
    assert(vision.onScreen, 'and hands the canvas back when it has finished with it');
    assert(vision.atStart !== null && vision.atStart > 0.05 && vision.atStart < 0.35,
      'it is already there in the room you wake up in (' + (vision.atStart || 0).toFixed(2) + ')');
    assert(vision.deepest > 0.85,
      'and as bad as it gets a long way in (' + vision.deepest.toFixed(2) + ')');
    if (vision.spread !== null)
      assert(vision.spread > 0.15,
        'and it is measurably worse three doors from the start (+' + vision.spread.toFixed(2) + ')');
    assert(vision.reachable === vision.rooms,
      'every room has a depth, so nowhere is permanently at maximum by accident');

    // --- you climb the stairs and arrive on the ground floor (E3) ------------
    const stairs = await p.evaluate(() => {
      const key = VK.stats.stairwell;
      if (!key) return { none: true };
      const sp = VK.spaces[key], st = sp.stairs;
      const [W, , D] = sp.size, [ox, oz] = sp.origin;
      const n = { north: [0, 0, 1], south: [0, 0, -1], west: [1, 0, 0], east: [-1, 0, 0] }[st.wall];
      let wx, wz;
      if (st.wall === 'north') { wx = ox + st.at; wz = oz - D / 2; }
      else if (st.wall === 'south') { wx = ox + st.at; wz = oz + D / 2; }
      else if (st.wall === 'west') { wx = ox - W / 2; wz = oz + st.at; }
      else { wx = ox + W / 2; wz = oz + st.at; }

      // stand at the foot of the flight, face the head of it, and walk
      const out = st.landing + st.run - 0.4;
      VK.go(wx + n[0] * out, 0.36, wz + n[2] * out, Math.atan2(n[0], n[2]), 0);
      VK.tick(40);
      let highest = 0, leftAt = null;
      VK.press('KeyW', true);
      for (let i = 0; i < 200; i++) {
        VK.tick(2);
        const pl = VK.player();
        highest = Math.max(highest, pl.pos[1]);
        if (pl.space !== key) { leftAt = { space: pl.space, y: pl.pos[1] }; break; }
        if (pl.pos[1] < -0.5) break;
      }
      VK.press('KeyW', false);
      return { key, top: st.top, highest, leftAt };
    });
    if (!stairs.none) {
      assert(stairs.highest > stairs.top - 0.4,
        'you can walk up the stairs (' + stairs.highest.toFixed(2) + 'm of a ' + stairs.top + 'm climb)');
      assert(stairs.leftAt !== null && stairs.leftAt.space !== stairs.key,
        'and out through the door at the top of them' + (stairs.leftAt ? ' into ' + stairs.leftAt.space : ''));
      if (stairs.leftAt) assert(stairs.leftAt.y < 1.0,
        'and you are on the ground floor again, having gone up (y=' + stairs.leftAt.y.toFixed(2) + ')');
    }

    // --- the window, and what is not outside it (E2) -------------------------
    const win = await p.evaluate(() => {
      const key = VK.stats.window;
      if (!key) return { none: true };
      const sp = VK.spaces[key];
      const o = sp.openings.find(x => x.window);
      if (!o) return { missing: true };
      const [W, H, D] = sp.size, [ox, oz] = sp.origin;

      // you must not be able to get out through it: there has to be wall under
      // the sill, and glass in the hole
      const T = VK.THREE;
      let wx, wz, nx, nz;
      if (o.wall === 'north') { wx = ox + o.at; wz = oz - D / 2; nx = 0; nz = 1; }
      else if (o.wall === 'south') { wx = ox + o.at; wz = oz + D / 2; nx = 0; nz = -1; }
      else if (o.wall === 'west') { wx = ox - W / 2; wz = oz + o.at; nx = 1; nz = 0; }
      else { wx = ox + W / 2; wz = oz + o.at; nx = -1; nz = 0; }

      const shoot = (y) => {
        const from = new T.Vector3(wx + nx * 1.6, y, wz + nz * 1.6);
        const rc = new T.Raycaster(from, new T.Vector3(-nx, 0, -nz), 0.01, 3.0);
        const hit = rc.intersectObjects(VK.scene.children, true).filter(h => !h.object.userData.noRay)[0];
        return hit ? +hit.distance.toFixed(2) : null;
      };
      // walk at the window and you hit the wall under it
      VK.go(wx + nx * 2.2, 0.36, wz + nz * 2.2, Math.atan2(-nx, -nz), 0);
      VK.tick(20);
      VK.press('KeyW', true); VK.tick(150); VK.press('KeyW', false); VK.tick(10);
      const pl = VK.player();
      const outside = (pl.pos[0] - wx) * nx + (pl.pos[2] - wz) * nz;   // >0 is still inside

      return { key, sill: o.sill, top: o.h,
               belowSill: shoot(o.sill * 0.5), throughGlass: shoot((o.sill + o.h) / 2), outside };
    });
    if (!win.none && !win.missing) {
      assert(win.sill > 0.5, 'the window has a sill to it, and is not a doorway (' + win.sill + 'm)');
      assert(win.belowSill !== null && win.belowSill < 2.0, 'there is wall under it');
      assert(win.throughGlass !== null && win.throughGlass < 2.0, 'and glass in it, so nothing goes out');
      assert(win.outside > 0.2, 'and you cannot walk out through it (' + win.outside.toFixed(2) + 'm inside)');
    }

    // --- sound comes from where the thing happened (C2) ----------------------
    // Your own feet and your own hands happen at the listener, so a panner on
    // them would cost a node and do nothing.
    const sound = await p.evaluate(() => {
      const T = VK.THREE;
      const AC = window.AudioContext || window.webkitAudioContext;
      let panners = 0;
      const orig = AC.prototype.createPanner;
      AC.prototype.createPanner = function (...a) { panners++; return orig.apply(this, a); };
      try {
        VK.Audio.start();
        const before = panners;
        VK.Audio.impact(3, 1.0, [1, 1, 5], 'ceramic', 0.12);   // a mug, somewhere
        const placed = panners - before;
        VK.Audio.step('tile');                    // your own feet
        VK.Audio.blip(0, 0, 0.05);                // your own hand, at your own ear
        const unplaced = panners - before - placed;
        VK.Audio.listen(new T.Vector3(1, 1.2, 2), new T.Vector3(0, 0, -1), new T.Vector3(0, 1, 0));
        return { placed, unplaced, listened: true };
      } finally {
        AC.prototype.createPanner = orig;
      }
    });
    assert(sound.placed === 1, 'a mug dropped across the room is played from where it is');

    // and it has to know what it dropped. A mug and a length of pipe are the
    // same event to the physics and completely different sounds.
    const mats = await p.evaluate(() => {
      const seen = {};
      let sized = 0, total = 0;
      for (const b of VK.world.bodies) {
        if (!(b.mass > 0) || !b.threeObj) continue;
        total++;
        seen[b.sndClass || 'none'] = (seen[b.sndClass || 'none'] || 0) + 1;
        if (b.sndSize > 0.01 && b.sndSize < 6) sized++;
      }
      return { seen, sized, total, kinds: Object.keys(seen).length };
    });
    assert(!mats.seen.none && mats.kinds >= 3,
      'everything you can pick up knows what it is made of (' +
      Object.entries(mats.seen).map(([k, v]) => k + ' ' + v).join(', ') + ')');
    assert(mats.sized === mats.total,
      'and roughly how big it is, which is what sets the pitch (' + mats.sized + '/' + mats.total + ')');
    assert(sound.unplaced === 0, 'and your own footsteps are not (' + sound.unplaced + ' pointless panners)');

    // --- the sounds are drawn once, and there is more than one of each --------
    // They used to be synthesised per hit from a bank of resonators, which is
    // physically right and sounds like a syndrum, and cost a filter graph every
    // time something touched something. Now they are drawn at load like the
    // textures are, and playing one is a single node.
    const banks = await p.evaluate(async () => {
      VK.Audio.start();
      await new Promise(r => setTimeout(r, 120));
      const sfx = VK.Audio.sfx;
      const out = {};
      for (const k in sfx) out[k] = { n: sfx[k].length, sec: +sfx[k][0].duration.toFixed(2),
        peak: +Math.max(...sfx[k].map(b => { const d = b.getChannelData(0); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; })).toFixed(2) };
      const keys = Object.keys(VK.spaces);
      const here = VK.player().space || keys[0];
      const nb = (VK.roomGraph[here] || [])[0];
      const far = keys.find(x => x !== here && x !== nb && (VK.roomGraph[here] || []).indexOf(x) < 0);
      const at = k => { const sp = VK.spaces[k]; return [sp.origin[0], 1, sp.origin[1]]; };
      return { out, kinds: Object.keys(out).length, noThrough: typeof VK.Audio.through === 'undefined',
        thin: Object.entries(out).filter(([, v]) => v.n < 2 || v.peak < 0.05).map(([k]) => k),
        same: VK.Audio.occlusion(at(here)).cut,
        near: nb ? VK.Audio.occlusion(at(nb)).cut : null,
        away: far ? VK.Audio.occlusion(at(far)).cut : null };
    });
    assert(banks.kinds >= 8,
      'there is a drawn sound for every kind of thing (' + banks.kinds + ' banks)');
    // Crossing a fold makes no sound at all. Everything else about a traversal
    // is built to be unnoticeable; a noise at the moment it happens is the one
    // thing that tells you it happened.
    assert(!('through' in banks.out) && banks.noThrough,
      'and none for going through a portal, which has to be silent');
    assert(banks.thin.length === 0,
      'each with more than one take, and audible' + (banks.thin.length ? ' — thin: ' + banks.thin.join(', ') : ''));
    if (banks.near !== null && banks.away !== null)
      assert(banks.same > banks.near && banks.near > banks.away,
        'a sound loses its top end through a wall (' + banks.same + ' / ' + banks.near + ' / ' + banks.away + 'Hz)');

    // --- the house changes behind your back, and only its own things (A1a) ---
    const drift = await p.evaluate(() => {
      const T = VK.THREE;
      VK.tick(600);                       // settle, so nothing is moving of its own accord
      const grabs = [];
      VK.scene.traverse(o => { if (o.userData && o.userData.grabbable) grabs.push(o); });
      const before = grabs.map(g => g.getWorldPosition(new T.Vector3()).clone());
      const start = VK.driftCount;

      // drift every room over and over, with the player standing still. No
      // physics runs in between, so anything that has moved was moved by the
      // house rather than by settling.
      const keys = Object.keys(VK.spaces);
      for (let round = 0; round < 14; round++) for (const k of keys) VK.drift(k);

      let moved = 0, worst = 0;
      for (let i = 0; i < grabs.length; i++) {
        const d = before[i].distanceTo(grabs[i].getWorldPosition(new T.Vector3()));
        if (d > 1e-6) moved++;
        worst = Math.max(worst, d);
      }

      // and no room may be left with every light out
      const per = {};
      for (const l of VK.allLights) {
        if (!l.space || !l.glow || !l.base) continue;
        per[l.space] = per[l.space] || { on: 0, total: 0 };
        per[l.space].total++;
        if (l.intensity > 0) per[l.space].on++;
      }
      const blacked = Object.entries(per).filter(([, v]) => v.on === 0).map(([k]) => k);
      return { drifts: VK.driftCount - start, moved, worst, blacked, objects: grabs.length };
    });
    assert(drift.drifts > 0, 'leaving a room can change it behind your back (' + drift.drifts + ' changes)');
    assert(drift.moved === 0, 'and it never moves anything you can pick up (' + drift.moved + ' of ' +
      drift.objects + ' moved' + (drift.moved ? ', worst ' + drift.worst.toFixed(2) + 'm' : '') + ')');
    assert(drift.blacked.length === 0, 'and never puts every light in a room out (' +
      (drift.blacked.length ? drift.blacked.join(', ') : 'none dark') + ')');

    // --- every doorway has to fit in the wall it is cut into ------------------
    // A doorway placed past the end of its wall is not a doorway. The wall
    // builder clips it, leaving a slot you can see through and not walk
    // through, and whatever was on the other side is sealed off. The
    // reachability check does not catch it: that reads the plan, where the two
    // openings line up perfectly, not the geometry that gets built.
    const fits = await p.evaluate(() => {
      const T = 0.14, bad = [];
      let checked = 0;
      for (const [k, sp] of Object.entries(VK.spaces)) {
        const [W, H, D] = sp.size;
        for (const o of sp.openings) {
          const along = (o.wall === 'east' || o.wall === 'west') ? D : W;
          checked++;
          if (Math.abs(o.at) + o.w / 2 > along / 2 - T)
            bad.push(k + ' ' + o.wall + ' at ' + o.at + ' w ' + o.w + ' in a wall ' + along.toFixed(1) + ' long');
          if (o.h > H) bad.push(k + ' ' + o.wall + ' is ' + o.h + ' high in a room ' + H + ' high');
        }
      }
      return { checked, bad: bad.slice(0, 4), n: bad.length };
    });
    assert(fits.n === 0, 'every doorway fits inside the wall it is cut into (' + fits.checked + ' checked)' +
      (fits.n ? ' — ' + fits.bad.join('; ') : ''));

    // --- you cannot fall out of the world by walking about -------------------
    // Twice now a portal has fired for a player nowhere near its doorway, and
    // both times the symptom was the same: you walk through an ordinary room,
    // drop through the floor and the screen goes black. So walk every room in
    // four directions and check nobody ever leaves the floor.
    const sweep = await p.evaluate(() => {
      const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const bad = [];
      let walks = 0;
      for (const [key, sp] of Object.entries(VK.spaces)) {
        for (const yaw of dirs) {
          VK.goSpace(key);
          VK.tick(15);
          let lowest = 9;
          VK.go(VK.player().pos[0], 0.36, VK.player().pos[2], yaw, 0);
          VK.press('KeyW', true);
          for (let i = 0; i < 24; i++) { VK.tick(5); lowest = Math.min(lowest, VK.player().pos[1]); }
          VK.press('KeyW', false);
          walks++;
          if (lowest < -0.4) bad.push(key + ' facing ' + yaw.toFixed(2) + ' fell to ' + lowest.toFixed(1));
        }
      }
      return { walks, bad: bad.slice(0, 4), n: bad.length };
    });
    assert(sweep.n === 0, 'walking every room in four directions never drops you out of the world (' +
      sweep.walks + ' walks)' + (sweep.n ? ' — ' + sweep.bad.join('; ') : ''));

    // --- the corridor that returns to itself (B3) ----------------------------
    const loop = await p.evaluate(() => {
      const key = VK.stats.loopCorridor;
      if (!key) return { none: true };
      const pair = VK.PORTALS.filter(q => q.space === key && q.other.space === key);
      if (pair.length !== 2) return { unpaired: pair.length };
      const [a, b] = pair;
      const len = a.pos.distanceTo(b.pos);
      // stand just inside one end, facing the other, and walk the length of it
      const at = a.pos.clone().addScaledVector(a.normal, 1.2);
      VK.go(at.x, 0.36, at.z, Math.atan2(-(a.pos.x - at.x), -(a.pos.z - at.z)), 0);
      VK.tick(20);
      VK.press('KeyW', true); VK.tick(120); VK.press('KeyW', false); VK.tick(2);
      const pl = VK.player();
      const here = new VK.THREE.Vector3(pl.pos[0], pl.pos[1], pl.pos[2]);
      return { key, len, space: pl.space, fromFar: here.distanceTo(b.pos), fromNear: here.distanceTo(a.pos) };
    });
    if (!loop.none && !loop.unpaired) {
      assert(loop.len > 6, 'the looping corridor is long enough to be walked (' + loop.len.toFixed(1) + 'm)');
      assert(loop.space === loop.key, 'walking out of one end of it leaves you in the same corridor');
      assert(loop.fromFar < loop.fromNear, 'and back at the other end, having gone nowhere (' +
        loop.fromFar.toFixed(1) + 'm from it, ' + loop.fromNear.toFixed(1) + 'm from the end you left by)');
    }

    // --- the side flags must describe where you are now ----------------------
    // Every face remembers which side of it you were on. Crossing one moves you,
    // which changes that answer for every other face at once. If a flag is left
    // describing where you used to be, the next frame reads the difference as a
    // crossing and puts you through a doorway on the other side of the house.
    const sides = await p.evaluate(() => {
      if (!VK.PORTALS.length) return { none: true };
      const T = VK.THREE;
      const a = (VK.PORTALS.find(q => q.pos.y < 2) || VK.PORTALS[0]);
      const p0 = a.pos.clone().addScaledVector(a.normal, 1.2);
      VK.go(p0.x, 0.36, p0.z);
      VK.aimAt(a.pos.x, 0.36 + 1.28, a.pos.z);
      VK.press('KeyW', true); VK.tick(90); VK.press('KeyW', false); VK.tick(1);
      const cam = VK.camera.position;
      const wrong = [];
      VK.PORTALS.forEach((q, i) => {
        const want = Math.sign(q.normal.dot(new T.Vector3().copy(cam).sub(q.pos))) || 1;
        if (q.side !== want) wrong.push(i + ' says ' + q.side + ', you are on ' + want);
      });
      return { wrong };
    });
    if (!sides.none)
      assert(sides.wrong.length === 0, 'every portal knows which side of it you are on after a crossing' +
        (sides.wrong.length ? ' — ' + sides.wrong.join('; ') : ''));

    // --- the view through a doorway is developed like the doorway -------------
    // The portal's target is linear and so is the scene's, and the vision pass
    // tone-maps the lot once at the end. If this quad tone-maps its own output
    // as well, that output is tone-mapped and gamma-encoded twice and the view
    // through a portal comes out several times brighter than the room it is
    // showing -- which is what playtesters kept reporting.
    const dev = await p.evaluate(() => {
      const u = VK.PORTALS[0].mesh.material.uniforms;
      return { linearOut: u.linearOut.value, exposure: u.exposure.value,
               rendererExposure: VK.renderer.toneMappingExposure };
    });
    assert(dev.linearOut === 1,
      'a portal writes linear and is developed with the room around it');
    assert(Math.abs(dev.exposure - dev.rendererExposure) < 0.01,
      'and when it has to develop its own view, at the same exposure as everything else (' +
      dev.exposure.toFixed(2) + ' vs ' + dev.rendererExposure.toFixed(2) + ')');

    // --- a portal face must not show a view it did not just draw ------------
    // The quad samples its render target in screen space, so drawing it on a
    // frame where the view was not refreshed puts a picture taken from the old
    // camera position across the doorway -- it reads as the view skewing.
    const stale = await p.evaluate(async () => {
      if (!VK.PORTALS.length) return { none: true };
      const raf = () => new Promise(r => requestAnimationFrame(() => r()));
      const a = (VK.PORTALS.find(q => q.pos.y < 2) || VK.PORTALS[0]);
      const look = at => {
        VK.go(at.x, 0.36, at.z, Math.atan2(-(a.pos.x - at.x), -(a.pos.z - at.z)), 0);
        VK.tick(2);
      };
      look(a.pos.clone().addScaledVector(a.normal, 2.0));
      for (let i = 0; i < 8; i++) await raf();
      const inFront = a.mesh.visible;
      look(a.pos.clone().addScaledVector(a.normal, -0.9));
      for (let i = 0; i < 8; i++) await raf();
      return { inFront, behind: a.mesh.visible };
    });
    if (!stale.none) {
      assert(stale.inFront === true, 'a portal face is drawn when you are in front of it');
      assert(stale.behind === false, 'and not drawn from behind its own plane, where its view is stale');
    }

    // --- what you are holding is drawn while it straddles the fold ----------
    // The object reaches the plane before the camera does. It is put through
    // the fold for the length of the portal pass so the portal camera sees it;
    // if that transform is ever not undone, the thing in your hands walks away
    // from you, which is a far worse bug than the one it fixes.
    const straddle = await p.evaluate(async () => {
      if (!VK.PORTALS.length) return { none: true };
      const T = VK.THREE;
      const raf = () => new Promise(r => requestAnimationFrame(() => r()));
      const a = (VK.PORTALS.find(q => q.pos.y < 2) || VK.PORTALS[0]);
      const grabs = [];
      VK.scene.traverse(o => { if (o.userData && o.userData.grabbable) grabs.push(o); });
      const stand = a.pos.clone().addScaledVector(a.normal, 2.6);
      VK.go(stand.x, 0.36, stand.z, Math.atan2(-(a.pos.x - stand.x), -(a.pos.z - stand.z)), 0);
      VK.tick(30);
      // Nearest first, but confirm it is still in your hands after turning back
      // to face the portal: something picked up behind you is stretched past
      // arm's reach by the turn and let go, and then the walk proves nothing.
      const byDist = grabs
        .map(g => ({ g, d: g.getWorldPosition(new T.Vector3()).distanceTo(stand) }))
        .sort((x, y) => x.d - y.d).slice(0, 5);
      if (!byDist.length) return { nothing: true };
      let best = null;
      for (const c of byDist) {
        best = c.g;
        const wp = best.getWorldPosition(new T.Vector3());
        VK.aimAt(wp.x, wp.y, wp.z); VK.tick(2);
        if (!VK.grab()) { best = null; continue; }
        VK.aimAt(a.pos.x, a.pos.y, a.pos.z); VK.tick(20);
        if (VK.held()) break;
        best = null;
      }
      if (!best) return { nograb: true };

      // Creep up until the object is through and the camera is not. The window
      // is only as wide as your reach -- about a metre, and it shuts for good
      // once the camera crosses and you are put through -- so step finely
      // enough not to walk over it.
      let straddled = false, drift = 0; const trace = [];
      for (let i = 0; i < 24; i++) {
        VK.press('KeyW', true); VK.tick(5); VK.press('KeyW', false);
        for (let f = 0; f < 3; f++) await raf();
        const body = best.userData.body;
        const objSide = a.normal.dot(best.getWorldPosition(new T.Vector3()).clone().sub(a.pos));
        const camSide = a.normal.dot(VK.camera.position.clone().sub(a.pos));
        // the mesh must be where its body is, every frame, portal pass or not
        drift = Math.max(drift, best.position.distanceTo(new T.Vector3(body.position.x, body.position.y, body.position.z)));
        trace.push(objSide.toFixed(2) + '/' + camSide.toFixed(2) + (VK.held() ? '' : ' dropped'));
        if (objSide < 0 && camSide > 0) { straddled = true; break; }
      }
      VK.drop();
      return { straddled, drift, trace };
    });
    if (!straddle.none && !straddle.nothing && !straddle.nograb) {
      assert(straddle.straddled, 'you can carry an object up to a portal so that it is through and you are not' +
        (straddle.straddled ? '' : ' — obj/cam ' + straddle.trace.slice(-6).join(' ')));
      assert(straddle.drift < 0.01, 'and it stays in your hands while it straddles the fold (' + straddle.drift.toFixed(3) + 'm of drift)');
    }

    // --- an object has to survive the fold too ------------------------------
    // The objects are what players navigate with, so a mug that stops dead at a
    // portal, or stops being drawn once it is through, is a hole in the method.
    const obj = await p.evaluate(() => {
      if (!VK.PORTALS.length) return { none: true };
      const T = VK.THREE;
      const a = (VK.PORTALS.find(q => q.pos.y < 2) || VK.PORTALS[0]);
      const drawn = o => { let x = o; while (x) { if (!x.visible) return false; x = x.parent; } return true; };

      // a body of our own choosing, put in front of the face and pushed through,
      // so the check does not depend on how well a thrown mug happens to fly
      let body = null;
      for (const b of VK.world.bodies) if (b.mass > 0 && b.threeObj) { body = b; break; }
      if (!body) return { noBody: true };
      const start = a.pos.clone().addScaledVector(a.normal, 0.9);
      body.position.set(start.x, a.pos.y, start.z);
      body.velocity.set(-a.normal.x * 4, 0, -a.normal.z * 4);
      body.angularVelocity.set(0, 0, 0);
      body.wakeUp();
      const t0 = VK.bodyTraversals;
      VK.tick(40);
      const wp = body.threeObj.getWorldPosition(new T.Vector3());
      return {
        crossed: VK.bodyTraversals - t0,
        dFromFar: wp.distanceTo(a.other.pos),
        dFromNear: wp.distanceTo(a.pos)
      };
    });
    if (!obj.none && !obj.noBody) {
      assert(obj.crossed > 0, 'an object pushed into a portal comes out the other side');
      assert(obj.dFromFar < obj.dFromNear, 'and it is on the far side, not the near one (' + obj.dFromFar.toFixed(2) + 'm vs ' + obj.dFromNear.toFixed(2) + 'm)');
    }

    // carried through, and still drawn on the other side: an object's mesh
    // belongs to a room group, and the room it was built in is not the room it
    // ends up in
    const carried = await p.evaluate(async () => {
      if (!VK.PORTALS.length) return { none: true };
      const T = VK.THREE;
      const raf = () => new Promise(r => requestAnimationFrame(() => r()));
      const drawn = o => { let x = o; while (x) { if (!x.visible) return false; x = x.parent; } return true; };
      const a = (VK.PORTALS.find(q => q.pos.y < 2) || VK.PORTALS[0]);
      const grabs = [];
      VK.scene.traverse(o => { if (o.userData && o.userData.grabbable) grabs.push(o); });
      const stand = a.pos.clone().addScaledVector(a.normal, 2.4);
      VK.go(stand.x, 0.36, stand.z, Math.atan2(-(a.pos.x - stand.x), -(a.pos.z - stand.z)), 0);
      for (let i = 0; i < 4; i++) await raf();
      let best = null, bd = 1e9;
      for (const g of grabs) {
        const d = g.getWorldPosition(new T.Vector3()).distanceTo(stand);
        if (d < bd) { bd = d; best = g; }
      }
      if (!best) return { nothing: true };
      // the nearest thing is sometimes wedged in furniture and shakes loose the
      // moment it is picked up, which would leave the check passing on nothing.
      // Try the nearest few until one actually stays in your hands.
      const byDist = grabs
        .map(g => ({ g, d: g.getWorldPosition(new T.Vector3()).distanceTo(stand) }))
        .sort((x, y) => x.d - y.d).slice(0, 4);
      // Confirm it is still in your hands *after* turning to face the portal,
      // not before: an object picked up behind you is stretched past arm's
      // reach by the turn and let go, and then the walk proves nothing.
      let holding = false;
      for (const c of byDist) {
        best = c.g;
        const wp = best.getWorldPosition(new T.Vector3());
        VK.aimAt(wp.x, wp.y, wp.z); await raf();
        if (!VK.grab()) continue;
        VK.aimAt(a.pos.x, 1.4, a.pos.z);
        for (let i = 0; i < 8; i++) await raf();
        if (VK.held()) { holding = true; break; }
      }
      if (!holding) return { nograb: true };
      VK.aimAt(a.pos.x, 1.4, a.pos.z);
      VK.press('KeyW', true);
      // only while it is actually in your hands: once it has been put down in
      // another room, not drawing it is the correct answer
      let unseen = 0, frames = 0; const why = [];
      const keyOf = g => { for (const k in VK.roomGroups) if (VK.roomGroups[k] === g) return k; return '?'; };
      for (let i = 0; i < 80; i++) {
        await raf();
        if (!VK.held()) continue;
        frames++;
        if (!drawn(best)) { unseen++; why.push({ i, parent: keyOf(best.parent), roomShown: best.parent.visible, playerIn: VK.player().space }); }
      }
      VK.press('KeyW', false);
      VK.drop();
      return { unseen, frames, why, space: VK.player().space, from: a.space };
    });
    if (!carried.none && !carried.nothing && !carried.nograb)
      assert(carried.unseen === 0 && carried.frames > 0,
        'an object carried through a portal stays drawn (' + carried.unseen + '/' + carried.frames + ' frames missing)' + (carried.unseen ? ' ' + JSON.stringify(carried.why) : ''));

    // --- settling and cleanliness ------------------------------------------
    const settled = await p.evaluate(() => {
      VK.tick(240);
      let moving = 0;
      VK.world.bodies.forEach(bd => { if (bd.mass > 0 && bd.velocity.length() > 0.3) moving++; });
      return moving;
    });
    assert(settled <= 3, 'objects settle instead of jittering (' + settled + ' still moving)');
    assert(errs.length === 0, 'no runtime errors' + (errs.length ? ': ' + errs[0] : ''));
    console.log('        ' + plan.count.bodies + ' bodies, ' + plan.count.meshes + ' meshes, ' + plan.count.grabbable + ' grabbable, ' + plan.count.portals + ' portal faces');
    await p.close();
  }

  console.log(fails ? '\n' + fails + ' FAILING' : '\nall good');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
