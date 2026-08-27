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
        for (const o of s.openings) {
          if (o.blocked) continue;
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
            const hit = rc.intersectObjects(VK.scene.children, true).filter(h => !h.object.userData.noRay)[0];
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
      const a = VK.PORTALS[0], bq = a.other;
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
