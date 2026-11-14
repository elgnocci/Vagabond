// Guarda la app para que abra sin conexión. Los datos del usuario no pasan por aquí: viven en IndexedDB.
const CACHE = 'vagabond-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return

  const store = (res) => {
    if (res.ok) {
      // La copia se saca ahora: después la respuesta ya fue leída y no se puede duplicar.
      const copy = res.clone()
      event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)))
    }
    return res
  }

  // Los archivos de /assets llevan un hash en el nombre: nunca cambian, sirve la copia guardada.
  if (new URL(req.url).pathname.includes('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then(store)))
    return
  }
  // El resto (la página, el ícono): primero la red, para recibir versiones nuevas; sin conexión, la copia.
  event.respondWith(fetch(req).then(store).catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))))
})
