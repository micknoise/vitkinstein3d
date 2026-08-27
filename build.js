// Bundles three.js, cannon-es and the game source into one self-contained
// HTML file. No CDN, no modules, no build step for the player -- double-click
// the html and it runs.
const fs = require('fs');
const path = require('path');

const root = __dirname;

function iife(src, globalName) {
  // turn the ES module's single `export{...}` into a `return {...}`
  const m = src.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!m) throw new Error('no export block found for ' + globalName);
  const list = m[1].split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const as = entry.split(/\s+as\s+/);
    return as.length === 2 ? `${as[1]}:${as[0]}` : `${entry}:${entry}`;
  }).join(',');
  const body = src.slice(0, m.index);
  return `var ${globalName} = (function(){\n${body}\nreturn {${list}};\n})();\n`;
}

const three = fs.readFileSync(path.join(root, 'node_modules/three/build/three.module.min.js'), 'utf8');
const cannon = fs.readFileSync(path.join(root, 'node_modules/cannon-es/dist/cannon-es.js'), 'utf8');

const srcDir = path.join(root, 'src');
const game = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort()
  .map(f => `\n/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(srcDir, f), 'utf8'))
  .join('\n');

let html = fs.readFileSync(path.join(root, 'shell.html'), 'utf8');
html = html.replace('/* __THREE__ */', iife(three, 'THREE'))
           .replace('/* __CANNON__ */', iife(cannon, 'CANNON'))
           .replace('/* __GAME__ */', '(function(){\n"use strict";\n' + game + '\n})();');

const out = path.join(root, 'index.html');
fs.writeFileSync(out, html);
console.log('built', out, (html.length / 1024 / 1024).toFixed(2) + ' MB');
