// Service worker de la app de recepción: guarda la app completa en el equipo para que
// funcione sin conexión. Los datos de la recepción no pasan por aquí: viven en IndexedDB.
//
// Para publicar una versión nueva, cambiar VERSION. El equipo la baja en segundo plano y
// la app ofrece "Actualizar"; nunca se recarga sola en medio de una recepción.
const VERSION = 'recepcion-2026-09-25-1';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './xlsx.full.min.js',
  './icons/icono.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' salta la caché HTTP: lo que se guarda es lo recién publicado.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'activar') self.skipWaiting();
});

// La carpeta de la app (p. ej. /App_Recepcion/ en GitHub Pages). Solo esa página se abre
// desde la copia local; las demás del sitio, como pruebas/, van a la red.
const RAIZ = new URL('./', self.location).pathname;

// Primero la copia local; la red solo para lo que no esté guardado.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    if (url.pathname !== RAIZ && url.pathname !== RAIZ + 'index.html') return;
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const r = (await c.match('./')) || (await c.match('./index.html'));
      if (!r) return fetch(req);
      // Cloudflare redirige /index.html a /; una respuesta redirigida no sirve para navegar.
      return r.redirected ? new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers }) : r;
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
