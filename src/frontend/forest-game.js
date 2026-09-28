(() => {
  "use strict";

  const FOREST_SESSION_STORAGE_KEY = "gandang-forest-api-session-v1";
  const GROUP_SYNC_INTERVAL_MS = 20000;
  const SOLO_DAILY_QUEST_TARGET = 3;
  const ATMOSPHERE_KEY = "gandang-carrot-forest-atmosphere-v1";
  const BGM_VOLUME_KEY = "gandang-carrot-forest-bgm-volume-v1";
  const BGM_MUTED_KEY = "gandang-carrot-forest-bgm-muted-v1";
  const SFX_VOLUME_KEY = "gandang-carrot-forest-sfx-volume-v1";
  const SFX_MUTED_KEY = "gandang-carrot-forest-sfx-muted-v1";
  const TILE = 32;
  const MAP_WIDTH = 24;
  const MAP_HEIGHT = 16;
  const WORLD_WIDTH = 768;
  const WORLD_HEIGHT = 512;
  const RENDER_SCALE = 2;
  const TODAY = new Date().toISOString().slice(0, 10);
  const $ = (selector) => document.querySelector(selector);
  const WISDOM_SPRING = Object.freeze({ x: 108, y: 424 });
  const WISDOM_CHAT_AVATAR_SRC = "/static/assets/gandangi-wisdom-guide-chat-v1.png?v=20260916-1";
  const WORLD_MEMORY_CAMERA = Object.freeze({ x: 666, y: 360, bounds: { left: 634, right: 704, top: 320, bottom: 394 } });
  const WORLD_FIXED_LANTERNS = Object.freeze([
    { id: "house_back", x: 192, y: 82, radius: 98, bounds: { left: 174, right: 210, top: 56, bottom: 112 } },
    { id: "garden", x: 608, y: 342, radius: 112, bounds: { left: 586, right: 628, top: 304, bottom: 370 } },
  ]);
  const HOME_RECORD_PLAYER = Object.freeze({ x: 630, y: 188 });
  const HOME_LIGHT_SOURCES = Object.freeze([
    { x: 145, y: 70, radius: 124, bounds: { left: 108, right: 184, top: 28, bottom: 116 } },
    { x: 674, y: 144, radius: 152, bounds: { left: 636, right: 712, top: 104, bottom: 190 } },
    { x: 156, y: 394, radius: 128, bounds: { left: 122, right: 194, top: 354, bottom: 430 } },
  ]);
  const WISDOM_QUESTION_EXAMPLES = Object.freeze([
    "식후 10분 걷기는 혈당 관리에 도움이 돼?",
    "단 음료 대신 물을 마시면 어떤 점이 좋아?",
    "혈압은 같은 시간에 재는 게 왜 중요해?",
    "채소 반찬을 한 끼 더하면 건강에 어떤 점이 좋아?",
  ]);
  let rewardSkipResolve = null;
  const nicknameAdjectives = ["씩씩한", "다정한", "반짝이는", "꾸준한", "포근한", "용감한", "싱그러운", "재빠른"];
  const nicknameNouns = ["당근", "새싹", "토끼", "숲지기", "햇살"];
  const homeRecordCatalog = {
    home: { name: "우리 집", audioKey: "homeRecordHome" },
    warm: { name: "따뜻한 오후", audioKey: "homeRecordWarm" },
    bright: { name: "밝은 샘", audioKey: "homeRecordBright" },
    untitled: { name: "무제", audioKey: "homeRecordUntitled" },
    goingHome: { name: "집으로", audioKey: "homeRecordGoingHome" },
    evening: { name: "나른한 저녁", audioKey: "homeRecordEvening" },
    forestFairy: { name: "숲 속의 요정", audioKey: "homeRecordForestFairy" },
  };

  // Keepsake guests are temporary copies of the six saved official looks.
  // Never copy account/profile fields, rename wardrobe cards, or persist photos.
  const MEMORY_PRESET_GUESTS = Object.freeze([
    ["female", "성실한 당근"], ["male", "꾸준한 상균"],
    ["moon_mage", "달빛의 빛샘"], ["forest_witch", "숲속의 수인"],
    ["inventor", "발명의 준혁"], ["knight", "해결의 세준"],
  ]);
  const MEMBER_PROFILE_IMAGES = Object.freeze({
    moon_mage: "/static/assets/avatar-preset-3-moon-mage-profile.png",
    forest_witch: "/static/assets/avatar-preset-4-forest-elf-profile.png",
    inventor: "/static/assets/avatar-preset-5-inventor-profile.png",
    knight: "/static/assets/avatar-preset-6-knight-profile.png",
  });

  function buildMemoryPresets(sourceState) {
    const history = Array.isArray(sourceState?.outfitHistory) ? sourceState.outfitHistory : [];
    return MEMORY_PRESET_GUESTS.map(([role, nickname], index) => {
      const look = history.find((candidate) => candidate?.presetRole === role);
      if (!look?.cosmetics || !look?.tuning || !look?.gender) {
        throw new Error(`프리셋${index + 1}을 준비하지 못했어요. 숲을 다시 열고 시도해 주세요.`);
      }
      return {
        number: index + 1, nickname,
        avatar: {
          engine: "lpc", name: nickname, gender: look.gender, direction: "down",
          cosmetics: JSON.parse(JSON.stringify(look.cosmetics)),
          tuning: JSON.parse(JSON.stringify(look.tuning)),
        },
      };
    });
  }

  function memoryPhotoFilename(date = new Date()) {
    const pad = (number) => String(number).padStart(2, "0");
    return `당근의숲_추억사진_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
  }

  function createForestMemoryUi({ getState, eventTarget = window, doc = document, urlApi = URL,
    setTimer = window.setTimeout.bind(window), clearTimer = window.clearTimeout.bind(window), now = Date.now } = {}) {
    const dialog = doc.querySelector("#forest-memory-dialog");
    if (!dialog) return null;
    const status = doc.querySelector("#forest-memory-status");
    const progress = doc.querySelector("#forest-memory-progress");
    const preview = doc.querySelector("#forest-memory-preview");
    const figure = doc.querySelector("#forest-memory-figure");
    const save = doc.querySelector("#forest-memory-save");
    const retake = doc.querySelector("#forest-memory-retake");
    const closeButton = doc.querySelector("#forest-memory-close");
    const ownedUrls = new Map();
    const backgroundInert = new Map();
    let sequence = 0, session = null, returnFocus = null, timeout = 0;

    const emit = (type, detail) => eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
    const active = (detail) => session?.stage === "busy" && detail?.requestId === session.requestId;
    function setSaveEnabled(enabled) {
      save.setAttribute("aria-disabled", String(!enabled));
      save.tabIndex = enabled ? 0 : -1;
      if (!enabled) { save.removeAttribute("href"); save.removeAttribute("download"); }
    }
    function freezeBackground() {
      // Inert prevents wardrobe/scene controls from changing the live game,
      // but unlike an opaque/modal backdrop does not cover its animation.
      let branch = dialog;
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling !== branch && !backgroundInert.has(sibling)) {
            backgroundInert.set(sibling, Boolean(sibling.inert));
            sibling.inert = true;
          }
        }
        branch = branch.parentElement;
        if (branch === doc.body) break;
      }
    }
    function finishWaiting() {
      clearTimer(timeout); timeout = 0;
      dialog.setAttribute("aria-busy", "false");
      progress.hidden = true;
    }
    function leaveStudio() {
      finishWaiting();
      for (const [element, inert] of backgroundInert) element.inert = inert;
      backgroundInert.clear();
      doc.body.classList.remove("forest-memory-shooting");
      doc.body.classList.remove("forest-memory-developing");
    }
    function releasePhoto() {
      preview.removeAttribute("src"); figure.hidden = true; setSaveEnabled(false);
      const photo = session?.photo;
      if (session) session.photo = null;
      if (!photo?.owned) return;
      // A download may still be consuming the URL when the preview is closed.
      // Retire only after its short grace period, or immediately on page exit.
      const retire = () => { urlApi.revokeObjectURL(photo.url); ownedUrls.delete(photo.url); };
      const delay = Math.max(0, photo.lastDownloadAt + 10000 - now());
      ownedUrls.set(photo.url, setTimer(retire, delay));
    }
    function cancelCurrent() {
      if (!session) return;
      const previous = session;
      previous.stage = "closed";
      emit("forest-memory-cancel", { requestId: previous.requestId });
      releasePhoto(); session = null;
      leaveStudio();
    }
    function close() {
      cancelCurrent();
      if (dialog.open) dialog.close();
      const target = returnFocus?.isConnected ? returnFocus : doc.querySelector("#phaser-world");
      returnFocus = null;
      target?.focus({ preventScroll: true });
    }
    function fail(message) {
      if (!session) return;
      session.stage = "error";
      leaveStudio(); retake.disabled = false; setSaveEnabled(false);
      status.textContent = String(message || "사진을 만들지 못했어요. 다시 찍기를 눌러 주세요.").slice(0, 240);
      emit("forest-memory-cancel", { requestId: session.requestId });
    }
    function start() {
      if (session?.stage === "busy") return;
      if (!dialog.open) {
        returnFocus = doc.activeElement;
        dialog.show();
      }
      cancelCurrent();
      session = { requestId: `forest-memory-${++sequence}`, stage: "busy", photo: null, autoDownloaded: false };
      status.textContent = "여섯 친구와 숲속 동물들이 모이고 있어요. 잠시 기다려 주세요.";
      progress.hidden = false; retake.disabled = true; setSaveEnabled(false);
      dialog.setAttribute("aria-busy", "true");
      doc.body.classList.remove("forest-memory-developing");
      doc.body.classList.add("forest-memory-shooting");
      freezeBackground();
      closeButton.focus({ preventScroll: true });
      emit("forest-controls-hidden");
      try {
        const presets = buildMemoryPresets(getState());
        const requestId = session.requestId;
        timeout = setTimer(() => {
          if (active({ requestId })) fail("사진 준비가 오래 걸리고 있어요. 다시 찍기를 눌러 주세요.");
        }, 45000);
        emit("forest-memory-start", { requestId, presets });
      } catch (error) { fail(error.message); }
    }
    function download(automatic = false) {
      if (session?.stage !== "ready" || !session.photo || (automatic && session.autoDownloaded)) return;
      if (automatic) session.autoDownloaded = true;
      try {
        // The same persistent native link serves both the one automatic attempt
        // and a direct user click; never remove an anchor while it is navigating.
        save.click();
      } catch {
        status.textContent = "자동 저장을 시작하지 못했어요. ‘사진 저장’을 눌러 주세요.";
      }
    }
    function ready(event) {
      const detail = event.detail || {};
      if (!active(detail)) return;
      // Mark the session first: duplicate/reentrant ready events must not save twice.
      session.stage = "preparing";
      try {
        let photo;
        const inlinePng = typeof detail.dataUrl === "string" && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(detail.dataUrl) ? detail.dataUrl : null;
        if (detail.blob instanceof Blob && detail.blob.type === "image/png" && detail.blob.size > 0) {
          photo = { url: urlApi.createObjectURL(detail.blob), owned: true, lastDownloadAt: 0 };
          ownedUrls.set(photo.url, null);
        } else if (inlinePng) {
          photo = { url: inlinePng, owned: false, lastDownloadAt: 0 };
        } else throw new Error("안전한 PNG 사진을 받지 못했어요. 다시 찍기를 눌러 주세요.");
        session.photo = photo;
        session.filename = memoryPhotoFilename();
        session.stage = "ready";
        finishWaiting();
        doc.body.classList.add("forest-memory-developing");
        preview.src = photo.url; figure.hidden = false;
        // Inline PNG avoids a blob navigation dependency in embedded browsers.
        // Blob-only captures remain supported, with the existing revoke grace.
        save.href = inlinePng || photo.url;
        save.download = session.filename;
        setSaveEnabled(true); retake.disabled = false;
        download(true);
      } catch (error) { releasePhoto(); fail(error.message); }
    }
    eventTarget.addEventListener("forest-memory-request", start);
    eventTarget.addEventListener("forest-memory-progress", (event) => {
      if (active(event.detail) && typeof event.detail.message === "string") status.textContent = event.detail.message.slice(0, 240);
    });
    eventTarget.addEventListener("forest-memory-ready", ready);
    eventTarget.addEventListener("forest-memory-error", (event) => {
      if (active(event.detail)) fail(event.detail.message);
    });
    save.addEventListener("click", (event) => {
      if (session?.stage !== "ready" || !session.photo) { event.preventDefault(); return; }
      session.photo.lastDownloadAt = now();
      status.textContent = "사진 저장을 시작했어요.";
      // Do not preventDefault or synthesize another click: native download wins.
    });
    save.addEventListener("keydown", (event) => {
      if (event.key === " ") { event.preventDefault(); download(); }
      // Enter is the anchor's native keyboard activation.
    });
    setSaveEnabled(false);
    retake.addEventListener("click", start);
    closeButton.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.addEventListener("close", () => { if (!dialog.open && session) close(); });
    doc.addEventListener("keydown", (event) => {
      if (dialog.open && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close();
      }
    }, true);
    eventTarget.addEventListener("pagehide", () => {
      cancelCurrent();
      for (const [url, timer] of ownedUrls) { clearTimer(timer); urlApi.revokeObjectURL(url); }
      ownedUrls.clear();
    });
    return Object.freeze({ start, close });
  }

  function generateNickname() {
    const random = new Uint32Array(3);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(random);
    else random.set([Date.now(), Date.now() * 7, Date.now() * 13]);
    const adjective = nicknameAdjectives[random[0] % nicknameAdjectives.length];
    const noun = nicknameNouns[random[1] % nicknameNouns.length];
    return `${adjective} ${noun}${String(random[2] % 1000).padStart(3, "0")}`;
  }

  const questCatalog = {
    walk: { id: "walk", icon: "👟", category: "움직이기", title: "가볍게 걷기", description: "내가 정한 걷기 목표 확인", reward: 20 },
    stretch: { id: "stretch", icon: "🙆", category: "몸 풀기", title: "편안하게 스트레칭하기", description: "무리하지 않고 몸 상태 확인", reward: 15 },
    strength: { id: "strength", icon: "🪑", category: "근력 활동", title: "의자에서 천천히 일어나기", description: "가능한 범위에서 가볍게 실천", reward: 20 },
    meal: { id: "meal", icon: "🥗", category: "식사 돌아보기", title: "규칙적으로 식사하기", description: "오늘 식사 기록 남기기", reward: 20 },
    vegetable: { id: "vegetable", icon: "🥬", category: "식사 구성", title: "채소가 포함됐는지 확인하기", description: "먹은 내용을 있는 그대로 기록", reward: 15 },
    water: { id: "water", icon: "💧", category: "수분 기록", title: "물 마신 횟수 기록하기", description: "특정 섭취량을 권하지 않고 횟수만 기록", reward: 15 },
    check: { id: "check", icon: "📝", category: "생활습관 기록", title: "오늘 기록 돌아보기", description: "입력한 생활습관 다시 보기", reward: 15 },
  };

  function normalizeWorldLanterns(value = {}) {
    return Object.fromEntries(WORLD_FIXED_LANTERNS.map(source => [source.id, Boolean(value?.[source.id])]));
  }
  const questPlans = {
    exercise: ["walk", "stretch", "strength"],
    diet: ["meal", "vegetable", "water"],
    balanced: ["walk", "meal", "check"],
  };
  let quests = questPlans.balanced.map((id) => questCatalog[id]);
  const itemCatalog = {
    red_scarf: { name: "빨간 목도리", kind: "accessory", icon: "🧣" },
    sprout_hat: { name: "새싹 모자", kind: "accessory", icon: "🌱" },
    carrot_bag: { name: "당근 가방", kind: "accessory", icon: "🎒" },
    flower_patch: { name: "꽃밭", kind: "object", icon: "🌼" },
    lantern: { name: "숲 등불", kind: "object", icon: "🏮", animated: true },
    mushroom: { name: "버섯 장식", kind: "object", icon: "🍄", animated: true },
    bench: { name: "나무 벤치", kind: "object", icon: "🪵" },
    stone_path: { name: "돌길", kind: "object", icon: "🪨" },
    bird_bath: { name: "새 물그릇", kind: "object", icon: "⛲" },
    carrot_crate: { name: "당근 상자", kind: "object", icon: "🥕" },
    picnic_table: { name: "피크닉 탁자", kind: "object", icon: "🧺" },
    flower_pot: { name: "꽃 화분", kind: "object", icon: "🪴", animated: true },
    signpost: { name: "숲 표지판", kind: "object", icon: "🪧" },
    stump: { name: "나무 그루터기", kind: "object", icon: "🪵" },
    watering_can: { name: "물뿌리개", kind: "object", icon: "🚿" },
    campfire: { name: "모닥불", kind: "object", icon: "🔥" },
    hammock: { name: "해먹", kind: "object", icon: "🏕️" },
    mailbox: { name: "우편함", kind: "object", icon: "📫" },
    scarecrow: { name: "허수아비", kind: "object", icon: "🌾", animated: true },
    beehive: { name: "벌통", kind: "object", icon: "🍯" },
    fountain: { name: "작은 분수", kind: "object", icon: "⛲" },
    arch: { name: "꽃 아치", kind: "object", icon: "🌸" },
    wheelbarrow: { name: "손수레", kind: "object", icon: "🛒" },
    reward_cow: { name: "행운의 젖소", kind: "object", icon: "🐄", rarity: "rare" },
    tent: { name: "캠핑 텐트", kind: "object", icon: "⛺" },
    light_tent: { name: "전구 텐트", kind: "object", icon: "⛺", animated: true },
    bbq_table: { name: "바비큐 탁자", kind: "object", icon: "🍖" },
    chair_green: { name: "초록 캠핑 의자", kind: "object", icon: "🪑" },
    chair_red: { name: "빨간 캠핑 의자", kind: "object", icon: "🪑" },
    picnic_blanket: { name: "피크닉 매트", kind: "object", icon: "🧺" },
    pond: { name: "돌 연못", kind: "object", icon: "💧" },
    fence: { name: "통나무 울타리", kind: "object", icon: "🪵" },
    flower_cart: { name: "꽃수레", kind: "object", icon: "🌼", animated: true },
    duck_float: { name: "Ducky", kind: "object", icon: "🦆", animated: true },
    animated_fountain: { name: "물결 분수", kind: "object", icon: "⛲", animated: true },
    firefly_lantern: { name: "반딧불 랜턴", kind: "object", icon: "🏮", animated: true },
    garden_pinwheel: { name: "정원 바람개비", kind: "object", icon: "🎡", animated: true },
  };
  const storageObjectCodes = [
    "tent", "light_tent", "picnic_table", "bbq_table", "chair_green",
    "chair_red", "picnic_blanket", "pond", "lantern", "fence",
    "flower_cart", "flower_pot", "mushroom", "bench", "campfire",
    "mailbox", "scarecrow", "carrot_crate", "watering_can", "wheelbarrow",
    "duck_float", "animated_fountain", "firefly_lantern", "garden_pinwheel",
  ];
  const storageObjectIndex = Object.fromEntries(storageObjectCodes.map((code, index) => [code, index]));
  const animatedObjectRows = { duck_float: 0, animated_fountain: 1, firefly_lantern: 2, garden_pinwheel: 3 };
  const waterObjectCodes = new Set(["duck_float"]);
  const interactiveObjectTypes = {
    reward_cow: "cow",
    campfire: "fire",
    lantern: "light",
    firefly_lantern: "light",
    light_tent: "light",
  };
  const seatObjectCodes = new Set(["chair_green", "chair_red", "bench"]);
  const rewardPool = ["reward_cow"];
  const avatarCategories = [
    { id: "bodyType", label: "체형", icon: "▸" },
    { id: "skin", label: "피부", icon: "▸" },
    { id: "head", label: "얼굴", icon: "▸" },
    { id: "hair", label: "헤어", icon: "▸" },
    { id: "headwear", label: "모자", icon: "▸" },
    { id: "arms", label: "팔", icon: "▸" },
    { id: "torso", label: "상의", icon: "▸" },
    { id: "legs", label: "하의", icon: "▸" },
    { id: "feet", label: "신발", icon: "▸" },
    { id: "tools", label: "도구", icon: "▸" },
    { id: "weapons", label: "무기", icon: "▸" },
    { id: "vehicle", label: "탈것", icon: "▸" },
    { id: "pet", label: "펫", icon: "▸" },
  ];
  const avatarCatalog = {
    bodyType: [
      { id: "male", name: "성인 남성", visual: "🧑" }, { id: "female", name: "성인 여성", visual: "👩" },
      { id: "muscular", name: "근육형", visual: "💪" }, { id: "teen", name: "슬림형", visual: "🧍" },
    ],
    skin: [
      { id: "peach", name: "복숭아빛", visual: "#f2bd92", color: "#f2bd92" },
      { id: "rose", name: "장밋빛", visual: "#eaa68e", color: "#eaa68e" },
      { id: "warm", name: "따뜻한 갈색", visual: "#c98263", color: "#c98263" },
      { id: "deep", name: "깊은 갈색", visual: "#89503e", color: "#89503e", isNew: true },
      { id: "olive", name: "올리브", visual: "#a87f63", color: "#a87f63" },
      { id: "porcelain", name: "밝은 도자기빛", visual: "#f5cbb4", color: "#f5cbb4" },
      { id: "sand", name: "샌드", color: "#d8a47f" }, { id: "golden", name: "골든", color: "#bb7a51" },
      { id: "amber", name: "앰버", color: "#a96545" }, { id: "bronze", name: "브론즈", color: "#8d563c" },
      { id: "espresso", name: "에스프레소", color: "#60392f" }, { id: "neutral", name: "뉴트럴", color: "#c68d71" },
    ],
    accessory: [
      { id: "none", name: "착용 안 함", visual: "—" }, { id: "red_scarf", name: "빨간 목도리", visual: "🧣" },
      { id: "sprout_hat", name: "새싹 모자", visual: "🌱" }, { id: "carrot_bag", name: "당근 가방", visual: "🎒" },
      { id: "round_glasses", name: "둥근 안경", visual: "👓", isNew: true }, { id: "star_glasses", name: "별빛 안경", visual: "🤓" },
    ],
    aura: [
      { id: "none", name: "아우라 없음", visual: "—" }, { id: "wings", name: "하늘빛 날개", visual: "🪽" },
      { id: "halo", name: "햇살 고리", visual: "😇" }, { id: "rainbow", name: "무지개 아치", visual: "🌈" },
      { id: "hearts", name: "마음의 온기", visual: "💞" }, { id: "forest", name: "숲의 숨결", visual: "🍃", isNew: true },
    ],
    effect: [
      { id: "sword_arc", name: "검광", visual: "⚔️" }, { id: "magic_burst", name: "마법 파동", visual: "🔮" },
      { id: "arrow_volley", name: "화살 연사", visual: "🏹" }, { id: "leaf_blade", name: "잎 칼날", visual: "🍃" },
    ],
    vehicle: [],
    pet: [
      { id: "pet:none", itemId: "none", slot: "pet", name: "선택 안함", visual: "—", group: "선택 안함" },
      ...(window.ForestPets?.classicCatalog || []).map(item => ({ ...item, id: `pet:${item.id}`, itemId: item.id, slot: "pet", group: item.group || "펫" })),
      ...(window.ForestPets?.catalog || []).map(item => ({ ...item, id: `pet:${item.id}`, itemId: item.id, slot: "pet", group: item.group || "펫" })),
      ...(window.ForestPets?.equipment || []).map(item => ({ ...item, id: `petAccessory:${item.id}` })),
    ],
    speech: [
      { id: "none", name: "말풍선 없음", visual: "—" }, { id: "cat", name: "고양이 인사", visual: "🐱" },
      { id: "leaf", name: "네잎클로버", visual: "🍀" }, { id: "window", name: "파란 창문", visual: "🪟", isNew: true },
    ],
    lpcHair: [
      { id: "bob", name: "단정한 단발", visual: "💇" }, { id: "afro", name: "몽글 아프로", visual: "🧑‍🦱" },
      { id: "long", name: "긴 생머리", visual: "👩" }, { id: "messy", name: "헝클어진 숏컷", visual: "🧑" },
      { id: "page", name: "페이지 컷", visual: "🧒" },
    ],
    lpcOutfit: [
      { id: "overalls", name: "정원사 멜빵", visual: "🧑‍🌾" }, { id: "tshirt", name: "편안한 티셔츠", visual: "👕" },
      { id: "cardigan", name: "포근한 카디건", visual: "🧥" }, { id: "sleeveless", name: "산뜻한 민소매", visual: "🎽" },
      { id: "short_cardigan", name: "반소매 카디건", visual: "👚" },
    ],
    lpcBottom: [
      { id: "pants", name: "기본 바지", visual: "👖" }, { id: "long_pants", name: "긴 바지", visual: "👖" },
      { id: "shorts", name: "산책 반바지", visual: "🩳" }, { id: "leggings", name: "활동 레깅스", visual: "🧘" },
    ],
    lpcShoes: [
      { id: "shoes", name: "기본 운동화", visual: "👟" }, { id: "boots", name: "정원 워커", visual: "🥾" },
      { id: "slippers", name: "폭신 슬리퍼", visual: "🥿" },
    ],
    lpcHat: [
      { id: "none", name: "모자 없음", visual: "—" }, { id: "leather_cap", name: "가죽 산책 모자", visual: "🧢" },
      { id: "bowler", name: "포멀 보울러", visual: "🎩" }, { id: "bandana", name: "숲 반다나", visual: "🧣" },
    ],
    lpcGlasses: [
      { id: "none", name: "안경 없음", visual: "—" }, { id: "round", name: "동그란 안경", visual: "👓" },
      { id: "halfmoon", name: "반달 안경", visual: "👓" }, { id: "sunglasses", name: "선글라스", visual: "🕶️" },
    ],
    expression: [
      { id: "calm", name: "차분한 미소", visual: "🙂" }, { id: "bright", name: "환한 미소", visual: "😄" },
      { id: "wink", name: "윙크", visual: "😉" }, { id: "delighted", name: "눈웃음", visual: "😊" },
      { id: "worried", name: "살짝 걱정", visual: "😟" }, { id: "determined", name: "씩씩한 표정", visual: "😤" },
    ],
    face: [], head: [], hair: [], headwear: [], arms: [], torso: [], legs: [], feet: [], tools: [], weapons: [],
    lpcHead: [], lpcExpression: [], lpcEyebrow: [], lpcNose: [], lpcEyes: [], lpcWrinkles: [],
    lpcArms: [], lpcTool: [], lpcWeapon: [], lpcMobility: [],
    pose: [
      { id: "idle", name: "가만히", visual: "🧍" }, { id: "walk", name: "걷기", visual: "🚶" },
      { id: "run", name: "달리기", visual: "🏃" }, { id: "sit", name: "앉기", visual: "🧘" },
      { id: "jump", name: "점프", visual: "🙌" }, { id: "dance", name: "댄스", visual: "💃" },
      { id: "harvest", name: "당근 수확", visual: "🥕" }, { id: "fishing", name: "낚시", visual: "🎣" },
      { id: "door", name: "문 열기", visual: "🚪" }, { id: "attack", name: "공격", visual: "⚔️" },
      { id: "spellcast", name: "반짝임 만들기", visual: "✨" }, { id: "hurt", name: "깜짝 놀라기", visual: "😲" },
    ],
  };
  const colorChoices = [
    ["brown", "브라운", "#704229"], ["black", "블랙", "#282b31"], ["silver", "실버", "#aeb5bf"],
    ["blue", "블루", "#4268a8"], ["teal", "청록", "#308b82"], ["red", "레드", "#a84335"],
    ["orange", "오렌지", "#d4762f"], ["green", "그린", "#447849"], ["navy", "네이비", "#293c68"],
    ["cream", "크림", "#ead9b5"], ["pink", "핑크", "#d9839f"], ["purple", "퍼플", "#765a9c"],
    ["white", "화이트", "#eef0ed"], ["gray", "그레이", "#747a81"], ["yellow", "옐로", "#e2b845"],
  ].map(([id, name, color]) => ({ id, name, color, visual: "" }));
  avatarCatalog.hairColor = colorChoices;
  avatarCatalog.outfitColor = colorChoices;
  avatarCatalog.bottomColor = colorChoices;
  avatarCatalog.shoeColor = colorChoices;
  avatarCatalog.mobilityColor = colorChoices;
  avatarCatalog.petAccessory = [...(window.ForestPets?.equipment || [])];
  const lpcCatalogMap = {
    lpcHead: "head", lpcHair: "hair", lpcOutfit: "outfit", lpcBottom: "bottom",
    lpcShoes: "shoes", lpcHat: "hat", lpcGlasses: "eyewear",
    lpcExpression: "expression", lpcEyebrow: "eyebrow", lpcNose: "nose",
    lpcEyes: "eyes", lpcWrinkles: "wrinkles",
    lpcArms: "arms", lpcTool: "tool", lpcWeapon: "weapon", lpcMobility: "mobility",
  };
  const optionalLpcCategories = new Set(["lpcHat", "lpcGlasses", "lpcNose", "lpcEyes", "lpcWrinkles", "lpcArms", "lpcTool", "lpcWeapon", "lpcMobility"]);

  function syncLpcCatalog() {
    if (!window.LpcAvatarEngine?.isReady()) return;
    Object.entries(lpcCatalogMap).forEach(([uiCategory, engineCategory]) => {
      const records = window.LpcAvatarEngine.catalog(engineCategory);
      avatarCatalog[uiCategory] = records.map((record) => ({
        id: record.id, name: record.label || record.id, definition: record.definition || "",
        sources: record.sources || {}, visual: "",
      }));
      if (optionalLpcCategories.has(uiCategory)) avatarCatalog[uiCategory].unshift({ id: "none", name: "사용 안 함", sources: {} });
    });
    avatarCatalog.vehicle = avatarCatalog.lpcMobility.map((record) => ({
      ...record, id: record.id, itemId: record.id, slot: "vehicle", group: "공식 LPC 이동 보조",
    })).concat(avatarCatalog.mobilityColor.map((record) => ({
      ...record, id: `mobilityColor:${record.id}`, itemId: record.id, slot: "mobilityColor", group: "색상",
    })));
    const groupBlueprints = {
      head: [["얼굴형", "lpcHead"], ["표정", "lpcExpression"], ["눈썹", "lpcEyebrow"], ["코", "lpcNose"], ["특수 눈", "lpcEyes"], ["주름", "lpcWrinkles"]],
      hair: [["헤어", "lpcHair"], ["색상", "hairColor"]],
      headwear: [["모자", "lpcHat"], ["안경", "lpcGlasses"]],
      arms: [["팔 장식", "lpcArms"]],
      torso: [["상의", "lpcOutfit"], ["색상", "outfitColor"]],
      legs: [["하의", "lpcBottom"], ["색상", "bottomColor"]],
      feet: [["신발", "lpcShoes"], ["색상", "shoeColor"]],
      tools: [["도구", "lpcTool"]],
      weapons: [["무기", "lpcWeapon"]],
    };
    Object.entries(groupBlueprints).forEach(([category, groups]) => {
      avatarCatalog[category] = groups.flatMap(([group, slot]) => avatarCatalog[slot].map((record) => ({
        ...record, id: `${slot}:${record.id}`, itemId: record.id, slot, group,
      })));
    });
    avatarCatalog.face = avatarCatalog.head;
  }

  function avatarItemsForCategory(categoryId) {
    const choices = avatarCatalog[categoryId] || [];
    if (["head", "hair", "headwear", "arms", "torso", "legs", "feet", "tools", "weapons"].includes(categoryId)) {
      const bodyType = avatarDraft.bodyType || state.avatar.gender || "male";
      return choices.filter((choice) => (
        (!lpcCatalogMap[choice.slot] || choice.itemId === "none" || lpcChoiceSupportsBody(choice, choice.slot, bodyType))
        && (choice.slot !== "lpcShoes" || isCompleteFootwear(choice))
        && (choice.slot !== "lpcOutfit" || isCoveredTop(choice))
      ));
    }
    if (!lpcCatalogMap[categoryId]) return choices;
    const bodyType = avatarDraft.bodyType || state.avatar.gender || "male";
    return choices.filter((choice) => (
      (choice.id === "none" || lpcChoiceSupportsBody(choice, categoryId, bodyType))
      && (categoryId !== "lpcShoes" || isCompleteFootwear(choice))
      && (categoryId !== "lpcOutfit" || isCoveredTop(choice))
    ));
  }

  function isCompleteFootwear(choice) {
    if (choice.id === "none") return true;
    const definition = String(choice.definition || "").toLowerCase();
    return definition.includes("/shoes/") || definition.includes("/boots/") || definition.endsWith("feet_armour.json");
  }

  function isCoveredTop(choice) {
    const definition = String(choice.definition || "").toLowerCase();
    return !["vneck", "scoop", "cardigan", "polo", "laced", "/vest/", "jacket_frock", "jacket_collared",
      "dress_bodice", "dress_sash", "dress_slit", "kimono_oversize", "kimono_longsleeve", "clothes_robe",
      "sleeveless", "tanktop", "corset"].some((token) => definition.includes(token));
  }

  function footwearPreviewCosmetics(cosmetics) {
    return { ...cosmetics, lpcOutfit: "tshirt", outfitColor: "white", lpcBottom: "short_short", bottomColor: "black",
      lpcArms: "none", lpcTool: "none", lpcWeapon: "none", vehicle: "none" };
  }
  const footwearPreviewBounds = { x: -80, y: -162, width: 256, height: 256 };

  // The renderer safely reuses the matching adult garment for LPC body types
  // that do not ship a dedicated clothing sheet (notably muscular). Keep the
  // editor's availability rules identical so changing body type never erases
  // a selected shirt, trousers, or shoes.
  const lpcWearableFallbackSlots = new Set([
    "lpcHair", "lpcOutfit", "lpcBottom", "lpcShoes", "lpcHat", "lpcGlasses",
    "lpcArms", "lpcTool", "lpcWeapon", "lpcMobility",
  ]);

  function lpcChoiceSupportsBody(choice, slot, bodyType) {
    if (choice.sources?.[bodyType]) return true;
    if (!lpcWearableFallbackSlots.has(slot)) return false;
    const matchingAdult = bodyType === "female" ? "female" : "male";
    return Boolean(choice.sources?.[matchingAdult] || choice.sources?.male || choice.sources?.female);
  }
  const defaultCosmetics = {
    skin: "peach", accessory: "none",
    aura: "none", effect: "none", vehicle: "none", pet: "none", petAccessory: "none", speech: "none",
    lpcHair: "messy", lpcOutfit: "tshirt", lpcBottom: "long_pants", lpcShoes: "boots", lpcHat: "none", lpcGlasses: "none",
    lpcArms: "none", lpcTool: "none", lpcWeapon: "none",
    bodyType: "male", lpcHead: "human_male", lpcExpression: "neutral", lpcEyebrow: "thin", lpcNose: "button", lpcEyes: "none", lpcWrinkles: "none",
    hairColor: "black", outfitColor: "navy", bottomColor: "black", shoeColor: "brown",
    hatColor: "brown", glassesColor: "brown", mobilityColor: "black",
  };
  const defaultAvatarTuning = { headOffsetY: -6, outfitOffsetY: 0, glassesOffsetY: 0, worldScale: 0.43 };
  const OUTFIT_DEFAULT_VERSION = 5;
  const genderDefaultOutfits = {
    female: {
      label: "농부",
      sourceLabel: "나만의 코디 10",
      cosmetics: {
        bodyType: "female", skin: "porcelain", lpcHead: "human_female",
        lpcExpression: "angry", lpcEyebrow: "thin", lpcNose: "button",
        lpcEyes: "none", lpcWrinkles: "none", lpcHair: "long",
        lpcHat: "none", lpcGlasses: "none", lpcArms: "none",
        lpcOutfit: "official_torso_shirts_torso_clothes_tunic_sara",
        lpcBottom: "official_legs_skirts_legs_skirt_straight", lpcShoes: "shoes",
        lpcTool: "none", lpcWeapon: "wand",
        vehicle: "wings_monarch_wings_monarch_edge", pet: "blue_eyes_white_cat",
        hairColor: "brown", outfitColor: "blue", bottomColor: "blue", shoeColor: "brown",
      },
    },
    male: {
      label: "사냥꾼",
      sourceLabel: "나만의 코디 8",
      cosmetics: {
        bodyType: "male", skin: "peach", lpcHead: "human_male",
        lpcExpression: "blush", lpcEyebrow: "thin", lpcNose: "button",
        lpcEyes: "none", lpcWrinkles: "none", lpcHair: "curtains",
        lpcHat: "none", lpcGlasses: "none", lpcArms: "none",
        lpcOutfit: "official_torso_jacket_torso_jacket_santa",
        lpcBottom: "official_legs_pants_legs_formal_striped", lpcShoes: "shoe_revised",
        lpcTool: "none", lpcWeapon: "bow", vehicle: "none", pet: "white_pup",
        hairColor: "black", outfitColor: "navy", bottomColor: "black", shoeColor: "brown",
      },
    },
  };

  const fantasyPresetBase = {
    bodyType: "female", skin: "porcelain", lpcHead: "human_female", lpcExpression: "neutral", lpcEyebrow: "thin", lpcNose: "button",
    lpcEyes: "none", lpcWrinkles: "none", lpcHair: "long", lpcHat: "none", lpcGlasses: "none", lpcArms: "none",
    lpcOutfit: "long_blouse", lpcBottom: "plain_skirt", lpcShoes: "boots", lpcTool: "none", lpcWeapon: "none",
    vehicle: "none", pet: "none", aura: "none", effect: "none", speech: "none",
    hairColor: "brown", outfitColor: "purple", bottomColor: "navy", shoeColor: "brown", hatColor: "purple",
  };
  const additionalDefaultOutfits = [
    { role: "moon_mage", number: 3, label: "달빛 마법사", gender: "female", cosmetics: {
      lpcHat: "celestial_moon", hairColor: "silver", lpcWeapon: "wand", pet: "last_tick_white", petAccessory: "valentine_nimbus",
    } },
    { role: "forest_witch", number: 4, label: "숲의 엘프", gender: "female", cosmetics: {
      lpcHair: "braid", lpcHat: "celestial", hatColor: "green", lpcOutfit: "official_torso_shirts_torso_clothes_tunic_sara",
      outfitColor: "green", bottomColor: "brown", lpcWeapon: "bow", pet: "last_tick_white", petAccessory: "valentine_bow_red",
    } },
    { role: "inventor", number: 5, label: "숲속 발명가", gender: "male", cosmetics: {
      bodyType: "muscular", skin: "peach", lpcHead: "human_male", lpcHair: "messy", lpcHat: "leather_cap", hatColor: "brown",
      lpcGlasses: "round", glassesColor: "brown", lpcOutfit: "apron_full", outfitColor: "cream", lpcBottom: "cuffed",
      bottomColor: "navy", lpcTool: "hammer", pet: "last_tick_ginger", petAccessory: "winter_antlers_green",
    } },
    { role: "knight", number: 6, label: "숲의 기사", gender: "male", cosmetics: {
      bodyType: "male", skin: "peach", lpcHead: "human_male", lpcHair: "curtains", hairColor: "black", lpcHat: "cavalier",
      hatColor: "navy", lpcOutfit: "official_torso_armour_torso_armour_plate", outfitColor: "silver", lpcBottom: "long_pants",
      bottomColor: "navy", lpcWeapon: "arming_sword", pet: "last_tick_gray", petAccessory: "winter_santa_hat_1",
    } },
  ];

  function createAdditionalDefaultLooks(history = []) {
    return additionalDefaultOutfits.map((preset) => {
      const avatar = { gender: preset.gender, cosmetics: { ...defaultCosmetics, ...fantasyPresetBase, ...preset.cosmetics }, tuning: { ...defaultAvatarTuning } };
      const previous = history.find((look) => look.presetRole === preset.role);
      return { ...createOutfitSnapshot(avatar, previous?.savedAt || Date.now(), preset.label),
        id: `look-role-default-${preset.role}`, presetRole: preset.role, presetNumber: preset.number };
    });
  }

  function outfitSignature(avatar) {
    return JSON.stringify({ gender: avatar.gender, cosmetics: avatar.cosmetics, tuning: avatar.tuning });
  }

  function escapeMarkup(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function createOutfitSnapshot(avatar, savedAt = Date.now(), label = "나만의 코디 1") {
    return {
      id: `look-${savedAt}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt,
      label,
      gender: avatar.gender,
      cosmetics: { ...defaultCosmetics, ...(avatar.cosmetics || {}) },
      tuning: { ...defaultAvatarTuning, ...(avatar.tuning || {}) },
      signature: outfitSignature(avatar),
    };
  }

  function createGenderDefaultAvatar(gender) {
    const preset = genderDefaultOutfits[gender] || genderDefaultOutfits.female;
    return {
      gender,
      cosmetics: { ...defaultCosmetics, ...preset.cosmetics },
      tuning: { ...defaultAvatarTuning },
    };
  }

  function normalizeGenderDefaultOutfit(look, gender, savedAt = Date.now()) {
    const preset = genderDefaultOutfits[gender];
    const avatar = createGenderDefaultAvatar(gender);
    const cosmetics = {
      ...avatar.cosmetics,
      ...(look?.cosmetics || {}),
      bodyType: gender,
      lpcHead: gender === "female" ? "human_female" : "human_male",
    };
    const normalizedAvatar = {
      gender,
      cosmetics,
      tuning: { ...defaultAvatarTuning, ...(look?.tuning || {}) },
    };
    return {
      ...(look || createOutfitSnapshot(normalizedAvatar, savedAt, preset.label)),
      id: look?.id || `look-gender-default-${gender}`,
      savedAt: Number(look?.savedAt || savedAt),
      label: preset.label,
      presetRole: gender,
      gender,
      cosmetics,
      tuning: normalizedAvatar.tuning,
      signature: outfitSignature(normalizedAvatar),
    };
  }

  function ensureGenderDefaultOutfits(target, forceCanonical = false) {
    const history = Array.isArray(target.outfitHistory) ? target.outfitHistory : [];
    const defaults = ["female", "male"].map((gender, index) => {
      const preset = genderDefaultOutfits[gender];
      const roleLook = history.find((look) => look.presetRole === gender);
      const namedLook = history.find((look) => look.label === preset.label);
      // 고정 프리셋 버전이 바뀌면 브라우저의 오래된 복사본보다 코드에
      // 검증해 둔 농부·사냥꾼 구성을 우선해 캐시 초기화 후에도 풀리지 않게 한다.
      const existing = forceCanonical ? null : roleLook || namedLook;
      return normalizeGenderDefaultOutfit(existing, gender, Date.now() - index);
    });
    defaults.push(...createAdditionalDefaultLooks(history));
    const defaultIds = new Set(defaults.map((look) => look.id));
    const remainder = history.filter((look) => !defaultIds.has(look.id) && !look.presetRole
      && !Object.values(genderDefaultOutfits).some((preset) => look.label === preset.label));
    target.outfitHistory = [
      ...defaults,
      ...remainder.sort((left, right) => Number(right.savedAt || 0) - Number(left.savedAt || 0)).slice(0, 8),
    ];
  }

  function applyGenderDefaultOutfit(target, gender) {
    ensureGenderDefaultOutfits(target);
    const selectedGender = gender === "male" ? "male" : "female";
    const look = target.outfitHistory.find((item) => item.presetRole === selectedGender);
    if (!look) return null;
    target.avatar.gender = selectedGender;
    target.avatar.engine = "lpc";
    target.avatar.cosmetics = { ...defaultCosmetics, ...look.cosmetics };
    target.avatar.tuning = { ...defaultAvatarTuning, ...look.tuning };
    target.avatar.equipped = null;
    return look;
  }

  function normalizeOutfitHistory(history, avatar) {
    const byOldest = (Array.isArray(history) ? history : []).filter((look) => look?.id && look?.cosmetics)
      .sort((left, right) => Number(left.savedAt || 0) - Number(right.savedAt || 0));
    let nextLegacyNumber = 1;
    const normalized = byOldest.map((look) => ({
      ...look,
      label: look.label && look.label !== "LPC 커스텀 코디" ? String(look.label).slice(0, 24) : `나만의 코디 ${nextLegacyNumber++}`,
      gender: look.gender || avatar.gender,
      cosmetics: {
        ...defaultCosmetics,
        ...look.cosmetics,
        ...(!["male", "female", "muscular", "teen"].includes(look.cosmetics.bodyType)
          ? { bodyType: "male", lpcHead: "human_male" }
          : {}),
      },
      tuning: { ...defaultAvatarTuning, ...(look.tuning || {}) },
      signature: look.signature || outfitSignature(look),
    }));
    if (!normalized.length) normalized.push(createOutfitSnapshot(avatar));
    return normalized.sort((left, right) => Number(right.savedAt || 0) - Number(left.savedAt || 0));
  }

  function nextOutfitNumber(history) {
    return (Array.isArray(history) ? history : []).reduce((maximum, look) => {
      const matched = String(look.label || "").match(/^나만의 코디\s+(\d+)$/);
      return Math.max(maximum, matched ? Number(matched[1]) : 0);
    }, 0) + 1;
  }

  function rememberCurrentOutfit() {
    const previous = Array.isArray(state.outfitHistory) ? state.outfitHistory : [];
    const snapshot = createOutfitSnapshot(state.avatar, Date.now(), `나만의 코디 ${nextOutfitNumber(previous)}`);
    state.outfitHistory = [snapshot, ...previous.filter((look) => look.presetRole || look.signature !== snapshot.signature)];
    ensureGenderDefaultOutfits(state);
  }

  function applyRequestedDefaultOutfit(target, sourceVersion = 0) {
    const shouldMigrate = Number(sourceVersion) < OUTFIT_DEFAULT_VERSION;
    ensureGenderDefaultOutfits(target, shouldMigrate);
    if (shouldMigrate) applyGenderDefaultOutfit(target, "female");
    target.outfitDefaultVersion = OUTFIT_DEFAULT_VERSION;
  }

  function defaultState() {
    const generatedNickname = generateNickname();
    const femaleDefault = createGenderDefaultAvatar("female");
    const avatar = { name: generatedNickname, gender: "female", engine: "lpc", x: 384, y: 352, direction: "down", equipped: null, cosmetics: { ...femaleDefault.cosmetics }, tuning: { ...femaleDefault.tuning }, sitting: false, mounted: false };
    return {
      dateKey: TODAY,
      profileVersion: 1,
      cosmeticSchemaVersion: 8,
      outfitDefaultVersion: OUTFIT_DEFAULT_VERSION,
      avatar,
      quests: { walk: false, meal: false, check: false },
      challengeCarrotClaims: {},
      challengePlan: { onboarded: false, style: null, questIds: [], lastGeneratedAt: null },
      groupGoalMemo: "",
      members: [{ id: "me", name: "나", completed: 0, target: SOLO_DAILY_QUEST_TARGET, me: true }],
      groupTarget: SOLO_DAILY_QUEST_TARGET,
      carrots: 100,
      inventory: [...storageObjectCodes],
      outfitHistory: [
        normalizeGenderDefaultOutfit(null, "female", Date.now()),
        normalizeGenderDefaultOutfit(null, "male", Date.now() - 1),
        ...createAdditionalDefaultLooks(),
      ],
      placed: [],
      rewardClaimed: false,
      v2RewardOpenedDay: null,
      gardenWatered: false,
      fishCaught: false,
      fishing: false,
      petFedCount: 0,
      homeLightOn: false,
      worldLanterns: normalizeWorldLanterns(),
      homeRecordPlaying: false,
      homeRecordTrack: "home",
    };
  }

  function normalizeState(value) {
    const fallback = defaultState();
    if (!value) return fallback;
    if (value.dateKey !== TODAY) {
      const previousAvatar = value.avatar || {};
      const oldCosmetics = previousAvatar.cosmetics || {};
      const previousCosmetics = (value.cosmeticSchemaVersion || 0) < 5
        ? { ...defaultCosmetics, aura: oldCosmetics.aura || defaultCosmetics.aura, effect: oldCosmetics.effect || defaultCosmetics.effect, vehicle: oldCosmetics.vehicle || defaultCosmetics.vehicle, pet: oldCosmetics.pet || defaultCosmetics.pet, speech: oldCosmetics.speech || defaultCosmetics.speech }
        : { ...defaultCosmetics, ...oldCosmetics };
      fallback.profileVersion = 1;
      fallback.avatar = {
        ...fallback.avatar,
        ...previousAvatar,
        cosmetics: previousCosmetics,
        name: previousAvatar.name || fallback.avatar.name,
        x: 384, y: 352, direction: "down", sitting: false, mounted: false,
      };
      fallback.avatar.tuning = { ...defaultAvatarTuning, ...(previousAvatar.tuning || {}) };
      fallback.carrots = Number.isFinite(value.carrots) ? value.carrots : fallback.carrots;
      fallback.challengePlan = { ...fallback.challengePlan, ...(value.challengePlan || {}) };
      fallback.groupGoalMemo = typeof value.groupGoalMemo === "string" ? value.groupGoalMemo.slice(0, 160) : "";
      fallback.homeRecordPlaying = Boolean(value.homeRecordPlaying);
      fallback.homeLightOn = Boolean(value.homeLightOn);
      fallback.worldLanterns = normalizeWorldLanterns(value.worldLanterns);
      fallback.homeRecordTrack = Object.hasOwn(homeRecordCatalog, value.homeRecordTrack) ? value.homeRecordTrack : "home";
      fallback.inventory = Array.isArray(value.inventory) ? value.inventory.filter((code) => itemCatalog[code]?.kind === "object") : fallback.inventory;
      fallback.outfitHistory = normalizeOutfitHistory(value.outfitHistory, fallback.avatar);
      applyRequestedDefaultOutfit(fallback, value.outfitDefaultVersion);
      fallback.placed = normalizePlacedObjects(value.placed);
      if (!["male", "female", "muscular", "teen"].includes(fallback.avatar.cosmetics.bodyType)) {
        fallback.avatar.cosmetics.bodyType = "male";
        fallback.avatar.cosmetics.lpcHead = "human_male";
        fallback.avatar.gender = "male";
      }
      fallback.avatar.cosmetics.aura = "none";
      fallback.avatar.cosmetics.effect = "none";
      if ((value.cosmeticSchemaVersion || 0) < 8) fallback.avatar.cosmetics.vehicle = "none";
      fallback.cosmeticSchemaVersion = 8;
      return fallback;
    }
    const state = { ...fallback, ...value };
    state.avatar = { ...fallback.avatar, ...(value.avatar || {}) };
    state.avatar.tuning = { ...defaultAvatarTuning, ...((value.avatar || {}).tuning || {}) };
    if (!value.profileVersion || !state.avatar.name || state.avatar.name === "세준") state.avatar.name = generateNickname();
    state.profileVersion = 1;
    state.avatar.cosmetics = { ...defaultCosmetics, ...((value.avatar || {}).cosmetics || {}) };
    if ((value.cosmeticSchemaVersion || 0) < 5) {
      const old = state.avatar.cosmetics;
      state.avatar.cosmetics = { ...defaultCosmetics, aura: old.aura, effect: old.effect, vehicle: old.vehicle, pet: old.pet, speech: old.speech };
    }
    if (!["male", "female", "muscular", "teen"].includes(state.avatar.cosmetics.bodyType)) {
      state.avatar.cosmetics.bodyType = "male";
      state.avatar.cosmetics.lpcHead = "human_male";
      state.avatar.gender = "male";
    }
    state.avatar.cosmetics.aura = "none";
    state.avatar.cosmetics.effect = "none";
    if ((value.cosmeticSchemaVersion || 0) < 8) state.avatar.cosmetics.vehicle = "none";
    state.cosmeticSchemaVersion = 8;
    state.quests = { ...fallback.quests, ...(value.quests || {}) };
    state.challengeCarrotClaims = Object.fromEntries(Object.entries(value.challengeCarrotClaims || {})
      .filter(([, claim]) => Number.isFinite(Number(claim?.amount)) && Number(claim.amount) > 0)
      .map(([id, claim]) => [id, { amount: Math.min(100, Math.round(Number(claim.amount))), harvested: Boolean(claim.harvested) }]));
    state.petFedCount = Math.max(0, Math.round(Number(value.petFedCount) || 0));
    state.homeLightOn = Boolean(value.homeLightOn);
    state.worldLanterns = normalizeWorldLanterns(value.worldLanterns);
    state.homeRecordPlaying = Boolean(value.homeRecordPlaying);
    state.homeRecordTrack = Object.hasOwn(homeRecordCatalog, value.homeRecordTrack) ? value.homeRecordTrack : "home";
    state.challengePlan = { ...fallback.challengePlan, ...(value.challengePlan || {}) };
    state.groupGoalMemo = typeof value.groupGoalMemo === "string" ? value.groupGoalMemo.slice(0, 160) : "";
    state.v2RewardOpenedDay = typeof value.v2RewardOpenedDay === "string" ? value.v2RewardOpenedDay : null;
    state.members = Array.isArray(value.members) && value.members.length ? value.members : fallback.members;
    state.members = state.members.map((member) => member.id === "m5" && member.name === "숲지기" ? { ...member, name: "세준" } : member);
    state.groupTarget = Number.isFinite(Number(value.groupTarget)) && Number(value.groupTarget) > 0
      ? Number(value.groupTarget) : fallback.groupTarget;
    state.inventory = [...new Set([...(Array.isArray(value.inventory) ? value.inventory : fallback.inventory), ...storageObjectCodes])]
      .filter((code) => itemCatalog[code]?.kind === "object");
    state.outfitHistory = normalizeOutfitHistory(value.outfitHistory, state.avatar);
    applyRequestedDefaultOutfit(state, value.outfitDefaultVersion);
    // 보상 풀이 바뀌기 전에 상자를 연 데모 사용자도 희귀 꾸미기 보상을 잃지 않도록 보정한다.
    if (state.rewardClaimed && !state.inventory.includes("reward_cow")) state.inventory.push("reward_cow");
    state.placed = normalizePlacedObjects(value.placed);
    return state;
  }

  function normalizePlacedObjects(placed) {
    if (!Array.isArray(placed)) return [];
    return placed
      .filter((item) => itemCatalog[item?.code] && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))
      .map((item) => ({
        ...item,
        x: Number(item.x),
        y: Number(item.y),
        rotation: Number(item.rotation) || 0,
        ...(interactiveObjectTypes[item.code] ? { active: Boolean(item.active) } : {}),
      }));
  }

  function resetTodayProgress(current) {
    const next = normalizeState(current);
    next.quests = { walk: false, meal: false, check: false };
    next.challengeCarrotClaims = {};
    next.members = next.members.map((member) => ({ ...member, completed: member.me ? 0 : 3 }));
    next.rewardClaimed = false;
    next.v2RewardOpenedDay = null;
    next.gardenWatered = false;
    next.fishCaught = false;
    next.fishing = false;
    next.petFedCount = 0;
    next.avatar = { ...next.avatar, sitting: false, mounted: false, x: 384, y: 352, direction: "down" };
    return next;
  }

  function pendingChallengeCarrots() {
    return Object.values(state.challengeCarrotClaims || {}).reduce((total, claim) => total + (claim.harvested ? 0 : claim.amount), 0);
  }

  function accrueChallengeCarrots(questId) {
    if (state.challengeCarrotClaims?.[questId]) return 0;
    const quest = questCatalog[questId];
    if (!quest) return 0;
    state.challengeCarrotClaims ||= {};
    state.challengeCarrotClaims[questId] = { amount: quest.reward, harvested: false };
    return quest.reward;
  }

  class DemoForestAdapter {
    constructor() { this.mode = "demo"; this.memory = null; }
    async load() {
      const loaded = this.memory ? normalizeState(this.memory) : defaultState();
      this.guestName = loaded.avatar.name;
      this.memory = JSON.parse(JSON.stringify(loaded));
      return loaded;
    }
    async save(state) {
      // Account names are read-only session data, never copied into the guest save.
      const saved = { ...state, avatar: { ...state.avatar, name: this.guestName || state.avatar.name } };
      this.memory = JSON.parse(JSON.stringify(saved));
      return state;
    }
  }

  class ApiForestAdapter {
    constructor(session) {
      this.mode = "api";
      this.token = session.token;
      this.groupId = session.groupId;
      this.userId = session.userId;
      this.session = session;
    }
    async refreshAccessToken() {
      const response = await fetch("/api/v1/auth/token/refresh", {
        credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) throw Object.assign(new Error("FOREST_SESSION_EXPIRED"), { status: 401 });
      const payload = await response.json();
      if (!payload.access_token) throw Object.assign(new Error("FOREST_SESSION_EXPIRED"), { status: 401 });
      this.token = payload.access_token;
      this.session = { ...this.session, token: this.token, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000 };
      sessionStorage.setItem(FOREST_SESSION_STORAGE_KEY, JSON.stringify(this.session));
    }
    async request(path, options = {}, retry = true) {
      const response = await fetch(`/api/v1${path}`, {
        ...options,
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}`, ...(options.headers || {}) },
      });
      if (response.status === 401 && retry) {
        await this.refreshAccessToken();
        return this.request(path, options, false);
      }
      const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = response.status === 401 ? "FOREST_SESSION_EXPIRED" : response.status === 403 ? "FOREST_FORBIDDEN" : null;
        const message = code || payload.detail?.message || payload.detail || "당근의 숲 API 요청에 실패했습니다.";
        throw Object.assign(new Error(message), { status: response.status });
      }
      return payload.data ?? payload;
    }
    catalog() { return this.request("/forest/catalog"); }
    wallet() { return this.request("/wallet"); }
    shopItems() { return this.request("/inventory-items"); }
    inventory() { return this.request("/inventory"); }
    avatar() { return this.request("/avatar"); }
    loadForest(groupId) { return this.request(`/forest/spaces/${groupId}`); }
    createForest(groupId) {
      return this.request("/forest/spaces", { method: "POST", body: JSON.stringify({ group_id: groupId, name: "당근의 숲" }) });
    }
    async load() {
      let forest;
      try { forest = await this.loadForest(this.groupId); }
      catch (error) {
        if (error.status !== 404) throw error;
        forest = await this.createForest(this.groupId);
      }
      const [catalog, wallet, shop, inventory, avatar] = await Promise.all([
        this.catalog(), this.wallet(), this.shopItems(), this.inventory(), this.avatar(),
      ]);
      const loaded = defaultState();
      loaded.avatar.name = forest.me?.display_name || loaded.avatar.name;
      loaded.carrots = Number(wallet.carrot_balance ?? forest.me?.carrot_balance ?? loaded.carrots);
      applyForestHome(loaded, forest, this.userId);
      const ownedCodes = (inventory.items || []).map((item) => item.code)
        .concat(Array.isArray(forest.inventory) ? forest.inventory : [])
        .filter((code) => itemCatalog[code]);
      loaded.inventory = [...new Set([...loaded.inventory, ...ownedCodes])];
      loaded.placed = (forest.objects || []).filter((item) => itemCatalog[item.object_code]).map((item) => ({
        objectId: item.object_id,
        code: item.object_code,
        x: Math.round(Number(item.position_x) / 100 * WORLD_WIDTH),
        y: Math.round(Number(item.position_y) / 100 * WORLD_HEIGHT),
        rotation: 0,
      }));
      this.serverState = { catalog, shop, avatar, forest };
      return loaded;
    }
    async save(current) {
      // Movement and visual-only scene state are intentionally ephemeral. The
      // account, balance, inventory and shared forest remain server-owned.
      return current;
    }
    updateAvatar(body) { return this.request("/forest/avatar", { method: "PATCH", body: JSON.stringify(body) }); }
    updateQuest(userChallengeId, logDate, completed) {
      return this.request(`/user-challenges/${userChallengeId}/logs/${logDate}`, {
        method: "PUT", body: JSON.stringify({ is_completed: completed, input_source: "manual" }),
      });
    }
    claimReward(groupId) { return this.request(`/forest/spaces/${groupId}/rewards/group-daily`, { method: "POST" }); }
    placeObject(groupId, body) {
      return this.request(`/forest/spaces/${groupId}/objects`, { method: "POST", body: JSON.stringify(body) });
    }
    removeObject(groupId, objectId) {
      return this.request(`/forest/spaces/${groupId}/objects/${objectId}`, { method: "DELETE" });
    }
    purchase(itemId) { return this.request(`/inventory/items/${itemId}/purchase`, { method: "POST" }); }
    equipAvatar(itemIds) {
      return this.request("/avatar/equipment", { method: "PUT", body: JSON.stringify({ item_ids: itemIds }) });
    }
  }

  function readForestSession() {
    try {
      const forestSession = JSON.parse(sessionStorage.getItem(FOREST_SESSION_STORAGE_KEY));
      if (!forestSession?.token || !Number.isInteger(Number(forestSession.groupId)) || Number(forestSession.groupId) <= 0) return null;
      if (Number(forestSession.expiresAt || 0) <= Date.now()) {
        sessionStorage.removeItem(FOREST_SESSION_STORAGE_KEY);
        return null;
      }
      return { ...forestSession, groupId: Number(forestSession.groupId) };
    } catch {
      sessionStorage.removeItem(FOREST_SESSION_STORAGE_KEY);
      return null;
    }
  }

  const forestSession = readForestSession();
  const adapter = forestSession ? new ApiForestAdapter(forestSession) : new DemoForestAdapter();
  let state = defaultState();
  let placementCode = null;
  let placementDraft = null;
  let running = false;
  window.carrotForestRunning = running;
  let musicEngine = null;
  let sfxEngine = null;
  let chatMode = "forest";
  let wisdomIntroShown = false;
  const rewardChestSound = new Audio("/static/assets/reward-chest-success.mp3");
  rewardChestSound.preload = "auto";
  rewardChestSound.volume = .42;
  let animationFrame = 0;
  let walkingUntil = 0;
  let walkAnimationFrame = 0;
  let currentScene = "world";
  let activeAvatarCategory = "bodyType";
  let avatarPreviewPose = "idle";
  let avatarPreviewFrame = 0;
  let lastAvatarPreviewAt = 0;
  let avatarDraft = { ...defaultCosmetics };
  let avatarTuningDraft = { ...defaultAvatarTuning };
  let avatarDraftHistory = [];
  const canvas = $("#forest-canvas");
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  const avatarSpriteAtlas = new Image();
  const cosmeticSpriteAtlas = new Image();
  const catPetAtlas = new Image();
  const storageSpriteAtlas = new Image();
  const animatedObjectAtlas = new Image();
  const riverDuckImage = new Image();
  const riverDuckStates = new WeakMap();
  const campfireBaseImage = new Image();
  const rewardCowImage = new Image();
  const rewardCowWalkImage = new Image();
  const cowStates = new WeakMap();
  const basicWalkAtlas = new Image();
  const modularAvatarAtlas = new Image();
  const presetSpriteAtlases = {
    red_bow: { image: new Image(), rows: 6, file: "carrot-forest-avatar-red_bow-normalized-v2.png" },
    cow_hood: { image: new Image(), rows: 5, file: "carrot-forest-avatar-cow_hood-normalized-v2.png" },
    midnight: { image: new Image(), rows: 6, file: "carrot-forest-avatar-midnight-normalized-v2.png" },
    blue_cap: { image: new Image(), rows: 6, file: "carrot-forest-avatar-blue_cap-normalized-v2.png" },
    teal_bob: { image: new Image(), rows: 6, file: "carrot-forest-avatar-teal_bob-normalized-v2.png" },
  };
  const sceneImages = { world: new Image(), home: new Image(), garden: new Image() };
  const gardenCarrotImage = new Image();
  const petSpriteImages = new Map((window.ForestPets?.assets || []).map((asset) => {
    const image = new Image();
    image.addEventListener("load", () => {
      renderCanvas();
      renderCatalogThumbnailCanvases();
      if ($("#avatar-studio").open) renderAvatarPreview();
    });
    image.src = asset.url;
    return [asset.key, image];
  }));
  catPetAtlas.src = "/static/assets/carrot-forest-lpc-pets-v1.png?v=20260831-1";
  storageSpriteAtlas.src = "/static/assets/carrot-forest-storage-atlas-v4.png?v=20260907-1";
  animatedObjectAtlas.src = "/static/assets/carrot-forest-animated-objects-v3.png?v=20260910-1";
  riverDuckImage.src = window.ForestRiverDuckArt.asset.url;
  campfireBaseImage.src = "/static/assets/furniture-v153/campfire.png?v=20260907-1";
  rewardCowImage.src = "/static/assets/animals/lpc-cow-eat.png";
  rewardCowWalkImage.src = "/static/assets/animals/lpc-cow-walk.png";
  sceneImages.world.src = "/static/assets/carrot-forest-world-v9.png?v=20260910-1";
  sceneImages.home.src = "/static/assets/carrot-forest-home-v5.png?v=20260910-3";
  sceneImages.garden.src = window.ForestGarden.assets.background.url;
  gardenCarrotImage.addEventListener("load", renderCanvas);
  gardenCarrotImage.src = window.ForestGarden.assets.carrot.url;
  catPetAtlas.addEventListener("load", () => { renderCanvas(); if ($("#avatar-studio").open) renderAvatarStudio(); });
  storageSpriteAtlas.addEventListener("load", () => { renderInventory(); drawStorageObjectThumbnails(); renderCanvas(); });
  animatedObjectAtlas.addEventListener("load", () => { renderInventory(); drawAnimatedObjectThumbnails(); renderCanvas(); });
  riverDuckImage.addEventListener("load", () => { renderInventory(); drawAnimatedObjectThumbnails(); renderCanvas(); });
  campfireBaseImage.addEventListener("load", () => { renderInventory(); drawStorageObjectThumbnails(); renderCanvas(); });
  rewardCowImage.addEventListener("load", () => { renderInventory(); drawAnimalThumbnails(); renderCanvas(); });
  rewardCowWalkImage.addEventListener("load", renderCanvas);
  Object.values(sceneImages).forEach((image) => image.addEventListener("load", renderCanvas));
  window.addEventListener("lpc-avatar-ready", () => {
    syncLpcCatalog();
    renderCanvas();
    drawWardrobeLookThumbnails();
    drawMemberFaceThumbnails();
    if ($("#avatar-studio").open) renderAvatarStudio();
  });
  window.LpcAvatarEngine?.ready().then(() => {
    syncLpcCatalog();
    renderCanvas();
    drawWardrobeLookThumbnails();
    drawMemberFaceThumbnails();
    if ($("#avatar-studio").open) renderAvatarStudio();
  });
  window.addEventListener("lpc-avatar-assets-updated", () => {
    renderCanvas();
    drawWardrobeLookThumbnails();
    drawMemberFaceThumbnails();
    if ($("#avatar-studio").open) { renderCatalogThumbnailCanvases(); renderAvatarPreview(); }
  });

  class CozyForestMusic {
    constructor() {
      this.tracks = {
        forest: new Audio("/static/assets/carrot-forest-main-theme.mp3"),
        night: new Audio("/static/assets/peaceful-forest-samza-cc0.wav"),
        home: new Audio("/static/assets/home-drowsy-evening-cc0.wav"), // 나른한 저녁 (원곡: A Small Fire Will Do)
        homeRecordHome: new Audio("/static/assets/lp-our-home-v2.mp3"),
        homeRecordWarm: new Audio("/static/assets/lp-warm-afternoon-v2.mp3"),
        homeRecordBright: new Audio("/static/assets/lp-bright-sam-v2.mp3"),
        homeRecordUntitled: new Audio("/static/assets/lp-untitled-v2.mp3"),
        homeRecordGoingHome: new Audio("/static/assets/lp-going-home-v1.mp3"),
        homeRecordEvening: new Audio("/static/assets/home-drowsy-evening-cc0.wav"),
        homeRecordForestFairy: new Audio("/static/assets/avatar-forget-me-not-cc0.ogg"),
        garden: new Audio("/static/assets/town-pro-sensory-cc0.mp3"),
        avatar: new Audio("/static/assets/avatar-forget-me-not-cc0.ogg"), // 숲 속의 요정 (원곡: Forget Me Not)
      };
      this.volume = Math.max(0, Math.min(1, Number(localStorage.getItem(BGM_VOLUME_KEY) ?? .24)));
      this.muted = localStorage.getItem(BGM_MUTED_KEY) === "true";
      Object.values(this.tracks).forEach((track) => {
        track.loop = true;
        track.preload = "auto";
      });
      this.applyVolume();
      this.current = "forest";
      this.enabled = false;
    }
    applyVolume(multiplier = 1) {
      const volume = this.muted ? 0 : this.volume * multiplier;
      Object.values(this.tracks).forEach((track) => { track.volume = volume; });
    }
    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, Number(value)));
      localStorage.setItem(BGM_VOLUME_KEY, String(this.volume));
      if (this.volume > 0 && this.muted) this.setMuted(false);
      else this.applyVolume();
    }
    setMuted(muted) {
      this.muted = Boolean(muted);
      localStorage.setItem(BGM_MUTED_KEY, String(this.muted));
      this.applyVolume();
    }
    async switchTo(name, { restart = false } = {}) {
      if (!this.enabled || !this.tracks[name]) return;
      Object.entries(this.tracks).forEach(([trackName, track]) => {
        if (trackName !== name) track.pause();
      });
      const next = this.tracks[name];
      if (restart) next.currentTime = 0;
      this.current = name;
      await next.play();
    }
    async start(name = "forest") {
      this.enabled = true;
      await this.switchTo(name);
    }
    stop() {
      this.enabled = false;
      Object.values(this.tracks).forEach((track) => track.pause());
    }
  }

  class ForestSfx {
    constructor() {
      const root = "/static/assets/sfx";
      this.tracks = Object.fromEntries([
        "step-grass", "run-grass", "door-open", "sit-cloth", "mount", "harvest", "water",
        "fishing-cast", "fishing-catch", "attack-sword", "attack-bow", "attack-magic",
        "rat-caught", "pet-feed", "dance", "place-object", "object-on", "object-off",
      ].map((name) => [name, new Audio(`${root}/${name}.wav`)]));
      Object.values(this.tracks).forEach((track) => { track.preload = "auto"; });
      this.volume = Math.max(0, Math.min(1, Number(localStorage.getItem(SFX_VOLUME_KEY) ?? 1)));
      this.muted = localStorage.getItem(SFX_MUTED_KEY) === "true";
      this.lastPlayed = new Map();
    }
    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, Number(value)));
      localStorage.setItem(SFX_VOLUME_KEY, String(this.volume));
      if (this.volume > 0 && this.muted) this.setMuted(false);
    }
    setMuted(muted) {
      this.muted = Boolean(muted);
      localStorage.setItem(SFX_MUTED_KEY, String(this.muted));
    }
    effectiveVolume(volume) {
      return this.muted ? 0 : Math.max(0, Math.min(1, volume * this.volume));
    }
    async chime() {
      const volume = this.effectiveVolume(.16);
      if (!volume || !this.bellContext || this.bellContext.state !== "running") return;
      const ctx = this.bellContext, start = ctx.currentTime;
      // One soft bell strike, with inharmonic overtones and a natural decay.
      [523.25, 1046.5, 1465.1].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume / (index + 1), start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, start + 2.6);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start); oscillator.stop(start + 2.7);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    }
    play(name, { volume = 0.32, rate = 1, minInterval = 0 } = {}) {
      const source = this.tracks[name];
      if (!source) return;
      const now = performance.now();
      if (now - (this.lastPlayed.get(name) || 0) < minInterval) return;
      this.lastPlayed.set(name, now);
      const player = source.cloneNode();
      player.volume = this.effectiveVolume(volume);
      player.playbackRate = Math.max(0.5, Math.min(2, rate));
      player.play().catch(() => {});
    }
  }

  function playSfx(name, options) {
    sfxEngine ||= new ForestSfx();
    sfxEngine.play(name, options);
  }
  const unlockBell = () => {
    sfxEngine ||= new ForestSfx();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    sfxEngine.bellContext ||= new AudioContext();
    sfxEngine.bellContext.resume().catch(() => {});
  };
  document.addEventListener("pointerdown", unlockBell, { once: true });
  document.addEventListener("keydown", unlockBell, { once: true });
  window.addEventListener("forest-hour-chime", () => sfxEngine?.chime());
  window.addEventListener("forest-time-changed", () => {
    if (musicEngine?.enabled && currentScene === "world" && !$("#avatar-studio").open) musicEngine.switchTo(sceneMusicName()).catch(() => {});
  });

  function weaponSfxName(weapon = state.avatar.cosmetics?.lpcWeapon) {
    if (!weapon || weapon === "none") return "sit-cloth";
    if (weapon === "bow") return "attack-bow";
    if (["wand", "cane"].includes(weapon)) return "attack-magic";
    return "attack-sword";
  }

  window.addEventListener("forest-sfx", (event) => {
    const detail = typeof event.detail === "string" ? { name: event.detail } : (event.detail || {});
    if (detail.name) playSfx(detail.name, detail);
  });

  function setStatus(message) { $("#game-status").textContent = message; }
  function currentLocalHour() {
    const rawHour = new URLSearchParams(window.location.search).get("hour");
    const forced = rawHour == null ? Number.NaN : Number(rawHour);
    return Number.isFinite(forced) && forced >= 0 && forced < 24 ? forced : window.ForestAtmosphere.seoulTime().hour;
  }
  function sceneMusicName(scene = currentScene) {
    if (scene === "home") return state.homeRecordPlaying ? homeRecordCatalog[state.homeRecordTrack]?.audioKey || "homeRecordHome" : "home";
    if (scene === "garden") return "garden";
    const hour = currentLocalHour();
    if (localStorage.getItem(ATMOSPHERE_KEY) !== "off" && (hour >= 19 || hour < 5)) return "night";
    return "forest";
  }
  function activeQuestIds() {
    const selected = state.challengePlan?.questIds;
    return Array.isArray(selected) && selected.length === 3 ? selected : questPlans.balanced;
  }
  function syncActiveQuests() {
    quests = activeQuestIds().map((id) => questCatalog[id]).filter(Boolean).slice(0, 3);
    if (quests.length !== 3) quests = questPlans.balanced.map((id) => questCatalog[id]);
  }
  function personalCompleted() { return state.challengePlan?.onboarded ? activeQuestIds().filter((id) => state.quests[id]).length : 0; }
  function groupCompleted() { return state.members.reduce((total, member) => total + member.completed, 0); }
  function groupTarget() {
    const stored = Number(state.groupTarget);
    if (Number.isFinite(stored) && stored > 0) return stored;
    return Math.max(SOLO_DAILY_QUEST_TARGET, state.members.reduce((total, member) => total + Math.max(1, Number(member.target) || SOLO_DAILY_QUEST_TARGET), 0));
  }
  function applyForestHome(targetState, home, userId) {
    const members = Array.isArray(home?.members) ? home.members : [];
    targetState.members = members.map((member) => ({
      id: String(member.user_id),
      name: member.display_name || "구성원",
      completed: Math.max(0, Math.round(Number(member.today_completed) || 0)),
      target: Math.max(1, Math.round(Number(member.today_target) || SOLO_DAILY_QUEST_TARGET)),
      me: userId != null && Number(member.user_id) === Number(userId),
    }));
    if (!targetState.members.length) {
      targetState.members = [{ id: "me", name: targetState.avatar.name, completed: 0, target: SOLO_DAILY_QUEST_TARGET, me: true }];
    } else if (!targetState.members.some((member) => member.me)) {
      targetState.members.unshift({ id: "me", name: targetState.avatar.name, completed: 0, target: SOLO_DAILY_QUEST_TARGET, me: true });
    }
    const serverTarget = Number(home?.today?.target);
    targetState.groupTarget = Number.isFinite(serverTarget) && serverTarget > 0
      ? serverTarget : targetState.members.reduce((total, member) => total + member.target, 0);
    targetState.rewardClaimed = Boolean(home?.today?.group_reward_claimed);
  }
  async function syncForestGroup() {
    if (adapter.mode !== "api" || document.hidden) return;
    try {
      const home = await adapter.loadForest(adapter.groupId);
      applyForestHome(state, home, adapter.userId);
      renderGroup();
    } catch (error) {
      if ([401, 403].includes(error?.status)) showForestAccessError(error);
      else console.error("forest group sync failed", error);
    }
  }
  async function persist(message = null) {
    await adapter.save(state);
    updateProfileUI();
    window.dispatchEvent(new CustomEvent("forest-state-updated", { detail: { avatar: state.avatar, scene: currentScene, placed: state.placed, homeLightOn: state.homeLightOn, worldLanterns: state.worldLanterns, homeRecordPlaying: state.homeRecordPlaying, homeRecordTrack: state.homeRecordTrack } }));
    if (message) setStatus(message);
  }

  function fillPixelRect(x, y, width, height, color) {
    context.fillStyle = color;
    context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  function drawTree(x, y, scale = 1) {
    const sway = animationFrame % 2 ? 1 : 0;
    fillPixelRect(x + 7 * scale, y + 40 * scale, 25 * scale, 7 * scale, "rgba(34,63,40,.2)");
    fillPixelRect(x + 13 * scale, y + 23 * scale, 11 * scale, 23 * scale, "#54321f");
    fillPixelRect(x + 16 * scale, y + 24 * scale, 5 * scale, 18 * scale, "#99613a");
    fillPixelRect(x + 18 * scale, y + 29 * scale, 3 * scale, 5 * scale, "#c0824e");
    fillPixelRect(x + (3 + sway) * scale, y + 8 * scale, 31 * scale, 25 * scale, "#174e31");
    fillPixelRect(x + sway * scale, y + 15 * scale, 37 * scale, 14 * scale, "#236d3e");
    fillPixelRect(x + (8 + sway) * scale, y + 1 * scale, 22 * scale, 17 * scale, "#3e9950");
    fillPixelRect(x + (11 + sway) * scale, y + 4 * scale, 15 * scale, 8 * scale, "#68bd5d");
    fillPixelRect(x + (5 + sway) * scale, y + 17 * scale, 8 * scale, 5 * scale, "#55ac54");
    fillPixelRect(x + (25 + sway) * scale, y + 13 * scale, 6 * scale, 5 * scale, "#0f4029");
  }

  function drawFlower(x, y, petal = "#fff0a1") {
    fillPixelRect(x, y + 4, 2, 7, "#347b3f");
    fillPixelRect(x - 3, y, 3, 4, petal);
    fillPixelRect(x + 2, y, 3, 4, petal);
    fillPixelRect(x, y - 2, 2, 4, "#ffd04a");
  }

  function drawFence(x, y, length) {
    fillPixelRect(x, y + 5, length, 5, "#9a663f");
    fillPixelRect(x, y + 7, length, 2, "#d49a5e");
    for (let post = 0; post <= length; post += 24) {
      fillPixelRect(x + post, y, 6, 18, "#70472e");
      fillPixelRect(x + post + 1, y - 3, 4, 4, "#b77b48");
    }
  }

  function drawHouse() {
    fillPixelRect(42, 188, 204, 12, "rgba(45,58,37,.22)");
    fillPixelRect(48, 70, 192, 122, "#b57c45");
    fillPixelRect(56, 78, 176, 114, "#ffe6ae");
    for (let y = 84; y < 188; y += 12) fillPixelRect(58, y, 172, 2, "#edc67e");
    fillPixelRect(36, 70, 216, 24, "#71302b");
    fillPixelRect(48, 54, 192, 25, "#b83f36");
    for (let x = 52; x < 238; x += 20) {
      fillPixelRect(x, 57, 16, 6, "#da6453");
      fillPixelRect(x + 4, 67, 15, 5, "#8e302c");
    }
    fillPixelRect(68, 94, 152, 10, "#d8a954");
    fillPixelRect(122, 128, 50, 64, "#5b3524");
    fillPixelRect(130, 136, 34, 56, "#8f5935");
    fillPixelRect(157, 161, 5, 5, "#ffdc65");
    [[76, 112], [178, 112]].forEach(([x, y]) => {
      fillPixelRect(x, y, 40, 40, "#366f88");
      fillPixelRect(x + 5, y + 5, 30, 30, "#95d9ec");
      fillPixelRect(x + 8, y + 7, 9, 10, "#d9f5f7");
      fillPixelRect(x + 19, y + 5, 3, 30, "#4d8fa6");
      fillPixelRect(x + 5, y + 19, 30, 3, "#4d8fa6");
    });
    fillPixelRect(60, 188, 168, 8, "#a56e3f");
    fillPixelRect(132, 196, 31, 8, "#c69b64");
    drawFlower(72, 181, "#ff8d9b");
    drawFlower(214, 182, "#b99cff");
  }

  function drawCarrotPlot() {
    fillPixelRect(492, 46, 236, 188, "#493121");
    fillPixelRect(500, 54, 220, 172, "#835334");
    for (let row = 0; row < 4; row += 1) {
      fillPixelRect(507, 63 + row * 39, 206, 28, row % 2 ? "#6f4028" : "#75452b");
      fillPixelRect(509, 65 + row * 39, 202, 3, "#a46c42");
      for (let column = 0; column < 6; column += 1) {
        const x = 516 + column * 32;
        const y = 75 + row * 39;
        fillPixelRect(x + 7, y + 6, 8, 16, "#e86d29");
        fillPixelRect(x + 9, y + 17, 4, 6, "#c55122");
        fillPixelRect(x + 8, y, 5, 10, "#317841");
        fillPixelRect(x + 3, y - 3, 7, 7, "#48994c");
        fillPixelRect(x + 12, y - 4, 7, 8, "#65b75b");
        fillPixelRect(x + 16, y, 4, 5, "#2e713b");
      }
    }
    drawFence(490, 36, 238);
    drawFence(490, 226, 238);
  }

  function drawSharedTree() {
    fillPixelRect(326, 255, 116, 17, "rgba(28,57,35,.23)");
    fillPixelRect(361, 162, 30, 92, "#50301f");
    fillPixelRect(370, 165, 12, 82, "#9b6038");
    fillPixelRect(382, 183, 29, 10, "#694027");
    fillPixelRect(342, 117, 77, 75, "#154a2e");
    fillPixelRect(321, 139, 118, 52, "#1f6a3b");
    fillPixelRect(337, 105, 89, 55, "#31894a");
    fillPixelRect(354, 94 + (animationFrame % 2), 56, 40, "#53a952");
    fillPixelRect(346, 116, 22, 13, "#73c566");
    fillPixelRect(399, 130, 16, 10, "#0f4228");
    [[344, 155], [370, 120], [410, 158], [390, 108]].forEach(([x, y], index) => fillPixelRect(x, y + (index % 2 ? animationFrame % 2 : 0), 6, 6, "#f4b24a"));
  }

  function drawPond() {
    fillPixelRect(248, 424, 87, 50, "#3c7e88");
    fillPixelRect(254, 419, 75, 57, "#66b4b8");
    fillPixelRect(263, 425, 58, 43, "#8ad2cd");
    fillPixelRect(276 + animationFrame * 2, 432, 24, 3, "#d8f4e7");
    fillPixelRect(304 - animationFrame * 2, 455, 13, 3, "#d8f4e7");
    fillPixelRect(246, 434, 10, 8, "#4d9a54");
    fillPixelRect(327, 444, 9, 8, "#4d9a54");
  }

  function drawVehicle() {
    const x = 470;
    const y = 376;
    fillPixelRect(x - 21, y + 18, 46, 6, "rgba(31,57,45,.2)");
    fillPixelRect(x - 19, y + 7, 15, 15, "#1f3434");
    fillPixelRect(x + 9, y + 7, 15, 15, "#1f3434");
    fillPixelRect(x - 15, y + 11, 7, 7, "#a9c7c2");
    fillPixelRect(x + 13, y + 11, 7, 7, "#a9c7c2");
    fillPixelRect(x - 11, y - 1, 28, 10, "#c84e30");
    fillPixelRect(x - 3, y - 10, 18, 11, "#f58e38");
    fillPixelRect(x, y - 8, 11, 4, "#ffbd5f");
    fillPixelRect(x + 13, y - 12, 4, 14, "#384e4b");
    fillPixelRect(x + 9, y - 13, 13, 4, "#384e4b");
    fillPixelRect(x + 19, y - 15, 5, 5, "#ffdf78");
  }

  function drawMap() {
    const sceneImage = sceneImages[currentScene];
    if (sceneImage?.complete && sceneImage.naturalWidth) {
      context.drawImage(sceneImage, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      if (currentScene === "world") {
        drawVehicle();
        drawPlacedObjects();
      }
      if (currentScene === "home") drawHomeRecordPlayer();
      if (currentScene === "garden") window.ForestGarden.draw(context, gardenCarrotImage);
      return;
    }
    fillPixelRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, "#65aa59");
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const px = x * TILE;
        const py = y * TILE;
        if ((x + y) % 2 === 0) fillPixelRect(px + 6, py + 7, 3, 3, "#8bc76c");
        if ((x * 3 + y) % 5 === 0) fillPixelRect(px + 21, py + 19, 2, 5, "#438d4c");
        if ((x + y * 2) % 7 === 0) fillPixelRect(px + 13, py + 24, 4, 2, "#acd77d");
      }
    }
    fillPixelRect(0, 328, WORLD_WIDTH, 90, "#ba965e");
    fillPixelRect(0, 335, WORLD_WIDTH, 70, "#d9b779");
    fillPixelRect(352, 0, 72, WORLD_HEIGHT, "#c8a86b");
    fillPixelRect(360, 0, 56, WORLD_HEIGHT, "#e2c78f");
    for (let x = 12; x < WORLD_WIDTH; x += 36) fillPixelRect(x, 345 + (x % 3), 12, 3, "#efd39d");
    for (let y = 14; y < WORLD_HEIGHT; y += 38) fillPixelRect(371 + (y % 4), y, 18, 3, "#f0d7a5");
    drawPond();
    drawHouse();
    drawCarrotPlot();
    drawSharedTree();
    for (let x = 0; x < WORLD_WIDTH; x += 96) { drawTree(x, 0, .85); drawTree(x + 30, 445, .75); }
    for (let y = 70; y < 420; y += 100) { drawTree(4, y, .72); drawTree(725, y, .72); }
    [[275, 302, "#fff0a1"], [458, 284, "#ff9db0"], [690, 292, "#bba4ff"], [106, 285, "#fff0a1"]].forEach(([x, y, color]) => drawFlower(x, y, color));
    drawVehicle();
    drawPlacedObjects();
  }

  function drawHomeRecordPlayer() {
    if (state.homeRecordPlaying) {
      context.save();
      context.fillStyle = "#f6d795";
      context.font = "bold 14px sans-serif";
      context.fillText("♪", HOME_RECORD_PLAYER.x + 28, HOME_RECORD_PLAYER.y - 58);
      context.restore();
    }
  }

  function fallbackRiverDuckEntry(item) {
    let entry = riverDuckStates.get(item);
    if (!entry || entry.state.anchorX !== item.x || entry.state.anchorY !== item.y) {
      const index = state.placed.indexOf(item);
      const seed = (Math.imul(Math.round(item.x * 100), 73856093)
        ^ Math.imul(Math.round(item.y * 100), 19349663) ^ Math.imul(index + 1, 83492791)) >>> 0;
      entry = { state: window.ForestRiverDuck.createState({ x: item.x, y: item.y, seed }), lastAt: null, animationMs: 0 };
      riverDuckStates.set(item, entry);
    }
    return entry;
  }

  let lastRiverDuckPaintAt = -Infinity;
  function updateFallbackRiverDucks(timestamp) {
    if (window.carrotForestPhaserActive) return false;
    const hidden = document.hidden || currentScene !== "world" || Boolean(placementCode);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hasDuck = false, motionStopped = false;
    state.placed.forEach(item => {
      if (item.code !== "duck_float") return;
      hasDuck = true;
      const entry = fallbackRiverDuckEntry(item);
      const delta = entry.lastAt == null ? 0 : Math.max(0, Math.min(window.ForestRiverDuck.MAX_DELTA_MS, timestamp - entry.lastAt));
      entry.lastAt = timestamp;
      const wasMoving = entry.state.moving || entry.state.fleeing;
      entry.state = window.ForestRiverDuck.update(entry.state, delta, { hidden, reducedMotion });
      if (!hidden && !reducedMotion) entry.animationMs += delta;
      motionStopped ||= wasMoving && !entry.state.moving && !entry.state.fleeing;
    });
    // Position state is updated each RAF, painting at 30 fps instead of the
    // old 420 ms decoration cadence. Hidden/indoor time never catches up.
    if (!hasDuck || hidden || (reducedMotion && !motionStopped)) return false;
    if (!motionStopped && timestamp - lastRiverDuckPaintAt < 1000 / 30) return false;
    lastRiverDuckPaintAt = timestamp;
    return true;
  }

  function fallbackRiverDuckAt(x, y) {
    if (window.carrotForestPhaserActive || currentScene !== "world" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    // The last drawn duck owns an overlapping hit, matching canvas draw order.
    for (let index = state.placed.length - 1; index >= 0; index -= 1) {
      const item = state.placed[index];
      if (item.code !== "duck_float") continue;
      const pose = fallbackRiverDuckEntry(item).state;
      const hit = typeof window.ForestRiverDuckArt.hitTest === "function"
        ? window.ForestRiverDuckArt.hitTest(pose, x, y)
        : Math.abs(x - pose.x) <= 20 && y >= pose.y - 32 && y <= pose.y + 8;
      if (hit) return { item, index };
    }
    return null;
  }

  function fleeFallbackRiverDuck(item, x, y) {
    if (window.carrotForestPhaserActive || currentScene !== "world" || placementCode || document.hidden) return false;
    // An already-open dialog owns input; consume a duck hit without allowing a
    // second pond popup or changing its saved on/off state behind that dialog.
    if (document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')) return true;
    const entry = fallbackRiverDuckEntry(item);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    entry.state = window.ForestRiverDuck.flee(entry.state, { x, y }, { reducedMotion });
    entry.lastAt = performance.now();
    setStatus(reducedMotion ? "Ducky가 물 위에서 조용히 쉬고 있어요." : "Ducky가 살짝 놀라 반대쪽으로 헤엄친 뒤 다시 쉬어요.");
    renderCanvas();
    return true;
  }

  function fallbackCowEntry(item) {
    let entry = cowStates.get(item);
    if (!entry || entry.anchorX !== item.x || entry.anchorY !== item.y) {
      entry = { state: window.ForestAnimals.createCowState(item), lastAt: null, anchorX: item.x, anchorY: item.y };
      cowStates.set(item, entry);
    }
    return entry;
  }

  function updateFallbackCows(timestamp) {
    if (window.carrotForestPhaserActive || !window.ForestAnimals?.updateCowState) return false;
    const hidden = document.hidden || currentScene !== "world" || Boolean(placementCode);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let changed = false;
    state.placed.forEach(item => {
      if (item.code !== "reward_cow") return;
      const entry = fallbackCowEntry(item), before = window.ForestAnimals.cowPose(entry.state);
      const delta = entry.lastAt == null ? 0 : Math.max(0, Math.min(50, timestamp - entry.lastAt));
      entry.lastAt = timestamp;
      entry.state = window.ForestAnimals.updateCowState(entry.state, delta, { hidden, reducedMotion });
      const after = window.ForestAnimals.cowPose(entry.state, { reducedMotion });
      if (!hidden && (before.key !== after.key || before.frame !== after.frame)) changed = true;
    });
    return changed;
  }

  function drawPlacedObject(item, preview = false) {
      const x = 0;
      const y = 0;
      context.save();
      context.translate(item.x, item.y);
      context.rotate((Number(item.rotation) || 0) * Math.PI / 180);
      context.globalAlpha = preview ? .72 : 1;
      const interactionType = interactiveObjectTypes[item.code];
      const interactionActive = interactionType && Boolean(item.active);
      // Fixtures stay anchored even in the non-Phaser fallback renderer.
      if (item.code === "duck_float") {
        // Same downloaded source poses as Phaser; never show the retired tube.
        const entry = preview ? null : fallbackRiverDuckEntry(item);
        const pose = entry ? entry.state : window.ForestRiverDuck.createState(item);
        context.rotate(-(Number(item.rotation) || 0) * Math.PI / 180);
        // Placement previews stay on the selected cell, even when it is not
        // legal water. Only a real placed duck uses its safe transient offset.
        window.ForestRiverDuckArt.draw(context, riverDuckImage, pose,
          preview ? 0 : pose.x - item.x, preview ? 0 : pose.y - item.y, entry?.animationMs || 0);
        context.restore(); return;
      }
      const animatedRow = animatedObjectRows[item.code];
      if (animatedRow != null && animatedObjectAtlas.complete && animatedObjectAtlas.naturalWidth) {
        const size = item.code === "firefly_lantern" || item.code === "garden_pinwheel" ? 72 : 92;
        if (item.code !== "duck_float") window.ForestObjects.drawAnimatedItem(context, animatedObjectAtlas, item.code, x - size / 2, y - size * .84, size, size);
        context.restore();
        return;
      }
      if (item.code === "reward_cow" && rewardCowImage.complete && rewardCowImage.naturalWidth && window.ForestAnimals) {
        const cowState = preview || window.carrotForestPhaserActive ? window.ForestAnimals.createCowState(item) : fallbackCowEntry(item).state;
        let sample = window.ForestAnimals.cowPose(cowState, {
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        let cowImage = sample.key === "forest-cow-walk" ? rewardCowWalkImage : rewardCowImage;
        if (!cowImage.complete || !cowImage.naturalWidth) {
          sample = window.ForestAnimals.cowFrame();
          cowImage = rewardCowImage;
        }
        const frame = window.ForestAnimals.frameRect(sample.key, sample.frame), size = 160;
        context.drawImage(cowImage, frame.x, frame.y, frame.width, frame.height,
          x - size * sample.originX, y - size * sample.originY, size, size);
        context.restore(); return;
      }
      const storageIndex = storageObjectIndex[item.code];
      if (storageIndex != null && storageSpriteAtlas.complete && storageSpriteAtlas.naturalWidth) {
        const atlas = window.ForestObjects.createLegacyStorageAtlas(storageSpriteAtlas);
        if (item.code === "campfire" && campfireBaseImage.complete && campfireBaseImage.naturalWidth) {
          const tile = interactionActive ? window.ForestFire.burningTile(atlas, campfireBaseImage) : window.ForestFire.offTile(atlas, campfireBaseImage);
          context.drawImage(tile, x - 32, y - 48, 64, 64);
        } else window.ForestObjects.drawStorageItem(context, storageSpriteAtlas, item.code, x - 32, y - 48, 64, 64);
        context.restore(); return;
      }
      if (item.code === "flower_patch") {
        fillPixelRect(x - 15, y - 7, 30, 14, "#4b8e3f");
        [[-10, -8, "#ffcf43"], [0, -12, "#f16d77"], [10, -7, "#fff2a8"]].forEach(([dx, dy, color]) => fillPixelRect(x + dx, y + dy, 7, 7, color));
      } else if (item.code === "bench") {
        fillPixelRect(x - 18, y - 10, 36, 9, "#875333"); fillPixelRect(x - 14, y, 28, 7, "#a86a3f");
        fillPixelRect(x - 12, y + 7, 5, 10, "#5b3a28"); fillPixelRect(x + 8, y + 7, 5, 10, "#5b3a28");
      } else if (item.code === "lantern") {
        fillPixelRect(x - 3, y - 18, 6, 34, "#49362e"); fillPixelRect(x - 10, y - 20, 20, 18, "#ffd456"); fillPixelRect(x - 6, y - 16, 12, 10, "#ff9340");
      } else {
        fillPixelRect(x - 6, y - 2, 12, 16, "#eee4d2");
        fillPixelRect(x - 14, y - 15, 28, 14, "#e34e42");
        fillPixelRect(x - 9, y - 18, 18, 5, "#f26959");
        fillPixelRect(x - 7, y - 12, 4, 4, "#fff2d1");
        fillPixelRect(x + 4, y - 9, 4, 4, "#fff2d1");
      }
      context.restore();
  }

  function drawPlacementGrid() {
    if (!placementCode || currentScene !== "world") return;
    placementGridCells().forEach((cell) => {
      context.fillStyle = cell.valid ? "rgba(69,201,113,.16)" : "rgba(197,75,65,.06)";
      context.fillRect(cell.x - 15, cell.y - 15, 30, 30);
      context.strokeStyle = cell.valid ? "rgba(28,128,68,.72)" : "rgba(154,65,58,.20)";
      context.lineWidth = 1;
      context.strokeRect(cell.x - 15.5, cell.y - 15.5, 31, 31);
    });
    if (placementDraft) drawPlacedObject(placementDraft, true);
  }

  function drawPlacedObjects() {
    state.placed.forEach((item) => drawPlacedObject(item));
  }

  function avatarSpriteIndex(cosmetics) {
    if (cosmetics.skin === "deep") return 9;
    if (cosmetics.hair === "silver") return 10;
    if (cosmetics.hair === "orange") return 2;
    if (cosmetics.hair === "wave") return cosmetics.outfit === "moon" ? 5 : 1;
    if (cosmetics.hair === "twin") return 7;
    if (cosmetics.outfit === "denim") return cosmetics.skin === "warm" ? 6 : 4;
    if (cosmetics.outfit === "carrot") return 9;
    if (cosmetics.outfit === "moon" || cosmetics.outfit === "violet") return 10;
    if (cosmetics.outfit === "berry") return 5;
    if (cosmetics.outfit === "yellow") return 3;
    if (cosmetics.accessory === "sprout_hat") return 8;
    return cosmetics.accessory === "round_glasses" ? 2 : cosmetics.accessory === "carrot_bag" ? 11 : 0;
  }

  function cosmeticSpriteIndex(category, itemId) {
    const indexes = {
      pet: { white_pup: 15, brown_pup: 16, cat: 17, fox: 18 },
      speech: { cat: 19, leaf: 19, window: 19 },
    };
    return indexes[category]?.[itemId] ?? null;
  }

  function catPetSpriteIndex(itemId) {
    return { blue_eyes_white_cat: 1, gold_eyes_orange_cat: 4, white_pup: 7,
      lpc_white_cat: 1, lpc_orange_cat: 4, lpc_brown_dog: 7 }[itemId] ?? null;
  }

  function drawPetFrame(target, petId, poseOptions, x, y, size) {
    if (!petId || petId === "none") return false;
    const pose = window.ForestPets?.pose(petId, poseOptions);
    const image = pose?.key === "lpc-pets" ? catPetAtlas : petSpriteImages.get(pose?.key);
    const drawLayer = (sheet, frame, flipX, originX = .5, originY = 1) => {
      if (!sheet?.complete || !sheet.naturalWidth || !Number.isInteger(frame) || frame < 0) return false;
      const columns = Math.floor(sheet.naturalWidth / 32);
      if (!columns || frame >= columns * Math.floor(sheet.naturalHeight / 32)) return false;
      target.save();
      target.imageSmoothingEnabled = false;
      target.translate(x, y);
      target.scale(flipX ? -1 : 1, 1);
      target.drawImage(sheet, (frame % columns) * 32, Math.floor(frame / columns) * 32, 32, 32,
        -size * originX, -size * originY, size, size);
      target.restore();
      return true;
    };
    const overlayImage = petSpriteImages.get(pose?.overlay?.key);
    const overlayReady = !pose?.overlay || Boolean(overlayImage?.complete && overlayImage.naturalWidth);
    if (pose && overlayReady && drawLayer(image, pose.frame, pose.flipX, pose.originX, pose.originY)) {
      if (pose.overlay) drawLayer(petSpriteImages.get(pose.overlay.key), pose.overlay.frame,
        pose.overlay.flipX ?? pose.flipX, pose.originX, pose.originY);
      return true;
    }
    // Licensed art is installed separately. Missing optional PNGs must not
    // erase the selected companion or leave a blank selection card.
    const fallback = catPetSpriteIndex(petId) ?? ({ brown_pup: 7, cat: 1, fox: 4, last_tick_white: 1, last_tick_gray: 1,
      last_tick_ginger: 4, last_tick_ribbon: 1 }[petId]);
    return drawLayer(catPetAtlas, fallback, false);
  }

  function drawAtlasCell(target, image, index, columns, rows, x, y, width, height) {
    if (!image.complete || !image.naturalWidth || index == null) return false;
    const cellWidth = image.naturalWidth / columns;
    const cellHeight = image.naturalHeight / rows;
    const column = index % columns;
    const row = Math.floor(index / columns);
    target.drawImage(image, column * cellWidth, row * cellHeight, cellWidth, cellHeight, x, y, width, height);
    return true;
  }

  function isAnimatedBasicPreset(cosmetics) {
    return cosmetics.skin === "peach"
      && cosmetics.outfit === "forest"
      && cosmetics.hair === "soft"
      && cosmetics.face === "calm"
      && cosmetics.accessory === "none";
  }

  function drawAnimatedAccessoryOverlay(avatar, cosmetics, x, y) {
    const direction = avatar.direction || "down";
    const accessory = cosmetics.accessory;
    if (accessory === "red_scarf") {
      fillPixelRect(x - 15, y - 22, 30, 6, "#cf3435");
      if (direction === "left") fillPixelRect(x + 9, y - 18, 12, 5, "#e34c49");
      if (direction === "right") fillPixelRect(x - 21, y - 18, 12, 5, "#e34c49");
    }
    if (accessory === "sprout_hat") {
      fillPixelRect(x - 18, y - 55, 36, 7, "#347f3d"); fillPixelRect(x - 3, y - 66, 6, 12, "#216a34"); fillPixelRect(x + 2, y - 66, 12, 7, "#65b85d");
    }
    if (accessory === "round_glasses" || accessory === "star_glasses") {
      const color = accessory === "star_glasses" ? "#e75e99" : "#354751";
      if (direction === "down") {
        context.strokeStyle = color; context.lineWidth = 2; context.strokeRect(x - 15, y - 40, 12, 9); context.strokeRect(x + 3, y - 40, 12, 9); fillPixelRect(x - 3, y - 37, 6, 2, color);
      } else if (direction === "left" || direction === "right") {
        context.strokeStyle = color; context.lineWidth = 2; context.strokeRect(x + (direction === "left" ? -17 : 5), y - 39, 13, 9);
      }
    }
    if (accessory === "carrot_bag") {
      const side = direction === "left" ? 12 : direction === "right" ? -23 : 14;
      fillPixelRect(x + side, y - 5, 12, 22, "#bd4e25"); fillPixelRect(x + side + 2, y - 2, 8, 16, "#ef7c31");
    }
  }

  function drawAnimatedBasicWorldAvatar(avatar, cosmetics, x, y) {
    const presetAtlas = presetSpriteAtlases[avatar.preset];
    const direction = avatar.direction || "down";
    const moving = performance.now() < walkingUntil;
    if (presetAtlas) {
      if (!presetAtlas.image.complete || !presetAtlas.image.naturalWidth) return false;
      const directionColumn = { down: 0, up: 1, left: 2, right: 3 }[direction] ?? 0;
      const directionRow = { down: 0, up: 1, left: 2, right: 3 }[direction] ?? 0;
      const frame = moving ? walkAnimationFrame % 4 : 0;
      drawAtlasCell(context, presetAtlas.image, directionRow * 4 + frame, 4, presetAtlas.rows, x - 36, y - 56, 72, 88);
    } else {
      if (!basicWalkAtlas.complete || !basicWalkAtlas.naturalWidth) return false;
      const directionRow = { down: 0, up: 1, left: 2, right: 3 }[direction] ?? 0;
      const frame = moving ? walkAnimationFrame % 4 : 0;
      drawAtlasCell(context, basicWalkAtlas, directionRow * 4 + frame, 4, 4, x - 34, y - 54, 68, 86);
    }

    drawAnimatedAccessoryOverlay(avatar, cosmetics, x, y);

    const petIndex = cosmeticSpriteIndex("pet", cosmetics.pet);
    const catIndex = catPetSpriteIndex(cosmetics.pet);
    if (!drawAtlasCell(context, catPetAtlas, catIndex, 9, 4, x + 18, y - 2, 46, 46)) {
      drawAtlasCell(context, cosmeticSpriteAtlas, petIndex, 5, 4, x + 20, y + 5, 35, 35);
    }
    if (cosmetics.speech !== "none") {
      const speechIndex = cosmeticSpriteIndex("speech", cosmetics.speech);
      drawAtlasCell(context, cosmeticSpriteAtlas, speechIndex, 5, 4, x + 25, y - 65, 62, 45);
      context.font = "bold 7px sans-serif"; context.textAlign = "center"; context.fillStyle = "#31343f";
      context.fillText(cosmetics.speech === "cat" ? "안녕!" : cosmetics.speech === "leaf" ? "한 걸음" : "같이 걸어요", x + 56, y - 41);
    }
    // The shared DOM label stays sharp at every camera magnification.
    return true;
  }

  function drawGeneratedWorldAvatar(avatar, cosmetics, x, y) {
    if (!avatarSpriteAtlas.complete || !avatarSpriteAtlas.naturalWidth) return false;
    const spriteIndex = avatarSpriteIndex(cosmetics);
    drawAtlasCell(context, avatarSpriteAtlas, spriteIndex, 4, 3, x - 31, y - 48, 62, 78);
    const petIndex = cosmeticSpriteIndex("pet", cosmetics.pet);
    const catIndex = catPetSpriteIndex(cosmetics.pet);
    if (!drawAtlasCell(context, catPetAtlas, catIndex, 9, 4, x + 18, y - 2, 46, 46)) {
      drawAtlasCell(context, cosmeticSpriteAtlas, petIndex, 5, 4, x + 20, y + 5, 35, 35);
    }
    if (cosmetics.speech !== "none") {
      const speechIndex = cosmeticSpriteIndex("speech", cosmetics.speech);
      drawAtlasCell(context, cosmeticSpriteAtlas, speechIndex, 5, 4, x + 25, y - 60, 62, 45);
      context.font = "bold 7px sans-serif"; context.textAlign = "center"; context.fillStyle = "#31343f";
      context.fillText(cosmetics.speech === "cat" ? "안녕!" : cosmetics.speech === "leaf" ? "한 걸음" : "같이 걸어요", x + 56, y - 36);
    }
    // The shared DOM label stays sharp at every camera magnification.
    return true;
  }

  function drawAvatar() {
    const avatar = state.avatar;
    const style = { hair: "#4b2f24", outfit: "#4f9e63", accent: "#c8f06a" };
    const cosmetics = { ...defaultCosmetics, ...(avatar.cosmetics || {}) };
    const skin = avatarCatalog.skin.find((item) => item.id === cosmetics.skin)?.color || "#f2bd92";
    const skinShadow = cosmetics.skin === "deep" ? "#6d392f" : cosmetics.skin === "warm" ? "#a7654f" : "#d99978";
    const hairStyles = { soft: style.hair, wave: "#3b2b34", crop: "#263b43", twin: "#54313e", silver: "#8992a4", orange: "#bd6236" };
    const outfitStyles = {
      forest: ["#4f9e63", "#c8f06a"], denim: ["#4879a5", "#c8e3f8"], carrot: ["#e87531", "#ffe078"],
      moon: ["#4b527f", "#d9e3ff"], berry: ["#b44f78", "#ffd2df"], yellow: ["#e7b737", "#fff1a8"],
      violet: ["#7055af", "#d8c8ff"], black: ["#2f3441", "#9da6bc"],
    };
    const [outfitColor, outfitAccent] = outfitStyles[cosmetics.outfit] || [style.outfit, style.accent];
    const equipped = cosmetics.accessory !== "none" ? cosmetics.accessory : avatar.equipped;
    const x = Math.round(avatar.x / 4) * 4;
    const bob = avatar.sitting || avatar.mounted ? 0 : animationFrame;
    const y = Math.round(avatar.y / 4) * 4 - bob;
    if (window.LpcAvatarEngine?.isReady()) {
      window.LpcAvatarEngine.draw(context, { ...avatar, engine: "lpc", cosmetics }, {
        direction: avatar.direction || "down",
        moving: performance.now() < walkingUntil,
        running,
        frame: walkAnimationFrame,
      }, { x: x - 48, y: y - 68, width: 96, height: 96 });
      drawPetFrame(context, cosmetics.pet, {
        action: avatar.sitting ? "sit" : performance.now() < walkingUntil ? "walk" : "idle",
        direction: avatar.direction || "down", elapsed: performance.now(),
        idleMs: Math.max(0, performance.now() - walkingUntil), equipment: cosmetics.petAccessory,
        reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
      }, x + 37, y + 22, 40);
    }
    // Never expose the retired hand-drawn or preset-atlas avatar while the
    // official LPC manifest or individual layers are still loading.
    return;
    if (drawAnimatedBasicWorldAvatar(avatar, cosmetics, x, y)) return;
    fillPixelRect(x - 17, y + 31, 34, 7, "rgba(24,55,37,.26)");
    fillPixelRect(x - 12, y - 22, 24, 24, skinShadow);
    fillPixelRect(x - 10, y - 21, 20, 21, skin);
    fillPixelRect(x - 13, y - 14, 3, 8, skinShadow);
    fillPixelRect(x + 10, y - 14, 3, 8, skinShadow);
    if (avatar.gender === "female") {
      fillPixelRect(x - 15, y - 29, 30, 11, hairStyles[cosmetics.hair]);
      fillPixelRect(x - 16, y - 20, 7, cosmetics.hair === "wave" ? 31 : 25, hairStyles[cosmetics.hair]);
      fillPixelRect(x + 9, y - 20, 7, cosmetics.hair === "wave" ? 31 : 25, hairStyles[cosmetics.hair]);
      fillPixelRect(x - 10, y - 25, 8, 5, "rgba(255,255,255,.15)");
    } else if (avatar.gender === "male") {
      fillPixelRect(x - 14, y - 28, 28, 10, hairStyles[cosmetics.hair]);
      fillPixelRect(x - 16, y - 22, 8, 12, hairStyles[cosmetics.hair]);
      fillPixelRect(x + 8, y - 23, 6, 7, hairStyles[cosmetics.hair]);
      fillPixelRect(x - 7, y - 27, 10, 4, "rgba(255,255,255,.14)");
    } else {
      fillPixelRect(x - 15, y - 28, 30, 11, hairStyles[cosmetics.hair]);
      fillPixelRect(x - 16, y - 20, 7, 17, hairStyles[cosmetics.hair]);
      fillPixelRect(x + 9, y - 20, 7, 17, hairStyles[cosmetics.hair]);
    }
    fillPixelRect(x - 8, y - 13, 4, 5, "#f9fbec");
    fillPixelRect(x + 4, y - 13, 4, 5, "#f9fbec");
    fillPixelRect(x - 7, y - 12, 2, 3, "#24322f");
    fillPixelRect(x + 5, y - 12, 2, 3, "#24322f");
    if (cosmetics.face === "wink") fillPixelRect(x + 4, y - 10, 5, 2, "#24322f");
    if (cosmetics.face === "blush" || cosmetics.face === "sparkle") { fillPixelRect(x - 10, y - 7, 4, 3, "#ed8490"); fillPixelRect(x + 6, y - 7, 4, 3, "#ed8490"); }
    fillPixelRect(x - (cosmetics.face === "smile" ? 5 : 4), y - 5, cosmetics.face === "smile" ? 10 : 8, 2, cosmetics.face === "cool" ? "#6c5c65" : "#b96c67");
    fillPixelRect(x - 15, y, 30, 25, "#203b34");
    fillPixelRect(x - 13, y + 1, 26, 22, outfitColor);
    fillPixelRect(x - 9, y + 4, 18, 5, outfitAccent);
    fillPixelRect(x - 20, y + 3, 7, 19, skinShadow);
    fillPixelRect(x - 18, y + 3, 5, 17, skin);
    fillPixelRect(x + 13, y + 3, 7, 19, skinShadow);
    fillPixelRect(x + 13, y + 3, 5, 17, skin);
    if (avatar.sitting) {
      fillPixelRect(x - 13, y + 21, 13, 10, "#334b5e");
      fillPixelRect(x, y + 21, 13, 10, "#334b5e");
      fillPixelRect(x - 19, y + 28, 19, 7, "#263946");
      fillPixelRect(x, y + 28, 19, 7, "#263946");
    } else if (!avatar.mounted) {
      fillPixelRect(x - 12, y + 23, 10, 14, "#334b5e");
      fillPixelRect(x + 2, y + 23, 10, 14, "#334b5e");
      fillPixelRect(x - 14, y + 35, 12, 5, "#253846");
      fillPixelRect(x + 2, y + 35, 12, 5, "#253846");
    }
    if (equipped === "red_scarf") fillPixelRect(x - 13, y - 1, 26, 6, "#d93432");
    if (equipped === "sprout_hat") {
      fillPixelRect(x - 16, y - 32, 32, 7, "#347f3d");
      fillPixelRect(x - 3, y - 42, 6, 11, "#216a34");
      fillPixelRect(x + 2, y - 42, 9, 6, "#5fb85d");
    }
    if (equipped === "carrot_bag") {
      fillPixelRect(x + 13, y + 6, 11, 17, "#b94f25");
      fillPixelRect(x + 15, y + 8, 8, 13, "#ee7d32");
    }
    if (equipped === "round_glasses" || equipped === "star_glasses") {
      const glassColor = equipped === "star_glasses" ? "#e75e99" : "#354751";
      context.strokeStyle = glassColor; context.lineWidth = 2; context.strokeRect(x - 10, y - 15, 8, 7); context.strokeRect(x + 2, y - 15, 8, 7); fillPixelRect(x - 2, y - 13, 4, 2, glassColor);
    }
    if (cosmetics.pet !== "none") {
      const petGlyphs = { white_pup: "🐶", brown_pup: "🐕", cat: "🐈", fox: "🦊" };
      const catIndex = catPetSpriteIndex(cosmetics.pet);
      if (!drawAtlasCell(context, catPetAtlas, catIndex, 9, 4, x + 18, y - 2, 46, 46)) {
        context.font = "22px sans-serif"; context.fillText(petGlyphs[cosmetics.pet] || "🐾", x + 34, y + 34);
      }
    }
    // Nickname is rendered once as a camera-projected DOM pill.
    if (cosmetics.speech !== "none") {
      const speechText = cosmetics.speech === "cat" ? "안녕!" : cosmetics.speech === "leaf" ? "오늘도 한 걸음" : "같이 걸어요";
      context.font = "bold 9px sans-serif"; context.fillStyle = "rgba(255,255,255,.94)"; context.fillRect(x + 26, y - 48, 68, 22); context.fillStyle = "#31343f"; context.fillText(speechText, x + 60, y - 34);
    }
  }

  function drawSceneEffects() {
    if (currentScene === "home" && state.avatar.sitting) {
      context.fillStyle = "rgba(255,255,255,.9)";
      context.font = "bold 15px sans-serif";
      context.fillText("Z", state.avatar.x + 31, state.avatar.y - 55);
      context.font = "bold 10px sans-serif";
      context.fillText("z", state.avatar.x + 43, state.avatar.y - 68);
    }
    if (currentScene === "world" && state.fishing) {
      context.strokeStyle = "#5a412b";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(state.avatar.x + 16, state.avatar.y - 5);
      context.lineTo(280, 399);
      context.stroke();
      context.strokeStyle = "#e8f5ee";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(280, 399);
      context.lineTo(250, 432);
      context.stroke();
      context.fillStyle = "#ffd45c";
      context.font = "18px sans-serif";
      context.fillText(state.fishCaught ? "✦" : "~", 246, 436);
    }
  }

  function renderSceneChrome() {
    const sceneCopy = {
      world: { title: window.ForestHud?.forestName || "우리의 작은 숲", aria: "집, 당근밭, 연못이 있는 고해상도 픽셀 숲 월드" },
      home: { title: "우리 집", aria: "소파와 옷장이 있는 집 내부 장면" },
      garden: { title: "당근 밭", aria: "1주차부터 6주차까지, 주차별 당근 5개와 나무 팻말이 있는 당근밭 장면" },
    }[currentScene];
    $("#map-title").textContent = sceneCopy.title;
    canvas.setAttribute("aria-label", `${sceneCopy.aria}. 방향키나 WASD로 이동하고 Q키로 상호작용할 수 있습니다.`);
    $("#scene-exit").hidden = currentScene === "world";
    projectMapLabels();
  }

  function projectMapLabels() {
    [[".home-label", 205, 62], [".garden-label", 610, 62]].forEach(([selector, x, y]) => {
      const label = $(selector);
      if (!label?.style) return;
      const point = window.ForestCamera?.worldToScreen(x, y) || { x: x / WORLD_WIDTH, y: y / WORLD_HEIGHT };
      label.hidden = currentScene !== "world" || point.x < .03 || point.x > .97 || point.y < .03 || point.y > .94;
      label.style.left = `${point.x * 100}%`;
      label.style.top = `${point.y * 100}%`;
    });
    const nickname = $("#avatar-nameplate");
    if (!nickname) return;
    const anchor = window.ForestCamera?.avatarAnchor() || { x: state.avatar.x / WORLD_WIDTH, y: (state.avatar.y - 74) / WORLD_HEIGHT, name: state.avatar.name };
    nickname.textContent = anchor.name || state.avatar.name;
    nickname.hidden = !nickname.textContent || anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1;
    nickname.style.left = `${anchor.x * 100}%`;
    nickname.style.top = `${anchor.y * 100}%`;
  }
  window.addEventListener("forest-camera-view", projectMapLabels);

  let fallbackNightCanvas = null;
  function drawFallbackNightLighting() {
    if (window.carrotForestPhaserActive || !["world", "home"].includes(currentScene) || localStorage.getItem(ATMOSPHERE_KEY) === "off") return;
    const strength = window.ForestAtmosphere.strength(currentLocalHour());
    if (!strength) return;
    fallbackNightCanvas ||= document.createElement("canvas");
    if (fallbackNightCanvas.width !== WORLD_WIDTH) fallbackNightCanvas.width = WORLD_WIDTH;
    if (fallbackNightCanvas.height !== WORLD_HEIGHT) fallbackNightCanvas.height = WORLD_HEIGHT;
    const mask = fallbackNightCanvas.getContext("2d");
    mask.globalCompositeOperation = "source-over";
    mask.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    mask.fillStyle = "#101b2d";
    mask.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    mask.globalCompositeOperation = "destination-out";
    const fixedWorldLights = currentScene === "world"
      ? WORLD_FIXED_LANTERNS.filter(source => state.worldLanterns?.[source.id])
        .map(source => ({ x: source.x, y: source.y, radius: source.radius }))
      : [];
    const placedLights = currentScene === "world"
      ? state.placed.filter(item => item.active && ["campfire", "lantern", "firefly_lantern"].includes(item.code))
        .map(item => ({ x: item.x, y: item.y - (item.code === "campfire" ? 22 : 32), radius: item.code === "campfire" ? 105 : 86 }))
      : [];
    const lights = currentScene === "home" && state.homeLightOn ? HOME_LIGHT_SOURCES : [...fixedWorldLights, ...placedLights];
    lights.forEach(({ x, y, radius }) => {
      const gradient = mask.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(0,0,0,.96)");
      gradient.addColorStop(.3, "rgba(0,0,0,.78)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      mask.fillStyle = gradient;
      mask.beginPath(); mask.arc(x, y, radius, 0, Math.PI * 2); mask.fill();
    });
    mask.globalCompositeOperation = "source-over";
    context.save();
    context.globalAlpha = strength;
    context.drawImage(fallbackNightCanvas, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.restore();
  }

  function renderCanvas() {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    context.imageSmoothingEnabled = false;
    drawMap();
    drawPlacementGrid();
    drawAvatar();
    drawSceneEffects();
    drawFallbackNightLighting();
    renderSceneChrome();
    $("#avatar-coordinate").textContent = `X ${Math.round(state.avatar.x)} · Y ${Math.round(state.avatar.y)}`;
    updateInteractionPrompt();
  }

  function reactToCow(index, reaction = "body") {
    const item = state.placed[index];
    if (item?.code !== "reward_cow") return;
    const headTouch = reaction === "head";
    if (!window.carrotForestPhaserActive) {
      const entry = fallbackCowEntry(item);
      entry.state = window.ForestAnimals.touchCowState(entry.state, reaction, {
        hidden: document.hidden || currentScene !== "world" || Boolean(placementCode),
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      entry.lastAt = performance.now();
    }
    sfxEngine ||= new ForestSfx();
    window.ForestAnimals?.playMoo({ enabled: !sfxEngine.muted, volume: sfxEngine.effectiveVolume(.4) });
    window.dispatchEvent(new CustomEvent("forest-cow-react", { detail: { index, reaction } }));
    setStatus(headTouch ? "행운의 젖소를 쓰다듬었어요. 음메 하고 고개를 들어 바라봐요." : "행운의 젖소를 토닥였어요. 음메 하고 발을 고쳐 디딘 뒤 다시 쉬어요.");
    renderCanvas();
  }

  let lastAnimationAt = 0;
  let lastWalkAnimationAt = 0;
  function animateWorld(timestamp) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let needsRender = updateFallbackRiverDucks(timestamp);
    if (updateFallbackCows(timestamp)) needsRender = true;
    if (!document.hidden && !reducedMotion && timestamp - lastAnimationAt > 420) {
      animationFrame = (animationFrame + 1) % 4;
      lastAnimationAt = timestamp;
      needsRender = true;
    }
    const moving = timestamp < walkingUntil;
    if (!reducedMotion && $("#avatar-studio").open && timestamp - lastAvatarPreviewAt > 120) {
      avatarPreviewFrame += 1;
      lastAvatarPreviewAt = timestamp;
      renderCatalogThumbnailCanvases();
      renderAvatarPreview();
    }
    if (!document.hidden && !reducedMotion && moving && timestamp - lastWalkAnimationAt > (state.avatar.mounted ? 115 : running ? 90 : 140)) {
      walkAnimationFrame = (walkAnimationFrame + 1) % 4;
      lastWalkAnimationAt = timestamp;
      needsRender = true;
    } else if (!moving && walkAnimationFrame !== 0) {
      walkAnimationFrame = 0;
      needsRender = true;
    }
    if (needsRender) renderCanvas();
    window.requestAnimationFrame(animateWorld);
  }

  function distanceTo(x, y) {
    return Math.hypot(state.avatar.x - x, state.avatar.y - y);
  }

  function nearbyPlacedObject(x = state.avatar.x, y = state.avatar.y, maxDistance = 72) {
    if (currentScene !== "world") return null;
    return state.placed
      .map((item, index) => ({ item, index, distance: Math.hypot(x - item.x, y - item.y) }))
      .filter(({ item, distance }) => (interactiveObjectTypes[item.code] || seatObjectCodes.has(item.code)) && distance <= maxDistance)
      .sort((left, right) => left.distance - right.distance)[0] || null;
  }

  function objectInteractionLabel(item) {
    if (seatObjectCodes.has(item.code)) return `${itemCatalog[item.code].name}에 앉기`;
    const type = interactiveObjectTypes[item.code];
    if (type === "cow") return "젖소 쓰다듬기";
    if (type === "fire") return item.active ? "모닥불 끄기" : "모닥불 피우기";
    return item.active ? `${itemCatalog[item.code].name} 끄기` : `${itemCatalog[item.code].name} 켜기`;
  }

  async function togglePlacedObject(index) {
    const item = state.placed[index];
    const type = interactiveObjectTypes[item?.code];
    if (!item || !type) return;
    if (type === "cow") { reactToCow(index); return; }
    item.active = !item.active;
    item.activatedAt = item.active ? Date.now() : null;
    playSfx(item.active ? "object-on" : "object-off", { volume: .3 });
    renderPlaced();
    emitPlacementUpdate();
    await persist(`${itemCatalog[item.code].name}${item.active ? "을 켰습니다." : "을 껐습니다."}`);
    updateInteractionPrompt();
  }

  async function toggleHomeLight() {
    if (currentScene !== "home") return;
    state.homeLightOn = !state.homeLightOn;
    playSfx(state.homeLightOn ? "object-on" : "object-off", { volume: .28 });
    renderCanvas();
    await persist(state.homeLightOn ? "방 조명을 켰습니다." : "방 조명을 껐습니다.");
    updateInteractionPrompt();
  }

  async function toggleWorldFixedLantern(id) {
    if (currentScene !== "world" || !WORLD_FIXED_LANTERNS.some(source => source.id === id)) return;
    state.worldLanterns = normalizeWorldLanterns({ ...state.worldLanterns, [id]: !state.worldLanterns?.[id] });
    playSfx(state.worldLanterns[id] ? "object-on" : "object-off", { volume: .28 });
    renderCanvas();
    await persist(state.worldLanterns[id] ? "숲 등불을 켰습니다." : "숲 등불을 껐습니다.");
    updateInteractionPrompt();
  }

  function nearbyInteraction() {
    if (currentScene === "home") {
      if (HOME_LIGHT_SOURCES.some(light => distanceTo(light.x, light.y) < 76)) return "home_light";
      if (distanceTo(HOME_RECORD_PLAYER.x, HOME_RECORD_PLAYER.y) < 76) return "record_player";
      if (distanceTo(292, 246) < 95) return "sofa";
      if (distanceTo(558, 205) < 100) return "wardrobe";
      if (distanceTo(384, 438) < 78) return "exit_home";
      return null;
    }
    if (currentScene === "garden") {
      if (distanceTo(384, 215) < 120 || distanceTo(622, 382) < 90) return "crops";
      if (distanceTo(384, 430) < 78) return "exit_garden";
      return null;
    }
    const placed = nearbyPlacedObject();
    if (placed) return `object:${placed.index}`;
    const fixedLantern = WORLD_FIXED_LANTERNS.find(source => distanceTo(source.x, source.y) < 70);
    if (fixedLantern) return `fixed_lantern:${fixedLantern.id}`;
    if (distanceTo(WORLD_MEMORY_CAMERA.x, WORLD_MEMORY_CAMERA.y) < 78) return "memory_camera";
    if (distanceTo(218, 238) < 62) return "home";
    if (distanceTo(612, 246) < 72) return "garden";
    if (distanceTo(WISDOM_SPRING.x, WISDOM_SPRING.y) < 72) return "wisdom_spring";
    return null;
  }

  function updateInteractionPrompt() {
    const target = nearbyInteraction();
    const prompt = $("#interaction-prompt");
    prompt.hidden = !target;
    if (target?.startsWith("object:")) {
      const item = state.placed[Number(target.split(":")[1])];
      prompt.querySelector("span").textContent = item ? objectInteractionLabel(item) : "오브젝트 사용하기";
    } else if (target?.startsWith("fixed_lantern:")) {
      const id = target.split(":")[1];
      prompt.querySelector("span").textContent = state.worldLanterns?.[id] ? "등불 끄기" : "등불 켜기";
    } else if (target) prompt.querySelector("span").textContent = {
      home: "집 안으로", garden: "당근밭으로", wisdom_spring: "지혜의 샘 묻기",
      memory_camera: "사진 찍기",
      sofa: "소파에서 쉬기", wardrobe: "옷장 열기", exit_home: "집 밖으로",
      home_light: state.homeLightOn ? "조명 끄기" : "조명 켜기",
      record_player: state.homeRecordPlaying ? `${homeRecordCatalog[state.homeRecordTrack]?.name || "LP"} 재생 중` : "LP 음악 고르기",
      crops: pendingChallengeCarrots() ? `당근 ${pendingChallengeCarrots()}개 수확` : "당근 돌보기", exit_garden: "숲으로 돌아가기",
    }[target];
  }

  function openWorldDialog(target) {
    const dialog = $("#world-dialog");
    const recordActions = Object.entries(homeRecordCatalog).map(([id, record]) => `<button type="button" data-world-action="record_music" data-record-track="${id}" aria-pressed="${state.homeRecordPlaying && state.homeRecordTrack === id}"><strong>${record.name}</strong></button>`).join("");
    const content = {
      home: { icon: "🏠", title: "우리 집", copy: "문을 열고 나만의 포근한 홈피로 들어가요.", actions: '<button type="button" data-world-action="enter_home">집 안으로 들어가기</button>' },
      garden: { icon: "🥕", title: "당근 밭", copy: `완료한 챌린지로 당근 ${pendingChallengeCarrots()}개가 자랐어요. 밭 안으로 들어가 직접 수확해요.`, actions: '<button type="button" data-world-action="enter_garden">당근밭 들어가기</button><button type="button" data-world-action="team">공동 진행 보기</button>' },
      wisdom_spring: { icon: "💧", title: "지혜의 샘", copy: "간당이가 건강 정보를 근거와 함께 알려줘요.", actions: '<button type="button" data-world-action="wisdom_spring">간당이에게 물어보기</button>' },
      sofa: { icon: "🛋️", title: "포근한 소파", copy: "소파에 앉아 창밖의 숲을 바라보며 쉬어가요.", actions: '<button type="button" data-world-action="rest">소파에서 쉬기</button>' },
      wardrobe: { icon: "👗", title: "나의 옷장", copy: "아바타와 함께 걷는 펫을 꾸밀 수 있어요.", actions: '<button type="button" data-world-action="wardrobe">아바타 꾸미기</button>' },
      record_player: { icon: "💿", title: "숲속 LP 재생기", copy: "집 안에서 듣고 싶은 레코드를 골라 보세요.", actions: `<div class="record-music-list">${recordActions}</div><button class="record-stop" type="button" data-world-action="record_off" ${state.homeRecordPlaying ? "" : "disabled"}>LP 끄기 · 집 음악으로</button>` },
      exit_home: { icon: "🚪", title: "현관문", copy: "작은 숲으로 다시 나갈까요?", actions: '<button type="button" data-world-action="exit_scene">집 밖으로 나가기</button>' },
      crops: { icon: "🥕", title: "챌린지 당근 수확", copy: pendingChallengeCarrots() ? `완료한 챌린지 보상 당근 ${pendingChallengeCarrots()}개를 수확할 수 있어요.` : "오늘 완료한 챌린지 보상은 모두 수확했어요.", actions: `<button type="button" data-world-action="harvest_challenge" ${pendingChallengeCarrots() ? "" : "disabled"}>${pendingChallengeCarrots() ? `당근 ${pendingChallengeCarrots()}개 수확하기` : "수확 완료"}</button><button type="button" data-world-action="water" ${state.gardenWatered ? "disabled" : ""}>${state.gardenWatered ? "오늘 물주기 완료" : "당근에 물주기"}</button>` },
      exit_garden: { icon: "🌲", title: "숲으로 가는 길", copy: "당근 밭을 나가 작은 숲으로 돌아가요.", actions: '<button type="button" data-world-action="exit_scene">숲으로 돌아가기</button>' },
    }[target];
    if (!content) { setStatus("상호작용할 대상 가까이 이동해 주세요."); return; }
    $("#world-dialog-icon").textContent = content.icon;
    $("#world-dialog-title").textContent = content.title;
    $("#world-dialog-copy").textContent = content.copy;
    $("#world-dialog-actions").innerHTML = content.actions;
    dialog.showModal();
  }

  async function interact(target = nearbyInteraction()) {
    if (!target) {
      window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "harvest", duration: window.LpcAvatarEngine?.actionDuration(state.avatar, "harvest") || 1000 } }));
      setStatus(state.avatar.cosmetics?.lpcTool && state.avatar.cosmetics.lpcTool !== "none"
        ? "장착한 도구를 사용했습니다." : "빈손으로 손을 뻗었습니다. 대상 가까이에서 Q를 누르면 상호작용합니다.");
      return;
    }
    if (target.startsWith("object:")) {
      const index = Number(target.split(":")[1]);
      if (seatObjectCodes.has(state.placed[index]?.code)) await sitAtPlacedObject(index);
      else await togglePlacedObject(index);
      return;
    }
    if (target === "record_player") {
      openWorldDialog(target);
      return;
    }
    if (target.startsWith("fixed_lantern:")) {
      await toggleWorldFixedLantern(target.split(":")[1]);
      return;
    }
    if (target === "memory_camera") {
      window.dispatchEvent(new CustomEvent("forest-memory-request"));
      return;
    }
    if (target === "home_light") {
      await toggleHomeLight();
      return;
    }
    if (target === "wisdom_spring") {
      openWisdomSpringChat();
      return;
    }
    const pose = {
      crops: "harvest", home: "door", garden: "door",
      exit_home: "door", exit_garden: "door", wardrobe: "door", sofa: "sit",
    }[target];
    if (pose) window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose, duration: pose === "fishing" ? 1800 : 1100 } }));
    openWorldDialog(target);
  }

  async function selectHomeRecordTrack(trackId = null) {
    if (currentScene !== "home") return;
    state.homeRecordPlaying = Boolean(trackId && homeRecordCatalog[trackId]);
    if (state.homeRecordPlaying) state.homeRecordTrack = trackId;
    window.carrotForestHomeRecordPlaying = state.homeRecordPlaying;
    renderCanvas();
    try {
      await musicEngine?.switchTo(sceneMusicName("home"), { restart: true });
    } catch {
      setStatus("LP 음악을 전환하지 못했지만 다른 기능은 계속 이용할 수 있어요.");
    }
    await persist(state.homeRecordPlaying
      ? `LP 재생기에서 ${homeRecordCatalog[state.homeRecordTrack].name} 음악을 재생합니다.`
      : "LP 재생기를 껐습니다. 집 안 음악으로 돌아갑니다.");
  }

  function switchScene(scene) {
    currentScene = scene;
    state.avatar.sitting = false;
    state.avatar.mounted = false;
    state.fishing = false;
    const positions = { world: [384, 352], home: [384, 410], garden: [384, 410] };
    [state.avatar.x, state.avatar.y] = positions[scene];
    placementCode = null;
    placementDraft = null;
    renderInventory();
    emitPlacementUpdate();
    renderGardenHarvest();
    musicEngine?.switchTo(sceneMusicName(scene)).catch(() => setStatus("장면 음악을 전환하지 못했지만 계속 이용할 수 있어요."));
    canvas.focus();
  }

  function blocked(x, y) {
    if (x < 28 || x > WORLD_WIDTH - 28 || y < 42 || y > WORLD_HEIGHT - 38) return true;
    if (currentScene === "home") {
      if (x < 64 || x > 710 || y < 100 || y > 458) return true;
      return false;
    }
    if (currentScene === "garden") {
      if (x < 105 || x > 675 || y < 105 || y > 458) return true;
      return false;
    }
    if (x > 45 && x < 335 && y > 55 && y < 275) return true;
    if (x > 465 && x < 735 && y > 45 && y < 255) return true;
    if (x > 35 && x < 270 && y > 300 && y < 475) return true;
    return false;
  }

  function placementCellValid(x, y) {
    if (currentScene !== "world") return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 16 || x > WORLD_WIDTH - 16 || y < 16 || y > WORLD_HEIGHT - 16) return false;
    const inHouse = x > 45 && x < 335 && y > 55 && y < 275;
    const inGarden = x > 465 && x < 735 && y > 45 && y < 255;
    const inPond = x >= 64 && x <= 288 && y >= 336 && y <= 464;
    const camera = (typeof window !== "undefined" && window.ForestMemories?.CAMERA) || WORLD_MEMORY_CAMERA;
    // Reserve only the tripod's 40×23px feet plus this 32px placement cell,
    // not the tall decorative silhouette or the surrounding usable lawn.
    const cellRadius = 16;
    const overlapsCameraFoot = x + cellRadius > camera.x - 20 && x - cellRadius < camera.x + 20
      && y + cellRadius > camera.y - 15 && y - cellRadius < camera.y + 8;
    const overlapsFixedLantern = (typeof WORLD_FIXED_LANTERNS !== "undefined" ? WORLD_FIXED_LANTERNS : [])
      .some(source => x + cellRadius > source.x - 18 && x - cellRadius < source.x + 18
        && y + cellRadius > source.y - 20 && y - cellRadius < source.y + 8);
    if (overlapsCameraFoot || overlapsFixedLantern) return false;
    if (waterObjectCodes.has(placementCode)) {
      if (!window.ForestRiverDuck?.isWater(x, y)) return false;
    } else if (inHouse || inGarden || inPond) return false;
    // Traversal collision and decorative pixels do not reserve usable grass cells.
    return !state.placed.some((item) => item.code !== placementCode && Math.hypot(item.x - x, item.y - y) < 28);
  }

  function placementGridCells() {
    const cells = [];
    for (let y = 32; y <= WORLD_HEIGHT - 32; y += 32) {
      for (let x = 32; x <= WORLD_WIDTH - 32; x += 32) cells.push({ x, y, valid: placementCellValid(x, y) });
    }
    return cells;
  }

  function placementEventDetail() {
    return {
      active: Boolean(placementCode) && currentScene === "world",
      code: placementCode,
      draft: placementDraft ? { ...placementDraft } : null,
      cells: placementCode && currentScene === "world" ? placementGridCells() : [],
    };
  }

  function emitPlacementUpdate() {
    window.dispatchEvent(new CustomEvent("forest-placement-updated", { detail: placementEventDetail() }));
    renderCanvas();
  }

  function renderPlacementUI() {
    const active = Boolean(placementCode);
    const positioned = Boolean(placementDraft);
    $("#placement-controls").hidden = !active;
    $("#rotate-placement").disabled = !positioned;
    $("#confirm-placement").disabled = !positioned;
    $("#cancel-placement").hidden = !active;
    if (!active) $("#placement-mode").textContent = "배치할 아이템 없음";
    else if (!positioned) $("#placement-mode").textContent = `${itemCatalog[placementCode].name} · 초록 격자에서 위치를 선택하세요`;
    else $("#placement-mode").textContent = `${itemCatalog[placementCode].name} · 회전 후 V로 확정하세요`;
  }

  function cancelPlacement(message = "오브젝트 배치를 취소했습니다.") {
    placementCode = null;
    placementDraft = null;
    renderInventory();
    emitPlacementUpdate();
    setStatus(message);
  }

  function rotatePlacement() {
    if (!placementDraft) return;
    placementDraft.rotation = ((Number(placementDraft.rotation) || 0) + 90) % 360;
    renderPlacementUI();
    emitPlacementUpdate();
    setStatus(`${itemCatalog[placementDraft.code].name}을 ${placementDraft.rotation}도로 회전했습니다.`);
  }

  async function confirmPlacement() {
    if (!placementCode || !placementDraft) { setStatus("먼저 초록 격자에서 배치 위치를 선택해 주세요."); return; }
    if (!placementCellValid(placementDraft.x, placementDraft.y)) { setStatus("현재 위치에는 오브젝트를 놓을 수 없습니다."); return; }
    const existing = state.placed.findIndex((item) => item.code === placementCode);
    const previousActive = existing >= 0 ? Boolean(state.placed[existing].active) : false;
    if (existing >= 0) state.placed.splice(existing, 1);
    const placed = {
      ...placementDraft,
      rotation: Number(placementDraft.rotation) || 0,
      ...(interactiveObjectTypes[placementCode] ? { active: previousActive } : {}),
    };
    const name = itemCatalog[placementCode].name;
    state.placed.push(placed);
    placementCode = null;
    placementDraft = null;
    renderInventory();
    renderPlaced();
    emitPlacementUpdate();
    playSfx("place-object", { volume: 0.3 });
    await persist(`${name} 배치를 확정했습니다.`);
  }

  function toggleRunning() {
    running = !running;
    // Both the Phaser world and Canvas fallback use this same latched mode.
    window.carrotForestRunning = running;
    document.querySelectorAll('[data-action="run"]').forEach((button) => {
      button.setAttribute("aria-pressed", String(running));
      button.setAttribute("aria-label", `달리기 ${running ? "켜짐" : "꺼짐"}, 단축키 R`);
    });
    setStatus(running ? "달리기 모드가 켜졌습니다. R을 다시 누르면 걷습니다." : "걷기 모드로 돌아왔습니다.");
  }

  async function moveAvatar(direction) {
    if (window.carrotForestPhaserActive && window.carrotForestPhaserMove) {
      window.carrotForestPhaserMove(direction);
      return;
    }
    const step = state.avatar.mounted ? 28 : running ? 22 : 12;
    const delta = { up: [0, -step], down: [0, step], left: [-step, 0], right: [step, 0] }[direction];
    if (!delta) return;
    state.avatar.direction = direction;
    state.avatar.sitting = false;
    state.fishing = false;
    walkingUntil = performance.now() + (state.avatar.mounted ? 260 : 220);
    const nextX = state.avatar.x + delta[0];
    const nextY = state.avatar.y + delta[1];
    if (!blocked(nextX, nextY)) {
      state.avatar.x = nextX; state.avatar.y = nextY;
      playSfx(running ? "run-grass" : "step-grass", { volume: 0.18, minInterval: running ? 170 : 260 });
      renderCanvas(); await persist();
    }
    else { renderCanvas(); setStatus("그쪽에는 집·나무·당근밭이 있어요. 다른 방향으로 움직여 주세요."); }
  }

  function renderQuests() {
    if (window.ForestChallengeV2?.enabled) {
      const plan = window.ForestChallengeV2.plan;
      $("#quests-panel").classList.toggle("has-compact-quests", Boolean(plan?.enrolled));
      const label = `${plan?.completed || 0}/${plan?.items?.length || 0}`;
      $("#personal-progress").textContent = label;
      $("#heading-personal-progress").textContent = label;
      return;
    }
    syncActiveQuests();
    const ready = Boolean(state.challengePlan?.onboarded);
    $("#quests-panel").classList.remove("has-compact-quests");
    $("#start-prediction-flow").textContent = ready ? "챌린지 다시 설정하기" : "로그인하고 챌린지 시작!";
    $("#quest-list").innerHTML = ready
      ? quests.map((quest) => `<label class="quest-item"><input type="checkbox" data-quest="${quest.id}" ${state.quests[quest.id] ? "checked" : ""}><span class="quest-icon" aria-hidden="true">${quest.icon}</span><span class="quest-copy"><em>${quest.category}</em><strong>${quest.title}</strong><small>${quest.description}</small></span><b class="quest-reward">+${quest.reward} 🥕</b></label>`).join("")
      : '<div class="quest-empty"><span aria-hidden="true">🌱</span><strong>첫 챌린지를 준비해 주세요</strong><p>이동 가능 확인부터 챌린지 방식 선택까지 마치면 오늘의 퀘스트 3개가 생성됩니다.</p></div>';
    const completed = personalCompleted();
    const meMember = state.members.find((member) => member.me);
    if (meMember && adapter.mode !== "api") meMember.completed = completed;
    $("#personal-progress").textContent = `${completed}/3`;
    $("#heading-personal-progress").textContent = `${completed} / 3`;
  }

  function renderGroup() {
    const completed = groupCompleted();
    const target = groupTarget();
    $("#group-progress").textContent = `${completed}/${target}`;
    $("#heading-group-progress").textContent = `${completed} / ${target}`;
    const progressbar = $(".progress-track[role='progressbar']");
    progressbar.setAttribute("aria-valuenow", String(completed));
    progressbar.setAttribute("aria-valuemax", String(target));
    $("#group-progress-bar").style.width = `${Math.min(100, completed / target * 100)}%`;
    $("#group-remaining").textContent = completed >= target ? "공동 보상까지 0개 남았어요." : `공동 보상까지 ${target - completed}개 남았어요.`;
    $("#member-list").innerHTML = state.members.map((member) => {
      const profileImage = memberProfileImage(member);
      const avatar = profileImage
        ? `<img class="member-avatar-face" src="${profileImage}" alt="${member.name} 프로필">`
        : `<canvas class="member-avatar-face" width="48" height="48" data-member-face="${member.id}" aria-hidden="true"></canvas>`;
      return `<li>${avatar}<strong>${member.name}</strong><span class="member-progress">${member.completed}/${member.target || SOLO_DAILY_QUEST_TARGET}</span></li>`;
    }).join("");
    drawMemberFaceThumbnails();
    const rewardButton = $("#reward-button");
    const v2Plan = window.ForestChallengeV2?.enabled ? window.ForestChallengeV2.plan : null;
    if (v2Plan) {
      const rewardDay = String(v2Plan.day_id || TODAY);
      const ready = Boolean(v2Plan.chest_issued);
      const opened = state.v2RewardOpenedDay === rewardDay;
      rewardButton.disabled = !ready || opened;
      rewardButton.textContent = opened ? "오늘의 일일 보상 받음" : "일일 보상 받기";
      $("#group-reward-help").textContent = opened ? "오늘의 보상 상자를 열었어요." : ready ? "지금 바로 보상 상자를 열어 보세요." : "오늘의 퀘스트 3개를 완료하면 바로 열 수 있어요.";
      return;
    }
    rewardButton.disabled = completed < target || state.rewardClaimed;
    rewardButton.textContent = state.rewardClaimed ? "오늘의 일일 보상 받음" : "일일 보상 받기";
    $("#group-reward-help").textContent = state.rewardClaimed ? "오늘의 보상 상자를 열었어요." : completed >= target ? "지금 바로 보상 상자를 열어 보세요." : `공동 보상까지 ${target - completed}개 남았어요.`;
    $("#group-goal-memo").value = state.groupGoalMemo || "";
  }

  function memberProfileImage(member) {
    if (member?.me) return null;
    const normalizedName = String(member?.name || "");
    const roleById = { m2: "moon_mage", m3: "inventor", m4: "forest_witch", m5: "knight" };
    const roleByName = [
      ["빛샘", "moon_mage"],
      ["수인", "forest_witch"],
      ["준혁", "inventor"],
      ["세준", "knight"],
    ];
    const role = roleById[member?.id] || roleByName.find(([name]) => normalizedName.includes(name))?.[1];
    if (role) return MEMBER_PROFILE_IMAGES[role];
    const guestIndex = state.members.filter((candidate) => !candidate.me).findIndex((candidate) => candidate.id === member?.id);
    return Object.values(MEMBER_PROFILE_IMAGES)[guestIndex] || null;
  }

  function memberAvatarFor(member) {
    if (member?.me) return state.avatar;
    const role = { m2: "moon_mage", m3: "inventor", m4: "forest_witch", m5: "knight" }[member?.id];
    const look = state.outfitHistory.find((item) => item.presetRole === role);
    return look ? { gender: look.gender, engine: "lpc", cosmetics: look.cosmetics } : state.avatar;
  }

  function drawMemberFaceThumbnails() {
    if (!window.LpcAvatarEngine?.isReady?.()) return;
    document.querySelectorAll("canvas[data-member-face]").forEach((thumbnail) => {
      const member = state.members.find((item) => item.id === thumbnail.dataset.memberFace);
      const target = thumbnail.getContext("2d");
      if (!member || !target) return;
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      window.LpcAvatarEngine.draw(target, memberAvatarFor(member), {
        direction: "down", pose: "idle", frame: 0,
      }, { x: -18, y: -24, width: 84, height: 84 });
    });
  }

  function renderGardenHarvest() {
    const panel = $("#garden-harvest-panel");
    if (!panel) return;
    const pending = pendingChallengeCarrots();
    panel.hidden = currentScene !== "garden";
    $("#pending-harvest-carrots").textContent = String(pending);
    const button = $("#harvest-challenge-carrots");
    button.disabled = pending === 0;
    button.textContent = pending ? `Q · 당근 ${pending}개 수확` : "수확할 당근을 키우는 중";
  }

  async function harvestChallengeCarrots() {
    const pending = pendingChallengeCarrots();
    if (!pending) { setStatus("완료한 챌린지 보상이 생기면 이 밭에서 수확할 수 있어요."); return; }
    Object.values(state.challengeCarrotClaims).forEach((claim) => { if (!claim.harvested) claim.harvested = true; });
    state.carrots += pending;
    const panel = $("#garden-harvest-panel");
    panel?.classList.add("is-harvesting");
    playSfx("harvest", { volume: 0.38 });
    window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "harvest", duration: 1500 } }));
    window.setTimeout(() => panel?.classList.remove("is-harvesting"), 1500);
    renderAll();
    await persist(`챌린지로 자란 당근 ${pending}개를 수확했습니다!`);
  }

  function outfitCardMarkup(look, compact = false) {
    const savedDate = new Date(Number(look.savedAt || Date.now()));
    const timestamp = `${savedDate.getMonth() + 1}/${savedDate.getDate()} ${String(savedDate.getHours()).padStart(2, "0")}:${String(savedDate.getMinutes()).padStart(2, "0")}`;
    const safeId = escapeMarkup(look.id);
    const safeLabel = escapeMarkup(look.label);
    const presetLabel = look.presetNumber ? `프리셋${look.presetNumber}` : look.presetRole === "female" ? "프리셋1" : "프리셋2";
    const nameControl = look.presetRole
      ? `<div class="outfit-name-form fixed-preset-name"><small>${presetLabel}</small></div>`
      : `<form class="outfit-name-form" data-outfit-name-form="${safeId}"><label><span class="sr-only">코디 이름</span><input name="outfit-name" value="${safeLabel}" maxlength="24" aria-label="코디 이름 수정"></label><button type="submit">이름 저장</button></form>`;
    return `<article class="recent-outfit-entry${compact ? " is-compact" : ""}"><button class="recent-outfit-card" type="button" data-outfit-look="${safeId}" aria-label="${safeLabel}, ${timestamp}에 저장한 코디 적용"><canvas width="96" height="96" data-outfit-canvas="${safeId}" aria-hidden="true"></canvas><small>${timestamp}</small></button>${nameControl}</article>`;
  }

  async function renameOutfit(lookId, nextLabel) {
    const look = state.outfitHistory.find((item) => item.id === lookId);
    const label = String(nextLabel || "").trim().slice(0, 24);
    if (!look || !label) { setStatus("코디 이름을 입력해 주세요."); return; }
    if (look.presetRole) { setStatus("기본 프리셋 이름은 변경할 수 없습니다."); return; }
    look.label = label;
    renderInventory();
    if ($("#inventory-dialog").open && $("#inventory-dialog").dataset.view === "wardrobe") renderInventoryDialog("wardrobe");
    await persist(`${label}(으)로 코디 이름을 변경했습니다.`);
  }

  function drawWardrobeLookThumbnails() {
    if (!window.LpcAvatarEngine?.isReady()) return;
    document.querySelectorAll("canvas[data-outfit-canvas]").forEach((thumbnail) => {
      const look = state.outfitHistory.find((item) => item.id === thumbnail.dataset.outfitCanvas);
      if (!look) return;
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      window.LpcAvatarEngine.draw(target, { gender: look.gender, engine: "lpc", cosmetics: look.cosmetics }, {
        direction: "down", pose: "idle", frame: 0,
      }, { x: 5, y: 4, width: 86, height: 88 });
    });
  }

  async function applyOutfitLook(lookId) {
    const look = state.outfitHistory.find((item) => item.id === lookId);
    if (!look) return;
    state.avatar.gender = look.gender;
    state.avatar.engine = "lpc";
    state.avatar.cosmetics = { ...defaultCosmetics, ...look.cosmetics };
    state.avatar.tuning = { ...defaultAvatarTuning, ...look.tuning };
    state.avatar.equipped = null;
    renderInventory();
    renderCanvas();
    window.dispatchEvent(new CustomEvent("forest-avatar-updated", { detail: state.avatar }));
    await persist(`${look.label} 코디를 다시 착용했습니다.`);
  }

  function renderInventoryDialog(view = "storage") {
    document.querySelectorAll("[data-inventory-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.inventoryView === view));
    $("#inventory-dialog-grid").classList.toggle("is-wardrobe", view === "wardrobe");
    if (view === "wardrobe") {
      $("#inventory-dialog-grid").innerHTML = state.outfitHistory.map((look) => outfitCardMarkup(look, true)).join("");
      $("#inventory-dialog").dataset.view = view;
      drawWardrobeLookThumbnails();
      return;
    }
    const kind = view === "wardrobe" ? "accessory" : "object";
    const codes = state.inventory.filter((code) => itemCatalog[code]?.kind === kind);
    $("#inventory-dialog-grid").innerHTML = codes.map((code) => {
      const item = itemCatalog[code];
      const animatedRow = animatedObjectRows[code];
      let visual;
      if (code === "reward_cow") visual = '<canvas class="animal-thumbnail-canvas" width="96" height="96" data-animal="cow" aria-hidden="true"></canvas>';
      else if (animatedRow != null) visual = `<canvas class="animated-object-thumbnail-canvas" width="96" height="96" data-animated-object-row="${animatedRow}" aria-hidden="true"></canvas>`;
      else {
        const storageIndex = storageObjectIndex[code];
        if (storageIndex == null) visual = `<span aria-hidden="true">${item.icon || "📦"}</span>`;
        else {
          visual = `<canvas class="storage-sprite-thumb" width="96" height="96" data-storage-object="${code}" aria-hidden="true"></canvas>`;
        }
      }
      return `<button type="button" data-inventory-dialog-item="${code}" aria-label="${item.name}" title="${item.name}">${visual}${view === "wardrobe" ? `<small>${item.name}</small>` : ""}</button>`;
    }).join("") || "<p>아직 보관 중인 아이템이 없습니다.</p>";
    $("#inventory-dialog").dataset.view = view;
    drawAnimatedObjectThumbnails($("#inventory-dialog-grid"));
    drawStorageObjectThumbnails($("#inventory-dialog-grid"));
    drawAnimalThumbnails($("#inventory-dialog-grid"));
  }

  function drawAnimalThumbnails(root = document) {
    if (!rewardCowImage.complete || !rewardCowImage.naturalWidth || !window.ForestAnimals) return;
    const sample = window.ForestAnimals.cowFrame();
    const frame = window.ForestAnimals.frameRect(sample.key, sample.frame);
    root.querySelectorAll('canvas[data-animal="cow"]').forEach(thumbnail => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      // Source row's complete side-facing body, with safe transparent padding.
      const width = thumbnail.width - 8, height = width * 57 / 88;
      target.drawImage(rewardCowImage, frame.x + 20, frame.y + 39, 88, 57,
        4, (thumbnail.height - height) / 2, width, height);
    });
  }

  function drawStorageObjectThumbnails(root = document) {
    if (!storageSpriteAtlas.complete || !storageSpriteAtlas.naturalWidth) return;
    root.querySelectorAll("canvas[data-storage-object]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = true;
      if (thumbnail.dataset.storageObject === "campfire" && campfireBaseImage.complete && campfireBaseImage.naturalWidth) {
        target.drawImage(window.ForestFire.burningTile(window.ForestObjects.createLegacyStorageAtlas(storageSpriteAtlas), campfireBaseImage), 0, 0, thumbnail.width, thumbnail.height);
      } else window.ForestObjects.drawStorageItem(target, storageSpriteAtlas, thumbnail.dataset.storageObject, 0, 0, thumbnail.width, thumbnail.height);
    });
  }

  function drawAnimatedObjectThumbnails(root = document) {
    const thumbnails = root.querySelectorAll("canvas[data-animated-object-row]");
    const draw = () => thumbnails.forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      const row = Number(thumbnail.dataset.animatedObjectRow);
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = true;
      if (row === animatedObjectRows.duck_float) {
        target.imageSmoothingEnabled = false;
        window.ForestRiverDuckArt.thumbnail(target, riverDuckImage, thumbnail.width, thumbnail.height);
      } else window.ForestObjects.drawAnimatedItem(target, animatedObjectAtlas, window.ForestObjects.ANIMATED_CODES[row], 0, 0, thumbnail.width, thumbnail.height);
    });
    if (animatedObjectAtlas.complete && animatedObjectAtlas.naturalWidth) draw();
    else animatedObjectAtlas.addEventListener("load", draw, { once: true });
  }

  function renderInventory(highlightCode = null) {
    const renderItems = (kind) => state.inventory.filter((code) => itemCatalog[code].kind === kind).map((code) => {
      const item = itemCatalog[code];
      const equipped = item.kind === "accessory" && state.avatar.equipped === code;
      const selected = item.kind === "object" && placementCode === code;
      if (item.kind === "object") {
        const action = selected ? "선택됨, 맵에서 배치 위치 선택" : "배치 선택";
        if (code === "reward_cow") return `<button class="inventory-item storage-icon-item ${highlightCode === code ? "reward-new" : ""}" type="button" data-item="${code}" data-kind="object" data-placement="${selected}" aria-pressed="${selected}" aria-label="${item.name}, 희귀 꾸미기 오브젝트, ${action}" title="${item.name}"><canvas class="animal-thumbnail-canvas" width="96" height="96" data-animal="cow" aria-hidden="true"></canvas></button>`;
        const animatedRow = animatedObjectRows[code];
        if (animatedRow != null) return `<button class="inventory-item storage-icon-item ${highlightCode === code ? "reward-new" : ""}" type="button" data-item="${code}" data-kind="object" data-placement="${selected}" aria-pressed="${selected}" aria-label="${item.name}, 반복해서 움직이는 오브젝트, ${action}" title="${item.name}"><canvas class="animated-object-thumbnail-canvas" width="96" height="96" data-animated-object-row="${animatedRow}" aria-hidden="true"></canvas></button>`;
        return `<button class="inventory-item storage-icon-item ${highlightCode === code ? "reward-new" : ""}" type="button" data-item="${code}" data-kind="object" data-placement="${selected}" aria-pressed="${selected}" aria-label="${item.name}, ${item.animated ? "자연스럽게 움직이는 오브젝트, " : ""}${action}" title="${item.name}"><canvas class="storage-sprite-thumb" width="96" height="96" data-storage-object="${code}" aria-hidden="true"></canvas></button>`;
      }
      return `<button class="inventory-item ${highlightCode === code ? "reward-new" : ""}" type="button" data-item="${code}" data-kind="${item.kind}" data-placement="${selected}" aria-pressed="${equipped || selected}"><span aria-hidden="true">${item.icon}</span><strong>${item.name}</strong><small>${item.kind === "accessory" ? equipped ? "장착 중" : "장착하기" : selected ? "맵을 눌러 배치" : "배치 선택"}</small></button>`;
    }).join("");
    $("#wardrobe-list").innerHTML = state.outfitHistory.map((look) => outfitCardMarkup(look)).join("") || "<p class=\"empty-assets\">최근 저장한 코디가 없습니다.</p>";
    $("#storage-list").innerHTML = renderItems("object") || "<p class=\"empty-assets\">보관 중인 오브젝트가 없습니다.</p>";
    drawWardrobeLookThumbnails();
    drawAnimatedObjectThumbnails($("#storage-list"));
    drawStorageObjectThumbnails($("#storage-list"));
    drawAnimalThumbnails($("#storage-list"));
    renderPlacementUI();
  }

  function renderPlaced() {
    $("#object-count").textContent = `${state.placed.length}개`;
    $("#placed-list").innerHTML = state.placed.length
      ? state.placed.map((item, index) => {
        const stateLabel = item.code === "reward_cow" ? "<small>가끔 풀을 먹어요 · 쓰다듬어 주세요</small>"
          : interactiveObjectTypes[item.code] ? `<small>${item.active ? "작동 중" : "꺼짐·정지"}</small>` : "";
        return `<div class="placed-object-row"><span aria-hidden="true">${itemCatalog[item.code].icon}</span><div class="placed-object-copy"><strong>${itemCatalog[item.code].name}</strong>${stateLabel}</div><button class="remove-object" type="button" data-remove="${index}">창고로 돌려놓기</button></div>`;
      }).join("")
      : "<p>아직 배치한 오브젝트가 없습니다.</p>";
  }

  function selectedAvatarItem(category, id = category === "pose" ? avatarPreviewPose : avatarDraft[category]) {
    const choices = avatarItemsForCategory(category);
    const selectedId = category === "pet" ? window.ForestPets?.canonicalId?.(id) ?? id : id;
    return choices.find((item) => (item.itemId || item.id) === selectedId && (!item.slot || item.slot === category))
      || choices[0] || { id: "none", name: "" };
  }

  const avatarThumbnailIndexes = {
    outfit: { forest: 0, denim: 4, carrot: 8, moon: 2, berry: 5, yellow: 3, violet: 10, black: 6 },
    hair: { soft: 0, wave: 1, crop: 4, twin: 7, silver: 10, orange: 9 },
    face: { calm: 0, smile: 1, sparkle: 5, blush: 7, wink: 3, cool: 10 },
    accessory: { none: null, red_scarf: 0, sprout_hat: 8, carrot_bag: 11, round_glasses: 2, star_glasses: 3 },
  };
  const stylePresetByItem = {
    red_wave: "red_bow", navy_garden: "red_bow", cow_brown: "cow_hood", cow_vest: "cow_hood",
    midnight: "midnight", violet: "midnight", blue_short: "blue_cap", blue_overalls: "blue_cap", teal_bob: "teal_bob", teal_garden: "teal_bob",
  };
  const modularHairRows = { red_bow: 1, cow_hood: 2, midnight: 3, blue_cap: 4, teal_bob: 5 };
  const modularOutfitRows = { red_bow: 6, cow_hood: 7, midnight: 8, blue_cap: 9, teal_bob: 10 };

  function renderCatalogThumbnailCanvases() {
    document.querySelectorAll("canvas[data-lpc-body-type], canvas[data-lpc-skin]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      if (!window.LpcAvatarEngine?.isReady()) return;
      const cosmetics = {
        ...avatarDraft,
        bodyType: thumbnail.dataset.lpcBodyType || avatarDraft.bodyType,
        skin: thumbnail.dataset.lpcSkin || avatarDraft.skin,
        lpcHair: "none", lpcHat: "none", lpcGlasses: "none",
        aura: "none", effect: "none", vehicle: "none", pet: "none", speech: "none",
      };
      const previewGender = cosmetics.bodyType === "female" ? "female" : "male";
      cosmetics.lpcHead = previewGender === "female" ? "human_female" : "human_male";
      window.LpcAvatarEngine.draw(target, { gender: previewGender, engine: "lpc", cosmetics }, {
        direction: "down", pose: "idle", frame: 0,
      }, { x: 3, y: 2, width: 90, height: 90 });
    });
    document.querySelectorAll("canvas[data-lpc-category]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      if (!window.LpcAvatarEngine?.isReady()) return;
      const category = thumbnail.dataset.lpcCategory;
      const id = thumbnail.dataset.lpcItem;
      let cosmetics = category === "lpcMobility"
        ? { ...avatarDraft, vehicle: id }
        : { ...avatarDraft, [category]: id };
      if (category === "lpcOutfit") Object.assign(cosmetics, {
        outfitColor: "blue", lpcHead: "none", lpcExpression: "none", lpcNose: "none",
        lpcEyebrow: "none", lpcEyes: "none", lpcWrinkles: "none", lpcHair: "none",
        lpcGlasses: "none", lpcHat: "none", lpcBottom: avatarDraft.lpcBottom || "short_short", bottomColor: avatarDraft.bottomColor || "black", lpcShoes: "none",
      });
      if (category === "lpcShoes") cosmetics = footwearPreviewCosmetics(cosmetics);
      if (category === "lpcTool") cosmetics.lpcWeapon = "none";
      if (category === "lpcWeapon") cosmetics.lpcTool = "none";
      const pose = category === "lpcTool" ? "harvest" : category === "lpcWeapon" ? "attack" : ["lpcExpression", "lpcShoes", "lpcOutfit"].includes(category) ? "idle" : avatarPreviewPose;
      const faceCategory = ["lpcHead", "lpcExpression", "lpcEyes", "lpcEyebrow", "lpcNose", "lpcWrinkles"].includes(category);
      window.LpcAvatarEngine.draw(target, { gender: state.avatar.gender, engine: "lpc", cosmetics, mounted: category === "lpcMobility" }, {
        direction: "down", pose, frame: avatarPreviewFrame, previewMobility: category === "lpcMobility",
      }, category === "lpcShoes" ? footwearPreviewBounds : category === "lpcOutfit"
        ? { x: -18, y: -22, width: 132, height: 132 }
        : faceCategory
        ? { x: -7, y: -10, width: 110, height: 110 }
        : { x: 3, y: 3, width: 90, height: 90 });
    });
    document.querySelectorAll("canvas[data-lpc-color-category]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      if (!window.LpcAvatarEngine?.isReady()) return;
      const category = thumbnail.dataset.lpcColorCategory;
      let cosmetics = { ...avatarDraft, [category]: thumbnail.dataset.lpcColorValue };
      if (category === "shoeColor") cosmetics = footwearPreviewCosmetics(cosmetics);
      const headOnly = category === "hairColor";
      const mobilityPreview = category === "mobilityColor";
      window.LpcAvatarEngine.draw(target, { gender: state.avatar.gender, engine: "lpc", cosmetics, mounted: mobilityPreview }, {
        direction: "down", pose: "idle", frame: 0, previewMobility: mobilityPreview,
      }, category === "shoeColor" ? footwearPreviewBounds : headOnly
        ? { x: -7, y: -10, width: 110, height: 110 }
        : { x: 3, y: 3, width: 90, height: 90 });
    });
    document.querySelectorAll("canvas[data-lpc-pose]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      if (!window.LpcAvatarEngine?.isReady()) return;
      window.LpcAvatarEngine.draw(target, {
        ...state.avatar, engine: "lpc", cosmetics: avatarDraft,
      }, { direction: "down", pose: thumbnail.dataset.lpcPose, frame: 1 }, {
        x: 3, y: 3, width: 90, height: 90,
      });
    });
    document.querySelectorAll("canvas[data-speech-thumb]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      const speech = thumbnail.dataset.speechThumb;
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = false;
      target.lineWidth = 3;
      target.strokeStyle = "#38445a";
      target.fillStyle = "#ffffff";
      if (speech === "none") {
        target.setLineDash([5, 4]);
        target.strokeRect(18, 25, 60, 44);
        target.setLineDash([]);
        target.beginPath(); target.moveTo(25, 72); target.lineTo(71, 22); target.stroke();
        return;
      }
      if (speech === "leaf") {
        target.fillStyle = "#47ad68";
        [[42, 34], [54, 34], [42, 46], [54, 46]].forEach(([x, y]) => {
          target.beginPath(); target.arc(x, y, 12, 0, Math.PI * 2); target.fill();
        });
        target.strokeStyle = "#287c48"; target.beginPath(); target.moveTo(49, 48); target.lineTo(59, 70); target.stroke();
        return;
      }
      if (speech === "window") {
        target.fillStyle = "#dff3ff"; target.fillRect(16, 18, 64, 58); target.strokeRect(16, 18, 64, 58);
        target.beginPath(); target.moveTo(48, 18); target.lineTo(48, 76); target.moveTo(16, 47); target.lineTo(80, 47); target.stroke();
        target.fillStyle = "#87ccef"; target.fillRect(21, 23, 22, 19); target.fillRect(53, 23, 22, 19);
        return;
      }
      target.beginPath(); target.roundRect(12, 18, 72, 54, 14); target.fill(); target.stroke();
      target.beginPath(); target.moveTo(31, 70); target.lineTo(24, 84); target.lineTo(46, 71); target.fill(); target.stroke();
      target.fillStyle = "#f39aaa"; target.beginPath(); target.moveTo(34, 43); target.arc(29, 43, 5, 0, Math.PI * 2); target.moveTo(72, 43); target.arc(67, 43, 5, 0, Math.PI * 2); target.fill();
      target.strokeStyle = "#38445a"; target.beginPath(); target.arc(48, 48, 12, 0.15, Math.PI - 0.15); target.stroke();
    });
    document.querySelectorAll("canvas[data-empty-preview]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.strokeStyle = "#9ca5b5";
      target.lineWidth = 4;
      target.setLineDash([7, 5]);
      target.beginPath(); target.arc(48, 48, 28, 0, Math.PI * 2); target.stroke();
      target.setLineDash([]);
      target.beginPath(); target.moveTo(27, 69); target.lineTo(69, 27); target.stroke();
    });
    document.querySelectorAll("canvas[data-preset-thumb]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = true;
      const preset = thumbnail.dataset.presetThumb;
      if (preset === "custom") {
        target.font = "42px sans-serif";
        target.textAlign = "center";
        target.fillText("🧩", 48, 64);
        return;
      }
      if (preset === "sprout") {
        drawAtlasCell(target, basicWalkAtlas, 0, 4, 4, 11, 5, 74, 88);
        return;
      }
      if (modularAvatarAtlas.complete && modularAvatarAtlas.naturalWidth && window.CarrotAvatarCompositor) {
        const crop = thumbnail.dataset.presetCrop;
        if (crop) {
          const row = crop === "head" ? modularHairRows[preset] : modularOutfitRows[preset];
          target.drawImage(modularAvatarAtlas, 0, row * 288, 224, 288, 10, 1, 76, 98);
        } else {
          window.CarrotAvatarCompositor.drawFrame(target, { modular: { image: modularAvatarAtlas, rows: 11 } }, {
            preset, hairPreset: preset, outfitPreset: preset, direction: "down",
            mounted: false, moving: false, frame: 0, accessory: "none", hat: "none", glasses: "none",
          }, { x: 10, y: 1, width: 76, height: 98 });
        }
        return;
      }
      const atlas = presetSpriteAtlases[preset];
      if (atlas) {
        const crop = thumbnail.dataset.presetCrop;
        if (crop === "head") target.drawImage(atlas.image, 0, 0, 224, 166, 9, 4, 78, 91);
        else if (crop === "body") target.drawImage(atlas.image, 0, 136, 224, 152, 9, 5, 78, 88);
        else drawAtlasCell(target, atlas.image, 0, 4, atlas.rows, 9, 5, 78, 88);
      }
    });
    document.querySelectorAll("canvas[data-avatar-thumb]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = true;
      if (!avatarSpriteAtlas.complete || !avatarSpriteAtlas.naturalWidth) return;
      const index = Number(thumbnail.dataset.avatarThumb);
      const cellWidth = avatarSpriteAtlas.naturalWidth / 4;
      const cellHeight = avatarSpriteAtlas.naturalHeight / 3;
      const column = index % 4;
      const row = Math.floor(index / 4);
      const headOnly = thumbnail.dataset.avatarCrop === "head";
      const sx = column * cellWidth + cellWidth * (headOnly ? .2 : .08);
      const sy = row * cellHeight + cellHeight * (headOnly ? .01 : .035);
      const sw = cellWidth * (headOnly ? .6 : .84);
      const sh = cellHeight * (headOnly ? .56 : .92);
      const dx = headOnly ? 11 : 8;
      const dy = headOnly ? 8 : 5;
      const dw = headOnly ? 74 : 80;
      const dh = headOnly ? 78 : 88;
      target.drawImage(avatarSpriteAtlas, sx, sy, sw, sh, dx, dy, dw, dh);
    });
    document.querySelectorAll("canvas[data-cosmetic-thumb]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = true;
      drawAtlasCell(target, cosmeticSpriteAtlas, Number(thumbnail.dataset.cosmeticThumb), 5, 4, 8, 8, 80, 80);
    });
    document.querySelectorAll("canvas[data-cat-thumb]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      target.imageSmoothingEnabled = true;
      drawAtlasCell(target, catPetAtlas, Number(thumbnail.dataset.catThumb), 9, 4, 7, 7, 82, 82);
    });
    document.querySelectorAll("canvas[data-pet-thumb]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      drawPetFrame(target, thumbnail.dataset.petThumb, { action: "sit", direction: "down", elapsed: 0, reducedMotion: true }, 48, 84, 88);
    });
    document.querySelectorAll("canvas[data-pet-equipment-thumb]").forEach((thumbnail) => {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, thumbnail.width, thumbnail.height);
      const selectedPet = window.ForestPets?.definition?.(avatarDraft.pet)?.legacy ? "last_tick_white" : avatarDraft.pet;
      drawPetFrame(target, selectedPet === "none" ? "last_tick_white" : selectedPet, {
        action: "sit", direction: "down", elapsed: 0, reducedMotion: true,
        equipment: thumbnail.dataset.petEquipmentThumb,
      }, 48, 84, 88);
    });
  }

  function drawLayeredAvatarPreview(target, cosmetics) {
    const rect = (x, y, width, height, color) => {
      target.fillStyle = color;
      target.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    };
    const skin = avatarCatalog.skin.find((item) => item.id === cosmetics.skin)?.color || "#f2bd92";
    const skinShadow = cosmetics.skin === "deep" ? "#6d392f" : cosmetics.skin === "warm" ? "#a7654f" : "#d99978";
    const hairColor = { soft: "#4b2f24", wave: "#3b2b34", crop: "#263b43", twin: "#54313e", silver: "#8992a4", orange: "#bd6236" }[cosmetics.hair] || "#4b2f24";
    const outfit = {
      forest: ["#255c3d", "#f5e4bd"], denim: ["#35688f", "#c8e3f8"], carrot: ["#d65d25", "#ffe078"],
      moon: ["#424b7d", "#d9e3ff"], berry: ["#9e3d68", "#ffd2df"], yellow: ["#d9a51f", "#fff1a8"],
      violet: ["#60439e", "#d8c8ff"], black: ["#252a36", "#9da6bc"],
    }[cosmetics.outfit] || ["#255c3d", "#f5e4bd"];
    target.fillStyle = "rgba(36,48,45,.13)";
    target.beginPath(); target.ellipse(140, 252, 57, 13, 0, 0, Math.PI * 2); target.fill();
    rect(103, 107, 74, 69, "#2c241f");
    rect(108, 112, 64, 61, skinShadow); rect(112, 114, 56, 57, skin);
    if (cosmetics.hair === "crop") {
      rect(104, 97, 72, 25, hairColor); rect(106, 113, 12, 27, hairColor);
    } else if (cosmetics.hair === "twin") {
      rect(103, 94, 74, 27, hairColor); rect(91, 113, 18, 50, hairColor); rect(171, 113, 18, 50, hairColor);
    } else if (cosmetics.hair === "wave") {
      rect(101, 94, 78, 28, hairColor); rect(98, 111, 17, 72, hairColor); rect(165, 111, 17, 72, hairColor);
    } else {
      rect(102, 95, 76, 28, hairColor); rect(102, 112, 15, 38, hairColor); rect(165, 112, 15, 38, hairColor);
    }
    rect(112, 101, 26, 7, "rgba(255,255,255,.16)");
    rect(121, 138, 10, 10, "#fff"); rect(149, 138, 10, 10, "#fff");
    rect(124, 140, 5, 7, "#27352f"); rect(152, 140, 5, 7, "#27352f");
    if (cosmetics.face === "wink") rect(148, 143, 13, 3, "#27352f");
    if (["blush", "sparkle"].includes(cosmetics.face)) { rect(114, 153, 11, 5, "#ef8b98"); rect(155, 153, 11, 5, "#ef8b98"); }
    rect(cosmetics.face === "smile" ? 130 : 134, 157, cosmetics.face === "smile" ? 20 : 12, 4, cosmetics.face === "cool" ? "#635763" : "#b76067");
    rect(105, 174, 70, 55, "#173c2e"); rect(109, 178, 62, 47, outfit[0]);
    rect(119, 178, 42, 47, outfit[1]); rect(125, 178, 5, 47, outfit[0]); rect(151, 178, 5, 47, outfit[0]);
    rect(90, 179, 19, 44, outfit[0]); rect(171, 179, 19, 44, outfit[0]);
    rect(94, 217, 15, 13, skin); rect(171, 217, 15, 13, skin);
    rect(112, 225, 25, 27, "#594330"); rect(143, 225, 25, 27, "#594330");
    rect(108, 246, 31, 10, "#31271f"); rect(141, 246, 31, 10, "#31271f");
    if (cosmetics.accessory === "red_scarf") rect(105, 170, 70, 12, "#d93432");
    if (cosmetics.accessory === "sprout_hat") {
      rect(97, 91, 86, 14, "#347f3d"); rect(135, 71, 10, 22, "#216a34"); rect(143, 72, 20, 11, "#65b85d");
    }
    if (cosmetics.accessory === "carrot_bag") { rect(173, 187, 22, 37, "#b94f25"); rect(177, 191, 15, 29, "#ee7d32"); }
    if (["round_glasses", "star_glasses"].includes(cosmetics.accessory)) {
      target.strokeStyle = cosmetics.accessory === "star_glasses" ? "#e75e99" : "#354751"; target.lineWidth = 4;
      target.strokeRect(115, 134, 21, 18); target.strokeRect(144, 134, 21, 18); rect(136, 140, 8, 4, target.strokeStyle);
    }
  }

  function renderAvatarPreview() {
    const preview = $("#avatar-preview-canvas");
    const previewContext = preview.getContext("2d");
    previewContext.setTransform(1, 0, 0, 1, 0, 0);
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.imageSmoothingEnabled = false;
    if (window.LpcAvatarEngine?.isReady()) {
      window.LpcAvatarEngine.draw(previewContext, {
        ...state.avatar, engine: "lpc", cosmetics: avatarDraft, sitting: false, mounted: false,
      }, { direction: "down", pose: avatarPreviewPose, frame: avatarPreviewFrame, previewMobility: true }, { x: 90, y: 82, width: 380, height: 380 });
    }
    // Pet preview remains separate; all retired avatar and speech overlays
    // are intentionally excluded from the official LPC studio.
    previewContext.setTransform(2, 0, 0, 2, 0, 0);
    drawPetFrame(previewContext, avatarDraft.pet, {
      action: avatarPreviewPose === "sit" ? "sit" : ["walk", "run"].includes(avatarPreviewPose) ? "walk" : "idle",
      direction: "down", elapsed: avatarPreviewFrame * 150,
      equipment: avatarDraft.petAccessory,
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    }, 228, 275, 100);
  }

  function drawPreviewAccessoryOverlay(target, accessory) {
    if (accessory === "none") return;
    const rect = (x, y, width, height, color) => {
      target.fillStyle = color;
      target.fillRect(x, y, width, height);
    };
    if (accessory === "red_scarf") rect(108, 160, 64, 12, "#d93432");
    if (accessory === "sprout_hat") {
      rect(100, 83, 80, 13, "#347f3d"); rect(134, 63, 11, 22, "#216a34"); rect(143, 64, 20, 10, "#65b85d");
    }
    if (accessory === "carrot_bag") { rect(174, 177, 24, 40, "#b94f25"); rect(179, 182, 14, 29, "#ee7d32"); }
    if (["round_glasses", "star_glasses"].includes(accessory)) {
      const color = accessory === "star_glasses" ? "#e75e99" : "#354751";
      target.strokeStyle = color; target.lineWidth = 4;
      target.strokeRect(112, 119, 24, 19); target.strokeRect(144, 119, 24, 19); rect(136, 126, 8, 4, color);
    }
  }

  function renderAvatarStudio() {
    $("#avatar-category-nav").innerHTML = avatarCategories.map((category) => `<button class="avatar-category-button" type="button" data-avatar-category="${category.id}" aria-pressed="${activeAvatarCategory === category.id}">${category.icon ? `<span aria-hidden="true">${category.icon}</span>` : ""}${category.label}</button>`).join("");
    const effectiveCategory = activeAvatarCategory;
    const category = avatarCategories.find((entry) => entry.id === activeAvatarCategory);
    const items = avatarItemsForCategory(effectiveCategory);
    $("#avatar-category-title").textContent = category.label;
    $("#avatar-item-count").textContent = `${items.length}개`;
    let previousGroup = null;
    $("#avatar-item-grid").innerHTML = items.map((item) => {
      const itemSlot = item.slot || effectiveCategory;
      const itemId = item.itemId || item.id;
      const cosmeticIndex = cosmeticSpriteIndex(itemSlot, itemId);
      const catIndex = itemSlot === "pet" ? catPetSpriteIndex(itemId) : null;
      let visual;
      if (effectiveCategory === "bodyType") {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-lpc-body-type="${item.id}" aria-hidden="true"></canvas>`;
      } else if (effectiveCategory === "skin") {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-lpc-skin="${item.id}" aria-hidden="true"></canvas>`;
      } else if (Object.hasOwn(lpcCatalogMap, itemSlot)) {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-lpc-category="${itemSlot}" data-lpc-item="${itemId}" aria-hidden="true"></canvas>`;
      } else if (["hairColor", "outfitColor", "bottomColor", "shoeColor", "mobilityColor"].includes(itemSlot) && item.color) {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-lpc-color-category="${itemSlot}" data-lpc-color-value="${itemId}" aria-hidden="true"></canvas>`;
      } else if (effectiveCategory === "accessory") {
        const itemPreset = stylePresetByItem[item.id];
        const index = avatarThumbnailIndexes[effectiveCategory][item.id];
        visual = itemPreset
          ? `<canvas class="item-visual catalog-thumb" width="96" height="96" data-preset-thumb="${itemPreset}" aria-hidden="true"></canvas>`
          : index == null
            ? '<span class="item-visual empty-sprite-thumb" aria-hidden="true">없음</span>'
            : `<canvas class="item-visual catalog-thumb" width="96" height="96" data-avatar-thumb="${index}" data-avatar-crop="${["hair", "face", "accessory"].includes(activeAvatarCategory) ? "head" : "body"}" aria-hidden="true"></canvas>`;
      } else if (effectiveCategory === "speech") {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-speech-thumb="${item.id}" aria-hidden="true"></canvas>`;
      } else if (effectiveCategory === "pose") {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-lpc-pose="${item.id}" aria-hidden="true"></canvas>`;
      } else if (itemSlot === "pet" && itemId === "none") {
        visual = '<canvas class="item-visual catalog-thumb" width="96" height="96" data-empty-preview="true" aria-hidden="true"></canvas>';
      } else if (itemSlot === "petAccessory") {
        visual = itemId === "none"
          ? '<canvas class="item-visual catalog-thumb" width="96" height="96" data-empty-preview="true" aria-hidden="true"></canvas>'
          : `<canvas class="item-visual catalog-thumb" width="96" height="96" data-pet-equipment-thumb="${itemId}" aria-hidden="true"></canvas>`;
      } else if (effectiveCategory === "vehicle" && item.id === "none") {
        visual = '<canvas class="item-visual catalog-thumb" width="96" height="96" data-lpc-pose="walk" aria-hidden="true"></canvas>';
      } else if (effectiveCategory === "vehicle") {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-lpc-category="lpcMobility" data-lpc-item="${itemId}" aria-hidden="true"></canvas>`;
      } else if (itemSlot === "pet") {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-pet-thumb="${itemId}" aria-hidden="true"></canvas>`;
      } else if (catIndex != null) {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-cat-thumb="${catIndex}" aria-hidden="true"></canvas>`;
      } else if (cosmeticIndex != null) {
        visual = `<canvas class="item-visual catalog-thumb" width="96" height="96" data-cosmetic-thumb="${cosmeticIndex}" aria-hidden="true"></canvas>`;
      } else {
        visual = `<span class="item-visual" aria-hidden="true">${item.visual || "—"}</span>`;
      }
      const selectedId = itemSlot === "pet" ? window.ForestPets?.canonicalId?.(avatarDraft.pet) ?? avatarDraft.pet : avatarDraft[itemSlot];
      const selected = (effectiveCategory === "pose" ? avatarPreviewPose : selectedId) === itemId;
      const shortcuts = { idle: "대기", walk: "WASD", run: "R", sit: "X", attack: "Z", dance: "0", harvest: "Q", fishing: "Q", door: "Q" };
      const actionViewOnly = effectiveCategory === "pose";
      const groupHeading = item.group && item.group !== previousGroup
        ? `<h4 class="avatar-item-group-title">${item.group}</h4>`
        : "";
      previousGroup = item.group || previousGroup;
      return `${groupHeading}<button class="avatar-item-card${actionViewOnly ? " action-view-only" : ""}" type="button" ${actionViewOnly ? "disabled" : `data-avatar-item="${item.id}"`} aria-label="${item.name}${selected ? ", 현재 선택" : ", 보유"}" aria-pressed="${selected}">${item.isNew ? '<span class="new-badge">N</span>' : ""}${visual}${actionViewOnly ? `<span class="shortcut-badge">${shortcuts[item.id] || "자동"}</span>` : ""}${selected ? '<span class="selected-check" aria-hidden="true">✓</span>' : ""}</button>`;
    }).join("");
    $("#preview-carrot-balance").textContent = state.carrots;
    $("#avatar-preview-name").textContent = state.avatar.name;
    $("#avatar-undo").disabled = avatarDraftHistory.length === 0;
    renderCatalogThumbnailCanvases();
    renderAvatarPreview();
    window.dispatchEvent(new CustomEvent("forest-avatar-draft", { detail: avatarDraft }));
  }

  function openAvatarStudio() {
    avatarDraft = { ...defaultCosmetics, ...(state.avatar.cosmetics || {}) };
    avatarTuningDraft = { ...defaultAvatarTuning, ...(state.avatar.tuning || {}) };
    avatarDraftHistory = [];
    activeAvatarCategory = "bodyType";
    avatarPreviewPose = "idle";
    renderAvatarStudio();
    $("#avatar-studio").showModal();
    musicEngine?.switchTo("avatar", { restart: true }).catch(() => setStatus("아바타 음악을 재생하지 못했지만 꾸미기는 계속할 수 있어요."));
  }

  function updateProfileUI() {
    if (!state?.avatar) return;
    $("#topbar-nickname").textContent = state.avatar.name;
  }

  function applyAccountNickname(name) {
    const nextName = name || adapter.guestName;
    if (!nextName || nextName === state.avatar.name) return;
    state.avatar.name = nextName;
    updateProfileUI();
    renderCanvas();
    window.dispatchEvent(new CustomEvent("forest-avatar-updated", { detail: state.avatar }));
  }

  let challengeFlowStep = 1;
  function showChallengeFlowStep(step) {
    challengeFlowStep = Math.max(1, Math.min(4, step));
    document.querySelectorAll("[data-flow-step]").forEach((section) => {
      const active = Number(section.dataset.flowStep) === challengeFlowStep;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
      section.querySelectorAll("input, select, textarea").forEach((control) => { control.disabled = !active; });
    });
    document.querySelectorAll("[data-flow-indicator]").forEach((indicator) => {
      const number = Number(indicator.dataset.flowIndicator);
      indicator.classList.toggle("is-active", number === challengeFlowStep);
      indicator.classList.toggle("is-complete", number < challengeFlowStep);
    });
    $("#challenge-flow-back").hidden = challengeFlowStep === 1;
    $("#challenge-flow-next").hidden = challengeFlowStep === 4;
    $("#challenge-flow-generate").hidden = challengeFlowStep !== 4;
    $("#challenge-flow-error").hidden = true;
  }

  function openChallengeFlow() {
    const form = $("#challenge-flow-form");
    form.reset();
    const editing = Boolean(state.challengePlan?.onboarded);
    const style = ["exercise", "diet", "custom"].includes(state.challengePlan?.style)
      ? state.challengePlan.style : "custom";
    const selectedIds = editing ? activeQuestIds() : [];
    form.querySelectorAll('input[name="challenge-style"]').forEach((input) => {
      input.checked = editing && input.value === style;
    });
    $("#custom-quest-picker").querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = selectedIds.includes(input.value);
    });
    $("#challenge-flow-title").textContent = editing ? "오늘의 챌린지 다시 설정" : "오늘의 챌린지 만들기";
    $("#challenge-flow-generate").textContent = editing ? "선택한 챌린지로 변경" : "3개 퀘스트 만들기";
    $("#custom-quest-picker").hidden = !editing || style !== "custom";
    showChallengeFlowStep(editing ? 4 : 1);
    $("#challenge-flow-dialog").showModal();
  }

  function startPredictionFlow() {
    if (typeof adapter !== "undefined" && adapter.mode !== "api") {
      window.location.assign("/?auth=login&returnTo=forest");
      return;
    }
    openChallengeFlow();
  }

  function validateChallengeFlowStep() {
    const section = document.querySelector(`[data-flow-step="${challengeFlowStep}"]`);
    const control = section?.querySelector("input:required, select:required");
    if (control && !control.checkValidity()) { control.reportValidity(); return false; }
    return true;
  }

  async function generateChallengeQuests(style, customIds = []) {
    const status = $("#quest-generation-status");
    status.hidden = false;
    $("#quest-list").innerHTML = '<div class="quest-loading" aria-hidden="true"><i></i><i></i><i></i></div>';
    activateInspectorPanel("quests-panel");
    await animationDelay(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 1050);
    const questIds = style === "custom" ? customIds : (questPlans[style] || questPlans.balanced);
    state.challengePlan = { onboarded: true, style, questIds: questIds.slice(0, 3), lastGeneratedAt: new Date().toISOString() };
    for (const id of questIds) if (!(id in state.quests)) state.quests[id] = false;
    syncActiveQuests();
    status.hidden = true;
    renderQuests();
    renderGroup();
    await persist("오늘까지의 기록과 선택한 방식으로 퀘스트 3개를 만들었습니다.");
  }

  function ragGuideFor(question) {
    const normalized = question.toLowerCase();
    if (/식사|채소|음식|식단/.test(normalized)) return {
      answer: "완벽한 식단을 요구하기보다 오늘 먹은 시간과 구성을 먼저 기록해 보세요. 기록은 다음 챌린지를 조정하는 자료로 사용됩니다.",
      source: "CDC PreventT2 생활습관 변화 교육과정", url: "https://www.cdc.gov/diabetes-prevention/php/lifestyle-change-resources/t2-curriculum.html",
    };
    if (/수면|잠|피곤/.test(normalized)) return {
      answer: "취침·기상 시각과 다음 날의 컨디션을 함께 기록하면 생활 리듬을 돌아보는 데 도움이 됩니다.",
      source: "WHO 신체활동 및 좌식행동 지침", url: "https://www.who.int/publications/i/item/9789240015128",
    };
    return {
      answer: "몸 상태에 맞는 작은 활동부터 시작하고, 수행 여부를 꾸준히 기록해 보세요. 통증이나 불편이 있으면 중단하고 의료진의 안내를 우선하세요.",
      source: "WHO 신체활동 및 좌식행동 지침", url: "https://www.who.int/publications/i/item/9789240015128",
    };
  }

  function renderAll() {
    $("#adapter-badge").textContent = adapter.mode === "demo" ? "숲 체험" : "계정 연결";
    $("#carrot-balance").textContent = state.carrots;
    syncActiveQuests(); renderQuests(); renderGroup(); renderInventory(); renderPlaced(); renderCanvas(); renderGardenHarvest(); updateProfileUI();
  }

  function deterministicReward() {
    const seed = [...TODAY].reduce((total, character) => total + character.charCodeAt(0), state.inventory.length);
    const candidates = rewardPool.filter((code) => !state.inventory.includes(code));
    return candidates.length ? candidates[seed % candidates.length] : null;
  }

  function activateInspectorPanel(panelId, shouldScroll = false) {
    document.querySelectorAll("[data-inspector-tab]").forEach((item) => {
      const active = item.dataset.inspectorTab === panelId;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });
    for (const id of ["quests-panel", "team-inspector"]) {
      const panel = document.getElementById(id);
      panel.hidden = id !== panelId;
    }
    const activePanel = document.getElementById(panelId);
    if (shouldScroll) activePanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    activePanel?.focus({ preventScroll: true });
  }

  const animationDelay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  async function playRewardCelebration(reward) {
    const item = reward ? itemCatalog[reward] : null;
    const destinationId = item?.kind === "accessory" ? "wardrobe-list" : "storage-list";
    const destinationLabel = item?.kind === "accessory" ? "옷장" : "창고";
    const overlay = $("#reward-celebration");
    $("#reward-reveal-icon").textContent = item?.icon || "🥕";
    $("#reward-reveal-name").textContent = item?.name || "당근 50개";
    $("#reward-reveal-destination").textContent = item ? `${destinationLabel}에 새 아이템이 생성됩니다` : "보유 당근에 추가됩니다";
    overlay.hidden = false;
    $("#reward-skip").focus();

    const activeBackgroundTrack = musicEngine?.enabled ? musicEngine.tracks[musicEngine.current] : null;
    if (activeBackgroundTrack) musicEngine.applyVolume(.34);
    rewardChestSound.pause();
    rewardChestSound.currentTime = 0;
    rewardChestSound.play().catch(() => setStatus("보물상자 효과음을 재생하지 못했지만 보상은 정상 지급됩니다."));

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    await Promise.race([
      animationDelay(reducedMotion ? 250 : 1900),
      new Promise((resolve) => { rewardSkipResolve = resolve; }),
    ]);
    rewardSkipResolve = null;
    rewardChestSound.pause();
    rewardChestSound.currentTime = 0;
    if (activeBackgroundTrack) musicEngine.applyVolume();
    overlay.hidden = true;
    if (!item) return;

    const destination = document.getElementById(destinationId);
    const group = destination.closest(".asset-group");
    group.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    await animationDelay(reducedMotion ? 50 : 450);

    const bounds = group.getBoundingClientRect();
    const startX = window.innerWidth / 2;
    const startY = Math.max(80, window.innerHeight * .2);
    const endX = bounds.left + bounds.width / 2;
    const endY = bounds.top + Math.min(bounds.height / 2, 90);
    const flight = document.createElement("div");
    flight.className = "reward-flight";
    flight.setAttribute("aria-hidden", "true");
    flight.textContent = item.icon;
    flight.style.setProperty("--reward-x", `${endX - startX}px`);
    flight.style.setProperty("--reward-y", `${endY - startY}px`);
    document.body.append(flight);
    window.requestAnimationFrame(() => flight.classList.add("is-flying"));
    await animationDelay(reducedMotion ? 80 : 850);
    renderInventory(reward);
    group.classList.add("reward-arrival");
    group.querySelector(`[data-item="${reward}"]`)?.focus({ preventScroll: true });
    window.setTimeout(() => group.classList.remove("reward-arrival"), 1200);
    window.setTimeout(() => flight.remove(), 250);
  }

  $("#quest-list").addEventListener("change", async (event) => {
    if (window.ForestChallengeV2?.enabled) return;
    const checkbox = event.target.closest("[data-quest]");
    if (!checkbox) return;
    const wasChecked = Boolean(state.quests[checkbox.dataset.quest]);
    state.quests[checkbox.dataset.quest] = checkbox.checked;
    const grown = checkbox.checked && !wasChecked ? accrueChallengeCarrots(checkbox.dataset.quest) : 0;
    renderQuests(); renderGroup();
    renderGardenHarvest();
    await persist(grown
      ? `${quests.find((quest) => quest.id === checkbox.dataset.quest).title} 완료! 당근밭에 당근 ${grown}개가 자랐습니다.`
      : `${quests.find((quest) => quest.id === checkbox.dataset.quest).title} 퀘스트를 ${checkbox.checked ? "완료" : "미완료"}로 기록했습니다.`);
  });

  $("#start-prediction-flow").addEventListener("click", startPredictionFlow);
  window.addEventListener("challenge-v2-updated", (event) => {
    const completed = Math.max(0, Math.min(3, Number(event.detail?.completed) || 0));
    const me = state.members.find((member) => member.me);
    if (me) me.completed = completed;
    renderQuests(); renderGroup();
    adapter.save(state);
  });
  window.addEventListener("forest-water-cup-progress", (event) => {
    const { checked = 0, total = 0, complete = false } = event.detail || {};
    playSfx("water", { volume: 0.22, minInterval: 180 });
    window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "harvest", duration: 900 } }));
    setStatus(complete ? `물컵 ${checked}/${total}개를 모두 체크했어요.` : `물컵 ${checked}/${total}개를 체크했어요.`);
  });
  $("#challenge-flow-close").addEventListener("click", () => $("#challenge-flow-dialog").close());
  $("#challenge-flow-back").addEventListener("click", () => showChallengeFlowStep(challengeFlowStep - 1));
  $("#challenge-flow-next").addEventListener("click", () => {
    if (validateChallengeFlowStep()) showChallengeFlowStep(challengeFlowStep + 1);
  });
  document.querySelectorAll('input[name="challenge-style"]').forEach((input) => input.addEventListener("change", () => {
    $("#custom-quest-picker").hidden = input.value !== "custom" || !input.checked;
    $("#challenge-flow-error").hidden = true;
  }));
  $("#custom-quest-picker").addEventListener("change", (event) => {
    const checked = [...$("#custom-quest-picker").querySelectorAll('input[type="checkbox"]:checked')];
    if (checked.length > 3) { event.target.checked = false; setStatus("커스터마이징 챌린지는 3개까지만 선택할 수 있어요."); }
  });
  $("#challenge-flow-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateChallengeFlowStep()) return;
    if (challengeFlowStep !== 4) { showChallengeFlowStep(challengeFlowStep + 1); return; }
    const style = new FormData(event.currentTarget).get("challenge-style");
    if (!style) return;
    const customIds = [...$("#custom-quest-picker").querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    if (style === "custom" && customIds.length !== 3) {
      $("#challenge-flow-error").textContent = "내가 조합하기는 챌린지 3개를 선택해 주세요.";
      $("#challenge-flow-error").hidden = false;
      return;
    }
    $("#challenge-flow-dialog").close();
    await generateChallengeQuests(style, customIds);
  });

  $("#forest-rag-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = $("#forest-rag-question").value.trim();
    const guide = ragGuideFor(question);
    $("#forest-rag-result").innerHTML = `<strong>${guide.answer}</strong><a href="${guide.url}" target="_blank" rel="noopener">검색 근거 · ${guide.source}</a><small>일반적인 건강교육 정보이며 진단·처방이 아닙니다.</small>`;
  });
  $("#group-goal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.groupGoalMemo = $("#group-goal-memo").value.trim().slice(0, 80);
    await persist("오늘의 목표를 저장했습니다.");
  });

  $("#open-avatar-studio").addEventListener("click", openAvatarStudio);
  $("#avatar-studio-close").addEventListener("click", () => $("#avatar-studio").close());
  $("#avatar-studio").addEventListener("click", (event) => {
    if (event.target === $("#avatar-studio")) $("#avatar-studio").close();
  });
  $("#avatar-studio").addEventListener("close", () => {
    musicEngine?.switchTo(sceneMusicName()).catch(() => setStatus("장면 음악을 다시 재생하지 못했습니다."));
  });
  $("#open-profile").addEventListener("click", () => { window.location.href = window.ForestProfile.PROFILE_URL; });
  $("#avatar-category-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-avatar-category]");
    if (!button) return;
    activeAvatarCategory = button.dataset.avatarCategory;
    if (activeAvatarCategory === "tools") avatarPreviewPose = "harvest";
    else if (activeAvatarCategory === "weapons") avatarPreviewPose = "attack";
    else if (!["tools", "weapons"].includes(activeAvatarCategory)) avatarPreviewPose = "idle";
    avatarPreviewFrame = 0;
    renderAvatarStudio();
  });
  $("#avatar-item-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-avatar-item]");
    if (!button) return;
    const categoryId = activeAvatarCategory;
    if (categoryId === "pose") return;
    const groupedCategories = ["head", "hair", "headwear", "arms", "torso", "legs", "feet", "tools", "weapons", "vehicle", "pet"];
    const groupedItem = groupedCategories.includes(categoryId)
      ? avatarCatalog[categoryId].find((item) => item.id === button.dataset.avatarItem)
      : null;
    const targetSlot = groupedItem?.slot || categoryId;
    const targetItem = groupedItem?.itemId || button.dataset.avatarItem;
    if (avatarDraft[targetSlot] === targetItem) return;
    avatarDraftHistory.push({ ...avatarDraft });
    avatarDraft[targetSlot] = targetItem;
    if (targetSlot === "petAccessory" && targetItem !== "none") {
      const selectedPet = window.ForestPets?.definition?.(avatarDraft.pet);
      if (!selectedPet || selectedPet.legacy) avatarDraft.pet = "last_tick_white";
    }
    if (targetSlot === "pet") {
      const selectedPet = window.ForestPets?.definition?.(targetItem);
      if (!selectedPet || selectedPet.legacy) avatarDraft.petAccessory = "none";
    }
    if (targetSlot === "lpcTool") {
      avatarDraft.lpcWeapon = "none";
      avatarPreviewPose = "harvest";
    }
    if (targetSlot === "lpcWeapon") {
      avatarDraft.lpcTool = "none";
      avatarPreviewPose = "attack";
    }
    avatarPreviewFrame = 0;
    if (categoryId === "bodyType") {
      if (["male", "muscular", "teen"].includes(avatarDraft.bodyType)) state.avatar.gender = "male";
      if (avatarDraft.bodyType === "female") state.avatar.gender = "female";
      if (avatarDraft.bodyType === "female") avatarDraft.lpcHead = "human_female";
      else avatarDraft.lpcHead = "human_male";
      Object.keys(lpcCatalogMap).forEach((categoryId) => {
        const available = avatarItemsForCategory(categoryId);
        if (!available.some((choice) => choice.id === avatarDraft[categoryId])) avatarDraft[categoryId] = available[0]?.id || "none";
      });
    }
    renderAvatarStudio();
  });
  $("#avatar-undo").addEventListener("click", () => {
    const previous = avatarDraftHistory.pop();
    if (!previous) return;
    avatarDraft = previous;
    renderAvatarStudio();
  });
  $("#avatar-randomize").addEventListener("click", () => {
    avatarDraftHistory.push({ ...avatarDraft });
    const bodyChoices = avatarItemsForCategory("bodyType");
    avatarDraft.bodyType = bodyChoices[Math.floor(Math.random() * bodyChoices.length)]?.id || "male";
    state.avatar.gender = avatarDraft.bodyType === "female" ? "female" : "male";
    avatarDraft.lpcHead = avatarDraft.bodyType === "female" ? "human_female" : "human_male";
    [
      "skin", "lpcHead", "lpcExpression", "lpcEyebrow", "lpcNose", "lpcEyes", "lpcWrinkles",
      "lpcHair", "hairColor", "lpcHat", "lpcGlasses", "lpcArms", "lpcOutfit", "outfitColor",
      "lpcBottom", "bottomColor", "lpcShoes", "shoeColor", "lpcTool", "lpcWeapon",
      "aura", "effect", "vehicle", "pet", "petAccessory", "speech",
    ].forEach((slot) => {
      const choices = avatarItemsForCategory(slot);
      if (choices.length) avatarDraft[slot] = choices[Math.floor(Math.random() * choices.length)].id;
    });
    renderAvatarStudio();
  });
  $("#avatar-strip-basics").addEventListener("click", () => {
    avatarDraftHistory.push({ ...avatarDraft });
    avatarDraft = {
      ...avatarDraft,
      lpcHair: "none", lpcHat: "none", lpcGlasses: "none", lpcArms: "none",
      lpcOutfit: "tshirt", outfitColor: "white", lpcBottom: "long_pants", bottomColor: "black",
      lpcShoes: "none", lpcTool: "none", lpcWeapon: "none",
      aura: "none", effect: "none", vehicle: "none", pet: "none", speech: "none",
    };
    renderAvatarStudio();
  });
  $("#avatar-restore-outfit").addEventListener("click", () => {
    const latest = state.outfitHistory[0];
    if (!latest) { setStatus("저장된 내 코디가 없습니다."); return; }
    avatarDraftHistory.push({ ...avatarDraft });
    avatarDraft = { ...defaultCosmetics, ...latest.cosmetics };
    avatarTuningDraft = { ...defaultAvatarTuning, ...latest.tuning };
    renderAvatarStudio();
  });
  $("#avatar-studio-save").addEventListener("click", async () => {
    state.avatar.engine = "lpc";
    state.avatar.cosmetics = { ...avatarDraft };
    state.avatar.tuning = { ...avatarTuningDraft };
    state.avatar.equipped = avatarDraft.accessory === "none" ? null : avatarDraft.accessory;
    rememberCurrentOutfit();
    renderInventory();
    renderCanvas();
    window.dispatchEvent(new CustomEvent("forest-avatar-updated", { detail: state.avatar }));
    $("#avatar-studio").close();
    await persist(`${state.avatar.name}님의 새 코디를 저장했습니다.`);
  });

  $("#asset-dock").addEventListener("click", async (event) => {
    const lookButton = event.target.closest("[data-outfit-look]");
    if (lookButton) {
      await applyOutfitLook(lookButton.dataset.outfitLook);
      return;
    }
    const button = event.target.closest("[data-item]");
    if (!button) return;
    const code = button.dataset.item;
    if (button.dataset.kind === "accessory") {
      state.avatar.equipped = state.avatar.equipped === code ? null : code;
      state.avatar.cosmetics.accessory = state.avatar.equipped || "none";
      placementCode = null;
      placementDraft = null;
      renderInventory(); emitPlacementUpdate(); await persist(`${itemCatalog[code].name} ${state.avatar.equipped === code ? "장착" : "해제"} 완료.`);
      return;
    }
    if (placementCode === code) { cancelPlacement(); return; }
    placementCode = code;
    placementDraft = null;
    renderInventory();
    emitPlacementUpdate();
    setStatus(`${itemCatalog[code].name}을 놓을 초록 격자를 선택해 주세요.`);
  });
  $("#wardrobe-list").addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-outfit-name-form]");
    if (!form) return;
    event.preventDefault();
    await renameOutfit(form.dataset.outfitNameForm, new FormData(form).get("outfit-name"));
  });
  [$("#wardrobe-list"), $("#storage-list")].forEach((carousel) => {
    carousel.addEventListener("wheel", (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      carousel.scrollLeft += delta;
    }, { passive: false });
  });
  $("#cancel-placement").addEventListener("click", () => cancelPlacement());
  $("#rotate-placement").addEventListener("click", rotatePlacement);
  $("#confirm-placement").addEventListener("click", confirmPlacement);

  $("#placed-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const [removed] = state.placed.splice(Number(button.dataset.remove), 1);
    renderPlaced(); renderCanvas(); await persist(`${itemCatalog[removed.code].name}을 창고로 돌려놓았습니다.`);
  });

  async function handleWorldPointer(pointerX, pointerY) {
    const x = placementCode ? Math.round(pointerX / 32) * 32 : Math.round(pointerX / 4) * 4;
    const y = placementCode ? Math.round(pointerY / 32) * 32 : Math.round(pointerY / 4) * 4;
    if (!placementCode) {
      canvas.focus();
      if (currentScene === "home") {
        const light = HOME_LIGHT_SOURCES.find(source => x >= source.bounds.left && x <= source.bounds.right && y >= source.bounds.top && y <= source.bounds.bottom);
        if (light) await interact("home_light");
        else if (x >= 590 && x <= 676 && y >= 150 && y <= 210) await interact("record_player");
        else if (x >= 155 && x <= 440 && y >= 120 && y <= 285) interact("sofa");
        else if (x >= 480 && x <= 670 && y >= 55 && y <= 260) interact("wardrobe");
        else if (x >= 330 && x <= 440 && y >= 380) interact("exit_home");
        else window.dispatchEvent(new CustomEvent("forest-move-to", { detail: { x: pointerX, y: pointerY } }));
      } else if (currentScene === "garden") {
        if ((x >= 75 && x <= 320 && y >= 90 && y <= 380) || (x >= 455 && x <= 700 && y >= 90 && y <= 410)) interact("crops");
        else if (x >= 330 && x <= 445 && y >= 370) interact("exit_garden");
        else window.dispatchEvent(new CustomEvent("forest-move-to", { detail: { x: pointerX, y: pointerY } }));
      } else {
        const duck = fallbackRiverDuckAt(pointerX, pointerY);
        if (duck) { fleeFallbackRiverDuck(duck.item, pointerX, pointerY); return; }
        const placedTarget = nearbyPlacedObject(x, y, 58);
        if (placedTarget?.item.code === "reward_cow") {
          const reaction = y < placedTarget.item.y - 28 ? "head" : "body";
          reactToCow(placedTarget.index, reaction);
        } else if (placedTarget) await interact(`object:${placedTarget.index}`);
        else {
          const fixedLanternSources = typeof WORLD_FIXED_LANTERNS !== "undefined" ? WORLD_FIXED_LANTERNS : [];
          const memoryCamera = typeof WORLD_MEMORY_CAMERA !== "undefined" ? WORLD_MEMORY_CAMERA : { bounds: { left: 650, right: 735, top: 278, bottom: 356 } };
          const fixedLantern = fixedLanternSources.find(source => x >= source.bounds.left && x <= source.bounds.right && y >= source.bounds.top && y <= source.bounds.bottom);
          if (fixedLantern) await interact(`fixed_lantern:${fixedLantern.id}`);
          else if (x >= memoryCamera.bounds.left && x <= memoryCamera.bounds.right && y >= memoryCamera.bounds.top && y <= memoryCamera.bounds.bottom) await interact("memory_camera");
          else if (x >= 150 && x <= 292 && y >= 120 && y <= 282) await interact("home");
          else if (x >= 535 && x <= 704 && y >= 120 && y <= 300) await interact("garden");
          else window.dispatchEvent(new CustomEvent("forest-move-to", { detail: { x: pointerX, y: pointerY } }));
        }
      }
      return;
    }
    if (currentScene !== "world") { setStatus("숲 오브젝트는 월드 장면에서만 배치할 수 있어요."); return; }
    if (!placementCellValid(x, y)) { setStatus("빨간 격자나 다른 오브젝트와 겹치는 위치에는 놓을 수 없습니다."); return; }
    placementDraft = { code: placementCode, x, y, rotation: Number(placementDraft?.rotation) || 0 };
    renderPlacementUI();
    emitPlacementUpdate();
    setStatus(`${itemCatalog[placementCode].name} 위치를 선택했습니다. 회전하거나 V 버튼으로 확정하세요.`);
  }

  canvas.addEventListener("click", async (event) => {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * WORLD_WIDTH / bounds.width;
    const y = (event.clientY - bounds.top) * WORLD_HEIGHT / bounds.height;
    await handleWorldPointer(x, y);
  });
  window.addEventListener("forest-world-pointer", async (event) => {
    const detail = event.detail || {};
    if (!Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;
    await handleWorldPointer(detail.x, detail.y);
  });
  window.addEventListener("forest-placed-object-pointer", async (event) => {
    const detail = event.detail || {};
    const index = Number(detail.index);
    const item = state.placed[index];
    if (!Number.isInteger(index) || !item || currentScene !== "world" || placementCode) return;
    canvas.focus();
    if (item.code === "duck_float") {
      // Phaser's direct duck handler owns its own transient state. Never fall
      // through to generic object on/off or persistence for either renderer.
      if (!window.carrotForestPhaserActive) {
        const pose = fallbackRiverDuckEntry(item).state;
        fleeFallbackRiverDuck(item, Number.isFinite(detail.x) ? detail.x : pose.x,
          Number.isFinite(detail.y) ? detail.y : pose.y);
      }
      return;
    }
    if (item.code === "reward_cow") {
      const reaction = ["head", "body"].includes(detail.reaction) ? detail.reaction : Number(detail.y) < item.y - 28 ? "head" : "body";
      reactToCow(index, reaction);
      return;
    }
    await interact(`object:${index}`);
  });

  $("#reward-button").addEventListener("click", async () => {
    const v2Plan = window.ForestChallengeV2?.enabled ? window.ForestChallengeV2.plan : null;
    if (v2Plan) {
      const rewardDay = String(v2Plan.day_id || TODAY);
      if (!v2Plan.chest_issued || state.v2RewardOpenedDay === rewardDay) return;
      state.v2RewardOpenedDay = rewardDay;
      renderGroup();
      await adapter.save(state);
      await playRewardCelebration(null);
      await persist("일일 보상 상자를 열었습니다!");
      return;
    }
    if (groupCompleted() < groupTarget() || state.rewardClaimed) return;
    const reward = deterministicReward();
    state.rewardClaimed = true;
    state.carrots += 50;
    if (reward) state.inventory.push(reward);
    renderGroup();
    $("#carrot-balance").textContent = String(state.carrots);
    await adapter.save(state);
    await playRewardCelebration(reward);
    if (!reward) renderInventory();
    await persist(reward ? `${itemCatalog[reward].name}과 당근 50개를 받았습니다!` : "당근 50개를 받았습니다!");
  });

  $("#reward-skip").addEventListener("click", () => {
    $("#reward-celebration").hidden = true;
    if (rewardSkipResolve) rewardSkipResolve();
  });

  let chatFocusTimer = 0;
  function appendChatMessage(authorName, message, className = "") {
    const isBot = authorName === "간당이";
    const row = document.createElement("div");
    row.className = isBot ? "chat-row chat-row-bot" : "chat-row chat-row-user";
    if (isBot) {
      const avatar = document.createElement("img");
      avatar.className = "chat-avatar";
      avatar.src = WISDOM_CHAT_AVATAR_SRC;
      avatar.alt = "";
      row.append(avatar);
    }
    const bubble = document.createElement("p");
    if (className) bubble.className = className;
    const author = document.createElement("strong");
    const copy = document.createElement("span");
    author.textContent = authorName;
    copy.textContent = message;
    bubble.append(author, copy);
    row.append(bubble);
    $("#chat-messages").append(row);
    while ($("#chat-messages").children.length > 50) $("#chat-messages").firstElementChild.remove();
    $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
    return row;
  }

  function renderWisdomSuggestions() {
    const suggestions = $("#wisdom-question-suggestions");
    if (!suggestions) return;
    suggestions.innerHTML = "";
    WISDOM_QUESTION_EXAMPLES.forEach((question) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = question;
      button.addEventListener("click", () => {
        const input = $("#chat-input");
        input.value = question;
        $("#chat-form").requestSubmit?.();
        if (!$("#chat-form").requestSubmit) $("#chat-form").dispatchEvent(new Event("submit", { cancelable: true }));
      });
      suggestions.append(button);
    });
  }

  function setChatMode(mode = "forest") {
    chatMode = mode;
    const wisdom = mode === "wisdom";
    $("#chat-panel").classList?.toggle("wisdom-mode", wisdom);
    $("#chat-title").textContent = wisdom ? "지혜의 샘" : "숲 채팅";
    $("#chat-help").textContent = wisdom ? "건강 질문을 입력하거나 예시 질문을 눌러 보세요." : "C를 다시 누르면 채팅이 숨겨집니다.";
    $("#chat-input").maxLength = wisdom ? 160 : 60;
    $("#chat-input").placeholder = wisdom ? "건강 질문을 입력해 주세요" : "메시지를 입력하고 Enter";
    const guide = $("#wisdom-chat-guide");
    const suggestions = $("#wisdom-question-suggestions");
    if (guide) guide.hidden = !wisdom;
    if (suggestions) suggestions.hidden = !wisdom;
    if (wisdom) renderWisdomSuggestions();
  }

  function wisdomFallbackAnswer(question) {
    if (question.includes("혈압") || question.includes("혈당") || question.includes("검진") || question.includes("수치")) {
      return "혈압·혈당 같은 건강 수치는 같은 시간대와 비슷한 조건에서 확인해야 변화를 비교하기 쉬워요. 수치가 높거나 증상이 있으면 앱 답변으로 판단하지 말고 의료기관에 문의해 주세요.\n출처: 챌린지 선정 근거, 질병관리청 건강수치 확인 지침";
    }
    if (question.includes("걷") || question.includes("운동") || question.includes("식후")) {
      return "가벼운 걷기는 활동량을 늘리는 부담 낮은 방법이에요. 처음에는 짧게 시작하고, 통증·어지럼·심한 숨참이 있으면 멈추는 게 좋아요.\n출처: 챌린지 선정 근거, 대한당뇨병학회·질병관리청 신체활동 자료";
    }
    if (question.includes("물") || question.includes("음료") || question.includes("당류") || question.includes("단맛") || question.includes("단 것")) {
      return "단 음료를 물이나 덜 단 음료로 바꾸는 건 당류 섭취를 줄이는 쉬운 시작점이에요. 오늘 한 잔부터 바꿔 보고, 당뇨병이나 복약 중인 상황은 의료진 안내를 우선해 주세요.\n출처: 챌린지 선정 근거, 식약처·질병관리청 일반 건강지침";
    }
    return "건강한 생활습관은 걷기, 규칙적인 식사, 덜 달게 마시기, 정기적인 건강수치 확인처럼 매일 기록하기 쉬운 행동부터 시작할 수 있어요. 이 답변은 일반 건강교육 정보라서 개인 진단이나 처방을 대신하지 않아요.\n출처: RAG 준비 문서, 공공기관 일반 건강교육 자료";
  }

  async function fetchWisdomAuthToken() {
    if (typeof adapter !== "undefined" && adapter.mode === "api" && adapter.token) return adapter.token;
    try {
      const response = await fetch("/api/v1/auth/token/refresh", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return null;
      const payload = await response.json();
      return typeof payload?.access_token === "string" && payload.access_token ? payload.access_token : null;
    } catch { return null; }
  }

  async function askWisdomSpring(question) {
    const pending = appendChatMessage("간당이", "근거를 찾아보고 있어요...", "is-pending");
    try {
      const token = await fetchWisdomAuthToken();
      if (!token) throw new Error("로그인 정보를 확인하지 못했어요.");
      const response = await fetch("/api/v1/health-education/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ question }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail?.message || payload.detail || "건강 정보를 불러오지 못했어요.");
      const data = payload.data || payload;
      const citations = Array.isArray(data.citations) && data.citations.length
        ? `\n출처: ${data.citations.slice(0, 3).map((item) => item.title || item.url || item.document_id).filter(Boolean).join(", ")}`
        : "";
      pending.querySelector("p").className = "";
      pending.querySelector("span").textContent = `${data.answer || wisdomFallbackAnswer(question)}\n${data.medical_notice || "일반 건강교육 정보이며 개인 진단·처방을 대신하지 않습니다."}${citations}`;
    } catch {
      pending.querySelector("p").className = "";
      pending.querySelector("span").textContent = `${wisdomFallbackAnswer(question)}\n일반 건강교육 정보이며 개인 진단·처방을 대신하지 않습니다.`;
    }
    $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
  }

  function openWisdomSpringChat() {
    setChatMode("wisdom");
    if (!wisdomIntroShown) {
      $("#chat-messages").innerHTML = "";
      appendChatMessage("간당이", "당근의 요정 간당이가 알려주는, 건강 정보\n건강에 대한 건 뭐든 물어봐!");
      wisdomIntroShown = true;
    }
    toggleChat(true);
    setStatus("지혜의 샘에서 간당이가 건강 정보를 알려줄 준비를 했어요.");
  }

  function toggleChat(force) {
    const panel = $("#chat-panel");
    panel.hidden = force === undefined ? !panel.hidden : !force;
    $("#chat-toggle").setAttribute("aria-expanded", String(!panel.hidden));
    $("#chat-toggle").hidden = !panel.hidden;
    window.clearTimeout(chatFocusTimer);
    if (!panel.hidden) {
      window.dispatchEvent(new CustomEvent("forest-controls-hidden"));
      chatFocusTimer = window.setTimeout(() => { if (!panel.hidden) $("#chat-input").focus({ preventScroll: true }); }, 0);
    } else (window.carrotForestPhaserActive ? $("#phaser-world") : canvas).focus({ preventScroll: true });
  }

  document.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (document.querySelector("dialog[open], #reward-celebration:not([hidden])")) return;
    const active = document.activeElement;
    const inChat = active === $("#chat-input");
    const editing = active?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(active?.tagName);
    if (event.key.toLowerCase() === "c" && (!editing || inChat)) {
      event.preventDefault();
      if ($("#chat-panel").hidden) setChatMode("forest");
      toggleChat();
    } else if (event.key === "Enter" && !editing && active?.tagName !== "BUTTON" && $("#chat-panel").hidden) {
      event.preventDefault();
      setChatMode("forest");
      toggleChat(true);
    } else if (event.key === "Escape" && !$("#chat-panel").hidden && (!editing || inChat)) {
      event.preventDefault();
      toggleChat(false);
    }
  });

  async function toggleSit() {
    if (state.avatar.mounted) { setStatus("탈것에서 내린 뒤 앉을 수 있어요."); return; }
    if (!state.avatar.sitting && currentScene === "world") {
      const chair = state.placed
        .map((placed, index) => ({ ...placed, index, distance: Math.hypot(state.avatar.x - placed.x, state.avatar.y - placed.y) }))
        .filter((placed) => seatObjectCodes.has(placed.code))
        .filter((placed) => placed.distance < 64)
        .sort((left, right) => left.distance - right.distance)[0];
      if (chair) {
        await sitAtPlacedObject(chair.index);
        return;
      }
    }
    state.avatar.sitting = !state.avatar.sitting;
    playSfx("sit-cloth", { volume: 0.24 });
    renderCanvas();
    await persist(state.avatar.sitting ? "가까운 자리에서 잠시 쉬고 있어요. X를 다시 누르면 일어납니다." : "자리에서 일어났습니다.");
  }

  async function sitAtPlacedObject(index) {
    const seat = state.placed[index];
    if (!seat || !seatObjectCodes.has(seat.code)) return;
    if (state.avatar.mounted) { setStatus("탈것에서 내린 뒤 자리에 앉을 수 있어요."); return; }
    state.avatar.x = seat.x;
    state.avatar.y = seat.y + 4;
    state.avatar.direction = "down";
    state.avatar.sitting = true;
    playSfx("sit-cloth", { volume: 0.24 });
    renderCanvas();
    await persist(`${itemCatalog[seat.code].name}에 앉았습니다. X를 누르면 일어납니다.`);
  }

  async function feedPet() {
    const pet = state.avatar.cosmetics?.pet;
    if (!pet || pet === "none") { setStatus("아바타 꾸미기에서 함께 걸을 펫을 먼저 선택해 주세요."); return; }
    if (state.carrots < 1) { setStatus("펫에게 줄 당근이 없어요. 챌린지를 완료하고 당근밭에서 수확해 보세요."); return; }
    state.carrots -= 1;
    state.petFedCount = (state.petFedCount || 0) + 1;
    playSfx("pet-feed", { volume: 0.34 });
    window.dispatchEvent(new CustomEvent("forest-pet-fed", { detail: { pet, amount: 1 } }));
    renderAll();
    await persist("펫에게 당근 1개를 주었어요. 펫이 아주 좋아합니다! 💚");
  }

  async function toggleRide() {
    if (currentScene !== "world") { setStatus("탈것은 숲 월드에서 이용할 수 있어요."); return; }
    const mobility = state.avatar.cosmetics?.vehicle || "none";
    if (!state.avatar.mounted && mobility === "none") {
      setStatus("아바타 꾸미기에서 휠체어나 날개를 먼저 선택해 주세요.");
      return;
    }
    state.avatar.mounted = !state.avatar.mounted;
    playSfx("mount", { volume: 0.3 });
    state.avatar.sitting = false;
    walkingUntil = 0;
    walkAnimationFrame = 0;
    renderCanvas();
    const mobilityName = avatarCatalog.vehicle.find((item) => item.id === mobility)?.name || "이동 보조 아이템";
    await persist(state.avatar.mounted ? `${mobilityName} 사용을 시작했습니다.` : `${mobilityName} 사용을 마쳤습니다.`);
  }

  function equippedWeaponDuration() {
    return {
      bow: 1280,
      wand: 980,
      cane: 860,
      dagger: 680,
      sword: 780,
    }[state.avatar.cosmetics?.lpcWeapon] || 780;
  }

  function attackWithEquippedWeapon() {
    if (!window.carrotForestPhaserActive) playSfx(weaponSfxName(), { volume: 0.34, minInterval: 280 });
    window.dispatchEvent(new CustomEvent("forest-avatar-action", {
      detail: { pose: "attack", duration: equippedWeaponDuration() },
    }));
  }

  createForestMemoryUi({ getState: () => state });

  let phaserPersistTimer = null;
  window.addEventListener("forest-phaser-position", (event) => {
    const detail = event.detail || {};
    if (!Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;
    state.avatar.x = detail.x;
    state.avatar.y = detail.y;
    if (typeof detail.sitting === "boolean") state.avatar.sitting = detail.sitting;
    if (detail.direction) state.avatar.direction = detail.direction;
    $("#avatar-coordinate").textContent = `X ${Math.round(detail.x)} · Y ${Math.round(detail.y)}`;
    updateInteractionPrompt();
    window.clearTimeout(phaserPersistTimer);
    phaserPersistTimer = window.setTimeout(() => adapter.save(state), 240);
  });
  window.addEventListener("forest-phaser-interact", () => interact());
  window.addEventListener("forest-pet-clicked", async () => feedPet());
  window.addEventListener("forest-phaser-action", async (event) => {
    if (event.detail === "run") toggleRunning();
    if (event.detail === "chat") toggleChat();
    if (event.detail === "sit") await toggleSit();
    if (event.detail === "ride") await toggleRide();
    if (event.detail === "feed") await feedPet();
  });
  let currentWildEncounter = null;
  const caughtWildEncounters = new Set();
  let catchNoticeTimer = null;
  function showCatchNotice(message) {
    const toast = $("#forest-catch-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(catchNoticeTimer);
    catchNoticeTimer = window.setTimeout(() => { toast.hidden = true; }, 4000);
  }
  window.addEventListener("forest-rat-carrot-warning", () => {
    showCatchNotice("쥐가 당근을 노리고 있습니다.");
  });
  window.addEventListener("forest-rat-appeared", (event) => {
    currentWildEncounter = { eventId: event.detail?.eventId, species: event.detail?.species === "rabbit" ? "rabbit" : "mouse" };
    if (event.detail?.species === "rabbit") {
      const variantLabel = event.detail?.variantLabel ? ` (${event.detail.variantLabel})` : "";
      setStatus(`야생 토끼${variantLabel}가 나타났어요. 숲을 돌아다니는 모습을 찾아보세요!`);
      return;
    }
    setStatus(state.avatar.cosmetics?.pet && state.avatar.cosmetics.pet !== "none"
      ? "야생 쥐가 나타났어요. 가까이 가면 펫이 자동으로 달려가고, 직접 Z로도 잡을 수 있어요!"
      : "숲 어딘가에 야생 쥐가 나타났어요. 가까이 다가가 쥐를 바라보고 Z로 잡아 보세요!");
  });
  function renderMonsterAttackState(active) {
    if (typeof document === "undefined") return;
    document.querySelectorAll('[data-action="attack"]').forEach((button) => {
      button.classList.toggle("is-monster-ready", active === true);
      button.setAttribute("aria-label", active === true ? "몬스터 공격 가능, 단축키 Z" : "공격, 단축키 Z");
    });
  }
  window.addEventListener("forest-monster-presence", (event) => {
    renderMonsterAttackState(event.detail?.active === true);
  });
  renderMonsterAttackState(window.ForestMonsterPresence === true);
  window.addEventListener("forest-challenge-celebrated", async (event) => {
    const claimId = String(event.detail?.completionKey || `${event.detail?.assignmentId || "quest"}:${Date.now()}`);
    state.challengeCarrotClaims ||= {};
    if (!state.challengeCarrotClaims[claimId]) state.challengeCarrotClaims[claimId] = { amount: 1, harvested: false };
    const completed = Math.max(0, Math.min(3, Number(window.ForestChallengeV2?.plan?.completed) || 0));
    const me = state.members.find((member) => member.me);
    if (me) me.completed = completed;
    renderGroup(); renderGardenHarvest();
    await adapter.save(state);
  });
  window.addEventListener("forest-rat-caught", async (event) => {
    const eventId = event.detail?.eventId;
    if (eventId == null || caughtWildEncounters.has(eventId)) return;
    const encounter = currentWildEncounter?.eventId === eventId ? currentWildEncounter : null;
    const rabbit = (encounter?.species || event.detail?.species) === "rabbit";
    // Resolve the reward here, not from a possibly stale renderer's amount.
    // Claim before saving so a click and a pet cannot reward the same encounter twice.
    caughtWildEncounters.add(eventId);
    if (encounter) currentWildEncounter = null;
    if (rabbit) state.carrots += 1;
    playSfx("rat-caught", { volume: 0.42, rate: event.detail?.source === "pet" ? 1.08 : 1 });
    $("#carrot-balance").textContent = String(state.carrots);
    $("#preview-carrot-balance").textContent = String(state.carrots);
    const message = rabbit ? "토끼가 당근 1개를 놓고 갔습니다." : "쥐를 잡았습니다.";
    await persist(message);
    showCatchNotice(message);
  });
  window.addEventListener("forest-placement-confirm", confirmPlacement);

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName)) return;
    if (window.carrotForestPhaserActive) return;
    if (["q", "Q", "r", "R", "x", "X", "e", "E", "z", "Z", "f", "F", "j", "J", "v", "V"].includes(event.key)) event.preventDefault();
    if (event.key === "v" || event.key === "V") { confirmPlacement(); return; }
    if (event.key === "q" || event.key === "Q") { interact(); return; }
    if (event.code === "KeyR" || event.key === "r" || event.key === "R") { if (!event.repeat) toggleRunning(); return; }
    if (event.key === "x" || event.key === "X") { toggleSit(); return; }
    if (event.key === "e" || event.key === "E") { toggleRide(); return; }
    if (event.key === "z" || event.key === "Z") { attackWithEquippedWeapon(); return; }
    if (event.key === "f" || event.key === "F") { feedPet(); return; }
    if (event.key === "j" || event.key === "J") { window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "jump", duration: 620 } })); return; }
    const direction = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" }[event.key];
    if (!direction) return;
    event.preventDefault(); moveAvatar(direction);
  });
  document.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("pointerdown", (event) => { event.preventDefault(); moveAvatar(button.dataset.move); }));
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.action;
    if (action === "interact") interact();
    if (action === "jump") window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "jump", duration: 620 } }));
    if (action === "run") {
      toggleRunning();
      const movementTarget = window.carrotForestPhaserActive ? $("#phaser-world") : canvas;
      movementTarget?.focus({ preventScroll: true });
    }
    if (action === "chat") toggleChat();
    if (action === "sit") await toggleSit();
    if (action === "ride") await toggleRide();
    if (action === "attack") attackWithEquippedWeapon();
    if (action === "dance") window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "dance", duration: 1800 } }));
    if (action === "feed") await feedPet();
  }));

  $("#harvest-challenge-carrots").addEventListener("click", harvestChallengeCarrots);

  const FONT_SIZE_KEY = "gandang-carrot-forest-font-size-v1";
  const applyFontSize = value => {
    const size = ["small", "default", "large"].includes(value) ? value : "default";
    document.body.classList.remove("large-text");
    document.body.dataset.fontSize = size;
    $("#font-size-select").value = size;
    try { localStorage.setItem(FONT_SIZE_KEY, size); } catch { /* Session-only preference. */ }
    window.ForestHud?.fitGame();
  };
  let savedFontSize = document.body.classList.contains("large-text") ? "large" : "default";
  try { savedFontSize = localStorage.getItem(FONT_SIZE_KEY) || savedFontSize; } catch { /* Keep default. */ }
  applyFontSize(savedFontSize);
  $("#font-size-select").addEventListener("change", event => applyFontSize(event.currentTarget.value));

  const atmosphereButton = $("#atmosphere-toggle");
  const updateAtmosphereButton = (enabled) => {
    atmosphereButton.setAttribute("aria-pressed", String(enabled));
    atmosphereButton.setAttribute("aria-label", `날씨·시간 효과 ${enabled ? "켜짐" : "꺼짐"}`);
    atmosphereButton.title = enabled ? "날씨·시간 효과 켜짐" : "날씨·시간 효과 꺼짐";
    atmosphereButton.textContent = "날씨·시간";
  };
  updateAtmosphereButton(localStorage.getItem(ATMOSPHERE_KEY) !== "off");
  atmosphereButton.addEventListener("click", () => {
    const enabled = atmosphereButton.getAttribute("aria-pressed") !== "true";
    localStorage.setItem(ATMOSPHERE_KEY, enabled ? "on" : "off");
    updateAtmosphereButton(enabled);
    window.dispatchEvent(new CustomEvent("forest-atmosphere-updated", { detail: { enabled } }));
    if (musicEngine?.enabled && currentScene === "world" && !$("#avatar-studio").open) {
      musicEngine.switchTo(sceneMusicName()).catch(() => {});
    }
    setStatus(enabled ? "현재 시간에 맞춰 숲의 밝기를 적용합니다." : "날씨·시간 효과를 끄고 주간 밝기로 표시합니다.");
  });

  document.querySelectorAll("[data-workspace-target]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-workspace-target]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      if (button.dataset.workspaceTarget === "avatar-editor") { openAvatarStudio(); return; }
      if (button.dataset.workspaceTarget === "asset-dock") { renderInventoryDialog("storage"); $("#inventory-dialog").showModal(); return; }
      if (button.dataset.workspaceTarget === "team-inspector") activateInspectorPanel("team-inspector", true);
      const target = document.getElementById(button.dataset.workspaceTarget);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("workspace-focus");
      window.setTimeout(() => target?.classList.remove("workspace-focus"), 700);
    });
  });

  $("#inventory-dialog-close").addEventListener("click", () => $("#inventory-dialog").close());
  document.querySelectorAll("[data-inventory-view]").forEach((button) => button.addEventListener("click", () => renderInventoryDialog(button.dataset.inventoryView)));
  $("#inventory-dialog-grid").addEventListener("click", async (event) => {
    const lookId = event.target.closest("[data-outfit-look]")?.dataset.outfitLook;
    if (lookId) {
      $("#inventory-dialog").close();
      await applyOutfitLook(lookId);
      return;
    }
    const code = event.target.closest("[data-inventory-dialog-item]")?.dataset.inventoryDialogItem;
    if (!code) return;
    $("#inventory-dialog").close();
    document.querySelector(`#asset-dock [data-item="${code}"]`)?.click();
    $("#asset-dock").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#inventory-dialog-grid").addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-outfit-name-form]");
    if (!form) return;
    event.preventDefault();
    await renameOutfit(form.dataset.outfitNameForm, new FormData(form).get("outfit-name"));
  });

  document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activateInspectorPanel(button.dataset.inspectorTab, true);
    });
  });

  // Fullscreen and Escape handling live in forest-atmosphere.js.

  // Refresh the app without deleting any saved outfits, placements or progress.
  $("#reset-position").addEventListener("click", () => window.location.reload());

  $("#world-dialog-close").addEventListener("click", () => $("#world-dialog").close());
  $("#world-dialog-actions").addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-world-action]");
    const action = actionButton?.dataset.worldAction;
    if (!action) return;
    if (action === "record_music") {
      await selectHomeRecordTrack(actionButton.dataset.recordTrack);
      $("#world-dialog").close();
      return;
    }
    if (action === "record_off") {
      await selectHomeRecordTrack(null);
      $("#world-dialog").close();
      return;
    }
    if (action === "enter_home") {
      playSfx("door-open", { volume: 0.36 });
      window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "door", duration: 850 } }));
      $("#world-dialog").close();
      switchScene("home");
      await persist("우리 집 안으로 들어왔습니다. 소파와 옷장을 이용해 보세요.");
    }
    if (action === "enter_garden") {
      playSfx("door-open", { volume: 0.32, rate: 1.08 });
      window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "door", duration: 850 } }));
      $("#world-dialog").close();
      switchScene("garden");
      await persist(pendingChallengeCarrots()
        ? `당근 밭에 들어왔습니다. 챌린지로 자란 당근 ${pendingChallengeCarrots()}개를 수확해 보세요.`
        : "당근 밭에 들어왔습니다. 챌린지를 완료하면 이곳에 당근이 자라요.");
    }
    if (action === "exit_scene") {
      playSfx("door-open", { volume: 0.3, rate: 0.94 });
      window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "door", duration: 850 } }));
      $("#world-dialog").close();
      switchScene("world");
      await persist("우리의 작은 숲으로 돌아왔습니다.");
    }
    if (action === "rest") {
      currentScene = "home";
      state.avatar.x = 292;
      state.avatar.y = 232;
      state.avatar.sitting = true;
      state.avatar.mounted = false;
      state.fishing = false;
      $("#world-dialog").close();
      renderCanvas();
      await persist("우리 집 소파에서 편안하게 쉬고 있어요.");
    }
    if (action === "wardrobe") {
      $("#world-dialog").close();
      openAvatarStudio();
    }
    if (action === "water" && !state.gardenWatered) {
      playSfx("water", { volume: 0.3 });
      window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "harvest", duration: 1400 } }));
      state.gardenWatered = true;
      state.carrots += 10;
      $("#carrot-balance").textContent = state.carrots;
      $("#world-dialog").close();
      renderCanvas();
      await persist("당근 밭에 물을 주고 당근 10개를 받았습니다.");
    }
    if (action === "harvest_challenge") {
      $("#world-dialog").close();
      await harvestChallengeCarrots();
    }
    if (action === "team") {
      $("#world-dialog").close();
      activateInspectorPanel("team-inspector", true);
    }
    if (action === "wisdom_spring") {
      $("#world-dialog").close();
      openWisdomSpringChat();
    }
    if (action === "ride") {
      $("#world-dialog").close();
      await toggleRide(false);
    }
    if (action === "fish") {
      playSfx("fishing-cast", { volume: 0.32 });
      window.setTimeout(() => playSfx("fishing-catch", { volume: 0.38 }), 900);
      window.dispatchEvent(new CustomEvent("forest-avatar-action", { detail: { pose: "fishing", duration: 2200 } }));
      const firstCatch = !state.fishCaught;
      currentScene = "world";
      state.avatar.x = 305;
      state.avatar.y = 390;
      state.avatar.sitting = true;
      state.avatar.mounted = false;
      state.fishing = true;
      state.fishCaught = true;
      if (firstCatch) state.carrots += 5;
      $("#carrot-balance").textContent = state.carrots;
      $("#world-dialog").close();
      renderCanvas();
      await persist(firstCatch ? "은빛 붕어를 잡고 당근 5개를 받았습니다!" : "연못에 낚싯대를 드리우고 잠시 쉬고 있어요.");
    }
  });

  $("#scene-exit").addEventListener("click", async () => {
    if (currentScene === "world") return;
    playSfx("door-open", { volume: 0.3, rate: 0.94 });
    switchScene("world");
    await persist("우리의 작은 숲으로 돌아왔습니다.");
  });

  $("#chat-close").addEventListener("click", () => toggleChat(false));
  $("#chat-toggle").addEventListener("click", () => { if ($("#chat-panel").hidden) setChatMode("forest"); toggleChat(); });
  $("#ui-toggle").addEventListener("click", () => { if (document.body.classList.contains("forest-ui-hidden")) toggleChat(false); });
  window.addEventListener("forest-name-updated", () => renderSceneChrome());
  $("#chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#chat-input");
    const message = input.value.trim();
    if (!message) return;
    appendChatMessage(state.avatar.name, message);
    input.value = "";
    if (chatMode === "wisdom") askWisdomSpring(message);
  });

  $("#music-toggle").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    musicEngine ||= new CozyForestMusic();
    const enabled = button.getAttribute("aria-pressed") !== "true";
    try {
      if (enabled) await musicEngine.start($("#avatar-studio").open ? "avatar" : sceneMusicName()); else musicEngine.stop();
    } catch {
      setStatus("이 브라우저에서는 배경음악을 재생할 수 없습니다. 다른 기능은 계속 이용할 수 있어요.");
      return;
    }
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", `BGM ${enabled ? "켜짐" : "꺼짐"}`);
    button.title = enabled ? "BGM 끄기" : "BGM 켜기";
    button.textContent = "BGM";
    setStatus(enabled ? "숲 배경음악을 재생합니다." : "숲 배경음악을 멈췄습니다.");
  });

  const volumeToggle = $("#volume-toggle");
  const volumePanel = $("#volume-panel");
  const volumeSlider = $("#music-volume");
  const volumeValue = $("#music-volume-value");
  const muteButton = $("#music-mute");
  const sfxVolumeSlider = $("#sfx-volume");
  const sfxVolumeValue = $("#sfx-volume-value");
  const sfxMuteButton = $("#sfx-mute");
  const syncVolumeControls = () => {
    musicEngine ||= new CozyForestMusic();
    sfxEngine ||= new ForestSfx();
    const percentage = Math.round(musicEngine.volume * 100);
    const sfxPercentage = Math.round(sfxEngine.volume * 100);
    volumeSlider.value = String(percentage);
    volumeValue.value = `${percentage}%`;
    muteButton.setAttribute("aria-pressed", String(musicEngine.muted));
    muteButton.textContent = musicEngine.muted ? "배경음악 음소거 해제" : "배경음악 음소거";
    sfxVolumeSlider.value = String(sfxPercentage);
    sfxVolumeValue.value = `${sfxPercentage}%`;
    sfxMuteButton.setAttribute("aria-pressed", String(sfxEngine.muted));
    sfxMuteButton.textContent = sfxEngine.muted ? "효과음 음소거 해제" : "효과음 음소거";
    rewardChestSound.volume = sfxEngine.effectiveVolume(.42);
    volumeToggle.setAttribute("aria-label", `음량 설정, 배경음악 ${musicEngine.muted ? "음소거" : `${percentage}%`}, 효과음 ${sfxEngine.muted ? "음소거" : `${sfxPercentage}%`}`);
  };
  syncVolumeControls();
  volumeToggle.addEventListener("click", () => {
    const expanded = volumeToggle.getAttribute("aria-expanded") !== "true";
    volumeToggle.setAttribute("aria-expanded", String(expanded));
    volumePanel.hidden = !expanded;
    if (expanded) volumeSlider.focus();
  });
  volumeSlider.addEventListener("input", () => {
    musicEngine.setVolume(Number(volumeSlider.value) / 100);
    syncVolumeControls();
  });
  muteButton.addEventListener("click", () => {
    musicEngine.setMuted(!musicEngine.muted);
    syncVolumeControls();
  });
  sfxVolumeSlider.addEventListener("input", () => {
    sfxEngine.setVolume(Number(sfxVolumeSlider.value) / 100);
    syncVolumeControls();
  });
  sfxMuteButton.addEventListener("click", () => {
    sfxEngine.setMuted(!sfxEngine.muted);
    syncVolumeControls();
  });

  const installButton = $("#install-pwa");
  let deferredInstallPrompt = null;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!standalone) {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.hidden = false;
    });
  }
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      setStatus("브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택해 주세요.");
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
    setStatus(choice.outcome === "accepted" ? "당근의 숲 앱 설치를 시작합니다." : "설치를 취소했습니다.");
  });
  window.addEventListener("appinstalled", () => {
    installButton.hidden = true;
    setStatus("당근의 숲이 앱으로 설치되었습니다.");
  });

  const localDemoOrigin = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/forest-sw.js", { scope: "/forest" }).catch(() => {
        setStatus("오프라인 준비에 실패했습니다. 온라인 게임은 계속 이용할 수 있습니다.");
      });
    });
  }

  window.CarrotForestAdapters = { DemoForestAdapter, ApiForestAdapter };
  function showForestAccessError(error) {
    const expired = error?.message === "FOREST_SESSION_EXPIRED" || error?.status === 401;
    const forbidden = error?.message === "FOREST_FORBIDDEN" || error?.status === 403;
    if (expired) sessionStorage.removeItem(FOREST_SESSION_STORAGE_KEY);
    const message = expired
      ? "로그인 시간이 끝났습니다. 간당간당에서 다시 로그인해 주세요."
      : forbidden
        ? "선택한 공동 챌린지의 당근의 숲에 접근할 수 없습니다."
        : error?.message || "당근의 숲 정보를 불러오지 못했습니다.";
    setStatus(message);
    const entryButton = $("#start-prediction-flow");
    if (entryButton) {
      entryButton.textContent = expired ? "다시 로그인하기" : forbidden ? "다른 숲 선택하기" : "간당간당으로 돌아가기";
      entryButton.onclick = () => window.location.assign(expired ? "/?auth=login&returnTo=forest" : "/");
    }
  }
  adapter.load().then(async (loaded) => {
    await window.LpcAvatarEngine?.ready();
    // One complete PNG per object: never reveal legacy cropped furniture while loading.
    await window.ForestObjects.loadIndividualAssets();
    await window.ForestRiverDuckArt.loadImages();
    const params = new URLSearchParams(window.location.search);
    const localReset = localDemoOrigin && params.get("resetToday") === "1";
    state = localReset ? resetTodayProgress(loaded) : loaded;
    window.carrotForestStateSnapshot = state;
    window.carrotForestHomeRecordPlaying = state.homeRecordPlaying;
    if (localReset) {
      adapter.save(state);
      params.delete("resetToday");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
    renderAll();
    if (adapter.mode === "api") {
      window.setInterval(() => void syncForestGroup(), GROUP_SYNC_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) void syncForestGroup(); });
    }
    window.ForestProfile.watch(applyAccountNickname);
    setStatus(localReset ? "오늘의 과업과 공동 진행, 보물상자 수령 상태를 초기화했습니다." : "당근의 숲이 준비되었습니다. 오늘의 퀘스트부터 시작해 보세요.");
    window.requestAnimationFrame(() => document.documentElement.classList.add("forest-script-ready"));
    // Keep one scheduler alive so a changed motion preference takes effect;
    // individual animation paths pause instead of queuing a delayed burst.
    window.requestAnimationFrame(animateWorld);
  }).catch((error) => {
    console.error(error);
    document.documentElement.classList.add("forest-script-ready");
    showForestAccessError(error);
  });
})();
