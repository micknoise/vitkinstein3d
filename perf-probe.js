// Structural perf probe. Reports draw calls / triangles / programs / lights
// per room. Runs under swiftshader so wall-clock is not meaningful, but the
// counts are exactly the numbers the optimisation is aimed at.
const { chromium } = require('playwright');
const seeds = process.argv[2] ? [process.argv[2]] : [424242];
const label = process.argv[3] || 'baseline';

(async () => {
  const b = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  for (const seed of seeds) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + process.cwd() + '/index.html?seed=' + seed);
    await p.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
    await p.evaluate(() => document.getElementById('title').style.display = 'none');
    await p.waitForTimeout(1500);

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
    await p.close();
  }
  await b.close();
})();
