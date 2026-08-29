// Draws the score to a wav so it can be listened to, and prints how loud and
// how dark it is so it can be argued about with numbers.
//
//   npm run music              seed 424242, four states
//   npm run music 7            another house
//
// The score has no existence outside a session -- it is a reading of what the
// player is doing -- so this names a state and renders the music that state
// would produce: standing still, walking, a long way in, and a handful of
// interactions. See 38-music.js.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const seed = process.argv[2] || 424242;
const secs = +(process.argv[3] || 12);
const outDir = path.join(__dirname, 'music');

const STATES = {
  still:   { motion: 0,   unease: 0,    depth: 0.30, presence: 1 },
  walking: { motion: 1,   unease: 0.10, depth: 0.35, presence: 1 },
  deep:    { motion: 1,   unease: 0.50, depth: 1.00, presence: 1 },
  glide:   { motion: 1,   unease: 0.80, depth: 1.00, presence: 1, glide: 16 },
  hands:   { motion: 0.6, unease: 0.30, depth: 0.60, presence: 1,
             events: [{ kind: 'grab', at: 1.0, mass: 0.4, size: 0.16 },
                      { kind: 'door', at: 3.0, open: true },
                      { kind: 'throw', at: 5.5 },
                      { kind: 'impact', at: 6.2, v: 5, cls: 'metal' },
                      { kind: 'grab', at: 8.0, mass: 6, size: 0.6 }] }
};

function wav(samples, rate) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + __dirname + '/index.html?seed=' + seed);
  await page.waitForFunction(() => !!window.VK, null, { timeout: 90000 });

  const house = await page.evaluate(() => VK.music.info());
  console.log('house ' + seed + ' — root ' + house.root + ', ' + house.metre + '/16 at ' +
              house.bpm + 'bpm, ' + house.onsets + ' beats, rubbing ' + house.rub +
              ' semitone' + (house.rub === 1 ? '' : 's') + ' against itself');
  console.log('throb ' + house.throb.map(v => v ? '×' : '·').join(' '));
  console.log('gate  ' + house.gate.map(v => v ? '×' : '·').join(' '));
  console.log('\nstate      peak     rms   centroid   sub  clip   file');

  for (const name of Object.keys(STATES)) {
    const r = await page.evaluate(async ([sec, st]) => {
      const m = await VK.music.render(sec, st);
      return { peak: m.peak, rms: m.rms, centroid: m.centroid, sub: m.sub, pinned: m.pinned,
               rate: m.rate, data: Array.from(m.data) };
    }, [secs, STATES[name]]);
    const file = path.join(outDir, seed + '-' + name + '.wav');
    fs.writeFileSync(file, wav(Float32Array.from(r.data), r.rate));
    // `sub` is how much of it sits under 60Hz, which is where a score can put
    // all of its energy and none of its sound; `clip` is how much of the time
    // the output is on the ceiling. Both are here because both were wrong.
    console.log(name.padEnd(9) + String(r.peak).padStart(6) + String(r.rms).padStart(8) +
                String(r.centroid).padStart(10) + 'Hz' + String(r.sub).padStart(6) +
                String(r.pinned + '%').padStart(6) + '   ' + path.relative(process.cwd(), file));
  }
  if (errs.length) console.log('\nerrors: ' + errs.join(' | '));
  await browser.close();
})();
