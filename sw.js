/*
 * Service worker: guarda la aplicación en caché para abrirla sin conexión.
 * Nunca almacena respuestas del servidor (datos de observaciones).
 * Al publicar una nueva versión, cambie CACHE para forzar la actualización.
 */
var CACHE = 'previgest-ia-v1.0.0';
var ARCHIVOS = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/util.js', 'js/db.js', 'js/imagen.js', 'js/api.js', 'js/informe.js', 'js/app.js',
  'assets/logo.svg', 'assets/icon.svg', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API: siempre red
  // Red primero para tener la última versión; caché si no hay conexión.
  e.respondWith(
    fetch(e.request).then(function (r) {
      if (r && r.ok) {
        var copia = r.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
      }
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});
