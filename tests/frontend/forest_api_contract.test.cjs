const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'src/frontend/intro-retro-app.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/frontend/forest-game.js'), 'utf8');
const phaser = fs.readFileSync(path.join(root, 'src/frontend/forest-phaser.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/frontend/intro-retro.html'), 'utf8');

test('forest entry requires an authenticated group handoff', () => {
  assert.match(html, /id="forest-entry-dialog"/);
  assert.match(app, /api\("\/shared-challenge-groups"\)/);
  assert.match(app, /sessionStorage\.setItem\(FOREST_SESSION_STORAGE_KEY/);
  assert.match(game, /forestSession \? new ApiForestAdapter/);
  assert.doesNotMatch(game, /const adapter = new DemoForestAdapter\(\)/);
});

test('API adapter covers the server-owned forest and game actions', () => {
  for (const endpoint of [
    '/forest/catalog', '/forest/spaces', '/forest/avatar', '/rewards/group-daily',
    '/objects/${objectId}', '/wallet', '/inventory-items', '/inventory',
    '/purchase', '/avatar/equipment',
  ]) assert.ok(game.includes(endpoint), endpoint);
  assert.match(game, /Promise\.all\(\[\s*this\.catalog\(\), this\.wallet\(\), this\.shopItems\(\), this\.inventory\(\), this\.avatar\(\)/);
});

test('game-domain localStorage is no longer a persistence source', () => {
  assert.doesNotMatch(game, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(game, /localStorage\.getItem\(STORAGE_KEY/);
  assert.doesNotMatch(phaser, /gandang-carrot-forest-demo-v1/);
  assert.doesNotMatch(app, /localStorage\.getItem\("gandang-carrot-forest-demo-v1"/);
});

test('API errors stay visible and never switch to demo data', () => {
  assert.match(game, /FOREST_SESSION_EXPIRED/);
  assert.match(game, /FOREST_FORBIDDEN/);
  assert.match(game, /showForestAccessError\(error\)/);
  assert.doesNotMatch(game, /catch\s*\([^)]*\)\s*\{[^}]*new DemoForestAdapter\(\)/);
});
