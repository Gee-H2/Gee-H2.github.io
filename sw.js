/* Service worker: network-first for the page, content and scripts (so edits appear
   on a normal refresh), cache-first for static assets (images) for speed.
   Falls back to cache when offline. */
const CACHE = "gu-site-v13";
const PRECACHE = ["./", "./index.html", "./content.json", "./sim.js", "./grid.js", "./images/profile.jpg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  return fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(req));
}
function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    return res;
  }));
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // network-first for our own HTML / JSON / JS so updates show immediately
  const fresh = /\.(html|json|js)$/.test(url.pathname) || url.pathname === "/" || url.pathname.endsWith("/");
  e.respondWith(fresh ? networkFirst(e.request) : cacheFirst(e.request));
});
