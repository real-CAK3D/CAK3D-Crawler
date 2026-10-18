// Offline support for the web app: the app itself is fetched fresh when online and served
// from cache when offline. Fonts are cached after first use. Only its own old caches are cleared on update, so
// downloads kept in other caches (the on-device AI model) survive app updates.
const CACHE = "crawler-__VERSION__";
const SHELL = ["./", "index.html", "config.js", "anthropic.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/jszip.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("crawler-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// tapping "Crawl complete" brings the app back to the front, or opens it
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow ? self.clients.openWindow("./") : null;
  }));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const put = res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; };
  // background sounds and music: kept whole in their own cache (it survives app updates). Music asks for parts of the
  // file, which can't be cached, so the whole file is fetched once and served from then on.
  if (url.origin === location.origin && //sounds/[w-]+.mp3$/.test(url.pathname)) {
    e.respondWith(caches.open("arachnotes-sounds").then(async c => {
      const hit = await c.match(url.pathname); if (hit) return hit;
      const res = await fetch(url.pathname);
      if (res.ok && res.status === 200) await c.put(url.pathname, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
  } else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(put)));
  }
});
