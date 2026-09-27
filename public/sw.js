/* Event Beast: cache only the explicitly public guide and its offline reader.
 * Never cache navigated app HTML, RSC, auth, private API data or admin pages. */
const CACHE = "event-beast-public-v1";
const CORE = ["/offline.html", "/offline.js", "/offline-base.css", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("event-beast-public-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
function isPublicAsset(url) {
  return url.protocol === "https:" && /\/storage\/v1\/object\/public\/event-assets\//.test(url.pathname) && !url.search;
}
async function cachePublicImages(guide, cache) {
  const urls = [...(guide.sponsors ?? []).map((s) => s.logo_url), ...(guide.speakers ?? []).map((s) => s.headshot_url), ...(guide.lunches ?? []).map((s) => s.image_url), ...(guide.venues ?? []).map((s) => s.map_url)]
    .filter((raw) => { try { const url = new URL(raw); return isPublicAsset(url) && url.pathname.includes(`/event-assets/${guide.event.id}/`); } catch { return false; } });
  // Public bucket images only. No signed URLs, arbitrary external responses,
  // private headshots or contact records are admitted to this cache.
  for (const raw of [...new Set(urls)].slice(0, 60)) {
    try { const response = await fetch(raw, { credentials: "omit" }); if (response.ok && response.headers.get("content-type")?.startsWith("image/")) await cache.put(raw, response); } catch { /* Image remains optional. */ }
  }
}
async function publicGuide(event) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(event.request, { credentials: "omit", cache: "no-cache" });
    if (response.ok && response.headers.get("X-Event-Beast-Public") === "guide-v1") {
      const guide = await response.clone().json();
      if (guide.event?.published && guide.event?.public_guide && Array.isArray(guide.sessions)) {
        await cache.put("/api/guide", response.clone());
        event.waitUntil(cachePublicImages(guide, cache));
      }
    } else if (response.status === 404 || response.status === 503) {
      // A live server response can withdraw the guide; offline network failure
      // alone must not silently delete the last usable public copy.
      if (response.status === 404) await cache.delete("/api/guide");
    }
    return response;
  } catch {
    return await cache.match("/api/guide") ?? new Response(JSON.stringify({ error: "No event guide has been saved on this device yet." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin === self.location.origin && url.pathname === "/api/guide" && !url.search) { event.respondWith(publicGuide(event)); return; }
  if (url.origin === self.location.origin && CORE.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(event.request)) ?? fetch(event.request)));
    return;
  }
  if (isPublicAsset(url)) {
    // Only previously admitted public guide assets may be served from cache.
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      try { return await fetch(event.request); } catch { return await cache.match(event.request) ?? Response.error(); }
    }));
    return;
  }
  if (url.origin === self.location.origin && event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match("/offline.html").then((cached) => cached ?? Response.error())));
  }
  // Everything else uses the browser network stack with no Cache API write.
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "REFRESH_PUBLIC_GUIDE") return;
  event.waitUntil((async () => {
    const response = await fetch("/api/guide", { credentials: "omit", cache: "no-cache" });
    if (!response.ok || response.headers.get("X-Event-Beast-Public") !== "guide-v1") return;
    const guide = await response.clone().json();
    if (!guide.event?.published || !guide.event?.public_guide) return;
    const cache = await caches.open(CACHE);
    await cache.put("/api/guide", response);
    await cachePublicImages(guide, cache);
  })().catch(() => {}));
});
