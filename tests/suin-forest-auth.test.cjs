const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.join(__dirname, '../src/frontend');
const source = fs.readFileSync(path.join(frontend, 'suin/app.js'), 'utf8');
const html = fs.readFileSync(path.join(frontend, 'suin/index.html'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'suin/styles.css'), 'utf8');
const gate = source.slice(source.indexOf('const returningToForest ='), source.indexOf('function setFormBusy'));

function flow(search = '?returnTo=forest-challenges', failure) {
  const requests = [], destinations = [], screens = [], messages = [];
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search, assign: url => destinations.push(url) } },
    api: async (url, options) => { requests.push({ url, method: options.method }); if (failure) throw failure; return { enrolled: false }; },
    beginReturningEligibility: destination => screens.push(destination),
    showStoredEligibilityGuidance: () => screens.push('safety-guidance'),
    showStep: step => screens.push(step),
    showMessage: message => messages.push(message),
  });
  vm.runInContext(gate, context);
  return { context, requests, destinations, screens, messages };
}

test('only the fixed forest return marker is accepted', async () => {
  for (const search of ['', '?returnTo=https://example.test', '?returnTo=//example.test', '?returnTo=/forest']) {
    const { context, requests, destinations } = flow(search);
    assert.equal(await context.returnToForestSettings({ service_eligible: true }), false);
    assert.equal(requests.length, 0);
    assert.equal(destinations.length, 0);
  }
});

test('successful account flow checks the server without creating a plan and returns to forest settings', async () => {
  const { context, requests, destinations } = flow();
  assert.equal(await context.returnToForestSettings({ service_eligible: true, reason_codes: [] }), true);
  assert.deepEqual(requests, [{ url: '/challenge-v2/today', method: 'GET' }]);
  assert.deepEqual(destinations, ['/forest#daily-settings']);
});

test('missing eligibility requires the real questionnaire instead of fabricated answers', async () => {
  const { context, requests, destinations, screens } = flow();
  assert.equal(await context.returnToForestSettings(null), true);
  assert.deepEqual(screens, ['forest-challenges']);
  assert.equal(requests.length, 0);
  assert.equal(destinations.length, 0);
});

test('medical, age, and consent exclusions cannot redirect into challenge settings', async () => {
  for (const reason of ['DIAGNOSED_DIABETES', 'URGENT_MEDICAL_ATTENTION', 'SAME_DAY_MEDICAL_ATTENTION', 'CONSENT_REQUIRED', 'UNDER_MINIMUM_SERVICE_AGE']) {
    const { context, requests, destinations, screens } = flow();
    await context.returnToForestSettings({ service_eligible: true, reason_codes: [reason] });
    assert.deepEqual(screens, ['safety-guidance']);
    assert.equal(requests.length, 0);
    assert.equal(destinations.length, 0);
  }
  const { context, destinations } = flow();
  await context.returnToForestSettings({ service_eligible: false });
  assert.equal(destinations.length, 0);
});

test('fresh server safety denial or service outage remains visible and cannot redirect', async () => {
  for (const status of [401, 403, 503]) {
    const failure = Object.assign(new Error('서버 확인이 필요합니다.'), { status });
    const { context, requests, destinations, messages } = flow(undefined, failure);
    await context.returnToForestSettings({ service_eligible: true });
    assert.equal(requests.length, 1);
    assert.equal(destinations.length, 0);
    assert.deepEqual(messages, ['서버 확인이 필요합니다.']);
  }
});

test('isolated upstream frontend keeps assets local and contains no embedded map key', () => {
  const all = [html, source, css].join('\n');
  assert.doesNotMatch(all, /appkey=|KAKAO[_A-Z]*\s*=\s*["'][a-z0-9]{16}/i);
  assert.doesNotMatch(all, /\/static\/(?!suin\/)/);
  const matches = [...all.matchAll(/\/static\/suin\/assets\/([^"'`\s)<]+)/g)];
  assert.ok(matches.length > 20);
  for (const match of matches) {
    const name = match[1].split('?')[0];
    if (name.includes('${')) continue;
    assert.ok(fs.existsSync(path.join(frontend, 'suin/assets', name)), name);
  }
  for (const gender of ['male', 'female']) for (const age of [20, 30, 40, 50, 60, 70]) {
    assert.ok(fs.existsSync(path.join(frontend, `suin/assets/lifestyle-avatar-${gender}-${age}.webp`)));
  }
});

test('account route disables preview fixtures and uses the current backend profile contract', () => {
  assert.match(source, /const isDemoEnvironment = \(\) => false;/);
  assert.doesNotMatch(source, /\/users\/me\/profile/);
  assert.match(source, /syncReturningEligibilityState\(latestEligibility\);\s+if \(await returnToForestSettings\(latestEligibility\)\) return;/);
  assert.match(source, /syncReturningEligibilityState\(result\);\s+if \(await returnToForestSettings\(result\)\) return;/);
  assert.match(source, /credentials: "same-origin", cache: "no-store"/);
  assert.match(html, /id="login-form"/);
  assert.match(html, /만 19세 이상/);
});

test('separate same-origin service route preserves the original main page', () => {
  const main = fs.readFileSync(path.join(__dirname, '../app/main.py'), 'utf8');
  assert.match(main, /@app\.get\("\/service", include_in_schema=False\)/);
  assert.match(main, /FileResponse\(FRONTEND_DIR \/ "suin" \/ "index\.html"\)/);
  assert.match(main, /async def home\(/);
  assert.match(main, /auth: str \| None = Query\(default=None\)/);
  assert.match(main, /page = "index\.html" if intro == "original" else "intro-retro\.html"/);
  assert.doesNotMatch(main, /auth in \{"login", "signup"\}/);
});
