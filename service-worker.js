const CACHE_NAME = "ugadai-slovo-v24";
const FILES_TO_CACHE = ["./", "./index.html", "./style.css", "./script.js", "./data/words.js", "./data/valid-words.js", "./data/valid-long-words.js", "./data/levels/animals.js", "./data/levels/nature.js", "./data/levels/food.js", "./data/levels/home.js", "./data/levels/city.js", "./data/levels/tech.js", "./data/levels/slang.js", "./data/levels/cinema.js", "./data/levels/sport.js", "./data/levels/travel.js", "./manifest.webmanifest", "./assets/icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
