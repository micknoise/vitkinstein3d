const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let hits = 0, n = 0; const found = [];
  for (const seed of Array.from({length: 30}, (_, i) => 1000 + i * 7717)) {
    await p.goto('file://' + process.cwd() + '/index.html?seed=' + seed);
    await p.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
    const r = await p.evaluate(() => {
      const out = [];
      for (const [k, sp] of Object.entries(VK.spaces)) {
        if (sp._type !== 'passage') continue;
        const [W, , D] = sp.size;
        const ends = D >= W ? ['north','south'] : ['west','east'];
        const used = new Set(sp.openings.map(o => o.wall));
        out.push({ k, len: +Math.max(W, D).toFixed(1),
                   endsUsed: ends.filter(e => used.has(e)).length,
                   sidesUsed: ['north','south','east','west'].filter(x => !ends.includes(x) && used.has(x)).length });
      }
      return { loop: VK.stats.loopCorridor, passages: out };
    });
    n++;
    for (const q of r.passages) found.push(`${q.k} ${q.len}m ends=${q.endsUsed} sides=${q.sidesUsed}`);
    if (r.loop) hits++;
  }
  console.log(`looping corridor in ${hits}/${n} houses`);
  console.log(found.slice(0, 20).join('\n'));
  const both = found.filter(f => f.includes('ends=0')).length;
  console.log('passages with neither end used: ' + both + ' of ' + found.length);
  await b.close();
})();
