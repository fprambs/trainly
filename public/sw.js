// Service worker: guarda la app para abrirla rápido y sin señal.
// Los datos (Supabase) no se guardan aquí: la app tiene su propia cola sin conexión.
const CACHE = "trainly-v3";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg"]))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/") || url.pathname.startsWith("/media/") || req.headers.has("range") || req.cache === "no-store" || url.searchParams.has("_v")) return;
  // páginas: red primero (para tener siempre la última versión), con respaldo en caché
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put("/index.html", c)); return r; }).catch(() => caches.match("/index.html")));
    return;
  }
  // archivos (js, css, íconos): caché primero
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
});
