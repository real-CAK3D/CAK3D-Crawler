// Offline support for the web app: the app itself is fetched fresh when online and served
// from cache when offline. Fonts are cached after first use.
const CACHE = "crawler-__VERSION__";
const SHELL = ["./", "index.html", "config.js", "anthropic.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/jszip.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const put = res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; };
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
  } else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(put)));
  }
});
