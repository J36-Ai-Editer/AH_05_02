import asyncio
import json
from pathlib import Path

from app.main import app, carrot_forest, forest_manifest, forest_service_worker

ROOT = Path(__file__).resolve().parents[1]


def test_home_record_player_uses_the_restored_pixel_furniture_in_both_renderers() -> None:
    import struct

    asset_name = "carrot-forest-home-v5.png"
    raw = (ROOT / "src/frontend/assets" / asset_name).read_bytes()
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", raw[16:24]) == (1536, 1024)
    assert raw[25] == 6  # RGBA, so no opaque rectangular background.

    game = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")
    assert all(asset_name in script for script in (game, phaser, worker))
    assert "homeRecordPlayerImage" not in game
    assert 'this.load.image("home-record-player", "/static/assets/home-record-player-cottage-v1.png' in phaser
    assert "home-record-player-cottage-v1.png" in worker
    assert "HOME_RECORD_PLAYER" in game and "HOME_RECORD_PLAYER" in phaser
    assert "HOME_LIGHT_SOURCES" in game and "HOME_LIGHT_SOURCES" in phaser
    assert "distanceTo(HOME_RECORD_PLAYER.x, HOME_RECORD_PLAYER.y) < 76" in game
    assert "x >= 590 && x <= 676 && y >= 150 && y <= 210" in game
    assert "recordPlayerDisc" not in phaser


def test_forest_has_independent_web_route() -> None:
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    response = asyncio.run(carrot_forest())
    html = Path(response.path).read_text(encoding="utf-8")
    assert "/forest" in paths
    assert "<title>당근의 숲 | 간당간당</title>" in html
    assert 'id="forest-canvas"' in html


