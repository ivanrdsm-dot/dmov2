/* ENLACES DE MAPAS · saca la coordenada EXACTA de un link de Google Maps o de Waze (incluidos los cortos,
   que el servidor abre para ver a dónde llevan). Lógica pura; probada en enlaces.test.js. */

const valida = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const enMexico = p => p.lat >= 14 && p.lat <= 33.5 && p.lng >= -118.5 && p.lng <= -86;
const r6 = x => Math.sign(x) * Math.round(Math.abs(x) * 1e6) / 1e6;

/** Geohash (Waze: waze.com/ul/h9g3qk…) → coordenada del centro de la celda. */
export function geohashACoordenada(h){
  const B = "0123456789bcdefghjkmnpqrstuvwxyz", s = String(h || "").toLowerCase();
  if(!/^[0-9b-hjkmnp-z]{5,12}$/.test(s)) return null;
  let par = true; const lat = [-90, 90], lng = [-180, 180];
  for(const c of s){ const v = B.indexOf(c);
    for(let b = 4; b >= 0; b--){ const r = par ? lng : lat, m = (r[0] + r[1]) / 2; if((v >> b) & 1) r[0] = m; else r[1] = m; par = !par; } }
  return { lat: r6((lat[0] + lat[1]) / 2), lng: r6((lng[0] + lng[1]) / 2) };
}

/** Coordenada dentro de un texto o link (Google Maps, Waze o "19.43, -99.13"). */
export function coordenadaDeEnlace(texto){
  let t = String(texto ?? "").trim();
  try { t = decodeURIComponent(t); } catch {}
  if(!t) return null;
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patrones = [
    new RegExp("!3d" + num + "!4d" + num),                                  // Google: el punto exacto del lugar
    new RegExp("[?&](?:q|query|ll|destination|daddr|center|to)=(?:loc:)?" + num + "\\s*,\\s*" + num, "i"),
    new RegExp("@" + num + "," + num),                                      // Google: centro del mapa
    new RegExp("/dir/[^/]*/" + num + ",\\s*" + num),
    new RegExp("^" + num + "\\s*[,; ]\\s*" + num + "$"),
  ];
  for(const re of patrones){
    const m = t.match(re);
    if(!m) continue;
    let lat = Number(m[1]), lng = Number(m[2]);
    if((!valida(lat, lng) || !enMexico({ lat, lng })) && valida(lng, lat) && enMexico({ lat: lng, lng: lat })) [lat, lng] = [lng, lat];
    if(valida(lat, lng)) return { lat: r6(lat), lng: r6(lng) };
  }
  const w = t.match(/waze\.com\/ul\/h([0-9a-z]{5,12})/i);
  if(w) return geohashACoordenada(w[1]);
  return null;
}

/** Nombre del lugar si el link lo trae (Google: /maps/place/Walmart+Coyoacán/…). */
export function nombreDeEnlace(url){
  let t = String(url || "");
  try { t = decodeURIComponent(t); } catch {}
  const m = t.match(/\/maps\/place\/([^/@?]+)/i);
  return m ? m[1].replace(/\+/g, " ").trim().slice(0, 120) : "";
}

/** Texto buscado si el link no trae coordenada (Google: ?q=Av.+Insurgentes+123). */
export function busquedaDeEnlace(url){
  let t = String(url || "");
  const m = t.match(/[?&](?:q|query|daddr|destination)=([^&#]+)/i);
  if(!m) return "";
  try { t = decodeURIComponent(m[1].replace(/\+/g, " ")); } catch { t = m[1]; }
  return /^-?\d/.test(t.trim()) ? "" : t.trim().slice(0, 200);
}

export const esEnlaceMapa = t => /^https?:\/\/(?:[\w-]+\.)*(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|waze\.com)/i.test(String(t || "").trim());
