/* Lugares para asignar rutas: entender lo que se pega o escribe en el buscador.
   - "19.4326, -99.1332" (coordenada)
   - Enlaces de Google Maps (@lat,lng · ?q=lat,lng · !3dLAT!4dLNG · ll=lat,lng)
   - Texto libre → se busca en el catálogo y en Mapbox.
   Todo es lógica pura (sin red) para poder probarla. */

export interface Coordenada { lat: number; lng: number; }

const enMexico = (c: Coordenada) => c.lat >= 14 && c.lat <= 33 && c.lng >= -119 && c.lng <= -86;
const valida = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Si el texto es una coordenada o un enlace de mapa, devuelve la coordenada. Si vienen al revés (lng, lat) en México, las voltea. */
export function coordenadaDeTexto(texto: unknown): Coordenada | null {
  const t = String(texto ?? "").trim();
  if(!t) return null;
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patrones = [
    new RegExp("!3d" + num + "!4d" + num),                       // Google: …!3d19.43!4d-99.13 (el punto exacto del lugar)
    new RegExp("@" + num + "," + num),                           // Google: /@19.43,-99.13,17z
    new RegExp("[?&](?:q|query|ll|destination|center)=" + num + "(?:,|%2C)\\s*" + num, "i"),
    new RegExp("^" + num + "\\s*[,; ]\\s*" + num + "$"),        // "19.43, -99.13"
  ];
  for(const re of patrones){
    const m = t.match(re);
    if(!m) continue;
    let lat = Number(m[1]), lng = Number(m[2]);
    // Al revés (lng, lat): se voltea si así cae en México o si así es la única forma válida.
    if((!valida(lat, lng) || !enMexico({ lat, lng })) && valida(lng, lat) && enMexico({ lat: lng, lng: lat })) [lat, lng] = [lng, lat];
    if(!valida(lat, lng)) continue;
    const r6 = (x: number) => Math.sign(x) * Math.round(Math.abs(x) * 1e6) / 1e6;
    return { lat: r6(lat), lng: r6(lng) };
  }
  return null;
}

/** ¿Parece un enlace corto de Google Maps (maps.app.goo.gl)? Esos no traen la coordenada: hay que abrirlo y copiar el largo. */
export const esEnlaceCortoMaps = (texto: unknown) => /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(String(texto ?? ""));

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface LugarCatalogo { id: string; nombre?: string; direccion?: string; lat?: unknown; lng?: unknown; pinConfirmado?: boolean; activo?: boolean; }

/** Lugares ya guardados que coinciden con lo escrito (todas las palabras), los confirmados primero. */
export function buscarEnCatalogo<T extends LugarCatalogo>(lugares: T[], texto: unknown, max = 5): T[] {
  const palabras = sinAcentos(String(texto ?? "").trim()).split(/\s+/).filter(p => p.length >= 2);
  if(palabras.length === 0) return [];
  return (lugares || [])
    .filter(l => l.activo !== false)
    .filter(l => { const h = sinAcentos(`${l.nombre ?? ""} ${l.direccion ?? ""}`); return palabras.every(p => h.includes(p)); })
    .sort((a, b) => Number(b.pinConfirmado === true) - Number(a.pinConfirmado === true))
    .slice(0, max);
}

/** Enlace para que el chofer abra la navegación (Google Maps decide si usa la app o el navegador). */
export const enlaceNavegar = (c: Coordenada) => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;

/** Correo interno para la cuenta del chofer cuando no tiene correo: su celular de 10 dígitos. No recibe correos. */
export const DOMINIO_CHOFERES = "choferes.denmovimiento.mx";
export function telefono10(t: unknown): string {
  const d = String(t ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}
export function correoDeChofer(usuarioOTel: unknown): string {
  const t = String(usuarioOTel ?? "").trim().toLowerCase();
  if(t.includes("@")) return t;
  const tel = telefono10(t);
  return tel.length === 10 ? `${tel}@${DOMINIO_CHOFERES}` : "";
}
