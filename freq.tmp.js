const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let hits = 0, n = 0; const misses = [];
  const seeds = [370294185];
  for (let i = 0; i < 59; i++) seeds.push(Math.floor((Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) / 2 * 1e9));
  for (const seed of seeds) {
    await p.goto('file://' + process.cwd() + '/index.html?seed=' + seed);
    await p.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
    const r = await p.evaluate(() => {
      const key = VK.stats.loopCorridor;
      if (!key) return { loop: null };
      const sp = VK.spaces[key];
      const len = Math.max(sp.size[0], sp.size[2]);
      // how you get in: the one opening that is not a portal
      const way = sp.openings.filter(o => !o.portal);
      // how far, in rooms, from where you wake up
      const g = {}; for (const k in VK.spaces) g[k] = [];
      return { loop: key, len: +len.toFixed(1), ways: way.length,
               door: way.some(o => o.door), lights: sp.lights.length };
    });
    n++;
    if (r.loop) { hits++; misses.push(`${r.len}m  ways=${r.ways} door=${r.door} lights=${r.lights}`); }
  }
  console.log(`looping corridor in ${hits}/${n} houses (${(100*hits/n).toFixed(0)}%)`);
  const lens = misses.map(m => parseFloat(m));
  lens.sort((a, b) => a - b);
  console.log('length: min ' + lens[0] + '  median ' + lens[lens.length >> 1] + '  max ' + lens[lens.length - 1]);
  console.log('entered by a hung door: ' + misses.filter(m => m.includes('door=true')).length + '/' + misses.length);
  console.log('with no light of its own: ' + misses.filter(m => m.includes('lights=0')).length + '/' + misses.length);
  console.log(misses.slice(0, 10).join('\n'));
  await b.close();
})();
