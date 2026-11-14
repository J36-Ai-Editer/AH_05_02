const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../src/frontend/app.js"), "utf8");

function loadFunctions(context, names) {
  for (const name of names) {
    const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
}

function formNode() {
  return {
    checked: false,
    disabled: false,
    hidden: true,
    value: "",
    textContent: "",
    options: [],
    getAttribute() { return null; },
    replaceChildren() { this.innerHTML = ""; },
    set innerHTML(value) {
      this.html = value;
      this.options = [...value.matchAll(/<option value="([^"]+)" ([^>]*)>/g)]
        .map(([, code, attributes]) => ({ value: code, disabled: attributes.includes("disabled") }));
    },
    get innerHTML() { return this.html; },
  };
}

function candidate(challenge_id, code, domain, extra = {}) {
  return { challenge_id, code, title: code, domain, catalog_version: "personal-v4", verification_type: 3, ...extra };
}

const v4 = {
  items: [
    candidate(1, "desk-drink", "hydration"),
    candidate(3, "desk-lunch", "fiber_diet"),
    candidate(4, "desk-break", "aerobic_activity"),
  ],
  options: [
    candidate(2, "compare-drinks", "hydration"),
    candidate(1, "desk-drink", "hydration"),
    candidate(3, "desk-lunch", "fiber_diet"),
    candidate(4, "desk-break", "aerobic_activity"),
  ],
  policy: { notice: "실천할 상황을 반영했어요.", adjustment_tips: ["미리 준비해요."] },
};

function setup(api) {
  const nodes = new Map();
  const $ = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, formNode());
    return nodes.get(selector);
  };
  const state = { token: "A", selectedChallengeIds: new Set() };
  const challengeV3 = { owner: null, request: 0, rotation: 0 };
  const messages = [];
  const context = vm.createContext({
    $, $$: () => [$("#start-challenge")], state, challengeV3, api, challengeDay: () => "2026-11-15",
    isLocalPreview: () => false, showChallengeSelectionView() {}, renderChallengeChoices() {},
    updateChallengeStartState() {
      $("#start-challenge").disabled = state.challengeListStatus !== "ready" || state.challengeStartSafetyBlocked
        || !$("#challenge-follow-up").hidden || state.selectedChallengeIds.size !== 3;
    },
    escapeHtml: (value) => String(value), showMessage: (value) => messages.push(value),
  });
  loadFunctions(context, [
    "selectV3Challenges", "readPersonalChallengePreferences", "challengeStartPayload", "resetPersonalChallengeControls", "setChallengeChoices",
    "loadSelectableChallenges", "loadV3Challenges", "challengeRecordType", "simpleRecordPresentation",
    "isHydrationRecord", "usesWaterServingControl",
  ]);
  return { $, state, challengeV3, context, messages };
}

test("personal preferences use a private POST and the recommended item is preselected per domain", async () => {
  const calls = [];
  const { $, state, context } = setup(async (url, options) => { calls.push([url, options]); return v4; });
  await context.loadV3Challenges();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/challenge-recommendations/personal");
  assert.equal(calls[0][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    difficulty: "easy", focus: "balanced", context: "any", mobility: "unspecified", sweet_drinks: "unspecified",
    use_health_record: false, use_activity_history: false, rotation: 0,
  });
  assert.deepEqual([...state.selectedChallengeIds], [1, 3, 4]);
  assert.equal($("#start-challenge").disabled, false);
  assert.match($("#challenge-v3-policy").textContent, /미리 준비해요/);
  $("#challenge-v4-hydration").value = "compare-drinks";
  context.selectV3Challenges();
  assert.deepEqual([...state.selectedChallengeIds], [2, 3, 4]);
  $("#challenge-context").value = "work";
  $("#challenge-mobility").value = "limited";
  $("#challenge-sweet-drinks").value = "often";
  $("#challenge-use-health-record").checked = true;
  await context.loadV3Challenges();
  assert.equal(calls[1][0], "/challenge-recommendations/personal");
  assert.deepEqual(JSON.parse(calls[1][1].body), {
    difficulty: "easy", focus: "balanced", context: "work", mobility: "limited", sweet_drinks: "often",
    use_health_record: true, use_activity_history: false, rotation: 0,
  });
  state.predictionId = 88;
  assert.deepEqual(JSON.parse(JSON.stringify(context.challengeStartPayload([...state.selectedChallengeIds]))), {
    start_date: "2026-11-15", challenge_ids: [1, 3, 4], prediction_id: null, catalog_version: "personal-v4",
    difficulty: "easy", focus: "balanced", context: "work", mobility: "limited", sweet_drinks: "often",
    use_health_record: true, use_activity_history: false,
  });
});

