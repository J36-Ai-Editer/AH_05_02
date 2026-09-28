const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const frontend = path.join(__dirname, '../../src/frontend');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

function readPngSize(file) {
  const data = fs.readFileSync(path.join(frontend, file));
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    bytes: data.length,
  };
}

test('production logo assets are transparent-ready high-resolution PNG files', () => {
  const web = readPngSize('assets/gandang-logo-web-v2.png');
  const forest = readPngSize('assets/gandang-logo-forest-pixel-v2.png');
  assert.deepEqual(web, { width: 1998, height: 787, colorType: 6, bytes: web.bytes });
  assert.deepEqual(forest, { width: 1629, height: 965, colorType: 6, bytes: forest.bytes });
  assert.ok(web.bytes > 100_000);
  assert.ok(forest.bytes > 100_000);
});

test('every main service shell uses the smooth production logo', () => {
  for (const file of ['index.html', 'intro-retro.html', 'suin/index.html']) {
    const html = read(file);
    assert.match(html, /class="brand-logo"/);
    assert.match(html, /\/static\/assets\/gandang-logo-web-v2\.png/);
    assert.match(html, /aria-label="간당간당 홈으로"/);
  }
});

test('forest loading and navigation use the dedicated crisp pixel logo', () => {
  const html = read('forest.html');
  assert.equal((html.match(/gandang-logo-forest-pixel-v2\.png/g) || []).length, 2);
  assert.match(html, /class="forest-boot-logo"/);
  assert.match(html, /class="forest-brand-logo"/);
  const css = read('forest-game.css');
  assert.match(css, /\.forest-brand-logo[^}]*image-rendering:pixelated/);
  assert.match(css, /\.forest-brand-logo[^}]*image-rendering:crisp-edges/);
});

test('logo sizing remains responsive without distorting either source image', () => {
  for (const file of ['styles.css', 'intro-retro-base.css', 'suin/styles.css']) {
    const css = read(file);
    assert.match(css, /\.topbar \.brand-logo[^}]*width:clamp\(/);
    assert.match(css, /\.topbar \.brand-logo[^}]*height:auto/);
    assert.match(css, /@media\(max-width:760px\)/);
  }
});
