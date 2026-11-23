/* D Movimiento · avisos del envío en el celular del cliente (Web Push).
   Solo cubre /s/ (páginas de seguimiento). No guarda nada en caché. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const titulo = d.title || "D Movimiento";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || "Hay una novedad en tu envío.",
    icon: "/icon.svg", badge: "/icon.svg", tag: d.tag || undefined, renotify: true,
    data: { url: d.url || "/" }, vibrate: [120, 60, 120],
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ventanas => {
    for(const v of ventanas) if(v.url.split("?")[0] === url && "focus" in v) return v.focus();
    return self.clients.openWindow(url);
  }));
});
