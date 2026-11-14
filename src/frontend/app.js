const state = { step: 1, visitedSteps: new Set([1]), navigationHistory: [1], token: null, userProfile: null, sessionRecovery: null, healthDraftDirty: false, healthConsent: null, healthConsentStatus: "unknown", checkupId: null, healthCheckupResult: null, healthCheckupHistory: [], healthHistoryPage: 1, healthHistoryStartDate: "", healthHistoryEndDate: "", editingHealthCheckupId: null, currentScreeningInputId: null, currentScreeningPredictionId: null, currentScreeningPrediction: null, predictionId: null, prediction: null, modelOutputMetadata: {}, developmentPreviewRiskCategory: null, cycle: null, dailyCompleted: new Set(), waterServingsByChallenge: {}, recordTarget: null, photoAttempt: 0, photoCompletedByFallback: false, returningUser: false, eligibility: null, requiresEligibility: false, returningDestination: null, medicalGuidanceRequired: false, openFollowUpActionIds: [], modelOutOfRange: false, currentHealthOnly: false, capabilities: { challenge: false, currentHealth: false, futurePrediction: false }, walkingLevel: "starter", wearableConnectionId: null, wearableProvider: null, wearablePreviewItems: [], ocrExtractedFields: {}, notificationsEnabled: true, foodAnalysisId: null, foodCategory: null, ocrDraftId: null, challengeRecommendations: [], challengeCatalog: [], challengeRecommendationsPersonalized: false, selectedChallengeIds: new Set(), activeChallengeCategory: null, customChallenge: null, customChallengeSelected: false, educationContents: [], activeEducationId: null, educationQuizIndex: 0, educationQuizCorrectCount: 0, ragChallengeDraft: null, ragChallengeCandidates: [], selectedRagChallengeId: null, ragChallengeStatus: "idle", lastKnownLocation: null, challengeV2Expanded: false, activeWorkspace: "home" };
const $ = (selector) => document.querySelector(selector);
Object.assign(state, { lifestyleReportStatus: "idle", reportPeriods: {}, reportPeriodStatus: {} });
const $$ = (selector) => [...document.querySelectorAll(selector)];
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const challengeV3 = { active: false, busy: false, focus: "balanced", difficulty: "easy", photoReviewAvailable: false, demoPhotoSubmissionOnly: false, owner: null, request: 0, catalogVersion: "evidence-v3", preferences: null, rotation: 0 };
const challengeDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const challengeLevelLabel = (level) => ({ easy: "쉬움", moderate: "보통", advanced: "도전" }[level] || "공통");
const challengeProofLabel = (type) => ({ 1: "1유형 · 사진 + 채소 확인", 2: "2유형 · 사진 제출", 3: "3유형 · 자가 체크" }[type] || "기존 기록 방식");
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const safeExternalUrl = (value) => {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const isDemoEnvironment = () => ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const isLocalPreview = () => isDemoEnvironment() && state.token === "local-demo-token";
const HEALTH_DRAFT_STORAGE_KEY = "gandang-health-draft-v1";
const SESSION_RECOVERY_STORAGE_KEY = "gandang-session-recovery-v1";
const HEALTH_DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function setFormBusy(form, activeButton, busyLabel) {
  if (!form) return () => {};
  const submitButton = activeButton || form.querySelector("button[type='submit']");
  if (!submitButton) return () => {};
  const buttons = [...form.querySelectorAll("button")];
  const previousStates = buttons.map((button) => ({ button, disabled: button.disabled }));
  const previousLabel = submitButton.textContent;
  form.setAttribute("aria-busy", "true");
  buttons.forEach((button) => { button.disabled = true; });
  submitButton.textContent = busyLabel;
  return () => {
    form.removeAttribute("aria-busy");
    previousStates.forEach(({ button, disabled }) => { button.disabled = disabled; });
    submitButton.textContent = previousLabel;
  };
}

function setButtonBusy(button, busyLabel) {
  if (!button) return () => {};
  const previousDisabled = button.disabled;
  const previousLabel = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = busyLabel;
  return () => {
    button.disabled = previousDisabled;
    button.removeAttribute("aria-busy");
    button.textContent = previousLabel;
  };
}

const fallbackChallenges = [
  {
    challenge_id: 101,
    category: "activity",
    title: "가볍게 걷기",
    daily_goal: "하루 10분 이상 걷기 또는 가벼운 활동 기록",
    description: "무리한 운동이 아니라 오늘 움직인 시간을 간단히 기록합니다.",
    recommendation_reason: "신체활동·걷기 지침을 바탕으로 한 기본 실천입니다.",
    source: { title: "신체활동·걷기 지침", url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6251" },
  },
  {
    challenge_id: 102,
    category: "diet",
    title: "식사 리듬 지키기",
    daily_goal: "하루 식사 횟수와 규칙성 기록",
    description: "식사 시간과 횟수를 돌아보며 규칙적인 식사 습관을 점검합니다.",
    recommendation_reason: "규칙적인 식사와 균형 잡힌 식사 관리를 바탕으로 합니다.",
    source: { title: "질병관리청 국가건강정보포털 당뇨병", url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=5305" },
  },
  {
    challenge_id: 103,
    category: "diet",
    title: "덜 달게 마시기",
    daily_goal: "단 음료 대신 물 선택, 당류 섭취 줄이기",
    description: "오늘 마신 음료를 확인하고 단 음료를 줄이는 작은 선택을 기록합니다.",
    recommendation_reason: "건강생활실천 캠페인의 저당 실천과 당뇨 생활습관 관리 방향을 반영했습니다.",
    source: { title: "건강생활실천 캠페인", url: "https://www.korea.kr/news/policyNewsView.do?newsId=148941115" },
  },
  {
    challenge_id: 104,
    category: "tracking",
    title: "정기 점검하기",
    daily_goal: "건강검진 결과 확인, 혈당·혈압·허리둘레 기록 여부 점검",
    description: "검진 결과와 주요 건강 수치를 잊지 않고 확인하는 습관을 만듭니다.",
    recommendation_reason: "정기적인 혈당 확인과 검진 안내를 바탕으로 합니다.",
    source: { title: "혈당·혈압 관리법", url: "https://m.korea.kr/news/healthView.do?newsId=148948966" },
  },
];

const localNotionChallenges = [
  [201, "activity", "빠르게 걷기", "몸 상태에 맞춰 최대 30분"],
  [202, "activity", "식후 10분 가볍게 움직이기", "걷기 또는 가벼운 집안일"],
  [203, "activity", "30분마다 일어나기", "3~5분 가볍게 움직이기"],
  [204, "activity", "주 150분 움직이기", "중강도 활동시간 누적 기록"],
  [205, "activity", "주 3일 이상 걷기", "운동한 날 자동 집계"],
  [206, "activity", "근력운동 주 2회", "연속되지 않은 날에 2회"],
  [207, "activity", "균형·유연성 운동 주 2회", "스트레칭·의자·균형운동"],
  [208, "diet", "단 음료 대신 물", "물 또는 무가당 음료 선택"],
  [209, "diet", "채소 먼저 먹기", "한 끼 이상에서 채소 먼저 먹기"],
  [210, "diet", "접시 절반 채소", "한 끼의 약 절반을 채소로 구성"],
  [211, "diet", "통곡물·잡곡 선택", "한 끼를 잡곡·통곡물·콩류로 바꾸기"],
  [212, "diet", "과일은 통째로", "과일주스 대신 생과일 선택"],
  [213, "diet", "달콤한 간식 바꾸기", "견과류·무가당 유제품·과일 선택"],
  [214, "diet", "가공식품 줄이기", "가공식품을 먹지 않은 하루 만들기"],
  [215, "diet", "천천히 식사하기", "한 끼를 15분 이상 먹기"],
  [216, "tracking", "오늘 식사 돌아보기", "채소·통곡물·단 음료 여부 기록"],
  [217, "tracking", "7~8시간 수면 기록", "기상 후 수면시간 입력"],
  [218, "tracking", "오늘도 금연", "담배와 전자담배 사용하지 않기"],
  [219, "tracking", "건강한 장보기", "건강한 식재료 3종 이상 준비"],
  [220, "tracking", "생활습관 돌아보기", "운동·식사·수면 기록 주 1회 확인"],
  [221, "diet", "무가당 음료 주 5일", "물 또는 무가당 음료를 선택한 날 기록"],
  [222, "diet", "채소 먹기 주 5일", "채소를 충분히 먹은 날 기록"],
  [223, "diet", "통곡물 선택 주 3회", "잡곡·통곡물·콩류를 선택한 횟수 기록"],
  [224, "tracking", "체중 추이 확인", "주 1회 같은 조건에서 기록 확인"],
].map(([challenge_id, category, title, daily_goal]) => ({ challenge_id, category, title, daily_goal }));

const challengeCategories = {
  activity: { title: "움직이기", description: "걷기·근력·짧은 움직임", mascot: "/static/assets/hyeoldangi-challenge-walking.png", mascotAlt: "활기차게 걷는 혈당이" },
  diet: { title: "건강하게 먹기", description: "물·채소·통곡물 선택", mascot: "/static/assets/hyeoldangi-challenge-meal.png", mascotAlt: "건강한 식사를 들고 있는 혈당이" },
  tracking: { title: "기록하기", description: "식사·수면·생활습관 확인", mascot: "/static/assets/hyeoldangi-daily-record.png", mascotAlt: "오늘의 생활습관을 기록하는 혈당이" },
};

const workspaceHeroCopy = {
  home: {
    eyebrow: "나의 건강 홈",
    title: "오늘 할 일부터 확인하세요",
    lead: "상세 기능은 아래 메뉴에서 필요한 때에만 열 수 있습니다.",
  },
  challenge: {
    eyebrow: "오늘의 실천",
    title: "챌린지 기록",
    lead: "챌린지를 눌러 오늘의 실천을 기록해요.",
  },
  report: {
    eyebrow: "작은 실천이 쌓이는 곳",
    title: "생활습관 리포트",
    lead: "기록을 돌아보고, 나에게 맞는 다음 실천을 찾아보세요.",
  },
  together: {
    eyebrow: "함께하기",
    title: "당근의 숲",
    lead: "가족·친구와 챌린지 수행 상태를 함께 확인해요.",
  },
  tools: {
    eyebrow: "선택 기능",
    title: "건강도구",
    lead: "필요한 도구만 골라 사용해요.",
  },
};

function challengeMascot(item) {
  const title = String(item?.title || "");
  if (title.includes("걷")) return { src: "/static/assets/hyeoldangi-challenge-walking.png", alt: "걷기 실천을 시작하는 혈당이" };
  if (title.includes("식사")) return { src: "/static/assets/hyeoldangi-challenge-meal.png", alt: "균형 잡힌 식사 리듬을 안내하는 혈당이" };
  if (title.includes("달게") || title.includes("물")) return { src: "/static/assets/hyeoldangi-challenge-water.png", alt: "물 선택을 응원하는 혈당이" };
  if (title.includes("점검") || title.includes("검진")) return { src: "/static/assets/hyeoldangi-challenge-checkup.png", alt: "정기 건강 점검을 안내하는 혈당이" };
  return { src: "/static/assets/hyeoldangi-cheer.png", alt: "생활습관 실천을 응원하는 혈당이" };
}

class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.code = options.code || "REQUEST_FAILED";
    this.status = options.status || 0;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = Number(options.retryAfterSeconds || 0);
    this.details = options.details || null;
  }
}

function fallbackApiErrorCode(status) {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 503) return "MODEL_NOT_READY";
  if (status === 504) return "TIMEOUT";
  if (status >= 500) return "SERVER_ERROR";
  return "REQUEST_FAILED";
}

function normalizeModelErrorCode(code) {
  return {
    ML_INPUT_INVALID: "ML_INPUT_OUT_OF_RANGE",
    MODEL_UNAVAILABLE: "ML_MODEL_UNAVAILABLE",
    MODEL_CONTRACT_INVALID: "ML_MODEL_CONTRACT_ERROR",
  }[code] || code;
}

function fallbackApiErrorMessage(code) {
  const normalizedCode = normalizeModelErrorCode(code);
  return {
    UNAUTHENTICATED: "로그인 정보가 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.",
    PAYLOAD_TOO_LARGE: "사진 전송 용량이 서버 한도를 초과했어요. 8MB 이하 사진으로 다시 시도해 주세요.",
    CONFLICT: "이미 등록된 정보와 겹칩니다. 입력 내용을 확인해 주세요.",
    VALIDATION_ERROR: "입력값의 형식과 범위를 확인해 주세요.",
    ML_INPUT_MISSING: "분석에 필요한 건강정보가 빠져 있습니다. 입력정보를 확인해 주세요.",
    ML_INPUT_OUT_OF_RANGE: "분석할 수 있는 범위를 벗어난 건강정보가 있습니다. 입력값을 확인해 주세요.",
    ML_POPULATION_UNSUPPORTED: "현재 연령은 미래 발병 위험 예측 대상에 포함되지 않습니다.",
    ML_POPULATION_INELIGIBLE: "현재 입력정보로는 미래 발병 위험 예측을 진행할 수 없습니다.",
    ML_MODEL_UNAVAILABLE: "현재 예측 모델을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.",
    ML_MODEL_CONTRACT_ERROR: "예측 모델 연결을 점검하고 있습니다. 입력정보는 안전하게 유지됩니다.",
    FEATURE_SCHEMA_VERSION_MISMATCH: "건강정보 입력 규격이 서버와 일치하지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
    MODEL_NOT_READY: "현재 예측 모델을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    TIMEOUT: "요청 처리 시간이 초과되었습니다. 입력정보는 유지되며 다시 시도할 수 있습니다.",
    SERVER_ERROR: "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    REQUEST_FAILED: "요청을 처리하지 못했습니다.",
  }[normalizedCode] || "요청을 처리하지 못했습니다.";
}

const predictionFailureGuidance = {
  ML_INPUT_MISSING: {
    eyebrow: "입력정보 확인 필요", title: "필수 건강정보를 확인해 주세요", stage: "입력 확인", icon: "!",
    message: "분석에 필요한 건강정보가 빠져 있어 예측을 시작하지 않았습니다.",
    policy: "건강정보 입력 화면에서 빠진 항목을 입력한 뒤 다시 요청할 수 있습니다.",
    failureTitle: "분석에 필요한 정보가 부족합니다",
    failureMessage: "입력정보는 유지되어 있습니다. 빠진 항목을 확인해 주세요.",
  },
  ML_INPUT_OUT_OF_RANGE: {
    eyebrow: "입력 범위 확인 필요", title: "건강정보의 입력값을 확인해 주세요", stage: "범위 확인", icon: "!",
    message: "분석할 수 있는 범위를 벗어난 값이 있어 예측을 진행하지 않았습니다.",
    policy: "임의로 값을 바꾸거나 결과를 만들지 않습니다. 입력한 수치를 확인해 주세요.",
    failureTitle: "입력 범위를 벗어난 항목이 있습니다",
    failureMessage: "건강정보 입력 화면에서 키·몸무게·운동시간 등의 값을 확인해 주세요.",
  },
  ML_POPULATION_UNSUPPORTED: {
    eyebrow: "예측 대상 연령 확인", title: "현재 연령은 미래 발병 예측 대상이 아닙니다", stage: "대상 확인", icon: "!",
    message: "RF25 미래 발병 위험 예측은 만 45~105세 범위에서만 진행합니다.",
    policy: "예측 대상이 아니어도 이용 가능한 현재 건강 신호와 생활습관 챌린지는 계속 안내합니다.",
    failureTitle: "미래 발병 위험 예측 대상 연령이 아닙니다",
    failureMessage: "연령을 다시 확인하거나 이용 가능한 건강정보·생활습관 기능을 이용해 주세요.",
  },
  ML_POPULATION_INELIGIBLE: {
    eyebrow: "예측 대상 확인", title: "현재는 미래 발병 예측을 진행하지 않습니다", stage: "대상 확인", icon: "!",
    message: "기존 당뇨병 진단 여부 등 적용 기준을 확인한 결과 예측 대상에 포함되지 않습니다.",
    policy: "미래 발병 위험 예측 대신 의료진 안내와 이용 가능한 생활습관 기능을 우선합니다.",
    failureTitle: "현재 입력정보는 예측 대상에 해당하지 않습니다",
    failureMessage: "당뇨병 진단 여부와 이용 가능 확인 내용을 다시 확인해 주세요.",
  },
  ML_MODEL_UNAVAILABLE: {
    eyebrow: "모델 준비 중", title: "현재 예측 모델을 준비하고 있습니다", stage: "모델 준비", icon: "!",
    mascot: "/static/assets/hyeoldangi-analyzing.png",
    message: "서버에서 검증된 모델을 불러오지 못해 예측을 진행하지 않았습니다.",
    policy: "임의 점수나 위험 범주를 표시하지 않습니다. 잠시 후 다시 시도해 주세요.",
    failureTitle: "예측 모델을 불러오지 못했습니다",
    failureMessage: "입력정보는 유지되어 있습니다. 잠시 후 같은 정보로 다시 시도할 수 있습니다.",
  },
  ML_MODEL_CONTRACT_ERROR: {
    eyebrow: "모델 연결 점검 중", title: "예측 모델 연결을 점검하고 있습니다", stage: "연결 점검", icon: "!",
    mascot: "/static/assets/hyeoldangi-analyzing.png",
    message: "모델 버전과 입력 규격을 확인하는 동안 예측 결과를 제공하지 않습니다.",
    policy: "계약이 확인되기 전에는 점수·확률·위험 범주를 만들거나 표시하지 않습니다.",
    failureTitle: "예측 모델의 연결 규격을 확인하고 있습니다",
    failureMessage: "사용자가 수정할 문제는 아닙니다. 입력정보는 유지되며 서버 점검 후 다시 시도할 수 있습니다.",
  },
};

const eligibilityGuidance = {
  URGENT_MEDICAL_ATTENTION: {
    code: "E03", title: "즉시 도움이 필요합니다",
    message: "지금은 당뇨 위험도 예측보다 즉시 도움을 받는 것이 우선입니다.",
    reasonTitle: "즉시 도움이 필요한 증상",
    reason: "한 가지 이상의 즉시 도움이 필요한 증상을 선택했습니다.",
    action: "직접 운전하거나 병원을 검색하며 기다리지 말고 119에 연락해 현재 위치와 증상을 알려주세요.",
    primaryLabel: "119 안내 확인하기",
    primaryStep: null,
  },
  SAME_DAY_MEDICAL_ATTENTION: {
    code: "E04", title: "오늘 의료기관에 확인해 주세요",
    message: "현재 증상은 온라인 위험도 예측만으로 판단하기 어렵습니다.",
    reasonTitle: "당일 의료기관 확인이 필요한 증상",
    reason: "한 가지 이상의 당일 확인이 필요한 증상을 선택했습니다.",
    action: "예측과 챌린지를 중단하고 의료기관에 문의하거나 진료를 받아주세요. 증상이 심해지거나 이동하기 어려우면 119에 연락하세요.",
    primaryLabel: "의료기관 안내 확인하기",
    primaryStep: null,
  },
  DIAGNOSED_DIABETES: {
    code: "D01", title: "이미 당뇨병을 진단받은 사용자는 예측 대상이 아닙니다",
    message: "이미 당뇨병을 진단받은 사용자에게는 신규 발병 위험 예측을 제공하지 않습니다.",
    reasonTitle: "진단 여부 확인",
    reason: "의료진에게 당뇨병을 진단받은 적이 있다고 답했습니다.",
    action: "담당 의료진의 치료 지침을 우선하고 일반 건강정보를 확인하세요.",
    primaryLabel: "일반 건강정보 보기",
    primaryStep: 8,
    primaryWorkspace: "tools",
  },
  UNDER_MINIMUM_SERVICE_AGE: {
    code: "E02", title: "만 14세 미만은 서비스를 이용할 수 없습니다",
    message: "현재 계정 생성과 챌린지 이용 가능 연령은 만 14세 이상입니다.",
    reasonTitle: "입력한 생년월일",
    reason: "입력한 생년월일 기준으로 만 14세 미만에 해당합니다.",
    action: "건강 문제가 있다면 보호자와 함께 의료기관에 상담하세요.",
    primaryLabel: "서비스 소개로 돌아가기",
    primaryStep: 1,
  },
  CHALLENGE_ONLY_AGE: {
    code: "A14", title: "생활습관 챌린지를 이용할 수 있어요",
    message: "만 14~18세는 예측 없이 생활습관 챌린지를 이용합니다.",
    reasonTitle: "연령별 이용 범위",
    reason: "입력한 생년월일 기준으로 만 14~18세에 해당합니다.",
    action: "걷기·물 마시기처럼 부담이 적은 생활습관 챌린지를 선택할 수 있어요.",
    primaryLabel: "생활습관 챌린지 보기",
    primaryStep: 8,
    primaryWorkspace: "challenge",
  },
  MODEL_AGE_OUT_OF_RANGE: {
    code: "A19", title: "현재 건강 신호를 확인할 수 있어요",
    message: "만 19~44세는 현재 건강 신호와 생활습관 챌린지를 이용합니다.",
    reasonTitle: "연령별 이용 범위",
    reason: "미래 발병 위험 모델은 만 45세 이상에게 적용되며, 현재 연령에서는 현재 건강 신호를 확인합니다.",
    action: "건강정보를 입력해 현재 건강 신호를 확인한 뒤 생활습관 챌린지로 이어갈 수 있어요.",
    primaryLabel: "현재 건강 신호 확인하기",
    primaryStep: 4,
  },
  MODEL_POPULATION_OUT_OF_SCOPE: {
    code: "E05", title: "현재 모델의 적용 대상이 아닙니다",
    message: "현재 모델이 검증된 대상 범위 밖이므로 개인화 예측을 제공하지 않습니다.",
    reasonTitle: "모델 적용 대상 확인",
    reason: "현재 모델이 검증된 대상 범위 밖에 해당합니다.",
    action: "일반 건강정보를 확인하고 필요한 경우 의료진과 상담하세요.",
    primaryLabel: "일반 건강정보 보기",
    primaryStep: 8,
    primaryWorkspace: "tools",
  },
  CONSENT_REQUIRED: {
    code: "E01", title: "건강정보 처리 동의가 필요합니다",
    message: "개인화 예측에는 건강정보 수집·이용 동의가 필요합니다.",
    reasonTitle: "동의 상태 확인",
    reason: "건강정보 입력·위험 확인 기능에 필요한 동의가 완료되지 않았습니다.",
    action: "동의 내용을 다시 확인한 뒤 동의 여부를 선택하세요.",
    primaryLabel: "동의 화면으로 돌아가기",
    primaryStep: 2,
  },
};

const jobStatusLabels = {
  queued: "접수·대기",
  running: "분석 중",
  succeeded: "완료",
  failed: "실패",
};
const riskCategoryLabels = {
  low: "낮음",
  moderate: "주의",
  caution: "주의",
  high: "높음",
  diabetes_screening_advised: "높음",
};

function getRiskCategoryLabel(prediction) {
  return prediction?.risk_category_label || riskCategoryLabels[prediction?.risk_category] || "확인 필요";
}

function normalizeCurrentSignalRisk(prediction = state.currentScreeningPrediction) {
  const raw = prediction?.risk_category || prediction?.risk_category_label || "";
  if (raw === "pending") return "pending";
  const risk = normalizeRiskKey(prediction);
  if (risk === "low") return "low";
  return "high";
}

function showEligibilityGuidance(reasonCodes) {
  state.eligibilityReturnFocus = document.activeElement;
  $("#eligibility-guidance").dataset.variant = "";
  const priority = [
    "URGENT_MEDICAL_ATTENTION", "SAME_DAY_MEDICAL_ATTENTION", "UNDER_MINIMUM_SERVICE_AGE", "DIAGNOSED_DIABETES", "CHALLENGE_ONLY_AGE",
    "MODEL_AGE_OUT_OF_RANGE", "MODEL_POPULATION_OUT_OF_SCOPE", "CONSENT_REQUIRED",
  ];
  const reason = priority.find((code) => reasonCodes.includes(code));
  const guidance = eligibilityGuidance[reason] || {
    code: "E00", title: "개인화 예측을 진행할 수 없습니다",
    message: "현재 입력 조건으로는 개인화 예측을 제공하지 않습니다.",
    reasonTitle: "입력 조건 확인",
    reason: "입력한 조건으로는 개인화 예측을 진행할 수 없습니다.",
    action: "입력정보를 확인하거나 일반 건강정보를 이용하세요.",
    primaryLabel: "안내 확인하기",
    primaryStep: null,
  };
  state.eligibilityGuidanceReason = reason || null;
  state.eligibilityGuidanceStep = guidance.primaryStep;
  state.eligibilityGuidanceWorkspace = guidance.primaryWorkspace || null;
  state.eligibilityGuidanceSecondaryStep = guidance.secondaryStep || null;
  state.modelOutOfRange = reason === "MODEL_AGE_OUT_OF_RANGE";
  state.currentHealthOnly = reason === "MODEL_AGE_OUT_OF_RANGE";
  $("#eligibility-guidance").dataset.code = guidance.code;
  $("#eligibility-guidance-title").textContent = guidance.title;
  $("#eligibility-guidance-message").textContent = guidance.message;
  $("#eligibility-guidance-reason-title").textContent = guidance.reasonTitle;
  $("#eligibility-guidance-reason").textContent = guidance.reason;
  $("#eligibility-guidance-action").textContent = guidance.action;
  $("#eligibility-guidance-primary").textContent = guidance.primaryLabel;
  const isUrgent = reason === "URGENT_MEDICAL_ATTENTION";
  const isSameDay = reason === "SAME_DAY_MEDICAL_ATTENTION";
  const isDiagnosed = reason === "DIAGNOSED_DIABETES";
  $("#urgent-guidance-actions").hidden = !isUrgent;
  $("#same-day-guidance-actions").hidden = !isSameDay;
  $("#diagnosed-guidance-actions").hidden = !isDiagnosed;
  $("#eligibility-guidance-primary").hidden = isUrgent || isSameDay || isDiagnosed;
  const secondary = $("#eligibility-guidance-secondary");
  if (secondary) {
    secondary.textContent = guidance.secondaryLabel || "";
    secondary.hidden = !guidance.secondaryStep;
  }
  $("#eligibility-guidance").hidden = false;
  $("#eligibility-guidance").focus({ preventScroll: true });
}

let _messageHome = null;
function showMessage(message, kind = "error") {
  const box = $("#message");
  if (!_messageHome) _messageHome = box.parentElement;
  // A message shown while a native <dialog> is open would otherwise render
  // behind that dialog's top layer (or its ::backdrop) and be invisible even
  // though it technically scrolls into view. Move it into the open dialog so
  // people actually see the warning instead of just feeling the page jump.
  const openDialogs = document.querySelectorAll("dialog[open]");
  const activeDialog = openDialogs.length ? openDialogs[openDialogs.length - 1] : null;
  const host = activeDialog || _messageHome;
  if (box.parentElement !== host) host.prepend(box);
  box.textContent = message;
  box.dataset.kind = kind;
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}
function clearMessage() { $("#message").hidden = true; }

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.dataset.passwordTarget);
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", String(visible));
  const label = visible ? "비밀번호 숨기기" : "비밀번호 보기";
  if (button.classList.contains("password-toggle-icon")) {
    button.setAttribute("aria-label", label);
    button.title = label;
  } else button.textContent = label;
}

function signupPasswordIssues(value) {
  // The actual ASCII symbol set (matches Python's string.punctuation on the server).
  // Testing "not alphanumeric/whitespace" previously let any other character (e.g. Korean
  // text) count as the "special character", so a password with no real symbol still passed.
  // Kept local to this function: regex-based test harnesses extract only the
  // `function signupPasswordIssues(...) { ... }` block, not top-level helpers above it.
  const PASSWORD_SPECIAL_CHARS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
  const hasPasswordSpecialChar = (value) => [...value].some((char) => PASSWORD_SPECIAL_CHARS.includes(char));
  const issues = [];
  if (value.length < 8) issues.push("비밀번호는 8자 이상 입력해 주세요.");
  if (!/[A-Za-z]/.test(value)) issues.push("영문자를 포함해 주세요.");
  if (!/[0-9]/.test(value)) issues.push("숫자를 포함해 주세요.");
  // Check missing character groups only; the server remains authoritative
  // for its exact allowed special-character set and any additional rules.
  if (!hasPasswordSpecialChar(value)) issues.push("특수문자를 포함해 주세요. 예: !");
  return issues;
}

function showSignupPasswordIssues({ moveFocus = false } = {}) {
  const input = $("#password");
  const hint = $("#password-error");
  const issues = signupPasswordIssues(input.value);
  hint.textContent = issues.join(" ");
  hint.hidden = issues.length === 0;
  if (issues.length) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  if (moveFocus && issues.length) input.focus();
  return issues.length === 0;
}

function showAuthError(form, error) {
  const message = form.querySelector(".auth-error-summary");
  message.textContent = error.status === 401
    ? "이메일 또는 비밀번호가 일치하지 않습니다. 입력한 내용을 확인하고 다시 로그인해 주세요."
    : error.status === 409
      ? "이미 가입한 이메일입니다. 기존 계정으로 로그인해 주세요."
      : error.status === 422 || error.status === 400
        ? "입력한 정보를 확인해 주세요. 이메일 형식과 비밀번호 조건을 확인한 뒤 다시 시도해 주세요."
        : "요청을 완료하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요. 입력한 내용은 유지됩니다.";
  message.hidden = false;
  // Only backend-declared field errors are associated with a specific input.
  const fields = { email: form.id === "signup-form" ? "email" : "login-email", password: form.id === "signup-form" ? "password" : "login-password" };
  let firstInvalid = null;
  for (const detail of Array.isArray(error.details) ? error.details : []) {
    const input = document.getElementById(fields[detail.loc?.at(-1)]);
    if (!input) continue;
    input.setAttribute("aria-invalid", "true");
    const hint = document.getElementById(`${input.id}-error`);
    hint.textContent = input.id.includes("password") ? "비밀번호 조건을 확인해 주세요." : "올바른 이메일 주소를 입력해 주세요.";
    if (input.id === "password") {
      hint.textContent = signupPasswordIssues(input.value).join(" ") || "서버의 비밀번호 조건에 맞지 않습니다. 특수문자로 !를 사용해 다시 확인해 주세요.";
    }
    if (input.id === "email" && input.value.length > 40) hint.textContent = "이메일은 40자 이내로 입력해 주세요.";
    hint.hidden = false;
    firstInvalid ||= input;
  }
  if (firstInvalid) {
    message.textContent = "표시된 입력칸의 안내를 확인해 주세요.";
    firstInvalid.focus();
  } else message.focus();
}

function setupAuthAccessibility() {
  $$("[data-password-target]").forEach((button) => button.addEventListener("click", () => togglePasswordVisibility(button)));
  [$("#signup-form"), $("#login-form")].forEach((form) => {
    const summary = document.createElement("p");
    summary.className = "auth-error-summary full";
    summary.setAttribute("role", "alert");
    summary.tabIndex = -1;
    summary.hidden = true;
    form.prepend(summary);
    form.querySelectorAll("input[required], select[required]").forEach((input) => {
      const error = document.createElement("small");
      error.id = `${input.id}-error`;
      error.className = "field-error";
      error.setAttribute("aria-live", "polite");
      error.hidden = true;
      (input.closest(".form-row") || input.closest(".consent-list")).append(error);
      input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
      input.addEventListener("invalid", () => {
        input.setAttribute("aria-invalid", "true");
        error.textContent = input.validationMessage;
        error.hidden = false;
      });
      input.addEventListener("input", () => {
        input.removeAttribute("aria-invalid");
        error.hidden = true;
        summary.hidden = true;
        if (input.id === "password" && input.value) showSignupPasswordIssues();
      });
    });
    form.addEventListener("submit", () => { summary.hidden = true; });
  });
}
function challengeRecordType(item = {}) {
  if (item.catalog_version === "personal-v4") return "simple";
  if (item.catalog_version === "evidence-v3") return item.verification_type === 3 ? "simple" : "photo";
  const title = item.title || "";
  return title.includes("식사") ? "photo" : "simple";
}
function recommendationDomain(item = {}) {
  if (item.domain) return item.domain;
  if (item.category === "diet") return "fiber_diet";
  if (item.category === "activity") return "aerobic_activity";
  if (item.category === "tracking") return "tracking";
  return "hydration";
}
function normalizeRecommendationResult(result = {}, difficulty = "easy") {
  const items = Array.isArray(result.items) ? result.items : [];
  if (items.length !== 3) throw new Error("새 챌린지 응답을 확인할 수 없습니다. 통합 서버 버전을 확인해 주세요.");
  return {
    ...result,
    items: items.map((item) => item.catalog_version === "evidence-v3" ? item : {
      ...item,
      catalog_version: "evidence-v3",
      domain: recommendationDomain(item),
      difficulty,
      verification_type: item.verification_type || 3,
      verification_scope: item.verification_scope || item.recommendation_reason || "자가 체크로 실천 여부를 기록합니다.",
      goal_basis: item.goal_basis || (item.source?.title ? `${item.source.title} 근거 자료 기반 추천입니다.` : "백엔드 추천 규칙으로 제안된 생활습관입니다."),
      weekly_guidance: item.weekly_guidance || item.recommendation_reason || "",
    }),
  };
}

function hasCurrentChallengeCycle(cycle = state.cycle) {
  return Boolean(cycle?.user_challenges?.length)
    && !["completed", "cancelled"].includes(cycle?.status);
}

function showChallengeSelectionView() {
  $("#challenge-form").hidden = false;
  $("#challenge-safety-copy").hidden = false;
  $("#challenge-lifestyle-summary").hidden = false;
  $("#challenge-title").textContent = "오늘부터 실천할 수 있는 생활습관을 골라보세요";
}

async function openChallengeTab({ selectionCompleted = false } = {}) {
  const token = state.token;
  if (!hasCurrentChallengeCycle(state.cycle) && !isLocalPreview() && !requireActiveHealthConsent("새 챌린지 시작")) return;
  let cycle = state.cycle;
  if (!hasCurrentChallengeCycle(cycle) && !isLocalPreview()) {
    try {
      cycle = await api("/challenge-cycles/current");
      if (state.token !== token) return;
      renderCycle(cycle);
    } catch (error) {
      if (state.token !== token) return;
      if (error.status !== 404 && !error.message.includes("진행 중인 챌린지가 없습니다")) throw error;
      cycle = null;
      state.cycle = null;
    }
  }
  if (hasCurrentChallengeCycle(cycle)) {
    showWorkspace("challenge", { moveFocus: false });
    showStep(8);
    await loadDailyRecords();
    if (state.token !== token) return;
    if (selectionCompleted) showMessage("챌린지 선택이 완료되었습니다.", "success");
    return;
  }
  showChallengeSelectionView();
  await loadChallenges();
  if (state.token !== token) return;
  showStep(7);
}

function recordTypeLabel(type) {
  return type === "photo" ? "사진 인증" : "간편 체크";
}
function recordActionLabel(type) {
  return type === "photo" ? "사진 올리기" : "체크하기";
}
function challengeCardTitle(title = "") {
  return escapeHtml(title)
    .replace("당 음료 대신 물 · 개인 수분 지침 확인", "당분이 든 음료 대신 물<br>개인 수분 지침 확인")
    .replace("정제 곡물 일부를 통곡물·콩류로 바꾸기", "정제 곡물 일부를<br>통곡물·콩류로 바꾸기");
}
function challengeCardGoal(goal = "") {
  return escapeHtml(goal)
    .replace("오늘 음료 선택 또는 개인 수분 지침 준수 1회 확인", "오늘 음료 선택 또는<br>개인 수분 지침 준수 1회 확인");
}
function simpleRecordPresentation(item = {}) {
  const title = item.title || "";
  if (item.catalog_version === "personal-v4") return {
    kind: { hydration: "water", fiber_diet: "generic", aerobic_activity: "walking" }[item.domain] || "generic",
    title,
    description: item.completion_rule || item.description,
    action: "실천했어요",
  };
  if (title.includes("걷")) return {
    kind: "walking", title: "오늘 가볍게 걸으셨나요?",
    description: "사진 없이 ‘했어요’를 누르면 오늘의 걷기 실천으로 기록돼요.", action: "네, 걸었어요",
  };
  if (title.includes("마시") || title.includes("물")) return {
    kind: "water", title: "오늘 물을 선택하셨나요?",
    description: "단 음료 대신 물을 선택한 실천을 간편하게 기록해요.", action: "네, 물을 선택했어요",
  };
  if (title.includes("수면") || title.includes("잠")) return {
    kind: "sleep", title: "오늘 수면 습관을 지키셨나요?",
    description: "사진 없이 오늘의 수면 실천 여부만 기록해요.", action: "네, 지켰어요",
  };
  if (title.includes("점검") || title.includes("검진")) return {
    kind: "checkup", title: "오늘 건강정보를 점검하셨나요?",
    description: "검진 결과나 주요 건강 수치를 확인했다면 기록해 주세요.", action: "네, 확인했어요",
  };
  return {
    kind: "generic", title: `${title}, 오늘 하셨나요?`,
    description: "사진 없이 오늘의 실천 여부만 바로 기록해요.", action: "네, 했어요",
  };
}
function isHydrationRecord(item = {}) {
  const title = item.title || "";
  return item.domain === "hydration" || title.includes("마시") || title.includes("물");
}
function usesWaterServingControl(item = {}) {
  return item.catalog_version !== "personal-v4" && isHydrationRecord(item);
}
function clampWaterServings(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(8, Math.max(1, Math.round(number)));
}
function waterLevelForServings(value) {
  return `${Math.round(18 + ((clampWaterServings(value) - 1) / 7) * 70)}%`;
}
function currentWaterServings() {
  return clampWaterServings($("#water-serving-count")?.value || state.recordTarget?.value || 1);
}
function syncWaterServingControl(value = currentWaterServings()) {
  const count = clampWaterServings(value);
  const input = $("#water-serving-count");
  const output = $("#water-serving-output");
  const visual = $("#record-simple-visual");
  if (input) input.value = String(count);
  if (output) output.textContent = `${count}잔`;
  if (visual) visual.style.setProperty("--water-level", waterLevelForServings(count));
  if (state.recordTarget?.item && isHydrationRecord(state.recordTarget.item)) state.recordTarget.value = count;
}
function habitRecordIcon(kind = "generic") {
  const common = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  if (kind === "walking") return `<svg ${common}><path d="M13 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.5 21l1.2-6.5-2.8-2.2-2.4 3.2M10.7 14.5l3.3 2.3 2 4.2M8 8.5l3.2-1.7 2.3 3.2 3.5 1"/></svg>`;
  if (kind === "water") return `<svg ${common}><path d="M12 2s6 6.5 6 12a6 6 0 0 1-12 0c0-5.5 6-12 6-12Z"/><path d="M9 15c.6 1.4 1.6 2 3 2"/></svg>`;
  if (kind === "sleep") return `<svg ${common}><path d="M20.5 15.7A8 8 0 0 1 8.3 3.5 8.5 8.5 0 1 0 20.5 15.7Z"/></svg>`;
  if (kind === "meal") return `<svg ${common}><path d="M6 3v8M3.5 3v5a2.5 2.5 0 0 0 5 0V3M6 11v10M15 3v18M15 3c3 1 4 4 4 7h-4"/></svg>`;
  if (kind === "checkup") return `<svg ${common}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4"/></svg>`;
  if (kind === "photo") return `<svg ${common}><path d="M5 7h2l1.3-2h7.4L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
  return `<svg ${common}><path d="m5 12 4 4L19 6"/></svg>`;
}

function publicFlowStage(step = state.step) {
  if (step === 1) return 0;
  if (step <= 3) return 1;
  if (step <= 6) return 2;
  return 3;
}

function visitedFlowStage(stage) {
  return [...state.visitedSteps].some((step) => publicFlowStage(step) === stage);
}

function flowStageTarget(stage) {
  const candidates = stage === 1 ? [2] : stage === 2 ? [6, 5, 4] : [8];
  return candidates.find((step) => state.visitedSteps.has(step)) || ({ 1: 2, 2: 4, 3: 8 }[stage]);
}

function syncSidebarChallengeEntry() {
  const challengeEntry = $("[data-challenge-entry]");
  const dashboardEntry = $("[data-dashboard-entry]");
  if (challengeEntry && state.step === 7) {
    challengeEntry.classList.add("active");
    challengeEntry.classList.remove("complete");
    challengeEntry.setAttribute("aria-current", "step");
  }
  if (dashboardEntry && state.step === 8) {
    dashboardEntry.classList.add("active");
    dashboardEntry.classList.remove("complete");
    dashboardEntry.setAttribute("aria-current", "step");
  }
}

function syncTopNavigation() {
  const isLoggedIn = Boolean(state.token);
  const hasHealthRecord = Boolean(state.checkupId || state.healthCheckupResult || state.healthCheckupHistory.length);
  const hasChallengeAccess = Boolean(state.cycle || state.capabilities.challenge || state.step >= 7);
  const needsAccountSetup = Boolean(state.accountRecovery);
  $("#header-my-page").hidden = !isLoggedIn || needsAccountSetup;
  const isOnboardingFlow = state.step >= 3 && state.step <= 6;
  const showWorkspaceNav = isLoggedIn && !needsAccountSetup && (hasHealthRecord || hasChallengeAccess || isOnboardingFlow);
  const showOnboardingNav = isLoggedIn && !needsAccountSetup && isOnboardingFlow;
  const guestNav = $("#guest-flow-panel");
  const workspaceNav = $("#workspace-top-nav");
  const onboardingNav = $("#onboarding-top-nav");
  if (guestNav) guestNav.hidden = isLoggedIn;
  if (workspaceNav) workspaceNav.hidden = !showWorkspaceNav;
  if (onboardingNav) onboardingNav.hidden = !showOnboardingNav;
  $$("[data-top-workspace]").forEach((button) => {
    const selected = state.step === 8 && state.activeWorkspace === button.dataset.topWorkspace;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-current", selected ? "page" : "false");
  });
  $$("[data-top-step]").forEach((button) => {
    const selected = state.step === Number(button.dataset.topStep);
    button.classList.toggle("active", selected);
    button.setAttribute("aria-current", selected ? "page" : "false");
  });
  $$("[data-onboarding-step]").forEach((button) => {
    const targetStep = Number(button.dataset.onboardingStep);
    const selected = state.step === targetStep || (targetStep === 5 && state.step === 6);
    button.classList.toggle("active", selected);
    button.setAttribute("aria-current", selected ? "page" : "false");
  });
}

function showStep(step, { recordHistory = true, instant = false } = {}) {
  if (step >= 3 && state.token && state.accountRecovery?.token === state.token) {
    showAccountRecovery(state.accountRecovery, "먼저 계정 설정과 건강정보 동의를 완료해 주세요.");
    return;
  }
  const targetStep = Math.max(1, Math.min(8, step));
  if (targetStep !== 2) document.body.classList.remove("account-mode");
  if (recordHistory && state.navigationHistory.at(-1) !== targetStep) state.navigationHistory.push(targetStep);
  state.step = targetStep;
  document.body.classList.toggle("intro-mode", state.step === 1);
  document.body.classList.toggle("dashboard-mode", state.step === 8);
  state.visitedSteps.add(state.step);
  clearMessage();
  $$(".screen").forEach((element) => element.classList.toggle("active", Number(element.dataset.step) === state.step));
  const currentFlowStage = publicFlowStage();
  $$("#step-list li[data-flow-stage]").forEach((element) => {
    const itemStep = Number(element.dataset.flowStage);
    const targetNavStep = element.dataset.stepTarget ? Number(element.dataset.stepTarget) : null;
    const isAuthEntry = element.hasAttribute("data-auth-entry");
    const hasExplicitTarget = Number.isFinite(targetNavStep);
    const isActive = !isAuthEntry
      && (hasExplicitTarget ? targetNavStep === state.step : itemStep === currentFlowStage);
    const isAvailable = itemStep === 1 || !state.token || (hasExplicitTarget
      ? state.visitedSteps.has(targetNavStep)
      : visitedFlowStage(itemStep));
    const isComplete = isAvailable && !isActive;
    element.classList.toggle("active", isActive);
    element.classList.toggle("complete", isComplete);
    element.classList.toggle("locked", !isAvailable);
    element.setAttribute("aria-current", isActive ? "step" : "false");
    element.setAttribute("aria-disabled", String(!isAvailable));
    element.setAttribute("tabindex", isAvailable ? "0" : "-1");
  });
  $("#flow-context").textContent = currentFlowStage === 0 ? "서비스 안내" : "기본 이용 흐름";
  $("#progress-bar").style.width = `${(currentFlowStage / 3) * 100}%`;
  if (targetStep !== 2) {
    $("#sidebar-login")?.setAttribute("aria-current", "false");
    $("#sidebar-signup")?.setAttribute("aria-current", "false");
    $$("[data-auth-entry]").forEach((element) => element.classList.remove("active"));
  }
  syncSidebarChallengeEntry();
  syncTopNavigation();
  if (state.step === 6) {
    $("#detail-save-notice").hidden = !state.currentScreeningInputSaveUnavailable;
    if (state.currentHealthOnly) {
      updateResultConfirmation();
      renderCurrentHealthResult(state.currentScreeningPrediction || state.healthCheckupResult);
    }
    else {
      updateResultConfirmation();
      updateLifestyleSummary();
    }
  }
  if (state.step === 7) updateLifestyleSummary();
  const activeScreen = $(`.screen[data-step="${state.step}"]`);
  const activeHeading = activeScreen?.querySelector("h1, h2, h3");
  if (activeHeading) activeHeading.setAttribute("tabindex", "-1");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: instant || reduceMotion ? "auto" : "smooth" });
  window.requestAnimationFrame(() => {
    if (state.step !== targetStep) return;
    const guidance = $("#eligibility-guidance");
    // A safety branch opened during navigation takes priority over the page title.
    const focusTarget = targetStep === 3 && guidance && !guidance.hidden ? guidance : activeHeading;
    focusTarget?.focus({ preventScroll: true });
  });
}

function showAuthEntry(mode, options = {}) {
  cancelLandingMotion();
  document.documentElement.classList.add("auth-entry-instant");
  showStep(2, { instant: true });
  showAuthMode(mode, options);
  window.requestAnimationFrame(() => document.documentElement.classList.remove("auth-entry-instant"));
}

function suppressAuthTransitionOnce() {
  document.documentElement.classList.add("auth-entry-instant");
  window.requestAnimationFrame(() => document.documentElement.classList.remove("auth-entry-instant"));
}

async function goStepFromNav(step) {
  if (step === 2) {
    showStep(2);
    showAuthMode("signup");
    return;
  }
  if (!state.token) {
    showStep(2);
    showAuthMode("login", { context: "login" });
    return;
  }
  if (!state.visitedSteps.has(step)) {
    showMessage("이전 단계를 먼저 완료해 주세요.");
    return;
  }
  if (step === 7) {
    await openChallengeTab();
    return;
  }
  showStep(step);
}

function goBack() {
  if (state.navigationHistory.length <= 1) return;
  state.navigationHistory.pop();
  const previousStep = state.navigationHistory.at(-1) || 1;
  showStep(previousStep, { recordHistory: false });
}

function showHealthInputPanel(panel) {
  const canonicalPanel = {
    lifestyle: "habits",
    drinking: "habits",
    nutrition: "habits",
    details: "family",
  }[panel] || panel;
  const panelMap = {
    metrics: "health-metrics-panel",
    vitals: "health-vitals-panel",
    habits: "lifestyle-input-panel",
    activity: "health-activity-panel",
    family: "detail-health-panel",
    socioeconomic: "health-socioeconomic-panel",
    review: "health-review-panel",
  };
  Object.entries(panelMap).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element) element.hidden = key !== canonicalPanel;
  });
  $$(".inner-step-tabs [data-health-tab]").forEach((element) => {
    element.classList.toggle("active", element.dataset.healthTab === canonicalPanel);
    element.setAttribute("aria-pressed", String(element.dataset.healthTab === canonicalPanel));
  });
  if (state.healthDraftDirty) persistHealthDraft();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function eligibilityCapabilities(eligibility) {
  const age = Number(eligibility?.age ?? getAgeFromBirth($("#eligibility-birth-date")?.value));
  const reasonCodes = eligibility?.reason_codes || [];
  const hasExplicitCurrentHealth = Object.prototype.hasOwnProperty.call(eligibility || {}, "current_health_check_eligible");
  const hasExplicitFuture = Object.prototype.hasOwnProperty.call(eligibility || {}, "future_prediction_eligible");
  const hasExplicitModelEligible = Object.prototype.hasOwnProperty.call(eligibility || {}, "model_eligible");
  const hasExplicitChallenge = Object.prototype.hasOwnProperty.call(eligibility || {}, "challenge_eligible");
  const explicitFutureByReason = reasonCodes.some((code) => (
    code === "MODEL_AGE_OUT_OF_RANGE" || code === "CHALLENGE_ONLY_AGE" || code === "UNDER_MINIMUM_SERVICE_AGE" || code === "MODEL_POPULATION_OUT_OF_SCOPE"
  ));
  const safetyBlocked = reasonCodes.some((code) => code === "URGENT_MEDICAL_ATTENTION" || code === "DIAGNOSED_DIABETES");
  const inferredCurrentHealth = Number.isFinite(age) && age >= 19 && !safetyBlocked;
  const inferredFuturePrediction = Number.isFinite(age) && age >= 45 && !safetyBlocked;
  let futurePrediction = hasExplicitFuture ? eligibility.future_prediction_eligible : null;
  if (!futurePrediction && hasExplicitModelEligible) futurePrediction = eligibility.model_eligible;
  if (futurePrediction === null) {
    futurePrediction = explicitFutureByReason ? false : inferredFuturePrediction;
  }
  return {
    challenge: hasExplicitChallenge
      ? eligibility.challenge_eligible
      : Number.isFinite(age) && age >= 14 && !safetyBlocked,
    currentHealth: hasExplicitCurrentHealth
      ? eligibility.current_health_check_eligible
      : inferredCurrentHealth,
    futurePrediction,
  };
}

function inferFuturePredictionCapability(eligibility = state.eligibility) {
  const age = Number(eligibility?.age ?? getAgeFromBirth($("#eligibility-birth-date")?.value));
  if (!Number.isFinite(age)) return false;
  const reasonCodes = eligibility?.reason_codes || [];
  if (reasonCodes.some((code) => (
    code === "URGENT_MEDICAL_ATTENTION" || code === "DIAGNOSED_DIABETES" || code === "CONSENT_REQUIRED" || code === "UNDER_MINIMUM_SERVICE_AGE"
  ))) return false;
  if (reasonCodes.includes("MODEL_AGE_OUT_OF_RANGE") || reasonCodes.includes("CHALLENGE_ONLY_AGE")
      || reasonCodes.includes("MODEL_POPULATION_OUT_OF_SCOPE")) return false;

  if (Object.prototype.hasOwnProperty.call(eligibility || {}, "future_prediction_eligible")) {
    if (eligibility?.future_prediction_eligible === true) return true;
    if (eligibility?.future_prediction_eligible === false) return false;
  }
  if (Object.prototype.hasOwnProperty.call(eligibility || {}, "model_eligible")) {
    if (eligibility?.model_eligible === true) return true;
    if (eligibility?.model_eligible === false) return false;
  }

  const activeModel = eligibility?.active_model || {};
  const minAge = Number(activeModel.min_age);
  const maxAge = Number(activeModel.max_age);
  if (Number.isFinite(minAge) && age < minAge) return false;
  if (Number.isFinite(maxAge) && age > maxAge) return false;
  if (Number.isFinite(minAge) || Number.isFinite(maxAge)) return true;
  return age >= 45;
}

function syncReturningEligibilityState(eligibility) {
  const reasonCodes = eligibility?.reason_codes || [];
  const inferredFuturePrediction = inferFuturePredictionCapability(eligibility);
  state.eligibility = eligibility;
  state.capabilities = eligibilityCapabilities(eligibility);
  if (state.capabilities.futurePrediction == null) {
    state.capabilities.futurePrediction = inferredFuturePrediction;
  }
  state.currentHealthOnly = state.capabilities.currentHealth && !state.capabilities.futurePrediction;
  state.modelOutOfRange = state.currentHealthOnly;
  state.requiresEligibility = !eligibility;
  state.medicalGuidanceRequired = reasonCodes.some((code) => (
    code === "URGENT_MEDICAL_ATTENTION" || code === "DIAGNOSED_DIABETES" || code === "UNDER_MINIMUM_SERVICE_AGE"
  ));
}

function shouldRunPredictionAfterHealthEdit() {
  if (state.medicalGuidanceRequired) return false;
  if (state.currentHealthOnly) return state.capabilities.currentHealth === true;
  if (state.capabilities.futurePrediction) return true;
  if (!state.returningUser) return true;
  if (inferFuturePredictionCapability(state.eligibility)) return true;
  const age = Number(state.eligibility?.age ?? getAgeFromBirth($("#eligibility-birth-date")?.value));
  const hasExplicitEligibility = Boolean(state.eligibility);
  const reasonCodes = state.eligibility?.reason_codes || [];
  if (!hasExplicitEligibility && Number.isFinite(age)) return age >= 45;
  if (reasonCodes.includes("MODEL_AGE_OUT_OF_RANGE") || reasonCodes.includes("CHALLENGE_ONLY_AGE")) return false;
  return state.eligibility?.future_prediction_eligible === true || state.eligibility?.model_eligible === true || false;
}

function beginReturningEligibility(destination) {
  state.returningDestination = destination;
  state.visitedSteps.add(3);
  $("#eligibility-guidance").hidden = true;
  showStep(3);
  showMessage("챌린지를 시작하기 전에 이용 가능 확인을 한 번 완료해 주세요.", "success");
}

function showStoredEligibilityGuidance() {
  state.visitedSteps.add(3);
  showStep(3);
  showEligibilityGuidance(state.eligibility?.reason_codes || []);
}

function unlockReturningUserRoutes() {
  state.returningUser = true;
  state.visitedSteps.add(2);
  if (state.capabilities.currentHealth) state.visitedSteps.add(4);
  if (state.capabilities.challenge) state.visitedSteps.add(7);
  if (state.cycle?.user_challenges?.length) state.visitedSteps.add(8);
  if (state.cycle?.user_challenges?.length) {
    showWorkspace("home", { moveFocus: false });
    showStep(8, { recordHistory: false });
    return;
  }
  if (state.requiresEligibility) {
    beginReturningEligibility("challenges");
    return;
  }
  if (state.medicalGuidanceRequired) {
    showStoredEligibilityGuidance();
    return;
  }
  showStep(7, { recordHistory: false });
}

function showAuthMode(mode, { moveFocus = true, context = "login" } = {}) {
  suppressAuthTransitionOnce();
  if (mode === "signup" && state.accountRecovery && state.token === state.accountRecovery.token) {
    showAccountRecovery(state.accountRecovery, "이미 가입한 계정의 남은 설정을 완료해 주세요.");
    return;
  }
  $("#account-recovery-form").hidden = true;
  const isLogin = mode === "login";
  document.body.classList.toggle("account-mode", isLogin);
  const authModeSwitch = $("#auth-mode-switch");
  if (authModeSwitch) authModeSwitch.hidden = true;
  const returningPanel = $("#returning-user-panel");
  if (returningPanel) returningPanel.hidden = true;
  $("#signup-form").hidden = isLogin;
  $("#login-form").hidden = !isLogin;
  $("#auth-title-eyebrow").textContent = isLogin
    ? context === "mypage" ? "마이페이지 로그인" : "당근의 숲에 도착했어요"
    : "당근의 숲에 도착했어요";
  $("#signup-title").textContent = isLogin ? "우리집 들어가기" : "새로운 집주인을 등록해요";
  if (isLogin) {
    $("#flow-context").textContent = context === "mypage" ? "마이페이지" : "계정 이용";
    $("#progress-bar").style.width = "0";
    $$("#step-list li[data-flow-stage]").forEach((element) => {
      element.classList.remove("active");
      element.setAttribute("aria-current", "false");
    });
  }
  $(".auth-stage")?.classList.add("active");
  $("#sidebar-login")?.setAttribute("aria-current", isLogin ? "page" : "false");
  $("#sidebar-signup")?.setAttribute("aria-current", isLogin ? "false" : "page");
  $$("[data-auth-entry]").forEach((element) => {
    element.classList.toggle("active", element.dataset.authEntry === (isLogin ? "login" : "signup"));
  });
  if (moveFocus) (isLogin ? $("#login-email") : ($("#signup-nickname") || $("#email"))).focus();
}

function openProfileEditor() {
  $("#header-my-page").open = false;
  const profile = state.userProfile || {};
  $("#profile-birthday").value = profile.birthday || $("#eligibility-birth-date").value || $("#signup-birth-date").value || "";
  $("#profile-gender").value = profile.gender || $("#gender").value || $("#signup-gender").value || "FEMALE";
  $("#profile-editor-message").hidden = true;
  $("#profile-editor").hidden = false;
  document.body.classList.add("dialog-open");
  $("#profile-birthday").focus();
}

function closeProfileEditor() {
  $("#profile-editor").hidden = true;
  document.body.classList.remove("dialog-open");
  ($("#header-my-page-toggle") || $("#font-toggle"))?.focus();
}

function showSignupEligibilityGuidance(reasonCode, birthDate, gender) {
  state.signupGuidanceField = reasonCode === "CONSENT_REQUIRED" ? "health-consent" : "signup-birth-date";
  $("#eligibility-birth-date").value = birthDate;
  $("#gender").value = gender;
  resetEligibilityAnswers();
  syncLifestyleAvatar();
  state.visitedSteps.add(3);
  showStep(3);
  showEligibilityGuidance([reasonCode]);
}

function isUnderMinimumBirthdayError(error) {
  const message = String(error?.message || "");
  return /birthday|생년월일/i.test(message) && /만\s*14세\s*미만|회원가입이 불가/.test(message);
}

function hasHealthDataConsent(payload) {
  return Array.isArray(payload?.items) && payload.items.some(item =>
    item.consent_item === "health_data" && item.version === "1.0"
    && item.is_agreed === true && !item.withdrawn_at);
}

function healthDataConsentItems(payload) {
  return Array.isArray(payload?.items)
    ? payload.items.filter(item => item.consent_item === "health_data" && item.version === "1.0")
    : [];
}

function syncHealthConsentState(payload) {
  const items = healthDataConsentItems(payload);
  const active = items.find(item => item.is_agreed === true && !item.withdrawn_at) || null;
  state.healthConsent = active || items[0] || null;
  state.healthConsentStatus = active ? "active" : items.length ? "withdrawn" : "missing";
  if (!active) {
    state.capabilities = { challenge: false, currentHealth: false, futurePrediction: false };
    state.currentHealthOnly = false;
    state.modelOutOfRange = false;
  }
  return state.healthConsentStatus;
}

function renderHealthConsentSettings() {
  const status = state.healthConsentStatus;
  const card = $("#consent-status-card");
  const badge = $("#consent-status-badge");
  const copy = $("#consent-status-copy");
  if (!card || !badge || !copy) return;
  card.dataset.status = status;
  badge.textContent = status === "active" ? "동의 중" : status === "withdrawn" ? "철회됨" : status === "missing" ? "동의 필요" : "확인 중";
  copy.textContent = status === "active"
    ? "건강정보 저장과 위험 신호 선별, 새 챌린지 시작에 동의가 적용되어 있어요."
    : status === "withdrawn"
      ? "동의가 철회되어 새 건강정보 저장·분석·챌린지 시작이 제한되어 있어요."
      : status === "missing" ? "건강정보 기능을 이용하려면 동의가 필요해요." : "동의 상태를 확인하고 있어요.";
  $("#withdraw-health-consent").hidden = status !== "active";
  $("#renew-health-consent").hidden = !["withdrawn", "missing"].includes(status);
}

async function refreshHealthConsentState() {
  const consents = await api("/consents");
  if (!Array.isArray(consents?.items)) throw new Error("동의 정보를 확인하지 못했습니다.");
  syncHealthConsentState(consents);
  renderHealthConsentSettings();
  return consents;
}

function openHealthConsentSettings({ blockedAction = "" } = {}) {
  $("#header-my-page")?.removeAttribute("open");
  $("#consent-settings-error").hidden = true;
  $("#consent-settings-dialog").showModal();
  renderHealthConsentSettings();
  if (blockedAction) {
    const error = $("#consent-settings-error");
    error.textContent = `${blockedAction} 전에 건강정보 수집·이용에 다시 동의해 주세요.`;
    error.hidden = false;
  }
  void refreshHealthConsentState().catch(error => {
    const errorNode = $("#consent-settings-error");
    errorNode.textContent = error.message || "동의 상태를 불러오지 못했습니다. 다시 시도해 주세요.";
    errorNode.hidden = false;
  });
}

function requireActiveHealthConsent(actionLabel) {
  if (state.healthConsentStatus === "active" || isLocalPreview()) return true;
  openHealthConsentSettings({ blockedAction: actionLabel });
  return false;
}

async function ensureActiveHealthConsent(actionLabel) {
  if (state.healthConsentStatus === "active" || isLocalPreview()) return true;
  try {
    await refreshHealthConsentState();
    if (state.healthConsentStatus === "active") return true;
  } catch {
    // Fall through to the settings dialog, which shows the refresh error state.
  }
  openHealthConsentSettings({ blockedAction: actionLabel });
  return false;
}

function showAccountRecovery(recovery, message) {
  state.accountRecovery = recovery;
  showStep(2);
  $("#signup-form").hidden = true;
  $("#login-form").hidden = true;
  $("#account-recovery-form").hidden = false;
  $("#signup-title").textContent = "계정 설정을 이어서 완료해 주세요";
  $("#auth-title-eyebrow").textContent = "가입 후 설정";
  $("#recovery-birthday").value = recovery.birthday || "";
  $("#recovery-gender").value = recovery.gender || "";
  $("#recovery-name").value = recovery.name || "";
  $("#recovery-health-consent").checked = recovery.healthAgreed === true;
  const needsLogin = !state.token;
  const verifyOnly = recovery.verifyOnly === true;
  $("#recovery-name").disabled = verifyOnly;
  $("#recovery-birthday").disabled = verifyOnly;
  $("#recovery-gender").disabled = verifyOnly;
  $("#recovery-health-consent").disabled = verifyOnly;
  $("#recovery-submit").hidden = needsLogin;
  $("#recovery-submit").textContent = verifyOnly ? "저장 상태 다시 확인하기" : "설정 저장하고 계속";
  $("#account-recovery-message").textContent = message;
  window.requestAnimationFrame(() => {
    if (!$("#account-recovery-form").hidden) $("#account-recovery-message").focus();
  });
}

async function saveAccountSetup(recovery) {
  if (!state.token || state.token !== recovery.token) throw Object.assign(new Error("다시 로그인해 주세요."), { status: 401 });
  const checkSession = () => {
    if (state.token !== recovery.token) throw Object.assign(new Error("계정이 변경되어 이전 요청을 중단했습니다."), { code: "SESSION_CHANGED" });
  };
  if (!recovery.healthAgreed) throw new Error("건강정보 수집·이용에 동의해야 다음 단계로 진행할 수 있습니다.");
  const age = getAgeFromBirth(recovery.birthday);
  if (!Number.isFinite(age) || age < 14 || !["FEMALE", "MALE"].includes(recovery.gender)) {
    throw new Error("생년월일과 성별을 확인해 주세요. 만 14세 미만은 가입할 수 없습니다.");
  }
  const profileChanged = recovery.name !== state.userProfile?.name
    || recovery.birthday !== state.userProfile?.birthday
    || recovery.gender !== state.userProfile?.gender;
  if (!recovery.profileSaved || profileChanged) {
    recovery.stage = "profile";
    await api("/users/me/profile", { method: "PATCH", body: JSON.stringify({
      ...(recovery.name ? { name: recovery.name } : {}),
      birthday: recovery.birthday,
      gender: recovery.gender,
    }) });
    checkSession();
    recovery.profileSaved = true;
    state.userProfile = { ...(state.userProfile || {}), name: recovery.name, birthday: recovery.birthday, gender: recovery.gender };
  }
  recovery.stage = "consent";
  // A failed response may still have committed. Read before retrying this append-only write.
  if (recovery.reconcileConsent) {
    const consents = await api("/consents");
    checkSession();
    if (!Array.isArray(consents?.items)) throw new Error("동의 저장 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    recovery.consentSaved = hasHealthDataConsent(consents);
  }
  if (!recovery.consentSaved) {
    recovery.reconcileConsent = true;
    await api("/consents", { method: "POST", body: JSON.stringify({ consent_item: "health_data", version: "1.0", is_agreed: recovery.healthAgreed }) });
    checkSession();
    recovery.consentSaved = true;
  }
  $("#eligibility-birth-date").value = recovery.birthday;
  $("#gender").value = recovery.gender;
  state.accountRecovery = null;
  $("#account-recovery-form").hidden = true;
  resetEligibilityAnswers();
  syncLifestyleAvatar();
  showStep(3);
}

function accountRecoveryFailure(recovery, error) {
  if (error.code === "SESSION_CHANGED") return;
  if (error.status === 401) {
    state.token = null;
    recovery.token = null;
  }
  const stage = recovery.stage === "login" ? "자동 로그인" : recovery.stage === "profile" ? "프로필 저장" : "건강정보 동의 저장";
  const message = !state.token ? "계정은 생성되었지만 로그인이 필요합니다. 기존 계정으로 로그인하면 저장 상태를 확인하고 이어서 진행합니다."
    : error.status === 422 || error.status === 400 ? `${stage}에 필요한 입력값을 확인하고 다시 시도해 주세요.`
      : `${stage}을 완료하지 못했습니다. 입력은 유지되며, 완료된 설정은 반복하지 않습니다. 다시 시도해 주세요.`;
  showAccountRecovery(recovery, message);
}

function healthSubmitLabel() {
  if (state.currentHealthOnly) return "저장하고 현재 건강 신호 확인";
  if (state.returningUser && shouldRunPredictionAfterHealthEdit()) return "저장하고 다시 분석하기";
  if (state.returningUser) return "건강정보 저장하기";
  return "이 내용으로 분석하기";
}

function openReturningUserHealthEdit() {
  state.returningUser = true;
  hydrateSavedHealthForm();
  state.visitedSteps.add(4);
  $("#submit-analysis").textContent = healthSubmitLabel();
  showHealthInputPanel("metrics");
  showStep(4);
}

async function openDashboardHealthEdit() {
  state.returningUser = true;
  if (!state.eligibility && !isLocalPreview()) {
    try {
      const latestEligibility = await api("/eligibility-checks/latest");
      syncReturningEligibilityState(latestEligibility);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  if (!state.capabilities.currentHealth && !state.capabilities.futurePrediction) {
    const age = Number(state.eligibility?.age ?? getAgeFromBirth($("#eligibility-birth-date")?.value));
    state.capabilities.currentHealth = Number.isFinite(age) ? age >= 19 : true;
    state.capabilities.futurePrediction = inferFuturePredictionCapability(state.eligibility);
    state.currentHealthOnly = state.capabilities.currentHealth && !state.capabilities.futurePrediction;
  }
  openReturningUserHealthEdit();
}

function hydrateSavedHealthForm(selectedCheckup = null) {
  const checkup = selectedCheckup || state.healthCheckupHistory?.[0] || state.healthCheckupResult;
  if (!checkup?.checkup_id || state.healthFormCheckupId === checkup.checkup_id) return;
  const fields = {
    height: "height_cm", weight: "weight_kg", waist: "waist_cm",
    systolic: "systolic_bp", diastolic: "diastolic_bp",
    "exercise-days": "exercise_days_per_week", "exercise-minutes": "exercise_minutes",
  };
  Object.entries(fields).forEach(([id, key]) => {
    const input = $(`#${id}`);
    input.value = checkup[key] ?? "";
    input.dataset.previousValue = input.value;
  });
  ["smoking-status", "current-drinker", "regular-exercise"].forEach((name) => {
    const value = checkup[name.replaceAll("-", "_")];
    if (name === "smoking-status") {
      setRadioValue(name, value ?? (checkup.current_smoker ? "current" : "never"));
      return;
    }
    $$(`input[name="${name}"]`).forEach((input) => {
      input.checked = value != null && input.value === String(value);
    });
  });
  const optionalFields = {
    "annual-household-income": "annual_household_income_10k_krw",
    "health-satisfaction-score": "health_satisfaction_score",
    "economic-satisfaction-score": "economic_satisfaction_score",
    "overall-quality-of-life-score": "overall_quality_of_life_score",
    "education-level": "education_level",
    "marital-status": "marital_status",
    "household-structure": "household_structure",
    "depressed-feeling-last-week": "depressed_feeling_last_week",
    "sleep-difficulty-last-week": "sleep_difficulty_last_week",
    "hypertension-diagnosis": "hypertension_diagnosis",
    "cancer-diagnosis": "cancer_diagnosis",
    "chronic-lung-disease-diagnosis": "chronic_lung_disease_diagnosis",
    "liver-disease-diagnosis": "liver_disease_diagnosis",
    "heart-disease-diagnosis": "heart_disease_diagnosis",
    "cerebrovascular-disease-diagnosis": "cerebrovascular_disease_diagnosis",
    "psychiatric-disease-diagnosis": "psychiatric_disease_diagnosis",
    "arthritis-rheumatism-diagnosis": "arthritis_rheumatism_diagnosis",
  };
  Object.entries(optionalFields).forEach(([id, key]) => {
    const input = $(`#${id}`);
    if (!input) return;
    const value = checkup[key];
    input.value = typeof value === "boolean" ? String(value) : value ?? "";
    input.dataset.previousValue = input.value;
  });
  syncExerciseDetails();
  syncAlcoholFrequencyDetails();
  syncLifestyleAvatar();
  // Reopening a tab must preserve the in-progress draft for this saved record.
  state.healthFormCheckupId = checkup.checkup_id;
}

function healthDraftOwnerId(profile = state.userProfile) {
  const ownerId = profile?.id ?? profile?.user_id;
  return ownerId == null ? null : String(ownerId);
}

function currentHealthInputPanel() {
  return [
    ["health-metrics-panel", "metrics"],
    ["lifestyle-input-panel", "lifestyle"],
    ["detail-health-panel", "details"],
    ["health-review-panel", "review"],
  ].find(([id]) => !document.getElementById(id)?.hidden)?.[1] || "metrics";
}

function healthDraftFieldValues() {
  const values = {};
  $$("#health-form input, #health-form select, #health-form textarea").forEach((field) => {
    if (!field.id || ["button", "submit", "file", "hidden", "password"].includes(field.type)) return;
    values[field.id] = ["radio", "checkbox"].includes(field.type) ? field.checked : field.value;
  });
  return values;
}

function persistHealthDraft({ markDirty = false } = {}) {
  if (markDirty) state.healthDraftDirty = true;
  if (!state.healthDraftDirty) return false;
  try {
    sessionStorage.setItem(HEALTH_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      ownerId: healthDraftOwnerId(),
      panel: currentHealthInputPanel(),
      values: healthDraftFieldValues(),
    }));
    return true;
  } catch {
    return false;
  }
}

function clearHealthDraft() {
  state.healthDraftDirty = false;
  try { sessionStorage.removeItem(HEALTH_DRAFT_STORAGE_KEY); } catch { /* storage may be unavailable */ }
}

function readHealthDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(HEALTH_DRAFT_STORAGE_KEY) || "null");
    if (!draft || draft.version !== 1 || !draft.values || Date.now() - Number(draft.savedAt || 0) > HEALTH_DRAFT_MAX_AGE_MS) {
      clearHealthDraft();
      return null;
    }
    const currentOwnerId = healthDraftOwnerId();
    if (!draft.ownerId && currentOwnerId) {
      clearHealthDraft();
      return null;
    }
    if (draft.ownerId && currentOwnerId && draft.ownerId !== currentOwnerId) {
      clearHealthDraft();
      return null;
    }
    return draft;
  } catch {
    clearHealthDraft();
    return null;
  }
}

function restoreHealthDraft() {
  const draft = readHealthDraft();
  if (!draft) return null;
  Object.entries(draft.values).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (!field || !field.closest("#health-form") || ["file", "password"].includes(field.type)) return;
    if (["radio", "checkbox"].includes(field.type)) field.checked = value === true;
    else field.value = value ?? "";
  });
  state.healthDraftDirty = true;
  syncExerciseDetails();
  syncAlcoholFrequencyDetails();
  syncLifestyleAvatar();
  return draft;
}

function persistSessionRecovery(recovery) {
  try {
    sessionStorage.setItem(SESSION_RECOVERY_STORAGE_KEY, JSON.stringify({
      version: 1,
      returnStep: recovery.returnStep,
      healthPanel: recovery.healthPanel,
      ownerId: recovery.ownerId,
    }));
  } catch { /* the in-memory recovery path remains available */ }
}

function storedSessionRecovery() {
  if (state.sessionRecovery) {
    const currentOwnerId = healthDraftOwnerId();
    if (state.sessionRecovery.ownerId && currentOwnerId && state.sessionRecovery.ownerId !== currentOwnerId) {
      clearSessionRecovery();
      return null;
    }
    return state.sessionRecovery;
  }
  try {
    const recovery = JSON.parse(sessionStorage.getItem(SESSION_RECOVERY_STORAGE_KEY) || "null");
    if (!recovery || recovery.version !== 1) return null;
    const currentOwnerId = healthDraftOwnerId();
    if (!recovery.ownerId || (currentOwnerId && recovery.ownerId !== currentOwnerId)) {
      sessionStorage.removeItem(SESSION_RECOVERY_STORAGE_KEY);
      return null;
    }
    return recovery;
  } catch {
    return null;
  }
}

function clearSessionRecovery() {
  state.sessionRecovery = null;
  try { sessionStorage.removeItem(SESSION_RECOVERY_STORAGE_KEY); } catch { /* storage may be unavailable */ }
}

function clearAuthenticatedClientState({ keepEmail = true } = {}) {
  const email = keepEmail ? (state.userProfile?.email || $("#login-email")?.value || "") : "";
  clearHealthDraft();
  clearSessionRecovery();
  state.token = null;
  state.userProfile = null;
  state.accountRecovery = null;
  state.healthConsent = null;
  state.healthConsentStatus = "unknown";
  state.analysisRun = null;
  state.healthCheckupResult = null;
  state.healthCheckupHistory = [];
  state.checkupId = null;
  state.currentScreeningInputId = null;
  state.currentScreeningPredictionId = null;
  state.currentScreeningPrediction = null;
  state.predictionId = null;
  state.prediction = null;
  state.cycle = null;
  state.dailyCompleted = new Set();
  state.dailyRecordFailures = new Set();
  state.returningUser = false;
  state.navigationHistory = [1, 2];
  state.visitedSteps = new Set([1, 2]);
  $("#header-my-page")?.removeAttribute("open");
  $("#account-recovery-form").hidden = true;
  showStep(2, { recordHistory: false });
  showAuthMode("login", { moveFocus: false });
  $("#login-email").value = email;
}

function beginSessionRecovery() {
  if (state.accountRecovery) return;
  if (state.step === 4) persistHealthDraft();
  const recovery = state.sessionRecovery || {
    version: 1,
    returnStep: state.step,
    healthPanel: currentHealthInputPanel(),
    ownerId: healthDraftOwnerId(),
  };
  state.sessionRecovery = recovery;
  persistSessionRecovery(recovery);
  const email = state.userProfile?.email || $("#login-email")?.value || "";
  state.token = null;
  state.analysisRun = null;
  showStep(2);
  showAuthMode("login", { moveFocus: false });
  if (email) $("#login-email").value = email;
  const message = $("#login-form .auth-error-summary");
  if (message) {
    message.textContent = "로그인 시간이 만료되었습니다. 다시 로그인하면 입력하던 내용부터 이어서 진행할 수 있습니다.";
    message.hidden = false;
    window.requestAnimationFrame(() => message.focus());
  } else $("#login-email")?.focus();
}

function resumeInterruptedHealthFlow(latestHealthCheckup) {
  const recovery = storedSessionRecovery();
  const draft = readHealthDraft();
  if (draft) {
    if (latestHealthCheckup) {
      state.checkupId = latestHealthCheckup.checkup_id;
      state.healthCheckupResult = latestHealthCheckup;
      rememberCurrentScreeningInputId(latestHealthCheckup);
      hydrateSavedHealthForm();
    }
    const restored = restoreHealthDraft();
    if (!restored) return false;
    clearSessionRecovery();
    state.visitedSteps.add(4);
    $("#submit-analysis").textContent = healthSubmitLabel();
    showStep(4);
    showHealthInputPanel(["metrics", "vitals", "drinking", "habits", "activity", "family", "nutrition", "socioeconomic", "lifestyle", "details", "review"].includes(restored.panel) ? restored.panel : "metrics");
    showMessage("로그인 전에 저장하지 못한 건강정보를 복원했습니다. 내용을 확인한 뒤 다시 저장해 주세요.", "success");
    return true;
  }
  if (recovery?.returnStep === 5 && latestHealthCheckup) {
    state.checkupId = latestHealthCheckup.checkup_id;
    state.healthCheckupResult = latestHealthCheckup;
    rememberCurrentScreeningInputId(latestHealthCheckup);
    clearSessionRecovery();
    state.analysisRun = null;
    showStep(5);
    renderPredictionStatus("failed", {
      errorCode: "UNAUTHENTICATED",
      message: "다시 로그인했습니다. 저장된 건강정보로 분석을 다시 요청해 주세요.",
    });
    $("#retry-analysis").hidden = false;
    $("#retry-analysis").disabled = false;
    $("#retry-partial-analysis").disabled = false;
    showMessage("로그인이 복구되었습니다. 같은 건강정보로 분석을 다시 시도할 수 있습니다.", "success");
    return true;
  }
  if (recovery) clearSessionRecovery();
  return false;
}

function selectedRadioValue(name) {
  if (name === "smoking-status") return $("#smoking-status").value;
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function setRadioValue(name, value) {
  if (name === "smoking-status") {
    $("#smoking-status").value = String(value);
    return;
  }
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = input.value === String(value);
  });
}

function boolLabel(value) {
  return value === "true" || value === true ? "예" : "아니요";
}

function smokingStatusLabel(value) {
  return { never: "비흡연", former: "과거 흡연", current: "현재 흡연" }[value] || "-";
}

function nullableNumber(id) {
  const value = $(`#${id}`)?.value;
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableSelectValue(id) {
  const value = $(`#${id}`)?.value;
  return value === "" || value == null ? null : value;
}

function nullableBooleanSelect(id) {
  const value = nullableSelectValue(id);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function selectLabel(id) {
  return $(`#${id}`)?.selectedOptions?.[0]?.textContent || "모름";
}

function alcoholFrequencyValue() {
  const value = $("#alcohol-frequency")?.value;
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function detailHealthPayload() {
  return {
    annual_household_income_10k_krw: nullableNumber("annual-household-income"),
    health_satisfaction_score: nullableNumber("health-satisfaction-score"),
    economic_satisfaction_score: nullableNumber("economic-satisfaction-score"),
    overall_quality_of_life_score: nullableNumber("overall-quality-of-life-score"),
    education_level: nullableSelectValue("education-level"),
    marital_status: nullableSelectValue("marital-status"),
    household_structure: nullableSelectValue("household-structure"),
    depressed_feeling_last_week: nullableSelectValue("depressed-feeling-last-week"),
    sleep_difficulty_last_week: nullableSelectValue("sleep-difficulty-last-week"),
    hypertension_diagnosis: nullableBooleanSelect("hypertension-diagnosis"),
    cancer_diagnosis: nullableBooleanSelect("cancer-diagnosis"),
    chronic_lung_disease_diagnosis: nullableBooleanSelect("chronic-lung-disease-diagnosis"),
    liver_disease_diagnosis: nullableBooleanSelect("liver-disease-diagnosis"),
    heart_disease_diagnosis: nullableBooleanSelect("heart-disease-diagnosis"),
    cerebrovascular_disease_diagnosis: nullableBooleanSelect("cerebrovascular-disease-diagnosis"),
    psychiatric_disease_diagnosis: nullableBooleanSelect("psychiatric-disease-diagnosis"),
    arthritis_rheumatism_diagnosis: nullableBooleanSelect("arthritis-rheumatism-diagnosis"),
    region: nullableNumber("region"),
    diabetes_family_history: nullableBooleanSelect("diabetes-family-history"),
    hypertension_family_history: nullableBooleanSelect("hypertension-family-history"),
    alcohol_frequency: alcoholFrequencyValue(),
  };
}

function detailHealthReviewRows() {
  const details = detailHealthPayload();
  return [
    ["고혈압", selectLabel("hypertension-diagnosis")],
    ["심장질환", selectLabel("heart-disease-diagnosis")],
    ["관절염·류머티즘", selectLabel("arthritis-rheumatism-diagnosis")],
    ["암", selectLabel("cancer-diagnosis")],
    ["만성 폐질환", selectLabel("chronic-lung-disease-diagnosis")],
    ["간질환", selectLabel("liver-disease-diagnosis")],
    ["뇌혈관질환", selectLabel("cerebrovascular-disease-diagnosis")],
    ["정신과 질환", selectLabel("psychiatric-disease-diagnosis")],
    ["당뇨 가족력", selectLabel("diabetes-family-history")],
    ["고혈압 가족력", selectLabel("hypertension-family-history")],
    ["최종 학력", selectLabel("education-level")],
    ["혼인 상태", selectLabel("marital-status")],
    ["지난주 우울감", selectLabel("depressed-feeling-last-week")],
    ["지난주 수면곤란", selectLabel("sleep-difficulty-last-week")],
    ["연간 가구소득", details.annual_household_income_10k_krw == null ? "모름" : `${details.annual_household_income_10k_krw}만원/년`],
    ["가구 형태", selectLabel("household-structure")],
    ["거주 지역", selectLabel("region")],
  ];
}






async function saveCurrentScreeningInputSnapshot() {
  state.currentScreeningInputSaveUnavailable = false;
  state.currentScreeningInputId = null;
  const healthCheckupId = state.healthCheckupResult?.checkup_id || state.checkupId;
  const payload = {
    health_checkup_id: healthCheckupId,
    input_as_of_date: new Date().toISOString().slice(0, 10),
    ...detailHealthPayload(),
  };
  if (isLocalPreview()) {
    state.currentScreeningInputId = `local-current-screening-${Date.now()}`;
    state.healthCheckupResult = { ...(state.healthCheckupResult || {}), current_screening_input_id: state.currentScreeningInputId, current_screening_input: payload };
    return null;
  }
  try {
    const snapshot = await api("/current-screening-inputs", { method: "POST", body: JSON.stringify(payload) });
    rememberCurrentScreeningInputId(snapshot);
    return snapshot;
  } catch (error) {
    if ([400, 404, 405, 422, 501].includes(error.status)) {
      state.currentScreeningInputSaveUnavailable = true;
      return null;
    }
    throw error;
  }
}

function syncExerciseDetails() {
  const isRegularExercise = selectedRadioValue("regular-exercise") === "true";
  const days = $("#exercise-days");
  const minutes = $("#exercise-minutes");
  const card = $("#exercise-detail-card");
  if (!days || !minutes || !card) return;
  if (!isRegularExercise) {
    if (!days.disabled) days.dataset.previousValue = days.value;
    if (!minutes.disabled) minutes.dataset.previousValue = minutes.value;
    days.value = "0";
    minutes.value = "0";
  } else {
    if (days.disabled) days.value = days.dataset.previousValue ?? "3";
    if (minutes.disabled) minutes.value = minutes.dataset.previousValue ?? "30";
  }
  days.disabled = !isRegularExercise;
  minutes.disabled = !isRegularExercise;
  card.hidden = false;
  card.classList.toggle("disabled", !isRegularExercise);
}

function syncAlcoholFrequencyDetails() {
  const row = $("#alcohol-frequency-row");
  const select = $("#alcohol-frequency");
  if (!row || !select) return;
  row.hidden = false;
  row.classList.remove("disabled");
  select.disabled = false;
}

function currentAgeLabel() {
  const birth = $("#eligibility-birth-date").value;
  const age = getAgeFromBirth(birth);
  return Number.isFinite(age) ? `만 ${age}세` : "-";
}

function getAgeFromBirth(birth) {
  if (!birth) return null;
  const birthDate = new Date(`${birth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())) age -= 1;
  return Number.isFinite(age) ? age : null;
}

function questionnaireAnswer(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || null;
}

function hasUrgentSymptoms() {
  return questionnaireAnswer("urgent-summary") === "yes";
}

function isUrgentAnswerUncertain() {
  return questionnaireAnswer("urgent-summary") === "unsure";
}

function hasSameDaySymptoms() {
  return questionnaireAnswer("same-day-summary") === "yes";
}

function isSameDayAnswerUncertain() {
  return questionnaireAnswer("same-day-summary") === "unsure";
}

function clearQuestionnaireAnswers(name) {
  $$(`input[name="${name}"]`).forEach((input) => { input.checked = false; });
}

function resetEligibilityAnswers() {
  ["urgent-warning", "diabetes-diagnosis", "urgent-summary", "same-day-summary"].forEach(clearQuestionnaireAnswers);
  $("#emergency-questionnaire-summary").textContent = "";
  $("#emergency-questionnaire-summary").hidden = true;
  $("#eligibility-guidance").hidden = true;
  syncEmergencyQuestionnaire();
}

function syncEmergencyQuestionnaire() {
  const canContinueToSameDay = questionnaireAnswer("urgent-summary") === "none";
  $("#same-day-stage").hidden = !canContinueToSameDay;
  if (!canContinueToSameDay) clearQuestionnaireAnswers("same-day-summary");
}

function emergencyScreeningSummary() {
  if (hasUrgentSymptoms() || isUrgentAnswerUncertain()) return "즉시 도움 안내 대상";
  if (hasSameDaySymptoms() || isSameDayAnswerUncertain()) return "당일 의료기관 확인 안내 대상";
  if ($("#urgent-warning-yes").checked) return "긴급 증상 있음";
  return "해당 증상 없음";
}

function openEmergencyQuestionnaire() {
  $("#emergency-questionnaire-modal-message").hidden = true;
  $("#emergency-questionnaire-modal").hidden = false;
  document.body.classList.add("modal-open");
  $("#emergency-questionnaire-title").focus?.();
}

function closeEmergencyQuestionnaire() {
  $("#emergency-questionnaire-modal").hidden = true;
  document.body.classList.remove("modal-open");
  $("#open-emergency-questionnaire").focus();
}

function openDiagnosisHelp() {
  $("#diagnosis-help-modal").hidden = false;
  document.body.classList.add("modal-open");
  $("#diagnosis-help-title").focus?.();
}

function closeDiagnosisHelp() {
  $("#diagnosis-help-modal").hidden = true;
  document.body.classList.remove("modal-open");
  $("#diagnosis-help-toggle").focus();
}

function applyEmergencyQuestionnaire() {
  const modalMessage = $("#emergency-questionnaire-modal-message");
  const summary = $("#emergency-questionnaire-summary");
  modalMessage.hidden = true;

  if (hasUrgentSymptoms() || isUrgentAnswerUncertain()) {
    $("#urgent-warning-yes").checked = true;
    summary.textContent = "문진 결과: 즉시 도움 안내가 필요한 증상을 확인했습니다.";
  } else if (questionnaireAnswer("urgent-summary") !== "none") {
    modalMessage.textContent = "1단계 문항을 읽고 증상 여부를 선택해 주세요.";
    modalMessage.hidden = false;
    return;
  } else if (hasSameDaySymptoms() || isSameDayAnswerUncertain()) {
    $("#urgent-warning-no").checked = true;
    summary.textContent = "문진 결과: 오늘 의료기관 확인이 필요한 증상을 확인했습니다.";
  } else if (questionnaireAnswer("same-day-summary") === "none") {
    $("#urgent-warning-no").checked = true;
    summary.textContent = "문진 결과: 해당 증상이 없습니다.";
  } else {
    modalMessage.textContent = "2단계 문항을 읽고 증상 여부를 선택해 주세요.";
    modalMessage.hidden = false;
    return;
  }

  summary.hidden = false;
  closeEmergencyQuestionnaire();
}

function getLocalEligibilityResult() {
  const age = getAgeFromBirth($("#eligibility-birth-date").value);
  const reasonCodes = [];
  if ($("#urgent-warning-yes").checked || hasUrgentSymptoms() || isUrgentAnswerUncertain()) reasonCodes.push("URGENT_MEDICAL_ATTENTION");
  if (hasSameDaySymptoms() || isSameDayAnswerUncertain()) reasonCodes.push("SAME_DAY_MEDICAL_ATTENTION");
  if (Number.isFinite(age) && age < 14) reasonCodes.push("UNDER_MINIMUM_SERVICE_AGE");
  if (Number.isFinite(age) && age >= 14 && age < 19) reasonCodes.push("CHALLENGE_ONLY_AGE");
  if ($("#diagnosed-diabetes-yes").checked) reasonCodes.push("DIAGNOSED_DIABETES");
  if (Number.isFinite(age) && age >= 19 && age < 45) reasonCodes.push("MODEL_AGE_OUT_OF_RANGE");
  const safetyBlocked = reasonCodes.some((code) => ["URGENT_MEDICAL_ATTENTION", "SAME_DAY_MEDICAL_ATTENTION", "DIAGNOSED_DIABETES"].includes(code));
  return {
    age,
    service_eligible: Number.isFinite(age) && age >= 19,
    challenge_eligible: Number.isFinite(age) && age >= 14 && !safetyBlocked,
    current_health_check_eligible: Number.isFinite(age) && age >= 19 && !safetyBlocked,
    future_prediction_eligible: Number.isFinite(age) && age >= 45 && !safetyBlocked,
    model_eligible: Number.isFinite(age) && age >= 45 && !safetyBlocked,
    reason_codes: reasonCodes,
  };
}

function dlRows(rows) {
  return rows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value ?? "-")}</dd></div>`).join("");
}

function renderHealthReview() {
  const isRegularExercise = selectedRadioValue("regular-exercise") === "true";
  const detailHealth = detailHealthPayload();
  $("#health-review-title").textContent = "입력한 내용을 확인해 주세요";
  const healthReviewLead = $("#health-review-panel .lead");
  if (healthReviewLead) healthReviewLead.hidden = true;
  $("#submit-analysis").textContent = healthSubmitLabel();
  $("#review-eligibility").innerHTML = dlRows([
    ["생년월일", $("#eligibility-birth-date").value || "-"],
    ["현재 만 나이", currentAgeLabel()],
    ["당뇨병 진단 여부", $("#diagnosed-diabetes-yes").checked ? "진단받음" : "진단받지 않음"],
    ["응급상황 사전 문진", emergencyScreeningSummary()],
  ]);
  $("#review-health").innerHTML = dlRows([
    ["키", `${$("#height").value} cm`],
    ["몸무게", `${$("#weight").value} kg`],
    ["허리둘레", $("#waist").value ? `${$("#waist").value} cm` : "입력 안 함"],
    ["수축기 혈압", $("#systolic").value ? `${$("#systolic").value} mmHg` : "입력 안 함"],
    ["이완기 혈압", $("#diastolic").value ? `${$("#diastolic").value} mmHg` : "입력 안 함"],
  ]);
  $("#review-lifestyle").innerHTML = dlRows([
    ["흡연 상태", smokingStatusLabel(selectedRadioValue("smoking-status"))],
    ["현재 음주", boolLabel(selectedRadioValue("current-drinker"))],
    ["최근 1년 음주 빈도", selectLabel("alcohol-frequency")],
    ["건강 만족도", nullableNumber("health-satisfaction-score") == null ? "모름" : `${nullableNumber("health-satisfaction-score")}점`],
    ["경제 만족도", nullableNumber("economic-satisfaction-score") == null ? "모름" : `${nullableNumber("economic-satisfaction-score")}점`],
    ["삶의 질", nullableNumber("overall-quality-of-life-score") == null ? "모름" : `${nullableNumber("overall-quality-of-life-score")}점`],
    ["규칙적인 운동", boolLabel(selectedRadioValue("regular-exercise"))],
    ["주당 운동 일수", `${isRegularExercise ? $("#exercise-days").value : 0}일`],
    ["한 번 운동할 때 시간", `${isRegularExercise ? $("#exercise-minutes").value : 0}분`],
  ]);
  $("#review-detail-health").innerHTML = dlRows(detailHealthReviewRows());
}

function collectInvalidHealthFields() {
  return $$("#health-form input, #health-form select").filter((input) => !input.checkValidity()).map((input) => {
    const label = document.querySelector(`label[for="${input.id}"]`)?.childNodes?.[0]?.textContent?.trim()
      || input.closest("fieldset")?.querySelector("legend")?.childNodes?.[0]?.textContent?.trim()
      || input.closest('[role="group"]')?.querySelector(".choice-title")?.childNodes?.[0]?.textContent?.trim()
      || input.id;
    return { id: input.id, label, message: input.validationMessage || "입력값을 확인해 주세요." };
  });
}

function renderHealthErrorSummary(fields) {
  const box = $("#health-error-summary");
  const list = $("#health-error-list");
  list.innerHTML = fields.map((field) => (
    `<li><button class="link-button health-error-jump" type="button" data-field-id="${escapeHtml(field.id)}"><strong>${escapeHtml(field.label)}</strong><small>${escapeHtml(field.message)}</small></button></li>`
  )).join("");
  box.hidden = !fields.length;
  $("#health-error-title").textContent = `${fields.length}개 항목을 확인해 주세요`;
}

function focusHealthField(id) {
  const field = document.getElementById(id);
  if (!field) return;
  const panel = field.closest(".health-input-panel")?.id;
  showHealthInputPanel({
    "health-metrics-panel": "metrics",
    "health-vitals-panel": "vitals",
    "lifestyle-input-panel": "drinking",
    "health-habits-panel": "habits",
    "health-activity-panel": "activity",
    "detail-health-panel": "family",
    "health-nutrition-panel": "nutrition",
    "health-socioeconomic-panel": "socioeconomic",
  }[panel] || "metrics");
  field.focus();
}

function setPredictionTrack(status, errorCode = "") {
  const received = $("#status-step-received");
  const analysis = $("#status-step-analysis");
  const ready = $("#status-step-ready");
  if (!received || !analysis || !ready) return;
  [received, analysis, ready].forEach((item) => {
    item.className = "";
    item.querySelector("span").textContent = "·";
  });
  received.classList.add("done");
  received.querySelector("span").textContent = "✓";
  if (status === "running" || status === "succeeded") {
    analysis.classList.add("done");
    analysis.querySelector("span").textContent = status === "running" ? "•" : "✓";
  }
  if (status === "succeeded") {
    ready.classList.add("done");
    ready.querySelector("span").textContent = "✓";
  }
  if (status === "failed") {
    const isWarning = ["TIMEOUT", "MODEL_NOT_READY", "ML_MODEL_UNAVAILABLE", "ML_MODEL_CONTRACT_ERROR"].includes(errorCode);
    analysis.classList.add(isWarning ? "warning" : "failed");
    analysis.querySelector("span").textContent = isWarning ? "!" : "×";
  }
}

function renderPredictionStatus(status, options = {}) {
  const errorCode = normalizeModelErrorCode(options.errorCode || "");
  const config = {
    queued: {
      eyebrow: "예측 요청 접수·대기",
      title: "예측 요청을 접수했습니다",
      stage: "접수 완료",
      icon: "···",
      mascot: "/static/assets/hyeoldangi-default.png",
      message: "잠시 후 자동으로 분석을 시작합니다.",
      policy: "대기 중에는 결과가 생성되지 않으며, 진행 상태를 다시 확인할 수 있습니다.",
      showRetry: false,
    },
    running: {
      eyebrow: "예측 요청 처리 중",
      title: "미래 당뇨병 발병 위험을 분석하고 있습니다",
      stage: "분석 중",
      icon: "◌",
      mascot: "/static/assets/hyeoldangi-analyzing.png",
      message: "진행률 숫자는 위험 확률로 오해될 수 있어\n표시하지 않습니다.",
      policy: "이 결과는 당뇨병 진단이나 치료 판단을 대신하지 않습니다.",
      showRetry: false,
    },
    succeeded: {
      eyebrow: "예측 결과 준비 완료",
      title: "분석이 완료되었습니다",
      stage: "결과 준비 완료",
      icon: "✓",
      mascot: "/static/assets/hyeoldangi-complete.png",
      message: "결과 화면에서 위험 범주와\n다음 행동을 확인해 주세요.",
      policy: "결과는 당뇨병 진단이나 치료 판단을 대신하지 않습니다.",
      showRetry: false,
    },
    failed: {
      eyebrow: "예측 처리 실패",
      title: "예측을 완료하지 못했습니다",
      stage: "분석 실패",
      icon: "×",
      mascot: "/static/assets/hyeoldangi-guide.png",
      message: "분석을 완료하지 못했습니다.\n다시 시도해 주세요.",
      policy: "반복해서 실패하면 잠시 후 다시 시도하거나 입력정보를 확인해 주세요.",
      showRetry: true,
    },
  }[status] || {};
  if (status === "failed" && errorCode === "TIMEOUT") Object.assign(config, {
    eyebrow: "예측 처리 시간 초과", title: "분석 시간이 예상보다 길어졌습니다", stage: "시간 초과", icon: "!",
    message: "완료되지 않은 요청을 결과처럼 표시하지 않습니다.", policy: "입력정보는 유지되며, 잠시 후 다시 시도할 수 있습니다.",
  });
  if (status === "failed" && errorCode === "MODEL_NOT_READY") Object.assign(config, {
    eyebrow: "모델 검증 중", title: "현재 예측 모델을 사용할 수 없습니다", stage: "모델 준비 중", icon: "!",
    mascot: "/static/assets/hyeoldangi-analyzing.png", message: "아직 사용자에게 제공할 수 있는 결과가 준비되지 않았습니다.",
    policy: "승인 전 확률·점수·위험 범주는 사용자 화면에 표시하지 않습니다.",
  });
  const failureGuidance = predictionFailureGuidance[errorCode];
  if (status === "failed" && failureGuidance) Object.assign(config, failureGuidance);
  const statusCard = $("#prediction-status-card");
  if (statusCard) {
    statusCard.dataset.status = status;
    if (errorCode) statusCard.dataset.errorCode = errorCode;
    else delete statusCard.dataset.errorCode;
  }
  $("#prediction-status-eyebrow").textContent = config.eyebrow;
  $("#result-title").textContent = config.title;
  $("#result-stage").textContent = config.stage;
  const statusSymbol = $("#prediction-status-symbol");
  if (statusSymbol) statusSymbol.textContent = config.icon;
  const mascot = $("#prediction-mascot");
  if (mascot && config.mascot) mascot.src = config.mascot;
  $("#result-explain").textContent = options.message || config.message;
  $("#job-status").textContent = options.lead || config.message;
  $("#probability-policy").querySelector("p").textContent = config.policy;
  $("#analysis-failure").hidden = status !== "failed";
  if (!$("#analysis-failure").hidden) {
    $("#analysis-failure-title").textContent = failureGuidance?.failureTitle || (errorCode === "TIMEOUT"
      ? "분석 시간이 초과되었습니다"
      : errorCode === "MODEL_NOT_READY"
        ? "현재 모델을 검증하고 있습니다"
        : "분석을 완료하지 못했습니다");
    $("#analysis-failure-message").textContent = failureGuidance?.failureMessage || (errorCode === "TIMEOUT"
      ? "입력정보는 보존되어 있습니다. 잠시 후 다시 시도할 수 있습니다."
      : errorCode === "MODEL_NOT_READY"
        ? "아직 사용자에게 제공할 수 있는 결과가 준비되지 않았습니다."
        : "입력정보를 확인한 뒤 다시 시도해 주세요.");
  }
  $("#retry-analysis").hidden = !config.showRetry;
  $("#high-guidance").hidden = true;
  $$("[data-demo-status]").forEach((button) => {
    const selected = button.dataset.demoStatus === status;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  setPredictionTrack(status, errorCode);
}

function normalizeRiskKey(prediction = state.prediction) {
  const raw = prediction?.risk_category || prediction?.risk_category_label || "low";
  if (raw === "high" || raw === "diabetes_screening_advised" || raw === "높음") return "high";
  if (raw === "moderate" || raw === "caution" || raw === "주의") return "moderate";
  return "low";
}

function isPublicRiskDisplayAllowed(prediction = {}) {
  return prediction.result_status === "approved"
    && prediction.promotion_status === "approved"
    && prediction.display_allowed !== false
    && prediction.output_status !== "uncalibrated_research_probability_only"
    && prediction.raw_probability_exposed !== true
    && Boolean(prediction.risk_category);
}

function modelMetadataFromPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return null;
  return {
    model_key: payload.model_key || null,
    task_type: payload.task_type || null,
    model_version: payload.model_version || null,
    threshold_scope: payload.threshold_scope || null,
    threshold_version: payload.threshold_version || null,
    model_artifact_digest: payload.model_artifact_digest || null,
    current_screening_input_id: payload.current_screening_input_id || null,
    display_allowed: payload.display_allowed,
    risk_curve_status: payload.risk_curve_status || payload.age_risk_forecast?.risk_curve_status || payload.age_risk_forecast?.status || null,
    calibration_status: payload.calibration_status || payload.age_risk_forecast?.calibration_status || payload.age_risk_forecast?.calibration?.status || null,
  };
}

function rememberModelOutputMetadata(payload = {}, fallbackKey = "unknown") {
  const metadata = modelMetadataFromPayload(payload);
  if (!metadata) return;
  const key = metadata.model_key || metadata.task_type || fallbackKey;
  state.modelOutputMetadata[key] = metadata;
  if (metadata.current_screening_input_id) state.currentScreeningInputId = metadata.current_screening_input_id;
}

function rememberCurrentScreeningInputId(payload = {}) {
  const id = payload.current_screening_input_id
    || payload.currentScreeningInputId
    || payload.current_screening_input?.id
    || payload.current_screening_input?.input_id;
  if (id) state.currentScreeningInputId = id;
}

function forecastCurveDisplayAllowed() {
  // Research-only survival forecasts are excluded from this MVP, even if supplied by the server.
  return false;
}

function getCurrentHealthSignal(checkup = state.currentScreeningPrediction || state.healthCheckupResult) {
  const nestedSignal = checkup?.current_health_signal || checkup?.current_health_assessment || checkup?.health_signal;
  if (nestedSignal) return nestedSignal;
  if (checkup?.model_key !== "diabetes_current_screening") return null;
  rememberModelOutputMetadata(checkup, "diabetes_current_screening");
  const isApproved = isPublicRiskDisplayAllowed(checkup);
  if (isApproved) {
    return {
      category_label: forecastSignalLabel(normalizeRiskKey(checkup)),
      summary: checkup.summary || checkup.guidance || "현재 위험 신호 선별 결과를 확인해 주세요.",
    };
  }
  const previewLevel = isDemoEnvironment() && checkup.preview_only === true
    ? normalizeForecastSignal(checkup.preview_signal_level)
    : null;
  if (previewLevel) {
    return {
      category_label: `화면 확인용 ${forecastSignalLabel(previewLevel)}`,
      summary: checkup.preview_source === "static_fixture"
        ? "화면 배치 확인용 고정 예시입니다. 실제 모델을 호출하거나 입력값을 분석한 결과가 아닙니다."
        : "연구 모델의 화면 확인용 위험 신호 등급입니다. 운영 승인 전이므로 숫자 점수·확률은 표시하지 않습니다.",
    };
  }
  return {
    title: "현재 위험 신호 분석을 완료했습니다",
    summary: "검증과 공개 승인이 끝나기 전에는 위험 범주나 숫자 결과를 표시하지 않습니다.",
  };
}

function renderCurrentHealthResult(checkup = state.healthCheckupResult, { standalone = state.currentHealthOnly } = {}) {
  const panel = $("#current-health-result");
  const futureResult = $("#future-prediction-result");
  if (!panel || !futureResult) return;
  panel.hidden = false;
  futureResult.hidden = standalone;
  $("#current-health-result-scope").textContent = standalone ? "만 19~44세 이용 범위" : "만 45세 이상 현재 건강 신호";
  if (standalone) {
    $("#result-confirmation-eyebrow").textContent = "현재 건강 신호";
    $("#factors-title").textContent = "현재 건강정보를 확인해 주세요";
    $("#result-confirmation-lead").innerHTML = "<p>입력한 건강정보를 저장하고 현재 건강 신호 결과를 확인합니다.</p>";
    $("#to-challenges").textContent = requiresMedicalResultGuidance() ? "검사·상담 안내 보기" : "다음: 생활습관 챌린지 보기";
  }

  const signal = getCurrentHealthSignal(checkup);
  const title = typeof signal === "object" && signal
    ? signal.category_label || signal.status_label || signal.title || "현재 건강 신호를 확인했습니다"
    : typeof signal === "string" && signal.trim()
      ? signal
      : "건강정보 저장을 완료했습니다";
  const message = typeof signal === "object" && signal
    ? signal.summary || signal.message || signal.guidance || "백엔드에서 전달한 현재 건강 신호를 확인해 주세요."
    : signal
      ? "백엔드에서 전달한 현재 건강 신호를 확인해 주세요."
      : "현재 공개할 수 있는 예측 결과가 없습니다. 결과가 준비되기 전에는 위험 범주나 수치를 표시하지 않습니다.";
  $("#current-health-result-title").textContent = title;
  $("#current-health-result-message").textContent = message;

  const details = $("#current-health-result-details");
  const items = typeof signal === "object" && signal && Array.isArray(signal.items) ? signal.items : [];
  details.hidden = !items.length;
  details.innerHTML = items.map((item) => {
    const label = item.label || item.name || "확인 항목";
    const value = item.value_label || item.value || item.message || "확인됨";
    return `<div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`;
  }).join("");
}

function showFuturePredictionResult() {
  $("#future-prediction-result").hidden = false;
  $("#result-confirmation-eyebrow").textContent = "결과 확인";
  $("#factors-title").textContent = "현재 당뇨 신호와 미래 당뇨 위험 확인해주세요";
  $("#result-confirmation-lead").innerHTML = "<p><strong>현재 위험 신호</strong> 지금 건강정보에서 위험 신호가 있는지 확인해요.</p><p><strong>미래의 당뇨 위험</strong> 앞으로 약 2년 동안 조심할 위험 신호예요.</p>";
  $("#current-health-result").hidden = true;
}

function updateResultConfirmation(prediction = state.currentScreeningPrediction || {}, approvedOverride = null) {
  if (!state.currentHealthOnly) showFuturePredictionResult();
  const card = $("#risk-confirm-card");
  if (!card) return;
  rememberModelOutputMetadata(prediction, "result_confirmation");
  const isApprovedRisk = approvedOverride ?? isPublicRiskDisplayAllowed(prediction);
  const previewRisk = isDemoEnvironment() && prediction?.preview_only === true
    ? normalizeForecastSignal(prediction.preview_signal_level)
    : null;
  const currentSignalRisk = (value = {}) => {
    const raw = value?.risk_category || value?.risk_category_label || "";
    if (raw === "pending") return "pending";
    return normalizeRiskKey(value) === "low" ? "low" : "high";
  };
  const risk = isApprovedRisk ? currentSignalRisk(prediction) : currentSignalRisk({ risk_category: previewRisk || "pending" });
  const content = {
    low: {
      label: "낮음",
      next: "다음: 챌린지 보기",
      mascot: "/static/assets/hyeoldangi-risk-low.png",
      mascotAlt: "좋은 습관을 이어가자고 응원하는 간당간당 캐릭터 혈당이",
    },
    high: {
      label: "높음",
      next: "검사·상담 안내 보기",
      mascot: "/static/assets/hyeoldangi-risk-high.png",
      mascotAlt: "검사와 상담을 먼저 확인하자고 안내하는 간당간당 캐릭터 혈당이",
    },
    pending: {
      label: "결과 준비 중",
      next: "다음: 챌린지 보기",
      mascot: "/static/assets/hyeoldangi-risk-low.png",
      mascotAlt: "결과를 기다리며 응원하는 간당간당 캐릭터 혈당이",
    },
  }[risk];
  card.dataset.risk = risk;
  $("#risk-confirm-label").textContent = content.label;
  const trafficLight = $("#risk-traffic-light");
  if (trafficLight) trafficLight.setAttribute(
    "aria-label",
    risk === "pending"
      ? "현재 위험 신호 결과 준비 중"
      : `현재 위험 신호 ${content.label}`,
  );
  const riskMascot = $("#risk-hyeoldangi");
  if (riskMascot) {
    riskMascot.src = content.mascot;
    riskMascot.alt = content.mascotAlt;
  }
  $("#medical-guidance-detail").hidden = true;
  const challengeButton = $("#to-challenges");
  if (challengeButton) challengeButton.textContent = requiresMedicalResultGuidance() ? "검사·상담 안내 보기" : content.next;
}

function requiresMedicalResultGuidance() {
  return $("#risk-confirm-card")?.dataset.risk === "high"
    || (!state.currentHealthOnly && isPublicRiskDisplayAllowed(state.prediction || {}) && normalizeRiskKey(state.prediction) === "high");
}

function canContinueAfterMedicalGuidance() {
  const blocked = ["URGENT_MEDICAL_ATTENTION", "SAME_DAY_MEDICAL_ATTENTION", "DIAGNOSED_DIABETES", "UNDER_MINIMUM_SERVICE_AGE", "CONSENT_REQUIRED"];
  return state.capabilities.challenge === true && !state.medicalGuidanceRequired
    && !(state.eligibility?.reason_codes || []).some(code => blocked.includes(code));
}

function setMedicalFacilityStatus(status, title, message) {
  const box = $("#medical-facility-status");
  if (!box) return;
  box.dataset.state = status;
  box.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
}

const facilityMapInstances = {};
const facilityMapMarkers = { medical: [], emergency: [] };
let kakaoMapsLoadPromise = null;

function ensureKakaoMapsLoaded() {
  if (window.kakao?.maps?.load) {
    return new Promise((resolve) => window.kakao.maps.load(() => resolve(window.kakao)));
  }
  if (kakaoMapsLoadPromise) return kakaoMapsLoadPromise;
  kakaoMapsLoadPromise = (async () => {
    const mapConfig = await api("/medical-facilities/map-config");
    const javascriptKey = String(mapConfig?.javascript_key || "").trim();
    if (!mapConfig?.enabled || !javascriptKey) {
      throw new Error("지도 연결 키가 설정되어 있지 않습니다.");
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(javascriptKey)}&autoload=false&libraries=services`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("지도 서비스를 불러오지 못했습니다."));
      document.head.append(script);
    });
    if (!window.kakao?.maps?.load) throw new Error("지도 서비스를 초기화하지 못했습니다.");
    return new Promise((resolve) => window.kakao.maps.load(() => resolve(window.kakao)));
  })().catch((error) => {
    kakaoMapsLoadPromise = null;
    throw error;
  });
  return kakaoMapsLoadPromise;
}

function clearFacilityMapMarkers(target) {
  (facilityMapMarkers[target] || []).forEach((marker) => marker.setMap(null));
  facilityMapMarkers[target] = [];
}

function resetFacilitySearchUi(target) {
  const prefix = target === "emergency" ? "emergency" : "medical";
  const results = $(`#${prefix}-facility-results`);
  const meta = $(`#${prefix}-facility-meta`);
  const map = $(`#${prefix}-facility-map`);
  if (results) {
    results.innerHTML = "";
    results.hidden = true;
  }
  if (meta) {
    meta.innerHTML = "";
    meta.hidden = true;
  }
  clearFacilityMapMarkers(target);
  if (map) map.hidden = true;
}

const USER_MARKER_IMAGE_SRC =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="10" fill="#2563eb" stroke="#ffffff" stroke-width="3"/></svg>',
  );
const FACILITY_MARKER_IMAGE_SRC =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="9" fill="#dc2626" stroke="#ffffff" stroke-width="3"/></svg>',
  );

async function renderFacilityMap(latitude, longitude, facilities, target, referenceLabel) {
  const container = $(`#${target}-facility-map`);
  if (!container) return;
  try {
    const kakao = await ensureKakaoMapsLoaded();
    const center = new kakao.maps.LatLng(latitude, longitude);
    container.hidden = false;
    if (!facilityMapInstances[target]) {
      facilityMapInstances[target] = new kakao.maps.Map(container, { center, level: 4 });
    } else {
      facilityMapInstances[target].setCenter(center);
    }
    const map = facilityMapInstances[target];
    clearFacilityMapMarkers(target);
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(center);
    const userMarker = new kakao.maps.Marker({
      map,
      position: center,
      title: referenceLabel,
      image: new kakao.maps.MarkerImage(USER_MARKER_IMAGE_SRC, new kakao.maps.Size(28, 28), {
        offset: new kakao.maps.Point(14, 14),
      }),
      zIndex: 10,
    });
    facilityMapMarkers[target].push(userMarker);
    const facilityMarkerImage = new kakao.maps.MarkerImage(
      FACILITY_MARKER_IMAGE_SRC,
      new kakao.maps.Size(26, 26),
      { offset: new kakao.maps.Point(13, 13) },
    );
    facilities.forEach((facility) => {
      if (facility.latitude == null || facility.longitude == null) return;
      const position = new kakao.maps.LatLng(facility.latitude, facility.longitude);
      bounds.extend(position);
      const marker = new kakao.maps.Marker({
        map,
        position,
        title: facility.name,
        image: facilityMarkerImage,
      });
      const infoWindow = new kakao.maps.InfoWindow({
        content: `<div class="facility-map-label">${escapeHtml(facility.name || "의료기관")}</div>`,
      });
      kakao.maps.event.addListener(marker, "click", () => infoWindow.open(map, marker));
      facilityMapMarkers[target].push(marker);
    });
    map.setBounds(bounds);
    map.setCenter(center);
  } catch (_error) {
    container.hidden = true;
  }
}

async function coordinatesForAddress(address) {
  const kakao = await ensureKakaoMapsLoaded();
  return new Promise((resolve, reject) => {
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (results, status) => {
      if (status !== kakao.maps.services.Status.OK || !results.length) {
        reject(new Error("주소를 찾지 못했습니다. 도로명과 건물 번호까지 입력해 주세요."));
        return;
      }
      resolve({ lat: Number(results[0].y), lon: Number(results[0].x) });
    });
  });
}

function medicalFacilityDistance(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters < 0) return "거리 정보 없음";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km`;
}

function medicalFacilityCheckedAt(value) {
  const checkedAt = value ? new Date(value) : new Date();
  const date = Number.isNaN(checkedAt.getTime()) ? new Date() : checkedAt;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isSampleFacilityPayload(payload = {}) {
  return payload.provider_kind === "development" || payload.data_source === "development_mock";
}

function renderMedicalFacilities(payload = {}) {
  const facilities = Array.isArray(payload.facilities) ? payload.facilities : [];
  const results = $("#medical-facility-results");
  const meta = $("#medical-facility-meta");
  if (!results || !meta) return;
  if (isSampleFacilityPayload(payload)) {
    results.replaceChildren();
    results.hidden = true;
    meta.hidden = true;
    setMedicalFacilityStatus("sample", "실제 의료기관 검색 연결이 필요해요", "현재 서버는 개발용 예시를 반환하고 있어 기관 목록·전화·지도는 표시하지 않습니다.");
    return;
  }
  results.hidden = facilities.length === 0;
  meta.hidden = false;
  const radius = Number(payload.retrieved_radius_meters);
  const provider = payload.provider_kind === "kakao_local_api" ? "카카오 로컬 API" : "의료기관 정보 API";
  const checkedAt = medicalFacilityCheckedAt(payload.retrieved_at || payload.checked_at);
  const area = String(payload.search_area_label || "").trim();
  meta.innerHTML = `<p><strong>정보 출처</strong> ${escapeHtml(provider)}${Number.isFinite(radius) ? ` · 반경 ${escapeHtml(medicalFacilityDistance(radius))}` : ""}</p><p><strong>정보 확인일</strong> ${escapeHtml(checkedAt)}${area ? ` · ${escapeHtml(area)} 중심` : ""}</p>${payload.disclaimer ? `<p>${escapeHtml(payload.disclaimer)}</p>` : ""}`;
  if (!facilities.length) {
    setMedicalFacilityStatus("empty", "근처 의료기관을 찾지 못했어요", "검색 반경을 넓혀서 다시 확인해 주세요.");
    return;
  }
  results.innerHTML = facilities.map((facility) => {
    const address = facility.road_address || facility.address || "주소 정보 없음";
    const phone = String(facility.phone || "").trim();
    const phoneHref = phone.replace(/[^0-9+]/g, "");
    const mapUrl = safeExternalUrl(facility.map_url);
    return `<article class="medical-facility-card">
      <div class="medical-facility-card-heading"><strong>${escapeHtml(facility.name || "의료기관")}</strong><span>${escapeHtml(medicalFacilityDistance(facility.distance_meters))}</span></div>
      <p class="medical-facility-address">${escapeHtml(address)}</p>
      <div class="facility-actions">
        ${phone && phoneHref ? `<a class="secondary" href="tel:${escapeHtml(phoneHref)}">전화 ${escapeHtml(phone)}</a>` : `<span class="facility-action-unavailable">전화번호 없음</span>`}
        ${mapUrl ? `<a class="secondary" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">주소·지도 보기</a>` : `<span class="facility-action-unavailable">지도 링크 없음</span>`}
      </div>
    </article>`;
  }).join("");
  setMedicalFacilityStatus("done", `가까운 의료기관 ${facilities.length}곳을 찾았어요`, "거리순 안내이며 특정 의료기관을 추천하거나 보증하지 않습니다.");
}

async function requestMedicalFacilities({ lat, lon, areaLabel = "", referenceLabel = "현재 위치" }, button) {
  resetFacilitySearchUi("medical");
  const releaseBusy = setButtonBusy(button, "검색 중…");
  setMedicalFacilityStatus("loading", "근처 의료기관을 찾고 있어요", "거리순으로 정보를 불러오는 중입니다.");
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: "5000" });
    const payload = await api(`/medical-facilities/nearby?${params.toString()}`);
    renderMedicalFacilities({ ...payload, search_area_label: areaLabel });
    if (isSampleFacilityPayload(payload)) return;
    await renderFacilityMap(lat, lon, Array.isArray(payload.facilities) ? payload.facilities : [], "medical", referenceLabel);
  } catch (error) {
    resetFacilitySearchUi("medical");
    setMedicalFacilityStatus("failed", "의료기관 정보를 불러오지 못했어요", error?.retryable ? "잠시 후 다시 시도해 주세요." : "의료기관 연결이 준비된 뒤 다시 확인해 주세요.");
  } finally {
    releaseBusy();
  }
}

function geolocationFailureCopy(error) {
  if (error?.code === 1) return ["위치 권한이 허용되지 않았어요", "위치를 허용하면 근처 의료기관을 보여드려요. 다른 기능은 계속 이용할 수 있습니다."];
  if (error?.code === 3) return ["위치 확인 시간이 오래 걸렸어요", "잠시 후 다시 시도하거나 브라우저의 위치 설정을 확인해 주세요."];
  return ["현재 위치를 확인하지 못했어요", "브라우저의 위치 설정을 확인한 뒤 다시 시도해 주세요."];
}

function geolocationFailureState(error) {
  if (error?.code === 1) return "permission";
  if (error?.code === 3) return "timeout";
  return "unavailable";
}

function getCurrentPosition(options) {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

async function getCurrentPositionWithRetry() {
  try {
    return await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    });
  } catch (firstError) {
    if (![2, 3].includes(firstError.code)) throw firstError;
    return getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  }
}

async function findNearbyMedicalFacilities() {
  const button = $("#find-nearby-medical-facilities");
  if (!button) return;
  if (!navigator.geolocation) {
    resetFacilitySearchUi("medical");
    setMedicalFacilityStatus("unavailable", "이 브라우저에서 위치를 확인할 수 없어요", "위치 기능을 지원하는 브라우저에서 다시 확인해 주세요.");
    $("#facility-address-form").hidden = false;
    return;
  }
  const releaseBusy = setButtonBusy(button, "위치 확인 중…");
  setMedicalFacilityStatus("loading", "현재 위치를 확인하고 있어요", "위치는 근처 의료기관을 찾는 요청에만 사용합니다.");
  let position;
  try {
    position = await getCurrentPositionWithRetry();
  } catch (error) {
    resetFacilitySearchUi("medical");
    if (typeof error?.code === "number" && error.code >= 1 && error.code <= 3) {
      const [title, message] = geolocationFailureCopy(error);
      setMedicalFacilityStatus(geolocationFailureState(error), title, message);
    } else {
      setMedicalFacilityStatus("failed", "의료기관 정보를 불러오지 못했어요", error?.retryable ? "잠시 후 다시 시도해 주세요." : "의료기관 연결이 준비된 뒤 다시 확인해 주세요.");
    }
    $("#facility-address-form").hidden = false;
  } finally {
    releaseBusy();
  }
  if (position) {
    await requestMedicalFacilities({ lat: position.coords.latitude, lon: position.coords.longitude }, button);
  }
}

async function findMedicalFacilitiesByAddress(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = $("#facility-address");
  const submit = form.querySelector('button[type="submit"]');
  const address = input?.value.trim();
  if (!address || !submit) return;
  resetFacilitySearchUi("medical");
  const releaseBusy = setButtonBusy(submit, "주소 확인 중…");
  setMedicalFacilityStatus("loading", "입력한 주소를 확인하고 있어요", "도로명 주소를 검색 기준 위치로 변환하는 중입니다.");
  try {
    const coordinates = await coordinatesForAddress(address);
    input.value = "";
    releaseBusy();
    await requestMedicalFacilities(
      { ...coordinates, areaLabel: address, referenceLabel: "검색 기준 위치" },
      submit,
    );
  } catch (error) {
    resetFacilitySearchUi("medical");
    setMedicalFacilityStatus("failed", "주소로 의료기관을 찾지 못했어요", error.message || "주소를 다시 확인해 주세요.");
  } finally {
    releaseBusy();
  }
}

function setEmergencyFacilityStatus(status, title, message) {
  const box = $("#emergency-facility-status");
  if (!box) return;
  box.dataset.state = status;
  box.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
}

function renderEmergencyFacilities(payload = {}) {
  const facilities = Array.isArray(payload.facilities) ? payload.facilities : [];
  const results = $("#emergency-facility-results");
  const meta = $("#emergency-facility-meta");
  if (!results || !meta) return;
  if (isSampleFacilityPayload(payload)) {
    results.replaceChildren();
    results.hidden = true;
    meta.hidden = true;
    setEmergencyFacilityStatus("sample", "실제 응급의료기관 검색 연결이 필요해요", "개발용 예시의 전화·지도는 표시하지 않습니다. 위급하면 검색을 기다리지 말고 119에 연락해 주세요.");
    return;
  }
  results.hidden = facilities.length === 0;
  meta.hidden = false;
  const radius = Number(payload.retrieved_radius_meters);
  const checkedAt = medicalFacilityCheckedAt(payload.retrieved_at || payload.checked_at);
  const area = String(payload.search_area_label || "").trim();
  meta.innerHTML = `<p><strong>정보 출처</strong> 국립중앙의료원 응급의료기관 정보</p><p><strong>정보 확인일</strong> ${escapeHtml(checkedAt)}${area ? ` · ${escapeHtml(area)} 중심` : ""}</p>${payload.disclaimer ? `<p>${escapeHtml(payload.disclaimer)}</p>` : ""}${Number.isFinite(radius) ? `<p><strong>검색 반경</strong> ${escapeHtml(medicalFacilityDistance(radius))}</p>` : ""}`;
  if (!facilities.length) {
    setEmergencyFacilityStatus("empty", "검색 범위에서 응급의료기관을 찾지 못했어요", "위급하면 검색을 계속하지 말고 119에 연락해 주세요.");
    return;
  }
  results.innerHTML = facilities.map((facility) => {
    const address = facility.road_address || facility.address || "주소 정보 없음";
    const phone = String(facility.phone || "").trim();
    const phoneHref = phone.replace(/[^0-9+]/g, "");
    const mapUrl = safeExternalUrl(facility.map_url);
    return `<article class="medical-facility-card emergency-facility-card">
      <div class="medical-facility-card-heading"><strong>${escapeHtml(facility.name || "응급의료기관")}</strong><span>${escapeHtml(medicalFacilityDistance(facility.distance_meters))}</span></div>
      <p class="medical-facility-address">${escapeHtml(address)}</p>
      <div class="facility-actions">
        ${phone && phoneHref ? `<a class="secondary" href="tel:${escapeHtml(phoneHref)}">전화 ${escapeHtml(phone)}</a>` : `<span class="facility-action-unavailable">전화번호 없음</span>`}
        ${mapUrl ? `<a class="secondary" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">주소·지도 보기</a>` : `<span class="facility-action-unavailable">지도 링크 없음</span>`}
      </div>
    </article>`;
  }).join("");
  setEmergencyFacilityStatus("done", `가까운 응급의료기관 ${facilities.length}곳을 찾았어요`, "기관 정보와 수용 가능 여부는 이동 전에 119 또는 해당 기관에 확인해 주세요.");
}

async function requestEmergencyFacilities({ lat, lon, areaLabel = "", referenceLabel = "현재 위치" }, button) {
  resetFacilitySearchUi("emergency");
  const releaseBusy = setButtonBusy(button, "검색 중…");
  setEmergencyFacilityStatus("loading", "가까운 응급의료기관을 찾고 있어요", "위급하면 결과를 기다리지 말고 119에 연락해 주세요.");
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: "10000" });
    const payload = await api(`/emergency-facilities/nearby?${params.toString()}`);
    renderEmergencyFacilities({ ...payload, search_area_label: areaLabel });
    if (isSampleFacilityPayload(payload)) return;
    await renderFacilityMap(lat, lon, Array.isArray(payload.facilities) ? payload.facilities : [], "emergency", referenceLabel);
  } catch (error) {
    resetFacilitySearchUi("emergency");
    setEmergencyFacilityStatus("failed", "응급의료기관 정보를 불러오지 못했어요", "위급하면 검색을 다시 시도하지 말고 119에 연락해 주세요.");
  } finally {
    releaseBusy();
  }
}

function currentBrowserPosition() {
  return getCurrentPositionWithRetry();
}

function showEmergencyAddressForm() {
  if ($("#emergency-address-form")) {
    $("#emergency-address-form").hidden = false;
    return;
  }
  $("#emergency-facility-address-form")?.removeAttribute("hidden");
}

async function confirmEmergencyLocation() {
  const button = $("#confirm-current-location");
  if (!navigator.geolocation) {
    resetFacilitySearchUi("emergency");
    setEmergencyFacilityStatus("unavailable", "이 브라우저에서 위치를 확인할 수 없어요", "주소를 직접 입력하거나 위급하면 119에 연락해 주세요.");
    showEmergencyAddressForm();
    return;
  }
  resetFacilitySearchUi("emergency");
  const releaseBusy = setButtonBusy(button, "위치 확인 중…");
  try {
    const position = await currentBrowserPosition();
    state.lastKnownLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
    setEmergencyFacilityStatus("permission", "현재 위치를 확인했어요", "주변 응급실 보기를 누르면 이 위치를 기준으로 검색합니다.");
  } catch (error) {
    resetFacilitySearchUi("emergency");
    const [title] = geolocationFailureCopy(error);
    setEmergencyFacilityStatus(geolocationFailureState(error), title, "주소를 직접 입력하거나 위급하면 119에 연락해 주세요.");
    showEmergencyAddressForm();
  } finally {
    releaseBusy();
  }
}

async function findNearbyEmergencyFacilities() {
  const button = $('[data-emergency-facility-search]');
  if (!button) return;
  if (state.lastKnownLocation) {
    await requestEmergencyFacilities(state.lastKnownLocation, button);
    return;
  }
  if (!navigator.geolocation) {
    resetFacilitySearchUi("emergency");
    setEmergencyFacilityStatus("unavailable", "이 브라우저에서 위치를 확인할 수 없어요", "주소를 직접 입력하거나 위급하면 119에 연락해 주세요.");
    showEmergencyAddressForm();
    return;
  }
  resetFacilitySearchUi("emergency");
  const releaseBusy = setButtonBusy(button, "위치 확인 중…");
  let position;
  try {
    position = await currentBrowserPosition();
    state.lastKnownLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch (error) {
    resetFacilitySearchUi("emergency");
    const [title] = geolocationFailureCopy(error);
    setEmergencyFacilityStatus(geolocationFailureState(error), title, "주소를 직접 입력하거나 위급하면 119에 연락해 주세요.");
    showEmergencyAddressForm();
  } finally {
    releaseBusy();
  }
  if (position) await requestEmergencyFacilities(state.lastKnownLocation, button);
}

async function findEmergencyFacilitiesByAddress(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = $("#emergency-address") || $("#emergency-facility-address");
  const submit = form.querySelector('button[type="submit"]');
  const address = input?.value.trim();
  if (!address || !submit) return;
  resetFacilitySearchUi("emergency");
  const releaseBusy = setButtonBusy(submit, "주소 확인 중…");
  setEmergencyFacilityStatus("loading", "입력한 주소를 확인하고 있어요", "위급하면 결과를 기다리지 말고 119에 연락해 주세요.");
  try {
    const coordinates = await coordinatesForAddress(address);
    input.value = "";
    releaseBusy();
    await requestEmergencyFacilities(
      { ...coordinates, areaLabel: address, referenceLabel: "검색 기준 위치" },
      submit,
    );
  } catch (error) {
    resetFacilitySearchUi("emergency");
    setEmergencyFacilityStatus("failed", "주소로 응급의료기관을 찾지 못했어요", error.message || "위급하면 119에 연락해 주세요.");
  } finally {
    releaseBusy();
  }
}

function setForecastRiskPreview(risk) {
  const controls = $("#risk-preview-controls");
  if (!controls || controls.hidden || !isDemoEnvironment()) return;
  updateResultConfirmation({ risk_category: risk }, true);
  $$('[data-risk-preview]').forEach((button) => {
    const selected = normalizeCurrentSignalRisk({ risk_category: button.dataset.riskPreview }) === normalizeCurrentSignalRisk({ risk_category: risk });
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function updateLifestyleSummary() {
  const smokingStatus = selectedRadioValue("smoking-status");
  const drinker = boolLabel(selectedRadioValue("current-drinker"));
  const exercise = boolLabel(selectedRadioValue("regular-exercise"));
  if (!$("#summary-meals")) return;
  $("#summary-meals").textContent = `최근 1년 음주 빈도는 ${selectLabel("alcohol-frequency")}로 기록했어요.`;
  $("#summary-meals-action").textContent = "음주 습관은 오늘이 현재 신호 확인에 필요한 정보예요.";
  $("#summary-activity").textContent = exercise === "예"
    ? "규칙적인 운동을 하고 있다고 기록했어요."
    : "규칙적인 운동을 하지 않는다고 기록했어요.";
  $("#summary-activity-action").textContent = exercise === "예"
    ? "지금의 활동 습관을 무리 없이 유지해 보세요."
    : "짧은 걷기처럼 부담 낮은 활동부터 시작할 수 있어요.";
  $("#summary-metabolic").textContent = smokingStatus === "current" || drinker === "예"
    ? "흡연·음주와 관련된 생활습관 기록이 있어요."
    : smokingStatus === "former"
    ? "과거 흡연 이력이 기록되어 있어요."
    : "입력한 생활습관과 신체·검진 정보를 확인했어요.";
  $("#summary-metabolic-action").textContent = smokingStatus === "current" || drinker === "예"
    ? "현재 기록을 바탕으로 바꾸기 쉬운 생활습관부터 점검해요."
    : "이 정보는 위험 판정이 아니라 생활습관 점검을 위한 참고 신호예요.";
  $("#summary-checkup").textContent = normalizeRiskKey() === "high"
    ? "현재 위험 신호가 높음으로 확인되었어요."
    : "현재 위험 신호와 관계없이 정기적인 확인이 필요해요.";
  $("#summary-checkup-action").textContent = normalizeRiskKey() === "high"
    ? "챌린지보다 검사·의료기관 상담 안내를 먼저 확인해 주세요."
    : "정기 검진과 생활습관 기록을 이어가 주세요.";
}

function syncLifestyleAvatar() {
  const avatar = $("#lifestyle-avatar");
  if (avatar) {
    const gender = ($("#gender")?.value || state.userProfile?.gender || "FEMALE").toString().toLowerCase();
    const isMale = gender.startsWith("m");
    const birthDate = new Date(`${$("#eligibility-birth-date")?.value || state.userProfile?.birth_date || "1965-04-12"}T00:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    if (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())) age -= 1;
    if (!Number.isFinite(age)) age = 20;
    const ageBand = Math.min(70, Math.max(20, Math.floor(age / 10) * 10));
    const ageLabel = ageBand === 70 ? "70대 이상" : `${ageBand}대`;
    const height = Number($("#height")?.value || 0);
    const weight = Number($("#weight")?.value || 0);
    const bmi = height && weight ? weight / ((height / 100) ** 2) : null;
    const clamp = (minimum, value, maximum) => Math.min(maximum, Math.max(minimum, value));
    const heightScale = height ? clamp(0.93, 1 + ((height - 165) * 0.0025), 1.06) : 1;
    const widthScale = bmi ? clamp(0.90, 0.98 + ((bmi - 22) * 0.009), 1.13) : 1;
    avatar.src = `/static/assets/lifestyle-avatar-${isMale ? "male" : "female"}-${ageBand}.webp`;
    avatar.alt = `${isMale ? "남성형" : "여성형"} ${ageLabel} 3D 생활습관 안내 캐릭터 전신`;
    avatar.style.setProperty("--avatar-width-scale", widthScale.toFixed(3));
    avatar.style.setProperty("--avatar-height-scale", heightScale.toFixed(3));
    $("#avatar-profile-summary").textContent = height && bmi
      ? `만 ${age}세 · ${height}cm · BMI ${bmi.toFixed(1)} 입력값을 반영한 참고 표현`
      : "키·몸무게를 입력하면 캐릭터 비율에 참고 반영됩니다.";
  }
  window.lifestyleMapView?.refresh();
}

function updateLifestyleMap(topic) {
  window.lifestyleMapView?.select(topic);
}

function lifestyleMapSnapshot() {
  const saved = state.healthCheckupHistory?.[0] || state.healthCheckupResult || {};
  return {
    owner: state.token,
    health: saved,
    medicalGuidance: requiresMedicalResultGuidance(),
    challenges: state.cycle?.user_challenges || [],
    catalog: [...state.challengeCatalog, ...fallbackChallenges, ...localNotionChallenges],
    completed: state.dailyCompleted,
    dailyStatus: state.dailyRecordsStatus,
    report: state.lifestyleReport?.owner === state.token && state.lifestyleReport?.cycle === state.cycle ? state.lifestyleReport.data : null,
    reportStatus: state.lifestyleReportStatus,
    preview: isLocalPreview(),
  };
}
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const authenticatedRequest = Boolean(state.token) && !path.startsWith("/auth/");
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let response;
  try {
    response = await fetch(`/api/v1${path}`, { ...options, headers });
  } catch (error) {
    throw new ApiError("서버에 연결할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.", {
      code: "NETWORK_ERROR",
      retryable: true,
      details: error,
    });
  }
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const detail = payload.detail;
    const validationMessage = Array.isArray(detail)
      ? detail.map((item) => `${item.loc?.slice(1).join(".") || "입력값"}: ${item.msg}`).join(" / ")
      : null;
    const message = typeof detail === "string" ? detail : validationMessage || detail?.message || payload.error?.message;
    const fallbackCode = fallbackApiErrorCode(response.status);
    const resolvedCode = normalizeModelErrorCode(detail?.error_code || payload.error_code || payload.error?.code || detail?.code || payload.code || fallbackCode);
    const apiError = new ApiError(message || fallbackApiErrorMessage(resolvedCode), {
      code: resolvedCode,
      status: response.status,
      retryable: detail?.retryable ?? payload.retryable ?? payload.error?.retryable ?? response.status >= 500,
      retryAfterSeconds: detail?.retry_after_seconds ?? payload.retry_after_seconds ?? payload.error?.retry_after_seconds,
      details: Array.isArray(detail) ? detail : null,
    });
    if (response.status === 401 && authenticatedRequest && !state.accountRecovery) beginSessionRecovery();
    throw apiError;
  }
  return payload.data ?? payload;
}
async function pollPrediction(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 35000) {
    const job = await api(`/prediction-jobs/${jobId}`);
    if (job.status === "queued") renderPredictionStatus("queued");
    if (job.status === "running") renderPredictionStatus("running");
    if (job.status === "succeeded") {
      if (!job.prediction_id) {
        throw new ApiError("완료된 분석 결과 번호를 받지 못했습니다.", {
          code: "MISSING_PREDICTION_ID",
          retryable: true,
        });
      }
      state.developmentPreviewRiskCategory = isDemoEnvironment()
        ? normalizeForecastSignal(job.development_preview_risk_category)
        : null;
      return job.prediction_id;
    }
    if (job.status === "failed") {
      const error = new Error(job.error_message || "분석 작업을 완료하지 못했습니다.");
      error.code = normalizeModelErrorCode(job.error_code || "INFERENCE_FAILED");
      error.retryable = job.retryable;
      error.retryAfterSeconds = job.retry_after_seconds;
      throw error;
    }
    await sleep(1000);
  }
  const error = new Error("상태 확인 시간이 초과되었습니다. 작업 이력에서 다시 확인해 주세요.");
  error.code = "TIMEOUT";
  error.retryable = true;
  error.retryAfterSeconds = 30;
  throw error;
}


function normalizeForecastSignal(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["low", "낮음"].includes(normalized)) return "low";
  if (["caution", "moderate", "medium", "주의", "보통"].includes(normalized)) return "moderate";
  if (["high", "높음", "위험"].includes(normalized)) return "high";
  return null;
}

function forecastSignalLabel(level) {
  return { low: "낮음", moderate: "주의", high: "높음" }[level] || "결과 준비 중";
}

function selectTwoYearForecastPoint(prediction = {}, fallbackLevel = null) {
  const points = Array.isArray(prediction?.age_risk_forecast?.points)
    ? prediction.age_risk_forecast.points
    : [];
  const point = points.find((item) => (
    Number(item?.years_from_now) === 2
    || /^\s*(?:약\s*)?2\s*년/.test(String(item?.display_label || item?.horizon_label || ""))
  ));
  const level = normalizeForecastSignal(point?.signal_level || point?.risk_category || fallbackLevel);
  if (!level) return null;
  return {
    label: String(point?.display_label || point?.horizon_label || "약 2년 후").trim(),
    level,
  };
}

function renderTwoYearRiskForecast(prediction = {}, options = {}) {
  const chart = $("#future-risk-visual");
  const pointContainer = $("#future-risk-points");
  const stateBox = $("#forecast-state");
  const statusBadge = $("#forecast-status-badge");
  if (!chart || !pointContainer || !stateBox || !statusBadge) return;
  const resolvedPoint = options.canDisplayRisk
    ? selectTwoYearForecastPoint(prediction, options.fallbackLevel)
    : null;
  const point = resolvedPoint;
  const hasPoint = Boolean(point);
  chart.hidden = Boolean(options.failed);
  stateBox.hidden = !options.failed;
  pointContainer.replaceChildren();
  if (!hasPoint) {
    if (!options.failed) {
      const item = document.createElement("div");
      item.className = "age-risk-point";
      const track = document.createElement("span");
      track.className = "age-risk-signal-track";
      track.dataset.level = "pending";
      track.setAttribute("aria-hidden", "true");
      const label = document.createElement("small");
      label.textContent = "약 2년 후";
      item.append(track, label);
      pointContainer.append(item);
    }
    stateBox.dataset.state = options.failed ? "unavailable" : "loading";
    $("#forecast-state-title").textContent = options.failed
      ? "미래 신규 발병 위험 분석을 완료하지 못했습니다"
      : "2년 위험 전망 결과를 준비하고 있어요";
    $("#forecast-state-message").textContent = options.failed
      ? "실패한 분석만 다시 시도하면 이어서 확인할 수 있어요."
      : "공개 가능한 결과가 도착하면 그래프에 표시합니다.";
    statusBadge.textContent = options.failed ? "분석 실패" : "결과 준비 중";
    statusBadge.dataset.status = options.failed ? "failed" : "pending";
    chart.setAttribute("aria-label", options.failed
      ? "약 2년 뒤 위험 신호 전망 그래프: 분석 실패"
      : "약 2년 뒤 위험 신호 전망 그래프: 결과 준비 중");
    return;
  }
  const item = document.createElement("div");
  item.className = "age-risk-point";
  const value = document.createElement("strong");
  value.textContent = forecastSignalLabel(point.level);
  const track = document.createElement("span");
  track.className = "age-risk-signal-track";
  track.dataset.level = point.level;
  track.setAttribute("aria-hidden", "true");
  const marker = document.createElement("img");
  const assetLevel = point.level === "moderate" ? "caution" : point.level;
  marker.src = `/static/assets/hyeoldangi-face-${assetLevel}.png`;
  marker.alt = "";
  track.append(marker);
  const label = document.createElement("small");
  label.textContent = point.label;
  item.append(value, track, label);
  pointContainer.append(item);
  statusBadge.textContent = options.preview ? "화면 확인용 예시" : "승인된 결과";
  statusBadge.dataset.status = options.preview ? "preview" : "approved";
  chart.setAttribute("aria-label", `약 2년 뒤 당뇨병 위험 신호 전망. ${point.label} ${forecastSignalLabel(point.level)}`);
}



function renderPrediction(prediction, factors, currentFactors = null) {
  rememberModelOutputMetadata(prediction, "prediction");
  const isApprovedRisk = isPublicRiskDisplayAllowed(prediction);
  const developmentPreviewRisk = isDemoEnvironment()
    ? normalizeForecastSignal(
      prediction?.preview_only === true
        ? prediction.preview_signal_level
        : state.developmentPreviewRiskCategory,
    )
    : null;
  const canDisplayRisk = isApprovedRisk || Boolean(developmentPreviewRisk);
  const displayPrediction = developmentPreviewRisk
    ? { ...prediction, risk_category: developmentPreviewRisk, risk_category_label: riskCategoryLabels[developmentPreviewRisk] }
    : prediction;
  const hasApprovedExplanation = isApprovedRisk
    && factors?.status === "approved"
    && factors?.shap_claimed === true;
  const hasApprovedCurrentExplanation = isPublicRiskDisplayAllowed(state.currentScreeningPrediction)
    && currentFactors?.status === "approved"
    && currentFactors?.shap_claimed === true;
  renderPredictionStatus("succeeded", { resultAvailable: canDisplayRisk, showResult: true });
  $("#probability-policy").querySelector("p").textContent = isApprovedRisk
    ? "결과는 당뇨병 진단이나 치료 판단을 대신하지 않습니다."
    : developmentPreviewRisk
      ? "개발 확인용 위험 범주만 표시합니다. 숫자 점수·확률·위험요인은 표시하지 않습니다."
    : "검증 전 확률·개선율은 표시하지 않습니다. 승인 전에는 숫자 점수와 내부 모델값도 표시하지 않습니다.";
  renderXaiExplanationLists(factors, {
    approved: hasApprovedExplanation,
    currentFactors,
    currentApproved: hasApprovedCurrentExplanation,
  });
  $("#risk-confirm-card").hidden = false;
  $("#risk-preview-controls").hidden = !isDemoEnvironment();
  $("#result-unavailable").hidden = true;
  $("#development-preview-notice").hidden = true;
  $("#medical-guidance-detail").hidden = true;
  // A future-model result must never populate the current-screening traffic light.
  const futureRiskLabel = canDisplayRisk
    ? `${developmentPreviewRisk ? "화면 확인용 · " : ""}${forecastSignalLabel(normalizeRiskKey(displayPrediction))}`
    : "결과 준비 중";
  $("#future-risk-category").textContent = futureRiskLabel;
  renderTwoYearRiskForecast(prediction, {
    canDisplayRisk,
    fallbackLevel: normalizeRiskKey(displayPrediction),
    preview: Boolean(developmentPreviewRisk),
  });
  updateResultConfirmation();
  updateLifestyleSummary();
  $("#analysis-failure").hidden = true;
  $("#retry-analysis").hidden = true;
}

function factorDirectionLabel(item = {}) {
  const raw = String(item.direction || item.effect_direction || item.impact_direction || "").toLowerCase();
  if (["increase", "increased", "risk_up", "higher", "positive"].includes(raw)) return "주의 요인 · 당뇨 위험을 높인 방향";
  if (["decrease", "decreased", "risk_down", "lower", "negative"].includes(raw)) return "긍정 요인 · 당뇨 위험을 낮춘 방향";
  return "";
}

function factorModifiableLabel(item = {}) {
  if (item.modifiable === true || item.is_modifiable === true || item.changeable === true) return "바꿀 수 있는 요인";
  if (item.modifiable === false || item.is_modifiable === false || item.changeable === false) return "참고 요인";
  return "";
}

function factorIdentity(item = {}) {
  return String(item.feature || item.feature_name || item.factor_name || item.name || item.display_name || "")
    .replace(/\s*\(화면 예시\)\s*$/u, "")
    .trim()
    .toLowerCase();
}

function renderFactorItems(items = []) {
  return items.map((item) => {
    const factorName = item.display_name || item.factor_name || item.name || "확인된 신호";
    const factorDescription = item.message || item.description || item.guidance || "검증된 설명만 표시합니다.";
    const direction = factorDirectionLabel(item);
    const caution = direction.startsWith("주의 요인");
    const icon = caution ? "xai-arrow-up.svg" : "xai-arrow-down.svg";
    const meta = direction
      ? `<small class="xai-factor-meta"><span class="xai-factor-direction ${caution ? "is-caution" : "is-positive"}">${escapeHtml(direction)}</span></small>`
      : "";
    return `<li><img class="xai-direction-icon" src="/static/assets/${icon}" alt="" aria-hidden="true"><div><strong>${escapeHtml(factorName)}</strong>${meta}<p>${escapeHtml(factorDescription)}</p></div></li>`;
  }).join("");
}

function selectXaiFactors(items, elevated) {
  if (typeof elevated !== "boolean") return [];
  const sorted = [...items].filter(item => item.contribution === undefined
    || (typeof item.contribution === "number" && Number.isFinite(item.contribution)
      && Math.abs(item.contribution) > 1e-10))
    .sort((a, b) => Math.abs(b.contribution || 0) - Math.abs(a.contribution || 0));
  const positive = sorted.filter(item => factorDirectionLabel(item).startsWith("긍정 요인"));
  const caution = sorted.filter(item => factorDirectionLabel(item).startsWith("주의 요인"));
  return elevated ? [...caution.slice(0, 2), ...positive.slice(0, 1)]
    : [...positive.slice(0, 2), ...caution.slice(0, 1)];
}

function renderXaiExplanationLists(
  factors,
  { approved = false, currentFactors = null, currentApproved = false } = {},
) {
  const currentList = $("#current-factor-list");
  const currentSignal = state.currentScreeningPrediction?.screening_signal_detected;
  const currentItems = selectXaiFactors(
    Array.isArray(currentFactors?.items) ? currentFactors.items : [], currentSignal,
  );
  const futureList = $("#factor-list");
  const currentReady = Boolean(currentApproved && currentFactors?.display_allowed === true && currentItems.length);
  const currentTitle = $("#current-factor-title");
  if (currentTitle) currentTitle.textContent = currentReady ? "현재 위험 신호 설명" : "현재 건강 신호 XAI 연결 대기";
  if (currentList) {
    currentList.closest?.(".result-xai-card")?.classList.toggle("xai-ready", currentReady);
    currentList.innerHTML = currentApproved && currentFactors?.display_allowed === true && currentItems.length
      ? renderFactorItems(currentItems)
      : `<li><strong>현재 건강 신호 XAI 연결 대기</strong><p>${escapeHtml(currentFactors?.message || "검증된 설명 결과가 제공되기 전까지 임의 요인을 표시하지 않습니다.")}</p></li>`;
  }
  const futureCategory = normalizeRiskKey({ risk_category: state.prediction?.risk_category });
  const currentDirections = new Map(currentItems.map(item => [factorIdentity(item), factorDirectionLabel(item)]));
  const futureCandidates = (Array.isArray(factors?.items) ? factors.items : []).filter((item) => {
    const currentDirection = currentDirections.get(factorIdentity(item));
    return !currentDirection || currentDirection === factorDirectionLabel(item);
  });
  const factorItems = selectXaiFactors(futureCandidates,
    ["low", "moderate", "high"].includes(futureCategory) ? futureCategory !== "low" : null);
  if (!futureList) return;
  const futureReady = Boolean(approved && factors?.display_allowed === true && factorItems.length);
  const futureTitle = $("#future-factor-title");
  if (futureTitle) futureTitle.textContent = futureReady ? "미래 당뇨 위험 설명" : "미래 위험 XAI 연결 대기";
  futureList.closest?.(".result-xai-card")?.classList.toggle("xai-ready", futureReady);
  futureList.innerHTML = approved && factors?.display_allowed === true && factorItems.length
    ? renderFactorItems(factorItems)
    : `<li><strong>미래 위험 XAI 연결 대기</strong><p>${escapeHtml(factors?.message || "검증된 설명 결과가 제공되기 전까지 임의 요인을 표시하지 않습니다.")}</p></li>`;
}
async function requestPredictionModel(modelKey) {
  if (!["diabetes_current_screening", "diabetes_incidence"].includes(modelKey)) {
    throw new Error("이번 서비스에서 지원하지 않는 예측 모델입니다.");
  }
  const requestBody = {
    checkup_id: state.checkupId,
    model_key: modelKey,
  };
  if (modelKey === "diabetes_current_screening" && state.currentScreeningInputId) {
    requestBody.current_screening_input_id = state.currentScreeningInputId;
  }
  const job = await api("/prediction-jobs", { method: "POST", body: JSON.stringify(requestBody) });
  rememberModelOutputMetadata(job, modelKey);
  renderPredictionStatus(job.status === "running" ? "running" : "queued");
  const predictionId = await pollPrediction(job.job_id);
  const prediction = await api(`/predictions/${predictionId}`);
  rememberModelOutputMetadata(prediction, modelKey);
  return { predictionId, prediction };
}

async function openResultStepAfterSuccessfulAnalysis(isCurrent = () => true) {
  await sleep(1200);
  if (isCurrent() && state.step === 5) showStep(6);
}

function analysisInputKey() {
  return JSON.stringify([state.token, state.checkupId, state.currentScreeningInputId,
    state.currentHealthOnly, state.capabilities.currentHealth]);
}

function renderPartialAnalysisNotice(run) {
  const failedModels = Object.entries(run?.models || {})
    .filter(([, result]) => result.status === "failed");
  const hasFactorFailure = Boolean(run?.factorsError || run?.currentFactorsError);
  const panel = $("#partial-analysis-notice");
  panel.hidden = failedModels.length === 0 && !hasFactorFailure;
  if (panel.hidden) {
    $("#partial-analysis-message").textContent = "";
    return;
  }
  const modelNames = failedModels.map(([key]) => (
    key === "diabetes_current_screening" ? "현재 건강 신호" : "미래 위험"
  ));
  const parts = [];
  if (modelNames.length) {
    parts.push(`${modelNames.join("·")} 결과를 확인하지 못했어요`);
  }
  if (hasFactorFailure) parts.push("확인된 결과는 유지되지만 설명 요인을 불러오지 못했어요");
  $("#partial-analysis-message").textContent = `${parts.join(". ")}. 잠시 후 다시 시도해 주세요.`;
  $("#retry-partial-analysis").textContent = modelNames.length
    ? "실패한 분석만 다시 시도하기"
    : "설명 요인 다시 불러오기";
}

function modelComparisonGuidance(currentRun, futureRun) {
  if (currentRun?.status !== "succeeded" || futureRun?.status !== "succeeded") {
    return {
      code: "MODEL_RESULT_INCOMPLETE",
      display: true,
      title: "한쪽 분석 결과만 확인됐어요",
      message: "확인된 결과만 보여드립니다. 완료하지 못한 분석은 다시 시도해 주세요.",
    };
  }
  const current = currentRun.prediction;
  const future = futureRun.prediction;
  if (!isPublicRiskDisplayAllowed(current) || !isPublicRiskDisplayAllowed(future)) {
    return { code: "MODEL_RESULT_NOT_PUBLIC", display: false };
  }
  const currentSignal = normalizeRiskKey(current) === "high";
  const futureCategory = normalizeRiskKey(future);
  if (currentSignal && futureCategory === "low") {
    return {
      code: "CURRENT_SIGNAL_FUTURE_LOW",
      display: true,
      title: "현재 신호와 미래 전망의 기준이 다릅니다",
      message: "현재 신호 확인을 우선하세요. 미래 모델의 낮음은 현재 상태를 배제하거나 진단하지 않습니다.",
    };
  }
  if (!currentSignal && ["moderate", "high"].includes(futureCategory)) {
    return {
      code: "CURRENT_LOW_FUTURE_ELEVATED",
      display: true,
      title: "현재 신호는 낮지만 미래 위험 요인이 관찰됐습니다",
      message: "현재 진단을 뜻하지 않으며 정기 검사와 생활습관 점검을 위한 선별 정보입니다.",
    };
  }
  if (currentSignal) {
    return {
      code: "BOTH_SIGNALS_ELEVATED",
      display: true,
      title: "현재 신호 확인이 우선입니다",
      message: "두 결과 모두 진단이 아니며, 현재 신호는 의료기관 검사를 통해 확인해야 합니다.",
    };
  }
  return {
    code: "BOTH_SIGNALS_LOW",
    display: true,
    title: "두 선별 결과에서 높은 신호가 관찰되지 않았습니다",
    message: "낮은 선별 결과도 당뇨병을 배제하지 않으며 정기적인 건강 확인이 필요합니다.",
  };
}

function renderModelComparisonGuidance(currentRun, futureRun) {
  const panel = $("#model-comparison-guidance");
  if (!panel) return;
  const guidance = modelComparisonGuidance(currentRun, futureRun);
  panel.dataset.code = guidance.code;
  panel.hidden = !guidance.display;
  if (!guidance.display) return;
  $("#model-comparison-title").textContent = guidance.title;
  $("#model-comparison-message").textContent = guidance.message;
}

async function runPrediction({ retryFailed = false } = {}) {
  const key = analysisInputKey();
  if (state.analysisRun?.busy && state.analysisRun.key === key) return;
  if (retryFailed && state.step === 6) {
    $("#partial-analysis-message").textContent = "완료된 분석은 유지하고, 실패한 요청을 다시 확인하고 있습니다.";
    $("#retry-partial-analysis").textContent = "다시 확인 중…";
  } else {
    $("#partial-analysis-notice").hidden = true;
  }
  state.developmentPreviewRiskCategory = null;
  if (isLocalPreview()) {
    renderPredictionStatus("running");
    renderMvpResultPreview();
    await openResultStepAfterSuccessfulAnalysis();
    return;
  }
  const modelKeys = [
    ...(state.capabilities.currentHealth ? ["diabetes_current_screening"] : []),
    ...(!state.currentHealthOnly ? ["diabetes_incidence"] : []),
  ];
  const run = retryFailed && state.analysisRun?.key === key ? state.analysisRun : {
    key, models: Object.fromEntries(modelKeys.map(modelKey => [modelKey, { status: "pending" }])),
    factors: null, currentFactors: null, factorsError: null, currentFactorsError: null,
  };
  state.analysisRun = run;
  run.busy = true;
  const isCurrent = () => state.analysisRun === run && analysisInputKey() === key;
  $("#retry-analysis").disabled = true;
  $("#retry-partial-analysis").disabled = true;
  renderPredictionStatus("queued");
  try {
    await Promise.all(modelKeys.map(async (modelKey) => {
      if (run.models[modelKey].status === "succeeded") return;
      try {
        const result = await requestPredictionModel(modelKey);
        if (!isCurrent()) return;
        if (!result.prediction || !result.predictionId) throw Object.assign(new Error("분석 결과가 비어 있습니다."), { code: "EMPTY_RESULT" });
        run.models[modelKey] = { status: "succeeded", ...result };
      } catch (error) {
        if (!isCurrent()) return;
        run.models[modelKey] = { status: "failed", error };
      }
    }));
    if (!isCurrent()) return;
    const current = run.models.diabetes_current_screening;
    const future = run.models.diabetes_incidence;
    state.currentScreeningPredictionId = current?.predictionId || null;
    state.currentScreeningPrediction = current?.prediction || null;
    state.predictionId = (state.currentHealthOnly ? current : future)?.predictionId || null;
    state.prediction = (state.currentHealthOnly ? current : future)?.prediction || null;
    if (!Object.values(run.models).some(result => result.status === "succeeded")) {
      throw Object.values(run.models).find(result => result.error)?.error || new Error("사용 가능한 분석 모델이 없습니다.");
    }
    if (state.currentHealthOnly) {
      try {
        run.currentFactors = await api(`/predictions/${current.predictionId}/risk-factors`);
        run.currentFactorsError = null;
      } catch (error) {
        run.currentFactorsError = error;
      }
      if (!isCurrent()) return;
      renderCurrentHealthResult(state.currentScreeningPrediction || state.healthCheckupResult, { standalone: true });
      const approvedCurrentExplanation = isPublicRiskDisplayAllowed(state.currentScreeningPrediction)
        && run.currentFactors?.status === "approved"
        && run.currentFactors?.shap_claimed === true;
      renderXaiExplanationLists(null, {
        currentFactors: run.currentFactors,
        currentApproved: approvedCurrentExplanation,
      });
      renderPredictionStatus("succeeded", { resultAvailable: true, showResult: true });
      renderPartialAnalysisNotice(run);
      await openResultStepAfterSuccessfulAnalysis(isCurrent);
      return;
    }
    await Promise.all([
      current?.status === "succeeded" && !run.currentFactors
        ? api(`/predictions/${current.predictionId}/risk-factors`)
          .then(value => { run.currentFactors = value; run.currentFactorsError = null; })
          .catch(error => { run.currentFactorsError = error; })
        : Promise.resolve(),
      future?.status === "succeeded" && !run.factors
        ? api(`/predictions/${future.predictionId}/risk-factors`)
          .then(value => { run.factors = value; run.factorsError = null; })
          .catch(error => { run.factorsError = error; })
        : Promise.resolve(),
    ]);
    if (!isCurrent()) return;
    renderPrediction(future?.prediction || { display_allowed: false }, run.factors, run.currentFactors);
    if (future?.status === "failed") {
      $("#future-risk-category").textContent = "미래 신규 발병 위험 분석을 완료하지 못했습니다";
      renderTwoYearRiskForecast({}, { failed: true });
    }
    if (state.currentScreeningPrediction) {
      renderCurrentHealthResult(state.currentScreeningPrediction, { standalone: false });
    }
    renderModelComparisonGuidance(current, future);
    renderPartialAnalysisNotice(run);
    await openResultStepAfterSuccessfulAnalysis(isCurrent);
  } catch (error) {
    if (!isCurrent()) return;
    const isTimeout = error.code === "TIMEOUT";
    const isModelNotReady = error.code === "MODEL_NOT_READY";
    const failureGuidance = predictionFailureGuidance[error.code];
    renderPredictionStatus("failed", {
      errorCode: isTimeout ? "TIMEOUT" : isModelNotReady ? "MODEL_NOT_READY" : error.code,
      message: failureGuidance?.message || error.message,
    });
    if (!isModelNotReady && !failureGuidance) {
      $("#analysis-failure-title").textContent = isTimeout
        ? "분석 시간이 초과되었습니다"
        : "분석을 완료하지 못했습니다";
      $("#analysis-failure-message").textContent = isTimeout
        ? `당뇨 위험 결과를 확인하지 못했어요. 입력정보는 유지됩니다. ${error.retryAfterSeconds || 30}초 후 다시 시도해 주세요.`
        : "당뇨 위험 결과를 확인하지 못했어요. 잠시 후 같은 입력정보로 다시 시도해 주세요.";
      $("#analysis-failure").hidden = false;
    }
    $("#retry-analysis").hidden = false;
  } finally {
    run.busy = false;
    if (isCurrent()) {
      $("#retry-analysis").disabled = false;
      $("#retry-partial-analysis").disabled = false;
    }
  }
}
async function loadChallenges() {
  if (typeof challengeV3 !== "undefined") return loadV3Challenges();
  const challengeList = $("#challenge-list");
  const startButton = $("#start-challenge");
  $("#retry-challenges").hidden = true;
  challengeList.innerHTML = '<p class="empty-state" role="status">챌린지 목록을 불러오고 있어요.</p>';
  startButton.disabled = true;
  const query = state.predictionId ? `?prediction_id=${state.predictionId}` : "";
  let result;
  let catalogResult;
  if (isLocalPreview()) {
    result = { items: fallbackChallenges.slice(0, 3), personalized: false, medical_guidance_required_first: false };
    catalogResult = { items: [...fallbackChallenges, ...localNotionChallenges] };
  } else {
    try {
      [result, catalogResult] = await Promise.all([
        api(`/challenge-recommendations${query}`),
        api("/challenges"),
      ]);
    } catch (error) {
      challengeList.innerHTML = '<p class="empty-state">챌린지 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
      $("#retry-challenges").hidden = false;
      showMessage(error.message);
      return;
    }
  }
  const items = result.items || [];
  state.challengeRecommendations = items;
  state.challengeRecommendationsPersonalized = result.personalized === true;
  state.challengeCatalog = catalogResult?.items || items;
  state.selectedChallengeIds = new Set();
  state.activeChallengeCategory = null;
  closeRagChallengeGenerator();
  const followUpPanel = $("#challenge-follow-up");
  state.openFollowUpActionIds = [];
  followUpPanel.hidden = true;
  if (result.medical_guidance_required_first) {
    try {
      const followUps = await api("/follow-up-actions");
      const openActions = (followUps.items || []).filter((item) => !item.acknowledged_at);
      const openAction = openActions[0];
      state.openFollowUpActionIds = openActions.map((item) => item.action_id);
      $("#challenge-follow-up-message").textContent = openAction?.reason_code === "URGENT_MEDICAL_ATTENTION"
        ? "이전에 입력한 긴급 증상 안내를 확인한 뒤 챌린지를 시작해 주세요."
        : "이전 의료기관 안내를 확인한 뒤 챌린지를 시작해 주세요.";
      $("#acknowledge-challenge-follow-up").hidden = !state.openFollowUpActionIds.length;
    } catch (error) {
      $("#challenge-follow-up-message").textContent = error.message;
      $("#acknowledge-challenge-follow-up").hidden = true;
    }
    followUpPanel.hidden = false;
    startButton.disabled = true;
  }
  if (!items.length) {
    renderChallengeChoices();
    return;
  }
  renderChallengeChoices();
  if (!result.medical_guidance_required_first) startButton.disabled = false;
  syncWalkingLevelPicker();
}

function selectV3Challenges() {
  if (state.challengeListStatus !== "ready" || challengeV3.owner !== state.token) return;
  const personal = challengeV3.catalogVersion === "personal-v4";
  const codes = [
    personal ? $("#challenge-v4-hydration").value : "v3_hydration_choice",
    $("#challenge-v3-diet").value,
    $("#challenge-v3-activity").value,
  ];
  const domains = ["hydration", "fiber_diet", "aerobic_activity"];
  const selected = codes.map((code) => state.challengeCatalog.find((item) => item.code === code));
  if (selected.some((item, index) => item?.domain !== domains[index])
    || (!personal && selected.slice(1).some((item) => item.difficulty !== challengeV3.difficulty))) {
    state.challengeListStatus = "failed";
    updateChallengeStartState();
    showMessage("선택한 챌린지를 확인할 수 없습니다. 목록을 다시 불러와 주세요.");
    return;
  }
  state.challengeRecommendations = selected;
  state.selectedChallengeIds = new Set(selected.map((item) => Number(item.challenge_id)));
  renderChallengeChoices();
}

function readPersonalChallengePreferences(difficulty) {
  return {
    difficulty,
    focus: "balanced",
    context: $("#challenge-context").value,
    mobility: $("#challenge-mobility").value,
    sweet_drinks: $("#challenge-sweet-drinks").value,
    use_health_record: $("#challenge-use-health-record").checked,
    use_activity_history: $("#challenge-use-activity-history").checked,
  };
}

function challengeStartPayload(ids) {
  const preferences = challengeV3.preferences;
  return {
    start_date: challengeDay(),
    challenge_ids: ids,
    prediction_id: preferences ? null : state.predictionId,
    catalog_version: challengeV3.catalogVersion,
    ...(preferences || { focus: challengeV3.focus, difficulty: challengeV3.difficulty }),
  };
}

function resetPersonalChallengeControls() {
  $("#challenge-personal-mode").checked = true;
  $("#challenge-context").value = "any";
  $("#challenge-mobility").value = "unspecified";
  $("#challenge-sweet-drinks").value = "unspecified";
  $("#challenge-use-health-record").checked = false;
  $("#challenge-use-activity-history").checked = false;
  $("#challenge-v3-difficulty").value = "easy";
  $("#challenge-v4-hydration").value = "";
  $("#challenge-v3-diet").value = "";
  $("#challenge-v3-activity").value = "";
  challengeV3.rotation = 0;
}

function setChallengeChoices(select, choices, preferredCode = "") {
  const previous = select.value;
  select.innerHTML = choices.map((item) => {
    const unavailable = item.verification_type === 1 && !challengeV3.photoReviewAvailable && !challengeV3.demoPhotoSubmissionOnly;
    return `<option value="${escapeHtml(item.code)}" ${unavailable ? "disabled" : ""}>${escapeHtml(item.title)}${unavailable ? " · 사진 판별 모델 필요" : ""}</option>`;
  }).join("");
  const available = [...select.options].filter((option) => !option.disabled).map((option) => option.value);
  select.value = [preferredCode, previous, ...available].find((code) => available.includes(code)) || "";
}

function localV3Challenges(difficulty) {
  const templates = [
    ["v3_hydration_choice", "hydration", fallbackChallenges[2]],
    [`v3_wholegrain_${difficulty}`, "fiber_diet", localNotionChallenges.find((item) => item.challenge_id === 211)],
    [`v3_walk_${difficulty}`, "aerobic_activity", fallbackChallenges[0]],
    [`v3_indoor_aerobic_${difficulty}`, "aerobic_activity", { challenge_id: 225, title: "실내에서 가볍게 움직이기", daily_goal: "편한 공간에서 짧게 움직여 보기" }],
    [`v3_vegetable_${difficulty}`, "fiber_diet", localNotionChallenges.find((item) => item.challenge_id === 210)],
  ];
  return templates.map(([code, domain, item]) => ({
    ...item,
    code,
    domain,
    catalog_version: "evidence-v3",
    difficulty,
    always_include: domain === "hydration",
    verification_type: 3,
    verification_scope: "미리보기에서 간편 체크를 체험해요.",
    description: item.description || item.daily_goal,
    safety: "개인별 의료진의 안내를 우선하세요.",
  }));
}

async function loadSelectableChallenges(preferences) {
  if (preferences) {
    const recommendation = await api("/challenge-recommendations/personal", {
      method: "POST",
      body: JSON.stringify({ ...preferences, rotation: challengeV3.rotation }),
    });
    return { items: recommendation.options || [], recommendation };
  }
  const difficulty = $("#challenge-v3-difficulty").value;
  const catalogUrl = "/challenges?catalog_version=evidence-v3";
  if (isLocalPreview()) {
    // The local preview does not contain a real account for authenticated recommendations.
    return { items: localV3Challenges(difficulty), recommendation: {} };
  }
  const [catalog, recommendation] = await Promise.all([
    api(catalogUrl),
    api(`/challenge-recommendations?catalog_version=evidence-v3&focus=balanced&difficulty=${encodeURIComponent(difficulty)}`),
  ]);
  return { items: catalog.items || [], recommendation };
}

async function loadV3Challenges() {
  showChallengeSelectionView();
  const token = state.token;
  if (challengeV3.busy && challengeV3.owner === token) return;
  if ($("#challenge-form").getAttribute("aria-busy") === "true") return;
  if (challengeV3.owner !== token) resetPersonalChallengeControls();
  challengeV3.owner = token;
  challengeV3.busy = true;
  state.challengeListStatus = "loading";
  state.openFollowUpActionIds = [];
  $("#challenge-list").replaceChildren();
  const followUpPanel = $("#challenge-follow-up");
  const acknowledge = $("#acknowledge-challenge-follow-up");
  followUpPanel.hidden = true;
  acknowledge.hidden = true;
  const request = ++challengeV3.request;
  const isCurrent = () => state.token === token && challengeV3.request === request;
  const personal = !isLocalPreview() && $("#challenge-personal-mode").checked;
  $("#challenge-personal-mode-label").hidden = isLocalPreview();
  $("#challenge-context-settings").hidden = !personal;
  $("#challenge-hydration-choice").hidden = !personal;
  $("#challenge-v4-refresh").hidden = !personal;
  const controls = $$(".challenge-v3-controls input, .challenge-v3-controls select, .challenge-v3-controls button, #start-challenge");
  controls.forEach((control) => { control.disabled = true; });
  $("#retry-challenges").hidden = true;
  $("#challenge-v3-policy").textContent = "챌린지 목록을 불러오고 있어요…";
  try {
    const difficulty = $("#challenge-v3-difficulty").value;
    const preferences = personal ? readPersonalChallengePreferences(difficulty) : null;
    const { items, recommendation } = await loadSelectableChallenges(preferences);
    if (!isCurrent()) return;
    state.challengeStartSafetyBlocked = false;
    state.customChallengeSelected = false;
    if (recommendation.availability_reason) {
      state.selectedChallengeIds.clear();
      state.challengeRecommendations = [];
      state.challengeCatalog = [];
      state.challengeStartSafetyBlocked = true;
      state.challengeListStatus = "unavailable";
      $("#challenge-v3-policy").textContent = recommendation.availability_reason;
      return;
    }
    challengeV3.photoReviewAvailable = recommendation.photo_review_available === true;
    challengeV3.demoPhotoSubmissionOnly = recommendation.demo_photo_submission_only === true;
    const choicesByDomain = [
      ["hydration", "#challenge-v4-hydration"],
      ["fiber_diet", "#challenge-v3-diet"],
      ["aerobic_activity", "#challenge-v3-activity"],
    ];
    for (const [domain, selector] of choicesByDomain) {
      const choices = items.filter((item) => item.domain === domain && (personal || domain === "hydration" || item.difficulty === difficulty));
      const recommended = personal ? recommendation.items?.find((item) => item.domain === domain) : null;
      if (!choices.length || (personal && !choices.some((item) => item.code === recommended?.code))) {
        throw new Error("선택 가능한 챌린지 목록을 확인할 수 없습니다.");
      }
      if (personal || domain !== "hydration") setChallengeChoices($(selector), choices, recommended?.code);
    }
    state.challengeCatalog = items;
    challengeV3.active = true;
    challengeV3.difficulty = difficulty;
    challengeV3.catalogVersion = personal ? "personal-v4" : "evidence-v3";
    challengeV3.preferences = preferences;
    followUpPanel.hidden = !recommendation.medical_guidance_required_first;
    if (recommendation.medical_guidance_required_first) {
      $("#challenge-follow-up-message").textContent = "의료기관 안내를 먼저 확인해 주세요.";
      const actions = await api("/follow-up-actions");
      if (!isCurrent()) return;
      state.openFollowUpActionIds = (actions.items || []).filter((item) => !item.acknowledged_at).map((item) => item.action_id);
      acknowledge.hidden = !state.openFollowUpActionIds.length;
    }
    let notice = "식사 사진 판별 모델이 없어 채소 식단은 선택할 수 없습니다.";
    if (personal) {
      const policy = recommendation.policy || {};
      const updates = [policy.notice, ...(policy.adjustment_tips || [])];
      if (policy.health_record_applied) updates.push("최근 건강기록을 반영했어요.");
      if (policy.activity_history_applied) updates.push("최근 실천 기록을 반영했어요.");
      if (!recommendation.medical_guidance_required_first) {
        if (preferences.use_health_record && !policy.health_record_applied) updates.push("반영할 최근 건강기록이 없어요.");
        if (preferences.use_activity_history && !policy.activity_history_applied) updates.push("반영할 최근 실천 기록이 없어요.");
      }
      notice = updates.filter(Boolean).join(" ");
    } else if (isLocalPreview()) {
      notice = "미리보기에서 간편 체크를 체험해요.";
    } else if (challengeV3.photoReviewAvailable) {
      notice = "음료 1개와 선택한 식단·운동 각 1개가 포함됩니다.";
    } else if (challengeV3.demoPhotoSubmissionOnly) {
      notice = "미리보기에서는 채소 식단도 사진 제출과 본인 기록만 확인합니다. 채소 포함 여부는 자동 판정하지 않습니다.";
    }
    $("#challenge-v3-policy").textContent = notice;
    state.challengeListStatus = "ready";
    selectV3Challenges();
  } catch (error) {
    if (!isCurrent()) return;
    state.challengeListStatus = "failed";
    $("#challenge-v3-policy").textContent = "목록을 불러오지 못했습니다. 다시 시도해 주세요.";
    $("#retry-challenges").hidden = false;
    showMessage(error.message);
  } finally {
    if (challengeV3.request === request) {
      challengeV3.busy = false;
      if (isCurrent()) {
        controls.forEach((control) => { control.disabled = false; });
        updateChallengeStartState();
      }
    }
  }
}

function customChallengeSlot() {
  if (!state.customChallenge) {
    return `<button class="challenge-add-card" id="open-rag-challenge" type="button" aria-controls="rag-challenge-generator" aria-expanded="false">
      <b aria-hidden="true">+</b><strong>맞춤 챌린지 추가</strong><small>생활습관 자료를 바탕으로 맞춤 후보를 받아보세요.</small>
    </button>`;
  }
  return `<article class="challenge-card custom-challenge-slot">
    <label>
      <input id="custom-challenge-choice" type="checkbox" name="custom-challenge" ${state.customChallengeSelected ? "checked" : ""}>
      <span><span class="custom-challenge-icon" aria-hidden="true">+</span><div class="challenge-card-copy"><strong>${escapeHtml(state.customChallenge.title)}</strong><small>목표: ${escapeHtml(state.customChallenge.goal)}</small><em>맞춤 챌린지 · ${escapeHtml(state.customChallenge.recordLabel)}</em></div></span>
    </label>
    <button class="text-button edit-rag-challenge" type="button" aria-controls="rag-challenge-generator" aria-expanded="false">다시 선택</button>
  </article>`;
}

const ragChallengeSources = {
  kdcaDiabetes: {
    title: "질병관리청 국가건강정보포털 · 당뇨병",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=5292",
  },
  whoActivity: {
    title: "WHO · 신체활동 및 좌식 행동 지침",
    url: "https://www.who.int/publications/i/item/9789240015128",
  },
  cdcPreventT2: {
    title: "CDC · PreventT2 생활습관 교육과정",
    url: "https://www.cdc.gov/diabetes-prevention/php/lifestyle-change-resources/t2-curriculum.html",
  },
  kdcaHypertension: {
    title: "질병관리청 국가건강정보포털 · 고혈압",
    url: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=5300",
  },
};

function localRagChallengeCandidates(preference) {
  const candidates = {
    activity: [
      { id: "activity-walk", title: "식후 10분 천천히 걷기", goal: "하루 한 번 식사 후 편한 속도로 10분 걷기", reason: "짧고 구체적인 활동부터 시작하는 후보예요.", recordType: "simple", caution: "통증·어지럼·심한 호흡곤란이 생기면 즉시 중단해 주세요.", citations: [ragChallengeSources.whoActivity, ragChallengeSources.kdcaDiabetes] },
      { id: "activity-sit-less", title: "한 시간마다 가볍게 움직이기", goal: "오래 앉아 있었다면 한 시간마다 3분 동안 일어나 움직이기", reason: "앉아 있는 시간을 나누어 줄이는 후보예요.", recordType: "count", caution: "균형 잡기가 어렵다면 의자나 벽을 잡고 안전하게 움직여 주세요.", citations: [ragChallengeSources.whoActivity] },
      { id: "activity-stretch", title: "아침·저녁 5분 스트레칭", goal: "아침 또는 저녁에 무리 없는 범위에서 5분 스트레칭하기", reason: "실내에서도 부담 없이 시작할 수 있는 후보예요.", recordType: "time", caution: "반동을 주거나 통증을 참으며 자세를 유지하지 마세요.", citations: [ragChallengeSources.whoActivity, ragChallengeSources.cdcPreventT2] },
    ],
    diet: [
      { id: "diet-water", title: "단 음료 대신 물 고르기", goal: "오늘 마실 음료 중 한 번은 물이나 무가당 음료 선택하기", reason: "기존 선택 한 가지를 가볍게 바꾸는 후보예요.", recordType: "simple", caution: "의료진에게 수분 섭취 제한을 안내받았다면 그 지침을 우선해 주세요.", citations: [ragChallengeSources.kdcaDiabetes] },
      { id: "diet-vegetable", title: "한 끼에 채소 반찬 더하기", goal: "하루 한 끼에 평소 먹던 채소 반찬 한 가지 더하기", reason: "식사량을 갑자기 제한하지 않고 구성을 살피는 후보예요.", recordType: "simple", caution: "알레르기나 별도 식이 지침이 있다면 해당 식품은 선택하지 마세요.", citations: [ragChallengeSources.kdcaDiabetes, ragChallengeSources.cdcPreventT2] },
      { id: "diet-meal-log", title: "한 끼 식사 간단히 기록하기", goal: "오늘 한 끼의 음식과 식사 시간을 짧게 기록하기", reason: "평가보다 관찰을 먼저 시작하는 후보예요.", recordType: "simple", caution: "끼니를 거르거나 음식량을 과도하게 줄이는 목표로 사용하지 마세요.", citations: [ragChallengeSources.cdcPreventT2, ragChallengeSources.kdcaDiabetes] },
    ],
    tracking: [
      { id: "tracking-health", title: "오늘 건강수치 한 가지 기록하기", goal: "혈압·혈당·체중 중 확인 가능한 수치 하나 적어두기", reason: "가능한 항목 한 가지만 골라 기록하는 후보예요.", recordType: "simple", caution: "한 번의 수치만으로 상태를 진단하거나 약을 변경하지 마세요.", citations: [ragChallengeSources.kdcaHypertension, ragChallengeSources.kdcaDiabetes] },
      { id: "tracking-habit", title: "오늘 실천 한 줄 남기기", goal: "오늘 지킨 생활습관과 어려웠던 점을 한 줄로 기록하기", reason: "성공과 방해 요인을 함께 살펴보는 후보예요.", recordType: "simple", caution: "실천하지 못한 날도 실패로 단정하지 말고 다음 목표를 작게 조정해 보세요.", citations: [ragChallengeSources.cdcPreventT2] },
      { id: "tracking-pressure", title: "같은 시간에 혈압 기록하기", goal: "안정된 상태에서 안내받은 방법으로 혈압을 재고 기록하기", reason: "측정 조건을 일정하게 유지하는 후보예요.", recordType: "simple", caution: "높은 수치가 반복되거나 증상이 있으면 기록만 하지 말고 의료진과 상담해 주세요.", citations: [ragChallengeSources.kdcaHypertension] },
    ],
  };
  return candidates[preference] || candidates.activity;
}

function ragChallengeCandidateMarkup(candidate, index) {
  const citations = candidate.citations.map((citation) => {
    const url = safeExternalUrl(citation.url);
    return `<li>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(citation.title)}</a>` : escapeHtml(citation.title)}</li>`;
  }).join("");
  return `<article class="rag-challenge-candidate">
    <label class="rag-challenge-candidate-choice">
      <input type="radio" name="rag-challenge-candidate" value="${escapeHtml(candidate.id)}">
      <span class="rag-challenge-candidate-number">후보 ${index + 1}</span>
      <span class="rag-challenge-candidate-card">
        <strong class="rag-challenge-candidate-title">${escapeHtml(candidate.title)}</strong>
        <span class="rag-challenge-candidate-goal"><strong>일일 목표</strong><br>${escapeHtml(candidate.goal)}</span>
        <span class="rag-challenge-candidate-reason">${escapeHtml(candidate.reason)}</span>
        <span class="rag-challenge-meta">
          <strong>주의사항</strong>
          <span class="rag-challenge-caution">${escapeHtml(candidate.caution)}</span>
        </span>
      </span>
    </label>
    <div class="rag-challenge-source-panel"><strong>근거 및 출처</strong><ul class="rag-challenge-sources">${citations}</ul></div>
  </article>`;
}

function renderRagChallengeSelection() {
  const selected = state.ragChallengeCandidates.find((candidate) => candidate.id === state.selectedRagChallengeId) || null;
  state.ragChallengeDraft = selected;
  const summary = $("#rag-challenge-selection-summary");
  const applyButton = $("#apply-rag-challenge");
  if (!summary || !applyButton) return;
  summary.textContent = selected ? `선택됨: ${selected.title}` : "후보를 선택하면 적용할 수 있어요.";
  applyButton.disabled = !selected;
}

function closeRagChallengeGenerator({ moveFocus = false } = {}) {
  const generator = $("#rag-challenge-generator");
  if (!generator) return;
  generator.hidden = true;
  $$("#open-rag-challenge, .edit-rag-challenge").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
  if (moveFocus) $("#open-rag-challenge, .edit-rag-challenge")?.focus();
}

function renderRagChallengeState(status, candidates = state.ragChallengeCandidates) {
  state.ragChallengeStatus = status;
  const box = $("#rag-challenge-state");
  const card = $("#rag-challenge-draft");
  if (!box || !card) return;
  box.dataset.state = status;
  const copy = {
    idle: ["생성할 준비가 되었어요", "관심 방향을 고른 뒤 초안을 생성해 주세요."],
    loading: ["챌린지 후보를 만들고 있어요", "사용자 조건과 검증된 생활습관 자료를 바탕으로 생성 중입니다."],
    done: ["맞춤 챌린지 후보 3개가 준비됐어요", "목표·주의사항·출처를 비교한 뒤 한 가지를 선택해 주세요."],
    insufficient: ["추천 근거가 충분하지 않아요", "근거 없는 챌린지는 표시하지 않습니다. 관심 방향을 바꿔 다시 생성해 주세요."],
    failed: ["초안을 만들지 못했어요", "잠시 후 다시 생성해 주세요."],
  }[status] || ["생성 상태를 확인해 주세요", "다시 시도할 수 있습니다."];
  $("#rag-challenge-state-title").textContent = copy[0];
  $("#rag-challenge-state-message").textContent = copy[1];
  $("#generate-rag-challenge").hidden = status === "done";
  $("#regenerate-rag-challenge").hidden = status !== "done" && status !== "insufficient" && status !== "failed";
  card.hidden = status !== "done" || !candidates.length;
  if (status === "done" && candidates.length) {
    $("#rag-challenge-candidate-grid").innerHTML = candidates.map(ragChallengeCandidateMarkup).join("");
    renderRagChallengeSelection();
  }
}

function hasGroundedRagChallengeCandidates(candidates) {
  return Array.isArray(candidates)
    && candidates.length > 0
    && candidates.every((candidate) => (
      candidate?.id
      && candidate?.title
      && candidate?.goal
      && Array.isArray(candidate.citations)
      && candidate.citations.length > 0
    ));
}

async function generateRagChallengeDraft() {
  const releaseBusy = setButtonBusy($("#generate-rag-challenge"), "생성 중…");
  $("#regenerate-rag-challenge").disabled = true;
  renderRagChallengeState("loading");
  try {
    await sleep(500);
    state.ragChallengeCandidates = localRagChallengeCandidates($("#rag-challenge-preference").value);
    state.selectedRagChallengeId = null;
    state.ragChallengeDraft = null;
    renderRagChallengeState(
      hasGroundedRagChallengeCandidates(state.ragChallengeCandidates) ? "done" : "insufficient",
      state.ragChallengeCandidates,
    );
  } catch (error) {
    renderRagChallengeState("failed");
    showMessage(error.message || "맞춤 챌린지 초안을 만들지 못했습니다.");
  } finally {
    releaseBusy();
    $("#regenerate-rag-challenge").disabled = false;
  }
}

function renderChallengeChoices() {
  if (challengeV3.active) {
    const labels = { hydration: "음료 선택", fiber_diet: "식이섬유 중심 식사", aerobic_activity: "유산소 활동", tracking: "기록 습관" };
    const images = { hydration: "water", fiber_diet: "meal", aerobic_activity: "walking", tracking: "checkup" };
    $("#challenge-list").innerHTML = state.challengeRecommendations.map((item) => {
      const personal = item.catalog_version === "personal-v4";
      const explanation = personal ? personalChallengeDetails(item) : "";
      const level = !personal && item.always_include ? "공통 목표" : challengeLevelLabel(item.difficulty);
      let proofLabel = challengeProofLabel(item.verification_type);
      if (personal) proofLabel = "간편 체크";
      else if (item.verification_type === 1 && !challengeV3.photoReviewAvailable) proofLabel = "사진 제출 · 채소 여부는 본인 기록";
      return `<article class="challenge-v3-card" data-v3-domain="${escapeHtml(item.domain)}">
        <img src="/static/assets/hyeoldangi-challenge-${images[item.domain]}.png" alt="">
        <p class="eyebrow">${labels[item.domain]} · ${level}</p>
        <h4>${challengeCardTitle(item.title)}</h4><strong>${challengeCardGoal(item.daily_goal)}</strong>
        <p>${escapeHtml(item.description)}</p><span class="record-type-badge">${proofLabel}</span>
        ${explanation}
        <p class="challenge-v3-safety">${escapeHtml(item.safety || "")}</p>
      </article>`;
    }).join("");
    $("#challenge-category-panel").hidden = true;
    $("#walking-level-picker").hidden = true;
    updateChallengeSelectionCount();
    return;
  }
  const challengeList = $("#challenge-list");
  const emptyMessage = state.challengeCatalog.length ? "" : '<p class="empty-state">현재 선택할 수 있는 챌린지가 없습니다. 맞춤 챌린지 후보를 생성해 선택할 수 있어요.</p>';
  challengeList.innerHTML = emptyMessage + Object.entries(challengeCategories).map(([key, category]) => {
    const count = state.challengeCatalog.filter((item) => item.category === key).length;
    return `<button class="challenge-category-card ${state.activeChallengeCategory === key ? "active" : ""}" type="button" data-challenge-category="${key}" aria-pressed="${state.activeChallengeCategory === key}" aria-expanded="${state.activeChallengeCategory === key}" aria-controls="challenge-category-panel">
      <img src="${category.mascot}" alt="${category.mascotAlt}"><span class="challenge-category-copy"><strong>${category.title}</strong><small>${category.description}</small><em>${count}개 세부 목표</em></span>
    </button>`;
  }).join("") + customChallengeSlot();
  renderChallengeDetails();
  updateChallengeSelectionCount();
}

function personalChallengeDetails(item) {
  const instructions = [
    ["이럴 때 해요", item.cue],
    ["어려운 날엔", item.fallback],
    ["기록 기준", item.completion_rule],
    ["추천 이유", item.recommendation_reason],
  ].filter(([, value]) => value);
  const sourceUrl = safeExternalUrl(item.source?.url);
  const source = sourceUrl && item.source?.title
    ? `<p><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source.title)}</a></p>`
    : "";
  return `<details><summary>실천 방법과 출처</summary><dl class="challenge-action-details">${instructions.map(([label, value]) => `
    <div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>${source}</details>`;
}

function syncWalkingLevelPicker() {
  const walkingSelected = state.challengeCatalog.some((item) => state.selectedChallengeIds.has(Number(item.challenge_id)) && item.title.includes("걷"));
  $("#walking-level-picker").hidden = state.activeChallengeCategory !== "activity" || !walkingSelected;
}

function renderChallengeDetails() {
  syncWalkingLevelPicker();
  const panel = $("#challenge-category-panel");
  const category = challengeCategories[state.activeChallengeCategory];
  if (!category) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("#challenge-category-title").textContent = `${category.title} 세부 목표`;
  const recommendationIds = new Set(state.challengeRecommendations.map((item) => Number(item.challenge_id)));
  const items = state.challengeCatalog.filter((item) => item.category === state.activeChallengeCategory);
  $("#challenge-detail-list").innerHTML = items.map((item) => `<label class="challenge-detail-option">
    <input type="checkbox" name="challenge" value="${item.challenge_id}" ${state.selectedChallengeIds.has(Number(item.challenge_id)) ? "checked" : ""}>
    <span><strong>${escapeHtml(item.title)}</strong><small>목표: ${escapeHtml(item.daily_goal)}</small>${state.challengeRecommendationsPersonalized && recommendationIds.has(Number(item.challenge_id)) ? '<em>나에게 추천</em>' : ""}</span>
  </label>`).join("");
}

function updateChallengeSelectionCount() {
  const count = state.selectedChallengeIds.size + (state.customChallengeSelected ? 1 : 0);
  if ($("#challenge-selection-count")) $("#challenge-selection-count").textContent = `${count}/3 선택`;
  updateChallengeStartState();
}

function showChallengeSelectionView() {
  const form = $("#challenge-form");
  const list = $("#challenge-list");
  if (form) form.hidden = false;
  if (list) list.hidden = false;
  renderChallengeDetails();
  updateChallengeStartState();
}

function updateChallengeStartState() {
  const startButton = $("#start-challenge");
  const reason = $("#challenge-start-reason");
  const count = state.selectedChallengeIds.size + (state.customChallengeSelected ? 1 : 0);
  const followUpBlocked = $("#challenge-follow-up") && !$("#challenge-follow-up").hidden;
  const loading = state.challengeListStatus === "loading";
  const failed = state.challengeListStatus === "failed";
  if ($("#challenge-selection-count")) $("#challenge-selection-count").textContent = `${count}/3 선택`;
  if (startButton) startButton.disabled = loading || failed || followUpBlocked || count < (challengeV3.active ? 3 : 1) || state.challengeStartSafetyBlocked === true;
  if (!reason) return;
  if (loading) reason.textContent = "챌린지 후보를 불러오고 있어요.";
  else if (failed) reason.textContent = "후보를 불러오지 못했습니다. 다시 시도해 주세요.";
  else if (followUpBlocked || state.challengeStartSafetyBlocked === true) reason.textContent = "챌린지는 진단이나 치료가 아니라, 건강한 생활습관을 기록하고 점검하기 위한 기능입니다.\n무리하지 말고 몸 상태와 의료진의 지침을 우선해 주세요.";
  else if (count < (challengeV3.active ? 3 : 1)) reason.textContent = "음료·식단·운동 각 1개를 선택해 주세요.";
  else reason.textContent = `${count}개 챌린지를 선택했습니다.`;
}
function renderCycle(cycle) {
  state.cycle = cycle;
  state.dailyCompleted = new Set();
  state.dailyRecordsStatus = isLocalPreview() ? "ready" : "loading";
  $("#dashboard-cycle").textContent = `${cycle.cycle_number}회차 · 4주`;
  renderDailyRecordList();
  renderTodayTaskStatus();
  $("#barrier-challenge").innerHTML = cycle.user_challenges.map((item) => `<option value="${item.user_challenge_id}">${item.title}</option>`).join("");
}

function isServerChallengeId(id) {
  const value = Number(id);
  return Number.isInteger(value) && value > 0 && String(id).trim() === String(value);
}

function clearCurrentChallengeCycle() {
  state.cycle = null;
  state.dailyCompleted = new Set();
  state.dailyRecordFailures = new Set();
  state.dailyRecordsStatus = "ready";
  const barrierSelect = $("#barrier-challenge");
  if (barrierSelect) barrierSelect.innerHTML = "";
  renderDailyRecordList();
  renderTodayTaskStatus();
}

async function loadDailyRecords() {
  const cycle = state.cycle;
  if (!cycle || isLocalPreview()) return;
  const token = state.token;
  const request = (state.dailyRecordsRequest || 0) + 1;
  state.dailyRecordsRequest = request;
  const today = challengeDay();
  const isCurrent = () => state.cycle === cycle && state.token === token && state.dailyRecordsRequest === request;
  state.dailyRecordsStatus = "loading";
  renderDailyRecordList();
  renderTodayTaskStatus();
  try {
    const results = await Promise.all(cycle.user_challenges.filter((item) => isServerChallengeId(item.user_challenge_id)).map(async (item) => {
      const result = await api(`/user-challenges/${item.user_challenge_id}/logs?start_date=${today}&end_date=${today}`);
      if (!Array.isArray(result.items)) throw new Error("Invalid daily record response");
      return result.items.some((log) => log.log_date === today && log.is_completed === true)
        ? String(item.user_challenge_id) : null;
    }));
    if (!isCurrent()) return;
    state.dailyCompleted = new Set(results.filter((id) => id !== null));
    state.dailyRecordsStatus = "ready";
  } catch {
    if (!isCurrent()) return;
    // A failed read is not evidence that the user has no completed records.
    state.dailyRecordsStatus = "error";
  }
  renderDailyRecordList();
  renderTodayTaskStatus();
}

function renderDailyRecordList() {
  if (typeof window !== "undefined") window.lifestyleMapView?.refresh();
  const list = $("#daily-log-list");
  if (!list) return;
  const challenges = hasCurrentChallengeCycle() ? state.cycle.user_challenges : [];
  $("#daily-record-title").hidden = !challenges.length;
  $("#barrier-form").closest("section").hidden = !challenges.length;
  if (state.activeWorkspace === "challenge") {
    $("#dashboard-lead").textContent = challenges.length
      ? workspaceHeroCopy.challenge.lead : "실천할 챌린지를 선택하면 오늘의 기록을 남길 수 있어요.";
  }
  if (!challenges.length) {
    list.innerHTML = `<article class="daily-record-empty daily-record-empty-selection"><strong>기록할 챌린지가 없습니다</strong><p>챌린지를 선택하고 오늘의 실천을 시작해 보세요.</p><button type="button" class="primary daily-record-select">생활습관 챌린지 선택하기</button></article>`;
    return;
  }
  if (["loading", "error"].includes(state.dailyRecordsStatus)) {
    const failed = state.dailyRecordsStatus === "error";
    list.innerHTML = `<article class="daily-record-empty" role="status"><strong>${failed ? "오늘 기록을 불러오지 못했습니다." : "오늘 기록을 확인하고 있어요."}</strong>${failed ? '<p>저장된 기록을 다시 확인해 주세요.</p><button type="button" class="secondary daily-record-retry">다시 불러오기</button>' : ""}</article>`;
    return;
  }
  list.innerHTML = challenges.map((item) => {
    const id = String(item.user_challenge_id);
    const type = challengeRecordType(item);
    const done = state.dailyCompleted.has(id);
    const failed = state.dailyRecordFailures?.has(id);
    const presentation = type === "simple" ? simpleRecordPresentation(item) : null;
    const icon = habitRecordIcon(type === "photo" ? "photo" : presentation.kind);
    const v3 = item.catalog_version === "evidence-v3";
    let recordHint = type === "photo" ? "식사 사진을 올리거나 간편 체크로 기록해요." : "사진 없이 간편 체크로 바로 기록해요.";
    if (item.catalog_version === "personal-v4") recordHint = item.cue || item.daily_goal;
    else if (v3) recordHint = `${item.daily_goal} · ${item.verification_scope}`;
    return `<button class="daily-record-card daily-record-open ${done ? "done" : ""} ${failed ? "record-load-failed" : ""}" type="button" data-user-challenge-id="${escapeHtml(id)}" data-record-type="${type}" aria-label="${escapeHtml(item.title)} · ${done ? "오늘 기록 확인" : "기록하기"}" aria-haspopup="dialog">
      <span class="daily-record-icon" aria-hidden="true"><b>${done ? "✓" : icon}</b></span>
      <span class="daily-record-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${failed ? "이 항목의 기록 상태를 확인하지 못했어요." : done ? "오늘 실천을 기록했어요." : escapeHtml(recordHint)}</small>
        ${failed ? '<em class="record-type-badge record-error-badge">상태 확인 필요</em>' : ""}
        ${done ? '<em class="record-type-badge">오늘 기록 완료</em>' : ""}
      </span>
    </button>`;
  }).join("");
}

function createLocalDemoCycle(ids, customChallenge = null) {
  const selected = ids.map((id) => state.challengeCatalog.find((challenge) => challenge.challenge_id === id)).filter(Boolean);
  if (customChallenge) selected.push({ challenge_id: "custom", title: customChallenge.title });
  return {
    cycle_id: "local-demo-cycle",
    cycle_number: 1,
    user_challenges: selected.map((challenge, index) => ({
      ...challenge,
      user_challenge_id: `local-${index + 1}`,
    })),
  };
}

function renderTodayTaskStatus() {
  const title = $("#today-task-title");
  const description = $("#today-task-description");
  const action = $("#today-record-action");
  if (!title || !description || !action) return;
  const challenges = hasCurrentChallengeCycle() ? state.cycle.user_challenges : [];
  const selectAction = $("#today-select-challenge");
  if (selectAction) selectAction.hidden = challenges.length > 0;
  if (!challenges.length) {
    title.textContent = "아직 선택한 챌린지가 없어요";
    description.textContent = "분석을 마쳤다면 실천할 챌린지를 선택해 주세요. 선택한 뒤 오늘 기록을 시작할 수 있어요.";
    action.textContent = "오늘 기록하기";
    return;
  }
  if (challenges.length && ["loading", "error"].includes(state.dailyRecordsStatus)) {
    title.textContent = state.dailyRecordsStatus === "error" ? "오늘 기록을 다시 확인해 주세요" : "오늘 기록을 확인하고 있어요";
    description.textContent = "저장된 기록을 불러온 뒤 완료 상태를 표시합니다.";
    action.textContent = "기록 확인하기";
    return;
  }
  const completed = challenges.filter((item) => state.dailyCompleted.has(String(item.user_challenge_id))).length;
  const remaining = Math.max(0, challenges.length - completed);
  if (challenges.length && remaining === 0) {
    title.textContent = "오늘 할 일을 모두 기록했어요";
    description.textContent = "오늘의 실천이 대시보드와 주간 리포트에 반영되었습니다.";
    action.textContent = "기록 확인하기";
    return;
  }
  if (completed > 0) {
    title.textContent = `오늘 ${completed}개를 기록했어요`;
    description.textContent = `남은 ${remaining}개도 기록하거나, 실천하지 못한 이유를 남길 수 있어요.`;
    action.textContent = "이어서 기록하기";
    return;
  }
  title.textContent = "챌린지 실천을 기록해 주세요";
  description.textContent = "기록은 약 1분이면 끝납니다. 못 한 날도 이유를 남기면 다음 목표를 조정할 수 있어요.";
  action.textContent = "오늘 기록하기";
}

function healthHistoryDateLabel(value) {
  if (!value) return "날짜 미상";
  const rawDate = String(value).slice(0, 10);
  const date = new Date(`${rawDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return rawDate;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function healthHistoryValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "기록 없음";
  return `${value}${suffix}`;
}

function healthHistoryBoolean(value) {
  if (value === null || value === undefined) return "기록 없음";
  return value ? "예" : "아니요";
}

function renderHealthCheckupHistory(items = state.healthCheckupHistory) {
  const list = $("#health-history-list");
  const count = $("#health-history-count");
  const pagination = $("#health-history-pagination");
  if (!list || !count) return;
  state.healthCheckupHistory = Array.isArray(items) ? items : [];
  count.textContent = `${state.healthCheckupHistory.length}건`;
  if (!state.healthCheckupHistory.length) {
    list.innerHTML = '<p class="health-history-empty">저장된 건강정보가 없습니다.</p>';
    if (pagination) pagination.hidden = true;
    return;
  }
  const selfRatedLabels = {
    very_good: "매우 좋음",
    good: "좋음",
    fair: "보통",
    poor: "나쁨",
    very_poor: "매우 나쁨",
  };
  const filteredItems = state.healthCheckupHistory.filter((item) => {
    const date = String(item.checkup_date || item.created_at || "").slice(0, 10);
    return (!state.healthHistoryStartDate || date >= state.healthHistoryStartDate)
      && (!state.healthHistoryEndDate || date <= state.healthHistoryEndDate);
  });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  state.healthHistoryPage = Math.min(Math.max(1, state.healthHistoryPage), pageCount);
  const pageStart = (state.healthHistoryPage - 1) * pageSize;
  const pageItems = filteredItems.slice(pageStart, pageStart + pageSize);
  if (!pageItems.length) {
    list.innerHTML = '<p class="health-history-empty">선택한 기간에 저장된 건강정보가 없습니다.</p>';
  } else list.innerHTML = pageItems.map((item, index) => {
    const typeLabel = item.checkup_type === "reassessment" ? "다시 기록" : "첫 기록";
    const bloodPressure = item.systolic_bp !== null && item.systolic_bp !== undefined
      && item.diastolic_bp !== null && item.diastolic_bp !== undefined
      ? `${item.systolic_bp}/${item.diastolic_bp} mmHg`
      : "기록 없음";
    return `<details class="health-history-item" role="listitem" ${index === 0 ? "open" : ""}>
      <summary>
        <span><strong>${escapeHtml(healthHistoryDateLabel(item.checkup_date || item.created_at))}</strong><button class="health-history-edit" type="button" data-health-history-edit="${escapeHtml(item.checkup_id)}">${escapeHtml(typeLabel === "첫 기록" ? "수정" : typeLabel)}</button></span>
        ${String(item.checkup_id) === String(state.healthCheckupHistory[0]?.checkup_id) ? '<em class="health-history-latest">최신</em>' : ""}
      </summary>
      <dl class="health-history-values">
        <div><dt>키</dt><dd>${escapeHtml(healthHistoryValue(item.height_cm, " cm"))}</dd></div>
        <div><dt>체중</dt><dd>${escapeHtml(healthHistoryValue(item.weight_kg, " kg"))}</dd></div>
        <div><dt>BMI</dt><dd>${escapeHtml(healthHistoryValue(item.bmi))}</dd></div>
        <div><dt>허리둘레</dt><dd>${escapeHtml(healthHistoryValue(item.waist_cm, " cm"))}</dd></div>
        <div><dt>혈압</dt><dd>${escapeHtml(bloodPressure)}</dd></div>
        <div><dt>규칙적 운동</dt><dd>${escapeHtml(healthHistoryBoolean(item.regular_exercise))}</dd></div>
        <div><dt>현재 흡연</dt><dd>${escapeHtml(healthHistoryBoolean(item.current_smoker))}</dd></div>
        <div><dt>현재 음주</dt><dd>${escapeHtml(healthHistoryBoolean(item.current_drinker))}</dd></div>
        <div class="health-history-result-action"><button type="button" data-health-history-result="${escapeHtml(item.checkup_id)}">분석 결과 다시보기</button></div>
      </dl>
    </details>`;
  }).join("");
  if (pagination) {
    pagination.hidden = pageCount <= 1;
    pagination.innerHTML = Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1;
      return `<button type="button" data-health-history-page="${page}" aria-current="${page === state.healthHistoryPage ? "page" : "false"}">${page}</button>`;
    }).join("");
  }
}

async function loadHealthCheckupHistory(items = null) {
  if (Array.isArray(items)) {
    renderHealthCheckupHistory(items);
    return;
  }
  if (isLocalPreview()) {
    renderHealthCheckupHistory();
    return;
  }
  const list = $("#health-history-list");
  try {
    const result = await api("/health-checkups");
    renderHealthCheckupHistory(result?.items || []);
  } catch {
    state.healthCheckupHistory = [];
    $("#health-history-count").textContent = "확인 실패";
    list.innerHTML = '<p class="health-history-empty error">건강정보 기록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>';
  }
}

async function openSavedAnalysisResult(checkupId) {
  if (isLocalPreview()) {
    state.checkupId = checkupId;
    renderMvpResultPreview();
    showStep(6);
    return;
  }
  const result = await api("/predictions");
  const predictions = (result?.items || []).filter(
    (prediction) => String(prediction.checkup_id) === String(checkupId),
  );
  const current = predictions.find((prediction) => prediction.model_key === "diabetes_current_screening");
  const future = predictions.find((prediction) => prediction.model_key === "diabetes_incidence");
  if (!current && !future) throw new Error("이 건강정보에 연결된 분석 결과가 없습니다.");
  const [currentFactors, futureFactors] = await Promise.all([
    current ? api(`/predictions/${current.prediction_id}/risk-factors`).catch(() => null) : null,
    future ? api(`/predictions/${future.prediction_id}/risk-factors`).catch(() => null) : null,
  ]);
  state.checkupId = checkupId;
  state.currentScreeningPredictionId = current?.prediction_id || null;
  state.currentScreeningPrediction = current || null;
  state.predictionId = future?.prediction_id || current?.prediction_id || null;
  state.prediction = future || current;
  if (future) {
    renderPrediction(future, futureFactors, currentFactors);
    if (current) renderCurrentHealthResult(current, { standalone: false });
    renderModelComparisonGuidance(
      current ? { status: "succeeded", prediction: current } : null,
      { status: "succeeded", prediction: future },
    );
  } else {
    renderCurrentHealthResult(current, { standalone: true });
    renderXaiExplanationLists(null, {
      currentFactors,
      currentApproved: currentFactors?.status === "approved" && currentFactors?.shap_claimed === true,
    });
    renderModelComparisonGuidance({ status: "succeeded", prediction: current }, null);
  }
  showStep(6);
}

function localHealthCheckupSnapshot() {
  const height = Number($("#height").value);
  const weight = Number($("#weight").value);
  const smokingStatus = selectedRadioValue("smoking-status");
  return {
    checkup_id: `local-demo-checkup-${Date.now()}`,
    checkup_type: state.returningUser ? "reassessment" : "initial",
    checkup_date: new Date().toISOString().slice(0, 10),
    height_cm: height,
    weight_kg: weight,
    bmi: height > 0 && weight > 0 ? Number((weight / ((height / 100) ** 2)).toFixed(1)) : null,
    waist_cm: $("#waist").value ? Number($("#waist").value) : null,
    systolic_bp: $("#systolic").value ? Number($("#systolic").value) : null,
    diastolic_bp: $("#diastolic").value ? Number($("#diastolic").value) : null,
    regular_exercise: selectedRadioValue("regular-exercise") === "true",
    current_smoker: smokingStatus === "current",
    current_drinker: selectedRadioValue("current-drinker") === "true",
    current_screening_input: detailHealthPayload(),
    created_at: new Date().toISOString(),
  };
}

function renderDashboardRiskSummary(category, label) {
  const risk = ["low", "moderate", "high"].includes(category) ? category : "pending";
  const summary = $("#dashboard-risk-summary");
  const image = $("#dashboard-risk-image");
  $("#dashboard-stage").textContent = label;
  if (summary) summary.dataset.risk = risk;
  if (image) {
    const imageRisk = risk === "moderate" ? "caution" : risk === "pending" ? "low" : risk;
    image.src = `/static/assets/hyeoldangi-risk-${imageRisk}.png`;
    image.alt = risk === "pending" ? "최근 위험 범주 결과 준비 중" : `오늘이 분석 결과 ${label}`;
  }
}

function renderLocalDemoDashboard() {
  const todayResult = state.currentScreeningPrediction || state.healthCheckupResult;
  const localRisk = todayResult ? normalizeRiskKey(todayResult) : "pending";
  renderDashboardRiskSummary(localRisk, todayResult ? getRiskCategoryLabel(todayResult) : "최근 결과 없음");
  $("#dashboard-complete").textContent = `${state.dailyCompleted?.size || 0}개`;
  $("#report-week-period").textContent = "로컬 화면 확인";
  $("#report-week-streak").textContent = state.dailyCompleted.size
    ? `오늘 ${state.dailyCompleted.size}개를 기록했어요`
    : "아직 이번 주 기록이 없어요";
  renderTodayTaskStatus();
  $("#report-week-days").hidden = true;
  renderWeeklyChallengeProgress((state.cycle?.user_challenges || []).map((item) => ({
    title: item.title,
    completed: state.dailyCompleted.has(String(item.user_challenge_id)) ? 1 : 0,
    planned: 1,
  })));
  const education = localEducationContents();
  state.educationContents = education.items.map((item) => ({ ...item, medical_notice: education.medical_notice }));
  renderEducationList();
  renderHealthCheckupHistory();
  closeEducationFlow();
  $("#connection-list").innerHTML = renderTogetherEmpty("아직 연결된 가족·친구가 없습니다.", "초대 코드를 만들어 가족·친구와 챌린지 수행 상태만 공유할 수 있어요.");
}
function updateDailyRecordSummary() {
  $("#dashboard-complete").textContent = `${state.dailyCompleted.size}개`;
  renderTodayTaskStatus();
  // Today's completion must not replace the server's multi-day report totals.
}

function dailyChallengeTargetCount() {
  return Array.isArray(state.cycle?.user_challenges) ? state.cycle.user_challenges.length : 0;
}

function allDailyChallengesCompleted() {
  const required = dailyChallengeTargetCount();
  return required > 0 && state.dailyCompleted.size >= required;
}

function closeChallengeRewardDialog() {
  const dialog = $("#challenge-reward-dialog");
  if (dialog?.open) dialog.close();
}

function openChallengeRewardDialog(reward = {}) {
  const amount = Number(reward.carrot_amount) || 55;
  $("#challenge-reward-amount").textContent = `+${amount} 당근`;
  $("#challenge-reward-copy").textContent = reward.already_claimed
    ? "오늘 보상은 이미 받았어요. 숲에서 보유 당근을 확인할 수 있습니다."
    : "오늘의 실천 보상이 지급됐어요. 당근의 숲에서 확인해 보세요.";
  $("#challenge-reward-balance").textContent = Number.isFinite(Number(reward.carrot_balance))
    ? `현재 보유 당근 ${Number(reward.carrot_balance)}개`
    : "당근의 숲에서 보상을 확인할 수 있어요";
  const dialog = $("#challenge-reward-dialog");
  if (!dialog) return;
  if (dialog.showModal) dialog.showModal();
  else dialog.hidden = false;
  $("#challenge-reward-title")?.focus?.();
}

async function maybeOpenDailyReward() {
  if (!allDailyChallengesCompleted()) return;
  const today = challengeDay();
  if (isLocalPreview()) {
    openChallengeRewardDialog({ carrot_amount: 55 });
    return;
  }
  try {
    openChallengeRewardDialog(await api(`/challenge-rewards/daily/${today}`, { method: "POST" }));
  } catch (error) {
    if (error.status === 409) return showMessage("오늘 챌린지를 모두 완료하면 보상을 받을 수 있어요.");
    showMessage(error.message || "보상 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

async function completeDailyRecord(target, source = "self_report", value = 1) {
  if (!target?.id || target.completed || state.dailyCompleted.has(String(target.id))) return;
  const token = state.token;
  const cycle = state.cycle;
  if (target.item?.catalog_version === "evidence-v3" && target.item.verification_type !== 3) throw new Error("사진 제출 절차로 완료해 주세요.");
  const today = challengeDay();
  const waterServingGoal = usesWaterServingControl(target.item);
  const recordValue = waterServingGoal ? clampWaterServings(value) : 1;
  const reportsValue = ["evidence-v3", "personal-v4"].includes(target.item?.catalog_version);
  if (!isLocalPreview()) {
    await api(`/user-challenges/${target.id}/logs/${today}`, {
      method: "PUT",
      body: JSON.stringify({ is_completed: true, source, note: null, ...(reportsValue ? { value: recordValue } : {}) }),
    });
  }
  if (state.token !== token || state.cycle !== cycle) return;
  state.dailyCompleted.add(String(target.id));
  if (waterServingGoal) {
    state.waterServingsByChallenge ||= {};
    state.waterServingsByChallenge[String(target.id)] = recordValue;
  }
  renderDailyRecordList();
  updateDailyRecordSummary();
  if (!isLocalPreview()) void loadWeeklyReport().catch(() => {});
  if (allDailyChallengesCompleted()) await maybeOpenDailyReward();
  else showMessage(target.item?.domain === "hydration" ? "음료 선택 실천을 기록했어요. 당근에 물을 주었습니다! (게임 응원 문구)" : "오늘 기록을 저장했습니다.", "success");
}

async function undoDailyRecord(target) {
  if (!target?.id || target.undoPending || !state.dailyCompleted.has(String(target.id))) return false;
  const token = state.token;
  const cycle = state.cycle;
  const today = challengeDay();
  target.undoPending = true;
  try {
    if (!isLocalPreview()) {
      await api(`/user-challenges/${target.id}/logs/${today}`, {
        method: "PUT",
        body: JSON.stringify({ is_completed: false, value: null, source: "self_report", note: null }),
      });
    }
    if (state.token !== token || state.cycle !== cycle) return false;
    if (challengeDay() !== today) {
      await loadDailyRecords();
      return true;
    }
    state.dailyCompleted.delete(String(target.id));
    if (state.waterServingsByChallenge) delete state.waterServingsByChallenge[String(target.id)];
    target.completed = false;
    target.saved = false;
    renderDailyRecordList();
    updateDailyRecordSummary();
    if (!isLocalPreview()) void loadWeeklyReport().catch(() => {});
    showMessage("오늘 기록을 취소했어요. 카드를 눌러 다시 기록할 수 있어요.", "success");
    return true;
  } finally {
    target.undoPending = false;
  }
}
function closeRecordModal() {
  $("#record-modal").hidden = true;
  $("#record-simple-panel").hidden = false;
  $("#record-photo-panel").hidden = true;
  $("#water-serving-control").hidden = true;
  state.recordTarget = null;
  resetPhotoRecordModal();
}
function openSimpleRecordModal(item) {
  const completed = state.dailyCompleted.has(String(item.user_challenge_id));
  const id = String(item.user_challenge_id);
  state.recordTarget = { id, title: item.title, type: "simple", completed, item, value: (state.waterServingsByChallenge || {})[id] || item.value || 1 };
  const presentation = simpleRecordPresentation(item);
  const visual = $("#record-simple-visual");
  visual.dataset.kind = presentation.kind;
  visual.classList.toggle("completed", completed);
  $("#record-simple-icon").innerHTML = habitRecordIcon(challengeRecordType(item) === "photo" ? "photo" : presentation.kind);
  $("#record-modal").setAttribute("aria-labelledby", "record-modal-title");
  $("#record-modal-title").textContent = completed ? `${item.title}, 오늘 기록했어요` : presentation.title;
  $("#record-simple-description").textContent = completed ? "오늘의 실천이 저장되어 있어요. 잘못 기록했다면 취소할 수 있어요." : presentation.description;
  const personalPending = item.catalog_version === "personal-v4" && !completed;
  const fallback = $("#record-simple-fallback");
  const safety = $("#record-simple-safety");
  if (fallback) {
    fallback.hidden = !personalPending || !item.fallback;
    fallback.textContent = fallback.hidden ? "" : item.fallback;
  }
  if (safety) {
    safety.hidden = !personalPending || !item.safety;
    safety.textContent = safety.hidden ? "" : item.safety;
  }
  $("#confirm-simple-record").textContent = completed ? "확인" : presentation.action;
  $("#record-simple-panel .record-cancel").hidden = completed;
  $("#undo-daily-record").hidden = !completed;
  $("#undo-daily-record").disabled = false;
  $("#undo-daily-record").textContent = "오늘 기록 취소하기";
  $("#record-action-error").hidden = true;
  $("#confirm-simple-record").disabled = false;
  const waterControl = $("#water-serving-control");
  const showWaterControl = usesWaterServingControl(item);
  waterControl.hidden = !showWaterControl;
  visual.style.removeProperty("--water-level");
  if (showWaterControl) syncWaterServingControl(state.recordTarget.value);
  $("#record-simple-panel").hidden = false;
  $("#record-photo-panel").hidden = true;
  $("#record-modal").hidden = false;
  (showWaterControl && !completed ? $("#water-serving-count") : $("#confirm-simple-record")).focus({ preventScroll: true });
}
function showPhotoRecordState(stateId) {
  const titles = { "photo-state-upload": "v3-photo-heading", "photo-state-analyzing": "photo-analyzing-title", "photo-state-fail": "photo-fail-title", "photo-state-pending": "photo-pending-title", "photo-state-success": "photo-success-title" };
  $("#record-modal").setAttribute("aria-labelledby", titles[stateId]);
  ["photo-state-upload", "photo-state-analyzing", "photo-state-fail", "photo-state-pending", "photo-state-success"].forEach((id) => {
    $(`#${id}`).hidden = id !== stateId;
  });
}
function clearPhotoSelectionPreview() {
  if (state.photoPreviewObjectUrl && typeof URL !== "undefined") URL.revokeObjectURL(state.photoPreviewObjectUrl);
  state.photoPreviewObjectUrl = "";
  const preview = $("#v3-photo-preview");
  preview.hidden = true;
  preview.removeAttribute?.("src");
  $("#v3-photo-upload-icon").hidden = false;
  $("#v3-photo-upload-title").textContent = "사진 찍기 또는 앨범에서 선택";
  $("#v3-photo-change-label").hidden = true;
  $("#v3-photo-validation").textContent = "사진을 선택하면 형식·용량·해상도를 확인합니다.";
  $("#v3-photo-validation").classList.remove("error");
  $("#start-photo-check")?.classList.remove("invalid");
}
async function showPhotoSelectionPreview(file) {
  if (!file) return clearPhotoSelectionPreview();
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("JPG·PNG·WEBP 사진만 업로드할 수 있어요.");
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error("사진은 비어 있지 않은 8MB 이하 파일이어야 해요.");
  const objectUrl = URL.createObjectURL(file);
  let dimensions;
  try {
    dimensions = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("사진을 읽을 수 없어요. 다른 사진을 선택해 주세요."));
      image.src = objectUrl;
    });
    if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 12_000_000) {
      throw new Error("1200만 화소 이하 사진을 선택해 주세요.");
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  if (state.photoPreviewObjectUrl) URL.revokeObjectURL(state.photoPreviewObjectUrl);
  state.photoPreviewObjectUrl = objectUrl;
  const preview = $("#v3-photo-preview");
  preview.src = objectUrl;
  preview.hidden = false;
  $("#v3-photo-upload-icon").hidden = true;
  $("#v3-photo-upload-title").textContent = "선택한 사진";
  $("#v3-photo-change-label").hidden = false;
  $("#v3-photo-validation").textContent = `조건 확인 완료 · ${dimensions.width}×${dimensions.height}px · ${(file.size / 1024 / 1024).toFixed(1)}MB`;
  $("#v3-photo-validation").classList.remove("error");
  $("#start-photo-check")?.classList.remove("invalid");
}
function resetPhotoRecordModal() {
  state.photoAttempt = 0;
  state.photoCompletedByFallback = false;
  $("#start-photo-check")?.classList.remove("invalid");
  $("#v3-meal-count-field")?.classList.remove("invalid");
  $("#v3-photo-minutes-field")?.classList.remove("invalid");
  $("#v3-photo-validation")?.classList.remove("error");
  showPhotoRecordState("photo-state-upload");
  const vegetableReview = Number(state.recordTarget?.item?.verification_type) === 1;
  $("#photo-fail-hint").textContent = vegetableReview
    ? "밝은 곳에서 음식이 잘 보이도록 다시 찍어주세요."
    : "밝은 곳에서 인증 대상이 잘 보이도록 다시 찍어주세요.";
  $("#photo-pending-hint").textContent = "사진은 제출됐지만 아직 챌린지 완료로 처리되지 않았습니다. 잠시 후 다시 확인하거나, 더 선명한 사진으로 다시 제출해 주세요.";
  $("#photo-success-title").textContent = "확인됐어요!";
  $$(".demo-photo-card").forEach((card) => card.setAttribute("aria-pressed", "false"));
  $("#demo-photo-selection").textContent = "";
  clearPhotoSelectionPreview();
}
function openPhotoRecordModal(item) {
  if (state.dailyCompleted.has(String(item.user_challenge_id))) {
    openSimpleRecordModal(item);
    return;
  }
  state.recordTarget = { id: String(item.user_challenge_id), title: item.title, type: "photo", item };
  resetPhotoRecordModal();
  const v3 = item.catalog_version === "evidence-v3";
  const vegetableReview = v3 && Number(item.verification_type) === 1;
  $("#record-modal").setAttribute("aria-labelledby", "v3-photo-heading");
  $("#v3-photo-fields").hidden = !v3;
  $$(".v3-vegetable-only").forEach((element) => { element.hidden = !vegetableReview; });
  $("#v3-photo-file").value = "";
  $$('input[name="v3-photo-value"]').forEach((input) => { input.checked = false; });
  const usesMinutes = Boolean(item.goal.target_minutes);
  $("#v3-meal-count-field").hidden = usesMinutes;
  $("#v3-photo-minutes-field").hidden = !usesMinutes;
  $("#v3-photo-minutes").value = "";
  $("#confirm-photo-record").disabled = false;
  $("#confirm-photo-record").textContent = v3 ? "사진과 실천량 제출하기" : "사진으로 인증하기";
  $("#v3-photo-heading").textContent = v3 ? item.title : "식사 사진을 올려주세요";
  $("#v3-photo-scope").textContent = v3 ? item.verification_scope : "사진 또는 간편 체크로 기록해요.";
  $("#v3-photo-value-label").textContent = v3 ? `실제 실천한 끼니 수 (설정 목표 = ${item.goal.target_count})` : "실천량";
  $("#v3-photo-minutes-label").textContent = `실제 활동 시간 (설정 목표 = ${item.goal.target_minutes || 0}분)`;
  $$(".record-fallback").forEach((button) => { button.hidden = v3; });
  $("#record-simple-panel").hidden = true;
  $("#record-photo-panel").hidden = false;
  $("#record-modal").hidden = false;
}
function simulatePhotoAnalysis() {
  showPhotoRecordState("photo-state-analyzing");
  window.setTimeout(() => {
    if (state.photoAttempt >= 2) {
      showPhotoRecordState("photo-state-success");
      return;
    }
    state.photoAttempt += 1;
    $("#photo-fail-hint").textContent = state.photoAttempt >= 2
      ? "두 번째도 확인이 어려워요. 계속 안 되면 간편 체크로 완료해도 괜찮아요."
      : "밝은 곳에서 음식이 잘 보이도록 다시 찍어주세요.";
    showPhotoRecordState("photo-state-fail");
  }, 750);
}

async function submitV3Photo() {
  const target = state.recordTarget;
  if (target?.item?.catalog_version !== "evidence-v3" || target.submitting || target.saved) return;
  const file = $("#v3-photo-file").files[0];
  const valueText = target.item.goal.target_minutes
    ? $("#v3-photo-minutes").value
    : $('input[name="v3-photo-value"]:checked')?.value || "";
  const value = Number(valueText);
  const goal = target.item.goal.target_minutes || target.item.goal.target_count;
  const photoBox = $("#start-photo-check");
  const valueField = target.item.goal.target_minutes ? $("#v3-photo-minutes-field") : $("#v3-meal-count-field");
  const validationEl = $("#v3-photo-validation");
  const valueMissing = !valueText || !Number.isFinite(value) || value < goal || value > 720;
  photoBox?.classList.toggle("invalid", !file);
  valueField?.classList.toggle("invalid", valueMissing);
  if (!file || valueMissing) {
    validationEl.classList.add("error");
    validationEl.textContent = !file && valueMissing
      ? `사진을 제출하고 실제 실천량(목표 ${goal})을 입력해야 합니다.`
      : !file
        ? "사진을 제출해야 합니다."
        : `실제 실천량(목표 ${goal})을 입력해 주세요.`;
    validationEl.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  validationEl.classList.remove("error");
  if (file.size > 8 * 1024 * 1024) { photoBox?.classList.add("invalid"); validationEl.classList.add("error"); validationEl.textContent = "8MB 이하 사진을 선택해 주세요."; return; }
  if (isLocalPreview()) {
    showPhotoRecordState("photo-state-analyzing");
    window.setTimeout(() => {
      if (file.name === "demo-pass.png") {
        $("#photo-success-title").textContent = "인증을 통과했어요";
        showPhotoRecordState("photo-state-success");
        return;
      }
      $("#photo-fail-hint").textContent = file.name === "demo-low-vegetable.png"
        ? "음식은 확인됐지만 채소가 충분히 보이지 않아요."
        : file.name === "demo-irrelevant.png"
          ? "음식과 관련된 사진인지 확인하기 어려워요."
          : "로컬 미리보기에서는 제공된 시연 사진으로 결과를 확인해 주세요.";
      showPhotoRecordState("photo-state-fail");
    }, 300);
    return;
  }
  const token = state.token;
  const cycleId = state.cycle?.cycle_id;
  target.submitting = true;
  const releaseBusy = setButtonBusy($("#confirm-photo-record"), "사진 제출 중…");
  showPhotoRecordState("photo-state-analyzing");
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("verification_date", challengeDay());
    form.append("actual_value", String(value));
    let result = await api(`/user-challenges/${target.id}/photo-verifications`, { method: "POST", body: form });
    if (state.token !== token || state.cycle?.cycle_id !== cycleId) return;
    if (result.review_status === "needs_confirmation") {
      if (!window.confirm(result.notice || "사진이 기준을 충족했습니다. 이 결과로 챌린지를 기록할까요?")) {
        $("#photo-fail-hint").textContent = "최종 확인 전에는 챌린지가 완료되지 않습니다.";
        showPhotoRecordState("photo-state-fail");
        return;
      }
      form.set("confirmed", "true");
      result = await api(`/user-challenges/${target.id}/photo-verifications`, { method: "POST", body: form });
      if (state.token !== token || state.cycle?.cycle_id !== cycleId) return;
    }
    const reviewStatus = String(result.review_status || "").toLowerCase();
    if (reviewStatus === "needs_review" || reviewStatus === "pending" || reviewStatus === "in_review") {
      $("#photo-pending-hint").textContent = result.notice || "사진은 제출됐지만 아직 챌린지 완료로 처리되지 않았습니다. 잠시 후 다시 확인하거나, 더 선명한 사진으로 다시 제출해 주세요.";
      showPhotoRecordState("photo-state-pending");
      return;
    }
    if (result.challenge_completed !== true || reviewStatus !== "accepted") throw new Error(result.notice || "사진을 확인하지 못했습니다. 밝은 곳에서 대상이 잘 보이도록 다시 제출해 주세요.");
    state.dailyCompleted.add(target.id);
    target.saved = true;
    renderDailyRecordList();
    updateDailyRecordSummary();
    if (state.recordTarget === target) {
      $("#photo-success-title").textContent = target.item.verification_type === 1 ? "채소 사진 확인 · 기록 저장 완료" : "사진 제출 · 기록 저장 완료";
      showPhotoRecordState("photo-state-success");
    }
    showMessage(result.notice, "success");
    void loadWeeklyReport().catch(() => {});
  } catch (error) {
    if (state.recordTarget !== target || state.token !== token || state.cycle?.cycle_id !== cycleId) return;
    $("#photo-fail-hint").textContent = error.message;
    showPhotoRecordState("photo-state-fail");
  } finally {
    target.submitting = false;
    releaseBusy();
  }
}
const reportDayState = {
  completed: { label: "완료", mark: "✓" },
  not_completed: { label: "미실천", mark: "×" },
  unrecorded: { label: "미기록", mark: "-" },
  pending: { label: "진행 중", mark: "진행" },
  future: { label: "예정", mark: "예정" },
  unavailable: { label: "기록 확인 중", mark: "확인" },
};

function reportDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftReportDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return reportDateKey(date);
}

function reportWeekBounds(report = {}) {
  const asOfDate = report.period?.effective_end_date || report.period?.end_date || reportDateKey();
  const cycleStart = report.cycle?.start_date || state.cycle?.start_date || report.period?.start_date || asOfDate;
  const start = new Date(`${cycleStart}T12:00:00`);
  const asOf = new Date(`${asOfDate}T12:00:00`);
  const elapsedDays = Number.isFinite(start.getTime()) && Number.isFinite(asOf.getTime())
    ? Math.max(0, Math.floor((asOf - start) / 86400000)) : 0;
  const weekStart = shiftReportDate(cycleStart, Math.floor(elapsedDays / 7) * 7);
  return { start: weekStart, end: shiftReportDate(weekStart, 6), asOf: asOfDate };
}

function normalizeReportDay(record = {}) {
  const date = record.start_date || record.log_date || record.date;
  let status = record.status;
  if (!status) status = record.is_completed === true ? "completed" : record.is_completed === false ? "not_completed" : "unrecorded";
  if (!reportDayState[status]) status = "unrecorded";
  return { date, status };
}

function reportWeekRecords(item = {}, report = {}) {
  const source = Array.isArray(item.goal_windows) && item.goal_windows.length
    ? item.goal_windows : Array.isArray(item.daily_records) ? item.daily_records : [];
  const byDate = new Map(source.map((record) => [record.start_date || record.log_date || record.date, record]).filter(([date]) => date));
  const bounds = reportWeekBounds(report);
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftReportDate(bounds.start, index);
    const original = byDate.get(date);
    if (original) return normalizeReportDay(original);
    if (date > bounds.asOf) return { date, status: "future" };
    if (date === bounds.asOf) return { date, status: "pending" };
    if (item.detail_status === "error" || item.detail_status === "unavailable") return { date, status: "unavailable" };
    return { date, status: "unrecorded" };
  });
}

function reportDayGrid(item = {}, report = {}) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `<div class="report-week-grid">${reportWeekRecords(item, report).map((record) => {
    const date = new Date(`${record.date}T12:00:00`);
    const weekday = Number.isFinite(date.getTime()) ? weekdays[date.getDay()] : formatReportDate(record.date);
    const copy = reportDayState[record.status];
    return `<div class="report-day"><span>${escapeHtml(weekday)}</span><i class="${record.status}" role="img" aria-label="${escapeHtml(`${formatReportDate(record.date)} ${copy.label}`)}">${copy.mark}</i></div>`;
  }).join("")}</div>`;
}

function reportLegend() {
  return `<div class="report-legend" aria-label="기록 상태 범례">
    ${["completed", "not_completed", "unrecorded", "pending", "future"].map((status) => `<span><i class="${status}" aria-hidden="true">${reportDayState[status].mark}</i>${reportDayState[status].label}</span>`).join("")}
  </div>`;
}

async function enrichWeeklyReportDetails(report, owner, cycle) {
  const items = Array.isArray(report.challenge_details) ? report.challenge_details : [];
  if (!items.length || !owner || isLocalPreview()) return report;
  const bounds = reportWeekBounds(report);
  const enriched = await Promise.all(items.map(async (item) => {
    if ((Array.isArray(item.goal_windows) && item.goal_windows.length) || Array.isArray(item.daily_records)) return item;
    if (!item.user_challenge_id) return { ...item, detail_status: "unavailable" };
    try {
      const result = await api(`/user-challenges/${item.user_challenge_id}/logs?start_date=${bounds.start}&end_date=${bounds.end}`);
      if (!Array.isArray(result?.items)) throw new Error("Invalid challenge log response");
      return { ...item, daily_records: result.items, detail_status: "ready" };
    } catch {
      return { ...item, daily_records: [], detail_status: "error" };
    }
  }));
  if (state.token !== owner || state.cycle !== cycle) return report;
  return { ...report, cycle: { ...(report.cycle || {}), start_date: report.cycle?.start_date || cycle?.start_date }, challenge_details: enriched };
}

function renderWeeklyChallengeProgress(items = [], report = {}) {
  const list = $("#report-week-challenges");
  if (!list) return;
  list.classList.toggle("has-daily-detail", Boolean(items.length));
  if (!items.length) {
    list.innerHTML = `<article class="report-empty"><strong>첫 기록을 기다리고 있어요</strong><p>오늘 챌린지를 기록하면 이번 주 요약이 여기에 표시됩니다.</p></article>`;
    return;
  }
  list.innerHTML = `${reportLegend()}${items.map((item) => {
    const planned = Number(item.planned ?? item.planned_count ?? 7);
    const completed = Number(item.completed ?? item.completed_count ?? 0);
    const width = Math.max(0, Math.min(100, Math.round((completed / Math.max(1, planned)) * 100)));
    const title = item.title || item.challenge_title || "생활습관";
    const kind = title.includes("걷") ? "walking" : title.includes("식사") ? "meal" : title.includes("마시") || title.includes("물") ? "water" : title.includes("수면") ? "sleep" : title.includes("점검") ? "checkup" : "generic";
    const statusText = completed >= planned ? "이번 목표 완료" : `${planned - completed}회 남았어요`;
    const detailNotice = item.detail_status === "error" || item.detail_status === "unavailable"
      ? '<p class="report-detail-notice">일별 기록을 확인하지 못해 날짜별 상태는 ‘확인’으로 표시했어요.</p>' : "";
    return `<article class="report-progress-item report-progress-detailed ${completed >= planned ? "complete" : ""}">
      <div class="report-progress-title">
        <span class="report-progress-icon">${habitRecordIcon(kind)}</span>
        <div><strong>${escapeHtml(title)}</strong><small>${statusText}</small></div>
      </div>
      <div class="report-progress-meter">
        <div class="report-progress-bar" aria-label="${escapeHtml(title)} ${width}% 완료"><i style="width:${width}%"></i></div>
        <b>${completed}/${planned}</b>
      </div>
      ${reportDayGrid(item, report)}
      ${detailNotice}
    </article>`;
  }).join("")}<p class="report-card-note">챌린지를 시작한 요일부터 7일을 표시해요. 오늘은 ‘진행 중’, 앞으로의 날짜는 ‘예정’으로 구분합니다.</p>`;
}

function formatReportDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "";
  return `${month}/${day}`;
}

function setWeeklyReportSummary(completion = null, statusText = "기록 확인 중") {
  const completed = Number(completion?.completed);
  const planned = Number(completion?.planned);
  const rate = Number(completion?.rate);
  $("#report-week-completed").textContent = Number.isFinite(completed) ? `${completed}회` : "—";
  $("#report-week-planned").textContent = Number.isFinite(planned) ? `${planned}회` : "—";
  $("#report-week-rate").textContent = Number.isFinite(rate) ? `${rate}%` : "—";
  $$("#report-week-stats .report-summary-stat span").forEach((node, index) => {
    node.textContent = index === 2 && Number.isFinite(planned) && planned > 0 ? `완료 ${Number.isFinite(completed) ? completed : 0}/${planned}회` : statusText;
  });
}

function reportBarrierLabel(code) {
  return {
    no_time: "시간이 없었음",
    forgot: "잊어버림",
    physical_discomfort: "몸이 불편했음",
    goal_too_hard: "목표가 어려웠음",
    environment: "환경이 적합하지 않았음",
    other: "기타",
  }[code] || code;
}

function renderWeeklyReportInsights(report = null, stateName = "ready") {
  const root = $("#report-week-insights");
  if (!root) return;
  if (stateName !== "ready") {
    const title = stateName === "error" ? "요약을 불러오지 못했어요" : stateName === "empty" ? "첫 기록을 기다리고 있어요" : "기록을 모으고 있어요";
    const message = stateName === "error" ? "잠시 후 다시 시도해 주세요." : stateName === "empty" ? "오늘의 실천을 기록하면 돌아보기 내용이 표시돼요." : "저장된 기록을 바탕으로 요약을 준비하고 있어요.";
    root.innerHTML = `<article class="report-insight-card"><p class="report-overline">이번 주 돌아보기</p><h4>${title}</h4><p>${message}</p></article>`;
    return;
  }
  const best = report?.best_habit;
  const bestTitle = best?.title || "작은 기록부터 시작해 보세요";
  const bestRate = Number(best?.completion_rate);
  const barrierEntries = Object.entries(report?.barrier_summary || {}).filter(([, count]) => Number(count) > 0);
  const barrierText = barrierEntries.length
    ? barrierEntries.map(([code, count]) => `${escapeHtml(reportBarrierLabel(code))} · ${Number(count)}번`).join("<br>")
    : "기록된 어려움이 없어요";
  const nextMessage = (report?.next_adjustment?.message || "현재 목표를 이어가세요.")
    .replace("중단해도 괜찮으니 실천 가능한 한 가지부터 다시 시작해 보세요.", "").trim();
  root.innerHTML = `<article class="report-insight-card">
    <div class="report-insight-section"><p class="report-overline">잘 이어가고 있어요</p><h4>${escapeHtml(bestTitle)}</h4><p>${Number.isFinite(bestRate) ? `이번 주 완료율 ${bestRate}%를 기록했어요.` : "종료된 목표의 기록을 바탕으로 돌아봤어요."}</p></div>
    <div class="report-insight-section"><p class="report-overline">어려웠던 순간</p><h4>${barrierText}</h4><p>${barrierEntries.length ? "직접 남긴 이유만 모았어요. 나에게 맞는 시간과 목표를 살펴보세요." : "어려움이 있었다면 다음 기록에 남겨 주세요."}</p></div>
  </article>
  <article class="report-insight-card report-next-action"><h4>다음 실천</h4><p>${escapeHtml(nextMessage)}</p><button class="primary" id="report-open-record" type="button">오늘 기록하기</button></article>`;
  $("#report-open-record")?.addEventListener("click", async (event) => {
    const releaseBusy = setButtonBusy(event.currentTarget, "기록 화면 여는 중…");
    try {
      showStep(8);
      showWorkspace("challenge");
      await loadDailyRecords();
      $("#daily-log-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { showMessage(error.message); }
    finally { releaseBusy(); }
  });
}

function renderWeeklyReportMessage(title, message, retry = false) {
  $("#report-week-challenges").innerHTML = `<article class="report-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${retry ? '<button class="secondary retry-weekly-report" type="button">다시 불러오기</button>' : ""}</article>`;
}

async function loadWeeklyReport() {
  const mapOwner = state.token, mapCycle = state.cycle;
  if (isLocalPreview()) {
    const report = {
      period: { start_date: reportDateKey(), end_date: shiftReportDate(reportDateKey(), 6), effective_end_date: reportDateKey() },
      completion: { completed: 0, planned: (state.cycle?.user_challenges || []).length, completion_rate: 0 },
      challenge_details: (state.cycle?.user_challenges || []).map(item => ({ ...item, title: item.title || item.challenge_title, completed: 0, planned: 1 })),
    };
    state.lifestyleReport = { owner: mapOwner, cycle: mapCycle, data: report };
    state.lifestyleReportStatus = "ready";
    $("#report-week-period").textContent = "로컬 화면 확인";
    $("#report-week-streak").textContent = "아직 이번 주 기록이 없어요";
    setWeeklyReportSummary(report.completion, "로컬 화면 확인용");
    renderWeeklyChallengeProgress(report.challenge_details, report);
    renderWeeklyReportInsights(null, "empty");
    return;
  }
  state.lifestyleReportStatus = "loading";
  $("#report-week-period").textContent = "기간 확인 중";
  $("#report-week-streak").textContent = "이번 주 기록을 불러오고 있어요";
  $("#report-week-days").hidden = true;
  setWeeklyReportSummary();
  renderWeeklyReportInsights(null, "loading");
  renderWeeklyReportMessage("기록을 불러오고 있어요", "잠시만 기다려 주세요.");
  try {
    const report = await api("/weekly-reports/current");
    if (state.token !== mapOwner || state.cycle !== mapCycle) return;
    const detailedReport = report.status === "empty" ? report : await enrichWeeklyReportDetails(report, mapOwner, mapCycle);
    if (state.token !== mapOwner || state.cycle !== mapCycle) return;
    state.lifestyleReport = { owner: mapOwner, cycle: mapCycle, data: detailedReport };
    state.lifestyleReportStatus = "ready";
    if (typeof window !== "undefined") window.lifestyleMapView?.refresh();
    const start = formatReportDate(detailedReport.period?.start_date);
    const end = formatReportDate(detailedReport.period?.end_date);
    $("#report-week-period").textContent = start && end ? `${start}~${end}` : "이번 주";
    if (detailedReport.status === "empty") {
      $("#report-week-streak").textContent = "아직 이번 주 기록이 없어요";
      setWeeklyReportSummary({ completed: 0, planned: 0 }, "아직 기록 없음");
      renderWeeklyReportInsights(null, "empty");
      renderWeeklyReportMessage("첫 기록을 기다리고 있어요", detailedReport.message || "오늘 챌린지를 기록하면 이번 주 요약이 여기에 표시됩니다.");
      $("#report-disclaimer").textContent = detailedReport.disclaimer || "기록 변화와 수행률은 질병 위험 감소, 진단 또는 치료 효과를 의미하지 않습니다.";
      return;
    }
    $("#report-week-streak").textContent = detailedReport.record_summary || `${detailedReport.completion?.completed || 0}번 실천했어요`;
    setWeeklyReportSummary(detailedReport.completion, "이번 주 저장 기록");
    renderWeeklyReportInsights(detailedReport);
    renderWeeklyChallengeProgress(detailedReport.challenge_details || [], detailedReport);
    $("#report-disclaimer").textContent = detailedReport.disclaimer || "기록 변화와 수행률은 질병 위험 감소, 진단 또는 치료 효과를 의미하지 않습니다.";
  } catch (error) {
    $("#report-week-period").textContent = "이번 주";
    $("#report-week-streak").textContent = "리포트를 불러오지 못했어요";
    if (state.token === mapOwner && state.cycle === mapCycle) {
      state.lifestyleReport = null; state.lifestyleReportStatus = "error";
      if (typeof window !== "undefined") window.lifestyleMapView?.refresh();
    }
    setWeeklyReportSummary(null, "확인 실패");
    renderWeeklyReportInsights(null, "error");
    renderWeeklyReportMessage("주간 기록을 확인할 수 없어요", error.message || "잠시 후 다시 시도해 주세요.", true);
  }
}

function reportRangeLabel(period, fallback) {
  const start = formatReportDate(period?.start_date);
  const end = formatReportDate(period?.end_date);
  return start && end ? `${start}~${end}` : fallback;
}

function reportMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number}${suffix}` : "—";
}

function setExtendedReportSummary(period, summary = null, statusText = "기록 확인 중") {
  if (period === "four-week") {
    $("#report-four-week-days").textContent = reportMetric(summary?.practiced_days, "일");
    $("#report-four-week-completed").textContent = reportMetric(summary?.completed_count, "회");
    $("#report-four-week-rate").textContent = reportMetric(summary?.completion_rate, "%");
    $$("#report-four-week-stats .report-summary-stat span").forEach((node) => { node.textContent = statusText; });
    return;
  }
  $("#report-all-days").textContent = reportMetric(summary?.practiced_days, "일");
  $("#report-all-completed").textContent = reportMetric(summary?.completed_count, "회");
  $("#report-all-cycles").textContent = reportMetric(summary?.completed_cycles_count, "회차");
  $$("#report-all-stats .report-summary-stat span").forEach((node) => { node.textContent = statusText; });
}

function reportFrequencyLabel(value) {
  return { daily: "매일 목표", weekly: "주간 목표", unconfirmed: "목표 빈도 확인 중" }[value] || "기록";
}

function renderExtendedChallengeRows(challenges = []) {
  if (!Array.isArray(challenges) || !challenges.length) return '<p class="report-muted-copy">표시할 챌린지 기록이 없습니다.</p>';
  return challenges.map((item) => {
    const rate = Number(item.completion_rate);
    const evaluable = item.frequency !== "unconfirmed" && Number.isFinite(rate);
    const detail = evaluable
      ? `완료 ${Number(item.evaluated_completed_count || 0)}/${Number(item.evaluated_target_count || 0)}회 · 달성률 ${rate}%`
      : `저장된 기록 ${Number(item.record_count || 0)}회 · 목표 달성률은 표시하지 않음`;
    return `<article class="report-history-row"><div><strong>${escapeHtml(item.title || "생활습관 챌린지")}</strong><small>${escapeHtml(reportFrequencyLabel(item.frequency))}</small></div><p>${escapeHtml(detail)}</p></article>`;
  }).join("");
}

function clampReportDays(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(7, number)) : 0;
}

function challengeSuccessDays(item = {}) {
  const windows = Array.isArray(item.goal_windows) ? item.goal_windows : Array.isArray(item.daily_records) ? item.daily_records : [];
  if (windows.length) {
    return clampReportDays(windows.filter((entry) => {
      const status = String(entry.status || "").toLowerCase();
      return entry.is_completed === true || status === "completed" || status === "done";
    }).length);
  }
  return clampReportDays(item.practiced_days ?? item.completed_days ?? item.completed ?? item.completed_count);
}

function fourWeekBarItem({ label, range, days = 0, pending = false }) {
  const successDays = clampReportDays(days);
  const height = pending ? 0 : Math.round((successDays / 7) * 100);
  return `<li class="${pending ? "report-trend-pending" : ""}">
    <div class="report-trend-meter" aria-hidden="true"><i style="height:${height}%"></i></div>
    <strong>${escapeHtml(label)}</strong>
    <b>${pending ? "생성 예정" : `${successDays}/7일`}</b>
    <small>${escapeHtml(range || (pending ? "생성 예정" : "기간 확인 중"))}</small>
  </li>`;
}

function weeklyReportForFourWeekFallback() {
  const weekly = state.lifestyleReport?.data;
  if (!weekly && isDemoEnvironment()) {
    return {
      period: {},
      completed: 0,
      planned: 7,
      rate: 0,
      challenges: [],
    };
  }
  if (!weekly) return null;
  if (weekly.status === "empty" && !isDemoEnvironment()) return null;
  const details = Array.isArray(weekly.challenge_details) ? weekly.challenge_details : [];
  const completion = weekly.completion || {};
  const successfulDaysFromDetails = details.reduce((max, item) => Math.max(max, challengeSuccessDays(item)), 0);
  const completedFromDetails = successfulDaysFromDetails || details.reduce((sum, item) => sum + (Number(item.completed ?? item.completed_count) || 0), 0);
  const plannedFromDetails = details.reduce((sum, item) => sum + (Number(item.planned ?? item.planned_count) || 0), 0);
  const completed = clampReportDays(successfulDaysFromDetails || completion.practiced_days || completion.completed || completedFromDetails);
  const planned = Math.min(7, Math.max(1, Number(completion.planned) || plannedFromDetails || 7));
  const rate = Math.round((completed / 7) * 100);
  return {
    period: weekly.period || {},
    completed,
    planned,
    rate,
    challenges: details.map((item) => ({
      title: item.title || item.challenge_title || "생활습관 챌린지",
      frequency: "daily",
      evaluated_completed_count: Number(item.completed ?? item.completed_count) || 0,
      evaluated_target_count: Number(item.planned ?? item.planned_count) || 7,
      completion_rate: Number.isFinite(Number(item.completion_rate))
        ? Number(item.completion_rate)
        : ((Number(item.planned ?? item.planned_count) || 0) > 0
          ? Math.round(((Number(item.completed ?? item.completed_count) || 0) / Number(item.planned ?? item.planned_count)) * 100)
          : null),
    })),
  };
}

function renderFourWeekFallbackFromWeekly(report = {}) {
  const weekly = weeklyReportForFourWeekFallback();
  if (!weekly) return false;
  const completed = Number(weekly.completed) || 0;
  const rate = Number.isFinite(Number(weekly.rate)) ? Number(weekly.rate) : null;
  $("#report-four-week-period").textContent = reportRangeLabel(report.period, "이번 주부터 4주");
  $("#report-four-week-status").textContent = "이번 주 먼저 표시";
  $("#report-four-week-headline").textContent = "챌린지를 시작한 주부터 흐름을 보여드려요";
  setExtendedReportSummary("four-week", {
    practiced_days: completed,
    completed_count: completed,
    completion_rate: rate,
  }, "이번 주 저장 기록");
  const trendRows = [
    fourWeekBarItem({ label: "1주차 · 이번 주", range: reportRangeLabel(weekly.period, "이번 주"), days: completed }),
    ...[2, 3, 4].map((week) => fourWeekBarItem({ label: `${week}주차`, pending: true })),
  ].join("");
  $("#report-four-week-content").innerHTML = `<article class="report-placeholder-card report-trend-card"><h4>4주차 실천 그래프</h4><p>챌린지를 시작한 주를 1주차로 보고, 현재까지 쌓인 기록을 주차별로 보여드려요.</p><ol class="report-trend-list">${trendRows}</ol></article>
    <article class="report-placeholder-card"><h4>이번 주 챌린지 기록</h4><div class="report-history-list">${renderExtendedChallengeRows(weekly.challenges)}</div></article>`;
  return true;
}

function renderFourWeekReport(report) {
  $("#report-four-week-period").textContent = reportRangeLabel(report.period, "지난 4주");
  $("#report-four-week-status").textContent = report.period?.is_partial ? "진행 기록 포함" : "조회 완료";
  $("#report-four-week-headline").textContent = report.headline || "지난 4주의 흐름을 한눈에";
  $("#report-disclaimer").textContent = report.disclaimer || "기록 변화와 수행률은 질병 위험 감소, 진단 또는 치료 효과를 의미하지 않습니다.";
  if (report.status === "empty") {
    if (renderFourWeekFallbackFromWeekly(report)) return;
    setExtendedReportSummary("four-week", report.summary || {}, "아직 기록 없음");
    $("#report-four-week-content").innerHTML = '<article class="report-empty report-period-unavailable"><strong>아직 지난 4주 기록이 없어요</strong><p>챌린지를 시작하고 실천을 기록하면 주별 흐름이 표시됩니다.</p></article>';
    return;
  }
  setExtendedReportSummary("four-week", report.summary, "지난 4주 저장 기록");
  const buckets = Array.isArray(report.trend?.buckets) ? report.trend.buckets : [];
  if (!buckets.length && renderFourWeekFallbackFromWeekly(report)) return;
  const trendRows = buckets.length ? buckets.map((bucket, index) => {
    return fourWeekBarItem({
      label: `${index + 1}주차`,
      range: reportRangeLabel(bucket, "기간 확인 중"),
      days: bucket.practiced_days,
    });
  }).join("") : '<li class="report-muted-copy">주별 흐름이 아직 없습니다.</li>';
  $("#report-four-week-content").innerHTML = `<article class="report-placeholder-card report-trend-card"><h4>최근 4주의 실천 흐름</h4><p>달력상 기간이 아닌, 실제 챌린지 참여일과 실천일을 비교해요.</p><ol class="report-trend-list">${trendRows}</ol></article>
    <article class="report-placeholder-card"><h4>습관별로 돌아보기</h4><div class="report-history-list">${renderExtendedChallengeRows(report.challenges)}</div></article>`;
}

function renderCycleRows(cycles = [], { append = false, nextCursor = null } = {}) {
  const root = $("#report-all-content");
  if (!root) return;
  const cards = cycles.map((cycle) => {
    const titles = (cycle.selected_challenges || []).map((item) => item.title).filter(Boolean).join(" · ") || "선택한 챌린지";
    const rate = Number(cycle.completion_rate);
    return `<article class="report-cycle-card">
      <div class="report-cycle-heading"><div><small>${Number(cycle.cycle_number) ? `${Number(cycle.cycle_number)}회차` : "챌린지 회차"}</small><strong>${escapeHtml(reportRangeLabel(cycle, "기간 확인 중"))}</strong></div><span class="report-period-pill">${escapeHtml(cycle.status === "completed" ? "완료" : "진행 기록")}</span></div>
      <p>${escapeHtml(titles)}</p>
      <dl><div><dt>실천한 날</dt><dd>${reportMetric(cycle.practiced_days, "일")}</dd></div><div><dt>완료한 실천</dt><dd>${reportMetric(cycle.completed_count, "회")}</dd></div><div><dt>달성률</dt><dd>${Number.isFinite(rate) ? `${rate}%` : "평가 전"}</dd></div></dl>
    </article>`;
  }).join("");
  if (append) root.querySelector(".report-load-more")?.remove();
  else root.innerHTML = '<div class="report-cycle-list"></div>';
  const list = root.querySelector(".report-cycle-list");
  if (cards) list.insertAdjacentHTML("beforeend", cards);
  if (nextCursor !== null && nextCursor !== undefined && nextCursor !== "") {
    root.insertAdjacentHTML("beforeend", `<button class="secondary report-load-more" type="button" data-cursor="${escapeHtml(String(nextCursor))}">이전 회차 더 보기</button>`);
  }
}

function renderAllReport(report) {
  $("#report-all-period").textContent = reportRangeLabel(report.period, "전체 기간");
  $("#report-all-status").textContent = report.period?.is_partial ? "진행 기록 포함" : "조회 완료";
  $("#report-all-headline").textContent = report.headline || "나의 챌린지 여정";
  $("#report-disclaimer").textContent = report.disclaimer || "기록 변화와 수행률은 질병 위험 감소, 진단 또는 치료 효과를 의미하지 않습니다.";
  if (report.status === "empty") {
    setExtendedReportSummary("all", report.summary || {}, "아직 기록 없음");
    $("#report-all-content").innerHTML = '<article class="report-empty report-period-unavailable"><strong>아직 시작한 챌린지가 없어요</strong><p>챌린지를 시작하면 회차별 기록이 이곳에 쌓입니다.</p></article>';
    return;
  }
  setExtendedReportSummary("all", report.summary, "전체 저장 기록");
  const cycles = Array.isArray(report.cycles?.items) ? report.cycles.items : [];
  if (!cycles.length) {
    $("#report-all-content").innerHTML = '<article class="report-empty report-period-unavailable"><strong>표시할 회차가 아직 없어요</strong><p>진행 중인 기록은 요약에 포함되며, 완료된 회차부터 목록에 표시됩니다.</p></article>';
    return;
  }
  renderCycleRows(cycles, { nextCursor: report.cycles?.next_cursor });
}

function renderExtendedReportError(period, error) {
  const label = period === "four-week" ? "지난 4주" : "전체";
  const status = $(period === "four-week" ? "#report-four-week-status" : "#report-all-status");
  const root = $(period === "four-week" ? "#report-four-week-content" : "#report-all-content");
  status.textContent = "불러오기 실패";
  setExtendedReportSummary(period, null, "확인 실패");
  root.innerHTML = `<article class="report-empty report-period-unavailable"><strong>${label} 리포트를 불러오지 못했어요</strong><p>${escapeHtml(error.message || "잠시 후 다시 시도해 주세요.")}</p><button class="secondary retry-period-report" type="button" data-period="${period}">다시 불러오기</button></article>`;
}

async function loadReportPeriod(period, { force = false } = {}) {
  if (!["four-week", "all"].includes(period)) return;
  if (!force && state.reportPeriodStatus[period] === "ready") return;
  if (isLocalPreview()) {
    const report = { status: "empty", period: {}, summary: { practiced_days: 0, completed_count: 0, completed_cycles_count: 0 } };
    state.reportPeriods[period] = report;
    state.reportPeriodStatus[period] = "ready";
    if (period === "four-week") renderFourWeekReport(report);
    else renderAllReport(report);
    return;
  }
  const root = $(period === "four-week" ? "#report-four-week-content" : "#report-all-content");
  const status = $(period === "four-week" ? "#report-four-week-status" : "#report-all-status");
  state.reportPeriodStatus[period] = "loading";
  status.textContent = "불러오는 중";
  setExtendedReportSummary(period);
  root.innerHTML = '<article class="report-empty report-period-unavailable"><strong>기록을 불러오고 있어요</strong><p>잠시만 기다려 주세요.</p></article>';
  try {
    const report = await api(`/reports?period=${encodeURIComponent(period)}`);
    state.reportPeriods[period] = report;
    state.reportPeriodStatus[period] = "ready";
    if (period === "four-week") renderFourWeekReport(report);
    else renderAllReport(report);
  } catch (error) {
    if (period === "four-week" && (isDemoEnvironment() || state.token === "local-demo-token" || error.status === 404)) {
      state.reportPeriodStatus[period] = "ready";
      state.reportPeriods[period] = { status: "fallback", period: state.lifestyleReport?.data?.period || {} };
      if (renderFourWeekFallbackFromWeekly(state.reportPeriods[period])) return;
    }
    state.reportPeriodStatus[period] = "error";
    renderExtendedReportError(period, error);
  }
}

async function loadMoreReportCycles(cursor) {
  const report = state.reportPeriods.all;
  if (!report?.report_id || !cursor) return;
  const button = $("#report-all-content .report-load-more");
  const releaseBusy = button ? setButtonBusy(button, "불러오는 중…") : () => {};
  try {
    const page = await api(`/reports/${encodeURIComponent(report.report_id)}/cycles?cursor=${encodeURIComponent(cursor)}`);
    const items = Array.isArray(page?.items) ? page.items : Array.isArray(page?.cycles?.items) ? page.cycles.items : [];
    const nextCursor = page?.next_cursor ?? page?.cycles?.next_cursor ?? null;
    renderCycleRows(items, { append: true, nextCursor });
  } catch (error) {
    showMessage(error.message || "이전 회차를 불러오지 못했습니다.");
  } finally { releaseBusy(); }
}
function localEducationContents() {
  const source = { title: "CDC PreventT2 Curriculum", url: "https://www.cdc.gov/diabetes-prevention/php/lifestyle-change-resources/t2-curriculum.html" };
  return {
    medical_notice: "교육 콘텐츠는 일반 건강정보이며 진단·처방을 대신하지 않습니다.",
    items: [
      { content_id: "preview-1", week_number: 1, title: "위험 선별 결과 이해하기", summary: "예측 결과는 향후 위험을 살펴보는 건강교육 정보이며 당뇨병 진단이 아닙니다.", quiz_question: "이 서비스의 예측 결과는 당뇨병 진단인가요?", source },
      { content_id: "preview-2", week_number: 2, title: "일상에서 활동 늘리기", summary: "실천 가능한 작은 활동 목표를 정하고 기록하면서 자신에게 맞는 습관을 찾습니다.", quiz_question: "목표가 너무 어렵다면 작은 목표로 조정해도 되나요?", source },
      { content_id: "preview-3", week_number: 3, title: "식사 습관 기록하기", summary: "식사 기록을 통해 자신의 패턴을 확인하되 특정 식품을 치료법처럼 표현하지 않습니다.", quiz_question: "식사 기록만으로 당뇨병 치료 효과를 판단할 수 있나요?", source },
      { content_id: "preview-4", week_number: 4, title: "중단해도 다시 시작하기", summary: "실천하지 못한 이유를 확인하고 목표·시간·챌린지를 조정해 다시 시작합니다.", quiz_question: "하루 실패하면 4주 챌린지를 모두 포기해야 하나요?", source },
    ],
  };
}

function inferredEducationAnswer(question = "") {
  return question.includes("진단") || question.includes("치료") || question.includes("포기") ? "아니요" : "네";
}

function quizTypeLabel(value) {
  return value === "ox" ? "참·거짓" : value === "fill_in_blank" ? "빈칸 채우기" : "확인";
}

function quizOptions(question = {}) {
  if (Array.isArray(question.options) && question.options.length) return question.options.slice(0, 4);
  if (question.quiz_type === "ox") return ["참", "거짓"];
  return ["네", "아니요"];
}

function mapHealthEducationQuizzes(payload = {}) {
  const quizzes = (Array.isArray(payload.items) ? payload.items : [])
    .filter((item) => item?.quiz_id && item?.question)
    .slice(0, 20);
  const weekTitles = ["위험 선별 결과 이해하기", "생활습관 근거 확인하기", "식사·활동 실천 점검하기", "다시 시작하는 건강 루틴"];
  const groups = new Map();
  quizzes.forEach((quiz, index) => {
    const week = Number(quiz.week_number) || (index % 4) + 1;
    if (!groups.has(week)) groups.set(week, []);
    groups.get(week).push(quiz);
  });
  return {
    medical_notice: "승인된 건강자료 기반 퀴즈입니다. 일반 건강교육 정보이며 진단·처방을 대신하지 않습니다.",
    items: [...groups.entries()].sort(([a], [b]) => a - b).map(([week, items]) => {
      const first = items[0];
      const source = { title: first.source_title || "승인된 건강교육 자료", url: first.source_url || "" };
      return {
        content_id: `rag-week-${week}`,
        source_kind: "health_education_quizzes",
        week_number: week,
        locked: items.every((item) => item.locked === true),
        title: weekTitles[week - 1] || `${week}주차 건강교육`,
        summary: `${source.title} 등 승인된 자료에서 생성된 ${items.length}개 문항을 확인합니다.`,
        source,
        quiz_questions: items.map((quiz) => ({
          quizId: quiz.quiz_id,
          prompt: quiz.question,
          quiz_type: quiz.quiz_type,
          options: quiz.options,
          explanation: `${quizTypeLabel(quiz.quiz_type)} 문항입니다. 근거 자료: ${quiz.source_title || source.title}`,
          source: { title: quiz.source_title || source.title, url: quiz.source_url || source.url },
        })),
      };
    }),
  };
}

function educationQuestions(item) {
  const questions = Array.isArray(item.quiz_questions) && item.quiz_questions.length
    ? item.quiz_questions
    : [{ prompt: item.quiz_question, correct_answer: inferredEducationAnswer(item.quiz_question), explanation: item.summary }];
  return questions.filter((question) => question?.prompt).slice(0, 3).map((question) => ({
    quizId: question.quizId || question.quiz_id || null,
    prompt: question.prompt,
    quiz_type: question.quiz_type,
    options: quizOptions(question),
    correctAnswer: question.correct_answer || question.correctAnswer || (item.source_kind === "health_education_quizzes" ? null : inferredEducationAnswer(question.prompt)),
    explanation: question.explanation || item.summary,
    source: question.source || { title: question.source_title || item.source?.title, url: question.source_url || item.source?.url },
  }));
}

function renderEducationList() {
  const list = $("#education-list");
  if (!state.educationContents.length) {
    if (list) list.innerHTML = `<article class="report-empty"><strong>표시할 건강교육이 아직 없어요</strong><p>검증된 교육 자료가 준비되면 여기에 표시됩니다.</p></article>`;
    const toolsList = $("#health-tools-education-list");
    if (toolsList) toolsList.innerHTML = list?.innerHTML || `<article class="report-empty"><strong>표시할 건강교육이 아직 없어요</strong><p>검증된 교육 자료가 준비되면 여기에 표시됩니다.</p></article>`;
    return;
  }
  const educationArt = [
    ["hyeoldangi-guide.png", "#d5e8df"], ["hyeoldangi-challenge-walking.png", "#eadfc5"],
    ["hyeoldangi-challenge-meal.png", "#e5ddec"], ["hyeoldangi-cheer.png", "#d4e7ec"],
  ];
  const renderCards = (includeDetails = true) => state.educationContents.map((item) => {
    const completed = Boolean(item.completed && item.is_correct !== false);
    const locked = Boolean(item.locked);
    const questionCount = educationQuestions(item).length;
    return `<article class="education-overview-card" data-completed="${completed}">
      <div class="education-overview-heading"><strong>${escapeHtml(item.week_number)}주차 · ${escapeHtml(item.title)}</strong><span class="education-status-badge">${locked ? "준비 중" : completed ? "학습 완료" : "학습 전"}</span></div>
      ${includeDetails ? `<p>${escapeHtml(item.summary)}</p>` : ""}
      <button class="secondary education-open" type="button" data-id="${escapeHtml(item.content_id)}">${locked ? "미리 보기" : completed ? "교육 다시 보기" : `교육 보기 · ${questionCount}문항`}</button>
    </article>`;
  }).join("");
  const renderToolsQuestionCards = () => state.educationContents.flatMap((item) => {
    const completed = Boolean(item.completed && item.is_correct !== false);
    const [art, color] = educationArt[(Number(item.week_number) - 1 + educationArt.length) % educationArt.length] || educationArt[0];
    return educationQuestions(item).map((question, questionIndex) => {
      const questionNumber = questionIndex + 1;
      const targetId = `${item.content_id}__question_${questionIndex}`;
      return `<article class="education-overview-card education-question-card" data-completed="${completed}" data-content-id="${escapeHtml(targetId)}" data-week="${escapeHtml(item.week_number)}" data-question-index="${questionIndex}" style="--education-art:${color}" role="group" aria-roledescription="슬라이드" aria-label="${escapeHtml(item.week_number)}주차 문제 ${questionNumber}">
        <button class="education-card-toggle" type="button" aria-haspopup="dialog" aria-controls="education-learning-flow" aria-label="${escapeHtml(item.week_number)}주차 문제 ${questionNumber} 풀기">
          <span class="education-card-art" aria-hidden="true"><img src="/static/assets/${art}" alt="" loading="lazy" draggable="false"></span><span class="education-card-week">${escapeHtml(item.week_number)}주차 - 문제 ${questionNumber}</span>
          <span class="education-card-cover-copy"><strong>퀴즈 풀기</strong><span class="education-status-badge">${completed ? "학습 완료" : "학습 전"}</span></span>
        </button>
        <div class="education-card-details" hidden><p>${escapeHtml(question.prompt)}</p><small>${escapeHtml(quizTypeLabel(question.quiz_type))} · 근거 자료 확인 퀴즈</small></div>
      </article>`;
    });
  }).join("");
  if (list) list.innerHTML = renderCards(true);
  const toolsList = $("#health-tools-education-list");
  if (toolsList) {
    toolsList.innerHTML = renderToolsQuestionCards();
    window.healthToolsEducationCarouselView?.refresh();
  }
}

function activeEducationContent() {
  return state.educationContents.find((item) => String(item.content_id) === String(state.activeEducationId)) || null;
}

function findEducationContent(contentId) {
  const baseContentId = String(contentId || "").replace(/__question_\d+$/, "");
  const exact = state.educationContents.find((entry) => String(entry.content_id) === baseContentId);
  if (exact) return exact;
  const previewWeek = baseContentId.match(/^preview-(\d+)$/)?.[1];
  if (previewWeek) {
    return state.educationContents.find((entry) => String(entry.week_number) === previewWeek)
      || state.educationContents[Number(previewWeek) - 1]
      || null;
  }
  return null;
}

function educationQuestionIndex(targetId) {
  const value = Number(String(targetId || "").match(/__question_(\d+)$/)?.[1]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function moveEducationFlow(hostId) {
  const flow = $("#education-learning-flow");
  const host = $(hostId);
  if (flow && host && flow.parentElement !== host) host.append(flow);
}

function openEducationFlow(contentId, { questionIndex = 0, startQuiz = false } = {}) {
  const item = findEducationContent(contentId);
  if (!item) return;
  state.activeEducationId = item.content_id;
  state.educationQuizIndex = Math.max(0, Math.min(questionIndex, educationQuestions(item).length - 1));
  state.educationQuizCorrectCount = 0;
  $("#education-flow-week").textContent = `${item.week_number}주차 건강교육`;
  $("#education-flow-title").textContent = item.title;
  $("#education-flow-summary").textContent = item.summary;
  $("#education-flow-notice").textContent = item.medical_notice || "교육 콘텐츠는 일반 건강정보이며 진단·처방을 대신하지 않습니다.";
  const sourceUrl = safeExternalUrl(item.source?.url);
  const sourceLink = $("#education-flow-source");
  sourceLink.textContent = item.source?.title ? `근거: ${item.source.title}` : "근거 자료 확인";
  sourceLink.hidden = !sourceUrl;
  if (sourceUrl) sourceLink.href = sourceUrl;
  $("#education-reading-card").hidden = false;
  $("#education-quiz-form").hidden = true;
  $("#education-feedback-card").hidden = true;
  const flow = $("#education-learning-flow");
  flow.hidden = false;
  if (typeof flow.showModal === "function" && !flow.open) flow.showModal();
  if (startQuiz) renderEducationQuizQuestion();
  else flow.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  if (!startQuiz) {
    $("#education-flow-title").setAttribute("tabindex", "-1");
    $("#education-flow-title").focus({ preventScroll: true });
  }
}

function renderEducationQuizQuestion() {
  const item = activeEducationContent();
  const questions = item ? educationQuestions(item) : [];
  const question = questions[state.educationQuizIndex];
  if (!question) return;
  $("#education-reading-card").hidden = true;
  $("#education-feedback-card").hidden = true;
  const form = $("#education-quiz-form");
  form.hidden = false;
  form.reset();
  $("#education-quiz-question").textContent = question.prompt;
  form.querySelector(".education-answer-options").innerHTML = question.options.map((option) => `
    <label><input type="radio" name="education-answer" value="${escapeHtml(option)}" required><span>${escapeHtml(option)}</span></label>
  `).join("");
  $("#education-quiz-progress-text").textContent = `${state.educationQuizIndex + 1}/${questions.length} 문항`;
  $("#education-quiz-progress").max = questions.length;
  $("#education-quiz-progress").value = state.educationQuizIndex + 1;
  $("#education-quiz-question").setAttribute("tabindex", "-1");
  $("#education-quiz-question").focus();
}

function closeEducationFlow() {
  const flow = $("#education-learning-flow");
  if (flow.open && typeof flow.close === "function") flow.close();
  flow.hidden = true;
  const button = $(`.education-open[data-id="${state.activeEducationId}"]`);
  state.activeEducationId = null;
  button?.focus();
}

async function openEducationFlowFromTools(contentId) {
  moveEducationFlow("#education-flow-host-tools");
  if (!state.educationContents.length) await loadEducation();
  openEducationFlow(contentId, { questionIndex: educationQuestionIndex(contentId), startQuiz: true });
}

async function loadEducation() {
  const list = $("#education-list");
  if (list) list.innerHTML = `<article class="report-empty"><strong>건강교육을 불러오고 있어요</strong><p>잠시만 기다려 주세요.</p></article>`;
  try {
    const contents = isLocalPreview() ? localEducationContents() : mapHealthEducationQuizzes(await api("/health-education/quizzes"));
    if (!contents.items?.length) throw new Error("표시할 승인 퀴즈가 없습니다.");
    state.educationContents = (contents.items || []).map((item) => ({ ...item, medical_notice: contents.medical_notice }));
    renderEducationList();
  } catch (error) {
    const fallback = localEducationContents();
    state.educationContents = fallback.items.map((item) => ({ ...item, medical_notice: fallback.medical_notice }));
    renderEducationList();
    showMessage("건강교육을 불러오지 못했어요. 승인된 기본 자료를 표시합니다.");
  }
}
async function loadConnections() {
  const list = $("#connection-list");
  try {
    const result = await api("/connections");
    list.innerHTML = result.items.length ? result.items.map(renderTogetherMember).join("") : renderTogetherEmpty("아직 연결된 가족·친구가 없습니다.", "초대 코드를 만들어 가족·친구와 챌린지 수행 상태만 공유할 수 있어요.");
  } catch (error) {
    list.innerHTML = renderTogetherEmpty("가족·친구 목록을 불러오지 못했어요.", "잠시 후 함께하기 탭을 다시 확인해 주세요.");
  }
}

function renderTogetherEmpty(title, message) {
  return `<article class="together-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></article>`;
}

function relationLabel(value) {
  return { family: "가족", friend: "친구", guardian: "보호자" }[value] || value || "연결";
}

function renderTogetherMember(item) {
  const label = relationLabel(item.relation_type);
  const menuId = `member-menu-${item.connection_id}`;
  return `<article class="together-member">
    <div class="member-avatar" aria-hidden="true">${escapeHtml(label.slice(0, 2))}</div>
    <div>
      <strong>연결 사용자 #${item.connected_user_id}</strong>
      <p>${escapeHtml(label)} · 챌린지 수행 상태만 공유</p>
    </div>
    <span class="member-status">연결됨</span>
    <div class="member-menu-wrap">
      <button class="member-menu-button" type="button" data-member-menu="${item.connection_id}" aria-label="연결 사용자 관리 메뉴 열기" aria-expanded="false" aria-controls="${menuId}">⋮</button>
      <div class="member-menu" id="${menuId}" role="menu" hidden>
        <button class="text-button delegate-leader" data-id="${item.connection_id}" type="button" role="menuitem">그룹장 위임하기</button>
        <button class="text-button danger disconnect-connection" data-id="${item.connection_id}" type="button" role="menuitem">내보내기</button>
      </div>
    </div>
  </article>`;
}

function showWorkspace(name, { moveFocus = true } = {}) {
  $("#home-health-management").hidden = true;
  $("#open-health-management").setAttribute("aria-expanded", "false");
  state.activeWorkspace = name;
  const heroCopy = workspaceHeroCopy[name] || workspaceHeroCopy.home;
  $("#dashboard-eyebrow").textContent = heroCopy.eyebrow;
  $("#dashboard-title").textContent = heroCopy.title;
  $("#dashboard-together-mascot").hidden = name !== "together";
  $("#dashboard-lead").textContent = heroCopy.lead;
  $$(".workspace-tab").forEach((button) => {
    const selected = button.dataset.workspace === name;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.setAttribute("tabindex", selected ? "0" : "-1");
  });
  let selectedPanel = null;
  $$("[data-workspace-panel]").forEach((panel) => {
    const selected = panel.dataset.workspacePanel === name;
    panel.hidden = !selected;
    panel.classList.toggle("active", selected);
    if (selected) selectedPanel = panel;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "together") syncForestOverview();
  if (name === "tools" && !state.educationContents.length) void loadEducation();
  if (name === "report") {
    if (state.lifestyleReportStatus === "idle") void loadWeeklyReport();
    setReportPeriod("week");
  }
  syncSidebarChallengeEntry();
  syncTopNavigation();
  if (moveFocus && selectedPanel) selectedPanel.focus({ preventScroll: true });
}

function focusChallengeSelectionEntry() {
  const entry = $(".daily-record-select") || $("#workspace-panel-challenge");
  if (!entry) return;
  entry.scrollIntoView({ behavior: "smooth", block: "center" });
  entry.focus?.({ preventScroll: true });
}

async function openChallengeSelectionScreen() {
  await loadChallenges();
  showStep(7);
}

function compactChallengeV2() {
  const root = $("[data-challenge-v2]");
  if (!root || root.querySelector(":scope > details.v2-collapsible")) return;

  const details = document.createElement("details");
  details.className = "v2-collapsible";
  details.open = state.challengeV2Expanded;
  const summary = document.createElement("summary");
  summary.innerHTML = "<span><strong>당뇨 예방 챌린지</strong><small>설정과 오늘의 실천 항목 보기</small></span><span class=\"v2-collapsible-indicator\" aria-hidden=\"true\">⌄</span>";
  details.append(summary);
  while (root.firstChild) details.append(root.firstChild);
  root.append(details);

  root.querySelector('a[href="/"]')?.remove();
  root.querySelector("[data-dashboard]")?.classList.add("primary", "v2-dashboard-link");
  details.addEventListener("toggle", () => { state.challengeV2Expanded = details.open; });
}

window.addEventListener("challenge-v2-updated", compactChallengeV2);

function syncForestOverview() {
  const recordedNode = $("#forest-recorded-members");
  if (!recordedNode) return;
  let forestState = null;
  try {
    forestState = JSON.parse(localStorage.getItem("gandang-carrot-forest-demo-v1") || "null");
  } catch {
    forestState = null;
  }
  const members = Array.isArray(forestState?.members) && forestState.members.length ? forestState.members : null;
  const recordedCount = members ? members.filter((member) => Number(member.completed) > 0).length : 1;
  recordedNode.textContent = `${recordedCount}명`;
}
async function loadSharedGroups() {
  const list = $("#shared-group-list");
  if (!list) return;
  try {
    const result = await api("/shared-challenge-groups");
    list.innerHTML = result.items.length ? result.items.map((group) => {
      const me = group.members.find((member) => member.is_me);
      const partner = group.members.find((member) => !member.is_me && member.status === "active");
      const memberStatuses = group.members.map((member) => {
        const memberLabel = member.is_me ? "나" : `연결 사용자 #${member.user_id}`;
        const statusLabel = member.status === "active" ? `${Number(member.completed_days || 0)}일 기록` : "참여 대기";
        return `<li><strong>${escapeHtml(memberLabel)}</strong><span>${escapeHtml(statusLabel)}</span></li>`;
      }).join("");
      const action = me?.status === "pending"
        ? `<button class="text-button accept-shared" data-id="${group.group_id}" type="button">공동 챌린지 수락</button>`
        : partner ? `<button class="text-button cheer-shared" data-id="${group.group_id}" data-user="${partner.user_id}" type="button">응원 보내기</button>` : "";
      return `<article class="forest-group-card"><strong>${escapeHtml(group.title)}</strong><p>${escapeHtml(group.common_goal)}</p><small>참여자 ${group.members.length}명 · 챌린지 수행 상태만 공유</small><ul class="shared-member-progress">${memberStatuses}</ul>${action}</article>`;
    }).join("") : renderTogetherEmpty("아직 공동 챌린지가 없습니다.", "개인 챌린지를 시작한 뒤 함께할 사람에게 공동 챌린지를 보낼 수 있어요.");
  } catch (error) {
    list.innerHTML = renderTogetherEmpty("공동 챌린지를 불러오지 못했어요.", "잠시 후 함께하기 탭을 다시 확인해 주세요.");
  }
}
async function loadNotifications() {
  const toggle = $("#notification-toggle");
  const list = $("#notification-list");
  if (!toggle || !list) return;
  const [preferences, notifications] = await Promise.all([api("/notification-preferences"), api("/notifications")]);
  state.notificationsEnabled = preferences.in_app_enabled;
  toggle.textContent = state.notificationsEnabled ? "웹 알림 끄기" : "웹 알림 켜기";
  list.innerHTML = notifications.items.length ? notifications.items.map((item) => `<article class="challenge-card"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small></span></article>`).join("") : `<p class="lead">표시할 웹 알림이 없습니다.</p>`;
}
async function refreshDashboard() {
  await loadDailyRecords();
  const summary = await api("/dashboard/summary");
  const cards = Array.isArray(summary.risk_cards) ? summary.risk_cards : [];
  const approvedCard = cards.find((card) => card.model_key === "diabetes_current_screening"
    && card.result_status === "approved"
    && card.promotion_status === "approved"
    && Boolean(card.risk_category));
  renderDashboardRiskSummary(
    approvedCard ? normalizeRiskKey(approvedCard) : "pending",
    approvedCard ? approvedCard.risk_category_label : cards.length ? "모델 검증 중" : "기록 없음",
  );
  const progress = await api("/dashboard/challenge-progress");
  $("#dashboard-complete").textContent = `${Number(progress.recent_7_days?.completed || 0)}개`;
  await Promise.all([loadWeeklyReport(), loadEducation(), loadConnections(), loadInvitations(), loadSharedGroups(), loadHealthCheckupHistory()]);
}

function setInviteMode(mode) {
  $$("[data-invite-mode]").forEach((button) => {
    const selected = button.dataset.inviteMode === mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-expanded", String(selected));
  });
  $$("[data-invite-panel]").forEach((panel) => {
    const selected = panel.dataset.invitePanel === mode;
    panel.hidden = !selected;
    panel.classList.toggle("active", selected);
  });
}

function invitationStatusLabel(status) {
  return { pending: "수락 대기", accepted: "수락 완료", expired: "기간 만료", revoked: "취소됨" }[status] || status || "상태 확인 중";
}

function formatInvitationExpiry(value) {
  if (!value) return "만료일 확인 필요";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "만료일 확인 필요";
  return `${date.getMonth() + 1}/${date.getDate()}까지`;
}

function setInviteDisclosure(panelId, { forceOpen = false, moveFocus = true } = {}) {
  const target = document.getElementById(panelId);
  if (!target) return;
  const shouldOpen = forceOpen || target.hidden;
  $$("[data-invite-disclosure]").forEach((button) => {
    const selected = shouldOpen && button.getAttribute("aria-controls") === panelId;
    button.setAttribute("aria-expanded", String(selected));
    button.classList.toggle("active", selected);
  });
  $$(".forest-invite-detail").forEach((panel) => {
    panel.hidden = !(shouldOpen && panel.id === panelId);
  });
  if (shouldOpen && moveFocus) target.focus({ preventScroll: true });
  if (shouldOpen && panelId === "received-invite-panel") void loadInvitations();
  if (shouldOpen && panelId === "create-invite-panel") setInviteMode("email");
}

function closeInviteDisclosure(panelId) {
  const panel = document.getElementById(panelId);
  const opener = $(`[data-invite-disclosure][aria-controls="${panelId}"]`);
  if (panel) panel.hidden = true;
  if (opener) {
    opener.setAttribute("aria-expanded", "false");
    opener.classList.remove("active");
    opener.focus();
  }
}

function renderReceivedInvitations() {
  const list = $("#received-invitation-list");
  if (!list) return;
  const received = Array.isArray(state.invitations?.received) ? state.invitations.received : [];
  if (!received.length) {
    list.innerHTML = renderTogetherEmpty("아직 받은 초대가 없습니다.", "새 초대를 받으면 이곳에 표시됩니다.");
    return;
  }
  list.innerHTML = received.map((item) => {
    const pending = item.status === "pending";
    return `<article class="received-invitation-item ${pending ? "is-pending" : ""}">
      <div><strong>${escapeHtml(relationLabel(item.relation_type))} 초대</strong><p>${escapeHtml(formatInvitationExpiry(item.expires_at))} · ${escapeHtml(invitationStatusLabel(item.status))}</p></div>
      <span class="member-status">${escapeHtml(invitationStatusLabel(item.status))}</span>
    </article>`;
  }).join("");
}

async function loadInvitations() {
  const list = $("#received-invitation-list");
  if (!list) return;
  list.innerHTML = renderTogetherEmpty("초대 목록을 불러오고 있어요", "잠시만 기다려 주세요.");
  try {
    const result = isLocalPreview() ? { sent: [], received: [] } : await api("/invitations");
    state.invitations = {
      sent: Array.isArray(result?.sent) ? result.sent : [],
      received: Array.isArray(result?.received) ? result.received : [],
    };
    renderReceivedInvitations();
  } catch (error) {
    list.innerHTML = `<article class="together-empty"><strong>받은 초대를 불러오지 못했어요.</strong><p>${escapeHtml(error.message || "잠시 후 다시 시도해 주세요.")}</p><button class="secondary retry-invitations" type="button">다시 불러오기</button></article>`;
  }
}

function configureEnvironmentControls() {
  const statusPanel = $(".status-demo-panel");
  const requestedPreview = new URLSearchParams(window.location.search).get("preview");
  if (statusPanel) statusPanel.hidden = !isDemoEnvironment() || requestedPreview !== "analysis-status";

  const codeNode = $("#forest-invite-code");
  const codeNote = $("#invite-code-note");
  const copyButton = $("#copy-invite-code");
  const incomingToken = new URLSearchParams(window.location.search).get("invite_token");
  if (incomingToken && $("#invitation-token")) {
    $("#invitation-token").value = incomingToken;
    setInviteDisclosure("received-invite-panel", { forceOpen: true, moveFocus: false });
  }
  if (!codeNode || !codeNote || !copyButton) return;

  const isDemo = isDemoEnvironment();
  codeNode.textContent = isDemo ? "DEMO-CODE" : "초대 코드 발급 준비 중";
  codeNode.dataset.copyValue = isDemo ? "DEMO-CODE" : "";
  codeNote.textContent = isDemo
    ? "로컬 화면 확인용 코드입니다. 실제 초대에는 사용할 수 없어요."
    : "실제 초대 코드 API가 연결되면 여기에서 확인할 수 있어요.";
  copyButton.disabled = !isDemo;
  copyButton.textContent = isDemo ? "복사" : "준비 중";
}

function renderInviteCodeResult(result = {}) {
  const box = $("#invite-result");
  const codeNode = $("#forest-invite-code");
  const codeNote = $("#invite-code-note");
  const copyButton = $("#copy-invite-code");
  const inviteCode = typeof result.token === "string" ? result.token.trim() : "";
  setInviteDisclosure("create-invite-panel", { forceOpen: true, moveFocus: false });
  if (!codeNode || !codeNote || !copyButton || !inviteCode) {
    if (box) {
      box.textContent = "초대 코드를 발급받지 못했습니다. 잠시 후 다시 시도해 주세요.";
      box.hidden = false;
    }
    return;
  }
  codeNode.textContent = inviteCode;
  codeNode.dataset.copyValue = inviteCode;
  copyButton.disabled = false;
  copyButton.textContent = "복사";
  const expiry = formatInvitationExpiry(result.expires_at);
  codeNote.textContent = `초대받을 분에게 이 코드를 전달해 주세요. ${expiry} 사용할 수 있어요.`;
  if (box) {
    box.replaceChildren();
    box.hidden = true;
  }
  codeNode.focus?.();
}

function setReportPeriod(period) {
  $$("[data-report-period]").forEach((button) => {
    const selected = button.dataset.reportPeriod === period;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.setAttribute("tabindex", selected ? "0" : "-1");
  });
  $$("[data-report-panel]").forEach((panel) => {
    const selected = panel.dataset.reportPanel === period;
    panel.hidden = !selected;
    panel.classList.toggle("active", selected);
  });
  const pdfPeriod = $(`input[name="report-pdf-period"][value="${period}"]`);
  if (pdfPeriod) pdfPeriod.checked = true;
  updateReportPdfAvailability();
  if (period === "week" && state.lifestyleReportStatus === "error") void loadWeeklyReport();
  if ((period === "four-week" || period === "all") && typeof loadReportPeriod === "function") void loadReportPeriod(period);
}

function reportPdfUnavailableReason(period) {
  void period;
  return "";
}

function updateReportPdfAvailability() {
  const reason = reportPdfUnavailableReason(selectedReportPdfPeriod());
  $("#report-pdf-status").textContent = reason || "현재 선택한 리포트 화면을 그대로 PDF 저장 화면으로 엽니다.";
  // The first click can always reveal period choices; only an actual download is blocked.
  $("#download-report").disabled = !$("#report-pdf-options").hidden && Boolean(reason);
}

async function fetchWeeklyReportPdf(period) {
  if (period !== "week") throw new Error("지난 4주·전체는 현재 화면 PDF 저장을 사용해 주세요.");
  if (!state.token || isLocalPreview()) throw new Error("실제 계정으로 로그인한 뒤 저장된 리포트를 PDF로 받을 수 있습니다.");
  const response = await fetch("/api/v1/weekly-reports/current/pdf", { headers: { Authorization: `Bearer ${state.token}` } });
  if (!response.ok) throw new Error(response.status === 401 ? "로그인이 만료되었습니다. 다시 로그인한 뒤 PDF를 받아 주세요." : "PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("올바른 PDF 응답을 받지 못했습니다. 다시 시도해 주세요.");
  return response.blob();
}

async function prepareReportPrint(period) {
  setReportPeriod(period);
  if (period === "week" && state.lifestyleReportStatus === "idle") await loadWeeklyReport();
  if ((period === "four-week" || period === "all") && typeof loadReportPeriod === "function" && state.reportPeriodStatus?.[period] !== "ready") {
    await loadReportPeriod(period);
  }
  document.body.dataset.printReportPeriod = period;
  document.documentElement.dataset.printReportPeriod = period;
  document.title = `간당간당_${reportPdfPeriodLabels[period] || "리포트"}_리포트`;
  window.print();
}

const reportPdfPeriodLabels = {
  week: "이번 주",
  "four-week": "지난 4주",
  all: "전체",
};

const reportPdfFileNames = {
  week: "간당간당_이번주_리포트.pdf",
  "four-week": "간당간당_지난4주_리포트.pdf",
  all: "간당간당_전체_리포트.pdf",
};

function selectedReportPdfPeriod() {
  return $('input[name="report-pdf-period"]:checked')?.value || "week";
}

let reportPdfPrintInProgress = false;

async function openSelectedReportPdf(period) {
  if (reportPdfPrintInProgress) return;
  reportPdfPrintInProgress = true;
  const input = $(`input[name="report-pdf-period"][value="${period}"]`);
  if (input) input.checked = true;
  closeReportPdfOptions();
  try {
    await prepareReportPrint(period);
    showMessage(`${reportPdfPeriodLabels[period] || "선택한 기간"} 리포트 PDF 저장 화면을 열었습니다.`, "success");
  } catch (error) { showMessage(error.message); }
  finally { reportPdfPrintInProgress = false; }
}

function updateReportPdfButtonLabel() {
  const button = $("#download-report");
  if (!button) return;
  button.textContent = "PDF로 받기";
}

function closeReportPdfOptions({ returnFocus = false } = {}) {
  const options = $("#report-pdf-options");
  const button = $("#download-report");
  if (!options || !button || options.hidden) return;
  options.hidden = true;
  button.setAttribute("aria-expanded", "false");
  button.textContent = "PDF로 받기";
  updateReportPdfAvailability();
  if (returnFocus) button.focus();
}

function revealReportPdfOptions() {
  const options = $("#report-pdf-options");
  const button = $("#download-report");
  if (!options || !button) return false;
  if (!options.hidden) return true;
  options.hidden = false;
  button.setAttribute("aria-expanded", "true");
  updateReportPdfButtonLabel();
  updateReportPdfAvailability();
  $('input[name="report-pdf-period"]:checked')?.focus();
  return false;
}

function closeMemberMenus() {
  $$(".member-menu").forEach((menu) => { menu.hidden = true; });
  $$(".member-menu-button").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

const introChallengeChoices = {
  walk: { src: "/static/assets/hyeoldangi-challenge-walking.png", alt: "활기차게 걷는 혈당이" },
  meal: { src: "/static/assets/hyeoldangi-challenge-meal.png", alt: "건강한 식사를 들고 있는 혈당이" },
  water: { src: "/static/assets/hyeoldangi-challenge-water.png", alt: "물 마시기를 응원하는 혈당이" },
};

function setIntroChallenge(key) {
  const mascot = $("#intro-preview-mascot");
  const choice = introChallengeChoices[key];
  if (!mascot || !choice) return;
  mascot.src = choice.src;
  mascot.alt = choice.alt;
  mascot.classList.add("is-changing");
  window.setTimeout(() => mascot.classList.remove("is-changing"), 360);
  $$('[data-intro-challenge]').forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.introChallenge === key));
  });
}

$$('.next').forEach((button) => button.addEventListener("click", () => showStep(state.step + 1)));
$$('.back').forEach((button) => button.addEventListener("click", goBack));
$$('[data-intro-challenge]').forEach((button) => button.addEventListener("click", () => setIntroChallenge(button.dataset.introChallenge)));
$$('#step-list li[data-flow-stage]').forEach((element) => {
  const flowStage = Number(element.dataset.flowStage);
  if (element.hasAttribute("data-auth-entry")) return;
  const explicitTarget = element.dataset.stepTarget ? Number(element.dataset.stepTarget) : null;
  const targetStep = () => Number.isFinite(explicitTarget) ? explicitTarget : flowStageTarget(flowStage);
  element.dataset.gotoStep = String(flowStage);
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `${element.textContent.trim()} 화면으로 이동`);
  element.setAttribute("tabindex", flowStage === 1 ? "0" : "-1");
  element.setAttribute("aria-disabled", flowStage === 1 ? "false" : "true");
  element.addEventListener("click", () => goStepFromNav(targetStep()));
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    goStepFromNav(targetStep());
  });
});
$("#intro-start").addEventListener("click", () => {
  showAuthEntry("signup");
});
$$('[data-story-start]').forEach((button) => button.addEventListener('click', () => {
  if (state.token) { showStep(8); showWorkspace('together'); }
  else showAuthEntry('signup');
}));
// Keep firm destinations; ease only the journey between them. Touch and long
// sections retain native scrolling, and reduced-motion users get no tween.
const landingSlides = [$('.landing-first'), ...$$('.service-story > section')];
const landingLabels = ['시작', '서비스 소개', '건강정보', '위험 신호', '챌린지', '리포트', '당근의 숲', '함께 시작'];
// Map the callout to the clipboard inside the contained character artwork.
function updateStoryZoomConnector() {
  const scene = $('.story-input-visual');
  const image = scene.querySelector('img');
  if (!scene.clientWidth || !image.naturalWidth) return;
  const bounds = scene.getBoundingClientRect();
  const card = scene.querySelector('.story-record-preview').getBoundingClientRect();
  const img = image.getBoundingClientRect();
  const scale = Math.min(img.width / image.naturalWidth, img.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const left = img.left - bounds.left + (img.width - width) / 2;
  const top = img.top - bounds.top + (img.height - height) / 2;
  const x = left + width * .16, y = top + height * .43;
  const w = width * .25, h = height * .34;
  const svg = scene.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  const source = svg.querySelector('rect');
  for (const [key, value] of Object.entries({ x, y, width: w, height: h })) source.setAttribute(key, value);
  svg.querySelector('path').setAttribute('d', `M ${card.right - bounds.left} ${card.top - bounds.top + 24} L ${x} ${y} M ${card.right - bounds.left} ${card.bottom - bounds.top - 24} L ${x} ${y + h}`);
}
const storyZoomObserver = new ResizeObserver(updateStoryZoomConnector);
storyZoomObserver.observe($('.story-input-visual'));
storyZoomObserver.observe($('.story-record-preview'));
$('.story-input-visual img').addEventListener('load', updateStoryZoomConnector);
let landingIndex = 0;
function updateLandingPosition() {
  if (!document.body.classList.contains('intro-mode')) return;
  const headerHeight = $('.topbar').getBoundingClientRect().height;
  landingIndex = landingSlides.reduce((best, node, index) =>
    Math.abs(node.getBoundingClientRect().top - headerHeight) < Math.abs(landingSlides[best].getBoundingClientRect().top - headerHeight) ? index : best, 0);
  $('#landing-position').textContent = landingLabels[landingIndex];
  $('#landing-position').setAttribute('aria-label', `${landingLabels[landingIndex]}, 이동할 소개 선택`);
  $$('#landing-picker button').forEach((button, index) => {
    if (index === landingIndex) button.setAttribute('aria-current', 'location');
    else button.removeAttribute('aria-current');
  });
  $('#landing-prev').disabled = landingIndex === 0;
  $('#landing-next').disabled = landingIndex === landingSlides.length - 1;
}
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--landing-header-height', `${$('.topbar').getBoundingClientRect().height}px`);
}).observe($('.topbar'));
let landingScrollFrame = 0;
let landingMotionFrame = 0;
let landingWheelUntil = 0;
function cancelLandingMotion() {
  cancelAnimationFrame(landingMotionFrame);
  landingMotionFrame = 0;
  landingWheelUntil = 0;
  document.documentElement.classList.remove('landing-transitioning');
}
function moveLandingTo(target) {
  cancelLandingMotion();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { target.scrollIntoView({ behavior: 'instant', block: 'start' }); return; }
  const from = window.scrollY;
  const to = Math.max(0, from + target.getBoundingClientRect().top - $('.topbar').getBoundingClientRect().height);
  const start = performance.now();
  const duration = 50;
  document.documentElement.classList.add('landing-transitioning');
  landingWheelUntil = start + duration + 180;
  function frame(now) {
    if (!document.body.classList.contains('intro-mode')) { cancelLandingMotion(); return; }
    const t = Math.min(1, (now - start) / duration);
    const eased = t * t * t * (t * (6 * t - 15) + 10);
    window.scrollTo({ top: from + (to - from) * eased, behavior: 'instant' });
    if (t < 1) landingMotionFrame = requestAnimationFrame(frame);
    else {
      landingMotionFrame = 0;
      document.documentElement.classList.remove('landing-transitioning');
      updateLandingPosition();
    }
  }
  landingMotionFrame = requestAnimationFrame(frame);
}
window.addEventListener('wheel', (event) => {
  if (!document.body.classList.contains('intro-mode') || !matchMedia('(min-width: 761px)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY || event.target.closest('input, select, textarea, [role="dialog"], .topbar, .landing-picker')) return;
  const now = performance.now();
  if (landingMotionFrame || now < landingWheelUntil) {
    event.preventDefault();
    landingWheelUntil = Math.max(landingWheelUntil, now + 180);
    return;
  }
  updateLandingPosition();
  const current = landingSlides[landingIndex].getBoundingClientRect();
  const available = innerHeight - $('.topbar').getBoundingClientRect().height;
  // Do not skip text in a slide that is taller than the viewport.
  if (current.height > available + 4) return;
  const next = landingIndex + Math.sign(event.deltaY);
  if (next < 0 || next >= landingSlides.length) return;
  event.preventDefault();
  moveLandingTo(landingSlides[next]);
}, { passive: false });
window.addEventListener('pointerdown', cancelLandingMotion, { passive: true });
window.addEventListener('touchstart', cancelLandingMotion, { passive: true });
window.addEventListener('resize', cancelLandingMotion, { passive: true });
window.addEventListener('keydown', (event) => {
  if (['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancelLandingMotion();
});
window.addEventListener('scroll', () => {
  if (landingScrollFrame) return;
  landingScrollFrame = requestAnimationFrame(() => { updateLandingPosition(); landingScrollFrame = 0; });
}, { passive: true });
function closeLandingPicker(restoreFocus = false) {
  $('#landing-picker').hidden = true;
  $('#landing-position').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#landing-position').focus({ preventScroll: true });
}
landingSlides.forEach((slide, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = landingLabels[index];
  button.addEventListener('click', () => {
    closeLandingPicker();
    moveLandingTo(slide);
    const heading = slide.querySelector('h1, h2');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  });
  $('#landing-picker').append(button);
});
$('#landing-position').addEventListener('click', () => {
  if (!$('#landing-picker').hidden) { closeLandingPicker(); return; }
  updateLandingPosition();
  $('#landing-picker').hidden = false;
  $('#landing-position').setAttribute('aria-expanded', 'true');
  $$('#landing-picker button')[landingIndex].focus({ preventScroll: true });
});
$('.landing-pager').addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#landing-picker').hidden) { event.preventDefault(); closeLandingPicker(true); }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.landing-pager')) closeLandingPicker();
});
$('.landing-pager').addEventListener('focusout', (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) closeLandingPicker();
});
for (const [selector, direction] of [['#landing-prev', -1], ['#landing-next', 1]]) {
  $(selector).addEventListener('click', () => {
    closeLandingPicker();
    updateLandingPosition();
    const target = landingSlides[Math.max(0, Math.min(landingSlides.length - 1, landingIndex + direction))];
    moveLandingTo(target);
  });
}
updateLandingPosition();
$("#sidebar-signup").addEventListener("click", (event) => {
  event.stopPropagation();
  showAuthEntry("signup");
});
$("#sidebar-login").addEventListener("click", (event) => {
  event.stopPropagation();
  showAuthEntry("login", { context: "login" });
});
$("#my-page")?.addEventListener("click", () => {
  if (state.token) {
    openProfileEditor();
    return;
  }
  showStep(2);
  showAuthMode("login", { context: "mypage" });
});
$(".forest-shortcut")?.addEventListener("click", (event) => {
  if (state.token) return;
  event.preventDefault();
  showStep(2);
  showAuthMode("login", { context: "login" });
});
$$("[data-top-workspace]").forEach((button) => button.addEventListener("click", () => {
  if (!state.token) {
    showStep(2);
    showAuthMode("login", { context: "login" });
    return;
  }
  showStep(8);
  showWorkspace(button.dataset.topWorkspace, { moveFocus: false });
}));
$$("[data-top-step]").forEach((button) => button.addEventListener("click", async () => {
  if (!state.token) {
    showStep(2);
    showAuthMode("login", { context: "login" });
    return;
  }
  const targetStep = Number(button.dataset.topStep);
  if (targetStep === 7) {
    try { await openChallengeTab(); } catch (error) { showMessage(error.message); }
    return;
  }
  showStep(targetStep);
}));
$$("[data-onboarding-step]").forEach((button) => button.addEventListener("click", async () => {
  if (!state.token) {
    showStep(2);
    showAuthMode("login", { context: "login" });
    return;
  }
  const targetStep = Number(button.dataset.onboardingStep);
  if (targetStep >= 4 && !await ensureActiveHealthConsent("건강정보 입력")) return;
  if (targetStep === 5) {
    if (state.step >= 5 || state.analysisRun || state.prediction || state.currentScreeningPrediction) showStep(5);
    else showMessage("건강정보 입력 후 분석을 시작할 수 있어요.");
    return;
  }
  showStep(targetStep);
}));
$("#profile-edit")?.addEventListener("click", openProfileEditor);
$("#open-privacy-settings")?.addEventListener("click", () => openHealthConsentSettings());
document.addEventListener("click", (event) => {
  if (!event.target.closest("#header-my-page")) $("#header-my-page").open = false;
});
$("#header-my-page").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("#header-my-page").open = false;
    $("#header-my-page-toggle").focus();
  }
});
$("#open-health-management").addEventListener("click", () => {
  const panel = $("#home-health-management");
  panel.hidden = !panel.hidden;
  $("#open-health-management").setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) {
    $("#dashboard-health-title").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#dashboard-health-title").focus({ preventScroll: true });
  }
});
function closeHealthManagement() {
  $("#home-health-management").hidden = true;
  $("#open-health-management").setAttribute("aria-expanded", "false");
  $("#open-health-management").focus();
}
$("#close-health-management").addEventListener("click", closeHealthManagement);
$("#home-health-management").addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.stopPropagation(); closeHealthManagement(); }
});
$("#profile-editor-close")?.addEventListener("click", closeProfileEditor);
$("#profile-editor-cancel")?.addEventListener("click", closeProfileEditor);
$("#profile-editor")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeProfileEditor();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#profile-editor")?.hidden) closeProfileEditor();
});
$("#profile-editor-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const birthday = $("#profile-birthday").value;
  const gender = $("#profile-gender").value;
  const message = $("#profile-editor-message");
  if (getAgeFromBirth(birthday) < 14) {
    message.textContent = "서비스 약관에 따라 만 14세 미만은 생년월일로 변경할 수 없습니다.";
    message.hidden = false;
    return;
  }
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "저장 중…");
  try {
    const profile = isLocalPreview()
      ? { ...(state.userProfile || {}), birthday, gender }
      : await api("/users/me/profile", { method: "PATCH", body: JSON.stringify({ birthday, gender }) });
    state.userProfile = { ...(state.userProfile || {}), ...(profile || {}), birthday, gender };
    $("#eligibility-birth-date").value = birthday;
    $("#gender").value = gender;
    syncLifestyleAvatar();
    closeProfileEditor();
    showMessage("생년월일과 성별을 수정했습니다. 다음 분석부터 변경된 정보를 사용합니다.", "success");
  } catch (error) {
    message.textContent = error.message || "기본정보를 저장하지 못했습니다.";
    message.hidden = false;
  } finally {
    releaseBusy();
  }
});
$("#account-logout")?.addEventListener("click", async (event) => {
  const releaseBusy = setButtonBusy(event.currentTarget, "로그아웃 중…");
  try {
    if (!isLocalPreview()) await api("/auth/logout", { method: "POST" });
    clearAuthenticatedClientState();
    showMessage("로그아웃했습니다.", "success");
  } catch (error) {
    if (error.status === 401) {
      clearAuthenticatedClientState();
      showMessage("로그인 시간이 만료되어 로그인 화면으로 이동했습니다.", "success");
    } else showMessage(error.message || "로그아웃하지 못했습니다. 다시 시도해 주세요.");
  } finally { releaseBusy(); }
});
$("#open-account-delete")?.addEventListener("click", () => {
  $("#header-my-page")?.removeAttribute("open");
  $("#account-delete-confirm").value = "";
  $("#confirm-account-delete").disabled = true;
  $("#account-delete-error").hidden = true;
  $("#account-delete-dialog").showModal();
  $("#account-delete-confirm").focus();
});
function closeHealthConsentSettings() {
  $("#consent-settings-dialog")?.close();
  $("#header-my-page-toggle")?.focus();
}
$("#close-consent-settings")?.addEventListener("click", closeHealthConsentSettings);
$("#cancel-consent-settings")?.addEventListener("click", closeHealthConsentSettings);
$("#withdraw-health-consent")?.addEventListener("click", async (event) => {
  const consentId = Number(state.healthConsent?.consent_id);
  const errorNode = $("#consent-settings-error");
  if (!Number.isInteger(consentId)) {
    errorNode.textContent = "철회할 동의 기록을 찾지 못했어요. 상태를 다시 불러와 주세요.";
    errorNode.hidden = false;
    return;
  }
  if (!window.confirm("동의를 철회하면 진행 중인 챌린지가 종료되고, 새 건강정보 저장·분석·챌린지 시작이 제한됩니다. 철회할까요?")) return;
  const releaseBusy = setButtonBusy(event.currentTarget, "철회 처리 중…");
  errorNode.hidden = true;
  try {
    if (!isLocalPreview()) await api(`/consents/${consentId}/withdraw`, { method: "PATCH" });
    await refreshHealthConsentState();
    state.cycle = null;
    state.analysisRun = null;
    state.selectedChallengeIds.clear();
    showMessage("건강정보 동의를 철회했어요. 계정과 일반 페이지는 계속 이용할 수 있어요.", "success");
  } catch (error) {
    errorNode.textContent = error.message || "동의를 철회하지 못했어요. 다시 시도해 주세요.";
    errorNode.hidden = false;
    errorNode.focus();
  } finally { releaseBusy(); renderHealthConsentSettings(); }
});
$("#renew-health-consent")?.addEventListener("click", async (event) => {
  const errorNode = $("#consent-settings-error");
  const releaseBusy = setButtonBusy(event.currentTarget, "동의 저장 중…");
  errorNode.hidden = true;
  try {
    if (!isLocalPreview()) await api("/consents", { method: "POST", body: JSON.stringify({ consent_item: "health_data", version: "1.0", is_agreed: true }) });
    await refreshHealthConsentState();
    state.healthConsentStatus = "active";
    renderHealthConsentSettings();
    showMessage("건강정보 수집·이용에 다시 동의했어요.", "success");
  } catch (error) {
    errorNode.textContent = error.message || "동의를 저장하지 못했어요. 다시 시도해 주세요.";
    errorNode.hidden = false;
    errorNode.focus();
  } finally { releaseBusy(); renderHealthConsentSettings(); }
});
function closeAccountDeleteDialog() {
  $("#account-delete-dialog")?.close();
}
$("#close-account-delete")?.addEventListener("click", closeAccountDeleteDialog);
$("#cancel-account-delete")?.addEventListener("click", closeAccountDeleteDialog);
$("#account-delete-confirm")?.addEventListener("input", (event) => {
  $("#confirm-account-delete").disabled = event.currentTarget.value.trim() !== "탈퇴";
});
$("#account-delete-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const confirmInput = $("#account-delete-confirm");
  const errorNode = $("#account-delete-error");
  if (confirmInput.value.trim() !== "탈퇴") {
    errorNode.textContent = "확인을 위해 ‘탈퇴’를 정확히 입력해 주세요.";
    errorNode.hidden = false;
    confirmInput.focus();
    return;
  }
  const submitButton = $("#confirm-account-delete");
  const releaseBusy = setButtonBusy(submitButton, "탈퇴 처리 중…");
  try {
    if (!isLocalPreview()) {
      await api("/users/me", { method: "DELETE" });
      try { await api("/auth/logout", { method: "POST" }); } catch { /* account is already inactive */ }
    }
    closeAccountDeleteDialog();
    clearAuthenticatedClientState({ keepEmail: false });
    showMessage("회원탈퇴가 처리되었습니다.", "success");
  } catch (error) {
    errorNode.textContent = error.message || "회원탈퇴를 처리하지 못했습니다. 다시 시도해 주세요.";
    errorNode.hidden = false;
    errorNode.focus();
  } finally { releaseBusy(); }
});
$$('.inner-step-tabs [data-health-tab]').forEach((button) => button.addEventListener("click", () => {
  if (["lifestyle", "details", "review"].includes(button.dataset.healthTab)) {
    const fields = [$("#height"), $("#weight"), $("#waist"), $("#systolic"), $("#diastolic")].filter(Boolean);
    const invalid = fields.filter((input) => !input.checkValidity());
    if (invalid.length) {
      invalid[0].reportValidity();
      return;
    }
  }
  if (button.dataset.healthTab === "review") {
    const invalidFields = collectInvalidHealthFields();
    renderHealthReview();
    renderHealthErrorSummary(invalidFields);
  }
  showHealthInputPanel(button.dataset.healthTab);
}));
$("#today-select-challenge").addEventListener("click", async (event) => {
  const releaseBusy = setButtonBusy(event.currentTarget, "선택 화면 여는 중…");
  try { await openChallengeSelectionScreen(); }
  catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
$$('.workspace-tab, .workspace-shortcut').forEach((button) => button.addEventListener("click", () => showWorkspace(button.dataset.workspace)));
$$("[data-tool-target]").forEach((button) => button.addEventListener("click", () => {
  const targetId = button.dataset.toolTarget;
  if (targetId === "lifestyle-map-detail") {
    $("#lifestyle-map-detail").hidden = false;
    $("#open-lifestyle-map")?.setAttribute("aria-expanded", "true");
  }
  const target = document.getElementById(targetId);
  const section = target?.closest("section") || target;
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  target?.focus?.({ preventScroll: true });
}));
$$("[data-report-period]").forEach((button, index, tabs) => {
  button.addEventListener("click", () => setReportPeriod(button.dataset.reportPeriod));
  button.addEventListener("keydown", (event) => {
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  });
});
$("#weekly-report")?.addEventListener("click", (event) => {
  if (event.target.closest(".retry-weekly-report")) void loadWeeklyReport();
  const retry = event.target.closest(".retry-period-report");
  if (retry) void loadReportPeriod(retry.dataset.period, { force: true });
  const more = event.target.closest(".report-load-more");
  if (more) void loadMoreReportCycles(more.dataset.cursor);
});
$$('.workspace-tab').forEach((button, index, tabs) => button.addEventListener("keydown", (event) => {
  let nextIndex = null;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
  if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  const nextTab = tabs[nextIndex];
  showWorkspace(nextTab.dataset.workspace, { moveFocus: false });
  nextTab.focus();
}));

$("#brand-home").addEventListener("click", (event) => {
  event.preventDefault();
  if (state.step === 8) {
    showWorkspace("home");
    return;
  }
  showStep(1);
});
$$('.body-map-point').forEach((button) => button.addEventListener("click", () => updateLifestyleMap(button.dataset.mapTopic)));
$("#open-lifestyle-map")?.addEventListener("click", () => {
  const panel = $("#lifestyle-map-detail");
  panel.hidden = false;
  $("#open-lifestyle-map").setAttribute("aria-expanded", "true");
  syncLifestyleAvatar();
  updateLifestyleMap(state.mapTopic || "rhythm");
  panel.focus();
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#close-lifestyle-map")?.addEventListener("click", () => {
  $("#lifestyle-map-detail").hidden = true;
  $("#open-lifestyle-map").setAttribute("aria-expanded", "false");
  $("#open-lifestyle-map").focus();
});
$("#font-toggle").addEventListener("click", (event) => {
  const enabled = document.body.classList.toggle("large-text");
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  event.currentTarget.textContent = enabled ? "기본 글자" : "글자 크게";
});
$("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.getAttribute("aria-busy") === "true") return;
  if (!showSignupPasswordIssues({ moveFocus: true })) return;
  if (state.accountRecovery?.email === $("#email").value.trim()) {
    showAccountRecovery(state.accountRecovery, "이 계정은 이미 만들어졌습니다. 남은 설정을 이어서 완료해 주세요.");
    return;
  }
  $("#eligibility-guidance").hidden = true;
  state.modelOutOfRange = false;
  state.currentHealthOnly = false;
  state.capabilities = { challenge: false, currentHealth: false, futurePrediction: false };
  state.returningUser = false;
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "가입 처리 중…");
  const birthDate = $("#signup-birth-date").value;
  const gender = $("#signup-gender").value;
  let recovery = null;
  try {
    const name = $("#signup-nickname")?.value.trim() || "";
    const email = $("#email").value;
    const password = $("#password").value;
    const signupAge = getAgeFromBirth(birthDate);
    if (Number.isFinite(signupAge) && signupAge < 14) {
      showSignupEligibilityGuidance("UNDER_MINIMUM_SERVICE_AGE", birthDate, gender);
      return;
    }
    if (!$("#health-consent").checked) {
      showSignupEligibilityGuidance("CONSENT_REQUIRED", birthDate, gender);
      return;
    }
    const signup = await api("/auth/signup", { method: "POST", body: JSON.stringify({
      email,
      password,
      birth_date: birthDate,
      gender,
      terms_agreed: $("#personal-consent").checked,
    }) });
    state.userProfile = {
      ...(state.userProfile || {}),
      id: signup?.user_id ?? signup?.id ?? state.userProfile?.id,
      name,
      email: signup?.email || email.trim(),
    };
    recovery = { name, email: email.trim(), birthday: birthDate, gender, healthAgreed: $("#health-consent").checked, profileSaved: false, stage: "login" };
    state.accountRecovery = recovery;
    state.token = null;
    const login = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (!login.access_token) throw new Error("로그인 정보를 받지 못했습니다.");
    state.token = login.access_token;
    recovery.token = state.token;
    $("#password").value = "";
    await saveAccountSetup(recovery);
  } catch (error) {
    if (recovery) {
      $("#password").value = "";
      accountRecoveryFailure(recovery, error);
      return;
    }
    if (isUnderMinimumBirthdayError(error)) {
      showSignupEligibilityGuidance("UNDER_MINIMUM_SERVICE_AGE", birthDate, gender);
      return;
    }
    showAuthError(form, error);
  } finally {
    releaseBusy();
  }
});
$("#recovery-login").addEventListener("click", () => {
  $("#login-email").value = state.accountRecovery?.email || "";
  state.token = null;
  showAuthMode("login");
});
$("#signup-login-shortcut")?.addEventListener("click", () => showAuthMode("login", { context: "login" }));
$("#login-signup-back")?.addEventListener("click", () => showAuthMode("signup"));
$("#account-recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const recovery = state.accountRecovery;
  if (!recovery || form.getAttribute("aria-busy") === "true") return;
  const releaseBusy = setFormBusy(form, event.submitter, "저장 상태 확인 중…");
  try {
    if (recovery.verifyOnly) {
      await resumeAuthenticatedAccount();
      return;
    }
    recovery.name = $("#recovery-name")?.value.trim() || recovery.name || "";
    recovery.birthday = $("#recovery-birthday").value;
    recovery.gender = $("#recovery-gender").value;
    recovery.healthAgreed = $("#recovery-health-consent").checked;
    if (!recovery.healthAgreed) {
      $("#account-recovery-message").textContent = "건강정보 수집·이용에 동의해야 다음 단계로 진행할 수 있습니다.";
      $("#recovery-health-consent").focus();
      return;
    }
    await saveAccountSetup(recovery);
  } catch (error) {
    accountRecoveryFailure(recovery, error);
  } finally {
    releaseBusy();
    if (!form.hidden && state.accountRecovery) $("#recovery-submit").textContent = state.accountRecovery.verifyOnly ? "저장 상태 다시 확인하기" : "설정 저장하고 계속";
  }
});
$("#eligibility-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#eligibility-guidance").hidden = true;
  const urgentAnswer = document.querySelector("input[name='urgent-warning']:checked");
  if (!urgentAnswer) {
    showMessage("긴급 증상 여부를 선택해 주세요. 판단하기 어렵다면 ‘증상 자세히 확인하기’를 이용할 수 있습니다.");
    return;
  }
  if (urgentAnswer.value === "yes" || hasUrgentSymptoms() || isUrgentAnswerUncertain()) {
    showEligibilityGuidance(["URGENT_MEDICAL_ATTENTION"]);
    $("#eligibility-guidance-reason").textContent = isUrgentAnswerUncertain()
      ? "증상 여부를 확실히 판단하기 어렵다고 답했습니다."
      : "긴급한 증상이 있다고 답했습니다.";
    return;
  }
  if (hasSameDaySymptoms() || isSameDayAnswerUncertain()) {
    showEligibilityGuidance(["SAME_DAY_MEDICAL_ATTENTION"]);
    $("#eligibility-guidance-reason").textContent = isSameDayAnswerUncertain()
      ? "당일 확인이 필요한 증상인지 판단하기 어렵다고 답했습니다."
      : "당일 확인이 필요한 증상이 있다고 답했습니다.";
    return;
  }
  const diagnosisAnswer = document.querySelector("input[name='diabetes-diagnosis']:checked");
  if (!diagnosisAnswer) {
    showMessage("당뇨병 진단 여부를 선택해 주세요.");
    return;
  }
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "이용 가능 확인 중…");
  try {
    if (!isLocalPreview()) {
      await api("/users/me/profile", { method: "PATCH", body: JSON.stringify({
        birthday: $("#eligibility-birth-date").value,
        gender: $("#gender").value,
      }) });
    }
    const result = isLocalPreview()
      ? getLocalEligibilityResult()
      : await api("/eligibility-checks", { method: "POST", body: JSON.stringify({
        birth_date: $("#eligibility-birth-date").value,
        has_diabetes_diagnosis: diagnosisAnswer.value === "yes",
        has_urgent_warning_sign: false,
        population_in_scope: true,
      }) });
    syncReturningEligibilityState(result);
    if (!result.model_eligible) {
      showEligibilityGuidance(result.reason_codes);
      return;
    }
    state.modelOutOfRange = false;
    $("#submit-analysis").textContent = "이 내용으로 분석하기";
    showHealthInputPanel("metrics");
    if (state.returningDestination === "challenges") {
      state.returningDestination = null;
      await loadChallenges();
      showStep(7);
      showMessage("이용 가능 확인을 완료했습니다. 이어서 챌린지를 선택해 주세요.", "success");
      return;
    }
    state.returningDestination = null;
    showStep(4);
  } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
$("#eligibility-form").addEventListener("change", () => {
  $("#eligibility-guidance").hidden = true;
});
$$('#eligibility-form input[type="radio"], #eligibility-form input[type="date"], #eligibility-form select').forEach((input) => {
  input.addEventListener("click", () => {
    $("#eligibility-guidance").hidden = true;
  });
});
$$('input[name="urgent-summary"], input[name="same-day-summary"]').forEach((input) => {
  input.addEventListener("change", syncEmergencyQuestionnaire);
});
$$('input[name="urgent-warning"]').forEach((input) => {
  input.addEventListener("change", () => {
    clearQuestionnaireAnswers("urgent-summary");
    clearQuestionnaireAnswers("same-day-summary");
    $("#emergency-questionnaire-summary").hidden = true;
    syncEmergencyQuestionnaire();
  });
});
$("#open-emergency-questionnaire").addEventListener("click", openEmergencyQuestionnaire);
$$('.emergency-questionnaire-close').forEach((button) => button.addEventListener("click", closeEmergencyQuestionnaire));
$("#apply-emergency-questionnaire").addEventListener("click", applyEmergencyQuestionnaire);
$("#emergency-questionnaire-modal").addEventListener("click", (event) => {
  if (event.target.id === "emergency-questionnaire-modal") closeEmergencyQuestionnaire();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("#emergency-questionnaire-modal").hidden) closeEmergencyQuestionnaire();
  else if (!$("#diagnosis-help-modal").hidden) closeDiagnosisHelp();
});
$("#diagnosis-help-toggle").addEventListener("click", openDiagnosisHelp);
$$('.diagnosis-help-close').forEach((button) => button.addEventListener("click", closeDiagnosisHelp));
$("#diagnosis-help-modal").addEventListener("click", (event) => {
  if (event.target.id === "diagnosis-help-modal") closeDiagnosisHelp();
});
function closeEligibilityGuidance() {
  $("#eligibility-guidance").hidden = true;
  const signupField = state.signupGuidanceField;
  state.signupGuidanceField = null;
  if (signupField) {
    showStep(2);
    showAuthMode("signup", { moveFocus: false });
    document.getElementById(signupField)?.focus();
    // showStep schedules its heading focus; the correction field must win after it.
    requestAnimationFrame(() => document.getElementById(signupField)?.focus());
    return;
  }
  const previous = state.eligibilityReturnFocus;
  const target = previous?.isConnected && !previous.disabled && previous.tabIndex >= 0 && previous.getClientRects().length
    ? previous : $("#eligibility-birth-date");
  target.focus();
}
$("#eligibility-edit-answer").addEventListener("click", closeEligibilityGuidance);
function activeSafetyDialog() {
  return [$("#emergency-questionnaire-modal"), $("#eligibility-guidance")]
    .find(node => !node.hidden && node.getClientRects().length);
}
function safetyDialogControls(dialog) {
  return [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
    .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
}
document.addEventListener("keydown", event => {
  const dialog = activeSafetyDialog();
  if (!dialog) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (dialog.id === "emergency-questionnaire-modal") closeEmergencyQuestionnaire();
    else closeEligibilityGuidance();
  } else if (event.key === "Tab") {
    const controls = safetyDialogControls(dialog);
    const first = controls[0];
    const last = controls.at(-1);
    const current = document.activeElement;
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (current === first || !controls.includes(current))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (current === last || !controls.includes(current))) {
      event.preventDefault(); first.focus();
    }
  }
}, true);
document.addEventListener("focusin", event => {
  const dialog = activeSafetyDialog();
  if (dialog && !dialog.contains(event.target)) (safetyDialogControls(dialog)[0] || dialog).focus();
});
$("#eligibility-guidance-primary").addEventListener("click", async () => {
  if (!state.eligibilityGuidanceStep) {
    showMessage("긴급한 증상이 있다면 119 또는 가까운 응급의료기관에 연락하세요.");
    $("#eligibility-guidance").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  $("#eligibility-guidance").hidden = true;
  state.returningDestination = null;
  state.signupGuidanceField = null;
  const isChallengeOnlyGuidance = state.eligibilityGuidanceReason === "CHALLENGE_ONLY_AGE";
  if (state.eligibilityGuidanceStep === 7) await loadChallenges();
  if (state.eligibilityGuidanceStep === 4) showHealthInputPanel("metrics");
  showStep(state.eligibilityGuidanceStep);
  if (state.eligibilityGuidanceWorkspace) showWorkspace(state.eligibilityGuidanceWorkspace, { moveFocus: true });
  if (isChallengeOnlyGuidance) {
    if (!state.cycle?.user_challenges?.length) renderDailyRecords();
    focusChallengeSelectionEntry();
    showMessage("생활습관 챌린지 선택하기에서 4주 챌린지를 고를 수 있어요.", "success");
  }
  if (state.modelOutOfRange && state.eligibilityGuidanceStep === 4) {
    $("#submit-analysis").textContent = "저장하고 현재 건강 신호 확인";
    showMessage("현재 건강 신호 확인으로 이동합니다. 미래 발병 위험 예측은 만 45세 이상에서만 진행합니다.", "success");
  }
});
$("#confirm-current-location")?.addEventListener("click", confirmEmergencyLocation);
$('[data-emergency-facility-search]')?.addEventListener("click", findNearbyEmergencyFacilities);
$("#emergency-address-form")?.addEventListener("submit", findEmergencyFacilitiesByAddress);
$("#emergency-facility-address-form")?.addEventListener("submit", findEmergencyFacilitiesByAddress);
$("#find-same-day-medical")?.addEventListener("click", () => {
  showMessage("가까운 의료기관 조회 API가 연결되면 이 위치에 목록을 표시합니다.", "success");
});
$("#find-phone-consultation")?.addEventListener("click", () => {
  showMessage("전화 상담 가능 기관 정보 연결을 준비하고 있습니다.", "success");
});
$("#find-diagnosed-medical")?.addEventListener("click", () => openEligibilityMedicalFacilities({ returnToEligibility: true }));
$("#find-diagnosed-phone")?.addEventListener("click", () => openEligibilityMedicalFacilities({ returnToEligibility: true }));
$("#eligibility-guidance-secondary")?.addEventListener("click", async () => {
  $("#eligibility-guidance").hidden = true;
  state.returningDestination = null;
  state.modelOutOfRange = true;
  await loadChallenges();
  showStep(7);
  showMessage("예측 없이 일반 생활습관 챌린지를 확인합니다.", "success");
});
$("#to-lifestyle-input")?.addEventListener("click", () => {
  const fields = [$("#height"), $("#weight"), $("#waist"), $("#systolic"), $("#diastolic")].filter(Boolean);
  const invalid = fields.filter((input) => !input.checkValidity());
  if (invalid.length) {
    invalid[0].reportValidity();
    return;
  }
  showHealthInputPanel("drinking");
});
$$("[data-next-health-panel]").forEach((button) => button.addEventListener("click", () => {
  const targetPanel = button.dataset.nextHealthPanel;
  if (!targetPanel) return;
  const fields = [...button.closest(".health-input-panel")?.querySelectorAll("input, select") || []].filter((input) => input.required || input.value);
  const invalid = fields.filter((input) => !input.checkValidity());
  if (invalid.length) {
    invalid[0].reportValidity();
    return;
  }
  if (targetPanel === "review") renderHealthReview();
  showHealthInputPanel(targetPanel);
}));
$("#back-to-health-input")?.addEventListener("click", () => showHealthInputPanel("metrics"));
$("#to-detail-input")?.addEventListener("click", () => showHealthInputPanel("family"));
$("#back-to-lifestyle-input")?.addEventListener("click", () => showHealthInputPanel("activity"));
$("#review-back-to-lifestyle")?.addEventListener("click", () => showHealthInputPanel("activity"));
$("#review-edit-all")?.addEventListener("click", () => showHealthInputPanel("metrics"));
$$(".review-edit").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.editStep) return showStep(Number(button.dataset.editStep));
  showHealthInputPanel(button.dataset.editPanel);
}));
$("#health-error-list").addEventListener("click", (event) => {
  const button = event.target.closest(".health-error-jump");
  if (!button) return;
  focusHealthField(button.dataset.fieldId);
});
$("#health-form").addEventListener("input", () => persistHealthDraft({ markDirty: true }));
$("#health-form").addEventListener("change", () => persistHealthDraft({ markDirty: true }));
function healthCheckupPayload() {
  const smokingStatus = selectedRadioValue("smoking-status");
  const detailHealth = detailHealthPayload();
  const exercising = selectedRadioValue("regular-exercise") === "true";
  return {
    checkup_type: state.editingHealthCheckupId
      ? (state.healthCheckupHistory.find((item) => String(item.checkup_id) === String(state.editingHealthCheckupId))?.checkup_type || "reassessment")
      : state.returningUser ? "reassessment" : "initial",
    checkup_date: state.editingHealthCheckupId
      ? String((state.healthCheckupHistory.find((item) => String(item.checkup_id) === String(state.editingHealthCheckupId)) || {}).checkup_date || new Date().toISOString()).slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    height_cm: Number($("#height").value), weight_kg: Number($("#weight").value),
    waist_cm: $("#waist").value ? Number($("#waist").value) : null,
    systolic_bp: $("#systolic").value ? Number($("#systolic").value) : null,
    diastolic_bp: $("#diastolic").value ? Number($("#diastolic").value) : null,
    regular_exercise: exercising,
    smoking_status: smokingStatus,
    exercise_days_per_week: exercising ? Number($("#exercise-days").value) : 0,
    exercise_minutes: exercising ? Number($("#exercise-minutes").value) : 0,
    current_drinker: selectedRadioValue("current-drinker") === "true",
    annual_household_income_10k_krw: detailHealth.annual_household_income_10k_krw,
    health_satisfaction_score: detailHealth.health_satisfaction_score,
    economic_satisfaction_score: detailHealth.economic_satisfaction_score,
    overall_quality_of_life_score: detailHealth.overall_quality_of_life_score,
    hypertension_diagnosis: detailHealth.hypertension_diagnosis,
    cancer_diagnosis: detailHealth.cancer_diagnosis,
    chronic_lung_disease_diagnosis: detailHealth.chronic_lung_disease_diagnosis,
    liver_disease_diagnosis: detailHealth.liver_disease_diagnosis,
    heart_disease_diagnosis: detailHealth.heart_disease_diagnosis,
    cerebrovascular_disease_diagnosis: detailHealth.cerebrovascular_disease_diagnosis,
    psychiatric_disease_diagnosis: detailHealth.psychiatric_disease_diagnosis,
    arthritis_rheumatism_diagnosis: detailHealth.arthritis_rheumatism_diagnosis,
    education_level: detailHealth.education_level,
    marital_status: detailHealth.marital_status,
    household_structure: detailHealth.household_structure,
    depressed_feeling_last_week: detailHealth.depressed_feeling_last_week,
    sleep_difficulty_last_week: detailHealth.sleep_difficulty_last_week,
  };
}
$("#health-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  const invalidFields = collectInvalidHealthFields();
  if (invalidFields.length) {
    renderHealthReview();
    renderHealthErrorSummary(invalidFields);
    focusHealthField(invalidFields[0].id);
    return;
  }
  renderHealthErrorSummary([]);
  if (submit?.id !== "submit-analysis") {
    renderHealthReview();
    showHealthInputPanel("review");
    return;
  }
  if (!await ensureActiveHealthConsent("건강정보 저장")) return;
  submit.disabled = true;
  const shouldRequestPrediction = shouldRunPredictionAfterHealthEdit();
  submit.textContent = shouldRequestPrediction ? "분석 요청 중…" : "건강정보 저장 중…";
  try {
    if (isLocalPreview()) {
      const checkup = localHealthCheckupSnapshot();
      const editingId = state.editingHealthCheckupId;
      if (editingId) {
        checkup.checkup_id = editingId;
        const original = state.healthCheckupHistory.find((item) => String(item.checkup_id) === String(editingId));
        checkup.checkup_date = original?.checkup_date || checkup.checkup_date;
      }
      state.checkupId = checkup.checkup_id;
      state.healthCheckupResult = checkup;
      rememberCurrentScreeningInputId(checkup);
      if (shouldRequestPrediction) showStep(5);
      await saveCurrentScreeningInputSnapshot();
      clearHealthDraft();
      state.healthCheckupHistory = editingId
        ? state.healthCheckupHistory.map((item) => String(item.checkup_id) === String(editingId) ? checkup : item)
        : [checkup, ...state.healthCheckupHistory];
      state.editingHealthCheckupId = null;
      renderHealthCheckupHistory();
    } else {
      const editingId = state.editingHealthCheckupId;
      const checkup = await api(editingId ? `/health-checkups/${editingId}` : "/health-checkups", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(healthCheckupPayload()),
      });
      state.editingHealthCheckupId = null;
      state.checkupId = checkup.checkup_id;
      state.healthCheckupResult = checkup;
      rememberCurrentScreeningInputId(checkup);
      if (shouldRequestPrediction) showStep(5);
      await saveCurrentScreeningInputSnapshot();
      clearHealthDraft();
      await loadHealthCheckupHistory();
    }
    if (state.currentHealthOnly) {
      if (!shouldRequestPrediction) {
        showStoredEligibilityGuidance();
        return;
      }
      await runPrediction();
      return;
    }
    if (state.returningUser && shouldRequestPrediction) {
      await runPrediction();
      return;
    }
    if (state.returningUser) {
      if (state.cycle?.user_challenges?.length) {
        if (isLocalPreview()) renderLocalDemoDashboard();
        else await refreshDashboard();
        showWorkspace("home", { moveFocus: false });
        showStep(8);
        showMessage("건강정보를 저장했습니다. 예측은 다시 요청하지 않았습니다.", "success");
      } else {
        await loadChallenges();
        showStep(7);
        showMessage("건강정보를 저장했습니다. 이어서 4주 생활습관 챌린지를 선택해 주세요.", "success");
      }
      return;
    }
    if (!shouldRequestPrediction) showStep(5);
    await runPrediction();
  } catch (error) { showMessage(error.message); }
  finally { submit.disabled = false; submit.textContent = healthSubmitLabel(); }
});
$("#retry-analysis").addEventListener("click", () => runPrediction({ retryFailed: true }));
$("#retry-partial-analysis").addEventListener("click", () => runPrediction({ retryFailed: true }));
$("#retry-challenges").addEventListener("click", loadChallenges);
$("#challenge-v3-difficulty")?.addEventListener("change", loadChallenges);
$("#challenge-personal-mode")?.addEventListener("change", loadChallenges);
$("#challenge-context-settings")?.addEventListener("change", loadChallenges);
$("#challenge-v4-refresh")?.addEventListener("click", () => {
  challengeV3.rotation = (challengeV3.rotation + 1) % 1_000_001;
  void loadChallenges();
});
$("#challenge-v4-hydration")?.addEventListener("change", selectV3Challenges);
$("#challenge-v3-diet")?.addEventListener("change", selectV3Challenges);
$("#challenge-v3-activity")?.addEventListener("change", selectV3Challenges);
$$("[data-demo-status]").forEach((button) => button.addEventListener("click", () => {
  renderPredictionStatus(button.dataset.demoStatus);
  showStep(5);
}));
$("#risk-factor-focus")?.addEventListener("click", () => {
  $("#factor-panel-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
});
$("#find-nearby-medical-facilities")?.addEventListener("click", findNearbyMedicalFacilities);
$("#dashboard-find-nearby-medical-facilities")?.addEventListener("click", () => {
  closeHealthManagement();
  showStep(6);
  const guidance = $("#medical-guidance-detail");
  if (guidance) {
    $("#medical-challenge-next").hidden = !canContinueAfterMedicalGuidance();
    guidance.hidden = false;
    guidance.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("#find-nearby-medical-facilities")?.click();
});
$("#facility-address-form")?.addEventListener("submit", findMedicalFacilitiesByAddress);
$("#close-medical-guidance")?.addEventListener("click", () => {
  $("#medical-guidance-detail").hidden = true;
  $("#to-challenges")?.focus({ preventScroll: true });
});
$("#lifestyle-summary-grid")?.addEventListener("click", (event) => {
  const toggle = event.target.closest(".lifestyle-summary-toggle");
  if (!toggle) return;
  const shouldOpen = toggle.getAttribute("aria-expanded") !== "true";
  $$(".lifestyle-summary-toggle").forEach((button) => {
    const panel = $(`#${button.getAttribute("aria-controls")}`);
    const expanded = button === toggle && shouldOpen;
    button.setAttribute("aria-expanded", String(expanded));
    if (panel) panel.hidden = !expanded;
  });
});
$("#to-challenges").addEventListener("click", async () => {
  if (requiresMedicalResultGuidance()) {
    const guidance = $("#medical-guidance-detail");
    $("#medical-challenge-next").hidden = !canContinueAfterMedicalGuidance();
    guidance.hidden = false;
    guidance.focus({ preventScroll: true });
    guidance.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  try { await loadChallenges(); showStep(7); } catch (error) { showMessage(error.message); }
});
$("#medical-to-challenges").addEventListener("click", async (event) => {
  if (!canContinueAfterMedicalGuidance() || $("#medical-guidance-detail").hidden) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    // Keep the server's follow-up acknowledgement gate in loadChallenges/start.
    await loadChallenges();
    showStep(7);
  } catch (error) { showMessage(error.message); }
  finally { button.disabled = false; }
});
$("#challenge-list").addEventListener("click", (event) => {
  const categoryButton = event.target.closest("[data-challenge-category]");
  if (categoryButton) {
    closeRagChallengeGenerator();
    state.activeChallengeCategory = state.activeChallengeCategory === categoryButton.dataset.challengeCategory
      ? null : categoryButton.dataset.challengeCategory;
    $$("[data-challenge-category]").forEach((button) => {
      const active = button.dataset.challengeCategory === state.activeChallengeCategory;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-expanded", String(active));
    });
    renderChallengeDetails();
    updateChallengeSelectionCount();
    if (state.activeChallengeCategory) $("#challenge-category-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  const trigger = event.target.closest("#open-rag-challenge, .edit-rag-challenge");
  if (!trigger) return;
  const generator = $("#rag-challenge-generator");
  if (!generator.hidden) {
    closeRagChallengeGenerator({ moveFocus: true });
    return;
  }
  state.activeChallengeCategory = null;
  $$("[data-challenge-category]").forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-expanded", "false");
  });
  renderChallengeDetails();
  generator.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  generator.scrollIntoView({ behavior: "smooth", block: "center" });
  generator.focus({ preventScroll: true });
});
$("#challenge-list").addEventListener("change", (event) => {
  if (!event.target.matches("#custom-challenge-choice")) return;
  if (event.target.checked && state.selectedChallengeIds.size >= 3) {
    event.target.checked = false;
    showMessage("챌린지는 최대 3개까지 선택할 수 있어요.");
    return;
  }
  state.customChallengeSelected = event.target.checked;
  updateChallengeSelectionCount();
});
$("#challenge-detail-list").addEventListener("change", (event) => {
  if (!event.target.matches("input[name='challenge']")) return;
  closeRagChallengeGenerator();
  const challengeId = Number(event.target.value);
  if (event.target.checked && state.selectedChallengeIds.size + (state.customChallengeSelected ? 1 : 0) >= 3) {
    event.target.checked = false;
    showMessage("챌린지는 최대 3개까지 선택할 수 있어요.");
    return;
  }
  if (event.target.checked) state.selectedChallengeIds.add(challengeId);
  else state.selectedChallengeIds.delete(challengeId);
  updateChallengeSelectionCount();
  syncWalkingLevelPicker();
  if (!$("#walking-level-picker").hidden) $("#walking-level-picker").scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("#close-rag-challenge")?.addEventListener("click", () => {
  closeRagChallengeGenerator({ moveFocus: true });
});
$("#generate-rag-challenge")?.addEventListener("click", generateRagChallengeDraft);
$("#regenerate-rag-challenge")?.addEventListener("click", generateRagChallengeDraft);
$("#rag-challenge-candidate-grid")?.addEventListener("change", (event) => {
  if (event.target.name !== "rag-challenge-candidate") return;
  state.selectedRagChallengeId = event.target.value;
  renderRagChallengeSelection();
});
$("#apply-rag-challenge")?.addEventListener("click", () => {
  if (!state.ragChallengeDraft) {
    renderRagChallengeState("failed");
    return;
  }
  if (state.selectedChallengeIds.size >= 3 && !state.customChallengeSelected) {
    showMessage("챌린지는 최대 3개까지 선택할 수 있어요. 기존 선택을 하나 해제한 뒤 추가해 주세요.");
    return;
  }
  state.customChallenge = {
    title: state.ragChallengeDraft.title,
    goal: state.ragChallengeDraft.goal,
    recordType: state.ragChallengeDraft.recordType,
    recordLabel: { simple: "간편 체크", time: "시간 입력", count: "횟수 입력" }[state.ragChallengeDraft.recordType],
  };
  state.customChallengeSelected = true;
  renderChallengeChoices();
  closeRagChallengeGenerator();
  syncWalkingLevelPicker();
  $("#custom-challenge-choice")?.focus();
  showMessage("맞춤 챌린지를 추가했어요.", "success");
});
$("#walking-level-picker").addEventListener("change", (event) => {
  if (event.target.name === "walking-level") state.walkingLevel = event.target.value;
});
$("#challenge-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireActiveHealthConsent("새 챌린지 시작")) return;
  if (challengeV3.busy || state.challengeListStatus !== "ready" || !challengeV3.active || state.challengeStartSafetyBlocked) return;
  if (event.currentTarget.getAttribute("aria-busy") === "true") return;
  const token = state.token;
  if (!$("#challenge-follow-up").hidden) {
    $("#challenge-follow-up").focus({ preventScroll: true });
    showMessage("이전 의료기관 안내를 먼저 확인해 주세요.");
    return;
  }
  const ids = [...state.selectedChallengeIds];
  if (challengeV3.owner !== state.token) return showMessage("로그인한 계정의 후보를 다시 불러와 주세요.");
  if (ids.length !== 3) return showMessage("음료·식단·운동 각 1개가 필요합니다.");
  const customSelected = state.customChallengeSelected;
  if (!ids.length && !customSelected) return showMessage("챌린지를 하나 이상 선택해 주세요.");
  state.walkingLevel = selectedRadioValue("walking-level") || "starter";
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "챌린지 시작 중…");
  const controls = $$(".challenge-v3-controls input, .challenge-v3-controls select");
  controls.forEach((control) => { control.disabled = true; });
  try {
    if (isLocalPreview()) {
      const cycle = createLocalDemoCycle(ids, customSelected ? state.customChallenge : null);
      renderCycle(cycle);
      renderLocalDemoDashboard();
      await openChallengeTab({ selectionCompleted: true });
      return;
    }
    if (customSelected) {
      showMessage("맞춤 챌린지는 저장 API가 연결된 뒤 시작할 수 있어요. 선택한 내용은 현재 화면에 유지됩니다.");
      return;
    }
    const cycle = await api("/challenge-cycles", { method: "POST", body: JSON.stringify(challengeStartPayload(ids)) });
    if (state.token !== token) return;
    renderCycle(cycle);
    await openChallengeTab({ selectionCompleted: true });
    void refreshDashboard().catch(() => {});
  } catch (error) {
    if (state.token !== token) return;
    const hasActiveCycle = error.status === 409 && (
      error.code === "ACTIVE_CHALLENGE_CYCLE_EXISTS"
      || error.message.includes("진행 중인 4주 챌린지")
    );
    if (!hasActiveCycle) {
      showMessage(error.message);
      return;
    }
    try {
      const currentCycle = await api("/challenge-cycles/current");
      if (state.token !== token) return;
      renderCycle(currentCycle);
      await openChallengeTab();
      void refreshDashboard().catch(() => {});
      showMessage("이미 진행 중인 4주 챌린지를 불러왔어요.", "success");
    } catch (currentCycleError) {
      showMessage(currentCycleError.message || error.message);
    }
  }
  finally {
    releaseBusy();
    controls.forEach((control) => { control.disabled = false; });
    updateChallengeStartState();
  }
});
$("#acknowledge-challenge-follow-up").addEventListener("click", async (event) => {
  if (!state.openFollowUpActionIds.length) return;
  const token = state.token;
  const request = challengeV3.request;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "확인 처리 중…";
  try {
    await Promise.all(state.openFollowUpActionIds.map((actionId) => (
      api(`/follow-up-actions/${actionId}/acknowledge`, { method: "PATCH" })
    )));
    if (state.token !== token || challengeV3.request !== request) return;
    state.openFollowUpActionIds = [];
    const blockingReasons = state.eligibility?.reason_codes || [];
    const stillBlocked = blockingReasons.some((code) => (
      code === "URGENT_MEDICAL_ATTENTION" || code === "DIAGNOSED_DIABETES" || code === "UNDER_MINIMUM_SERVICE_AGE"
    ));
    $("#challenge-follow-up").hidden = true;
    state.challengeStartSafetyBlocked = stillBlocked;
    updateChallengeStartState();
    showMessage(stillBlocked
      ? "안내를 확인했습니다. 현재 안전 확인 결과에서는 챌린지를 시작할 수 없습니다."
      : "의료기관 안내 확인을 완료했습니다. 이제 챌린지를 시작할 수 있습니다.", "success");
  } catch (error) {
    if (state.token === token && challengeV3.request === request) showMessage(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "안내 확인 완료";
  }
});
$("#daily-log-list").addEventListener("click", (event) => {
  if (event.target.closest(".daily-record-retry")) {
    void loadDailyRecords();
    return;
  }
  const button = event.target.closest(".daily-record-open");
  if (!button || button.disabled) return;
  const card = button.closest(".daily-record-card");
  const item = state.cycle?.user_challenges?.find((challenge) => String(challenge.user_challenge_id) === card?.dataset.userChallengeId);
  if (!item) return;
  if (card.dataset.recordType === "photo") openPhotoRecordModal(item);
  else openSimpleRecordModal(item);
});
$("#water-serving-count")?.addEventListener("input", (event) => {
  syncWaterServingControl(event.currentTarget.value);
});
$$("[data-water-serving-step]").forEach((button) => button.addEventListener("click", () => {
  syncWaterServingControl(currentWaterServings() + Number(button.dataset.waterServingStep || 0));
}));
$("#confirm-simple-record").addEventListener("click", async (event) => {
  if (state.recordTarget?.completed) {
    closeRecordModal();
    return;
  }
  const releaseBusy = setButtonBusy(event.currentTarget, "기록 저장 중…");
  try {
    const target = state.recordTarget;
    const waterServingGoal = usesWaterServingControl(target?.item);
    const recordValue = waterServingGoal ? currentWaterServings() : 1;
    if (waterServingGoal) syncWaterServingControl(recordValue);
    $("#record-simple-visual").classList.add("completed");
    await sleep(450);
    closeRecordModal();
    await completeDailyRecord(target, "self_report", recordValue);
  } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
$("#undo-daily-record")?.addEventListener("click", async (event) => {
  const target = state.recordTarget;
  const releaseBusy = setButtonBusy(event.currentTarget, "기록 취소 중…");
  $("#record-action-error").hidden = true;
  try {
    await undoDailyRecord(target);
    closeRecordModal();
  } catch (error) {
    $("#record-action-error").textContent = error.message || "기록을 취소하지 못했습니다.";
    $("#record-action-error").hidden = false;
  } finally {
    releaseBusy();
  }
});
$$(".record-modal-close, .record-cancel").forEach((button) => button.addEventListener("click", closeRecordModal));
async function selectDemoPhoto(button) {
  try {
    const item = state.recordTarget?.item;
    if (item?.catalog_version !== "evidence-v3" || Number(item.verification_type) !== 1) return;
    const response = await fetch(button.dataset.demoPhoto);
    if (!response.ok) throw new Error("시연 사진을 불러오지 못했습니다.");
    const transfer = new DataTransfer();
    transfer.items.add(new File([await response.blob()], button.dataset.demoName, { type: "image/png" }));
    $("#v3-photo-file").files = transfer.files;
    await showPhotoSelectionPreview($("#v3-photo-file").files[0]);
    $$(".demo-photo-card").forEach((card) => card.setAttribute("aria-pressed", String(card === button)));
    $("#demo-photo-selection").textContent = `${button.querySelector("strong").textContent} 사진을 선택했습니다.`;
  } catch (error) { showMessage(error.message); }
}
$$('.demo-photo-card').forEach((button) => button.addEventListener('click', () => void selectDemoPhoto(button)));
$("#v3-photo-file").addEventListener("change", async () => {
  const input = $("#v3-photo-file");
  $$(".demo-photo-card").forEach((card) => card.setAttribute("aria-pressed", "false"));
  $("#demo-photo-selection").textContent = "";
  try {
    await showPhotoSelectionPreview(input.files[0]);
  } catch (error) {
    input.value = "";
    clearPhotoSelectionPreview();
    showMessage(error.message);
  }
});
$$('input[name="v3-photo-value"]').forEach((input) => input.addEventListener("change", () => {
  if (!input.checked) return;
  $$('input[name="v3-photo-value"]').forEach((other) => { if (other !== input) other.checked = false; });
  $("#v3-meal-count-field")?.classList.remove("invalid");
  $("#v3-photo-validation")?.classList.remove("error");
}));
$("#v3-photo-minutes")?.addEventListener("input", () => {
  $("#v3-photo-minutes-field")?.classList.remove("invalid");
  $("#v3-photo-validation")?.classList.remove("error");
});
$("#record-modal").addEventListener("click", (event) => {
  if (event.target.id === "record-modal") closeRecordModal();
});
$("#confirm-photo-record").addEventListener("click", () => {
  if (state.recordTarget?.item?.catalog_version === "evidence-v3") { void submitV3Photo(); return; }
  state.photoAttempt = 0;
  simulatePhotoAnalysis();
});
$("#start-photo-check").addEventListener("click", () => {
  if (state.recordTarget?.item?.catalog_version === "evidence-v3") $("#v3-photo-file").click();
  else $("#confirm-photo-record").click();
});
$("#retake-photo-record").addEventListener("click", () => {
  if (state.recordTarget?.item?.catalog_version === "evidence-v3") showPhotoRecordState("photo-state-upload");
  else simulatePhotoAnalysis();
});
$$(".record-fallback").forEach((button) => button.addEventListener("click", () => {
  if (state.recordTarget?.item?.catalog_version === "evidence-v3") return;
  state.photoCompletedByFallback = true;
  $("#photo-success-title").textContent = "간편 체크로 완료됐어요!";
  showPhotoRecordState("photo-state-success");
}));
$("#close-photo-success").addEventListener("click", async (event) => {
  if (state.recordTarget?.item?.catalog_version === "evidence-v3") { closeRecordModal(); return; }
  const releaseBusy = setButtonBusy(event.currentTarget, "기록 저장 중…");
  try {
    const target = state.recordTarget;
    const source = state.photoCompletedByFallback ? "self_report" : "photo";
    closeRecordModal();
    await completeDailyRecord(target, source);
  } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
$("#daily-log-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "오늘 기록 저장 중…");
  try {
    if (isLocalPreview()) {
      const completed = $$("input[name='daily']:checked").length;
      $("#dashboard-complete").textContent = `${completed}개`;
      showMessage("오늘 기록을 화면 확인용으로 저장했습니다.", "success");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all($$("input[name='daily']").map((input) => api(`/user-challenges/${input.value}/logs/${today}`, {
      method: "PUT", body: JSON.stringify({ is_completed: input.checked, source: "self_report", note: null }),
    })));
    await refreshDashboard(); showMessage("오늘 기록을 저장했습니다.", "success");
  } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
$("#barrier-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (isLocalPreview()) {
      $("#barrier-suggestion").textContent = "목표를 더 작게 나누고, 내일 다시 시작해 보세요.";
      showMessage("실천하지 못한 이유를 화면 확인용으로 저장했습니다.", "success");
      return;
    }
    const result = await api(`/user-challenges/${$("#barrier-challenge").value}/barriers`, { method: "POST", body: JSON.stringify({
      log_date: new Date().toISOString().slice(0, 10), reason_code: $("#barrier-reason").value,
    }) });
    $("#barrier-suggestion").textContent = result.suggestion;
    await loadWeeklyReport();
  } catch (error) { showMessage(error.message); }
});
$("#education-list")?.addEventListener("click", (event) => {
  const button = event.target.closest(".education-open");
  if (button) {
    moveEducationFlow("#education-flow-host-tools");
    openEducationFlow(button.dataset.id);
  }
});
$("#close-education-flow")?.addEventListener("click", closeEducationFlow);
$("#start-education-quiz")?.addEventListener("click", () => {
  const item = activeEducationContent();
  if (item?.locked) {
    showMessage(`${item.week_number}주차가 되면 퀴즈를 풀 수 있어요. 지금은 내용만 미리 볼 수 있어요.`);
    return;
  }
  renderEducationQuizQuestion();
});
$("#education-quiz-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const item = activeEducationContent();
  const questions = item ? educationQuestions(item) : [];
  const question = questions[state.educationQuizIndex];
  const answer = new FormData(event.currentTarget).get("education-answer");
  if (!item || !question || !answer) return;
  const submitButton = event.submitter;
  const releaseBusy = setButtonBusy(submitButton, "답 확인 중…");
  try {
    const result = isLocalPreview()
      ? { is_correct: answer === question.correctAnswer, correct_answer: question.correctAnswer, explanation: question.explanation, source: question.source }
      : question.quizId
        ? await api(`/health-education/quizzes/${encodeURIComponent(question.quizId)}/answers`, { method: "POST", body: JSON.stringify({ answer }) })
        : await api(`/education-contents/${item.content_id}/progress`, { method: "PUT", body: JSON.stringify({ quiz_answer: answer }) });
    const isCorrect = Boolean(result.is_correct);
    if (isCorrect) state.educationQuizCorrectCount += 1;
    $("#education-quiz-form").hidden = true;
    const feedback = $("#education-feedback-card");
    feedback.hidden = false;
    feedback.dataset.result = isCorrect ? "correct" : "incorrect";
    const correctAnswer = result.correct_answer || question.correctAnswer;
    $("#education-feedback-title").textContent = isCorrect
      ? `정답입니다 · 정답: ${correctAnswer}`
      : `다시 확인해 볼까요? · 정답: ${correctAnswer}`;
    $("#education-feedback-explanation").textContent = question.explanation || result.explanation;
    const source = result.source || question.source || item.source;
    const sourceRoot = $("#education-feedback-source");
    sourceRoot.textContent = source?.title ? "근거 및 출처: " : "근거 자료를 확인해 주세요.";
    const sourceUrl = safeExternalUrl(source?.url);
    if (source?.title) {
      const link = document.createElement(sourceUrl ? "a" : "span");
      link.textContent = source.title;
      if (sourceUrl) { link.href = sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; }
      sourceRoot.append(link);
    }
    const action = $("#education-feedback-action");
    if (!isCorrect) {
      action.dataset.action = "review";
      action.textContent = "교육 내용 다시 보기";
    } else if (state.educationQuizIndex < questions.length - 1) {
      action.dataset.action = "next";
      action.textContent = "다음 문항";
    } else {
      item.completed = true;
      item.is_correct = true;
      renderEducationList();
      action.dataset.action = "close";
      action.textContent = "교육 목록으로";
    }
    $("#education-feedback-title").setAttribute("tabindex", "-1");
    $("#education-feedback-title").focus();
  } catch (error) {
    showMessage(error.message || "퀴즈 답변을 저장하지 못했습니다.");
  } finally {
    releaseBusy();
  }
});
$("#education-feedback-action")?.addEventListener("click", (event) => {
  const action = event.currentTarget.dataset.action;
  if (action === "review") {
    $("#education-feedback-card").hidden = true;
    $("#education-reading-card").hidden = false;
    $("#education-reading-card").scrollIntoView({ block: "start" });
    $("#start-education-quiz").focus();
    return;
  }
  if (action === "next") {
    state.educationQuizIndex += 1;
    renderEducationQuizQuestion();
    return;
  }
  closeEducationFlow();
});
$("#invite-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "초대 코드 만드는 중…");
  try {
    const result = await api("/invitations", { method: "POST", body: JSON.stringify({
      invitee_email: $("#invite-email").value, relation_type: "family",
    }) });
    renderInviteCodeResult(result);
  } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
$("#accept-invitation-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const tokenInput = $("#invitation-token");
  const token = tokenInput.value.trim();
  if (!tokenInput.checkValidity()) {
    tokenInput.reportValidity();
    return;
  }
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "초대 수락 중…");
  try {
    await api("/invitations/accept", { method: "POST", body: JSON.stringify({ token }) });
    tokenInput.value = "";
    const url = new URL(window.location.href);
    if (url.searchParams.has("invite_token")) {
      url.searchParams.delete("invite_token");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    await Promise.all([loadInvitations(), loadConnections()]);
    showMessage("초대를 수락했습니다. 함께하는 가족·친구 목록에서 확인해 주세요.", "success");
  } catch (error) { showMessage(error.message || "초대를 수락하지 못했습니다."); }
  finally { releaseBusy(); }
});
$("#received-invitation-list")?.addEventListener("click", (event) => {
  if (event.target.closest(".retry-invitations")) loadInvitations();
});
$$("[data-invite-mode]").forEach((button) => button.addEventListener("click", () => setInviteMode(button.dataset.inviteMode)));
$$("[data-invite-disclosure]").forEach((button) => button.addEventListener("click", () => {
  setInviteDisclosure(button.getAttribute("aria-controls"));
}));
$$("[data-invite-close]").forEach((button) => button.addEventListener("click", () => {
  closeInviteDisclosure(button.dataset.inviteClose);
}));
$("#copy-invite-code")?.addEventListener("click", async () => {
  const code = $("#forest-invite-code")?.dataset.copyValue || "";
  if (!code) {
    showMessage("실제 초대 코드 발급 기능을 준비하고 있습니다.");
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    showMessage("초대 코드를 복사했습니다.", "success");
  } catch (error) {
    showMessage(`초대 코드: ${code}`, "success");
  }
});
$(".group-leave-button")?.addEventListener("click", () => {
  showMessage("그룹 나가기는 당근의 숲 API 연동 후 확인 절차와 함께 활성화할 예정입니다.", "success");
});
$("#connection-list").addEventListener("click", async (event) => {
  const menuButton = event.target.closest(".member-menu-button");
  if (menuButton) {
    event.stopPropagation();
    const menu = document.getElementById(menuButton.getAttribute("aria-controls"));
    const nextOpen = menu?.hidden;
    closeMemberMenus();
    if (menu && nextOpen) {
      menu.hidden = false;
      menuButton.setAttribute("aria-expanded", "true");
    }
    return;
  }
  const delegate = event.target.closest(".delegate-leader");
  if (delegate) {
    closeMemberMenus();
    showMessage("그룹장 위임은 당근의 숲 API 연동 후 활성화할 예정입니다.", "success");
    return;
  }
  const disconnect = event.target.closest(".disconnect-connection");
  if (!disconnect) return;
  try {
    const target = disconnect;
    await api(`/connections/${target.dataset.id}`, { method: "DELETE" });
    await loadConnections();
    showMessage("그룹에서 내보냈습니다.", "success");
  } catch (error) { showMessage(error.message); }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".member-menu-wrap")) closeMemberMenus();
});
$("#gender").addEventListener("change", syncLifestyleAvatar);
$("#eligibility-birth-date").addEventListener("change", syncLifestyleAvatar);
[$("#height"), $("#weight")].forEach((input) => input.addEventListener("input", syncLifestyleAvatar));
async function resumeAuthenticatedAccount() {
  try {
    const profile = await api("/users/me");
    state.userProfile = profile;
    if (profile.birthday) $("#eligibility-birth-date").value = profile.birthday;
    if (profile.gender) $("#gender").value = profile.gender;
    syncLifestyleAvatar();
    const consents = await api("/consents");
    if (!Array.isArray(consents?.items)) throw new Error("동의 정보를 확인하지 못했습니다.");
    syncHealthConsentState(consents);
    const profileSaved = Boolean(profile.birthday && ["FEMALE", "MALE"].includes(profile.gender));
    if (!profileSaved || !hasHealthDataConsent(consents)) {
      showAccountRecovery({ email: $("#login-email").value.trim(), token: state.token,
        name: profile.name, birthday: profile.birthday, gender: profile.gender, profileSaved,
        healthAgreed: hasHealthDataConsent(consents), consentSaved: hasHealthDataConsent(consents),
        reconcileConsent: true, stage: profileSaved ? "consent" : "profile" },
      profileSaved ? "프로필은 저장되어 있습니다. 건강정보 수집·이용 동의를 확인하고 계속해 주세요." : "저장되지 않은 프로필과 건강정보 동의를 확인해 주세요.");
      return;
    }
    state.accountRecovery = null;
    $("#account-recovery-form").hidden = true;
    let latestEligibility = null;
    try {
      latestEligibility = await api("/eligibility-checks/latest");
    } catch (eligibilityError) {
      if (eligibilityError.status !== 404) throw eligibilityError;
    }
    syncReturningEligibilityState(latestEligibility);
    const healthHistory = await api("/health-checkups");
    state.healthCheckupHistory = Array.isArray(healthHistory?.items) ? healthHistory.items : [];
    renderHealthCheckupHistory();
    const latestHealthCheckup = Array.isArray(healthHistory?.items) ? healthHistory.items[0] : null;
    state.returningUser = true;
    state.visitedSteps.add(2);
    if (latestHealthCheckup) {
      state.checkupId = latestHealthCheckup.checkup_id;
      state.healthCheckupResult = latestHealthCheckup;
      rememberCurrentScreeningInputId(latestHealthCheckup);
    }
    if (resumeInterruptedHealthFlow(latestHealthCheckup)) return;
    try {
      const cycle = await api("/challenge-cycles/current");
      renderCycle(cycle);
      await refreshDashboard();
    } catch (cycleError) {
      if (cycleError.status !== 404 && !cycleError.message.includes("진행 중인 챌린지가 없습니다")) throw cycleError;
    }
    if (!latestHealthCheckup) {
      if (state.requiresEligibility) beginReturningEligibility("health");
      else if (state.capabilities.currentHealth) openReturningUserHealthEdit();
      else showStoredEligibilityGuidance();
      showMessage("저장된 건강정보가 없어 건강정보 입력으로 안내합니다.", "success");
      return;
    }
    [4, 8].forEach((step) => state.visitedSteps.add(step));
    showWorkspace("home", { moveFocus: false });
    showStep(8);
  } catch (error) {
    if (error.status === 401 && state.sessionRecovery) return;
    if (error.status === 401) state.token = null;
    if (state.token) {
      state.accountRecovery = null;
      $("#account-recovery-form").hidden = true;
      state.returningUser = true;
      state.visitedSteps.add(2);
      showStep(3, { recordHistory: false });
      showMessage("로그인은 완료했지만 저장된 이용 정보를 불러오지 못했습니다. 건강정보 확인부터 다시 진행해 주세요.");
      return;
    }
    showAccountRecovery({ email: $("#login-email").value.trim(), token: null, verifyOnly: true },
      "로그인 시간이 만료되었습니다. 기존 계정으로 다시 로그인해 주세요.");
  }
}

async function resumeCookieSession() {
  if (state.token || isLocalPreview()) return false;
  try {
    const refreshed = await api("/auth/token/refresh");
    if (!refreshed?.access_token) return false;
    state.token = refreshed.access_token;
    await resumeAuthenticatedAccount();
    return true;
  } catch (error) {
    if (error.status !== 401) console.warn("저장된 로그인 상태를 복원하지 못했습니다.");
    return false;
  }
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.getAttribute("aria-busy") === "true") return;
  const releaseBusy = setFormBusy(form, event.submitter, "로그인 중…");
  try {
    const login = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: $("#login-email").value, password: $("#login-password").value }) });
    if (!login.access_token) throw new Error("로그인 정보를 받지 못했습니다.");
    state.token = login.access_token;
    $("#login-password").value = "";
    await resumeAuthenticatedAccount();
  } catch (error) {
    showAuthError(form, error);
  } finally {
    releaseBusy();
  }
});
setupAuthAccessibility();
$("#return-dashboard")?.addEventListener("click", () => {
  if (!state.cycle?.user_challenges?.length) {
    showMessage("진행 중인 챌린지가 없습니다. 먼저 챌린지를 선택해 주세요.");
    return;
  }
  showWorkspace("home", { moveFocus: false });
  showStep(8);
});
$("#return-challenges")?.addEventListener("click", async () => {
  if (state.requiresEligibility) {
    beginReturningEligibility("challenges");
    return;
  }
  if (state.medicalGuidanceRequired) {
    showStoredEligibilityGuidance();
    return;
  }
  await loadChallenges();
  showStep(7);
});
$("#daily-log-list")?.addEventListener("click", async (event) => {
  if (!event.target.closest(".daily-record-select")) return;
  await openChallengeSelectionScreen();
});
$("#return-health")?.addEventListener("click", () => {
  if (state.requiresEligibility) {
    beginReturningEligibility("health");
    return;
  }
  if (!state.capabilities.currentHealth) {
    showStoredEligibilityGuidance();
    return;
  }
  openReturningUserHealthEdit();
});
$("#return-login-back")?.addEventListener("click", () => {
  state.returningUser = false;
  state.token = null;
  state.cycle = null;
  syncReturningEligibilityState(null);
  state.returningDestination = null;
  showAuthMode("login");
});
$("#dashboard-edit-health").addEventListener("click", async () => {
  try {
    state.editingHealthCheckupId = null;
    state.healthFormCheckupId = null;
    await openDashboardHealthEdit();
  } catch (error) {
    showMessage(error.message || "건강정보 입력 화면으로 이동하지 못했습니다.");
  }
});
$("#health-history-list").addEventListener("click", async (event) => {
  const resultButton = event.target.closest("[data-health-history-result]");
  if (resultButton) {
    event.preventDefault();
    event.stopPropagation();
    const releaseBusy = setButtonBusy(resultButton, "결과 여는 중…");
    try {
      await openSavedAnalysisResult(resultButton.dataset.healthHistoryResult);
    } catch (error) {
      showMessage(error.message || "저장된 분석 결과를 불러오지 못했습니다.");
    } finally {
      releaseBusy();
    }
    return;
  }
  const button = event.target.closest("[data-health-history-edit]");
  if (!button) return;
  try {
    event.preventDefault();
    event.stopPropagation();
    const checkup = state.healthCheckupHistory.find((item) => String(item.checkup_id) === button.dataset.healthHistoryEdit);
    if (!checkup) throw new Error("수정할 건강정보를 찾지 못했습니다.");
    state.editingHealthCheckupId = checkup.checkup_id;
    state.healthFormCheckupId = null;
    state.healthCheckupResult = checkup;
    await openDashboardHealthEdit();
    hydrateSavedHealthForm(checkup);
    $("#submit-analysis").textContent = "수정 내용 저장하기";
  } catch (error) {
    showMessage(error.message || "건강정보 입력 화면으로 이동하지 못했습니다.");
  }
});
$("#health-history-pagination")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-health-history-page]");
  if (!button) return;
  state.healthHistoryPage = Number(button.dataset.healthHistoryPage) || 1;
  renderHealthCheckupHistory();
  $("#health-history-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
});
$("#health-history-filter")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const startDate = $("#health-history-start-date").value;
  const endDate = $("#health-history-end-date").value;
  if (startDate && endDate && startDate > endDate) {
    showMessage("시작일은 종료일보다 늦을 수 없습니다.");
    return;
  }
  state.healthHistoryStartDate = startDate;
  state.healthHistoryEndDate = endDate;
  state.healthHistoryPage = 1;
  renderHealthCheckupHistory();
});
$("#health-history-filter-reset")?.addEventListener("click", () => {
  $("#health-history-start-date").value = "";
  $("#health-history-end-date").value = "";
  state.healthHistoryStartDate = "";
  state.healthHistoryEndDate = "";
  state.healthHistoryPage = 1;
  renderHealthCheckupHistory();
});
$("#shared-group-list")?.addEventListener("click", async (event) => {
  const accept = event.target.closest(".accept-shared");
  const cheer = event.target.closest(".cheer-shared");
  if (!accept && !cheer) return;
  try {
    if (accept) {
      await api(`/shared-challenge-groups/${accept.dataset.id}/accept`, { method: "POST" });
      showMessage("공동 챌린지에 참여했습니다.", "success");
    } else {
      await api(`/shared-challenge-groups/${cheer.dataset.id}/encouragements`, { method: "POST", body: JSON.stringify({ recipient_user_id: Number(cheer.dataset.user), template_code: "together" }) });
      showMessage("함께하는 사람에게 응원을 보냈습니다.", "success");
    }
    await loadSharedGroups();
  } catch (error) { showMessage(error.message); }
});
function wearableSampleItems(provider) {
  const isoDate = (daysAgo) => {
    const value = new Date();
    value.setDate(value.getDate() - daysAgo);
    return value.toISOString().slice(0, 10);
  };
  const values = provider === "apple_health_export"
    ? [[8230, 42, 430, 62], [6140, 35, 455, 64], [9570, 48, 445, 61]]
    : [[8150, 38, 460, 65], [7200, 36, 420, 66], [10320, 51, 450, 63]];
  return values.map(([steps, active_minutes, sleep_minutes, resting_heart_rate], index) => ({
    summary_date: isoDate(2 - index), steps, active_minutes, sleep_minutes, resting_heart_rate,
  }));
}

function showWearablePreview(provider, items, label) {
  if (state.wearableProvider !== provider) state.wearableConnectionId = null;
  state.wearableProvider = provider;
  state.wearablePreviewItems = items;
  $("#wearable-provider").value = provider;
  $("#wearable-steps").value = items.at(-1)?.steps ?? "";
  $("#wearable-active").value = items.at(-1)?.active_minutes ?? "";
  const totalSteps = items.reduce((sum, item) => sum + (item.steps || 0), 0);
  const totalMinutes = items.reduce((sum, item) => sum + (item.active_minutes || 0), 0);
  const box = $("#wearable-result");
  box.hidden = false;
  box.innerHTML = `<div><strong>${escapeHtml(label)}에서 ${items.length}일 기록을 찾았습니다.</strong><p>걸음 ${escapeHtml(totalSteps.toLocaleString())}보, 활동 ${escapeHtml(totalMinutes)}분을 확인해 주세요. 아직 건강정보에는 반영되지 않았습니다.</p></div>`;
  $("#apply-wearable-preview").hidden = false;
}

$("#connect-watch")?.addEventListener("click", () => $("#wearable-file-input")?.click());
$("#try-apple-wearable-sample")?.addEventListener("click", () => {
  showWearablePreview("apple_health_export", wearableSampleItems("apple_health_export"), "Apple 시연 데이터");
});
$("#try-android-wearable-sample")?.addEventListener("click", () => {
  showWearablePreview("android_health_connect", wearableSampleItems("android_health_connect"), "Android 시연 데이터");
});
$("#wearable-file-input")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const provider = file.name.toLowerCase().endsWith(".xml") ? "apple_health_export" : "android_health_connect";
  const body = new FormData();
  body.append("provider", provider);
  body.append("file", file);
  try {
    const result = await api("/wearables/file-previews", { method: "POST", body });
    showWearablePreview(provider, result.items, file.name);
  } catch (error) { showMessage(error.message); }
  finally { event.target.value = ""; }
});

async function applyWearablePreview() {
  const items = state.wearablePreviewItems;
  if (!items.length) return;
  if (isLocalPreview()) {
    const activityDays = items.filter((item) => (item.active_minutes || 0) >= 10 || (item.steps || 0) >= 1000);
    const totalMinutes = activityDays.reduce((sum, item) => sum + (item.active_minutes || 0), 0);
    const averageMinutes = activityDays.length ? Math.round(totalMinutes / activityDays.length) : 0;
    setRadioValue("regular-exercise", activityDays.length >= 3 && totalMinutes >= 150);
    $("#exercise-days").value = activityDays.length;
    $("#exercise-minutes").value = averageMinutes;
    $("#wearable-result").innerHTML = `<div><strong>건강정보가 갱신되었습니다.</strong><p>운동 일수 주 ${activityDays.length}일, 회당 활동 시간 약 ${averageMinutes}분이 반영되었습니다.</p><p>운동 챌린지와 연동합니다.</p></div>`;
    $("#apply-wearable-preview").hidden = true;
    return;
  }
  if (!state.checkupId) throw new ApiError("먼저 기본 건강정보를 등록해 주세요.");
  if (!state.wearableConnectionId) {
    const connection = await api("/wearables/connections", { method: "POST", body: JSON.stringify({ provider: state.wearableProvider, scopes: ["activity", "sleep", "heart_rate"] }) });
    state.wearableConnectionId = connection.connection_id;
  }
  const imported = await api("/wearables/daily-summaries/import", { method: "POST", body: JSON.stringify({ connection_id: state.wearableConnectionId, items }) });
  const dates = items.map((item) => item.summary_date).sort();
  const candidates = await api(`/wearables/health-candidates?start_date=${encodeURIComponent(dates[0])}&end_date=${encodeURIComponent(dates.at(-1))}`);
  const updated = await api(`/wearables/health-candidates/${state.checkupId}`, { method: "PATCH", body: JSON.stringify(candidates.health_input_candidates) });
  const fields = updated.updated_fields;
  setRadioValue("regular-exercise", fields.regular_exercise);
  $("#exercise-days").value = fields.exercise_days_per_week;
  $("#exercise-minutes").value = fields.exercise_minutes;
  await loadHealthCheckupHistory();
  const challengeCopy = imported.auto_logged_challenges.length
    ? `운동 챌린지 ${imported.auto_logged_challenges.length}건과 연동했습니다.`
    : "운동 인증 후보를 만들었습니다. 활성 운동 챌린지가 있으면 연동됩니다.";
  $("#wearable-result").innerHTML = `<div><strong>${escapeHtml(updated.message)}</strong><p>운동 일수 주 ${escapeHtml(fields.exercise_days_per_week)}일, 회당 활동 시간 약 ${escapeHtml(fields.exercise_minutes)}분, 규칙적 운동 ${fields.regular_exercise ? "예" : "아니요"}가 반영되었습니다.</p><p>${escapeHtml(challengeCopy)}</p></div>`;
  $("#apply-wearable-preview").hidden = true;
}

$("#apply-wearable-preview")?.addEventListener("click", async (event) => {
  const releaseBusy = setButtonBusy(event.currentTarget, "건강정보 갱신 중…");
  try { await applyWearablePreview(); } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});

$("#wearable-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "워치 기록 저장 중…");
  try {
    showWearablePreview($("#wearable-provider").value, [{
      summary_date: new Date().toISOString().slice(0, 10),
      steps: Number($("#wearable-steps").value), active_minutes: Number($("#wearable-active").value),
    }], "직접 입력한 기록");
  } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
function normalizeHealthEducationResult(result) {
  const medicalNotice = "일반 건강교육 정보이며 개인 진단·처방을 대신하지 않습니다.";
  const states = {
    grounded: ["근거 자료에서 답변을 찾았어요", "done"],
    insufficient_evidence: ["근거를 충분히 찾지 못했어요", "insufficient"],
    medical_safety_refusal: ["의료진 확인이 필요한 질문입니다", "refused"],
    emergency_redirect: ["지금은 건강정보 검색보다 119 연락이 먼저입니다", "emergency"],
  };
  const answer = typeof result?.answer === "string" ? result.answer.trim() : "";
  if (!answer) return { title: "표시할 답변이 없어요", state: "empty", answer: "질문을 바꾸거나 다시 시도해 주세요.", citations: [], medicalNotice };
  const status = Object.hasOwn(states, result.answer_status) ? states[result.answer_status] : null;
  if (!status) throw new Error("건강교육 응답 형식을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  const citations = (Array.isArray(result.citations) ? result.citations : []).flatMap(item => {
    const url = safeExternalUrl(item?.url);
    return url ? [{ url, title: typeof item.title === "string" ? item.title : "근거 자료" }] : [];
  });
  if (result.answer_status === "grounded" && !citations.length) {
    return { title: "답변의 출처를 확인하지 못했어요", state: "insufficient", answer: "확인 가능한 근거가 없어 답변을 표시하지 않습니다. 다시 시도해 주세요.", citations: [], medicalNotice };
  }
  return { title: status[0], state: status[1], answer, citations, medicalNotice: typeof result.medical_notice === "string" && result.medical_notice.trim() ? result.medical_notice : medicalNotice };
}

$("#rag-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const releaseBusy = setFormBusy(form, event.submitter, "근거 자료 검색 중…");
  const box = $("#rag-result");
  box.hidden = false;
  box.dataset.state = "loading";
  box.innerHTML = "<div><strong>승인된 건강자료에서 근거를 찾고 있어요.</strong><p>잠시만 기다려 주세요.</p></div>";
  try {
    const result = await api("/health-education/questions", { method: "POST", body: JSON.stringify({ question: $("#rag-question").value }) });
    const view = normalizeHealthEducationResult(result);
    const citations = view.citations.map(item => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></li>`).join("");
    box.dataset.state = view.state;
    box.innerHTML = `<div><strong>${escapeHtml(view.title)}</strong><p>${escapeHtml(view.answer)}</p>${citations ? `<p class="rag-citation-title">근거 및 출처</p><ul>${citations}</ul>` : ""}<small>${escapeHtml(view.medicalNotice)}</small></div>`;
  } catch (error) {
    box.dataset.state = "failed";
    box.innerHTML = `<div><strong>건강교육 정보를 불러오지 못했어요</strong><p>${escapeHtml(error?.retryable ? "잠시 후 다시 시도해 주세요." : error.message)}</p></div>`;
  } finally {
    releaseBusy();
  }
});
function showOcrPreview(result, label) {
  const fields = result.extracted_fields || {};
  state.ocrDraftId = result.draft_id;
  state.ocrExtractedFields = fields;
  $("#ocr-file-name").textContent = label;
  $("#ocr-height-confirm").value = fields.height_cm ?? "";
  $("#ocr-weight-confirm").value = fields.weight_kg ?? "";
  $("#ocr-waist-confirm").value = fields.waist_cm ?? "";
  $("#ocr-systolic-confirm").value = fields.systolic_bp ?? "";
  $("#ocr-diastolic-confirm").value = fields.diastolic_bp ?? "";
  $("#ocr-confirm-form").hidden = false;
  const box = $("#ocr-upload-result");
  box.hidden = false;
  const labels = [
    ["신장", fields.height_cm, "cm"], ["체중", fields.weight_kg, "kg"], ["허리둘레", fields.waist_cm, "cm"],
    ["혈압", fields.systolic_bp != null && fields.diastolic_bp != null ? `${fields.systolic_bp}/${fields.diastolic_bp}` : null, "mmHg"],
    ["공복혈당", fields.fasting_glucose_mg_dl, "mg/dL"],
  ].filter(([, value]) => value != null).map(([name, value, unit]) => `${name} ${value}${unit}`).join(", ");
  box.innerHTML = `<div><strong>${escapeHtml(label)}에서 건강정보를 찾았습니다.</strong><p>${escapeHtml(labels)}. 확인하기 전에는 갱신되지 않습니다.</p></div>`;
}

async function createOcrPreview(documentName, ocrText) {
  if (isLocalPreview()) {
    return { draft_id: "local-ocr-demo", extracted_fields: { height_cm: 168.2, weight_kg: 72.4, waist_cm: 86, systolic_bp: 132, diastolic_bp: 84, fasting_glucose_mg_dl: 108 } };
  }
  return api("/ocr-drafts", { method: "POST", body: JSON.stringify({ document_name: documentName, ocr_text: ocrText }) });
}

async function createOcrImagePreview(file) {
  if (isLocalPreview()) {
    return { draft_id: "local-ocr-demo", provider: "development_mock", extracted_fields: { height_cm: 168.2, weight_kg: 72.4, waist_cm: 86, systolic_bp: 132, diastolic_bp: 84, fasting_glucose_mg_dl: 108 } };
  }
  if (!$("#ocr-external-provider-consent")?.checked) {
    throw new ApiError("검진표를 외부 OCR 서비스에 전송하는 데 동의한 뒤 업로드해 주세요.");
  }
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("external_provider_consent", "true");
  return api("/ocr-drafts/from-image", { method: "POST", body: formData });
}

$("#upload-checkup-image")?.addEventListener("click", () => {
  if (!$("#ocr-external-provider-consent")?.checked) {
    showMessage("외부 OCR 처리 동의를 확인한 뒤 결과통보서를 업로드해 주세요.");
    $("#ocr-external-provider-consent")?.focus();
    return;
  }
  $("#checkup-image-input")?.click();
});
$("#load-checkup-sample")?.addEventListener("click", async () => {
  const sampleText = "검진일: 2025-06-18\n신장: 168.2 cm\n체중: 72.4 kg\n허리둘레: 86.0 cm\n체질량지수 BMI: 25.6\n혈압: 132 / 84 mmHg\n공복혈당: 108 mg/dL";
  try {
    showOcrPreview(await createOcrPreview("2025-general-health-checkup-synthetic.txt", sampleText), "2025 일반건강검진 합성 예시");
  } catch (error) { showMessage(error.message); }
});
$("#checkup-image-input")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    showOcrPreview(await createOcrImagePreview(file), file.name);
  } catch (error) { showMessage(error.message); }
  finally { event.target.value = ""; }
});
$("#ocr-confirm-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const releaseBusy = setFormBusy(event.currentTarget, event.submitter, "건강정보 갱신 중…");
  const candidate = (id) => $(id).value === "" ? null : Number($(id).value);
  const updates = {
    height_cm: candidate("#ocr-height-confirm"), weight_kg: candidate("#ocr-weight-confirm"),
    waist_cm: candidate("#ocr-waist-confirm"), systolic_bp: candidate("#ocr-systolic-confirm"),
    diastolic_bp: candidate("#ocr-diastolic-confirm"),
  };
  try {
    let result;
    if (isLocalPreview()) {
      result = { message: "건강정보가 갱신되었습니다.", updated_fields: Object.fromEntries(Object.entries(updates).filter(([, value]) => value != null)) };
    } else {
      if (!state.checkupId) throw new ApiError("먼저 기본 건강정보를 등록해 주세요.");
      result = await api(`/ocr-drafts/${state.ocrDraftId}/health-checkups/${state.checkupId}`, { method: "PATCH", body: JSON.stringify(updates) });
      await loadHealthCheckupHistory();
    }
    const inputMap = { height_cm: "#height", weight_kg: "#weight", waist_cm: "#waist", systolic_bp: "#systolic", diastolic_bp: "#diastolic" };
    Object.entries(result.updated_fields).forEach(([key, value]) => { if (inputMap[key]) $(inputMap[key]).value = value; });
    const fieldLabels = { height_cm: "신장", weight_kg: "체중", waist_cm: "허리둘레", systolic_bp: "수축기 혈압", diastolic_bp: "이완기 혈압", bmi: "BMI" };
    const changed = Object.keys(result.updated_fields).map((key) => fieldLabels[key] || key).join(", ");
    $("#ocr-upload-result").innerHTML = `<div><strong>${escapeHtml(result.message)}</strong><p>갱신 항목: ${escapeHtml(changed)}</p></div>`;
    $("#ocr-confirm-form").hidden = true;
  } catch (error) { showMessage(error.message); }
  finally { releaseBusy(); }
});
$("#food-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/food-analyses", { method: "POST", body: JSON.stringify({ image_name: $("#food-image-name").value }) });
    state.foodAnalysisId = result.analysis_id;
    state.foodCategory = result.predicted_category;
    $("#confirm-food").hidden = false;
    const box = $("#assist-result"); box.hidden = false; box.textContent = `식단 분류 초안: ${result.predicted_category}. ${result.notice}`;
  } catch (error) { showMessage(error.message); }
});
$("#ocr-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/ocr-drafts", { method: "POST", body: JSON.stringify({ document_name: "checkup-image.jpg", extracted_fields: { systolic_bp: Number($("#ocr-systolic").value) } }) });
    state.ocrDraftId = result.draft_id;
    $("#confirm-ocr").hidden = false;
    const box = $("#assist-result"); box.hidden = false; box.textContent = `OCR 초안: 수축기 혈압 ${result.extracted_fields.systolic_bp}. ${result.notice}`;
  } catch (error) { showMessage(error.message); }
});
$("#confirm-food")?.addEventListener("click", async () => {
  if (!state.foodAnalysisId) return;
  try {
    const result = await api(`/food-analyses/${state.foodAnalysisId}/confirm`, { method: "PATCH", body: JSON.stringify({ confirmed_category: state.foodCategory || "확인불가" }) });
    $("#assist-result").textContent = `식단 기록을 ${result.confirmed_category}로 확인했습니다.`;
    $("#confirm-food").hidden = true;
  } catch (error) { showMessage(error.message); }
});
$("#confirm-ocr")?.addEventListener("click", async () => {
  if (!state.ocrDraftId) return;
  try {
    const result = await api(`/ocr-drafts/${state.ocrDraftId}/confirm`, { method: "POST" });
    $("#assist-result").textContent = `${result.next_action} 건강검진 기록에는 아직 저장되지 않았습니다.`;
    $("#confirm-ocr").hidden = true;
  } catch (error) { showMessage(error.message); }
});
$("#notification-toggle")?.addEventListener("click", async () => {
  try {
    await api("/notification-preferences", { method: "PUT", body: JSON.stringify({ in_app_enabled: !state.notificationsEnabled, challenge_reminder_enabled: true, weekly_report_enabled: true, quiet_start_hour: 21, quiet_end_hour: 8 }) });
    await loadNotifications();
  } catch (error) { showMessage(error.message); }
});
$("#profile-notification-settings")?.addEventListener("click", () => {
  showMessage("웹 알림 설정은 이후 설정 화면에서 제공할 예정입니다.", "success");
});
$("#download-report").addEventListener("click", () => {
  const options = $("#report-pdf-options");
  if (!options) return;
  if (options.hidden) revealReportPdfOptions();
  else closeReportPdfOptions({ returnFocus: true });
});
async function openReportPdfFromPeriodInput(input) {
  const releaseBusy = setButtonBusy($("#download-report"), "PDF 화면 여는 중…");
  try {
    await openSelectedReportPdf(input.value);
  } finally { releaseBusy(); }
}
$$('input[name="report-pdf-period"]').forEach((input) => {
  input.addEventListener("click", () => { void openReportPdfFromPeriodInput(input); });
  input.closest("label")?.addEventListener("click", (event) => {
    if (event.target === input) return;
    event.preventDefault();
    void openReportPdfFromPeriodInput(input);
  });
});
document.addEventListener("click", (event) => {
  const control = $(".report-pdf-control");
  if (control && !control.contains(event.target)) closeReportPdfOptions();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeReportPdfOptions({ returnFocus: true });
});
$("#restart")?.addEventListener("click", () => window.location.reload());

function resumeFromForest() {
  const requestedView = new URLSearchParams(window.location.search);
  const requestedWorkspace = requestedView.get("workspace");
  if (requestedView.get("resume") !== "together" && requestedWorkspace !== "together") return;
  if (!isDemoEnvironment()) return;

  state.token = "local-demo-token";
  state.returningUser = true;
  state.cycle = createLocalDemoCycle([101, 102, 103]);
  state.navigationHistory = [2, 8];
  [2, 4, 7, 8].forEach((step) => state.visitedSteps.add(step));

  renderCycle(state.cycle);
  renderLocalDemoDashboard();
  showStep(8, { recordHistory: false });
  showWorkspace(requestedWorkspace || "together", { moveFocus: false });
}

function resumeReturningPreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("resume") !== "returning") return;
  if (!isDemoEnvironment()) return;

  state.token = "local-demo-token";
  state.returningUser = true;
  state.checkupId = "local-demo-checkup";
  $("#eligibility-birth-date").value = "1960-05-12";
  $("#gender").value = "female";
  syncLifestyleAvatar();
  syncReturningEligibilityState({
    age: getAgeFromBirth($("#eligibility-birth-date").value),
    service_eligible: true,
    challenge_eligible: true,
    current_health_check_eligible: true,
    future_prediction_eligible: true,
    model_eligible: true,
    reason_codes: [],
  });
  state.healthCheckupResult = { checkup_id: state.checkupId };
  state.healthCheckupHistory = [
    { checkup_id: "local-demo-checkup", checkup_type: "reassessment", checkup_date: "2026-09-03", height_cm: 165, weight_kg: 62, bmi: 22.8, waist_cm: 79, systolic_bp: 128, diastolic_bp: 82, regular_exercise: true, current_smoker: false, current_drinker: false },
    { checkup_id: "local-demo-checkup-previous", checkup_type: "initial", checkup_date: "2026-08-20", height_cm: 165, weight_kg: 64, bmi: 23.5, waist_cm: 82, systolic_bp: 134, diastolic_bp: 86, regular_exercise: false, current_smoker: false, current_drinker: false },
  ];
  state.cycle = createLocalDemoCycle([101, 102, 103]);
  state.navigationHistory = [2];
  [2, 4, 5, 6, 7, 8].forEach((step) => state.visitedSteps.add(step));

  renderCycle(state.cycle);
  renderLocalDemoDashboard();
  unlockReturningUserRoutes();
}

function renderMvpResultPreview() {
  // Static UI fixture only: never call the combined current/survival research endpoint.
  const fixture = (modelKey) => ({
    model_key: modelKey, prediction_id: "local-mvp-preview",
    preview_only: true, preview_signal_level: "moderate", preview_source: "static_fixture",
    risk_category: "moderate", screening_signal_detected: true,
    result_status: "development_only", promotion_status: "development_only",
    display_allowed: false, operational_model_activated: false,
  });
  const xaiFixture = (items) => ({
    status: "approved",
    display_allowed: true,
    shap_claimed: true,
    preview_only: true,
    items,
  });
  const currentFactors = xaiFixture([
    { display_name: "허리둘레 (화면 예시)", direction: "increase", contribution: .31, modifiable: true, message: "복부 비만 관련 입력이 현재 위험 신호를 높이는 방향으로 작용한 예시입니다." },
    { display_name: "수축기 혈압 (화면 예시)", direction: "increase", contribution: .22, modifiable: true, message: "혈압 관련 입력이 현재 위험 신호를 높이는 방향으로 작용한 예시입니다." },
    { display_name: "규칙적 운동 (화면 예시)", direction: "decrease", contribution: -.16, modifiable: true, message: "운동 관련 입력이 현재 위험 신호를 낮추는 방향으로 작용한 예시입니다." },
  ]);
  const futureFactors = xaiFixture([
    { display_name: "연령 (화면 예시)", direction: "increase", contribution: .27, modifiable: false, message: "연령 입력이 약 2년 내 위험 신호를 높이는 방향으로 작용한 예시입니다." },
    { display_name: "고혈압 진단 (화면 예시)", direction: "increase", contribution: .19, modifiable: false, message: "고혈압 관련 입력이 미래 위험 신호를 높이는 방향으로 작용한 예시입니다." },
    { display_name: "BMI (화면 예시)", direction: "decrease", contribution: -.12, modifiable: true, message: "BMI 입력이 미래 위험 신호를 낮추는 방향으로 작용한 예시입니다." },
  ]);
  state.currentScreeningPrediction = fixture("diabetes_current_screening");
  state.prediction = fixture("diabetes_incidence");
  state.predictionId = state.prediction.prediction_id;
  state.developmentPreviewRiskCategory = "moderate";
  renderPrediction(state.prediction, futureFactors, currentFactors);
  // Preview-only explanations are rendered after the production approval gate.
  // The fixture itself stays development_only and cannot be mistaken for a released result.
  renderXaiExplanationLists(futureFactors, {
    approved: true,
    currentFactors,
    currentApproved: true,
  });
  const comparison = typeof URLSearchParams === "function"
    ? new URLSearchParams(window.location.search).get("comparison")
    : null;
  if (["current-high-future-low", "current-low-future-high"].includes(comparison)) {
    const approvedFixture = (modelKey, riskCategory) => ({
      model_key: modelKey,
      risk_category: riskCategory,
      result_status: "approved",
      promotion_status: "approved",
      display_allowed: true,
      operational_model_activated: true,
    });
    const currentRisk = comparison === "current-high-future-low" ? "high" : "low";
    const futureRisk = comparison === "current-high-future-low" ? "low" : "high";
    renderModelComparisonGuidance(
      { status: "succeeded", prediction: approvedFixture("diabetes_current_screening", currentRisk) },
      { status: "succeeded", prediction: approvedFixture("diabetes_incidence", futureRisk) },
    );
  }
}

function resumeMealPhotoPreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") !== "meal-photo" || !isDemoEnvironment()) return;
  const item = {
    challenge_id: "local-vegetable-meal",
    user_challenge_id: "local-meal-photo",
    catalog_version: "evidence-v3",
    verification_type: 1,
    title: "채소가 포함된 한 끼 인증",
    daily_goal: "하루 1끼",
    verification_scope: "한 끼 식사에 음식과 채소가 충분히 보이는지 확인해요.",
    goal: { target_count: 1, target_minutes: null },
  };
  state.token = "local-demo-token";
  state.returningUser = true;
  state.cycle = { cycle_id: "local-photo-preview", cycle_number: 1, user_challenges: [item] };
  state.navigationHistory = [1, 8];
  [1, 7, 8].forEach((step) => state.visitedSteps.add(step));
  renderCycle(state.cycle);
  renderLocalDemoDashboard();
  showStep(8, { recordHistory: false });
  showWorkspace("challenge", { moveFocus: false });
  openPhotoRecordModal(item);
}

function resumeForecastPreview() {
  const params = new URLSearchParams(window.location.search);
  // Preserve existing local QA bookmarks, but show only the two MVP result areas.
  if (!["forecast", "results"].includes(params.get("preview")) || !isDemoEnvironment()) return;
  state.token = "local-demo-token";
  state.navigationHistory = [1, 5, 6];
  [1, 5, 6].forEach((step) => state.visitedSteps.add(step));
  renderMvpResultPreview();
  showStep(6, { recordHistory: false });
  showMessage("현재·미래 결과 화면의 고정 예시입니다. 실제 모델을 호출하지 않았습니다.", "info");
}

function resumeAnalysisStatusPreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") !== "analysis-status" || !isDemoEnvironment()) return;
  const status = ["queued", "running", "succeeded", "failed"].includes(params.get("status"))
    ? params.get("status")
    : "succeeded";
  state.token = "local-demo-token";
  state.navigationHistory = [1, 5];
  [1, 5].forEach((step) => state.visitedSteps.add(step));
  renderPredictionStatus(status, { resultAvailable: status === "succeeded", showResult: false });
  showStep(5, { recordHistory: false });
}

function resumeEmergencyQuestionnairePreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") !== "emergency-questionnaire") return;
  if (!isDemoEnvironment()) return;

  state.token = "local-demo-token";
  state.navigationHistory = [1, 2, 3];
  [1, 2, 3].forEach((step) => state.visitedSteps.add(step));
  $("#eligibility-birth-date").value = "1960-05-12";
  $("#gender").value = "FEMALE";
  $("#diagnosed-diabetes-no").checked = true;
  syncEmergencyQuestionnaire();
  showStep(3, { recordHistory: false });
}

function resumeHealthInputPreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") !== "health-input") return;
  if (!isDemoEnvironment()) return;

  state.token = "local-demo-token";
  state.navigationHistory = [1, 2, 3, 4];
  [1, 2, 3, 4].forEach((step) => state.visitedSteps.add(step));
  showStep(4, { recordHistory: false });
  showHealthInputPanel(["metrics", "vitals", "drinking", "habits", "activity", "family", "nutrition", "socioeconomic", "lifestyle", "details", "review"].includes(params.get("panel")) ? params.get("panel") : "metrics");
}

function resumeOnboardingFlowPreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") !== "onboarding-flow") return;
  if (!isDemoEnvironment()) return;
  const requestedStep = Number(params.get("step"));
  const step = [3, 4, 5, 6].includes(requestedStep) ? requestedStep : 3;
  state.token = "local-demo-token";
  state.capabilities.currentHealth = true;
  state.capabilities.challenge = true;
  state.navigationHistory = [1, 2, step];
  [1, 2, 3, 4, 5, 6].filter((item) => item <= step).forEach((item) => state.visitedSteps.add(item));
  if (step === 5) renderPredictionStatus("succeeded", { resultAvailable: true, showResult: false });
  if (step === 6) renderMvpResultPreview();
  showStep(step, { recordHistory: false });
}

function resumeReportForestPreview() {
  if (new URLSearchParams(window.location.search).get("preview") !== "report-forest" || !isDemoEnvironment()) return;
  state.token = "local-demo-token";
  state.returningUser = true;
  state.healthConsentStatus = "active";
  state.cycle = createLocalDemoCycle([101, 102, 103]);
  [1, 7, 8].forEach((step) => state.visitedSteps.add(step));
  renderCycle(state.cycle);
  renderLocalDemoDashboard();
  showStep(8, { recordHistory: false });
  showWorkspace("report", { moveFocus: false });
}

function resumeAuthEntryFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const requestedAuth = params.get("auth");
  if (!["login", "signup"].includes(requestedAuth)) return false;

  state.navigationHistory = [2];
  state.visitedSteps.add(2);
  showStep(2, { recordHistory: false });
  showAuthMode(requestedAuth, { moveFocus: false, context: requestedAuth });
  return true;
}

configureEnvironmentControls();
$$('input[name="regular-exercise"]').forEach((input) => input.addEventListener("change", syncExerciseDetails));
$$('input[name="current-drinker"]').forEach((input) => input.addEventListener("change", syncAlcoholFrequencyDetails));
syncExerciseDetails();
syncAlcoholFrequencyDetails();
syncEmergencyQuestionnaire();
$$('[data-risk-preview]').forEach((button) => button.addEventListener("click", () => setForecastRiskPreview(button.dataset.riskPreview)));
showStep(state.step, { recordHistory: false });
const mountEducationCarousel = window.EducationCarousel?.mount;
window.lifestyleMapView = window.LifestyleMap?.mount?.($("#lifestyle-map-detail"), {
  getData: lifestyleMapSnapshot,
  mountCarousel: mountEducationCarousel,
});
window.healthToolsEducationCarouselView = mountEducationCarousel?.($("#health-tools-education-carousel"), {
  listSelector: "#health-tools-education-list",
  statusSelector: "#health-tools-education-carousel-status",
  onOpen: openEducationFlowFromTools,
});
$("#health-tools-education-list")?.addEventListener("click", (event) => {
  if (window.healthToolsEducationCarouselView) return;
  const card = event.target.closest(".education-overview-card");
  if (!card?.dataset.contentId) return;
  event.preventDefault();
  void openEducationFlowFromTools(card.dataset.contentId).catch((error) => showMessage(error.message));
});
$("#daily-log-list").addEventListener("click", event => {
  const link = event.target.closest("[data-lifestyle-topic]");
  if (!link) return;
  showWorkspace("tools");
  updateLifestyleMap(link.dataset.lifestyleTopic);
});
resumeAuthEntryFromQuery();
resumeFromForest();
resumeReturningPreview();
resumeMealPhotoPreview();
resumeForecastPreview();
resumeAnalysisStatusPreview();
resumeEmergencyQuestionnairePreview();
resumeHealthInputPreview();
resumeOnboardingFlowPreview();
resumeReportForestPreview();
