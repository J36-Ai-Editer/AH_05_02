const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../src/frontend/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../src/frontend/index.html'), 'utf8');

function loadFunctions(names, context = {}) {
  vm.createContext(context);
  for (const name of names) {
    const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
    assert.ok(match, `Function ${name} exists`);
    vm.runInContext(match[0], context);
  }
  return context;
}

for (const code of [2, 3]) {
  test(`location error ${code} retries with high accuracy`, async () => {
    const calls = [];
    const context = loadFunctions(['getCurrentPosition', 'getCurrentPositionWithRetry'], {
      navigator: { geolocation: { getCurrentPosition(resolve, reject, options) {
        calls.push(options);
        if (calls.length === 1) reject({ code });
        else resolve({ coords: { latitude: 35, longitude: 129 } });
      } } },
    });
    const result = await context.getCurrentPositionWithRetry();
    assert.equal(result.coords.latitude, 35);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].enableHighAccuracy, true);
    assert.equal(calls[1].maximumAge, 0);
  });
}

test('permission denial is not retried or replaced with another location', async () => {
  let calls = 0;
  const context = loadFunctions(['getCurrentPosition', 'getCurrentPositionWithRetry'], {
    navigator: { geolocation: { getCurrentPosition(resolve, reject) { calls++; reject({ code: 1 }); } } },
  });
  await assert.rejects(context.getCurrentPositionWithRetry(), error => error.code === 1);
  assert.equal(calls, 1);
});

function displayContext(today) {
  const nodes = new Map();
  function $(id) {
    if (!nodes.has(id)) nodes.set(id, {
      dataset: {}, hidden: false, textContent: '', innerHTML: '',
      setAttribute(key, value) { this[key] = value; }, querySelector() { return this; },
    });
    return nodes.get(id);
  }
  const context = loadFunctions(['normalizeRiskKey', 'normalizeCurrentScreeningRiskKey', 'updateResultConfirmation', 'renderPrediction'], {
    $, nodes, state: { currentScreeningPrediction: today },
    isDemoEnvironment: () => false, normalizeForecastSignal: () => null,
    isPublicRiskDisplayAllowed: prediction => prediction?.result_status === 'approved'
      && prediction?.promotion_status === 'approved'
      && prediction?.display_allowed !== false,
    rememberModelOutputMetadata: () => {}, requiresMedicalResultGuidance: () => false,
    renderPredictionStatus: () => {}, showFuturePredictionResult: () => {},
    renderAgeRiskForecast: () => {}, updateLifestyleSummary: () => {},
    forecastSignalLabel: key => key, escapeHtml: text => text,
  });
  return context;
}

const approved = (model, risk) => ({
  model_key: model, risk_category: risk, risk_category_label: risk,
  result_status: 'approved', promotion_status: 'approved', raw_probability_exposed: false,
});

test('future high does not overwrite today low traffic light', () => {
  const context = displayContext(approved('diabetes_current_screening', 'low'));
  context.renderPrediction(approved('diabetes_incidence', 'high'), {});
  assert.equal(context.$('#risk-confirm-card').dataset.risk, 'low');
  assert.match(context.$('#future-risk-category').textContent, /high/);
  assert.match(context.$('#risk-traffic-light')['aria-label'], /현재/);
});

test('today uses a binary low/high signal while tomorrow retains low/caution/high categories', () => {
  const todayCard = html.slice(html.indexOf('id="risk-confirm-card"'), html.indexOf('id="future-prediction-result"'));
  assert.match(todayCard, /data-risk-preview="low"/);
  assert.match(todayCard, /data-risk-preview="high"/);
  assert.doesNotMatch(todayCard, /data-risk-preview="caution"|traffic-signal caution/);
  const context = displayContext(approved('diabetes_current_screening', 'caution'));
  context.updateResultConfirmation(context.state.currentScreeningPrediction);
  assert.equal(context.$('#risk-confirm-card').dataset.risk, 'pending');
  assert.equal(context.normalizeRiskKey(approved('diabetes_incidence', 'caution')), 'caution');
});

for (const today of [null, { ...approved('diabetes_current_screening', 'high'), result_status: 'development_only' }]) {
  test(`missing or unapproved today is not replaced by approved future (${today?.result_status || 'missing'})`, () => {
    const context = displayContext(today);
    context.renderPrediction(approved('diabetes_incidence', 'high'), {});
    assert.equal(context.$('#risk-confirm-card').dataset.risk, 'pending');
  });
}

test('research forecast stays excluded from MVP even with approval and uncertainty bounds', () => {
  const context = loadFunctions(['forecastCurveDisplayAllowed']);
  const point = { lower: 0.1, upper: 0.3 };
  assert.equal(context.forecastCurveDisplayAllowed({}, true), false);
  assert.equal(context.forecastCurveDisplayAllowed({
    public_display_approved: true,
    risk_curve_status: 'available',
    calibration_status: 'approved',
    points: [point],
  }, false), false);
  assert.equal(context.forecastCurveDisplayAllowed({
    public_display_approved: true,
    risk_curve_status: 'available',
    calibration_status: 'approved',
    points: [point],
  }, true), false);
});

test('search reset clears results and every previous map marker', () => {
  const nodes = new Map();
  const removed = [];
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: 'old', hidden: false });
    return nodes.get(selector);
  };
  const context = loadFunctions(['clearFacilityMapMarkers', 'resetFacilitySearchUi'], {
    $, facilityMapMarkers: { medical: [{ setMap(value) { removed.push(value); } }], emergency: [] },
  });
  context.resetFacilitySearchUi('medical');
  assert.equal($('#medical-facility-results').innerHTML, '');
  assert.equal($('#medical-facility-map').hidden, true);
  assert.deepEqual(removed, [null]);
  assert.equal(context.facilityMapMarkers.medical.length, 0);
});