def test_pixel_game_exposes_required_map_movement_and_group_progress() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    for label in ("오늘의 퀘스트", "팀 챌린지 달성도", "옷장", "창고", "배치한 오브젝트"):
        assert label in html
    for landmark in ("drawMap", "drawTree", "당근밭", "공동 나무"):
        assert landmark in html + script
    for key in ("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", 'w: "up"', 'a: "left"'):
        assert key in script
    assert html.count('data-move="') == 4
    assert 'width="1536" height="1024"' in html
    assert "image-rendering:pixelated" in (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")


def test_pixel_game_state_reward_and_adapter_contract_are_explicit() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert "DemoForestAdapter" in script
    assert "ApiForestAdapter" in script
    assert "기록은 어디에 저장되나요?" not in html
    assert "CARROT FOREST · WORLD STUDIO" not in html
    assert 'members: [{ id: "me", name: "나", completed: 0, target: SOLO_DAILY_QUEST_TARGET, me: true }]' in script
    assert script.count("completed: 3") == 0
    assert "FOREST_SESSION_STORAGE_KEY" in script
    assert "syncForestGroup" in script
    assert "state.groupTarget" in script
    assert "completed >= target" in script
    assert "state.rewardClaimed" in script
    assert "state.avatar.equipped" in script
    assert "state.placed.push" in script
    assert "localStorage" in script


def test_pixel_game_accessibility_and_excluded_features() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")
    combined = html + (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert "게임 내용으로 바로가기" in html
    assert 'role="status"' in html
    assert 'role="progressbar"' in html
    assert 'aria-label="아바타 이동 버튼"' in html
    assert "min-height:48px" in css
    for excluded in ("유료 가챠", "현금 결제", "건강정보 공개", "아이템 등급은 희소성"):
        assert excluded not in combined


def test_world_studio_workspace_controls_are_explicit() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    for label in ("당근의 숲", "아바타", "배치한 오브젝트"):
        assert label in html
    for removed_label in ("당근의 숲 작업실", "SCENE OBJECTS", "2× HD · 24 × 16 TILE"):
        assert removed_label not in html
    for control_id in ("reset-position", "zoom-in", "zoom-out", "ui-toggle", "avatar-coordinate", "object-count"):
        assert f'id="{control_id}"' in html
    assert html.count("data-workspace-target=") == 4
    assert "scrollIntoView" in script
    hud = (ROOT / "src/frontend/forest-hud.js").read_text(encoding="utf-8")
    assert "const width = area.clientWidth" in hud
    assert "const height = area.clientHeight" in hud
    assert "MIN_ZOOM = 1, MAX_ZOOM = 4" in hud
    assert "forest-ui-hidden" in hud
    assert "forest-name-updated" in script


def test_world_interactions_music_and_separated_storage_are_explicit() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    for control_id in ("music-toggle", "interaction-prompt", "world-dialog", "chat-panel"):
        assert f'id="{control_id}"' in html
    assert 'id="wardrobe-list"' in html
    assert 'id="storage-list"' in html
    assert html.count("data-action=") == 5
    for key in (
        'event.key === "q"',
        'event.key === "r"',
        'event.key.toLowerCase() === "c"',
        'event.key === "x"',
        'event.key === "e"',
        'event.key === "z"',
        'event.key === "Enter"',
    ):
        assert key in script
    for behavior in ("CozyForestMusic", "toggleRide", "toggleSit", "openWorldDialog"):
        assert behavior in script
    assert "fillPixelRect(x - 14, y - 15, 28, 14" in script


def test_world_uses_high_resolution_pixel_renderer_and_detail_layers() -> None:
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert "const RENDER_SCALE = 2" in script
    assert "context.setTransform(RENDER_SCALE" in script
    for renderer in (
        "drawHouse",
        "drawCarrotPlot",
        "drawSharedTree",
        "drawPond",
        "drawFence",
        "drawFlower",
    ):
        assert f"function {renderer}" in script
    assert "requestAnimationFrame(animateWorld)" in script


def test_avatar_studio_has_renamed_categories_live_preview_and_save_flow() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    assert 'id="avatar-studio"' in html
    assert 'id="avatar-preview-canvas" width="560" height="640"' in html
    assert 'id="avatar-item-grid"' in html
    for label in ("체형", "피부", "얼굴", "헤어", "모자", "팔", "상의", "하의", "신발", "도구", "무기", "탈것", "펫"):
        assert f'label: "{label}"' in script
    assert 'id="avatar-strip-basics"' in html
    assert 'id="avatar-restore-outfit"' in html
    assert 'id="avatar-tuning-controls"' not in html
    assert "찌르기 이펙트" not in script
    for behavior in ("renderAvatarStudio", "renderAvatarPreview", "avatarDraftHistory", "avatar-studio-save"):
        assert behavior in script
    assert ".avatar-studio-layout" in css
    assert '.avatar-item-card[aria-pressed="true"]' in css


def test_group_tabs_reward_ceremony_and_profile_are_interactive() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    for control_id in (
        "group-remaining",
        "reward-celebration",
        "reward-reveal-name",
        "open-profile",
    ):
        assert f'id="{control_id}"' in html
    for behavior in (
        "activateInspectorPanel",
        "playRewardCelebration",
        "generateNickname",
        "applyAccountNickname",
        "drawMemberFaceThumbnails",
    ):
        assert behavior in script
    assert "팀 챌린지 달성도" in html
    assert "완료 시 꾸미기 아이템" in html
    assert "오늘의 목표" in html
    assert "오늘의 슬로건!" not in html
    assert "member-avatar-face" in css
    assert "renderInventory(reward)" in script
    assert "reward-flight" in css
    assert "rewardArrival" in css
    assert "newItemArrival" in css


def test_forest_onboarding_rag_collaboration_and_tool_routes_are_connected() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    app_script = (ROOT / "src/frontend/app.js").read_text(encoding="utf-8")

    for control_id in (
        "start-prediction-flow",
        "challenge-flow-dialog",
        "group-goal-form",
        "add-family-colleague",
        "inventory-dialog",
    ):
        assert f'id="{control_id}"' in html
    for step in ("이동 가능 확인", "건강정보 입력", "분석결과", "챌린지"):
        assert step in html
    for style in ("운동 중심", "식단 중심", "내가 조합하기"):
        assert style in html
    assert "오늘까지의 챌린지 결과를 토대로 챌린지 생성 중" in html
    assert 'id="wisdom-spring-sign"' not in html
    assert 'id="open-wisdom-spring"' not in html
    assert 'wisdom_spring: "지혜의 샘 묻기"' in script
    assert "내 생활습관 지도" not in html
    assert "내 생활습관 지도(RAG)" not in html
    assert 'id="forest-rag-form"' not in html
    assert '<button type="submit">검색</button>' not in html
    assert "근거 찾기" not in html
    assert "사진 인증 없이" not in html
    assert "로그인하고 챌린지 시작!" in html
    assert "who.int/publications" in script
    assert "cdc.gov/diabetes-prevention" in script
    assert "window.location.href = window.ForestProfile.PROFILE_URL" in script
    assert "/service?workspace=together#forest-invite-title" in html
    assert "renderInventoryDialog" in script
    assert "groupGoalMemo" in script
    assert 'requestedView.get("workspace")' in app_script


def test_legacy_presets_are_removed_and_lpc_schema_migrates_once() -> None:
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert "presetBundles" not in script
    assert "presetDecorationReset" not in script
    assert "cosmeticSchemaVersion = 8" in script
    assert 'aura: "none"' in script
    assert 'state.avatar.cosmetics.aura === "wings"' not in script
    assert 'state.avatar.cosmetics.vehicle = "none"' in script
    assert 'lpcHead: "human_male"' in script


def test_avatar_editor_uses_item_colors_and_quick_outfit_actions_instead_of_manual_offsets() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    compositor = (ROOT / "src/frontend/avatar-compositor.js").read_text(encoding="utf-8")
    phaser = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")

    assert 'id="avatar-tuning-controls"' not in html
    assert 'id="avatar-color-controls"' not in html
    assert 'id="avatar-strip-basics"' in html
    assert 'id="avatar-restore-outfit"' in html
    for key in ("skin", "hairColor", "outfitColor", "bottomColor", "shoeColor", "hatColor", "glassesColor"):
        assert f"{key}:" in script or f'"{key}":' in script
    assert 'id="avatar-tuning-reset"' not in html
    assert "avatarTuningDraft" in script
    assert "headOffsetY" in compositor
    assert "this.avatar.tuning.worldScale" in phaser


def test_official_lpc_avatar_replaces_legacy_world_atlases() -> None:
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")
    for retired in (
        "carrot-forest-avatar-atlas-v1.png",
        "carrot-forest-basic-walk-atlas-v1.png",
        "carrot-forest-modular-avatar-atlas-v3.png",
        "carrot-forest-cosmetics-atlas-v1.png",
    ):
        assert retired not in worker
    assert 'engine: "lpc"' in script
    assert "Never expose the retired hand-drawn or preset-atlas avatar" in script
    assert "walkingUntil" in script
    assert "walkAnimationFrame" in script
    assert "state.avatar.direction = direction" in script
    assert "renderCatalogThumbnailCanvases" in script


def test_official_lpc_catalog_replaces_handmade_preset_selector() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert 'id="avatar-preset"' not in html
    assert "presetBundles" not in script
    assert 'lpcHead: "head"' in script
    assert "window.LpcAvatarEngine.catalog(engineCategory)" in script
    assert ".slice(0, limit)" not in script
    for category in ("head", "hair", "headwear", "arms", "torso", "legs", "feet", "tools", "weapons"):
        assert f'id: "{category}"' in script


def test_avatar_studio_uses_original_pixel_sprite_atlases_instead_of_emoji_previews() -> None:
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")
    avatar_atlas = ROOT / "src/frontend/assets/carrot-forest-avatar-atlas-v1.png"
    cosmetics_atlas = ROOT / "src/frontend/assets/carrot-forest-cosmetics-atlas-v1.png"

    for asset in (avatar_atlas, cosmetics_atlas):
        assert asset.exists()
        assert asset.stat().st_size > 100_000
        assert asset.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    assert "drawAtlasCell" in script
    assert "avatarSpriteIndex" in script
    assert "drawGeneratedWorldAvatar" in script
    assert "carrot-forest-avatar-atlas-v1.png" in css
    assert "carrot-forest-cosmetics-atlas-v1.png" in css


def test_world_scene_transitions_visual_storage_cats_and_wisdom_spring_are_connected() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")
    asset_names = (
        "carrot-forest-world-v9.png",
        "carrot-forest-home-v5.png",
        "carrot-forest-garden-v3.png",
        "carrot-forest-cat-pets-v1.png",
        "carrot-forest-storage-atlas-v4.png",
    )

    assert 'id="scene-exit"' in html
    for scene in ('switchScene("home")', 'switchScene("garden")', 'switchScene("world")'):
        assert scene in script
    for action in ("enter_home", "enter_garden", "rest", "water", "wisdom_spring", "exit_scene"):
        assert f'action === "{action}"' in script
    assert "wisdom-spring-sign" not in html
    assert "distanceTo(WISDOM_SPRING.x, WISDOM_SPRING.y) < 72" in script
    assert "당근의 요정 간당이가 알려주는, 건강 정보" in script
    assert "/api/v1/health-education/questions" in script
    assert "WISDOM_QUESTION_EXAMPLES" in script
    assert "gandangi-wisdom-guide.png" in worker
    assert "wisdom-spring-chat-banner-v1.png" in worker
    assert "물고기 잡기" not in script
    assert "state.fishCaught" in script
    assert "state.fishing" in script
    assert "blue_eyes_white_cat" in script
    assert "gold_eyes_orange_cat" in script
    assert "catPetAtlas" in script
    assert "storage-icon-item" in script
    assert "storage-sprite-thumb" in css
    for asset_name in asset_names:
        asset = ROOT / "src/frontend/assets" / asset_name
        assert asset.exists()
        assert asset.stat().st_size > 100_000
        assert asset.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
        assert asset_name in worker


def test_pixel_game_is_installable_pwa() -> None:
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    manifest = (ROOT / "src/frontend/forest.webmanifest").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")
    script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert {"/manifest.webmanifest", "/forest-sw.js"}.issubset(paths)
    assert 'rel="manifest" href="/manifest.webmanifest"' in html
    assert 'id="install-pwa"' in html
    assert '"display": "standalone"' in manifest
    assert '"sizes": "192x192"' in manifest
    assert '"sizes": "512x512"' in manifest
    assert "beforeinstallprompt" in script
    assert 'id="forest-boot" role="status"' in html
    assert "forest-style-ready" in html
    assert "forest-local-pwa-reset-v39" in html
    assert "registration.unregister()" in html
    assert 'classList.add("forest-script-ready")' in script
    assert "localDemoOrigin" in script
    assert "const CORE_SHELL" in worker
    assert "Promise.allSettled" in worker
    assert 'serviceWorker.register("/forest-sw.js", { scope: "/forest" })' in script
    assert 'url.pathname.startsWith("/api/")' in worker
    assert "carrot-forest-avatar-atlas-v1.png" not in worker
    assert "carrot-forest-cosmetics-atlas-v1.png" not in worker
    assert "lpc-pack/manifest.json" in worker


def test_phaser_premium_avatar_engine_and_offline_assets_are_connected() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")

    assert 'id="phaser-world" role="application"' in html
    assert "/static/vendor/phaser-3.90.0.min.js" in html
    assert "/static/forest-phaser.js" in html
    for category in (
        "bodyType",
        "skin",
        "head",
        "hair",
        "headwear",
        "arms",
        "torso",
        "legs",
        "feet",
        "tools",
        "weapons",
        "vehicle",
        "pet",
    ):
        assert f'id: "{category}"' in game_script
    for event_name in (
        "forest-avatar-updated",
        "forest-avatar-draft",
        "forest-phaser-position",
        "forest-phaser-interact",
    ):
        assert event_name in game_script or event_name in phaser_script
    for preset in ("red_bow", "cow_hood", "midnight", "blue_cap", "teal_bob"):
        assert preset in phaser_script
        assert f"carrot-forest-avatar-{preset}-normalized-v2.png" in phaser_script
    assert "directionRows" in phaser_script
    assert "setPremiumFrame" in phaser_script
    assert "this.compositeTexture.refresh" in phaser_script
    assert "window.carrotForestRunning === true" in phaser_script
    assert 'this.input.keyboard.on("keydown-R"' in phaser_script
    assert 'this.load.spritesheet("lpc-pets"' in phaser_script
    assert "carrot-forest-lpc-pets-v1.png" in phaser_script


def test_lpc_avatar_expansion_storage_reward_and_sit_toggle_contract() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    engine = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")
    manifest = (ROOT / "src/frontend/assets/lpc-pack/manifest.json").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")

    for category in ("bodyType", "head"):
        assert f'id: "{category}"' in game_script
    for face_part in ("lpcExpression", "lpcEyebrow", "lpcNose", "lpcEyes", "lpcWrinkles"):
        assert f"{face_part}:" in game_script
    assert "selected-check" in game_script
    assert "action-view-only" in game_script
    assert "storageObjectCodes" in game_script
    assert 'reward_cow: { name: "행운의 젖소"' in game_script
    assert 'reward_cow: { name: "행운의 젖소", kind: "object"' in game_script
    assert 'const rewardPool = ["reward_cow"]' in game_script
    assert "희귀 꾸미기 오브젝트" in game_script
    assert 'state.rewardClaimed && !state.inventory.includes("reward_cow")' in game_script
    assert 'name: "세준"' in game_script
    assert "event.repeat" in phaser_script
    assert "this.add.ellipse(0, 0, 34, 8" not in phaser_script
    assert "pendingImages" in engine
    assert '"category": "expression"' in manifest
    for asset in (
        "carrot-forest-storage-atlas-v2.png",
        "carrot-forest-reward-cow-v1.png",
        "carrot-forest-reward-cow-body-v2.png",
        "carrot-forest-reward-cow-base-v2.png",
        "carrot-forest-campfire-off-v3.png",
        "carrot-forest-lpc-pets-v1.png",
        "town-pro-sensory-cc0.mp3",
        "carrot-forest-main-theme.mp3",
        "forest-canopy-original.wav",
        "carrot-forest-original.wav",
        "peaceful-forest-samza-cc0.wav",
        "home-drowsy-evening-cc0.wav",
        "avatar-forget-me-not-cc0.ogg",
        "lp-our-home-v2.mp3",
        "lp-warm-afternoon-v2.mp3",
        "lp-bright-sam-v2.mp3",
        "lp-untitled-v2.mp3",
        "lp-going-home-v1.mp3",
    ):
        assert (ROOT / "src/frontend/assets" / asset).is_file()
    assert (ROOT / "scripts/generate_original_bgm.py").is_file()
    assert "gold_eyes_orange_cat" in phaser_script
    assert "Phaser.Scale.NONE" in phaser_script
    assert 'const CACHE_NAME = "gandang-carrot-forest-pwa-v181-wisdom-lp";' in worker
    assert "town-pro-sensory-cc0.mp3" in worker
    assert "carrot-forest-main-theme.mp3" in worker
    assert "forest-canopy-original.wav" in worker
    assert "carrot-forest-original.wav" in worker
    assert "peaceful-forest-samza-cc0.wav" in worker
    assert "avatar-studio-original.wav" in worker
    assert "home-drowsy-evening-cc0.wav" in worker
    assert "avatar-forget-me-not-cc0.ogg" in worker
    assert "lp-our-home-v2.mp3" in worker
    assert "lp-warm-afternoon-v2.mp3" in worker
    assert "lp-bright-sam-v2.mp3" in worker
    assert "lp-untitled-v2.mp3" in worker
    assert "lp-going-home-v1.mp3" in worker
    assert "home-record-player-simple-loop-cc0.ogg" not in worker
    assert "home-record-elfwood-nexon.mp3" not in worker
    assert "reward-chest-success.mp3" in worker


def test_storybook_world_assets_and_fullscreen_game_shell_are_connected() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")

    assets = ROOT / "src/frontend/assets"
    expected = {
        "carrot-forest-loading-v2.png": (1672, 941),
        "carrot-forest-world-v9.png": (1536, 1024),
        "carrot-forest-home-v5.png": (1536, 1024),
        "carrot-forest-garden-v3.png": (1536, 1024),
        "garden-carrot-v168.png": (1254, 1254),
        "carrot-forest-storage-atlas-v4.png": (1280, 1024),
        "carrot-forest-animated-objects-v3.png": (512, 512),
        "furniture-v153/lantern.png": (1254, 1254),
        "furniture-v153/duck_float.png": (1254, 1254),
        "furniture-v153/firefly_lantern.png": (1254, 1254),
        "furniture-v153/garden_pinwheel.png": (1254, 1254),
    }
    from PIL import Image

    for filename, size in expected.items():
        path = assets / filename
        assert path.is_file()
        with Image.open(path) as image:
            assert image.size == size
        assert filename in worker

    for source in (game_script, phaser_script):
        assert "carrot-forest-world-v9.png" in source
        assert "carrot-forest-home-v5.png" in source
        assert "window.ForestGarden.assets.background" in source
    assert "forest-memory-camera-v161" not in phaser_script
    assert "WORLD_FIXED_LANTERNS" in game_script and "WORLD_FIXED_LANTERNS" in phaser_script
    garden_script = (ROOT / "src/frontend/forest-garden.js").read_text(encoding="utf-8")
    assert "carrot-forest-garden-v3.png" in garden_script
    assert "garden-carrot-v168.png" in garden_script
    assert "carrot-forest-storage-atlas-v4.png" in game_script
    assert "carrot-forest-animated-objects-v3.png" in phaser_script
    assert "home-record-player-cottage-v1.png" in phaser_script
    assert "Full-screen game shell" in css
    assert '<h1 id="forest-title">당근의 숲</h1>' in html
    assert "CARROT FOREST · WORLD STUDIO" not in html
    assert "2× HD · 24 × 16 TILE" not in html
    assert 'rel="preload" as="image" href="/static/assets/carrot-forest-loading-v2.png' in html
    assert "함께 실천하고, 같이 성장하는 모두의 건강 숲" in html


def test_face_editor_outfit_expansion_and_polish_contract() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    engine = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")

    assert 'id="face-section-tabs"' not in html
    assert 'data-lpc-category="${itemSlot}"' in game_script
    assert 'data-lpc-body-type="${item.id}"' in game_script
    assert 'data-lpc-skin="${item.id}"' in game_script
    assert "groupedCategories.includes(categoryId)" in game_script
    assert "groupedItem?.slot" in game_script
    assert 'lpcHair: "hair"' in game_script
    assert 'lpcOutfit: "outfit"' in game_script
    assert 'lpcBottom: "bottom"' in game_script
    assert 'lpcShoes: "shoes"' in game_script
    assert "drawFaceDetails" not in engine
    assert '["head", cosmetics.lpcHead' in engine
    assert "KeyCodes.SPACE" in phaser_script
    assert "time - this.lastPetAttackAt > 2600" in phaser_script
    assert "Math.exp(-stepMs / (autoHunting ? 260" in phaser_script
    assert "this.motionFx?.clear()" in phaser_script
    assert 'forest: new Audio("/static/assets/carrot-forest-main-theme.mp3")' in game_script
    assert 'night: new Audio("/static/assets/peaceful-forest-samza-cc0.wav")' in game_script
    assert 'avatar: new Audio("/static/assets/avatar-forget-me-not-cc0.ogg")' in game_script
    assert '(hour >= 19 || hour < 5)) return "night"' in game_script
    assert 'home: new Audio("/static/assets/home-drowsy-evening-cc0.wav")' in game_script
    assert 'homeRecordHome: new Audio("/static/assets/lp-our-home-v2.mp3")' in game_script
    assert 'homeRecordWarm: new Audio("/static/assets/lp-warm-afternoon-v2.mp3")' in game_script
    assert 'homeRecordBright: new Audio("/static/assets/lp-bright-sam-v2.mp3")' in game_script
    assert 'homeRecordUntitled: new Audio("/static/assets/lp-untitled-v2.mp3")' in game_script
    assert 'homeRecordGoingHome: new Audio("/static/assets/lp-going-home-v1.mp3")' in game_script
    assert 'goingHome: { name: "집으로", audioKey: "homeRecordGoingHome" }' in game_script
    assert 'homeRecordEvening: new Audio("/static/assets/home-drowsy-evening-cc0.wav")' in game_script
    catalog = game_script.split("const homeRecordCatalog = {", 1)[1].split("};", 1)[0]
    assert catalog.count("audioKey:") == 7
    assert catalog.index('name: "집으로"') < catalog.index('name: "나른한 저녁"')
    assert catalog.index('name: "나른한 저녁"') < catalog.index('name: "숲 속의 요정"')
    assert 'forestFairy: { name: "숲 속의 요정", audioKey: "homeRecordForestFairy" }' in catalog
    assert 'homeRecordForestFairy: new Audio("/static/assets/avatar-forget-me-not-cc0.ogg")' in game_script
    assert "homeRecordSimple" not in game_script
    assert "homeRecordElfwood" not in game_script
    assert 'garden: new Audio("/static/assets/town-pro-sensory-cc0.mp3")' in game_script
    assert 'homeRecordCatalog[state.homeRecordTrack]?.audioKey || "homeRecordHome"' in game_script
    assert 'target === "record_player"' in game_script
    assert 'data-world-action="record_music"' in game_script
    assert 'data-world-action="record_off"' in game_script
    assert "createHomeRecordPlayer()" in phaser_script
    assert 'musicEngine?.switchTo("avatar", { restart: true })' in game_script
    assert "musicEngine?.switchTo(sceneMusicName(scene))" in game_script
    assert 'new Audio("/static/assets/reward-chest-success.mp3")' in game_script
    assert "musicEngine.applyVolume(.34)" in game_script
    assert "musicEngine.applyVolume();" in game_script
    assert 'class="animal-thumbnail-canvas"' in game_script
    assert 'data-animal="cow"' in game_script
    assert ".reward-rays,.reward-particles{display:none}" in css
    assert "/static/assets/lpc-pack/manifest.json" in worker
    assert "/static/lpc-avatar-engine.js" in html
    assert "/static/avatar-compositor.js" in html
    assert "CarrotAvatarCompositor" in phaser_script
    assert 'id="avatar-nameplate" class="map-label avatar-nameplate"' in html
    assert "avatarAnchor()" in phaser_script
    assert "nickname.textContent = anchor.name || state.avatar.name" in game_script
    assert 'window.addEventListener("forest-camera-view", projectMapLabels)' in game_script
    assert "const NAMEPLATE_Y" not in phaser_script
    assert "const AVATAR_RENDER_SCALE = 0.43" in phaser_script
    assert (ROOT / "src/frontend/vendor/phaser-3.90.0.min.js").stat().st_size > 1_000_000
    assert (ROOT / "src/frontend/vendor/PHASER_LICENSE.txt").exists()


def test_lpc_actions_and_pet_companion_motion_are_connected() -> None:
    import json

    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    engine_script = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")
    manifest_path = ROOT / "src/frontend/assets/lpc-pack/manifest.json"
    credits_path = ROOT / "src/frontend/assets/lpc-pack/credits.json"

    assert manifest_path.exists()
    assert credits_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert len(manifest["items"]) >= 24
    for action in ("harvest", "fishing", "door", "attack", "dance"):
        assert action in engine_script
    assert "공격" in html
    assert "댄스" in game_script
    assert "playTogether" in phaser_script
    assert "this.petTrail" in phaser_script
    assert "time - 330" in phaser_script
    assert "this.petFacing" in phaser_script
    assert 'this.petAction = nextAvatar.sitting ? "sit" : "idle"' in phaser_script
    hud_script = (ROOT / "src/frontend/forest-hud.js").read_text(encoding="utf-8")
    assert '"0": "ui-toggle"' in hud_script
    assert 'event.key === "0"' not in game_script
    assert 'event.key !== "0"' not in phaser_script


def test_original_forest_sound_effects_are_generated_cached_and_event_driven() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")
    generator = (ROOT / "scripts/generate_forest_sfx.py").read_text(encoding="utf-8")

    expected = {
        "step-grass",
        "run-grass",
        "door-open",
        "sit-cloth",
        "mount",
        "harvest",
        "water",
        "fishing-cast",
        "fishing-catch",
        "attack-sword",
        "attack-bow",
        "attack-magic",
        "rat-caught",
        "pet-feed",
        "dance",
        "place-object",
        "object-on",
        "object-off",
        "cow-toggle",
    }
    for name in expected:
        asset = ROOT / "src/frontend/assets/sfx" / f"{name}.wav"
        assert asset.is_file() and asset.stat().st_size > 4_000
        assert f"/static/assets/sfx/{name}.wav" in worker
        assert name in generator
    assert "class ForestSfx" in game_script
    assert 'window.addEventListener("forest-sfx"' in game_script
    assert 'new CustomEvent("forest-sfx"' in phaser_script
    assert "if (!this.avatar.mounted && time - this.lastStepSfxAt >= stepInterval)" in phaser_script
    assert 'playSfx("rat-caught"' in game_script
    assert 'playSfx("door-open"' in game_script
    assert "weaponSfxName" in game_script


def test_cow_fire_and_lights_toggle_nearby_with_q_and_persist_state() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    for code in ("reward_cow", "campfire", "lantern", "firefly_lantern", "light_tent"):
        assert f"{code}:" in game_script
        assert f"{code}:" in phaser_script
    assert "interactiveObjectTypes" in game_script
    assert "normalizePlacedObjects" in game_script
    assert "nearbyPlacedObject" in game_script
    assert "togglePlacedObject" in game_script
    assert 'target.startsWith("object:")' in game_script
    assert "item.active = !item.active" in game_script
    assert "item.activatedAt = item.active ? Date.now() : null" in game_script
    assert 'item.active ? "작동 중" : "꺼짐·정지"' in game_script
    assert "applyPlacedObjectState" in phaser_script
    assert 'actor.setData("interactive", true)' in phaser_script
    assert 'item.code === "firefly_lantern" && item.active' in phaser_script
    assert 'actor.getData("ambientFx")?.clear()' in phaser_script
    assert "this.tweens.killTweensOf(actor)" in phaser_script
    assert 'actor.getData("fireOffTarget")?.setVisible(!item.active)' in phaser_script
    assert 'actor.getData("fireOnTarget")?.setVisible(Boolean(item.active))' in phaser_script
    assert "actor.setPosition(item.x, item.y).setAlpha(1)" in phaser_script
    assert 'actor.setData("motionTarget", body)' in phaser_script
    assert 'const motionTarget = actor.getData("motionTarget")' in phaser_script
    assert 'actor.getData("motionTarget") || actor' not in phaser_script
    assert 'item.code === "lantern"' in phaser_script
    assert "interactiveDepthBoost" in phaser_script
    assert "forest-cow-react" in game_script
    assert "reactToCow" in game_script
    assert 'reaction = y < placedTarget.item.y - 28 ? "head" : "body"' in game_script
    assert "placed-object-copy" in game_script
    assert "width:122px" in css


def test_interactive_placed_objects_use_their_visible_sprite_as_click_target() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")

    assert 'window.addEventListener("forest-placed-object-pointer"' in game_script
    assert "await interact(`object:${index}`)" in game_script
    assert 'actor.getData("pointerTargets") || [actor]' in phaser_script
    assert "target.setInteractive({ useHandCursor: true," in phaser_script
    assert "pixelPerfect: true, alphaTolerance: 16" in phaser_script
    assert 'new CustomEvent("forest-placed-object-pointer"' in phaser_script


def test_day_night_pond_animation_and_water_object_placement_contract() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    assert "ambientStrengthForHour" in phaser_script
    assert "currentLocalHour" in phaser_script
    assert "updateWorldAtmosphere(time)" in phaser_script
    assert "this.nightOverlay" in phaser_script
    assert "this.lightFx" in phaser_script
    assert "const illuminationStrength = Math.max(this.nightStrength, .32)" in phaser_script
    assert 'id="atmosphere-toggle"' in html
    assert ">날씨·시간</button>" in html
    assert 'atmosphereButton.textContent = "날씨·시간"' in game_script
    assert "forest-atmosphere-updated" in game_script
    assert "this.atmosphereEnabled" in phaser_script
    assert ".setDepth(900).setAlpha(0).setVisible(false)" in phaser_script
    assert 'context.globalCompositeOperation = "destination-out"' in phaser_script
    assert "this.add.graphics().setDepth(901)" in phaser_script
    assert "[218, 430, 30]" in phaser_script
    assert "this.waterRippleFx" in phaser_script
    assert "strokeEllipse" in phaser_script
    assert 'new Set(["duck_float"])' in game_script
    assert "if (waterObjectCodes.has(placementCode))" in game_script
    assert "const inPond = x >= 64 && x <= 288" in game_script
    assert "white-space:nowrap;writing-mode:horizontal-tb" in css


def test_wild_rat_is_a_separate_attack_reward_event() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")
    pet_builder = (ROOT / "scripts/build_lpc_pet_pack.py").read_text(encoding="utf-8")

    assert 'this.load.spritesheet("lpc-rat"' in phaser_script
    assert "spawnRat(time, forcedSpecies = null)" in phaser_script
    assert "tryAttackRat(time)" in phaser_script
    assert 'pose === "attack"' in phaser_script
    assert 'new CustomEvent("forest-rat-caught"' in phaser_script
    assert 'window.addEventListener("forest-rat-caught"' in game_script
    assert "if (rabbit) state.carrots += 1;" in game_script
    assert "토끼가 당근 1개를 놓고 갔습니다." in game_script
    assert "쥐를 잡았습니다." in game_script
    assert "야생 쥐를 잡고 당근" not in game_script
    assert "RAT_OUTPUT" in pet_builder
    assert "carrot-forest-lpc-rat-v1.png" in worker
    assert (ROOT / "src/frontend/assets/carrot-forest-lpc-rat-v1.png").is_file()
    assert 'id: "rat"' not in game_script


def test_completed_challenges_grow_harvestable_carrots_in_the_garden() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    for control_id in ("garden-harvest-panel", "pending-harvest-carrots", "harvest-challenge-carrots"):
        assert f'id="{control_id}"' in html
    for contract in (
        "challengeCarrotClaims",
        "pendingChallengeCarrots",
        "accrueChallengeCarrots",
        "harvestChallengeCarrots",
        'data-world-action="harvest_challenge"',
    ):
        assert contract in game_script
    assert "if (state.challengeCarrotClaims?.[questId]) return 0" in game_script
    assert "if (!claim.harvested) claim.harvested = true" in game_script


def test_arcade_controls_pet_feeding_and_pet_auto_attack_are_connected() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")

    assert "arcade-deck" in html
    assert "WASD로도 움직일 수 있어요." not in html
    assert "숲 조작 패널" not in html
    assert 'data-action="chat"' not in html
    assert 'data-action="dance"' not in html
    assert 'data-action="ride"' not in html
    for action in ("jump", "run", "interact", "sit", "attack"):
        assert f'data-action="{action}"' in html
    assert '<button class="arcade-action action-jump"' in html
    for label in ("점프 (J)", "달리기 (R)", "상호작용 (Q)", "앉기 (X)"):
        assert f"<span>{label}</span>" in html
    assert 'data-action="attack" aria-label="공격, 단축키 Z"' in html
    assert "<span>공격 (Z)</span>" in html
    assert "attack-spark" not in html
    assert "data-footer-tool=" not in html
    assert 'class="asset-dock rail-assets"' in html
    overlay_position = html.index('class="game-controls-overlay arcade-deck"')
    assert html.index('class="canvas-frame"') < overlay_position < html.index('class="right-hud"')
    assert html.index('class="asset-dock rail-assets"') < overlay_position
    assert 'class="object-inspector footer-objects"' in html
    assert "grid-template-columns:minmax(250px,.8fr) minmax(0,2.2fr)" in (
        ROOT / "src/frontend/forest-game.css"
    ).read_text(encoding="utf-8")
    assert 'grid-template-areas:"jump up run" "left interact right" "sit down attack"' in (
        ROOT / "src/frontend/forest-game.css"
    ).read_text(encoding="utf-8")
    assert 'this.input.keyboard.on("keydown-J"' in phaser_script
    assert 'this.playAction("jump", 620)' in phaser_script
    assert 'this.input.keyboard.on("keydown-E", (event)' in phaser_script
    assert "event.repeat || formFocused() || this.mountTransitioning" in phaser_script
    assert 'data-action="feed"' not in html
    assert "async function feedPet" in game_script
    assert 'new CustomEvent("forest-pet-clicked"' in phaser_script
    assert 'window.addEventListener("forest-pet-clicked"' in game_script
    assert ".setInteractive({ useHandCursor: true })" in phaser_script
    assert 'new CustomEvent("forest-pet-fed"' in game_script
    assert "showPetHeart" in phaser_script
    assert "autoHunting" in phaser_script
    assert 'source: "pet"' in phaser_script
    assert 'this.premiumAvatar = this.add.image(0, 0, "avatar-composite").setOrigin(0.5, 0.87)' in phaser_script


def test_bgm_and_sfx_volume_and_mute_controls_are_separated() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    for control_id in (
        "music-toggle",
        "volume-toggle",
        "music-volume",
        "music-mute",
        "sfx-volume",
        "sfx-mute",
    ):
        assert f'id="{control_id}"' in html
    assert ">BGM</button>" in html
    assert "배경음악 음량" in html
    assert "효과음 음량" in html
    assert "BGM_VOLUME_KEY" in game_script
    assert "BGM_MUTED_KEY" in game_script
    assert "SFX_VOLUME_KEY" in game_script
    assert "SFX_MUTED_KEY" in game_script
    assert "sfxEngine.effectiveVolume(.42)" in game_script
    assert "setVolume(value)" in game_script
    assert "setMuted(muted)" in game_script


def test_lpc_defaults_include_visible_face_and_gender_specific_starters() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    engine_script = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")

    assert 'id="avatar-preset"' not in html
    assert 'lpcExpression: "neutral"' in game_script
    assert "cosmeticSchemaVersion = 8" in game_script
    assert "applyUnifiedFace" not in game_script
    assert 'lpcHead: "human_male"' in game_script
    assert 'lpcNose: "button"' in game_script
    assert '["body", "body", "body", cosmetics.skin || "peach"]' in engine_script
    assert '["head", cosmetics.lpcHead' in engine_script
    assert '["expression", cosmetics.lpcExpression' in engine_script
    assert "skinPalettes" not in engine_script
    assert "faceAnchors" not in engine_script


def test_avatar_sitting_is_a_stable_toggle_and_clothing_catalog_is_expanded() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    engine_script = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")

    assert 'data-action="sit"' in html
    assert 'const seatObjectCodes = new Set(["chair_green", "chair_red", "bench"])' in game_script
    assert "async function sitAtPlacedObject" in game_script
    assert "state.avatar.sitting = !state.avatar.sitting" in game_script
    assert "(avatar.sitting || (avatar.mounted && !usesWingMobility(avatar))) && !options.pose" in engine_script
    assert "cycles[cycles.length - 1]" in engine_script
    assert 'lpcOutfit: "outfit"' in game_script
    assert 'lpcBottom: "bottom"' in game_script


def test_equipped_weapons_use_matching_lpc_motion_and_are_transient() -> None:
    engine_script = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")

    assert 'if (weapon === "wand") return "spellcast"' in engine_script
    assert "function sharedAnimation(avatar, options, candidates)" in engine_script
    assert "sharedAnimation(avatar, options, weaponAnimations)" in engine_script
    assert 'pose === "attack" && cosmetics.lpcWeapon === "wand"' in engine_script
    assert 'drawPixel(context, destination, wandX, wandTop + 5, 2, 15, "#6f4528")' in engine_script
    assert 'bow: ["shoot", "slash"]' in engine_script
    assert 'cane: ["thrust", "slash"]' in engine_script
    assert 'dagger: ["slash", "thrust", "halfslash"]' in engine_script
    assert 'arming_sword: ["slash", "halfslash", "backslash"]' in engine_script
    assert '!["none", "wand"].includes(cosmetics.lpcWeapon)' in engine_script
    assert "supported.includes(animation)" in engine_script


def test_lpc_clothing_uses_one_shared_animation_for_body_and_outfit_layers() -> None:
    engine_script = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")

    assert 'const movementAnimations = options.running ? ["run", "walk", "idle"]' in engine_script
    assert 'jump: ["jump", "walk", "idle"]' in engine_script
    assert "layers.every((layer)" in engine_script
    assert 'return sharedAnimation(avatar, options, movementAnimations) || "walk"' in engine_script


def test_tools_use_official_actions_without_the_legacy_carrot_prop_and_preview_on_selection() -> None:
    engine_script = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert 'new Set(["axe", "hammer", "pickaxe"])' in engine_script
    assert 'drawPixel(context, destination, side, 44, 4, 7, "#ed7c2e")' not in engine_script
    assert 'activeAvatarCategory === "tools"' in game_script
    assert 'avatarPreviewPose = "harvest"' in game_script
    assert 'targetSlot === "lpcWeapon"' in game_script
    assert 'avatarPreviewPose = "attack"' in game_script
    assert "const layerFrameSize = Number(layer.frameSize || FRAME)" in engine_script
    assert "destinationX = target.x - (destinationWidth - target.width) / 2" in engine_script


def test_local_daily_reset_preserves_profile_but_reopens_daily_reward() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert "function resetTodayProgress(current)" in game_script
    assert "next.quests = { walk: false, meal: false, check: false }" in game_script
    assert "next.rewardClaimed = false" in game_script
    assert "completed: member.me ? 0 : 3" in game_script
    assert 'localDemoOrigin && params.get("resetToday") === "1"' in game_script


def test_modular_avatar_separates_the_base_body_from_hair_layers() -> None:
    compositor = (ROOT / "src/frontend/avatar-compositor.js").read_text(encoding="utf-8")
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")

    assert "const BASE_BODY_START = 146" in compositor
    assert 'const backHairPresets = new Set(["red_bow"])' in compositor
    assert "bodyTarget.y + target.height * BASE_BODY_START / CELL_HEIGHT" in compositor
    assert "if (usesBackHair) drawSource(context, source.image, hair, hairTarget)" in compositor
    assert "drawSource(context, source.image, outfit, bodyTarget)" in compositor
    assert 'id="avatar-strip-basics"' in html


def test_saved_outfits_are_numbered_renameable_and_keep_body_previews_clothed() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert "나만의 코디 1" in game_script
    assert "nextOutfitNumber" in game_script
    assert "data-outfit-name-form" in game_script
    assert 'look.presetRole === "female" ? "프리셋1" : "프리셋2"' in game_script
    assert '<div class="outfit-name-form fixed-preset-name"><small>${presetLabel}</small></div>' in game_script
    assert 'value="${safeLabel}"' in game_script
    assert "renameOutfit" in game_script
    assert "applyRequestedDefaultOutfit" in game_script
    assert 'label: "농부"' in game_script
    assert 'sourceLabel: "나만의 코디 10"' in game_script
    assert 'label: "사냥꾼"' in game_script
    assert 'sourceLabel: "나만의 코디 8"' in game_script
    assert 'lpcOutfit: "none", lpcBottom: "none", lpcShoes: "none"' not in game_script
    assert "아이템을 선택해주세요" not in html
    assert "피부색 함께 적용" not in html
    assert "2× PIXEL PREVIEW" not in html
    assert 'id="pet-art-credit"' not in html
    assert 'name: "선택 안함"' in game_script
    assert "record?.sources?.[gender] || record?.sources?.male" in (
        ROOT / "src/frontend/lpc-avatar-engine.js"
    ).read_text(encoding="utf-8")


def test_gender_defaults_open_with_farmer_and_switch_to_hunter() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")

    assert "const OUTFIT_DEFAULT_VERSION = 5" in game_script
    assert 'gender: "female", engine: "lpc"' in game_script
    assert 'normalizeGenderDefaultOutfit(null, "female", Date.now())' in game_script
    assert 'normalizeGenderDefaultOutfit(null, "male", Date.now() - 1)' in game_script
    assert 'applyGenderDefaultOutfit(target, "female")' in game_script
    assert "const existing = forceCanonical ? null : roleLook || namedLook" in game_script
    assert "history.find((look) => look.presetRole === gender)" in game_script
    assert 'lpcOutfit: "official_torso_shirts_torso_clothes_tunic_sara"' in game_script
    assert 'lpcBottom: "official_legs_skirts_legs_skirt_straight"' in game_script
    assert 'vehicle: "wings_monarch_wings_monarch_edge", pet: "blue_eyes_white_cat"' in game_script
    assert 'lpcOutfit: "official_torso_jacket_torso_jacket_santa"' in game_script
    assert 'lpcBottom: "official_legs_pants_legs_formal_striped"' in game_script
    assert 'lpcTool: "none", lpcWeapon: "bow", vehicle: "none", pet: "white_pup"' in game_script
    assert 'id="avatar-gender"' not in html
    assert 'id="avatar-name"' not in html
    assert 'id="profile-nickname"' not in html
    assert 'id="open-avatar-studio"' in html
    assert '<h2 id="avatar-title">아바타</h2>' in html
    assert "기본 프리셋 이름은 변경할 수 없습니다." in game_script
    assert "fixed-preset-name" in game_script


def test_avatar_rail_wardrobe_and_storage_use_single_row_wheel_carousels() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    assert 'id="inventory-title" class="sr-only"' in html
    assert 'id="placement-mode" class="sr-only"' in html
    assert 'id="cancel-placement"' in html
    assert '[$("#wardrobe-list"), $("#storage-list")]' in game_script
    assert 'carousel.addEventListener("wheel"' in game_script
    assert "carousel.scrollLeft += delta" in game_script
    assert "Math.abs(event.deltaX) > Math.abs(event.deltaY)" in game_script
    assert ".rail-assets .inventory-list{display:flex;flex-wrap:nowrap" in css
    assert "storage-scroll-prev" not in html
    assert "storage-scroll-range" not in html
    assert "grid-auto-flow:column;grid-auto-columns:88px" in css
    assert "scrollbar-color:#4c8b60 #e6eee8" in css
    assert ".rail-assets #wardrobe-list,.stage-footer .footer-objects .placed-list{scrollbar-width:thin" in css
    assert "function syncStorageScroller()" not in game_script
    assert "scroll-snap-type:x proximity" in css
    assert 'classList.toggle("is-wardrobe", view === "wardrobe")' in game_script
    assert ".inventory-dialog-grid.is-wardrobe{display:flex" in css


def test_storage_placement_uses_grid_rotation_and_explicit_confirmation() -> None:
    html = (ROOT / "src/frontend/forest.html").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    assert 'id="placement-controls"' in html
    assert 'id="rotate-placement"' in html
    assert 'id="confirm-placement"' in html
    assert "placementGridCells" in game_script
    assert "placementCellValid" in game_script
    assert "placementDraft" in game_script
    assert "rotatePlacement" in game_script
    assert "confirmPlacement" in game_script
    assert 'event.key === "v" || event.key === "V"' in game_script
    assert "forest-placement-updated" in game_script
    assert "syncPlacement" in phaser_script
    assert "createPlacedObjectActor" in phaser_script
    assert '.setAngle(item.code === "duck_float" ? 0 : Number(item.rotation) || 0)' in phaser_script
    assert 'this.input.keyboard.on("keydown-V"' in phaser_script
    assert ".placement-controls" in css


def test_each_preset_uses_directional_walk_and_vehicle_motion_in_world() -> None:
    compositor = (ROOT / "src/frontend/avatar-compositor.js").read_text(encoding="utf-8")
    phaser = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")

    assert "drawPresetMotionFrame" in compositor
    assert "options.moving || options.mounted || options.motionPreview" in compositor
    assert "options.hairPreset === options.preset" in compositor
    assert "options.outfitPreset === options.preset" in compositor
    assert "const mountedBounce" in compositor
    assert "const horizontalLean" in compositor
    assert "playMountTransition" in phaser
    assert "this.mountTransitioning" in phaser
    assert "drawMotionEffects" in phaser
    assert "this.avatar.mounted" in phaser


def test_retired_modular_avatar_is_not_loaded_by_runtime() -> None:
    import struct

    atlas = ROOT / "src/frontend/assets/carrot-forest-modular-avatar-atlas-v3.png"
    raw = atlas.read_bytes()
    width, height = struct.unpack(">II", raw[16:24])
    compositor = (ROOT / "src/frontend/avatar-compositor.js").read_text(encoding="utf-8")
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")

    assert (width, height) == (224 * 4, 288 * 11)
    assert (ROOT / "scripts/build_modular_avatar_atlas.py").exists()
    for row in range(1, 11):
        assert f": {row}" in compositor
    assert "drawModularFrame" in compositor
    assert "carrot-forest-modular-avatar-atlas-v3.png" not in game_script
    assert "carrot-forest-modular-avatar-atlas-v3.png" not in phaser_script


def test_official_lpc_mobility_aprons_and_transient_actions_are_complete() -> None:
    import json

    manifest = json.loads((ROOT / "src/frontend/assets/lpc-pack/manifest.json").read_text(encoding="utf-8"))
    engine = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")
    phaser = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    game = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    items = manifest["items"]

    mobility = {item["id"] for item in items if item["category"] == "mobility"}
    tools = {item["id"] for item in items if item["category"] == "tool"}
    aprons = [item for item in items if "/aprons/" in item.get("definition", "")]

    assert {"wheelchair", "feathered_wings", "lizard_wings", "bat_wings", "lunar_wings"}.issubset(mobility)
    assert all(
        {"idle", "walk", "run", "sit"}.issubset(item["animations"]) for item in items if item["id"] == "wheelchair"
    )
    assert len(aprons) >= 3
    assert "carrot" not in tools
    assert 'options.pose === "attack"' in engine
    assert 'options.pose === "harvest" && cosmetics.lpcTool' in engine
    assert 'outfitIsOverlay ? [["outfit", "tshirt"' in engine
    assert "this.premiumAvatar.setVisible(false)" in phaser
    assert '{ id: "vehicle", label: "탈것", icon: "▸" }' in game
    assert '{ id: "pet", label: "펫", icon: "▸" }' in game


def test_normalized_avatar_atlases_have_exact_cells_and_reproducible_manifest() -> None:
    import json
    import struct

    manifest_path = ROOT / "src/frontend/assets/carrot-forest-avatar-manifest-v2.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["cell_width"] == 224
    assert manifest["cell_height"] == 288
    assert (ROOT / "scripts/build_carrot_avatar_atlases.py").exists()
    assert (ROOT / "requirements-assets.txt").exists()
    for preset, config in manifest["presets"].items():
        image_path = ROOT / "src/frontend/assets" / config["file"]
        raw = image_path.read_bytes()
        width, height = struct.unpack(">II", raw[16:24])
        assert width == 224 * 4
        assert height == 288 * config["rows"]
        assert len(config["frames"]) == 4 * config["rows"]
        for frame in config["frames"]:
            left, top, right, bottom = frame["normalized_bbox"]
            assert 0 <= left < right <= manifest["cell_width"]
            assert 0 <= top < bottom <= manifest["cell_height"]
        assert preset in ("red_bow", "cow_hood", "midnight", "blue_cap", "teal_bob")


def test_pwa_route_response_contracts() -> None:
    manifest_response = asyncio.run(forest_manifest())
    worker_response = asyncio.run(forest_service_worker())

    assert manifest_response.media_type == "application/manifest+json"
    assert manifest_response.headers["cache-control"] == "no-cache"
    assert worker_response.media_type == "text/javascript"
    assert worker_response.headers["service-worker-allowed"] == "/forest"


def test_looping_animated_objects_are_buildable_placeable_and_cached() -> None:
    import struct

    atlas = ROOT / "src/frontend/assets/carrot-forest-animated-objects-v3.png"
    raw = atlas.read_bytes()
    width, height = struct.unpack(">II", raw[16:24])
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")
    worker = (ROOT / "src/frontend/forest-sw.js").read_text(encoding="utf-8")

    assert (width, height) == (512, 512)
    assert (ROOT / "scripts/build_animated_object_atlas.py").is_file()
    for code in ("duck_float", "animated_fountain", "firefly_lantern", "garden_pinwheel"):
        assert code in game_script
        assert code in phaser_script
    assert 'new CustomEvent("forest-world-pointer"' in phaser_script
    assert 'window.addEventListener("forest-world-pointer"' in game_script
    assert 'this.load.image("animated-objects-source"' in phaser_script
    assert "window.ForestObjects.createAnimatedAtlas(animatedSource)" in phaser_script
    assert "window.ForestObjects.drawAnimatedItem" in game_script
    assert "window.ForestAnimals.updateCowState(" in phaser_script
    assert "window.ForestAnimals.touchCowState(" in phaser_script
    assert "window.ForestAnimals.cowPose(" in phaser_script
    animals = (ROOT / "src/frontend/forest-animals.js").read_text(encoding="utf-8")
    assert "elapsedMs < cowReactionDurationMs" in animals
    assert "syncPlacedObjects" in phaser_script
    assert "carrot-forest-animated-objects-v3.png" in worker
    assert 'data-animated-object-row="${animatedRow}"' in game_script
    assert "drawAnimatedObjectThumbnails" in game_script
    assert "animated-object-thumbnail-canvas" in css


def test_storage_objects_use_isolated_cells_and_recent_outfit_wardrobe() -> None:
    import struct

    atlas = ROOT / "src/frontend/assets/carrot-forest-storage-atlas-v4.png"
    raw = atlas.read_bytes()
    width, height = struct.unpack(">II", raw[16:24])
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    phaser_script = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    assert (width, height) == (256 * 5, 256 * 4)
    assert (ROOT / "scripts/build_storage_object_atlas.py").is_file()
    assert 'this.load.image("storage-objects-source"' in phaser_script
    assert (
        'this.textures.addSpriteSheet("storage-objects", window.ForestObjects.createStorageAtlas(storageSource)'
        in phaser_script
    )
    assert "window.ForestObjects.drawStorageItem" in game_script
    assert "storageObjectIndex" in phaser_script
    assert 'item.code === "reward_cow"' in phaser_script
    assert "outfitHistory" in game_script
    assert "rememberCurrentOutfit" in game_script
    assert "applyOutfitLook" in game_script
    assert "data-outfit-look" in game_script
    assert "inventory: [...storageObjectCodes]" in game_script
    assert "carrot-forest-storage-atlas-v4.png" in css


def test_object_cutouts_and_shared_renderers_are_wired_in_every_surface() -> None:
    import shutil
    import subprocess

    from PIL import Image

    frontend = ROOT / "src/frontend"
    game = (frontend / "forest-game.js").read_text(encoding="utf-8")
    phaser = (frontend / "forest-phaser.js").read_text(encoding="utf-8")
    html = (frontend / "forest.html").read_text(encoding="utf-8")
    worker = (frontend / "forest-sw.js").read_text(encoding="utf-8")
    node = shutil.which("node")
    assert node is not None, "The shared furniture asset contract requires the Node test runtime"
    # Read the actual exported manifest and worker cache lists: do not duplicate
    # the 24 object filenames or assume how the worker constructs its list.
    inventory = json.loads(
        subprocess.check_output(
            [
                node,
                "-e",
                """
const fs = require('node:fs'), vm = require('node:vm');
const objects = { window: {} }, worker = { self: { addEventListener() {} } };
vm.runInNewContext(fs.readFileSync('src/frontend/forest-objects.js', 'utf8'), objects);
vm.runInNewContext(fs.readFileSync('src/frontend/forest-sw.js', 'utf8') +
  ';globalThis.cachedAssets = [...CORE_SHELL, ...MEDIA_ASSETS];', worker);
process.stdout.write(JSON.stringify({
  assets: objects.window.ForestObjects.INDIVIDUAL_ASSETS,
  cachedAssets: worker.cachedAssets,
}));
""",
            ],
            cwd=ROOT,
            text=True,
            encoding="utf-8",
        )
    )
    individual_assets = inventory["assets"]
    assert len(individual_assets) == 24
    assert len({asset["url"] for asset in individual_assets}) == 24
    assert sum("/furniture-v153/" in asset["url"] for asset in individual_assets) == 6
    assert sum("/furniture-v160/" in asset["url"] for asset in individual_assets) == 18
    assert sum("/furniture-v161/" in asset["url"] for asset in individual_assets) == 0
    for asset in individual_assets:
        url = asset["url"]
        if asset["code"] in {
            "campfire",
            "animated_fountain",
            "lantern",
            "duck_float",
            "firefly_lantern",
            "garden_pinwheel",
        }:
            assert url == f"/static/assets/furniture-v153/{asset['code']}.png?v=20260907-1"
        else:
            assert url == f"/static/assets/furniture-v160/{asset['code']}.png?v=20260910-1"
        assert asset["key"] == f"furniture-{asset['code']}"
        path = frontend / url.partition("?")[0].removeprefix("/static/")
        assert path.is_file(), f"Missing independent furniture asset: {path.name}"
        with Image.open(path) as sprite:
            assert sprite.mode == "RGBA", "Cutouts need real alpha, not a painted checkerboard"
            low_alpha, high_alpha = sprite.getchannel("A").getextrema()
            assert low_alpha == 0 and high_alpha >= 250
            assert sprite.getpixel((0, 0))[3] == 0
        assert url in inventory["cachedAssets"], f"Furniture missing from offline cache: {url}"
    assert "await window.ForestObjects.loadIndividualAssets()" in game
    assert "window.ForestObjects.INDIVIDUAL_ASSETS.forEach" in phaser
    assert "riverDuckImage.src = window.ForestRiverDuckArt.asset.url" in game
    assert "window.ForestRiverDuckArt.assets.forEach" in phaser
    assert '"duck-cutout"' not in phaser
    assert html.index("forest-riverduck-art.js") < html.index("forest-phaser.js")
    assert "furniture-v153/campfire.png" in game and "furniture-v153/campfire.png" in phaser
    # Only flame extraction retains the old atlas; new furniture uses whole PNGs.
    assert all("carrot-forest-storage-atlas-v4.png" in source for source in (game, phaser, worker))
    assert "ForestObjects.createLegacyStorageAtlas(storageSpriteAtlas)" in game
    assert "ForestObjects.createLegacyStorageAtlas(storageSource)" in phaser
    assert 'ForestFire.install(this, { flameAtlasKey: "campfire-flame-atlas" })' in phaser
    assert html.index("forest-objects.js") < html.index("forest-phaser.js")
    assert "forest-objects.js?v=20260910-3" in worker
    assert "canvas[data-storage-object]" in game
    assert "background-position:${backgroundPosition}" not in game
    assert "ForestFire.burningTile" in game and "ForestFire.offTile" in game
    assert 'this.load.image("campfire-off"' not in phaser
    assert '"campfire-off").setOrigin(0.5, 0.9).setDisplaySize(94, 94)' in phaser
    assert '"campfire-ripple", 0).setOrigin(0.5, 0.9).setDisplaySize(94, 94)' in phaser


def test_avatar_catalog_cards_render_actual_lpc_previews_instead_of_emoji() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    engine_script = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")

    assert 'data-lpc-color-category="${itemSlot}"' in game_script
    assert "canvas[data-lpc-color-category]" in game_script
    assert 'data-lpc-pose="${item.id}"' in game_script
    assert "canvas[data-lpc-pose]" in game_script
    assert 'data-speech-thumb="${item.id}"' in game_script
    assert "canvas[data-speech-thumb]" in game_script
    assert "effect: { magic_burst: 5, sword_arc: 6, arrow_volley: 8, leaf_blade: 9 }" not in game_script
    assert 'data-lpc-category="lpcMobility"' in game_script
    assert "canvas[data-empty-preview]" in game_script
    assert 'class="item-visual lpc-color-swatch"' not in game_script
    assert 'class="item-visual speech-item-visual"' not in game_script
    assert "lpcChoiceSupportsBody" in game_script
    assert '"lpcOutfit", "lpcBottom", "lpcShoes"' in game_script
    assert "const layerAnimation = supported.includes(requestedAnimation)" in engine_script
    assert "layerFrame * layerFrameSize" in engine_script


def test_avatar_preview_stays_visible_and_muscular_body_keeps_basic_clothes() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    css = (ROOT / "src/frontend/forest-game.css").read_text(encoding="utf-8")

    assert ".avatar-preview-panel{position:sticky;top:0" in css
    assert ".avatar-studio-layout{align-items:start;overflow-x:hidden;overflow-y:auto}" in css
    assert 'const matchingAdult = bodyType === "female" ? "female" : "male"' in game_script
    assert 'lpcOutfit: "tshirt", outfitColor: "white"' in game_script


def test_shoe_catalog_only_contains_complete_footwear() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    builder = (ROOT / "scripts/build_lpc_avatar_pack.py").read_text(encoding="utf-8")
    manifest = (ROOT / "src/frontend/assets/lpc-pack/manifest.json").read_text(encoding="utf-8")

    assert "isCompleteFootwear" in game_script
    assert 'definition.includes("/shoes/")' in game_script
    assert 'definition.includes("/boots/")' in game_script
    assert 'path.endswith("feet_armour.json")' in builder
    for excluded in ("sandals", "slippers", "ankle_socks", "high_socks", "plate_toe"):
        assert f'"id": "{excluded}"' not in manifest


def test_wheelchair_uses_64px_frames_and_stays_visible_while_moving() -> None:
    builder = (ROOT / "scripts/build_lpc_avatar_pack.py").read_text(encoding="utf-8")
    engine = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "src/frontend/assets/lpc-pack/manifest.json").read_text(encoding="utf-8"))

    assert 'frame_counts = {"idle": 2, "walk": 9, "run": 8, "sit": 3}' in builder
    assert "source_frame = frame % 2" in builder
    assert 'FRAME if item.item_id == "wheelchair"' in builder
    wheelchair = next(
        item for item in manifest["items"] if item["category"] == "mobility" and item["id"] == "wheelchair"
    )
    assert all(layer["frameSize"] == 64 for layers in wheelchair["sources"].values() for layer in layers)
    assert 'layer.category === "mobility" && avatar.mounted && options.moving' in engine