test("server safety rejection cannot leave stale selections available to start", async () => {
  const { $, state, context } = setup(async () => ({ ...v4, items: [], options: [], availability_reason: "이용 대상 확인이 필요해요." }));
  state.selectedChallengeIds.add(100);
  await context.loadV3Challenges();
  assert.equal(state.selectedChallengeIds.size, 0);
  assert.equal($("#start-challenge").disabled, true);
  assert.match($("#challenge-v3-policy").textContent, /이용 대상 확인/);
});

test("pending follow-up blocks starting and a previous account response cannot populate or restore controls", async () => {
  const resolutions = [];
  const { $, state, context } = setup((url) => url === "/follow-up-actions"
    ? Promise.resolve({ items: [{ action_id: 44 }] })
    : new Promise((resolve) => resolutions.push(resolve)));
  const first = context.loadV3Challenges();
  state.token = "B";
  const second = context.loadV3Challenges();
  resolutions[0](v4);
  await first;
  assert.equal(state.selectedChallengeIds.size, 0);
  assert.equal($("#start-challenge").disabled, true);
  resolutions[1]({ ...v4, medical_guidance_required_first: true });
  await second;
  assert.equal($("#challenge-follow-up").hidden, false);
  assert.deepEqual([...state.openFollowUpActionIds], [44]);
  assert.equal($("#start-challenge").disabled, true);
});

test("new nutrition and activity missions use a simple check and do not show the old water volume input", () => {
  const { context } = setup(async () => v4);
  const hydration = { ...v4.items[0], completion_rule: "음료 표시를 비교했다면 기록해요." };
  const diet = { ...v4.items[1], title: "점심 한 접시" };
  assert.equal(context.challengeRecordType(diet), "simple");
  assert.equal(context.usesWaterServingControl(hydration), false);
  assert.equal(context.simpleRecordPresentation(hydration).description, hydration.completion_rule);
  assert.equal(context.usesWaterServingControl({ domain: "hydration", catalog_version: "evidence-v3" }), true);
  assert.equal(context.challengeRecordType({ catalog_version: "evidence-v3", verification_type: 1 }), "photo");
});

test("recording a drink-swap challenge sends one completion, independent of legacy serving count", async () => {
  const calls = [];
  const state = { token: "A", cycle: {}, dailyCompleted: new Set(), waterServingsByChallenge: {} };
  const context = vm.createContext({
    state, challengeDay: () => "2026-11-15", isLocalPreview: () => false,
    api: async (url, options) => calls.push([url, options]), renderDailyRecordList() {}, updateDailyRecordSummary() {},
    loadWeeklyReport: async () => {}, allDailyChallengesCompleted: () => false, showMessage() {},
  });
  loadFunctions(context, ["isHydrationRecord", "usesWaterServingControl", "completeDailyRecord"]);
  const target = { id: "42", item: v4.items[0] };
  await context.completeDailyRecord(target, "self_report", 8);
  await context.completeDailyRecord(target, "self_report", 8);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/user-challenges/42/logs/2026-11-15");
  assert.deepEqual(JSON.parse(calls[0][1].body), { is_completed: true, source: "self_report", note: null, value: 1 });
  assert.deepEqual(state.waterServingsByChallenge, {});
  assert.deepEqual([...state.dailyCompleted], ["42"]);
});
