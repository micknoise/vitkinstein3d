const { chromium } = require('playwright');
const seed = process.argv[2] || 424242;

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await page.goto('file://' + __dirname + '/index.html?seed=' + seed);
  await page.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
  await page.evaluate(() => { document.getElementById('title').style.display = 'none'; VK.openAll(); });
  await page.waitForTimeout(3000);

  const rooms = await page.evaluate(() => Object.entries(VK.spaces).map(([k, s]) =>
    ({ k, type: s._type, ox: s.origin[0], oz: s.origin[1], W: s.size[0], D: s.size[2] })));

  let i = 0;
  for (const r of rooms) {
    // stand in a corner of the room and look across it
    const x = r.ox + r.W * 0.3, z = r.oz + r.D * 0.3;
    const yaw = Math.atan2(-(r.ox - x), -(r.oz - z));
    await page.evaluate(a => VK.go(a[0], 0.36, a[1], a[2], -0.04), [x, z, yaw]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${__dirname}/shots/${String(++i).padStart(2, '0')}-${r.type}.png` });
  }

  // and standing in front of each portal, looking through it
  const portals = await page.evaluate(() => VK.PORTALS.map((p, idx) =>
    ({ idx, x: p.pos.x, z: p.pos.z, nx: p.normal.x, nz: p.normal.z, space: p.space, to: p.other.space })));
  for (const p of portals) {
    const x = p.x + p.nx * 2.2, z = p.z + p.nz * 2.2;
    const yaw = Math.atan2(-(p.x - x), -(p.z - z));
    await page.evaluate(a => VK.go(a[0], 0.36, a[1], a[2], 0.0), [x, z, yaw]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${__dirname}/shots/portal-${p.idx}-${p.space}-to-${p.to}.png` });
  }

  console.log('rooms:', rooms.map(r => r.type).join(', '));
  console.log(errs.length ? 'ISSUES:\n' + errs.slice(0, 10).join('\n') : 'console clean');
  await browser.close();
})();
