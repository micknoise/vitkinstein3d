// Diffs two directories of screenshots from `npm run compare`. The optimisation
// work is supposed to change how the picture is drawn, not the picture, and
// eyeballing sixteen pairs does not catch a wall that moved two centimetres.
//
//   npm run compare -- old.html shots/before 424242 '&pr=1'
//   npm run compare -- index.html shots/after 424242 '&pr=1'
//   npm run diff shots/before shots/after
//
// Reports, per pair, the share of pixels differing by more than a small
// threshold and the worst single channel difference. Swiftshader is
// deterministic enough that an unchanged render comes out at 0.00%.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const a = process.argv[2], b = process.argv[3];
const TOL = +(process.argv[4] || 8);        // per-channel, 0-255

(async () => {
  const files = fs.readdirSync(a).filter(f => f.endsWith('.png')).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let worst = 0, worstName = '', missing = 0;

  for (const f of files) {
    const pb = path.join(b, f);
    if (!fs.existsSync(pb)) { console.log(f.padEnd(34), 'MISSING in ' + b); missing++; continue; }
    const toURI = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    const r = await page.evaluate(async ([ua, ub, tol]) => {
      const load = src => new Promise((res, rej) => {
        const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
      });
      const [ia, ib] = await Promise.all([load(ua), load(ub)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { size: true };
      const cv = document.createElement('canvas');
      cv.width = ia.width; cv.height = ia.height;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(ia, 0, 0); const da = cx.getImageData(0, 0, cv.width, cv.height).data;
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.drawImage(ib, 0, 0); const db = cx.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, max = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i+1] - db[i+1]), Math.abs(da[i+2] - db[i+2]));
        if (d > max) max = d;
        if (d > tol) n++;
      }
      return { pct: 100 * n / (da.length / 4), max };
    }, [toURI(path.join(a, f)), toURI(pb), TOL]);

    if (r.size) { console.log(f.padEnd(34), 'DIFFERENT SIZE'); missing++; continue; }
    if (r.pct > worst) { worst = r.pct; worstName = f; }
    console.log(f.padEnd(34), r.pct.toFixed(2).padStart(6) + '%  worst channel ' + String(r.max).padStart(3));
  }

  console.log('\nworst: ' + (worstName || 'none') + ' ' + worst.toFixed(2) + '% of pixels over ±' + TOL);
  await browser.close();
  process.exit(missing ? 1 : 0);
})();
