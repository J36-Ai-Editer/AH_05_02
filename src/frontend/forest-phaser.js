(() => {
  "use strict";

  if (!window.Phaser || !document.getElementById("phaser-world")) return;
  window.ForestMonsterPresence = false;

  const ATMOSPHERE_KEY = "gandang-carrot-forest-atmosphere-v1";
  const WORLD = { width: 768, height: 512 };
  // Phaser 3.90 has no game-level resolution option. Render into a denser
  // backing canvas, then compensate in the camera only: saved coordinates,
  // sprite sizes, collision geometry and movement speed remain world units.
  // The viewport, not the authored world, resizes with the window. Keep a 2x
  // backing where possible and cap its longest edge for large/fullscreen views.
  const BASE_CAMERA_ZOOM = 1; // Old 50% is the new 100%; old 200% is new 400%.
  const TEXT_RESOLUTION = 8;
  function viewportSize() {
    const host = document.getElementById("phaser-world");
    // The Phaser host is display:none until preload completes. Its frame is
    // already laid out, so boot must measure that parent rather than 768×512.
    const cssWidth = host?.clientWidth || host?.parentElement?.clientWidth || WORLD.width;
    const cssHeight = host?.clientHeight || host?.parentElement?.clientHeight || WORLD.height;
    const density = Math.min(2, 4096 / Math.max(cssWidth, cssHeight));
    return { width: Math.round(cssWidth * density), height: Math.round(cssHeight * density), density };
  }
  const AVATAR_RENDER_SCALE = 0.43;
  const HOME_RECORD_PLAYER = Object.freeze({ x: 630, y: 188 });
  const HOME_LIGHT_SOURCES = Object.freeze([
    { x: 145, y: 70, radius: 124, type: "light" },
    { x: 674, y: 144, radius: 152, type: "light" },
    { x: 156, y: 394, radius: 128, type: "light" },
  ]);
  const WORLD_FIXED_LANTERNS = Object.freeze([
    { id: "house_back", x: 192, y: 82, radius: 98, type: "light" },
    { id: "garden", x: 608, y: 342, radius: 112, type: "light" },
  ]);
  const directionRows = { down: 0, up: 1, left: 2, right: 3 };
  const encounterVectors = {
    left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1],
    down_left: [-Math.SQRT1_2, Math.SQRT1_2], down_right: [Math.SQRT1_2, Math.SQRT1_2],
    up_right: [Math.SQRT1_2, -Math.SQRT1_2], up_left: [-Math.SQRT1_2, -Math.SQRT1_2],
  };
  const animatedObjectRows = { duck_float: 0, animated_fountain: 1, firefly_lantern: 2, garden_pinwheel: 3 };
  const ambientDecorCodes = new Set(["light_tent", "lantern", "flower_cart", "flower_pot", "mushroom", "scarecrow"]);
  const interactiveObjectTypes = {
    reward_cow: "cow", campfire: "fire", lantern: "light", firefly_lantern: "light", light_tent: "light",
  };
  const storageObjectCodes = [
    "tent", "light_tent", "picnic_table", "bbq_table", "chair_green",
    "chair_red", "picnic_blanket", "pond", "lantern", "fence",
    "flower_cart", "flower_pot", "mushroom", "bench", "campfire",
    "mailbox", "scarecrow", "carrot_crate", "watering_can", "wheelbarrow",
  ];
  const storageObjectIndex = Object.fromEntries(storageObjectCodes.map((code, index) => [code, index]));
  const premiumPresets = {
    red_bow: { path: "/static/assets/carrot-forest-avatar-red_bow-normalized-v2.png", rows: 6 },
    cow_hood: { path: "/static/assets/carrot-forest-avatar-cow_hood-normalized-v2.png", rows: 5 },
    midnight: { path: "/static/assets/carrot-forest-avatar-midnight-normalized-v2.png", rows: 6 },
    blue_cap: { path: "/static/assets/carrot-forest-avatar-blue_cap-normalized-v2.png", rows: 6 },
    teal_bob: { path: "/static/assets/carrot-forest-avatar-teal_bob-normalized-v2.png", rows: 6 },
  };
  const defaultCosmetics = {
    skin: "peach", outfit: "forest", bottom: "cream", shoes: "brown", hair: "soft",
    hat: "none", glasses: "none", face: "calm", accessory: "none",
    lpcHair: "messy", lpcOutfit: "tshirt", lpcBottom: "long_pants", lpcShoes: "boots",
    lpcHat: "none", lpcGlasses: "none", expression: "bright", bodyType: "male",
    lpcFaceShape: "oval", lpcExpression: "neutral", lpcEyeStyle: "round", lpcEyebrow: "thin", lpcNose: "button", lpcMouth: "smile", lpcEyes: "none", lpcWrinkles: "none",
    hairColor: "black", outfitColor: "navy", bottomColor: "black", shoeColor: "brown", hatColor: "brown", glassesColor: "brown",
  };
  const defaultTuning = { headOffsetY: -6, outfitOffsetY: 0, glassesOffsetY: 0, worldScale: AVATAR_RENDER_SCALE };
  const hairPresetByStyle = {
    red_wave: "red_bow", cow_brown: "cow_hood", midnight: "midnight",
    blue_short: "blue_cap", teal_bob: "teal_bob",
  };
  const outfitPresetByStyle = {
    navy_garden: "red_bow", cow_vest: "cow_hood", violet: "midnight",
    blue_overalls: "blue_cap", teal_garden: "teal_bob",
  };

  function storedState() {
    return window.carrotForestStateSnapshot || {};
  }

  function normalizedAvatar(source = {}) {
    return {
      name: source.name || "세준", gender: source.gender === "male" ? "male" : "female",
      engine: source.engine === "premium" ? "premium" : "lpc",
      preset: premiumPresets[source.preset] ? source.preset : "blue_cap",
      x: Number.isFinite(source.x) ? source.x : 384, y: Number.isFinite(source.y) ? source.y : 352,
      direction: directionRows[source.direction] == null ? "down" : source.direction,
      mounted: Boolean(source.mounted), sitting: Boolean(source.sitting),
      cosmetics: { ...defaultCosmetics, ...(source.cosmetics || {}) },
      tuning: { ...defaultTuning, ...(source.tuning || {}) },
    };
  }

  class ForestScene extends Phaser.Scene {
    constructor() {
      super("forest-world");
      this.avatar = normalizedAvatar(storedState().avatar);
      this.sceneName = "world";
      this.atmosphereEnabled = localStorage.getItem(ATMOSPHERE_KEY) !== "off";
      this.lastPersist = 0;
      this.forcedDirection = null;
      this.forcedUntil = 0;
      this.mountTransitioning = false;
      this.actionPose = null;
      this.actionUntil = 0;
      this.petAction = null;
      this.petActionUntil = 0;
      this.petTrail = [];
      this.petLastSampleAt = 0;
      this.petFacing = "right";
      this.petVisualId = null;
      this.petPoseAction = "idle";
      this.petPoseElapsedMs = 0;
      this.petFeedRemainingMs = 0;
      this.petAttackRemainingMs = 0;
      this.petIdleMs = 0;
      this.ratActive = false;
      this.ratDancing = false;
      this.ratCarrotWarningAt = 0;
      this.ratNextSpawnAt = 0;
      this.ratDespawnAt = 0;
      this.ratTurnAt = 0;
      this.ratDirection = "left";
      this.ratSpecies = "mouse";
      this.rabbitVariant = null;
      this.rabbitVariantCursor = 0;
      this.rabbitBehaviorSequence = [];
      this.rabbitActionIndex = 0;
      this.rabbitActionStartedAt = 0;
      this.rabbitActionUntil = 0;
      this.rabbitDefeating = false;
      this.rabbitDefeatAction = null;
      this.rabbitDefeatStartedAt = 0;
      this.rabbitDefeatUntil = 0;
      this.ratEventId = 0;
      this.mouseCrowd = [];
      this.nextForcedSpecies = null;
      this.lastRatAttackAt = 0;
      this.lastPetAttackAt = 0;
      this.lastStepSfxAt = 0;
      this.movePath = [];
      this.pointerAttackEventId = null;
      this.nextPointerRepathAt = 0;
      this.placementActive = false;
      this.ratHoverUntil = 0;
      this.ratHovered = false;
      this.ratAttackHovered = false;
      this.ratAttackPinned = false;
      this.ratAttackPressedUntil = 0;
      this.ratAttackVisualState = "";
      this.homeLightOn = Boolean(storedState().homeLightOn);
      this.worldLanterns = { ...(storedState().worldLanterns || {}) };
      this.homeRecordPlaying = Boolean(storedState().homeRecordPlaying);
    }

    preload() {
      this.load.image("world-bg", "/static/assets/carrot-forest-world-v9.png?v=20260910-1");
      this.load.image("home-bg", "/static/assets/carrot-forest-home-v5.png?v=20260910-3");
      this.load.image("home-record-player", "/static/assets/home-record-player-cottage-v1.png?v=20260920-1");
      this.load.image(window.ForestGarden.assets.background.key, window.ForestGarden.assets.background.url);
      this.load.image(window.ForestGarden.assets.carrot.key, window.ForestGarden.assets.carrot.url);
      this.load.spritesheet("lpc-pets", "/static/assets/carrot-forest-lpc-pets-v1.png?v=20260831-1", { frameWidth: 32, frameHeight: 32 });
      // Optional source packs must never remove the bundled dog/photo fallback.
      (window.ForestPets?.assets || []).forEach(asset => this.load.spritesheet(asset.key, asset.url, {
        frameWidth: asset.frameWidth, frameHeight: asset.frameHeight,
      }));
      this.load.spritesheet("lpc-rat", "/static/assets/carrot-forest-lpc-rat-v1.png?v=20260831-1", { frameWidth: 32, frameHeight: 32 });
      window.ForestRiverDuckArt.assets.forEach(riverDuck => this.load.spritesheet(riverDuck.key, riverDuck.url, {
        frameWidth: riverDuck.frameWidth, frameHeight: riverDuck.frameHeight,
      }));
      window.ForestAnimals.assets.forEach(asset => this.load.spritesheet(asset.key, asset.url, {
        frameWidth: asset.frameWidth, frameHeight: asset.frameHeight,
      }));
      // Optional licensed packs may be absent in a source-only checkout. The
      // loaded-texture check below retains the bundled LPC rabbit in that case.
      (window.ForestAnimals.rabbitAssets || []).forEach(asset => this.load.spritesheet(asset.key, asset.url, {
        frameWidth: asset.frameWidth, frameHeight: asset.frameHeight,
      }));
      this.load.image("animated-objects-source", "/static/assets/carrot-forest-animated-objects-v3.png?v=20260910-1");
      this.load.image("storage-objects-source", "/static/assets/carrot-forest-storage-atlas-v4.png?v=20260907-1");
      window.ForestObjects.INDIVIDUAL_ASSETS.forEach(asset => this.load.image(asset.key, asset.url));
      this.load.image("campfire-base-source", "/static/assets/furniture-v153/campfire.png?v=20260907-1");
      this.load.image("reward-cow", "/static/assets/carrot-forest-reward-cow-v2.png?v=20260907-1");
    }

    create() {
      window.ForestAnimals.registerRabbitSkins?.(this);
      // Phaser's preload is the boot gate: register only the complete 24-file
      // art pack, so no scene can flash the retired multi-object atlas.
      const individualImages = window.ForestObjects.registerIndividualImages(Object.fromEntries(window.ForestObjects.INDIVIDUAL_ASSETS.map(asset => [
        asset.code, this.textures.get(asset.key).getSourceImage(),
      ])));
      const storageSource = this.textures.get("storage-objects-source").getSourceImage();
      this.textures.addSpriteSheet("storage-objects", window.ForestObjects.createStorageAtlas(storageSource), { frameWidth: 256, frameHeight: 256 });
      this.textures.addSpriteSheet("campfire-flame-atlas", window.ForestObjects.createLegacyStorageAtlas(storageSource), { frameWidth: 256, frameHeight: 256 });
      const animatedSource = this.textures.get("animated-objects-source").getSourceImage();
      this.textures.addSpriteSheet("animated-objects", window.ForestObjects.createAnimatedAtlas(animatedSource), { frameWidth: 128, frameHeight: 128 });
      this.background = this.add.image(WORLD.width / 2, WORLD.height / 2, "world-bg").setDisplaySize(WORLD.width, WORLD.height);
      this.createGardenLayer();
      this.waterRippleFx = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
      window.ForestFire.install(this, { flameAtlasKey: "campfire-flame-atlas" });
      this.placementGrid = this.add.graphics().setDepth(1).setVisible(false);
      this.placementPreview = null;
      this.placedObjectActors = [];
      this.syncPlacedObjects(storedState().placed || []);
      // One mask darkens the map AND every placed object once. Local lamps
      // erase soft holes from that same pass, revealing furniture near them.
      this.createNightMask();
      this.lightFx = this.add.graphics().setDepth(901).setBlendMode(Phaser.BlendModes.ADD);
      this.lastLightingRefresh = 0;
      this.nightStrength = 0;
      this.createHomeRecordPlayer();
      this.createMemoryCamera();
      this.player = this.add.container(this.avatar.x, this.avatar.y);
      this.motionFx = this.add.graphics().setDepth(2);
      this.player.add(this.motionFx);
      // The world renderer deliberately owns no legacy avatar textures.  The
      // official LPC engine is the single visual source for the player.
      this.presetSources = {};
      if (this.textures.exists("avatar-composite")) this.textures.remove("avatar-composite");
      this.compositeTexture = this.textures.createCanvas("avatar-composite", 224, 288);
      // LPC의 실제 발바닥은 합성 캔버스 y=250 부근이다. 그 점을 컨테이너 원점(그림자)에 맞춘다.
      this.premiumAvatar = this.add.image(0, 0, "avatar-composite").setOrigin(0.5, 0.87).setDepth(3);
      this.player.add(this.premiumAvatar);
      this.pet = this.add.sprite(this.avatar.x + 31, this.avatar.y + 10, "lpc-pets", 0).setOrigin(0.5, 1).setScale(1.2).setDepth(this.avatar.y - 1);
      this.petEmoji = this.add.text(this.avatar.x + 31, this.avatar.y + 8, "", { fontSize: "25px", resolution: TEXT_RESOLUTION }).setOrigin(0.5, 1).setDepth(this.avatar.y - 1).setVisible(false);
      this.lastPetPointerAt = 0;
      const feedPetFromPointer = (pointer, localX, localY, event) => {
        if (this.placementActive || document.hidden || this.isWorldInputBlocked()) return;
        if (!pointer.wasTouch && pointer.button !== 0) return;
        event?.stopPropagation?.();
        this.cancelPointerMovement();
        this.lastPetPointerAt = performance.now();
        window.dispatchEvent(new CustomEvent("forest-pet-clicked"));
      };
      this.pet.setInteractive({ useHandCursor: true }).on("pointerdown", feedPetFromPointer);
      this.petEmoji.setInteractive({ useHandCursor: true }).on("pointerdown", feedPetFromPointer);
      this.petHeart = this.add.text(this.avatar.x + 31, this.avatar.y - 28, "💚", { fontSize: "23px", resolution: TEXT_RESOLUTION }).setOrigin(0.5).setDepth(999).setVisible(false);
      this.petFollowX = this.avatar.x + 31;
      this.petFollowY = this.avatar.y + 10;
      this.ratActor = this.add.container(0, 0).setVisible(false);
      this.ratSprite = this.add.sprite(0, 0, "lpc-rat", 1).setOrigin(.5, 1).setScale(1.4);
      this.ratMarker = this.add.text(0, -38, "!", {
        resolution: TEXT_RESOLUTION,
        fontFamily: "Pretendard, Noto Sans KR, sans-serif", fontSize: "14px", fontStyle: "bold",
        color: "#ffffff", backgroundColor: "#d85836", padding: { x: 5, y: 1 },
      }).setOrigin(0.5);
      // All encounter species share this actor; keep their ground shadow absent.
      this.ratActor.add([this.ratSprite, this.ratMarker]);
      this.createRatAttackButton();
      // Nicknames use the same crisp DOM label layer as house/garden labels.
      this.rebuildAvatar();
      this.configureWorldCamera();
      this.keys = this.input.keyboard.addKeys("W,A,S,D,R,Q,X,E,F,J");
      this.cursors = this.input.keyboard.createCursorKeys();
      // Phaser가 Space를 가로채면 슬로건 textarea에서 띄어쓰기가 되지 않는다.
      this.input.keyboard.removeCapture([Phaser.Input.Keyboard.KeyCodes.SPACE]);
      const formFocused = () => this.memoryCapturing || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement?.tagName);
      this.input.keyboard.on("keydown-Q", () => { if (!formFocused()) window.dispatchEvent(new CustomEvent("forest-phaser-interact")); });
      this.input.keyboard.on("keydown-R", (event) => {
        if (event.repeat || formFocused()) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("forest-phaser-action", { detail: "run" }));
      });
      this.input.keyboard.on("keydown-X", (event) => {
        if (event.repeat || formFocused()) return;
        window.dispatchEvent(new CustomEvent("forest-phaser-action", { detail: "sit" }));
      });
      this.input.keyboard.on("keydown-F", (event) => {
        if (event.repeat || formFocused()) return;
        window.dispatchEvent(new CustomEvent("forest-phaser-action", { detail: "feed" }));
      });
      this.input.keyboard.on("keydown-E", (event) => {
        if (event.repeat || formFocused() || this.mountTransitioning) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("forest-phaser-action", { detail: "ride" }));
      });
      this.input.keyboard.on("keydown-J", (event) => {
        if (event.repeat || formFocused()) return;
        this.playAction("jump", 620);
      });
      this.input.keyboard.on("keydown-Z", (event) => {
        if (event.repeat || formFocused()) return;
        this.playAction("attack", this.equippedWeaponDuration());
      });
      this.input.keyboard.on("keydown-V", (event) => {
        if (event.repeat || formFocused()) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("forest-placement-confirm"));
      });
      this.events.on("shutdown", () => this.detachWindowEvents());
      this.attachWindowEvents();
      this.memoryController = window.ForestMemories ? new window.ForestMemories.Controller(this) : null;
      window.LpcAvatarEngine?.ready().then(() => this.rebuildAvatar());
      document.documentElement.classList.add("phaser-world-ready");
      this.resizeViewport();
      window.carrotForestPhaserActive = true;
      window.carrotForestPhaserMove = (direction) => this.nudge(direction);
      this.input.once("pointerdown", () => document.getElementById("phaser-world")?.focus());
      this.input.on("pointerdown", (pointer) => {
        if (this.memoryCapturing || performance.now() - (this.lastMemoryPointerAt || -Infinity) < 180) return;
        if (!pointer.wasTouch && pointer.button !== 0) return;
        if (performance.now() - this.lastPetPointerAt < 120) return;
        if (performance.now() - (this.lastDuckPointerAt ?? -Infinity) < 120) return;
        this.cancelPointerMovement();
        this.ratAttackPinned = false;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        window.dispatchEvent(new CustomEvent("forest-world-pointer", { detail: { x: point.x, y: point.y } }));
      });
      this.emitPosition(true);
    }

    cameraFocusOffsetY() {
      const worldScale = Math.min(0.58, Math.max(0.32, Number(this.avatar.tuning.worldScale) || AVATAR_RENDER_SCALE));
      // The player container is at the feet; follow the stable body center,
      // not the nameplate or the transient jump/dance offset.
      return 96 * worldScale;
    }

    configureWorldCamera() {
      const camera = this.cameras.main;
      camera.setBounds(0, 0, WORLD.width, WORLD.height);
      camera.startFollow(this.player, false, 1, 1, 0, this.cameraFocusOffsetY());
      this.cameraApi = Object.freeze({
        worldToScreen: (x, y) => this.worldToScreen(x, y),
        avatarAnchor: () => this.avatarAnchor(),
        resizeViewport: () => this.resizeViewport(),
      });
      window.ForestCamera = this.cameraApi;
      this.onCameraView = () => this.emitCameraView();
      camera.on("followupdate", this.onCameraView);
      this.cameraZoom = window.ForestHud?.zoom ?? 1;
      this.resizeViewport();
    }

    resizeViewport() {
      this.memoryController?.cancel("화면 크기가 바뀌어 촬영이 취소되었어요. 다시 찍어 주세요.");
      const size = viewportSize();
      const camera = this.cameras.main;
      this.scale?.setZoom(1 / size.density);
      if (this.scale && (camera.width !== size.width || camera.height !== size.height)) {
        // NONE + an explicit display zoom preserves Phaser's pointer inverse:
        // canvas CSS and backing have the same aspect, with no FIT letterbox.
        this.scale.resize(size.width, size.height);
        camera.setSize(size.width, size.height);
      }
      this.scale?.refresh();
      this.setCameraZoom(this.cameraZoom);
    }

    worldToScreen(x, y) {
      const camera = this.cameras.main;
      const point = camera.matrix.transformPoint(x - camera.scrollX, y - camera.scrollY);
      // Fractions of the responsive canvas CSS frame, independent of backing
      // density. DOM labels can track the map without scaling their text.
      return { x: point.x / camera.width, y: point.y / camera.height };
    }

    avatarAnchor() {
      const worldScale = Math.min(.58, Math.max(.32, Number(this.avatar.tuning.worldScale) || AVATAR_RENDER_SCALE));
      const sprite = this.premiumAvatar;
      // The 224×288 composite has a large transparent margin above the LPC
      // drawing. Anchor to its measured opaque top, not texture y=0.
      const opaqueTop = this.avatarOpaqueBounds?.top ?? 112;
      const spriteHeight = sprite?.height || 288;
      const originY = Number.isFinite(sprite?.originY) ? sprite.originY : .87;
      const scaleY = Number.isFinite(sprite?.scaleY) ? sprite.scaleY : worldScale;
      const headY = this.player.y + (sprite?.y || 0) + (opaqueTop - spriteHeight * originY) * scaleY;
      const projected = this.worldToScreen(this.player.x, headY);
      const cssHeight = this.game?.canvas?.clientHeight || document.getElementById("phaser-world")?.clientHeight || WORLD.height;
      // DOM transforms place the label's bottom at this coordinate. CSS pixels
      // keep the visible gap constant across camera zoom and responsive frames.
      return { x: projected.x, y: projected.y - 8 / cssHeight, name: this.avatar.name, scene: this.sceneName };
    }

    measureAvatarOpaqueBounds(pixels, width, height) {
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 32) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      return right < left ? null : { left, top, right, bottom };
    }

    emitCameraView() {
      const camera = this.cameras.main;
      const avatar = this.avatarAnchor();
      const key = [camera.scrollX, camera.scrollY, camera.zoom, camera.width, camera.height,
        avatar.x, avatar.y, avatar.name, avatar.scene].join(":");
      if (this.lastCameraView === key) return;
      this.lastCameraView = key;
      window.dispatchEvent(new CustomEvent("forest-camera-view", { detail: {
        scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom,
        displayZoom: this.cameraZoom, worldZoom: this.worldCameraZoom,
        viewportWidth: camera.width, viewportHeight: camera.height,
        avatar,
      } }));
    }

    setCameraZoom(value = 1) {
      const requested = Number(value);
      this.cameraZoom = Math.min(4, Math.max(1, Number.isFinite(requested) ? requested : 1));
      this.worldCameraZoom = this.cameraZoom * BASE_CAMERA_ZOOM;
      const camera = this.cameras?.main;
      if (!camera) return;
      // Uniform cover fits the available rectangle without distorting art.
      // Camera bounds crop only the surplus axis on wide or tall screens.
      const cover = Math.max(camera.width / WORLD.width, camera.height / WORLD.height);
      camera.setZoom(this.worldCameraZoom * cover);
      camera.setFollowOffset(0, this.cameraFocusOffsetY());
      camera.centerOn(this.player.x, this.player.y - this.cameraFocusOffsetY());
      // Refresh the inverse transform immediately as well as on the next
      // frame, so a click directly after +/- still resolves in world space.
      camera.preRender();
    }

    createGardenLayer() {
      const garden = window.ForestGarden;
      const source = this.textures.exists(garden.assets.carrot.key)
        ? this.textures.get(garden.assets.carrot.key).getSourceImage() : null;
      const canvas = garden.createLayerCanvas(source, { resolution: 4 });
      if (!canvas) return;
      const key = "garden-week-layer";
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
      // Shared world-space decoration sits above the empty base, below actors.
      // A dense backing keeps Korean week labels sharp at camera zoom levels.
      this.gardenLayer = this.add.image(WORLD.width / 2, WORLD.height / 2, key)
        .setDisplaySize(WORLD.width, WORLD.height).setDepth(1).setVisible(this.sceneName === "garden");
    }

    createHomeRecordPlayer() {
      const { x, y } = HOME_RECORD_PLAYER;
      const furniture = this.add.image(0, 0, "home-record-player")
        .setOrigin(.5, .5)
        .setDisplaySize(68, 90);
      const note = this.add.text(30, -52, "♪", {
        resolution: TEXT_RESOLUTION,
        fontFamily: "Pretendard, Noto Sans KR, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#f6d795", stroke: "#775332", strokeThickness: 2,
      }).setOrigin(.5).setVisible(false);
      this.recordPlayerActor = this.add.container(x, y, [furniture, note]).setDepth(y + 2).setVisible(true);
      this.recordPlayerNote = note;
      this.syncHomeRecordPlayer(this.homeRecordPlaying);
    }

    createMemoryCamera() {
      this.memoryCameraActor = null;
    }

    syncHomeRecordPlayer(playing) {
      this.homeRecordPlaying = Boolean(playing);
      this.recordPlayerNote?.setVisible(this.sceneName === "home" && this.homeRecordPlaying);
    }

    syncHomeLight(on) {
      this.homeLightOn = Boolean(on);
      this.lastNightMaskKey = null;
      this.updateWorldAtmosphere(this.time?.now ?? performance.now());
    }

    splitPinwheelPixels(pixels) {
      const base = new Uint8ClampedArray(pixels);
      const blades = new Uint8ClampedArray(pixels.length);
      // Audited against ForestObjects' normalized first pinwheel frame. The
      // stem beneath the hub and every pixel of the flower/rock base stay put.
      for (let y = 0; y < 76; y++) {
        for (let x = 0; x < 128; x++) {
          if (y >= 75 && x >= 60 && x < 68) continue;
          const offset = (y * 128 + x) * 4;
          blades.set(pixels.subarray(offset, offset + 4), offset);
          base.fill(0, offset, offset + 4);
        }
      }
      // Reuse the straight stem's own pixels behind the detached rotor. A turn
      // must not reveal a gap where a blade previously occluded the support.
      for (let y = 48; y < 75; y++) {
        for (let x = 60; x < 68; x++) {
          const from = (78 * 128 + x) * 4, to = (y * 128 + x) * 4;
          base.set(pixels.subarray(from, from + 4), to);
        }
      }
      return { base, blades };
    }

    createPinwheelTextures() {
      if (this.textures.exists("pinwheel-base") && this.textures.exists("pinwheel-blades")) return;
      const frame = this.textures.getFrame("animated-objects", animatedObjectRows.garden_pinwheel * 4);
      const tile = document.createElement("canvas");
      tile.width = tile.height = 128;
      const context = tile.getContext("2d", { willReadFrequently: true });
      context.drawImage(frame.source.image, frame.cutX, frame.cutY, 128, 128, 0, 0, 128, 128);
      const pixels = context.getImageData(0, 0, 128, 128).data;
      const individual = window.ForestObjects.individualReady;
      const layers = individual ? this.splitStaticPinwheelPixels(pixels) : this.splitPinwheelPixels(pixels);
      if (individual) layers.base = this.composePinwheelSupportPixels(layers.base, pixels);
      Object.entries(layers).forEach(([name, pixels]) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        canvas.getContext("2d").putImageData(new ImageData(pixels, 128, 128), 0, 0);
        this.textures.addImage(`pinwheel-${name}`, canvas);
      });
    }

    splitStaticPinwheelPixels(pixels) {
      const base = new Uint8ClampedArray(pixels), blades = new Uint8ClampedArray(pixels.length);
      // The v156 6px-padded tile has its gold hub at (63,44). Detach the
      // complete blades, including cream markings, dark edges and antialiasing:
      // color-only masks leave a stationary ghost of the rotor behind a turn.
      // The pole emerges diagonally from behind the lower-right blade at y68.
      // This split is lossless; hidden support is composed separately at runtime.
      for (let y = 0; y < 79; y++) for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        const hub = Math.hypot(x - 63, y - 44) <= 5;
        const exposedStem = y >= 68 && x >= 61 && x <= Math.min(66, y - 5);
        if (!pixels[i + 3] || hub || exposedStem) continue;
        blades.set(pixels.subarray(i, i + 4), i);
        base.fill(0, i, i + 4);
      }
      return { base, blades };
    }

    composePinwheelSupportPixels(base, source) {
      const output = new Uint8ClampedArray(base);
      // The source photo cannot show wood hidden by the blades. Extend the
      // original exposed pole behind the detached rotor, never edit its PNG or
      // overwrite the visible hub, pole, pot, or any source alpha outside it.
      for (let y = 44; y < 73; y++) for (let x = 61; x <= 66; x++) {
        const to = (y * 128 + x) * 4, from = (79 * 128 + x) * 4;
        if (!output[to + 3]) output.set(source.subarray(from, from + 4), to);
      }
      return output;
    }

    fountainFlowPixels(pixels, frame) {
      const output = new Uint8ClampedArray(pixels);
      if (!frame) return output;
      const phase = frame / 8 * Math.PI * 2;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4, [r, g, b, a] = pixels.subarray(i, i + 4);
        // Only cyan/blue water is eligible. Stone, moss, silhouettes, and alpha
        // are byte-for-byte static; the flow cannot shift the fountain fixture.
        if (!a || b - r <= 28 || g - r <= 18 || b < g * .92) continue;
        const flow = 1 + (Math.sin(y / 4 - phase) - Math.sin(y / 4)) * .12;
        output[i] = r * flow; output[i + 1] = g * flow; output[i + 2] = b * flow;
      }
      return output;
    }

    createFountainTextures() {
      if (this.textures.exists("fountain-flow")) return;
      const frame = this.textures.getFrame("animated-objects", animatedObjectRows.animated_fountain * 4);
      const tile = document.createElement("canvas");
      tile.width = tile.height = 128;
      const context = tile.getContext("2d", { willReadFrequently: true });
      context.drawImage(frame.source.image, frame.cutX, frame.cutY, 128, 128, 0, 0, 128, 128);
      const pixels = context.getImageData(0, 0, 128, 128).data;
      const sheet = document.createElement("canvas");
      sheet.width = 128 * 8; sheet.height = 128;
      const sheetContext = sheet.getContext("2d");
      for (let index = 0; index < 8; index++) sheetContext.putImageData(new ImageData(this.fountainFlowPixels(pixels, index), 128, 128), index * 128, 0);
      this.textures.addSpriteSheet("fountain-flow", sheet, { frameWidth: 128, frameHeight: 128 });
    }

    colorCyclePinwheelPixels(pixels, phase) {
      const output = new Uint8ClampedArray(pixels);
      const hueShift = ((phase % 5) + 5) % 5 / 5;
      if (!hueShift) return output;
      for (let y = 0; y < 76; y++) for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        // Preserve the hub, stem, outlines, highlights, shape, and all alpha.
        if (!pixels[i + 3] || Math.hypot(x - 62, y - 48) < 8 || (y >= 48 && x >= 60 && x < 68)) continue;
        const [r, g, b] = pixels.subarray(i, i + 3);
        const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b), chroma = maximum - minimum;
        if (chroma < 28 || maximum < 65) continue;
        let hue = maximum === r ? (g - b) / chroma : maximum === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
        hue = ((hue / 6 + hueShift) % 1 + 1) % 1 * 6;
        const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
        const rgb = hue < 1 ? [chroma, secondary, 0] : hue < 2 ? [secondary, chroma, 0]
          : hue < 3 ? [0, chroma, secondary] : hue < 4 ? [0, secondary, chroma]
          : hue < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
        for (let channel = 0; channel < 3; channel++) output[i + channel] = rgb[channel] + minimum;
      }
      return output;
    }

    createPlacedObjectActor(item, preview = false, placedIndex = -1) {
        let actor;
        if (item.code === "duck_float") {
          const state = window.ForestRiverDuck.createState(item);
          const pose = window.ForestRiverDuckArt.pose(state, 0);
          const body = this.add.sprite(0, 0, pose.key, pose.frame)
            .setOrigin(pose.originX, pose.originY).setScale(pose.scale).setFlipX(pose.flipX)
            .setCrop(0, 0, 96, window.ForestRiverDuckArt.WATERLINE);
          actor = this.add.container(preview ? item.x : state.x, preview ? item.y : state.y, [body]);
          actor.setData("riverDuckState", state).setData("riverDuckLastAt", null).setData("riverDuckClock", 0)
            .setData("motionTarget", body).setData("fixtureTarget", body).setData("pointerTargets", [body]);
        } else if (Object.hasOwn(animatedObjectRows, item.code)) {
          const size = item.code === "firefly_lantern" || item.code === "garden_pinwheel" ? 76 : 96;
          // The generated frames redraw rocks, plants and supports between
          // frames. Keep one fixture image; animate only a detached duck or
          // small water/light accents so the placed footprint never drifts.
          const fixture = this.add.sprite(0, 0, "animated-objects", animatedObjectRows[item.code] * 4)
            .setOrigin(0.5, 0.84)
            .setDisplaySize(size, size);
          const accents = this.add.graphics();
          actor = this.add.container(item.x, item.y, [fixture, accents]);
          actor.setData("fixtureTarget", fixture).setData("ambientFx", accents).setData("pointerTargets", [fixture]);
          if (item.code === "animated_fountain") {
            this.createFountainTextures();
            fixture.setTexture("fountain-flow", 0).setDisplaySize(size, size);
          } else if (item.code === "garden_pinwheel") {
            this.createPinwheelTextures();
            fixture.setTexture("pinwheel-base").setDisplaySize(size, size);
            const hub = window.ForestObjects?.individualReady ? { x: 63, y: 44 } : { x: 62, y: 48 };
            const blades = this.add.image((hub.x - 64) * size / 128, (hub.y - 128 * .84) * size / 128, "pinwheel-blades")
              .setOrigin(hub.x / 128, hub.y / 128).setDisplaySize(size, size);
            actor.add(blades);
            actor.setData("rotorTarget", blades).setData("rotorLastTime", null).setData("pointerTargets", [fixture, blades]);
          }
        } else if (item.code === "reward_cow") {
          const frame = window.ForestAnimals.cowFrame();
          const body = this.add.sprite(0, 0, frame.key, frame.frame)
            .setOrigin(frame.originX, frame.originY).setScale(1.25);
          // A complete transparent cow sprite has no attached grass/ground.
          actor = this.add.container(item.x, item.y, [body]);
          actor.setData("motionTarget", body).setData("pointerTargets", [body])
            .setData("cowState", window.ForestAnimals.createCowState(item)).setData("cowLastAt", null);
          actor.setData("motionOrigin", { x: 0, y: 0, scaleX: body.scaleX, scaleY: body.scaleY });
        } else if (item.code === "campfire") {
          const shadow = this.add.ellipse(0, -2, 58, 16, 0x1b241d, .34);
          const offFire = this.add.image(0, 0, "campfire-off").setOrigin(0.5, 0.9).setDisplaySize(94, 94);
          const onFire = this.add.sprite(0, 0, "campfire-ripple", 0).setOrigin(0.5, 0.9).setDisplaySize(94, 94);
          actor = this.add.container(item.x, item.y, [shadow, offFire, onFire]);
          actor.setData("fireOffTarget", offFire).setData("fireOnTarget", onFire).setData("pointerTargets", [offFire, onFire]);
        } else if (item.code === "lantern") {
          const shadow = this.add.ellipse(0, -2, 42, 12, 0x1b241d, .32);
          const lantern = this.add.sprite(0, 0, "storage-objects", storageObjectIndex.lantern)
            .setOrigin(0.5, 0.9).setDisplaySize(82, 82);
          const accents = this.add.graphics();
          actor = this.add.container(item.x, item.y, [shadow, lantern, accents]);
          actor.setData("visualTarget", lantern).setData("fixtureTarget", lantern)
            .setData("ambientFx", accents).setData("pointerTargets", [lantern]);
        } else if (Object.hasOwn(storageObjectIndex, item.code)) {
          const largeObjects = new Set(["tent", "light_tent", "picnic_table", "bbq_table", "pond", "fence", "flower_cart", "carrot_crate"]);
          const smallObjects = new Set(["chair_green", "chair_red", "lantern", "mailbox", "watering_can"]);
          const size = largeObjects.has(item.code) ? 96 : smallObjects.has(item.code) ? 70 : 82;
          const fixture = this.add.sprite(0, 0, "storage-objects", storageObjectIndex[item.code])
            .setOrigin(0.5, 0.9).setDisplaySize(size, size);
          if (ambientDecorCodes.has(item.code)) {
            const accents = this.add.graphics();
            actor = this.add.container(item.x, item.y, [fixture, accents]);
            actor.setData("fixtureTarget", fixture).setData("ambientFx", accents).setData("pointerTargets", [fixture]);
          } else {
            fixture.setPosition(item.x, item.y);
            actor = fixture;
          }
        }
        if (!actor) return null;
        const interactiveDepthBoost = interactiveObjectTypes[item.code] ? 6 : 0;
        actor.setAngle(item.code === "duck_float" ? 0 : Number(item.rotation) || 0)
          .setAlpha(preview ? .72 : 1)
          .setDepth(preview ? 998 : item.y - 2 + interactiveDepthBoost)
          .setVisible(this.sceneName === "world");
        actor.setData("item", { ...item });
        if (!preview && placedIndex >= 0) {
          // Bind input to the visible child images. Container hit areas drifted
          // after responsive scaling, so clicks on a visible flame/lamp were
          // incorrectly reported as clicks on empty ground.
          const pointerTargets = actor.getData("pointerTargets") || [actor];
          pointerTargets.forEach((target) => target.setInteractive({ useHandCursor: true,
            ...(item.code === "duck_float" ? { pixelPerfect: true, alphaTolerance: 16 } : {}),
          }).on(
            "pointerdown",
            (pointer, _localX, _localY, inputEvent) => {
              if (this.placementActive || this.memoryCapturing || this.sceneName !== "world") return;
              if (!pointer.wasTouch && pointer.button != null && pointer.button !== 0) return;
              inputEvent?.stopPropagation?.();
              this.cancelPointerMovement();
              const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
              if (item.code === "duck_float") {
                this.lastDuckPointerAt = performance.now();
                actor.setData("riverDuckState", window.ForestRiverDuck.flee(actor.getData("riverDuckState"), point, {
                  hidden: document.hidden, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
                }));
                return; // A decorative friend, never a hunt target or an on/off fixture.
              }
              window.dispatchEvent(new CustomEvent("forest-placed-object-pointer", {
                detail: { index: placedIndex, x: point.x, y: point.y,
                  ...(item.code === "reward_cow" ? { reaction: _localX < 48 ? "head" : "body" } : {}),
                },
              }));
            },
          ));
        }
        this.applyPlacedObjectState(actor, item);
        return actor;
    }

    applyPlacedObjectState(actor, item) {
      const type = interactiveObjectTypes[item.code];
      if (Object.hasOwn(animatedObjectRows, item.code)) {
        const fixture = actor.getData("fixtureTarget");
        fixture?.stop();
        if (item.code === "animated_fountain") fixture?.setFrame(0);
        else if (!["duck_float", "garden_pinwheel"].includes(item.code)) fixture?.setFrame(animatedObjectRows[item.code] * 4);
        actor.getData("ambientFx")?.clear();
      }
      if (item.code === "garden_pinwheel") actor.setData("item", { ...item }).setData("rotorLastTime", null);
      if (!type) return;
      actor.setData("interactive", true).setData("active", Boolean(item.active)).setData("item", { ...item });
      if (type === "fire") {
        actor.getData("fireOffTarget")?.setVisible(!item.active);
        actor.getData("fireOnTarget")?.setVisible(Boolean(item.active));
        const flame = actor.getData("fireOnTarget");
        if (item.active && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          flame?.play({ key: "forest-campfire-burn", startFrame: Math.abs(Math.round(item.x + item.y)) % window.ForestFire.FRAMES });
        } else flame?.stop().setFrame(0);
      }
      const motionTarget = actor.getData("motionTarget");
      this.tweens.killTweensOf(motionTarget || actor);
      actor.setPosition(item.x, item.y).setAlpha(1);
      const origin = actor.getData("motionOrigin");
      if (motionTarget) {
        motionTarget.setPosition(origin?.x ?? 0, origin?.y ?? 0);
        motionTarget.setAngle(0);
        if (origin) motionTarget.setScale(origin.scaleX, origin.scaleY);
      }
      if (type === "cow" && motionTarget) {
        const frame = window.ForestAnimals.cowPose(actor.getData("cowState"), {
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        motionTarget.setTexture(frame.key, frame.frame).setOrigin(frame.originX, frame.originY);
      }
    }

    reactCow(index, reaction = "body") {
      const actor = this.placedObjectActors[index];
      const item = actor?.getData?.("item");
      if (!actor || item?.code !== "reward_cow" || this.memoryCapturing || this.placementActive || this.sceneName !== "world") return;
      const target = actor.getData("motionTarget");
      this.tweens.killTweensOf(target);
      const origin = actor.getData("motionOrigin");
      target.setPosition(origin?.x ?? 0, origin?.y ?? 0).setAngle(0);
      if (origin) target.setScale(origin.scaleX, origin.scaleY);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const state = window.ForestAnimals.touchCowState(actor.getData("cowState"), reaction, { hidden: document.hidden, reducedMotion });
      actor.setData("cowState", state);
      const pose = window.ForestAnimals.cowPose(state, { reducedMotion });
      target.setTexture(pose.key, pose.frame).setOrigin(pose.originX, pose.originY);
    }

    syncPlacedObjects(placed = []) {
      const duckStates = new Map();
      const cowStates = new Map();
      const anchorKey = item => `${item.code}:${item.x}:${item.y}`;
      this.placedObjectActors?.forEach((actor) => {
        const item = actor.getData?.("item");
        if (item?.code === "duck_float") duckStates.set(anchorKey(item), {
          state: actor.getData("riverDuckState"), clock: actor.getData("riverDuckClock"),
        });
        if (item?.code === "reward_cow") cowStates.set(anchorKey(item), actor.getData("cowState"));
        this.tweens.killTweensOf(actor);
        this.tweens.killTweensOf(actor.getData?.("motionTarget"));
        actor.destroy();
      });
      this.placedObjectActors = placed.map((item, index) => this.createPlacedObjectActor(item, false, index)).filter(Boolean);
      this.placedObjectActors.forEach(actor => {
        const key = anchorKey(actor.getData("item"));
        const saved = duckStates.get(key);
        if (saved?.state) actor.setData("riverDuckState", saved.state).setData("riverDuckClock", saved.clock)
          .setPosition(saved.state.x, saved.state.y);
        if (cowStates.has(key)) {
          actor.setData("cowState", cowStates.get(key));
          const pose = window.ForestAnimals.cowPose(cowStates.get(key), {
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          });
          actor.getData("motionTarget").setTexture(pose.key, pose.frame).setOrigin(pose.originX, pose.originY);
        }
      });
    }

    updatePlacedObjectMotion(time) {
      if (!this.placedObjectActors?.length) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.placedObjectActors?.forEach((actor) => {
        const item = actor.getData("item");
        if (item.code === "duck_float") {
          const last = actor.getData("riverDuckLastAt");
          actor.setData("riverDuckLastAt", time);
          const hidden = document.hidden || this.sceneName !== "world" || this.placementActive || actor.visible === false;
          const delta = last == null ? 0 : Math.max(0, Math.min(50, time - last));
          const state = window.ForestRiverDuck.update(actor.getData("riverDuckState"), delta, { hidden, reducedMotion });
          const clock = (actor.getData("riverDuckClock") || 0) + (hidden || reducedMotion ? 0 : delta);
          const pose = window.ForestRiverDuckArt.pose(state, reducedMotion ? 0 : clock);
          actor.setData("riverDuckState", state).setData("riverDuckClock", clock).setPosition(state.x, state.y).setDepth(state.y - 2);
          actor.getData("motionTarget").setTexture(pose.key, pose.frame).setOrigin(pose.originX, pose.originY)
            .setFlipX(pose.flipX).setCrop(0, 0, 96, window.ForestRiverDuckArt.WATERLINE);
          return;
        }
        if (item.code === "reward_cow") {
          const last = actor.getData("cowLastAt");
          actor.setData("cowLastAt", time);
          const hidden = document.hidden || this.sceneName !== "world" || this.placementActive || actor.visible === false;
          const state = window.ForestAnimals.updateCowState(actor.getData("cowState"), last == null ? 0 : time - last, { hidden, reducedMotion });
          actor.setData("cowState", state);
          const frame = window.ForestAnimals.cowPose(state, { reducedMotion });
          actor.getData("motionTarget")?.setTexture(frame.key, frame.frame).setOrigin(frame.originX, frame.originY);
          return;
        }
        const accents = actor.getData("ambientFx");
        if (!accents) return;
        accents.clear();
        const phase = reducedMotion ? 0 : time / 1600 + item.x * .01;
        const paused = document.hidden || reducedMotion || this.sceneName !== "world" || actor.visible === false;
        if (item.code === "garden_pinwheel") {
          const rotor = actor.getData("rotorTarget");
          const lastTime = actor.getData("rotorLastTime");
          actor.setData("rotorLastTime", time);
          // Rotate only the detached geometry around the photographed hub.
          // Updating the clock while paused avoids a jump when motion resumes.
          const running = !document.hidden && !reducedMotion && item.active !== false && this.sceneName === "world" && actor.visible !== false;
          if (rotor && running && lastTime != null) rotor.setAngle((rotor.angle + Math.max(0, time - lastTime) * .04) % 360);
        }
        if (this.sceneName !== "world") return;
        if (item.code === "animated_fountain") {
          actor.getData("fixtureTarget")?.setFrame(reducedMotion ? 0 : Math.floor(time / 110) % 8);
        } else if (item.code === "firefly_lantern" && item.active) {
          [[-18, -31], [24, -42], [12, -20]].forEach(([x, y], index) => {
            const wave = reducedMotion ? 0 : Math.sin(phase + index * 1.8);
            accents.fillStyle(0xfff3a9, .28 + (wave + 1) * .09)
              .fillCircle(x + wave * .65, y + wave * .4, 1.1);
          });
        } else if (["lantern", "light_tent"].includes(item.code) && item.active) {
          const points = item.code === "lantern" ? [[0, -32], [-2, -35], [3, -34]]
            : [[-26, -45], [-13, -50], [0, -52], [14, -49], [27, -44]];
          points.forEach(([x, y], index) => {
            const glow = paused ? 0 : (Math.sin(phase * 4.2 + index * 1.7) + 1) / 2;
            accents.fillStyle(0xfff0a0, .28 + glow * .3).fillCircle(x, y, 1.3 + glow * .8);
          });
        } else if (["flower_cart", "flower_pot", "mushroom", "scarecrow"].includes(item.code)) {
          // Only pollen/spores/leaves move. The photographed pot, cart, stems,
          // scarecrow and their ground contact remain pixel-identical and fixed.
          const origins = item.code === "flower_cart" ? [[-22, -39], [7, -48], [28, -35]]
            : item.code === "flower_pot" ? [[-13, -38], [10, -43]]
              : item.code === "mushroom" ? [[-10, -31], [12, -35]] : [[-24, -42], [25, -36]];
          origins.forEach(([x, y], index) => {
            const wave = paused ? 0 : Math.sin(phase * 1.8 + index * 2.2);
            const color = item.code === "mushroom" ? 0xffe9b0 : item.code === "scarecrow" ? 0xd7a84f : 0xffd6df;
            accents.fillStyle(color, paused ? .18 : .24 + (wave + 1) * .08)
              .fillCircle(x + wave * .8, y - Math.abs(wave) * .65, 1.05);
          });
        }
      });
    }

    currentLocalHour() {
      const rawHour = new URLSearchParams(window.location.search).get("hour");
      const forced = rawHour == null ? Number.NaN : Number(rawHour);
      return Number.isFinite(forced) && forced >= 0 && forced < 24 ? forced : window.ForestAtmosphere.seoulTime().hour;
    }

    ambientStrengthForHour(hour) {
      if (hour >= 19 || hour < 5) return .78;
      if (hour < 6) return .44;
      if (hour < 7 || hour >= 18) return .22;
      return 0;
    }

    createNightMask() {
      this.nightMaskTexture = this.textures.exists("forest-night-mask")
        ? this.textures.get("forest-night-mask") : this.textures.createCanvas("forest-night-mask", WORLD.width, WORLD.height);
      this.nightOverlay = this.add.image(WORLD.width / 2, WORLD.height / 2, "forest-night-mask")
        .setDisplaySize(WORLD.width, WORLD.height).setDepth(900).setAlpha(0).setVisible(false);
      this.lastNightMaskKey = null;
    }

    localLightSources() {
      if (this.sceneName === "home") return this.homeLightOn ? HOME_LIGHT_SOURCES : [];
      const fixedLights = this.sceneName === "world"
        ? WORLD_FIXED_LANTERNS.filter(source => this.worldLanterns?.[source.id])
          .map(source => ({ x: source.x, y: source.y, radius: source.radius, type: "light" }))
        : [];
      return fixedLights.concat((this.placedObjectActors || []).flatMap(actor => {
        const item = actor.getData?.("item"), type = interactiveObjectTypes[item?.code];
        if (!item?.active || !["fire", "light"].includes(type)) return [];
        return [{ x: item.x, y: item.y - (type === "fire" ? 24 : 30), radius: type === "fire" ? 102 : 124, type }];
      }));
    }

    refreshNightMask(lights) {
      if (!this.nightMaskTexture) return;
      const key = JSON.stringify(lights);
      if (this.lastNightMaskKey === key) return;
      this.lastNightMaskKey = key;
      const context = this.nightMaskTexture.getContext();
      context.clearRect(0, 0, WORLD.width, WORLD.height);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#07172d";
      context.fillRect(0, 0, WORLD.width, WORLD.height);
      context.globalCompositeOperation = "destination-out";
      lights.forEach(({ x, y, radius }) => {
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, "rgba(0,0,0,.96)");
        gradient.addColorStop(.3, "rgba(0,0,0,.78)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      });
      context.globalCompositeOperation = "source-over";
      this.nightMaskTexture.refresh();
    }

    updateWorldAtmosphere(time) {
      if (!this.nightOverlay || !this.lightFx || !this.waterRippleFx) return;
      const worldVisible = this.sceneName === "world";
      const lightableScene = worldVisible || this.sceneName === "home";
      const targetStrength = this.atmosphereEnabled ? this.ambientStrengthForHour(this.currentLocalHour()) : 0;
      const elapsed = Math.max(0, Math.min(100, time - (this.lightingFrameAt ?? time)));
      this.lightingFrameAt = time;
      if (this.lightingTarget === undefined) this.nightStrength = targetStrength;
      this.lightingTarget = targetStrength;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.nightStrength += (targetStrength - this.nightStrength) * (reducedMotion ? 1 : 1 - Math.exp(-elapsed / 850));
      if (Math.abs(targetStrength - this.nightStrength) < .001) this.nightStrength = targetStrength;
      this.nightOverlay.setVisible(lightableScene && this.nightStrength > 0).setAlpha(this.nightStrength);
      this.waterRippleFx.clear().setVisible(worldVisible);
      this.lightFx.clear().setVisible(lightableScene);
      if (!lightableScene) return;
      const lights = this.localLightSources();
      this.refreshNightMask(lights);
      if (!worldVisible) {
        const illuminationStrength = Math.max(this.nightStrength, .28);
        lights.forEach(({ x, y, radius }) => {
          this.lightFx.fillStyle(0xfff0b6, .035 + illuminationStrength * .045).fillCircle(x, y, radius * .42);
          this.lightFx.fillStyle(0xfff7cf, .045 + illuminationStrength * .075).fillCircle(x, y, radius * .24);
        });
        return;
      }

      const ripplePhase = time / 780;
      // Keep every ripple inside the irregular pond shoreline. In particular,
      // the lower-right bank narrows sharply beside the dock.
      [[82, 382, 36], [138, 420, 46], [205, 360, 32], [218, 430, 30]].forEach(([x, y, width], index) => {
        const wave = (Math.sin(ripplePhase + index * 1.3) + 1) / 2;
        this.waterRippleFx.lineStyle(1.5, 0xb8f3ff, .16 + wave * .18)
          .strokeEllipse(x + Math.sin(ripplePhase + index) * 3, y, width + wave * 12, 7 + wave * 3);
      });

      // A soft pool of light remains visible during the day; night only makes
      // it broader and brighter. This keeps the on/off interaction readable.
      const illuminationStrength = Math.max(this.nightStrength, .32);
      lights.forEach(({ x, y, type }) => {
        const flicker = reducedMotion ? 0 : type === "fire" ? Math.sin(time / 95) * 5 : Math.sin(time / 420) * 2;
        const radius = (type === "fire" ? 46 : 58) + flicker;
        this.lightFx.fillStyle(type === "fire" ? 0xffa33a : 0xffefad, .025 + illuminationStrength * .045).fillCircle(x, y, radius * 1.5);
        this.lightFx.fillStyle(type === "fire" ? 0xffc55a : 0xfff5c8, .04 + illuminationStrength * .09).fillCircle(x, y, radius);
      });
    }

    syncPlacement(detail = {}) {
      this.placementActive = Boolean(detail.active);
      if (this.placementActive) {
        this.cancelPointerMovement();
        this.ratAttackButton?.setVisible(false);
        this.ratAttackPlate?.setVisible(false);
      }
      this.placementGrid.clear().setVisible(Boolean(detail.active) && this.sceneName === "world");
      this.placementPreview?.destroy();
      this.placementPreview = null;
      if (!detail.active || this.sceneName !== "world") return;
      (detail.cells || []).forEach((cell) => {
        const fill = cell.valid ? 0x48c978 : 0xc95d50;
        const alpha = cell.valid ? .18 : .055;
        this.placementGrid.fillStyle(fill, alpha).fillRect(cell.x - 15, cell.y - 15, 30, 30);
        this.placementGrid.lineStyle(1, fill, cell.valid ? .78 : .2).strokeRect(cell.x - 15, cell.y - 15, 30, 30);
      });
      if (detail.draft) {
        this.placementGrid.lineStyle(3, 0xffc34d, .95).strokeRect(detail.draft.x - 16, detail.draft.y - 16, 32, 32);
        this.placementPreview = this.createPlacedObjectActor(detail.draft, true);
      }
    }

    rebuildAvatar() {
      const c = this.avatar.cosmetics;
      this.setPremiumFrame(this.avatar.direction, false, 0);
      this.cameras?.main?.setFollowOffset?.(0, this.cameraFocusOffsetY());
      if (this.cameraApi) this.emitCameraView();
      const pet = c.pet;
      const petColumns = { blue_eyes_white_cat: 0, gold_eyes_orange_cat: 3, white_pup: 6 };
      const selected = Object.hasOwn(petColumns, pet) || Boolean(window.ForestPets?.definition(pet));
      this.pet?.setVisible(selected);
      this.petBaseColumn = petColumns[pet] || 0;
      this.petEmoji?.setVisible(false);
      if (pet !== this.petVisualId) {
        this.petVisualId = pet;
        this.petTrail = [];
        this.petLastSampleAt = 0;
        this.petPoseAction = this.avatar.sitting ? "sit" : "idle";
        this.petPoseElapsedMs = 0;
        this.petFeedRemainingMs = 0;
        this.petAttackRemainingMs = 0;
        this.petIdleMs = 0;
        this.petFacing = this.avatar.direction;
        this.petFollowX = this.avatar.x + 31;
        this.petFollowY = this.avatar.y + 10;
      }
      if (selected) this.renderPetPose(this.petPoseAction, this.petPoseElapsedMs, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      else this.petOverlay?.setVisible(false);
    }

    attachWindowEvents() {
      this.onCameraZoom = (event) => {
        this.memoryController?.cancel("카메라 배율을 바꾸어 촬영이 취소되었어요.");
        this.setCameraZoom(event.detail?.zoom);
      };
      window.addEventListener("forest-camera-zoom", this.onCameraZoom);
      this.onAvatar = (event) => {
        this.memoryController?.cancel("캐릭터가 바뀌어 촬영이 취소되었어요.");
        this.applyAvatarUpdate(normalizedAvatar({ ...this.avatar, ...(event.detail || {}) }));
      };
      this.onState = (event) => {
        this.memoryController?.cancel("숲 상태가 바뀌어 촬영이 취소되었어요. 다시 찍어 주세요.");
        const detail = event.detail || {};
        if (detail.avatar) {
          const nextAvatar = normalizedAvatar(detail.avatar);
          this.player.setPosition(nextAvatar.x, nextAvatar.y);
          this.applyAvatarUpdate(nextAvatar);
        }
        if (detail.scene) this.setScene(detail.scene);
        if (Array.isArray(detail.placed)) this.syncPlacedObjects(detail.placed);
        if (detail.rat?.species) this.setRatSpecies(detail.rat.species, detail.rat.variant);
        if (detail.rat?.action) this.setRabbitAction(detail.rat.action, this.time?.now ?? performance.now());
        if (typeof detail.homeLightOn === "boolean") this.syncHomeLight(detail.homeLightOn);
        if (detail.worldLanterns && typeof detail.worldLanterns === "object") {
          this.worldLanterns = { ...detail.worldLanterns };
          this.lastNightMaskKey = null;
          this.updateWorldAtmosphere(this.time?.now ?? performance.now());
        }
        if (typeof detail.homeRecordPlaying === "boolean") this.syncHomeRecordPlayer(detail.homeRecordPlaying);
      };
      window.addEventListener("forest-avatar-updated", this.onAvatar);
      window.addEventListener("forest-state-updated", this.onState);
      this.onAction = (event) => {
        const detail = event.detail || {};
        this.playAction(detail.pose || detail, Number(detail.duration) || 1100);
      };
      window.addEventListener("forest-avatar-action", this.onAction);
      this.onPetFed = event => {
        if (event.detail?.pet && event.detail.pet !== this.avatar.cosmetics?.pet) return;
        if (this.memoryCapturing || this.placementActive || document.hidden || this.isWorldInputBlocked()) return;
        this.showPetHeart();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !this.pet?.visible) return;
        this.petFeedRemainingMs = window.ForestPets?.actionDurations?.feed || 1600;
        this.petAttackRemainingMs = 0;
        this.petPoseAction = "feed";
        this.petPoseElapsedMs = 0;
        this.renderPetPose("feed", 0);
      };
      window.addEventListener("forest-pet-fed", this.onPetFed);
      this.onPlacement = (event) => {
        this.memoryController?.cancel("가구 배치를 시작해 촬영이 취소되었어요.");
        this.syncPlacement(event.detail || {});
      };
      window.addEventListener("forest-placement-updated", this.onPlacement);
      this.onAtmosphere = (event) => {
        this.memoryController?.cancel("숲 조명이 바뀌어 촬영이 취소되었어요.");
        this.atmosphereEnabled = event.detail?.enabled !== false;
        this.lastLightingRefresh = 0;
        this.updateWorldAtmosphere(performance.now());
      };
      window.addEventListener("forest-atmosphere-updated", this.onAtmosphere);
      this.onCowReaction = (event) => { if (!this.memoryCapturing) this.reactCow(Number(event.detail?.index), event.detail?.reaction); };
      window.addEventListener("forest-cow-react", this.onCowReaction);
      this.onMoveTo = (event) => {
        const point = event.detail || {};
        this.requestMoveTo(point.x, point.y);
      };
      window.addEventListener("forest-move-to", this.onMoveTo);
      this.onControlsHidden = () => {
        if (this.memoryCapturing) return;
        this.forcedDirection = null;
        this.forcedUntil = 0;
      };
      window.addEventListener("forest-controls-hidden", this.onControlsHidden);
    }

    detachWindowEvents() {
      this.memoryController?.destroy();
      this.cameras?.main?.off("followupdate", this.onCameraView);
      if (window.ForestCamera === this.cameraApi) delete window.ForestCamera;
      window.removeEventListener("forest-camera-zoom", this.onCameraZoom);
      window.removeEventListener("forest-avatar-updated", this.onAvatar);
      window.removeEventListener("forest-state-updated", this.onState);
      window.removeEventListener("forest-avatar-action", this.onAction);
      window.removeEventListener("forest-pet-fed", this.onPetFed);
      window.removeEventListener("forest-placement-updated", this.onPlacement);
      window.removeEventListener("forest-atmosphere-updated", this.onAtmosphere);
      window.removeEventListener("forest-cow-react", this.onCowReaction);
      window.removeEventListener("forest-move-to", this.onMoveTo);
      window.removeEventListener("forest-controls-hidden", this.onControlsHidden);
    }

    showPetHeart() {
      if (this.memoryCapturing) return;
      const actor = this.pet?.visible ? this.pet : this.petEmoji;
      if (!actor || !actor.visible) return;
      this.petHeart.setPosition(actor.x, actor.y - 35).setAlpha(1).setScale(0.7).setVisible(true);
      this.tweens.killTweensOf(this.petHeart);
      this.tweens.add({
        targets: this.petHeart, y: actor.y - 62, alpha: 0, scale: 1.35, duration: 1150, ease: "Back.easeOut",
        onComplete: () => this.petHeart.setVisible(false),
      });
    }

    playAction(pose, duration = 1100) {
      if (this.memoryCapturing) return;
      duration = window.LpcAvatarEngine?.actionDuration(this.avatar, pose) || duration;
      this.actionPose = pose;
      this.actionStartedAt = performance.now();
      this.actionUntil = this.actionStartedAt + duration;
      if (pose === "jump" && !this.mountTransitioning) {
        this.tweens.killTweensOf(this.premiumAvatar);
        this.premiumAvatar.setY(0);
        this.tweens.add({
          targets: this.premiumAvatar, y: -16, duration: 210, yoyo: true, ease: "Sine.easeOut",
          onComplete: () => this.premiumAvatar.setY(0),
        });
        window.dispatchEvent(new CustomEvent("forest-sfx", { detail: { name: "run-grass", volume: 0.2, rate: 1.22, minInterval: 380 } }));
      }
      if (pose === "attack") this.tryAttackRat(performance.now());
      if (pose === "attack") {
        const weapon = this.avatar.cosmetics?.lpcWeapon;
        const name = !weapon || weapon === "none" ? "sit-cloth" : weapon === "bow" ? "attack-bow" : ["wand", "cane"].includes(weapon) ? "attack-magic" : "attack-sword";
        window.dispatchEvent(new CustomEvent("forest-sfx", { detail: { name, volume: 0.34, minInterval: 280 } }));
      }
      if (pose === "dance") window.dispatchEvent(new CustomEvent("forest-sfx", { detail: { name: "dance", volume: 0.28, minInterval: 900 } }));
      if (pose === "dance") {
        this.petAction = "dance";
        this.petActionUntil = this.actionUntil;
      }
    }

    equippedWeaponDuration() {
      return {
        bow: 1280,
        wand: 980,
        cane: 860,
        dagger: 680,
        sword: 780,
      }[this.avatar.cosmetics?.lpcWeapon] || 780;
    }

    playTogether(pose, duration = 1600) {
      this.playAction(pose, duration);
      this.petAction = pose;
      this.petActionUntil = performance.now() + duration;
      window.dispatchEvent(new CustomEvent("forest-companion-action", { detail: pose }));
    }

    applyAvatarUpdate(nextAvatar) {
      if (nextAvatar.mounted !== this.avatar.mounted && this.premiumAvatar) {
        this.playMountTransition(nextAvatar);
        return;
      }
      const sittingChanged = nextAvatar.sitting !== this.avatar.sitting;
      this.avatar = nextAvatar;
      if (sittingChanged) {
        this.petAction = nextAvatar.sitting ? "sit" : "idle";
        this.petActionUntil = performance.now() + 900;
      }
      this.rebuildAvatar();
    }

    playMountTransition(nextAvatar) {
      this.mountTransitioning = true;
      this.tweens.killTweensOf(this.premiumAvatar);
      this.motionFx.clear();
      this.actionPose = "jump";
      this.actionStartedAt = performance.now();
      this.actionUntil = this.actionStartedAt + 520;
      let swapped = false;
      this.tweens.add({
        targets: this.premiumAvatar,
        y: -12,
        duration: 210,
        yoyo: true,
        ease: "Sine.easeOut",
        onUpdate: (tween) => {
          if (!swapped && tween.progress >= 0.5) {
            swapped = true;
            this.avatar = nextAvatar;
          }
          this.setPremiumFrame(this.avatar.direction, false, performance.now());
        },
        onComplete: () => {
          this.avatar = nextAvatar;
          this.actionPose = null;
          this.actionUntil = 0;
          this.premiumAvatar.setY(0);
          this.mountTransitioning = false;
          this.motionFx.clear();
          this.rebuildAvatar();
        },
      });
    }

    setScene(sceneName) {
      const nextSceneName = ["world", "home", "garden"].includes(sceneName) ? sceneName : "world";
      if (nextSceneName !== this.sceneName) {
        this.memoryController?.cancel("장소가 바뀌어 촬영이 취소되었어요.");
        this.ratHovered = false;
        this.ratAttackHovered = false;
        this.ratHoverUntil = 0;
        // Ordinary state saves also announce the current scene. Only a real
        // room change should cancel a click-to-move or click-to-attack intent.
        this.cancelPointerMovement();
        this.ratAttackPinned = false;
        this.ratAttackPressedUntil = 0;
        this.ratAttackButton?.setVisible(false);
        this.ratAttackPlate?.setVisible(false);
      }
      this.sceneName = nextSceneName;
      this.background.setTexture(`${this.sceneName}-bg`).setDisplaySize(WORLD.width, WORLD.height);
      this.gardenLayer?.setVisible(this.sceneName === "garden");
      this.recordPlayerActor?.setVisible(this.sceneName === "home");
      this.memoryCameraActor?.setVisible(this.sceneName === "world");
      this.recordPlayerNote?.setVisible(this.sceneName === "home" && this.homeRecordPlaying);
      this.ratActor?.setVisible(this.sceneName === "world" && this.ratActive);
      this.placedObjectActors?.forEach((actor) => actor.setVisible(this.sceneName === "world"));
      this.updateWorldAtmosphere(performance.now());
    }

    nudge(direction) {
      if (this.memoryCapturing) return;
      this.cancelPointerMovement();
      this.forcedDirection = directionRows[direction] == null ? null : direction;
      this.forcedUntil = performance.now() + 170;
      document.getElementById("phaser-world")?.focus();
    }

    cancelPointerMovement() {
      this.movePath = [];
      this.pointerAttackEventId = null;
    }

    isWorldInputBlocked() {
      return this.memoryCapturing || Boolean(document.querySelector?.('dialog[open], [aria-modal="true"]:not([hidden])'));
    }

    canWalkSegment(from, to) {
      const samples = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
      for (let step = 1; step <= samples; step += 1) {
        const progress = step / samples;
        if (this.isBlocked(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress)) return false;
      }
      return true;
    }

    findMovePath(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || this.isBlocked(x, y)) return [];
      const start = { x: this.avatar.x, y: this.avatar.y };
      const target = { x, y };
      if (this.canWalkSegment(start, target)) return [target];
      // A small world-space grid routes around the house, pond and garden.
      // Segment checks also prevent diagonal paths from cutting through corners.
      const step = 16;
      const nearestNode = (point) => {
        const candidates = [];
        const column = Math.round(point.x / step);
        const row = Math.round(point.y / step);
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
          const node = { x: (column + dx) * step, y: (row + dy) * step };
          if (!this.isBlocked(node.x, node.y) && this.canWalkSegment(point, node)) candidates.push(node);
        }
        return candidates.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
      };
      const first = nearestNode(start);
      const last = nearestNode(target);
      if (!first || !last) return [];
      const key = (point) => `${point.x},${point.y}`;
      const queue = [first];
      const parents = new Map([[key(first), null]]);
      let found = false;
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        if (key(current) === key(last)) { found = true; break; }
        for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const next = { x: current.x + dx, y: current.y + dy };
          if (parents.has(key(next)) || this.isBlocked(next.x, next.y) || !this.canWalkSegment(current, next)) continue;
          parents.set(key(next), current);
          queue.push(next);
        }
      }
      if (!found) return [];
      const path = [target];
      for (let current = last; current; current = parents.get(key(current))) path.unshift(current);
      // Prefer the furthest visible waypoint to avoid an unnatural grid zigzag.
      const smooth = [];
      let current = start;
      while (path.length) {
        let furthest = path.length - 1;
        while (furthest > 0 && !this.canWalkSegment(current, path[furthest])) furthest -= 1;
        current = path[furthest];
        smooth.push(current);
        path.splice(0, furthest + 1);
      }
      return smooth;
    }

    requestMoveTo(x, y) {
      this.cancelPointerMovement();
      if (this.placementActive || this.mountTransitioning || this.isWorldInputBlocked()) return false;
      const path = this.findMovePath(x, y);
      if (!path.length) return false;
      this.movePath = path;
      this.forcedUntil = 0;
      this.forcedDirection = null;
      this.avatar.sitting = false;
      this.emitPosition(true);
      document.getElementById("phaser-world")?.focus();
      return true;
    }

    createRatAttackButton() {
      this.ratAttackPlate = this.add.graphics().setDepth(1000).setVisible(false);
      this.ratAttackButton = this.add.text(0, 0, "공격  ›", {
        resolution: TEXT_RESOLUTION,
        fontFamily: "Pretendard, Noto Sans KR, sans-serif", fontSize: "14px", fontStyle: "bold",
        color: "#fff9e9", align: "center", fixedWidth: 112, fixedHeight: 38, padding: { left: 29, right: 7, top: 10, bottom: 10 },
      }).setOrigin(.5).setDepth(1001).setVisible(false).setInteractive({ useHandCursor: true });
      const keepVisible = () => { this.ratHoverUntil = performance.now() + 650; };
      const press = () => { this.ratAttackPressedUntil = performance.now() + 140; };
      this.ratSprite.setInteractive({ useHandCursor: true })
        .on("pointerover", () => { this.ratHovered = true; keepVisible(); })
        .on("pointermove", keepVisible)
        .on("pointerout", () => { this.ratHovered = false; keepVisible(); })
        .on("pointerdown", (pointer, _x, _y, event) => {
          if (this.placementActive || (!pointer.wasTouch && pointer.button !== 0)) return;
          event?.stopPropagation?.();
          keepVisible();
          press();
          // Clicking the animal and its visible button share one action.
          // A distant target is approached before the equipped attack plays.
          this.requestRatAttack();
          this.updateRatAttackButton();
        });
      this.ratAttackButton.on("pointerover", () => {
        this.ratAttackHovered = true;
        keepVisible();
        this.updateRatAttackButton();
      }).on("pointermove", keepVisible).on("pointerout", () => {
        this.ratAttackHovered = false;
        keepVisible();
        this.ratAttackPressedUntil = 0;
        this.updateRatAttackButton();
      }).on("pointerdown", (pointer, _x, _y, event) => {
        if (!pointer.wasTouch && pointer.button !== 0) return;
        event?.stopPropagation?.();
        press();
        this.requestRatAttack();
        this.updateRatAttackButton();
      }).on("pointerup", () => {
        this.ratAttackPressedUntil = 0;
        this.updateRatAttackButton();
      });
    }

    updateRatAttackButton() {
      if (!this.ratAttackButton) return;
      const visible = this.sceneName === "world" && this.ratActive && !this.placementActive && !this.isWorldInputBlocked()
        && (this.ratHovered || this.ratAttackHovered || this.ratAttackPinned || this.pointerAttackEventId != null || performance.now() < this.ratHoverUntil);
      this.ratAttackButton.setVisible(visible);
      this.ratAttackPlate.setVisible(visible);
      if (!visible) return;
      const approaching = this.pointerAttackEventId === this.ratEventId;
      const pressed = performance.now() < this.ratAttackPressedUntil;
      const highlighted = this.ratAttackHovered || approaching;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const visualState = `${approaching}:${pressed}:${highlighted}:${reducedMotion}`;
      if (visualState !== this.ratAttackVisualState) {
        this.ratAttackVisualState = visualState;
        this.ratAttackButton.setText(approaching ? "접근 중…" : "공격  ›");
        // Only the painted face lifts/depresses; the text and its hit area stay still.
        const faceY = reducedMotion ? 0 : pressed ? 2 : highlighted ? -1 : 0;
        const faceColor = approaching ? (pressed ? 0x386849 : 0x4b8259)
          : pressed ? 0xc64e2d : highlighted ? 0xf47b36 : 0xde622e;
        const plate = this.ratAttackPlate.clear();
        if (highlighted) plate.fillStyle(0xffdc84, .22).fillRoundedRect(-61, -24, 122, 51, 16);
        plate.fillStyle(0x253b2c, .24).fillRoundedRect(-57, -14, 114, 40, 13);
        plate.fillStyle(approaching ? 0x274331 : 0x803821, 1).fillRoundedRect(-56, -15, 112, 38, 12);
        plate.fillStyle(0xffe4a7, 1).fillTriangle(-6, 19, 6, 19, 0, 28);
        plate.fillStyle(faceColor, 1).fillRoundedRect(-56, -19 + faceY, 112, 38, 12);
        plate.fillStyle(0xffffff, pressed ? .07 : .16).fillRoundedRect(-51, -15 + faceY, 102, 13, 7);
        plate.lineStyle(highlighted ? 2.5 : 1.5, highlighted ? 0xfff4ce : 0xffd58b, 1).strokeRoundedRect(-56, -19 + faceY, 112, 38, 12);
        // A code-drawn sword stays crisp and consistent across emoji/font platforms.
        const swordPart = (points, color) => plate.fillStyle(color, 1).fillPoints(points.map(([x, y]) => ({ x, y: y + faceY })), true);
        swordPart([[-43, 10], [-46, 7], [-40, 1], [-37, 4]], 0xffd58b);
        swordPart([[-40, 2], [-29, -9], [-24, -11], [-26, -6], [-37, 5]], 0xfffbeb);
        swordPart([[-44, -1], [-35, 8], [-33, 6], [-42, -3]], 0xffd58b);
      }
      let x = Math.max(60, Math.min(WORLD.width - 60, this.ratActor.x));
      let y = Math.max(24, this.ratActor.y - 72);
      let buttonScale = 1;
      const camera = this.cameras?.main;
      if (camera && typeof camera.getWorldPoint === "function" && Number.isFinite(camera.width) && camera.width > 0
        && Number.isFinite(camera.height) && camera.height > 0) {
        const viewportX = camera.x || 0, viewportY = camera.y || 0;
        const topLeft = camera.getWorldPoint(viewportX, viewportY);
        const bottomRight = camera.getWorldPoint(viewportX + camera.width, viewportY + camera.height);
        const viewWidth = bottomRight?.x - topLeft?.x, viewHeight = bottomRight?.y - topLeft?.y;
        if ([topLeft?.x, topLeft?.y, bottomRight?.x, bottomRight?.y, viewWidth, viewHeight].every(Number.isFinite)
          && viewWidth > 0 && viewHeight > 0) {
          // Include the halo/pointer plus one follow frame (at most 7.4 world units).
          const margin = Math.min(12, viewWidth / 4, viewHeight / 4);
          buttonScale = Math.min(1, (viewWidth - margin * 2) / 122, (viewHeight - margin * 2) / 52);
          x = Math.max(topLeft.x + margin + 61 * buttonScale, Math.min(bottomRight.x - margin - 61 * buttonScale, this.ratActor.x));
          y = Math.max(topLeft.y + margin + 24 * buttonScale, Math.min(bottomRight.y - margin - 28 * buttonScale, this.ratActor.y - 72));
        }
      }
      this.ratAttackButton.setScale(buttonScale).setPosition(x, y);
      this.ratAttackPlate.setScale(buttonScale).setPosition(x, y);
    }

    requestRatAttack() {
      if (this.sceneName !== "world" || !this.ratActive || this.placementActive || this.mountTransitioning || this.isWorldInputBlocked()) return;
      this.cancelPointerMovement();
      this.forcedUntil = 0;
      this.forcedDirection = null;
      this.pointerAttackEventId = this.ratEventId;
      this.nextPointerRepathAt = 0;
      this.ratAttackPinned = true;
      this.avatar.sitting = false;
      this.emitPosition(true);
      document.getElementById("phaser-world")?.focus();
    }

    pointerMovementStep(distance, time) {
      if (this.pointerAttackEventId != null) {
        if (this.sceneName !== "world" || !this.ratActive || this.pointerAttackEventId !== this.ratEventId) {
          this.cancelPointerMovement();
          return null;
        }
        const dx = this.ratActor.x - this.avatar.x;
        const dy = this.ratActor.y - this.avatar.y;
        if (Math.hypot(dx, dy) <= 68) {
          this.avatar.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
          this.emitPosition(true);
          this.cancelPointerMovement();
          this.playAction("attack", this.equippedWeaponDuration());
          return null;
        }
        if (time >= this.nextPointerRepathAt) {
          this.movePath = this.findMovePath(this.ratActor.x, this.ratActor.y);
          this.nextPointerRepathAt = time + 300;
        }
      }
      while (this.movePath?.length) {
        const target = this.movePath[0];
        const dx = target.x - this.avatar.x;
        const dy = target.y - this.avatar.y;
        const remaining = Math.hypot(dx, dy);
        if (remaining < .0001) {
          this.movePath.shift();
          // Ordinary movement updates are throttled. Always persist the final
          // exact destination, even when arrival falls between two updates.
          if (!this.movePath.length && this.pointerAttackEventId == null) this.emitPosition(true);
          continue;
        }
        const ratio = Math.min(1, distance / remaining);
        return {
          x: this.avatar.x + dx * ratio, y: this.avatar.y + dy * ratio,
          direction: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down"),
        };
      }
      return null;
    }

    isBlocked(x, y) {
      if (x < 28 || x > WORLD.width - 28 || y < 42 || y > WORLD.height - 32) return true;
      if (this.sceneName === "home") return x < 64 || x > 710 || y < 100 || y > 458;
      if (this.sceneName === "garden") return x < 105 || x > 675 || y < 105 || y > 458;
      const camera = window.ForestMemories?.CAMERA;
      if (camera && Math.abs(x - camera.x) < 20 && y > camera.y - 15 && y < camera.y + 8) return true;
      return (x > 45 && x < 335 && y > 55 && y < 275) || (x > 465 && x < 735 && y > 45 && y < 255) || (x > 35 && x < 270 && y > 300 && y < 475);
    }

    emitPosition(force = false) {
      if (this.memoryCapturing) return;
      const now = performance.now();
      if (!force && now - this.lastPersist < 180) return;
      this.lastPersist = now;
      window.dispatchEvent(new CustomEvent("forest-phaser-position", { detail: { x: this.avatar.x, y: this.avatar.y, direction: this.avatar.direction, sitting: this.avatar.sitting } }));
    }

    update(time, delta) {
      // The portrait owns animation while shooting. Encounters, auto-hunting,
      // movement, rewards and persistence must never run behind its dialog.
      if (this.memoryCapturing) { this.memoryController?.update(); return; }
      if (this.mountTransitioning) return;
      if (this.sceneName === "home" && this.homeRecordPlaying) {
        this.recordPlayerNote?.setY(-52 + Math.sin(time / 420) * 2).setAlpha(.8 + Math.sin(time / 420) * .15);
      }
      this.updateWorldAtmosphere(time);
      this.updatePlacedObjectMotion(time);
      this.updateRat(time, delta);
      this.updateRatAttackButton?.();
      const modalOpen = this.isWorldInputBlocked?.() === true;
      if (modalOpen) {
        if (this.movePath?.length || this.pointerAttackEventId != null) this.emitPosition(true);
        this.cancelPointerMovement?.();
        this.forcedUntil = 0;
        this.forcedDirection = null;
      }
      const inputAllowed = !modalOpen && !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName);
      let direction = performance.now() < this.forcedUntil ? this.forcedDirection : null;
      if (inputAllowed) {
        if (this.cursors.left.isDown || this.keys.A.isDown) direction = "left";
        else if (this.cursors.right.isDown || this.keys.D.isDown) direction = "right";
        else if (this.cursors.up.isDown || this.keys.W.isDown) direction = "up";
        else if (this.cursors.down.isDown || this.keys.S.isDown) direction = "down";
      }
      const running = window.carrotForestRunning === true;
      const speed = this.avatar.mounted ? 185 : running ? 150 : 92;
      const distance = speed * Math.min(delta, 40) / 1000;
      if (direction) this.cancelPointerMovement?.();
      const pointerStep = !direction && inputAllowed && !this.placementActive ? this.pointerMovementStep?.(distance, time) : null;
      if (pointerStep) direction = pointerStep.direction;
      if (!direction) {
        this.setPremiumFrame(this.avatar.direction, false, time);
        this.updatePet(time, delta, false);
        return;
      }
      const vector = { left: [-distance, 0], right: [distance, 0], up: [0, -distance], down: [0, distance] }[direction];
      const nextX = pointerStep ? pointerStep.x : this.avatar.x + vector[0];
      const nextY = pointerStep ? pointerStep.y : this.avatar.y + vector[1];
      this.avatar.direction = direction;
      if (!this.isBlocked(nextX, nextY)) {
        this.avatar.x = nextX; this.avatar.y = nextY;
        this.player.setPosition(nextX, nextY).setDepth(nextY);
        const stepInterval = running ? 190 : 310;
        if (!this.avatar.mounted && time - this.lastStepSfxAt >= stepInterval) {
          this.lastStepSfxAt = time;
          window.dispatchEvent(new CustomEvent("forest-sfx", {
            detail: { name: running ? "run-grass" : "step-grass", volume: running ? 0.19 : 0.15, minInterval: stepInterval - 20 },
          }));
        }
      }
      this.setPremiumFrame(direction, true, time, running);
      this.updatePet(time, delta, true);
      this.emitPosition();
    }

    addMouseCrowdReplica(time) {
      if (!this.add?.container || !this.add?.sprite || !this.ratActor) return;
      const actor = this.add.container(this.ratActor.x, this.ratActor.y).setDepth(this.ratActor.y - 3);
      const sprite = this.add.sprite(0, 0, "lpc-rat", 1).setOrigin(.5, 1).setScale(1.4);
      actor.add(sprite);
      this.mouseCrowd.push({ actor, sprite, bornAt: time });
      while (this.mouseCrowd.length > 7) this.mouseCrowd.shift()?.actor?.destroy?.();
    }

    updateMouseCrowd(time) {
      const visible = this.sceneName === "world" && !this.memoryCapturing;
      for (const mouse of this.mouseCrowd) {
        mouse.actor?.setVisible(visible);
        mouse.sprite?.setFrame(1 + Math.floor((time - mouse.bornAt) / 260) % 2);
      }
    }

    spawnRat(time, forcedSpecies = null) {
      const spawnPoints = [
        [374, 286], [420, 420], [540, 330], [650, 365], [690, 445], [355, 470],
      ];
      const candidates = spawnPoints.filter(([x, y]) => Phaser.Math.Distance.Between(x, y, this.avatar.x, this.avatar.y) > 110);
      const [x, y] = Phaser.Utils.Array.GetRandom(candidates.length ? candidates : spawnPoints);
      this.ratEventId += 1;
      this.ratActive = true;
      this.ratDancing = false;
      this.ratCarrotWarningAt = 0;
      this.rabbitDefeating = false;
      this.rabbitDefeatAction = null;
      this.ratDespawnAt = Infinity;
      this.ratTurnAt = time + Phaser.Math.Between(900, 1800);
      this.ratDirection = Phaser.Utils.Array.GetRandom(["left", "right", "up", "down"]);
      this.setRatSpecies(forcedSpecies || Phaser.Utils.Array.GetRandom(["mouse", "rabbit"]), null, time);
      this.ratDespawnAt = time + (this.ratSpecies === "rabbit"
        ? Phaser.Math.Between(15000, 23000)
        : Phaser.Math.Between(12000, 18000));
      this.ratActor.setPosition(x, y).setDepth(y - 2).setAlpha(1).setScale(1).setVisible(true);
      const variant = window.ForestAnimals.rabbitVariants?.find(item => item.id === this.rabbitVariant);
      window.dispatchEvent(new CustomEvent("forest-rat-appeared", { detail: {
        eventId: this.ratEventId, species: this.ratSpecies, variant: variant?.id, variantLabel: variant?.label,
      } }));
      window.ForestMonsterPresence = true;
      window.dispatchEvent(new CustomEvent("forest-monster-presence", { detail: { active: true } }));
    }

    setRatSpecies(species, variantId = null, time = this.time?.now ?? performance.now()) {
      this.ratSpecies = species === "rabbit" ? "rabbit" : "mouse";
      this.rabbitVariant = null;
      this.rabbitBehaviorSequence = [];
      this.rabbitActionIndex = 0;
      this.rabbitActionStartedAt = time;
      this.rabbitActionUntil = time;
      if (!this.ratSprite) return;
      this.ratSprite.setFlipX?.(false);
      if (this.ratSpecies === "rabbit") {
        const animals = window.ForestAnimals;
        const available = (animals.rabbitVariants || []).filter(variant => this.textures?.exists(variant.key));
        const requested = available.find(variant => variant.id === variantId);
        const variant = requested || available[this.rabbitVariantCursor % available.length];
        if (variant && typeof animals.rabbitAction === "function" && typeof animals.rabbitPose === "function") {
          const roamingNames = variant.roamingActions || variant.actions.filter(name =>
            /^(idle|jump_up|pose_(down|up|left|right|down_left|down_right|up_right|up_left))$/.test(name)
            || name.startsWith("hop_") || name.startsWith("jump_forward") || name.startsWith("jump_front") || name.startsWith("jump_back"));
          const sequence = roamingNames.map(action => animals.rabbitAction(variant.id, action))
            .filter(action => action && Number.isFinite(action.durationMs) && action.durationMs > 0);
          if (sequence.length) {
            this.rabbitVariant = variant.id;
            this.rabbitBehaviorSequence = sequence;
            if (!requested) this.rabbitVariantCursor += 1;
            this.setRabbitAction(sequence[0].name, time);
          }
        }
        if (!this.rabbitVariant) {
          const frame = animals.rabbitFrame(this.ratDirection, false, 0);
          this.ratSprite.setTexture(frame.key, frame.frame).setOrigin(frame.originX, frame.originY).setScale(1.35);
        }
      } else this.ratSprite.setTexture("lpc-rat", 1).setOrigin(.5, 1).setScale(1.4);
      if (!this.rabbitVariant && !Object.hasOwn(directionRows, this.ratDirection)) this.ratDirection = "down";
      // The same sprite keeps its hover/click listeners across 32px and 72px
      // sheets; resize only the default rectangular hit area with the texture.
      const hitArea = this.ratSprite.input?.hitArea;
      if (hitArea && "width" in hitArea && Number.isFinite(this.ratSprite.width)) {
        hitArea.width = this.ratSprite.width;
        hitArea.height = this.ratSprite.height;
      }
    }

    setRabbitAction(name, time = this.time?.now ?? performance.now()) {
      if (!this.rabbitVariant) return false;
      const index = this.rabbitBehaviorSequence.findIndex(action => action.name === name);
      if (index < 0) return false;
      this.rabbitActionIndex = index;
      this.rabbitActionStartedAt = time;
      this.rabbitActionUntil = time + this.rabbitBehaviorSequence[index].durationMs;
      const direction = this.rabbitBehaviorSequence[index].direction;
      if (Object.hasOwn(encounterVectors, direction)) this.ratDirection = direction;
      this.renderRabbitPose(time, true);
      return true;
    }

    advanceRabbitBehavior(time) {
      if (!this.rabbitVariant || !this.rabbitBehaviorSequence.length) return null;
      // Only the source's locomotion/standing actions get ambient turns.
      // Defeat and sleep clips are reserved for a successful attack.
      // Absolute clip boundaries make the sequence frame-rate safe.
      while (time >= this.rabbitActionUntil) {
        this.rabbitActionStartedAt = this.rabbitActionUntil;
        this.rabbitActionIndex = (this.rabbitActionIndex + 1) % this.rabbitBehaviorSequence.length;
        this.rabbitActionUntil += this.rabbitBehaviorSequence[this.rabbitActionIndex].durationMs;
      }
      return this.rabbitBehaviorSequence[this.rabbitActionIndex];
    }

    renderRabbitPose(time, moving) {
      const active = this.rabbitBehaviorSequence[this.rabbitActionIndex];
      if (!this.rabbitVariant || !active) return;
      // A blocked walking/jumping animal holds a still pose, never skating
      // against a wall. Non-travelling source actions always play in place.
      const still = active.moves && !moving ? this.rabbitBehaviorSequence.filter(action => !action.moves) : [];
      const resting = still.find(action => action.direction === this.ratDirection && /idle|stand|^pose_/i.test(action.name))
        || still.find(action => /idle|stand|^pose_/i.test(action.name)) || still[0];
      const pose = window.ForestAnimals.rabbitPose(this.rabbitVariant, {
        action: resting?.name || active.name, direction: this.ratDirection,
        elapsedMs: resting ? 0 : Math.max(0, time - this.rabbitActionStartedAt),
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      this.ratSprite.setTexture(pose.key, pose.frame).setOrigin(pose.originX, pose.originY).setScale(pose.scale);
      this.ratSprite.setFlipX?.(Boolean(pose.flipX));
    }

    renderRabbitDefeat(time) {
      if (!this.rabbitVariant || !this.rabbitDefeatAction) return false;
      const pose = window.ForestAnimals.rabbitPose(this.rabbitVariant, {
        action: this.rabbitDefeatAction.name,
        direction: this.ratDirection,
        elapsedMs: Math.max(0, time - this.rabbitDefeatStartedAt),
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      if (!pose) return false;
      this.ratSprite.setTexture(pose.key, pose.frame).setOrigin(pose.originX, pose.originY).setScale(pose.scale);
      this.ratSprite.setFlipX?.(Boolean(pose.flipX));
      return true;
    }

    finishRabbitDefeat() {
      if (!this.rabbitDefeating) return;
      this.rabbitDefeating = false;
      this.rabbitDefeatAction = null;
      this.tweens.add({
        targets: this.ratActor, alpha: 0, duration: 180,
        onComplete: () => this.ratActor.setVisible(false).setAlpha(1).setScale(1),
      });
    }

    dismissRat(time, caught = false) {
      if (!this.ratActive) return;
      this.ratActive = false;
      this.ratDancing = false;
      this.ratCarrotWarningAt = 0;
      this.ratAttackPinned = false;
      this.ratHovered = false;
      this.ratAttackHovered = false;
      this.ratHoverUntil = 0;
      this.ratAttackPressedUntil = 0;
      this.ratAttackButton?.setVisible(false);
      this.ratAttackPlate?.setVisible(false);
      if (this.pointerAttackEventId != null) this.cancelPointerMovement();
      this.ratNextSpawnAt = time + Phaser.Math.Between(12000, 22000);
      window.ForestMonsterPresence = this.mouseCrowd.length > 0 && this.ratSpecies === "mouse";
      window.dispatchEvent(new CustomEvent("forest-monster-presence", {
        detail: { active: window.ForestMonsterPresence },
      }));
      if (!caught) {
        this.rabbitDefeating = false;
        this.rabbitDefeatAction = null;
        this.ratActor.setVisible(false);
        return;
      }
      const x = this.ratActor.x;
      const y = this.ratActor.y;
      if (this.ratSpecies === "rabbit") {
        const defeat = window.ForestAnimals.rabbitDefeatAction?.(this.rabbitVariant)
          || this.rabbitBehaviorSequence.find(action => /sleep|flat|head_lower/i.test(action.name));
        if (defeat && this.rabbitVariant) {
          this.rabbitDefeating = true;
          this.rabbitDefeatAction = defeat;
          this.rabbitDefeatStartedAt = time;
          this.rabbitDefeatUntil = time + Math.max(520, Math.min(defeat.durationMs, 1100));
          this.renderRabbitDefeat(time);
        } else {
          this.tweens.add({
            targets: this.ratActor, alpha: 0, duration: 180,
            onComplete: () => this.ratActor.setVisible(false).setAlpha(1).setScale(1),
          });
        }
        const rewardText = this.add.text(x, y - 30, "+1 🥕", {
          resolution: TEXT_RESOLUTION,
          fontFamily: "Pretendard, Noto Sans KR, sans-serif", fontSize: "14px", fontStyle: "bold",
          color: "#fff7bd", stroke: "#5c3511", strokeThickness: 4,
        }).setOrigin(0.5).setDepth(999);
        this.tweens.add({
          targets: rewardText, y: y - 58, alpha: 0, duration: 850,
          onComplete: () => rewardText.destroy(),
        });
      } else {
        this.tweens.add({
          targets: this.ratActor, alpha: 0, duration: 180,
          onComplete: () => this.ratActor.setVisible(false).setAlpha(1).setScale(1),
        });
      }
    }

    tryAttackRat(time) {
      if (this.memoryCapturing) return;
      if (this.sceneName !== "world" || !this.ratActive || time - this.lastRatAttackAt < 320) return;
      this.lastRatAttackAt = time;
      const dx = this.ratActor.x - this.avatar.x;
      const dy = this.ratActor.y - this.avatar.y;
      const distance = Math.hypot(dx, dy);
      const facing = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[this.avatar.direction] || [0, 1];
      const facingScore = distance ? (dx * facing[0] + dy * facing[1]) / distance : 1;
      if (distance > 76 || facingScore < -0.1) return;
      const eventId = this.ratEventId;
      this.dismissRat(time, true);
      window.dispatchEvent(new CustomEvent("forest-rat-caught", { detail: { eventId, amount: this.ratSpecies === "rabbit" ? 1 : 0, species: this.ratSpecies } }));
    }

    updateRat(time, delta) {
      if (this.memoryCapturing) return;
      this.updateMouseCrowd(time);
      if (this.sceneName !== "world") {
        this.ratActor?.setVisible(false);
        return;
      }
      if (this.rabbitDefeating) {
        this.ratActor.setVisible(true);
        this.renderRabbitDefeat(time);
        if (time >= this.rabbitDefeatUntil) this.finishRabbitDefeat();
        return;
      }
      if (!this.ratActive) {
        if (!this.ratNextSpawnAt) this.ratNextSpawnAt = time + Phaser.Math.Between(3500, 7000);
        if (time >= this.ratNextSpawnAt) {
          const forcedSpecies = this.nextForcedSpecies;
          this.nextForcedSpecies = null;
          this.spawnRat(time, forcedSpecies);
        }
        return;
      }
      if (time >= this.ratDespawnAt) {
        if (this.ratSpecies === "rabbit") {
          const available = (window.ForestAnimals.rabbitVariants || [])
            .filter(variant => this.textures?.exists(variant.key));
          const expiredIndex = available.findIndex(variant => variant.id === this.rabbitVariant);
          if (expiredIndex >= 0 && available.length > 1) {
            this.rabbitVariantCursor = expiredIndex + 1;
          }
          this.nextForcedSpecies = "rabbit";
          this.dismissRat(time, false);
          this.ratNextSpawnAt = time + Phaser.Math.Between(2200, 4200);
        }
        else {
          this.ratDancing = true;
          this.ratDirection = "down";
          this.ratDespawnAt = Infinity;
          this.ratAttackPinned = true;
          this.ratHoverUntil = time + 1800;
          window.dispatchEvent(new CustomEvent("forest-rat-carrot-warning", { detail: { eventId: this.ratEventId } }));
          this.ratCarrotWarningAt = time + 5600;
        }
        return;
      }
      this.ratActor.setVisible(true);
      if (this.ratDancing && time >= this.ratCarrotWarningAt) {
        window.dispatchEvent(new CustomEvent("forest-rat-carrot-warning", { detail: { eventId: this.ratEventId } }));
        this.ratCarrotWarningAt = time + 5600;
      }
      const rabbitAction = this.advanceRabbitBehavior(time);
      const wantsMove = !this.ratDancing && (!rabbitAction || rabbitAction.moves);
      const fixedDirection = Object.hasOwn(encounterVectors, rabbitAction?.direction) ? rabbitAction.direction : null;
      if (fixedDirection) this.ratDirection = fixedDirection;
      if (wantsMove && !fixedDirection && time >= this.ratTurnAt) {
        this.ratDirection = Phaser.Utils.Array.GetRandom(["left", "right", "up", "down"]);
        this.ratTurnAt = time + Phaser.Math.Between(700, 1600);
      }
      const speed = 23 * Math.min(delta, 40) / 1000;
      const vector = encounterVectors[this.ratDirection] || encounterVectors.down;
      const nextX = this.ratActor.x + vector[0] * speed;
      const nextY = this.ratActor.y + vector[1] * speed;
      const moving = wantsMove && !this.isBlocked(nextX, nextY);
      if (wantsMove && !moving) {
        if (!fixedDirection) this.ratDirection = Phaser.Utils.Array.GetRandom(["left", "right", "up", "down"]);
        this.ratTurnAt = time + 500;
      } else if (moving) {
        this.ratActor.setPosition(nextX, nextY).setDepth(nextY - 2);
      }
      if (this.ratSpecies === "rabbit") {
        if (this.rabbitVariant) this.renderRabbitPose(time, moving);
        else {
          const frame = window.ForestAnimals.rabbitFrame(this.ratDirection, moving, time, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
          this.ratSprite.setTexture(frame.key, frame.frame).setOrigin(frame.originX, frame.originY);
        }
      } else {
        if (this.ratDancing) this.ratSprite.setFrame([0, 1, 2, 1][Math.floor(time / 180) % 4]);
        else {
          const directionRow = { down: 0, left: 1, right: 2, up: 3 }[this.ratDirection] || 0;
          this.ratSprite.setFrame(directionRow * 3 + (moving ? Math.floor(time / 145) % 3 : 1));
        }
      }
    }

    renderPetPose(action, elapsedMs, reducedMotion = false) {
      if (!this.pet?.visible) { this.petOverlay?.setVisible(false); return; }
      const id = this.avatar.cosmetics?.pet;
      const definition = window.ForestPets?.definition(id);
      let pose = definition ? window.ForestPets.pose(id, {
        action, direction: this.petFacing, elapsed: elapsedMs, idleMs: this.petIdleMs,
        equipment: this.avatar.cosmetics?.petAccessory, reducedMotion,
      }) : null;
      const authored = Boolean(pose && this.textures?.exists(pose.key)
        && (!pose.overlay || this.textures.exists(pose.overlay.key)));
      if (!authored) {
        const row = { down: 0, left: 1, right: 2, up: 3 }[this.petFacing] || 0;
        const column = definition?.fallbackColumn ?? (id === "white_pup" ? 6 : ["gold_eyes_orange_cat", "last_tick_ginger"].includes(id) ? 3 : this.petBaseColumn || 0);
        pose = { key: "lpc-pets", frame: row * 9 + column + (action === "walk" && !reducedMotion ? Math.floor(elapsedMs / 105) % 3 : 1),
          originX: .5, originY: 1, scale: 1.2, flipX: false };
      }
      this.petSourceAction = authored ? pose.action || action : action === "walk" ? "walk" : "idle";
      const apply = (actor, frame) => {
        actor.setTexture(frame.key, frame.frame).setOrigin(frame.originX ?? pose.originX ?? .5, frame.originY ?? pose.originY ?? 1)
          .setScale(frame.scale ?? pose.scale ?? 1.2).setFlipX(Boolean(frame.flipX ?? pose.flipX)).setAngle(0)
          .setPosition(this.petFollowX, this.petFollowY).setDepth(this.petFollowY - 1);
      };
      apply(this.pet, pose);
      if (pose.overlay) {
        this.petOverlay ||= this.add.sprite(this.petFollowX, this.petFollowY, pose.overlay.key, pose.overlay.frame);
        apply(this.petOverlay, pose.overlay);
        this.petOverlay.setDepth(this.petFollowY - .9).setVisible(true);
      } else this.petOverlay?.setVisible(false);
    }

    updatePet(time, delta, playerMoving) {
      if (this.memoryCapturing || document.hidden || this.placementActive || this.isWorldInputBlocked()) return;
      if ((!this.pet || !this.pet.visible) && (!this.petEmoji || !this.petEmoji.visible)) return;
      const stepMs = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 50)) : 0;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) { this.petFeedRemainingMs = 0; this.petAttackRemainingMs = 0; }
      const feeding = this.petFeedRemainingMs > 0;
      const attacking = this.petAttackRemainingMs > 0;
      const togetherSitting = Boolean(this.avatar.sitting);
      if (!this.petTrail.length) {
        this.petTrail.push({ x: this.avatar.x, y: this.avatar.y, direction: this.avatar.direction, time });
      }
      if (playerMoving && time - this.petLastSampleAt >= 42) {
        this.petTrail.push({ x: this.avatar.x, y: this.avatar.y, direction: this.avatar.direction, time });
        this.petLastSampleAt = time;
        while (this.petTrail.length > 28 || (this.petTrail[1] && time - this.petTrail[1].time > 1600)) this.petTrail.shift();
      }
      const directionOffset = {
        left: [32, 8], right: [-32, 8], up: [27, 18], down: [-29, 9],
      }[this.avatar.direction] || [-29, 9];
      const delayed = playerMoving
        ? [...this.petTrail].reverse().find((point) => point.time <= time - 330)
        : null;
      const petActor = this.pet?.visible ? this.pet : this.petEmoji;
      const ratDistanceFromPlayer = this.ratActive ? Phaser.Math.Distance.Between(this.ratActor.x, this.ratActor.y, this.avatar.x, this.avatar.y) : Infinity;
      const autoHunting = stepMs > 0 && !feeding && !attacking && !togetherSitting && this.sceneName === "world" && this.ratActive && this.pet?.visible && ratDistanceFromPlayer < 92.5;
      const targetX = autoHunting ? this.ratActor.x : delayed ? delayed.x : this.avatar.x + directionOffset[0];
      const targetY = autoHunting ? this.ratActor.y : delayed ? delayed.y + 8 : this.avatar.y + directionOffset[1];
      const follow = feeding || attacking || togetherSitting ? 0 : 1 - Math.exp(-stepMs / (autoHunting ? 260 : playerMoving ? 120 : 210));
      const actor = petActor;
      const previousX = this.petFollowX, previousY = this.petFollowY;
      if (Math.hypot(targetX - previousX, targetY - previousY) > .3) {
        this.petFollowX += (targetX - previousX) * follow;
        this.petFollowY += (targetY - previousY) * follow;
      }
      const dx = this.petFollowX - previousX, dy = this.petFollowY - previousY;
      const moving = Math.hypot(dx, dy) > .025;
      if (moving) this.petFacing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
      this.petIdleMs = moving || feeding || attacking ? 0 : this.petIdleMs + (reducedMotion ? 0 : stepMs);
      const action = feeding ? "feed" : togetherSitting ? "sit" : attacking ? "attack" : moving ? "walk" : "idle";
      // A continuous rest clock lets every original meow/yawn/groom clip finish.
      const resting = ["idle", "sit"].includes(action) && ["idle", "sit"].includes(this.petPoseAction);
      this.petPoseElapsedMs = action === this.petPoseAction || resting ? this.petPoseElapsedMs + (reducedMotion ? 0 : stepMs) : 0;
      this.petPoseAction = action;
      this.petFeedRemainingMs = Math.max(0, this.petFeedRemainingMs - stepMs);
      this.petAttackRemainingMs = Math.max(0, this.petAttackRemainingMs - stepMs);
      if (this.pet?.visible) this.renderPetPose(action, this.petPoseElapsedMs, reducedMotion);
      else actor.setPosition(this.petFollowX, this.petFollowY).setDepth(this.petFollowY - 1).setAngle(0).setScale(1);
      if (time >= this.petActionUntil) this.petAction = null;
      if (autoHunting && Phaser.Math.Distance.Between(this.petFollowX, this.petFollowY, this.ratActor.x, this.ratActor.y) < 25 && time - this.lastPetAttackAt > 2600) {
        this.lastPetAttackAt = time;
        this.petAction = "attack";
        this.petActionUntil = time + 760;
        const eventId = this.ratEventId;
        this.dismissRat(time, true);
        window.dispatchEvent(new CustomEvent("forest-rat-caught", { detail: { eventId, amount: this.ratSpecies === "rabbit" ? 1 : 0, source: "pet", species: this.ratSpecies } }));
        if (!reducedMotion) {
          this.petAttackRemainingMs = window.ForestPets?.actionDurations?.attack || 760;
          this.petPoseAction = "attack";
          this.petPoseElapsedMs = 0;
          this.renderPetPose("attack", 0);
        }
      }
    }

    setPremiumFrame(direction, moving, time, running = false) {
      if (!this.premiumAvatar || !window.CarrotAvatarCompositor) return;
      const rate = running || this.avatar.mounted ? 90 : 140;
      const cosmetics = this.avatar.cosmetics;
      const context = this.compositeTexture.getContext();
      context.clearRect(0, 0, 224, 288);
      const pose = performance.now() < this.actionUntil ? this.actionPose : null;
      const progress = pose && Number.isFinite(this.actionStartedAt)
        ? Math.min(1, Math.max(0, (performance.now() - this.actionStartedAt) / (this.actionUntil - this.actionStartedAt))) : undefined;
      if (!pose) this.actionPose = null;
      const usedLpc = this.avatar.engine === "lpc" && window.LpcAvatarEngine?.draw(context, this.avatar, {
        direction, moving, running, pose, progress, frame: Math.floor(time / rate),
      }, { x: 16, y: 58, width: 192, height: 192 });
      if (!usedLpc) this.premiumAvatar.setVisible(false);
      else this.premiumAvatar.setVisible(true);
      if (usedLpc && typeof context.getImageData === "function") {
        const pixels = context.getImageData(0, 0, 224, 288).data;
        const bounds = this.measureAvatarOpaqueBounds(pixels, 224, 288);
        if (bounds) this.avatarOpaqueBounds = bounds;
      }
      this.compositeTexture.refresh();
      this.drawMotionEffects(direction, moving, Math.floor(time / rate) % 4);
      const worldScale = Math.min(0.58, Math.max(0.32, Number(this.avatar.tuning.worldScale) || AVATAR_RENDER_SCALE));
      this.premiumAvatar.setScale(worldScale);
    }

    drawMotionEffects() {
      this.motionFx?.clear();
    }
  }

  const initialViewport = viewportSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "phaser-world",
    width: initialViewport.width,
    height: initialViewport.height,
    backgroundColor: "#78b96a",
    pixelArt: true,
    roundPixels: true,
    render: { antialias: false, pixelArt: true, roundPixels: true },
    // Small layouts scroll to their wardrobe below the canvas. Wheel input is
    // not a game action, so do not trap page scrolling over the world.
    input: { mouse: { preventDefaultWheel: false } },
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / initialViewport.density, autoRound: false },
    scene: ForestScene,
  });
  window.carrotForestPhaserGame = game;
})();
