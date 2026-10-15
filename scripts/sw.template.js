// BARDEN LineOS service worker: lets the installed app open and run with no signal.
// - Pages: network first, fall back to the cached copy when offline.
// - Next.js build files (/_next/static, content-hashed): cache first.
// - Other same-origin files and the OCR engine/language files (CDN): stale-while-revalidate,
//   so anything used once online is there offline.
// __BUILD__ is replaced at build time (scripts/build-sw.mjs), so every deploy is a new
// service worker: phones download it in the background and switch on next resume.
const VERSION = "lineos-__BUILD__";
const PAGES = ["/", "/job", "/login", "/crew", "/help"];
const FILES = ["/pdf.worker.min.mjs", "/barden-logo.png", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
const CDN_HOSTS = ["cdn.jsdelivr.net", "tessdata.projectnaptha.com", "unpkg.com"];

async function precache() {
  const cache = await caches.open(VERSION);
  await cache.addAll(FILES);
  // Cache the pages and every build file they reference.
  for (const page of PAGES) {
    const res = await fetch(page, { cache: "no-store" });
    if (!res.ok) continue;
    const html = await res.clone().text();
    await cache.put(page, res);
    const assets = [...html.matchAll(/\/_next\/static\/[^"'\s)]+/g)].map((m) => m[0]);
    await Promise.all([...new Set(assets)].map((a) => cache.add(a).catch(() => {})));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req, key) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key)) || (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") return event.respondWith(networkFirst(req, url.pathname));
    // Next.js client-side navigation data: offline, fail so Next falls back to a full page load.
    if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;
    if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req));
    return event.respondWith(staleWhileRevalidate(req));
  }
  if (CDN_HOSTS.includes(url.hostname)) return event.respondWith(staleWhileRevalidate(req));
});
