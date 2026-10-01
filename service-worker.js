const CACHE_NAME = "ugadai-slovo-v37";
const FILES_TO_CACHE = ["./", "./index.html", "./style.css", "./stats.css", "./stats.js", "./rewards.css", "./rewards.js", "./yandex-platform.js", "./cloud-save.js", "./game-bootstrap.js", "./hints.js", "./analytics.js", "./audio.js", "./script.js", "./data/words.js", "./data/valid-words.js", "./data/valid-long-words.js", "./data/long-words-loader.js", "./data/levels/animals.js", "./data/levels/nature.js", "./data/levels/food.js", "./data/levels/home.js", "./data/levels/city.js", "./data/levels/tech.js", "./data/levels/slang.js", "./data/levels/cinema.js", "./data/levels/sport.js", "./data/levels/travel.js", "./manifest.webmanifest", "./assets/icon.svg", "./assets/start-cat.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request,copy)));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
