// ---------------------------------------------------------------------------
// Procedural textures. Everything is drawn at load time onto 2D canvases --
// no image files, no downloads.
//
// Tiles are large (1024) and drawn with detail *counts scaled to area*, not
// scaled up, so a tile covers ~4m of wall at the same grain as a 1m patch.
// Repetition is then broken a second time at build time by a non-repeating
// grime layer and by decals (see 20-build.js).
// ---------------------------------------------------------------------------

const TEX = 1024;          // base tile size
const NRM = 512;           // normal maps are derived at half res; nobody can tell

function cnv(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }

function noiseFill(ctx, size, amount) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  // a million seeded calls per tile would be felt at load, so per-pixel noise
  // runs on an xorshift seeded from TR: still reproducible, and much cheaper
  let x32 = ((TR() * 4294967296) | 0) || 1;
  for (let i = 0; i < d.length; i += 4) {
    x32 ^= x32 << 13; x32 ^= x32 >>> 17; x32 ^= x32 << 5;
    const n = ((x32 >>> 0) / 4294967296 - 0.5) * amount;
    d[i] = clamp255(d[i] + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);
}
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// Soft irregular stain -- damp, nicotine, age.
function stain(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(0.55, `rgba(${color},${alpha * 0.45})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (0.7 + TR() * 0.5);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// A closed wobbly blob -- the shape of everything organic in this game.
function blob(ctx, x, y, r, wob, steps) {
  steps = steps || 20;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1 - wob / 2 + TR() * wob);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function texFromCanvas(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

function normalFromCanvas(src, strength) {
  // downsample first -- the normal map does not need the full tile
  const small = cnv(NRM);
  const sc = ctx2d(small);
  sc.drawImage(src, 0, 0, NRM, NRM);
  const s = sc.getImageData(0, 0, NRM, NRM).data;
  const out = cnv(NRM);
  const octx = ctx2d(out);
  const img = octx.createImageData(NRM, NRM);
  const d = img.data;
  const lum = (x, y) => {
    x = (x + NRM) % NRM; y = (y + NRM) % NRM;
    const i = (y * NRM + x) * 4;
    return (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < NRM; y++) {
    for (let x = 0; x < NRM; x++) {
      const dx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
      const dy = (lum(x, y - 1) - lum(x, y + 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * NRM + x) * 4;
      d[i] = ((dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}

// --- surfaces --------------------------------------------------------------
// Every count below is per-tile, and the tile is 4x the area of a 512 one,
// so the counts are 4x what they would be at 512. Detail density, not scale.

function texWallpaper(hue) {
  const S = TEX, c = cnv(S), x = ctx2d(c);
  const base = hue || [125, 106, 78];
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 64) { x.fillStyle = 'rgba(255,235,190,0.05)'; x.fillRect(i, 0, 32, S); }
  x.lineWidth = 2;
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
    const cx = gx * 128 + 64 + (gy % 2 ? 64 : 0), cy = gy * 128 + 64;
    x.strokeStyle = `rgba(${base[0] + 70},${base[1] + 62},${base[2] + 42},${0.35 + TR() * 0.25})`;
    x.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const r = 22 + Math.sin(a * 4) * 12 + Math.cos(a * 2) * 5;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 1.25;
      a ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.stroke();
    x.fillStyle = `rgba(${base[0] + 25},${base[1] + 14},${base[2] + 2},0.22)`; x.fill();
  }
  for (let i = 0; i < 24; i++) stain(x, TR() * S, TR() * S, 60 + TR() * 180, '60,45,25', 0.18);
  // seams where lengths of paper meet, and one lifting edge
  for (let i = 0; i < 4; i++) {
    const sx = TR() * S;
    x.strokeStyle = 'rgba(40,30,18,0.22)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + (TR() - 0.5) * 8, S); x.stroke();
  }
  noiseFill(x, S, 24);
  return c;
}

function texCarpet(hue) {
  const S = TEX, c = cnv(S), x = ctx2d(c);
  const base = hue || [74, 31, 34];
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 90000; i++) {
    const px = TR() * S, py = TR() * S;
    x.strokeStyle = `rgba(${base[0] + 46 + TR() * 60 | 0},${base[1] + 19 + TR() * 30 | 0},${base[2] + 11 + TR() * 30 | 0},0.22)`;
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (TR() - 0.5) * 5, py + (TR() - 0.5) * 5); x.stroke();
  }
  x.globalAlpha = 0.16; x.strokeStyle = '#c2a37a'; x.lineWidth = 6;
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) x.strokeRect(gx * 256 + 40, gy * 256 + 40, 176, 176);
  x.globalAlpha = 1;
  for (let i = 0; i < 20; i++) stain(x, TR() * S, TR() * S, 60 + TR() * 150, '20,10,8', 0.3);
  noiseFill(x, S, 18);
  return c;
}

function texPlaster() {
  const S = TEX, c = cnv(S), x = ctx2d(c);
  x.fillStyle = '#cfc7b4'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 28; i++) stain(x, TR() * S, TR() * S, 70 + TR() * 200, '150,120,70', 0.26);
  x.strokeStyle = 'rgba(90,84,72,0.45)'; x.lineWidth = 1.2;
  for (let i = 0; i < 20; i++) {
    let px = TR() * S, py = TR() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 30; s++) { px += (TR() - 0.5) * 40; py += (TR() - 0.5) * 40; x.lineTo(px, py); }
    x.stroke();
  }
  noiseFill(x, S, 20);
  return c;
}

function texConcrete() {
  const S = TEX, c = cnv(S), x = ctx2d(c);
  x.fillStyle = '#6f6f6a'; x.fillRect(0, 0, S, S);
  // shuttering boards -- big, low-frequency, and the main reason this doesn't
  // read as one repeated square
  for (let i = 0; i < 8; i++) {
    const y = i * (S / 8), v = 96 + TR() * 34;
    x.fillStyle = `rgba(${v},${v},${v - 4},0.16)`;
    x.fillRect(0, y, S, S / 8 - 2);
    x.fillStyle = 'rgba(40,40,38,0.18)'; x.fillRect(0, y + S / 8 - 3, S, 3);
  }
  for (let i = 0; i < 160; i++) stain(x, TR() * S, TR() * S, 30 + TR() * 200, TR() > 0.5 ? '96,96,90' : '44,44,42', 0.16);
  for (let i = 0; i < 12000; i++) {
    x.fillStyle = `rgba(${140 + TR() * 60 | 0},${140 + TR() * 60 | 0},${135 + TR() * 60 | 0},${TR() * 0.3})`;
    x.beginPath(); x.arc(TR() * S, TR() * S, TR() * 2.4, 0, 7); x.fill();
  }
  // tie-rod holes
  for (let i = 0; i < 10; i++) {
    const px = TR() * S, py = TR() * S;
    x.fillStyle = 'rgba(35,35,33,0.55)'; x.beginPath(); x.arc(px, py, 5 + TR() * 3, 0, 7); x.fill();
  }
  x.strokeStyle = 'rgba(40,40,38,0.5)'; x.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    let px = TR() * S, py = TR() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 26; s++) { px += (TR() - 0.5) * 50; py += (TR() - 0.4) * 60; x.lineTo(px, py); }
    x.stroke();
  }
  noiseFill(x, S, 26);
  return c;
}

function texWood(base, grain) {
  const S = 512, c = cnv(S), x = ctx2d(c);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    x.strokeStyle = `rgba(${grain},${0.05 + TR() * 0.22})`;
    x.lineWidth = 0.6 + TR() * 2.6;
    const y = TR() * S;
    x.beginPath(); x.moveTo(0, y);
    for (let px = 0; px <= S; px += 16) x.lineTo(px, y + Math.sin(px * 0.025 + i) * 4);
    x.stroke();
  }
  noiseFill(x, S, 16);
  return c;
}

function texTile() {
  const S = TEX, c = cnv(S), x = ctx2d(c);
  x.fillStyle = '#8c8d84'; x.fillRect(0, 0, S, S);
  const n = 8, s = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 112 + TR() * 34 | 0;
    x.fillStyle = `rgb(${v},${v + 2},${v - 6})`;
    x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    if (TR() < 0.12) { x.fillStyle = 'rgba(60,58,50,0.25)'; x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
  }
  for (let i = 0; i < 40; i++) stain(x, TR() * S, TR() * S, 40 + TR() * 140, '60,58,50', 0.2);
  noiseFill(x, S, 16);
  return c;
}

function texPaint(hex, dirt) {
  const S = TEX, c = cnv(S), x = ctx2d(c);
  x.fillStyle = hex; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 32; i++) stain(x, TR() * S, TR() * S, 40 + TR() * 150, dirt, 0.17);
  // scuffs at about waist height in the tile
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(${dirt},${0.05 + TR() * 0.14})`;
    x.lineWidth = 1 + TR() * 6;
    const y = TR() * S, px = TR() * S;
    x.beginPath(); x.moveTo(px, y); x.lineTo(px + TR() * 120 - 60, y + TR() * 14 - 7); x.stroke();
  }
  noiseFill(x, S, 14);
  return c;
}

