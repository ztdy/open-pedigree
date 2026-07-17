'use strict';

// Assembles the renderer payload for the Electron shell.
// Copies the built bundle + vendored assets + index.html into desktop/renderer/,
// preserving the relative paths that index.html expects under file://.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'renderer');

const ITEMS = [
  { from: path.join(REPO_ROOT, 'index.html'), to: path.join(OUT, 'index.html') },
  { from: path.join(REPO_ROOT, 'dist'),       to: path.join(OUT, 'dist') },
  { from: path.join(REPO_ROOT, 'public'),     to: path.join(OUT, 'public') }
];

function assertExists(p) {
  if (!fs.existsSync(p)) {
    console.error(`[stage] missing required source: ${p}`);
    if (p.endsWith('dist')) {
      console.error('[stage] run the renderer build first (npm run build in repo root).');
    }
    process.exit(1);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const { from, to } of ITEMS) {
  assertExists(from);
  fs.cpSync(from, to, { recursive: true });
  console.log(`[stage] ${path.relative(REPO_ROOT, from)} -> ${path.relative(REPO_ROOT, to)}`);
}

console.log('[stage] renderer payload ready at desktop/renderer/');
