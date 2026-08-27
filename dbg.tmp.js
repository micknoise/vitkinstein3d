const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto('file://' + process.cwd() + '/index.html?seed=1234');
  await p.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const a = VK.PORTALS[0];
    const p0 = a.pos.clone().addScaledVector(a.normal, 1.1);
    VK.go(p0.x, 0.36, p0.z);
    VK.aimAt(a.pos.x, 0.36 + 1.28, a.pos.z);
    const trail = [];
    VK.press('KeyW', true);
    for (let i = 0; i < 60; i++) {
      VK.tick(2);
      const pl = VK.player();
      trail.push(pl.pos.map(v => v.toFixed(1)).join(',') + '  sides ' + VK.PORTALS.map(q => q.side > 0 ? '+' : '-').join(''));
    }
    VK.press('KeyW', false);
    return { a: a.space, to: a.other.space, aPos: a.pos.toArray().map(v=>+v.toFixed(1)),
             otherPos: a.other.pos.toArray().map(v=>+v.toFixed(1)), trail };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
