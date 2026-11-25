// Service Worker para DMvimiento — cache básico y offline fallback
// v9: HTML network-first (los deploys se ven de inmediato); assets cache-first
const CACHE_NAME = 'dmov-v11';
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

// v10: avisos al celular de la oficina (alertas de choferes en tiempo real)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'D Movimiento', {
    body: d.body || 'Hay una alerta nueva.', icon: '/icon.svg', badge: '/icon.svg', tag: d.tag || undefined, renotify: true,
    requireInteraction: true, data: { url: d.url || '/' }, vibrate: [200, 100, 200, 100, 200],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  /* Aviso de check-in/out: abre el mapa con el lugar exacto (fuera del sistema, sin mover la pantalla abierta). */
  if (!url.startsWith(self.location.origin)) { e.waitUntil(self.clients.openWindow(url)); return; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(vs => {
    for (const v of vs) if (v.url.startsWith(self.location.origin) && 'focus' in v) { v.navigate && v.navigate(url); return v.focus(); }
    return self.clients.openWindow(url);
  }));
});
