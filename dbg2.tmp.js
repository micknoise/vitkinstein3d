const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto('file://' + process.cwd() + '/index.html?seed=1234');
  await p.waitForFunction(() => !!window.VK, null, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = VK.THREE;
    const rows = VK.PORTALS.map((q, i) => `${i} ${q.space} -> ${q.other.space}  face ${q.pos.toArray().map(v=>v.toFixed(1))}  anchor ${new T.Vector3().setFromMatrixPosition(q.anchor.matrixWorld).toArray().map(v=>v.toFixed(1))}  otherAnchor ${new T.Vector3().setFromMatrixPosition(q.other.anchor.matrixWorld).toArray().map(v=>v.toFixed(1))}`);
    // where does face 0 actually send you?
    const a = VK.PORTALS[0];
    const inv = a.anchor.matrixWorld.clone().invert();
    const M = a.other.anchor.matrixWorld.clone().multiply(new T.Matrix4().makeRotationY(Math.PI)).multiply(inv);
    const test = new T.Vector3(-3.7, 0.3, -7.7).applyMatrix4(M);
    return { rows, sends: test.toArray().map(v => +v.toFixed(1)),
             warehouse: VK.spaces[Object.keys(VK.spaces).find(k => VK.spaces[k]._type === 'warehouse')] };
  });
  console.log(r.rows.join('\n'));
  console.log('face 0 sends the player to', r.sends);
  console.log('warehouse origin', r.warehouse.origin, 'size', r.warehouse.size);
  await b.close();
})();
