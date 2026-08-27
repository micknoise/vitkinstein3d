const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + process.cwd() + '/index.html?seed=370294185&pr=1');
  await p.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
  await p.evaluate(() => { document.getElementById('title').style.display = 'none'; VK.openAll(); });

  const info = await p.evaluate(() => ({
    loop: VK.stats.loopCorridor,
    rooms: Object.entries(VK.spaces).map(([k, s]) => k + ' ' + s._type),
    portals: VK.PORTALS.map((q, i) => `${i} ${q.space} -> ${q.other.space}`)
  }));
  console.log('loop corridor:', info.loop);
  console.log(info.portals.join('\n'));

  // walk through every portal that leads into the warehouse and watch
  const wareIdx = await p.evaluate(() =>
    VK.PORTALS.findIndex(q => VK.spaces[q.other.space]._type === 'warehouse'));
  console.log('warehouse portal index:', wareIdx);
  if (wareIdx < 0) { await b.close(); return; }

  const trail = await p.evaluate(async (i) => {
    const raf = () => new Promise(r => requestAnimationFrame(() => r()));
    const a = VK.PORTALS[i];
    const at = a.pos.clone().addScaledVector(a.normal, 3.0);
    VK.go(at.x, 0.36, at.z, Math.atan2(-(a.pos.x - at.x), -(a.pos.z - at.z)), 0);
    for (let f = 0; f < 6; f++) await raf();
    const rows = [];
    VK.press('KeyW', true);
    for (let s = 0; s < 220; s++) {
      await raf();
      const pl = VK.player();
      rows.push(`${pl.space || 'NOWHERE'} @ ${pl.pos.map(v => v.toFixed(2)).join(',')} sides=${VK.PORTALS.map(q => q.side > 0 ? '+' : '-').join('')}`);
    }
    VK.press('KeyW', false);
    return rows;
  }, wareIdx);
  // print around the first frame where the player leaves the floor
  let k = trail.findIndex(r => { const y = parseFloat(r.split('@')[1].split(',')[1]); return y < 0.3; });
  if (k < 0) k = trail.length - 6;
  console.log(trail.slice(Math.max(0, k - 8), k + 6).map((r, i) => (Math.max(0, k-8) + i) + '  ' + r).join('\n'));
  await p.screenshot({ path: 'shots/blank.png' });
  if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  await b.close();
})();
