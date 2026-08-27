// ---------------------------------------------------------------------------
// One seeded random source for the whole building, so any house you like can
// be got back from its number. ?seed=12345 in the URL, or the title screen.
// ---------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let SEED = (() => {
  const m = location.search.match(/seed=(\d+)/) || location.hash.match(/seed=(\d+)/);
  return m ? parseInt(m[1], 10) : Math.floor(Math.random() * 1e9);
})();

let R = mulberry32(SEED);

// The surfaces get their own stream, deliberately separate from the one the
// generator draws on. Textures are drawn before the layout is decided, so if
// they shared a stream, adding or removing a single stain would shift every
// house that has ever been made from a given number.
const TR = mulberry32((SEED ^ 0x9e3779b9) >>> 0);

const rr = (a, b) => a + R() * (b - a);                  // random float
const ri = (a, b) => Math.floor(a + R() * (b - a + 1));  // random int, inclusive
const rpick = arr => arr[Math.floor(R() * arr.length)];
const rchance = p => R() < p;
function rshuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
