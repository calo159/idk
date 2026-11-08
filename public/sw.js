/* Service worker de Surtix: deja el POS usable sin internet.
 * - Archivos estáticos de Next: cache primero.
 * - Páginas del POS: red primero; si no hay red, la última copia guardada.
 * - Nada de /api ni de acciones de servidor (POST) pasa por la caché.
 * Las ventas hechas offline viven en IndexedDB (cola) y se envían al volver el internet.
 */
const VERSION = "surtix-v1";
const ESTATICOS = `${VERSION}-estaticos`;
const PAGINAS = `${VERSION}-paginas`;
const PAGINAS_OFFLINE = ["/ventas/pos", "/caja", "/ventas/ruta"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGINAS).then((c) => c.add("/offline.html")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  // Al cerrar sesión se borran las páginas guardadas (no dejar datos del negocio en un equipo compartido).
  if (e.data === "limpiar") e.waitUntil(caches.delete(PAGINAS).then(() => caches.open(PAGINAS)).then((c) => c.add("/offline.html")));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.open(ESTATICOS).then(async (cache) => {
        const guardado = await cache.match(req);
        if (guardado) return guardado;
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      }),
    );
    return;
  }

  if (req.mode === "navigate" && PAGINAS_OFFLINE.includes(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          // Solo respuestas reales (no redirecciones al login). Solo se guarda la página genérica: sin parámetros, o con
          // «?cliente=» (que el navegador lee por su cuenta). Así un pedido o cotización precargados nunca reaparecen sin internet.
          const generica = !url.search || (url.searchParams.size === 1 && url.searchParams.has("cliente"));
          if (resp.ok && !resp.redirected && generica) {
            const copia = resp.clone();
            caches.open(PAGINAS).then((c) => c.put(url.origin + url.pathname, copia));
          }
          return resp;
        })
        // «/ventas/pos?cliente=…» sin internet cae a la última copia del POS sin parámetros.
        .catch(async () => (await caches.match(url.origin + url.pathname)) || (await caches.match("/offline.html"))),
    );
  }
});
