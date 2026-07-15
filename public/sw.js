// Service Worker para DMvimiento — cache básico y offline fallback
// v9: HTML network-first (los deploys se ven de inmediato); assets cache-first
const CACHE_NAME = 'dmov-v9';
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS).catch(()=>{}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // No cachear Firestore, Mapbox API ni analytics
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebasestorage') ||
      url.hostname.includes('api.mapbox.com') ||
      url.hostname.includes('events.mapbox.com') ||
      url.hostname.includes('google.com')) return;

  // HTML / navegación: SIEMPRE red primero — así cada deploy se ve al instante.
  // Solo se usa el cache si no hay conexión (modo offline).
  const isNav = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isNav) {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('/')))
    );
    return;
  }

  // Assets (JS/CSS con hash en el nombre): cache-first — inmutables entre deploys
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match('/'));
    })
  );
});
