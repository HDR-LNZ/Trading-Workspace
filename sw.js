// Minimal service worker for PWA install. Network-first; no aggressive caching
// because we want fresh quotes/news.
const CACHE = "tw-shell-v3";
const SHELL = ["./", "./index.html", "./styles.css", "./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API calls.
  if (url.pathname.startsWith("/api/") || url.hostname.includes("workers.dev") || url.hostname.includes("finnhub.io") || url.hostname.includes("yahoo.com")) {
    return; // pass through
  }
  // Network-first for shell.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (e.request.method === "GET" && res.ok && url.origin === location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
