const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');

for (const [label, htmlPath, appPath] of [
  ['retro', 'src/frontend/intro-retro.html', 'src/frontend/intro-retro-app.js'],
  ['main', 'src/frontend/index.html', 'src/frontend/app.js'],
  ['suin', 'src/frontend/suin/index.html', 'src/frontend/suin/app.js'],
]) {
  test(`${label} top home opens the introduction and keeps dashboard as a separate destination`, () => {
    const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
    const app = fs.readFileSync(path.join(root, appPath), 'utf8');
    assert.match(html, /data-top-intro>홈<\/button>/);
    assert.match(html, /data-top-workspace="home">대시보드<\/button>/);
    assert.match(app, /\$\$\('\[data-top-intro\]'\)[^]*?showStep\(1, \{ recordHistory: false \}\);/);
  });
}