def test_wings_jump_once_then_keep_the_avatar_standing() -> None:
    engine = (ROOT / "src/frontend/lpc-avatar-engine.js").read_text(encoding="utf-8")
    phaser = (ROOT / "src/frontend/forest-phaser.js").read_text(encoding="utf-8")

    assert 'const wingMobilityIds = new Set(["feathered_wings", "lizard_wings", "bat_wings", "lunar_wings"])' in engine
    assert 'vehicle.includes("wings")' in engine
    assert 'if (avatar.mounted) return usesWingMobility(avatar) ? "idle" : "sit"' in engine
    assert "avatar.mounted && !usesWingMobility(avatar)" in engine
    assert 'this.actionPose = "jump"' in phaser
    assert "yoyo: true" in phaser


def test_lpc_editor_matches_official_top_level_structure_without_child_or_pregnant_body() -> None:
    game_script = (ROOT / "src/frontend/forest-game.js").read_text(encoding="utf-8")
    builder = (ROOT / "scripts/build_lpc_avatar_pack.py").read_text(encoding="utf-8")

    expected = (
        "bodyType",
        "skin",
        "head",
        "hair",
        "headwear",
        "arms",
        "torso",
        "legs",
        "feet",
        "tools",
        "weapons",
        "vehicle",
        "pet",
    )
    positions = [game_script.index(f'{{ id: "{category}"') for category in expected]
    assert positions == sorted(positions)
    assert 'BODY_TYPES = ("male", "female", "muscular", "teen")' in builder
    assert 'id: "child"' not in game_script
    assert 'id: "pregnant"' not in game_script
    manifest = (ROOT / "src/frontend/assets/lpc-pack/manifest.json").read_text(encoding="utf-8")
    for vehicle in ("wheelchair", "feathered_wings", "lizard_wings", "bat_wings", "lunar_wings"):
        assert f'"id": "{vehicle}"' in manifest
    assert 'lpcMobility: "mobility"' in game_script
    assert "avatarCatalog.mobilityColor = colorChoices" in game_script
    assert 'slot: "mobilityColor", group: "색상"' in game_script
    assert "discover_official_clothing(source)" in builder
    assert "discover_official_mobility(source)" in builder
    assert '"category": "outfit"' in manifest
    assert manifest.count('"category": "outfit"') >= 40
    assert '"id": "tshirt"' in manifest
    assert '"id": "cardigan"' in manifest
    assert "backpack_contents" not in manifest
    assert manifest.count('"category": "mobility"') >= 10
