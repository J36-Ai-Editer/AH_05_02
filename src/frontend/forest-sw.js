"use strict";

const CACHE_PREFIX = "gandang-carrot-forest-pwa-";
const CACHE_NAME = "gandang-carrot-forest-pwa-v181-wisdom-lp";
const CORE_SHELL = [
  "/forest",
  "/manifest.webmanifest",
  "/static/forest-game.css?v=20260920-wisdom-lp-v1",
  "/static/forest-atmosphere.css?v=20260903-2",
  "/static/forest-atmosphere.js?v=20260907-4",
  "/static/forest-hud.js?v=20260908-4",
  "/static/vendor/phaser-3.90.0.min.js",
  "/static/avatar-compositor.js?v=20260827-10",
  "/static/lpc-avatar-engine.js?v=20260908-2",
  "/static/forest-objects.js?v=20260910-3",
  "/static/forest-fire.js?v=20260907-3",
  "/static/forest-animals.js?v=20260908-5",
  "/static/forest-pets.js?v=20260908-6",
  "/static/forest-riverduck.js?v=20260908-1",
  "/static/forest-riverduck-art.js?v=20260910-2",
  "/static/forest-memories.js?v=20260910-2",
  "/static/forest-garden.js?v=20260908-1",
  "/static/forest-phaser.js?v=20260920-wisdom-lp-v1",
  "/static/forest-profile.js?v=20260907-1",
  "/static/forest-game.js?v=20260920-wisdom-lp-v1",
  "/static/challenge-v2.js?v=2.1.10",
  "/static/challenge-v2.css?v=2.1.3",
  "/static/suin/design-tokens.css?v=20260908-1",
  "/static/icons/forest-icon-192.png",
  "/static/icons/forest-icon-512.png",
];
const MEDIA_ASSETS = [
  "/static/assets/furniture-v153/campfire.png?v=20260907-1",
  "/static/assets/furniture-v153/animated_fountain.png?v=20260907-1",
  "/static/assets/furniture-v153/lantern.png?v=20260907-1",
  "/static/assets/furniture-v153/duck_float.png?v=20260907-1",
  "/static/assets/furniture-v153/firefly_lantern.png?v=20260907-1",
  "/static/assets/furniture-v153/garden_pinwheel.png?v=20260907-1",
  ...["tent", "light_tent", "picnic_table", "bbq_table", "chair_green", "chair_red", "picnic_blanket", "pond", "fence", "flower_cart", "flower_pot", "mushroom", "bench", "mailbox", "scarecrow", "carrot_crate", "watering_can", "wheelbarrow"].map(code => `/static/assets/furniture-v160/${code}.png?v=20260910-1`),
  "/static/assets/animals/lpc-cow-eat.png",
  "/static/assets/animals/lpc-cow-walk.png",
  "/static/assets/animals/lpc-rabbit.png",
  "/static/assets/animals/riverduck-v160/riverduck.png?v=20260908-1",
  ...["idle-2", "swim-1", "swim-2", "flee-1", "flee-2"].map(name => `/static/assets/animals/riverduck-v160/${name}.png?v=20260908-1`),
  "/static/assets/animals/licensed-rabbits/bunbun.png?v=20260908-1",
  "/static/assets/animals/licensed-rabbits/last-tick.png?v=20260908-1",
  ...["white", "gray", "ginger", "winter-antlers-green", "winter-antlers-red", "winter-santa-hat-1", "winter-santa-hat-2",
    "valentine-cupid", "valentine-nimbus", "valentine-wings", "valentine-bow-blue", "valentine-bow-gold",
    "valentine-glasses-gold", "valentine-bow-green", "valentine-bow-pink-2", "valentine-bow-pink",
    "valentine-bow-red", "valentine-glasses-red"].map(name => `/static/assets/animals/licensed-kittens/${name}.png?v=20260908-2`),
  "/static/assets/animals/cow-moo-joseph-sardin-cc0.mp3",
  "/static/assets/challenge-water-team-v171.webp?v=20260908-1",
  "/static/assets/challenge-compost-team-v171.webp?v=20260908-1",
  "/static/assets/challenge-weeding-team-v171.webp?v=20260908-1",
  "/static/assets/gandangi-wisdom-guide.png?v=20260910-1",
  "/static/assets/gandangi-wisdom-guide-chat-v1.png?v=20260916-1",
  "/static/assets/wisdom-spring-chat-banner-v1.png?v=20260910-1",
  "/static/assets/home-record-player-cottage-v1.png?v=20260920-1",
  "/static/assets/town-pro-sensory-cc0.mp3",
  "/static/assets/home-drowsy-evening-cc0.wav",
  "/static/assets/avatar-forget-me-not-cc0.ogg",
  "/static/assets/lp-our-home-v2.mp3",
  "/static/assets/lp-warm-afternoon-v2.mp3",
  "/static/assets/lp-bright-sam-v2.mp3",
  "/static/assets/lp-untitled-v2.mp3",
  "/static/assets/lp-going-home-v1.mp3",
  "/static/assets/carrot-forest-main-theme.mp3",
  "/static/assets/forest-canopy-original.wav",
  "/static/assets/peaceful-forest-samza-cc0.wav",
  "/static/assets/avatar-studio-original.wav",
  "/static/assets/carrot-forest-original.wav",
  "/static/assets/reward-chest-success.mp3",
  "/static/assets/sfx/step-grass.wav",
  "/static/assets/sfx/run-grass.wav",
  "/static/assets/sfx/door-open.wav",
  "/static/assets/sfx/sit-cloth.wav",
  "/static/assets/sfx/mount.wav",
  "/static/assets/sfx/harvest.wav",
  "/static/assets/sfx/water.wav",
  "/static/assets/sfx/fishing-cast.wav",
  "/static/assets/sfx/fishing-catch.wav",
  "/static/assets/sfx/attack-sword.wav",
  "/static/assets/sfx/attack-bow.wav",
  "/static/assets/sfx/attack-magic.wav",
  "/static/assets/sfx/rat-caught.wav",
  "/static/assets/sfx/pet-feed.wav",
  "/static/assets/sfx/dance.wav",
  "/static/assets/sfx/place-object.wav",
  "/static/assets/sfx/object-on.wav",
  "/static/assets/sfx/object-off.wav",
  "/static/assets/sfx/cow-toggle.wav",
  "/static/assets/carrot-forest-cat-pets-v1.png",
  "/static/assets/carrot-forest-storage-atlas-v4.png?v=20260907-1",
  "/static/assets/carrot-forest-animated-objects-v3.png?v=20260910-1",
  "/static/assets/carrot-forest-lpc-pets-v1.png",
  "/static/assets/carrot-forest-lpc-rat-v1.png",
  "/static/assets/carrot-forest-loading-v2.png?v=20260907-1",
  "/static/assets/carrot-forest-world-v9.png?v=20260910-1",
  "/static/assets/carrot-forest-home-v5.png?v=20260910-3",
  "/static/assets/carrot-forest-garden-v3.png?v=20260908-1",
  "/static/assets/garden-carrot-v168.png?v=20260908-1",
  "/static/assets/lpc-pack/manifest.json?v=20260901-10",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_SHELL);
      await Promise.allSettled(MEDIA_ASSETS.map((asset) => cache.add(asset)));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Login/service pages and other /forest* routes are never the offline shell.
    if (url.pathname !== "/forest") return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/forest", copy)).catch(() => {}));
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match("/forest")))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(request)).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }))
  );
});
