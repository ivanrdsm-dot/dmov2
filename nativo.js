/* Lo que solo existe dentro de la app nativa (Android / iPhone, carpeta app-nativa).
   En el navegador todo esto queda apagado y el sistema funciona igual que siempre. */
import { getAuth } from "firebase/auth";

export const NATIVO = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
export const pluginNativo = nombre => { try { return NATIVO ? window.Capacitor.registerPlugin(nombre) : null; } catch { return null; } };
export const VERSION_APP_NATIVA = (() => { const m = typeof navigator !== "undefined" && /DMovApp\/([\d.]+)/.exec(navigator.userAgent || ""); return m ? m[1] : ""; })();

/* Sesión para llamar al servidor por la vía nativa (sigue funcionando con la pantalla apagada). */
const cache = { t: "", exp: 0, uid: "" };
export async function tokenNativo(app){
  const usuario = getAuth(app).currentUser;
  if(!usuario) throw new Error("Sin sesión");
  if(cache.uid === usuario.uid && cache.t && cache.exp - Date.now() > 5 * 60000) return cache.t;
  try {
    const r = await Promise.race([usuario.getIdTokenResult(), new Promise((_, no) => setTimeout(() => no(new Error("lento")), 8000))]);
    Object.assign(cache, { t: r.token, exp: Date.parse(r.expirationTime) || Date.now() + 50 * 60000, uid: usuario.uid });
  } catch {
    const http = pluginNativo("CapacitorHttp");
    const r = await http.post({ url: `https://securetoken.googleapis.com/v1/token?key=${app.options.apiKey}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: window.location.origin + "/" },
      data: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(usuario.refreshToken) });
    const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    if(!d?.id_token) throw new Error("No se pudo renovar la sesión");
    Object.assign(cache, { t: d.id_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000, uid: usuario.uid });
  }
  return cache.t;
}

/** Llama a una función del servidor (onCall) por la vía nativa. */
export async function llamarNativo(app, nombre, data){
  const http = pluginNativo("CapacitorHttp");
  const token = await tokenNativo(app);
  const r = await http.post({ url: `https://us-central1-${app.options.projectId}.cloudfunctions.net/${nombre}`,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, data: { data } });
  if(!(r.status >= 200 && r.status < 300)) throw new Error(`${nombre}: ${r.status}`);
  return (typeof r.data === "string" ? JSON.parse(r.data) : r.data)?.result;
}

/** Ubicación de la jornada con el GPS de la app (también con el celular bloqueado).
 *  `cada` filtra: una lectura cada `cadaMs` o antes si se movió `metros`. Regresa la función para apagarlo. */
export function vigilarUbicacion({ cadaMs, metros, titulo, mensaje, alLeer, alError }){
  const gps = pluginNativo("BackgroundGeolocation");
  if(!gps) return null;
  pluginNativo("LocalNotifications")?.requestPermissions?.().catch(() => {});
  let id = null, vivo = true, ultima = null;
  const lejos = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  gps.addWatcher({ backgroundTitle: titulo, backgroundMessage: mensaje, requestPermissions: true, stale: false, distanceFilter: 0 }, (l, e) => {
    if(e){ alError?.(e); return; }
    if(!l) return;
    const p = { lat: l.latitude, lng: l.longitude, tMs: Math.round(l.time || Date.now()), precisionM: l.accuracy, simulada: l.simulated === true };
    if(ultima && p.tMs - ultima.tMs < cadaMs && lejos(ultima, p) < metros) return;
    ultima = p; alLeer(p);
  }).then(x => { if(vivo) id = x; else gps.removeWatcher({ id: x }).catch(() => {}); }).catch(e => alError?.(e));
  return () => { vivo = false; if(id) gps.removeWatcher({ id }).catch(() => {}); };
}
