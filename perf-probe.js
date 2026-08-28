// Structural perf probe. Reports draw calls / triangles / programs / lights
// per room. Runs under swiftshader so wall-clock is not meaningful, but the
// counts are exactly the numbers the optimisation is aimed at.
const { chromium } = require('playwright');
const TEST_SEEDS = [7, 1234, 99999, 424242, 8675309];
const arg = process.argv[2];
const seeds = !arg ? [424242] : (arg === 'all' ? TEST_SEEDS : [arg]);
const label = process.argv[3] || 'baseline';

// E4: the budget. The optimisation pass and the E1 merge are worth nothing if
// they erode a room at a time over the next six months with nobody noticing,
// so the numbers are a test and not just a report. These are the worst values
// measured across the five test seeds after E1, with about ten per cent on top
// -- tight enough that a real regression trips them, loose enough that they do
// not go off because a generated house came out slightly busier. If a change
// legitimately needs more, raise them deliberately and say why in the commit.
const BUDGET = {
  // raised 2026-08-28 and provisionally: the houses got bigger (B3 adds a
  // passage, E2 adds a window and with it more wall segments), and one room on
  // seed 7 now draws 337. What is actually being drawn there is 61 grime planes
  // and 27 decals -- transparent, so E1 left them out of the merge. Merging
  // those per room is the next lever and should bring this back under 280; the
  // budget comes back down when it does.
  roomCalls: 360,        // worst measured 337, back room on seed 7
  roomTriangles: 15000,  // worst measured 14154, same room
  // raised 2026-08-28, deliberately: B3 adds a passage to every house, and A1a
  // keeps the light fittings out of the merge so a bulb can be seen to go out.
  // Worst measured after both: 648 meshes, 639 geometries, against 573/568
  // before. Draw calls per room are unaffected -- a fitting is two triangles.
  meshes: 720,           // worst measured 648
  geometries: 720,       // worst measured 639
  programs: 20           // measured 16 everywhere
};
const breaches = [];

(async () => {
  const b = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  for (const seed of seeds) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + process.cwd() + '/index.html?seed=' + seed);
    await p.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
    await p.evaluate(() => {
      document.getElementById('title').style.display = 'none';
      VK.freeze(12);                                 // counts must not depend on
      for (let i = 0; i < 240; i++) VK.tick(1);      // how fast the machine ran
    });

    const out = await p.evaluate(() => {
      const r = VK.renderer || (window.VK && VK.rendererRef);
      let meshes = 0, casters = 0, mats = new Set(), geos = new Set();
      VK.scene.traverse(o => {
        if (!o.isMesh) return;
        meshes++;
        if (o.castShadow) casters++;
        mats.add(o.material.uuid); geos.add(o.geometry.uuid);
      });
      let lights = 0, shadowLights = 0;
      VK.scene.traverse(o => { if (o.isLight) { lights++; if (o.castShadow) shadowLights++; } });
      return { meshes, casters, materials: mats.size, geometries: geos.size, lights, shadowLights,
               rooms: Object.keys(VK.spaces).length, portals: VK.PORTALS ? VK.PORTALS.length : 0 };
    });

    // per-room: stand in each room, let it render, read renderer.info
    const perRoom = await p.evaluate(async () => {
      const keys = Object.keys(VK.spaces);
      const frame = () => new Promise(r => requestAnimationFrame(() => r()));
      const rows = [];
      for (const k of keys) {
        VK.goSpace(k);
        VK.tick(2);
        for (let i = 0; i < 8; i++) await frame();
        const info = VK.info();
        const t0 = performance.now();
        for (let i = 0; i < 30; i++) await frame();
        const ms = (performance.now() - t0) / 30;
        rows.push({ room: k, type: VK.spaces[k]._type, ...info, ms: +ms.toFixed(1) });
      }
      return rows;
    }).catch(e => 'VK.info() missing: ' + e.message);

    console.log('\n=== seed ' + seed + ' [' + label + '] ===');
    console.log(JSON.stringify(out, null, 0));
    if (typeof perRoom === 'string') console.log(perRoom);
    else {
      console.log('room                 type          calls    tris  progs  lights   ms');
      for (const r of perRoom) console.log(
        r.room.padEnd(20), String(r.type).padEnd(12),
        String(r.calls).padStart(6), String(r.triangles).padStart(8),
        String(r.programs).padStart(5), String(r.visibleLights).padStart(6),
        String(r.ms).padStart(6));
    }
    if (errs.length) console.log('ERRORS', errs);

    // --- the budget ---------------------------------------------------------
    const over = (what, got, cap, where) => {
      if (got > cap) breaches.push(`seed ${seed}: ${where} ${what} ${got} over the ${cap} budget`);
    };
    over('meshes', out.meshes, BUDGET.meshes, 'scene');
    over('geometries', out.geometries, BUDGET.geometries, 'scene');
    if (typeof perRoom !== 'string') for (const r of perRoom) {
      over('draw calls', r.calls, BUDGET.roomCalls, r.room);
      over('triangles', r.triangles, BUDGET.roomTriangles, r.room);
      over('shader programs', r.programs, BUDGET.programs, r.room);
    }
    await p.close();
  }
  await b.close();

  if (breaches.length) {
    console.log('\nOVER BUDGET');
    for (const line of breaches) console.log('  ' + line);
    console.log('\n' + breaches.length + ' over budget. Either the change costs more than it should,');
    console.log('or the budget in perf-probe.js needs raising on purpose.');
    process.exit(1);
  }
  console.log('\nwithin budget (' + seeds.length + ' seed' + (seeds.length > 1 ? 's' : '') +
              '): rooms under ' + BUDGET.roomCalls + ' draw calls and ' + BUDGET.roomTriangles +
              ' triangles, scene under ' + BUDGET.geometries + ' geometries');
})();
