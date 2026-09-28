const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/frontend/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/frontend/index.html'), 'utf8');
function load(name, data) {
  const context = vm.createContext(data);
  const fn = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(fn, name);
  vm.runInContext(fn[0], context);
  return context[name];
}
test('MVP excludes survival chart, scenarios and research API callers, retaining both result areas', () => {
  assert.doesNotMatch(html, /id="(?:risk-forecast-panel|age-risk-chart|scenario-comparison-title|uncertainty-panel)"/);
  assert.match(html, /id="risk-confirm-card"/);
  assert.match(html, /id="future-risk-category"/);
  assert.doesNotMatch(source, /\/research\/models\/|tryRunJunhyukModelDemo|future_forecast/);
});
test('legacy local preview is a clearly labelled two-model fixture and performs no API calls', () => {
  const state = {};
  let rendered;
  const preview = load('renderMvpResultPreview', { state, renderPrediction: value => { rendered = value; } });
  preview();
  assert.equal(state.currentScreeningPrediction.model_key, 'diabetes_current_screening');
  assert.equal(rendered.model_key, 'diabetes_incidence');
  assert.equal(rendered.preview_only, true);
  assert.equal(rendered.display_allowed, false);
  assert.equal(rendered.operational_model_activated, false);
  assert.equal(rendered.age_risk_forecast, undefined);
});
test('MVP prediction requests reject research/lifetime models before any HTTP call', async () => {
  const calls = [];
  const request = load('requestPredictionModel', {
    state: { checkupId: 10, currentScreeningInputId: 20 },
    api: async (url, options) => { calls.push({ url, options }); return { job_id: 1 }; },
    rememberModelOutputMetadata() {}, renderPredictionStatus() {}, pollPrediction: async () => 2,
  });
  for (const key of ['diabetes_lifetime_risk', 'diabetes_incidence_multihorizon', 'first-interval']) {
    await assert.rejects(request(key), /지원하지 않는/);
  }
  assert.equal(calls.length, 0);
  await request('diabetes_current_screening');
  assert.deepEqual(JSON.parse(calls[0].options.body), { checkup_id: 10, model_key: 'diabetes_current_screening', current_screening_input_id: 20 });
  calls.length = 0;
  await request('diabetes_incidence');
  assert.deepEqual(JSON.parse(calls[0].options.body), { checkup_id: 10, model_key: 'diabetes_incidence' });
});
