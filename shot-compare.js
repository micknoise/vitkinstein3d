// Renders the same views from two builds so the optimisation work can be
// checked against the thing it is not supposed to change.
//
// Nothing here is allowed to depend on wall-clock time, because the two builds
// run at different speeds under swiftshader. Physics is advanced with VK.tick().
// VK.freeze() pins the frame loop's clock, so the lamps do not flicker to a
// different brightness between the two runs and no stray physics creeps in
// while frames are being drawn. Frames are counted, not waited for. The
// animated film grain is turned off for the same reason.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const file = process.argv[2], outDir = process.argv[3], seed = process.argv[4] || 424242;
const extra = process.argv[5] || '';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  // ?nofx=1: compare what was rendered, not what the person looking did to it.
  // The pass is deterministic under VK.freeze, but it warps and grains the
  // frame, which blunts exactly the small differences this is here to catch.
  await page.goto('file://' + path.resolve(file) + '?seed=' + seed + '&nofx=1' + extra);
  await page.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
  await page.evaluate(() => {
    document.getElementById('title').style.display = 'none';
    document.getElementById('grain').style.display = 'none';
    VK.openAll();
    VK.freeze(12);                                  // stop the clock, and the flicker
    for (let i = 0; i < 240; i++) { VK.tick(1); }   // let the building settle
  });

  // exactly N drawn frames, so the light pool, the shadow refresh parity and
  // the portal targets are in the same state in both builds
  const frames = n => page.evaluate(k => new Promise(res => {
    let i = 0;
    const step = () => (++i >= k ? res(i) : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);

  const shoot = async (x, z, yaw, pitch, name) => {
    await page.evaluate(a => {
      VK.go(a[0], 0.36, a[1], a[2], a[3]);
      VK.tick(90);                     // land, and settle, deterministically
      VK.go(a[0], undefined, a[1], a[2], a[3]);
      VK.tick(1);
    }, [x, z, yaw, pitch]);
    await frames(12);                              // enough for the portal targets to fill
    await page.screenshot({ path: `${outDir}/${name}.png` });
  };

  const rooms = await page.evaluate(() => Object.entries(VK.spaces).map(([k, s]) =>
    ({ k, type: s._type, ox: s.origin[0], oz: s.origin[1], W: s.size[0], D: s.size[2] })));
  let i = 0;
  for (const r of rooms) {
    const x = r.ox + r.W * 0.3, z = r.oz + r.D * 0.3;
    await shoot(x, z, Math.atan2(-(r.ox - x), -(r.oz - z)), -0.04,
      `${String(++i).padStart(2, '0')}-${r.type}`);
  }
  const portals = await page.evaluate(() => VK.PORTALS.map((p, idx) =>
    ({ idx, x: p.pos.x, z: p.pos.z, nx: p.normal.x, nz: p.normal.z, space: p.space })));
  for (const p of portals) {
    const x = p.x + p.nx * 2.2, z = p.z + p.nz * 2.2;
    await shoot(x, z, Math.atan2(-(p.x - x), -(p.z - z)), 0.0, `portal-${p.idx}-${p.space}`);
  }
  console.log(outDir, errs.length ? 'ISSUES: ' + errs.slice(0, 5).join(' | ') : 'clean');
  await browser.close();
})();
