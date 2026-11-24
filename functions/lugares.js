/* DMOV · BUSCADOR DE LUGARES (oficina). Lo más importante de asignar bien una ruta: la marca exacta.
   - oficinaBuscarLugar / oficinaDetalleLugar: Google Places (el mismo buscador de Google Maps) desde el
     servidor; la llave vive en Secret Manager (GOOGLE_MAPS_KEY) y nunca llega al navegador.
     Sin llave configurada responde { fuente: "ninguna" } y la app usa Mapbox.
   - oficinaResolverEnlace: abre cualquier link de Google Maps o Waze (también los cortos maps.app.goo.gl)
     y devuelve la coordenada exacta. No necesita llave. */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { coordenadaDeEnlace, nombreDeEnlace, busquedaDeEnlace, esEnlaceMapa } from "./lib/enlaces.js";

const GOOGLE = defineSecret("GOOGLE_MAPS_KEY");
const OPC = { region: "us-central1", maxInstances: 10, memory: "256MiB", timeoutSeconds: 20 };
const CDMX = { latitude: 19.4326, longitude: -99.1332 };
const txt = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const llave = () => { const k = String(GOOGLE.value() || "").trim(); return k && k !== "PENDIENTE" ? k : ""; };

async function oficina(req){
  const a = req.auth;
  if(!a || a.token?.firebase?.sign_in_provider === "anonymous") throw new HttpsError("unauthenticated", "Inicia sesión");
  const p = await getFirestore().doc("dmov_usuarios/" + a.uid).get();
  if(!p.exists || p.data().activo !== true) throw new HttpsError("permission-denied", "Sin perfil de oficina activo");
}
const cerca = c => Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng)) ? { latitude: Number(c.lat), longitude: Number(c.lng) } : CDMX;

export const oficinaBuscarLugar = onCall({ ...OPC, secrets: [GOOGLE] }, async req => {
  await oficina(req);
  const q = txt(req.data?.q, 200), k = llave();
  if(q.length < 3) return { fuente: "google", sugerencias: [] };
  if(!k) return { fuente: "ninguna", sugerencias: [] };
  const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": k },
    body: JSON.stringify({ input: q, sessionToken: txt(req.data?.sesion, 80) || undefined, languageCode: "es", regionCode: "mx", includedRegionCodes: ["mx"],
      locationBias: { circle: { center: cerca(req.data?.cerca), radius: 50000 } } }),
  });
  if(!r.ok){ console.warn("places autocomplete", r.status, (await r.text()).slice(0, 200)); return { fuente: "ninguna", sugerencias: [], error: r.status }; }
  const d = await r.json();
  return { fuente: "google", sugerencias: (d.suggestions || []).map(s => s.placePrediction).filter(Boolean).slice(0, 8).map(p => ({
    id: p.placeId, nombre: p.structuredFormat?.mainText?.text || p.text?.text || "", detalle: p.structuredFormat?.secondaryText?.text || "" })) };
});

export const oficinaDetalleLugar = onCall({ ...OPC, secrets: [GOOGLE] }, async req => {
  await oficina(req);
  const id = txt(req.data?.id, 300), k = llave();
  if(!/^[A-Za-z0-9_-]{10,300}$/.test(id)) throw new HttpsError("invalid-argument", "Lugar no válido");
  if(!k) throw new HttpsError("failed-precondition", "El buscador de Google no está configurado");
  const s = txt(req.data?.sesion, 80);
  const r = await fetch(`https://places.googleapis.com/v1/places/${id}?languageCode=es${s ? "&sessionToken=" + encodeURIComponent(s) : ""}`, {
    signal: AbortSignal.timeout(8000), headers: { "X-Goog-Api-Key": k, "X-Goog-FieldMask": "id,displayName,formattedAddress,location" } });
  if(!r.ok) throw new HttpsError("unavailable", "Google no respondió; intenta otra vez");
  const d = await r.json();
  const lat = Number(d.location?.latitude), lng = Number(d.location?.longitude);
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpsError("not-found", "Ese lugar no trae ubicación");
  return { nombre: d.displayName?.text || "", direccion: d.formattedAddress || "", lat, lng, fuente: "google" };
});

/** Abre el link (siguiendo redirecciones, solo a sitios de mapas) hasta encontrar la coordenada. */
export const oficinaResolverEnlace = onCall({ ...OPC, secrets: [GOOGLE] }, async req => {
  await oficina(req);
  let url = txt(req.data?.url, 2000);
  if(!esEnlaceMapa(url)) throw new HttpsError("invalid-argument", "Pega un link de Google Maps o de Waze");
  let nombre = nombreDeEnlace(url);
  for(let i = 0; i < 6; i++){
    const c = coordenadaDeEnlace(url);
    if(c) return { ...c, nombre, url };
    let r;
    try { r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Mozilla/5.0 (DMovimiento)" } }); }
    catch { break; }
    const sig = r.headers.get("location");
    if(!sig){
      /* Algunos links regresan la página con la ubicación adentro. */
      const html = (await r.text().catch(() => "")).slice(0, 300000);
      const m = html.match(/https?:\/\/(?:www\.)?google\.[a-z.]+\/maps[^"'\s<>]+/i);
      const c2 = coordenadaDeEnlace(m?.[0] || "") || coordenadaDeEnlace(html.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/)?.slice(1).join(",") || "");
      if(c2) return { ...c2, nombre: nombre || nombreDeEnlace(m?.[0] || ""), url };
      break;
    }
    url = new URL(sig, url).href;
    if(!esEnlaceMapa(url) && !/consent\.google/i.test(url)) break;
    nombre = nombre || nombreDeEnlace(url);
  }
  /* Sin coordenada: si el link trae una dirección escrita, se busca con Google (si está configurado). */
  const texto = busquedaDeEnlace(url) || nombre;
  const k = llave();
  if(texto && k){
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": k, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location" },
      body: JSON.stringify({ textQuery: texto, languageCode: "es", regionCode: "mx", pageSize: 1 }) }).catch(() => null);
    const p = r?.ok ? (await r.json()).places?.[0] : null;
    if(p?.location) return { lat: p.location.latitude, lng: p.location.longitude, nombre: p.displayName?.text || nombre, direccion: p.formattedAddress || "", url, aproximado: true };
  }
  return { sinCoordenada: true, texto, url };
});
