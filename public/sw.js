// Service worker: lets the installed PWA launch with no connectivity (the car) by caching the
// app shell. Media downloads live in IndexedDB (handled by the app), NOT here. API responses
// are per-profile/token and must never be cached or served stale.
const CACHE = "plexkids-shell-v2";
const SHELL = "/index.html";

// Precache the shell + every asset index.html references AT INSTALL TIME, so the very first
// offline launch works. (Runtime-only caching missed the initial load — the page that registers
// the SW isn't controlled by it yet, so nothing got cached before going offline.)
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch("/", { cache: "no-store" });
      const html = await res.text();
      await cache.put(SHELL, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
      // Grab all local src/href URLs (hashed js/css/svg, icons, manifest — keep query strings).
      const urls = Array.from(html.matchAll(/(?:src|href)="(\/[^"]*)"/g))
        .map((m) => m[1])
        .filter((u) => !u.startsWith("/api/") && u !== "/");
      await Promise.all([...new Set(urls)].map((u) => cache.add(u).catch(() => {})));
    } catch { /* best-effort; runtime caching fills gaps while online */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin
  if (url.pathname.startsWith("/api/")) return;     // never cache API (per-profile/token)

  // Navigations: network-first (fresh app when online), fall back to the cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const net = await fetch(req);
        cache.put(SHELL, net.clone());
        return net;
      } catch {
        return (await cache.match(SHELL)) || (await cache.match("/")) || Response.error();
      }
    })());
    return;
  }

  // Hashed assets / icons / manifest: cache-first, populate on first online fetch.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net.ok) cache.put(req, net.clone());
      return net;
    } catch {
      return hit || Response.error();
    }
  })());
});