// --- the anti-tiling layer -------------------------------------------------
// A big soft blotchy pattern, mostly white, used with MultiplyBlending and
// stretched once over a whole wall. White leaves the wall alone; dark patches
// dirty it. Because it never repeats, the eye stops finding the grid.

function texGrime() {
  const S = 512, c = cnv(S), x = ctx2d(c);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const px = TR() * S, py = TR() * S, r = 40 + TR() * 190;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const v = 120 + TR() * 90 | 0;
    g.addColorStop(0, `rgba(${v},${v - 6},${v - 16},${0.25 + TR() * 0.4})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // damp rising from the bottom edge
  const g2 = x.createLinearGradient(0, S, 0, S * 0.45);
  g2.addColorStop(0, 'rgba(120,110,96,0.5)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g2; x.fillRect(0, 0, S, S);
  // and streaks coming down from the top
  for (let i = 0; i < 14; i++) {
    const px = TR() * S, w = 4 + TR() * 26, h = 60 + TR() * 320;
    const g3 = x.createLinearGradient(0, 0, 0, h);
    g3.addColorStop(0, `rgba(140,128,110,${0.18 + TR() * 0.3})`);
    g3.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g3; x.fillRect(px, 0, w, h);
  }
  // fade to white at the edges: the layer is stretched over one wall segment,
  // and a hard edge to it is just a different kind of visible tiling
  const fade = ctx2d(cnv(1));
  const eg = x.createLinearGradient(0, 0, S, 0);
  x.globalCompositeOperation = 'destination-over';
  x.globalCompositeOperation = 'source-over';
  const edge = 0.22 * S;
  const strips = [
    [0, 0, edge, S, x.createLinearGradient(0, 0, edge, 0)],
    [S - edge, 0, edge, S, x.createLinearGradient(S, 0, S - edge, 0)],
    [0, 0, S, edge, x.createLinearGradient(0, 0, 0, edge)],
    [0, S - edge, S, edge, x.createLinearGradient(0, S, 0, S - edge)]
  ];
  for (const [sx, sy, sw, sh, g] of strips) {
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(sx, sy, sw, sh);
  }
  return c;
}

// --- decals ----------------------------------------------------------------
// Transparent canvases stuck on walls after the fact. Second pass, as asked.

function texMould() {
  const S = 256, c = cnv(S), x = ctx2d(c);
  for (let i = 0; i < 70; i++) {
    const px = 40 + TR() * (S - 80), py = 40 + TR() * (S - 80);
    const r = 6 + TR() * 34;
    const d = Math.hypot(px - S / 2, py - S / 2) / (S / 2);
    x.fillStyle = `rgba(${28 + TR() * 30 | 0},${32 + TR() * 26 | 0},${22 + TR() * 18 | 0},${Math.max(0, 0.62 - d * 0.6)})`;
    blob(x, px, py, r, 0.9, 12); x.fill();
  }
  return c;
}

function texSplat() {
  const S = 256, c = cnv(S), x = ctx2d(c);
  const h = TR();
  const col = `${180 + TR() * 60 | 0},${170 + TR() * 60 | 0},${150 + TR() * 70 | 0}`;
  x.fillStyle = `rgba(${col},0.92)`;
  blob(x, S / 2, S / 2, 52 + TR() * 26, 0.75, 18); x.fill();
  for (let i = 0; i < 26; i++) {
    const a = TR() * 7, d = 55 + TR() * 70;
    x.fillStyle = `rgba(${col},${0.5 + TR() * 0.45})`;
    blob(x, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 2 + TR() * 9, 0.8, 8); x.fill();
  }
  // a run, because it was thrown not painted
  x.fillStyle = `rgba(${col},0.75)`;
  x.fillRect(S / 2 - 5, S / 2, 9, 40 + TR() * 60);
  return c;
}

function texPoster() {
  const S = 256, c = cnv(S), x = ctx2d(c);
  const pw = 150 + TR() * 70, ph = 190 + TR() * 55;
  const px = (S - pw) / 2, py = (S - ph) / 2;
  // torn edge: draw the sheet as a polygon with a ragged side
  x.beginPath();
  x.moveTo(px, py);
  const tear = Math.floor(TR() * 4);
  const edge = (x0, y0, x1, y1, ragged) => {
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      let ex = x0 + (x1 - x0) * t, ey = y0 + (y1 - y0) * t;
      if (ragged) { ex += (TR() - 0.5) * 22; ey += (TR() - 0.5) * 22; }
      x.lineTo(ex, ey);
    }
  };
  edge(px, py, px + pw, py, tear === 0);
  edge(px + pw, py, px + pw, py + ph, tear === 1);
  edge(px + pw, py + ph, px, py + ph, tear === 2);
  edge(px, py + ph, px, py, tear === 3);
  x.closePath();
  const bg = [230 + TR() * 20, 224 + TR() * 20, 200 + TR() * 30];
  x.fillStyle = `rgb(${bg[0] | 0},${bg[1] | 0},${bg[2] | 0})`;
  x.fill();
  x.save(); x.clip();
  // an image you can never quite make out, and lines of type
  const hue = TR();
  x.fillStyle = `hsl(${hue * 360 | 0},${8 + TR() * 20 | 0}%,${18 + TR() * 22 | 0}%)`;
  x.fillRect(px + 14, py + 16, pw - 28, ph * 0.44);
  // sun has been on it for years
  x.fillStyle = 'rgba(214,198,166,0.42)';
  x.fillRect(px + 14, py + 16, pw - 28, ph * 0.44);
  for (let i = 0; i < 9; i++) {
    x.fillStyle = `rgba(40,36,30,${0.35 + TR() * 0.4})`;
    const ly = py + ph * 0.52 + i * 12;
    x.fillRect(px + 16, ly, (pw - 34) * (0.35 + TR() * 0.6), 4 + TR() * 3);
  }
  x.restore();
  // age
  x.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) stain(x, px + TR() * pw, py + TR() * ph, 20 + TR() * 50, '110,90,55', 0.3);
  x.globalAlpha = 1;
  return c;
}

// ---------------------------------------------------------------------------

let MAT = {}, DECAL = {};

function buildMaterials(rng) {
  const R = rng || TR;
  // the house has a colour scheme, and it is different every time
  const wpHue = [96 + R() * 60, 84 + R() * 46, 62 + R() * 40];
  const cpHue = [46 + R() * 60, 24 + R() * 30, 26 + R() * 34];

  const wp = texWallpaper(wpHue), cp = texCarpet(cpHue), pl = texPlaster(), cc = texConcrete(),
        wd = texWood('#5a3f26', '30,18,8'), wd2 = texWood('#8a6a44', '60,40,20'),
        tl = texTile(), gr = texPaint('#7e8378', '50,52,46'), cr = texPaint('#b9a988', '80,70,50'),
        bl = texPaint('#6a7480', '44,48,54');

  const S = (c, rep, ns) => {
    const m = new THREE.MeshStandardMaterial({ map: texFromCanvas(c, rep) });
    if (ns) { m.normalMap = normalFromCanvas(c, ns); m.normalMap.repeat.copy(m.map.repeat); m.normalScale = new THREE.Vector2(1, 1); }
    return m;
  };

  MAT.wallpaper = S(wp, [1, 1], 2.2); MAT.wallpaper.roughness = 0.92;
  MAT.carpet    = S(cp, [1, 1], 1.4); MAT.carpet.roughness = 1.0;
  MAT.plaster   = S(pl, [1, 1], 1.2); MAT.plaster.roughness = 0.97;
  MAT.concrete  = S(cc, [1, 1], 2.6); MAT.concrete.roughness = 0.95;
  MAT.concreteWall = MAT.concrete;
  MAT.wood      = S(wd, [1, 1], 1.4); MAT.wood.roughness = 0.7;
  MAT.woodLight = S(wd2, [1, 1], 1.4); MAT.woodLight.roughness = 0.75;
  MAT.tile      = S(tl, [1, 1], 1.0); MAT.tile.roughness = 0.55;
  MAT.green     = S(gr, [1, 1], 0.8); MAT.green.roughness = 0.85;
  MAT.cream     = S(cr, [1, 1], 0.8); MAT.cream.roughness = 0.9;
  MAT.blue      = S(bl, [1, 1], 0.8); MAT.blue.roughness = 0.85;

  MAT.metal   = new THREE.MeshStandardMaterial({ color: 0x6d6f72, roughness: 0.45, metalness: 0.75 });
  MAT.rust    = new THREE.MeshStandardMaterial({ color: 0x7a4a2c, roughness: 0.95, metalness: 0.25 });
  MAT.card    = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 1.0 });
  MAT.glass   = new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.75 });
  MAT.paper   = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 1.0 });
  MAT.fabric  = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 1.0 });
  MAT.dark    = new THREE.MeshStandardMaterial({ color: 0x14140f, roughness: 1.0 });
  MAT.shade   = new THREE.MeshStandardMaterial({ color: 0xe8cfa0, roughness: 0.9, emissive: 0xffb46b, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  MAT.bulb    = new THREE.MeshBasicMaterial({ color: 0xfff0d0 });
  MAT.tube    = new THREE.MeshBasicMaterial({ color: 0xdfeaff });
  MAT.plastic = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.6 });
  MAT.red     = new THREE.MeshStandardMaterial({ color: 0x8a2b22, roughness: 0.8 });

  // A window. The glass is barely there -- enough of a sheen across it to read
  // as a pane and to catch a lamp, not enough to hide what is not outside.
  // A shaft of light, and the patch it throws on the floor. Soft at the edges
  // and fading along its length, because a beam with a hard edge is a wedge of
  // plastic. Additive, so it only ever adds light to what is behind it.
  const beam = cnv(64); {
    const x = ctx2d(beam);
    for (let i = 0; i < 64; i++) {
      const across = Math.abs(i / 63 - 0.5) * 2;
      const a = Math.pow(1 - across, 1.7);
      const g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, `rgba(255,252,240,${(a * 0.85).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(255,250,235,${(a * 0.38).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,248,230,${(a * 0.12).toFixed(3)})`);
      x.fillStyle = g; x.fillRect(i, 0, 1, 64);
    }
  }
  const pool = cnv(128); {
    const x = ctx2d(pool);
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,251,236,0.85)');
    g.addColorStop(0.45, 'rgba(255,248,230,0.4)');
    g.addColorStop(1, 'rgba(255,246,225,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  const beamTex = new THREE.CanvasTexture(beam), poolTex = new THREE.CanvasTexture(pool);
  beamTex.colorSpace = THREE.SRGBColorSpace; poolTex.colorSpace = THREE.SRGBColorSpace;
  MAT.shaft = new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: true
  });
  MAT.shaftPool = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: true
  });

  MAT.glass = new THREE.MeshStandardMaterial({
    color: 0x8fa2ab, transparent: true, opacity: 0.13,
    roughness: 0.06, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide
  });
  // and what is not outside. Unlit, and the same colour as the fog it sits in,
  // so it has no surface to read as a surface: the house simply stops.
  // Outside is still nothing, but it is not nothing *dark* -- a shaft of daylight
  // coming out of a black hole reads as a fault. It goes pale a long way up, the
  // way the top of a light well does, so the light has somewhere to have come
  // from and there is still not one thing to look at.
  const out = cnv(32); {
    const x = ctx2d(out);
    const g = x.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#5e6a78');
    g.addColorStop(0.42, '#2b323c');
    g.addColorStop(1, '#0a0b0e');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  }
  const outTex = new THREE.CanvasTexture(out);
  outTex.colorSpace = THREE.SRGBColorSpace;
  MAT.nothing = new THREE.MeshBasicMaterial({ map: outTex, side: THREE.BackSide });

  // grime: several variants so neighbouring walls don't share one
  DECAL.grime = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.CanvasTexture(texGrime());
    t.colorSpace = THREE.SRGBColorSpace;
    DECAL.grime.push(new THREE.MeshBasicMaterial({
      map: t, transparent: true, blending: THREE.MultiplyBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
    }));
  }
  const decalMat = (c, opacity) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: t, transparent: true, opacity: opacity === undefined ? 1 : opacity,
      roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
    });
  };
  DECAL.mould = []; DECAL.splat = []; DECAL.poster = [];
  for (let i = 0; i < 3; i++) DECAL.mould.push(decalMat(texMould(), 0.9));
  for (let i = 0; i < 3; i++) DECAL.splat.push(decalMat(texSplat()));
  for (let i = 0; i < 5; i++) DECAL.poster.push(decalMat(texPoster()));
}
