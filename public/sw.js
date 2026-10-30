// Service worker: guarda la app para abrirla rápido y sin señal.
// Los datos (Supabase) no se guardan aquí: la app tiene su propia cola sin conexión.
const CACHE = "trainly-v6";
const MEDIA = "trainly-media-v1",
  MEDIA_MAX = 300; // videos e imágenes de ejercicios: se bajan una vez
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg"])));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches
      .keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== MEDIA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// ¿es un archivo de ejercicio? (Supabase Storage o /media/ propios)
const isMedia = url =>
  (url.pathname.includes("/storage/v1/object/public/") ||
    (url.origin === location.origin && url.pathname.startsWith("/media/"))) &&
  /\.(mp4|webm|mov|jpe?g|png|gif|webp)$/i.test(url.pathname);

async function mediaResponse(req) {
  const key = req.url.split("#")[0],
    cache = await caches.open(MEDIA);
  let hit = await cache.match(key);
  if (!hit) {
    // se baja el archivo completo una sola vez (sin rango) y queda guardado en el teléfono
    try {
      const r = await fetch(key, { mode: "cors", credentials: "omit" });
      if (r.ok && r.status === 200) {
        await cache.put(key, r.clone());
        trimMedia(cache);
        hit = r;
      } else return fetch(req);
    } catch (err) {
      return fetch(req);
    }
  }
  const range = req.headers.get("range");
  if (!range) return hit;
  // los videos piden pedazos (Range): se responden desde el archivo guardado
  const buf = await (await ((await cache.match(key)) || hit).blob()).arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range),
    size = buf.byteLength;
  let start = m && m[1] ? +m[1] : 0,
    end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(0, size - +m[2]);
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start >= size || start > end)
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "content-type": hit.headers.get("content-type") || "video/mp4",
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes"
    }
  });
}
async function trimMedia(cache) {
  try {
    const ks = await cache.keys();
    for (let i = 0; i < ks.length - MEDIA_MAX; i++) await cache.delete(ks[i]);
  } catch (err) {}
}

self.addEventListener("fetch", e => {
  const req = e.request,
    url = new URL(req.url);
  if (req.method === "GET" && isMedia(url)) {
    e.respondWith(mediaResponse(req));
    return;
  }
  if (
    req.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/.netlify/") ||
    url.pathname.startsWith("/media/") ||
    req.headers.has("range") ||
    req.cache === "no-store" ||
    url.searchParams.has("_v")
  )
    return;
  // páginas: red primero (para tener siempre la última versión), con respaldo en caché
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(r => {
          const c = r.clone();
          caches.open(CACHE).then(x => x.put("/index.html", c));
          return r;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }
  // archivos (js, css, íconos): caché primero
  e.respondWith(
    caches.match(req).then(
      hit =>
        hit ||
        fetch(req).then(r => {
          if (r.ok) {
            const c = r.clone();
            caches.open(CACHE).then(x => x.put(req, c));
          }
          return r;
        })
    )
  );
});

// tocar una notificación: abre/enfoca la app; "Anotar ya" abre la serie siguiente
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const anotar = e.action === "anotar";
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      let c = all.find(x => new URL(x.url).origin === location.origin);
      if (c) {
        try {
          await c.focus();
        } catch (err) {}
      } else c = await self.clients.openWindow(anotar ? "/?a=anotar-serie#anotar" : "/#anotar");
      if (anotar && c) c.postMessage({ type: "rest-anotar" });
    })()
  );
});
