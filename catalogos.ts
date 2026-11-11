/* ═══════════════════════════════════════════════════════════════════════════
   CATÁLOGOS OPERATIVOS · puntos de entrega y proveedores
   - Un punto no se usa en ruta hasta tener coordenada y pin confirmado.
   - Un proveedor no queda habilitado sin sus documentos obligatorios vigentes.
   - Lo que falta se reporta como PENDIENTE; nada se supone.
   Lógica pura; probada en catalogos.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */

export const RADIO_GEOCERCA_DEFAULT_M = 150;
const txt = (v: unknown): string => String(v ?? "").trim();

export interface Coordenada { lat: number; lng: number; }

/** Acepta "19.4326, -99.1332" (como lo copia Google Maps) o con espacio. null si no es válida. */
export function parsearCoordenadas(texto: unknown): Coordenada | null {
  const m = /^\s*\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?\s*$/.exec(String(texto ?? ""));
  if(!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if(!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
/** Caja aproximada de México: sirve para avisar de coordenadas invertidas o mal copiadas. */
export const dentroDeMexico = (c: Coordenada): boolean => c.lat >= 14 && c.lat <= 33 && c.lng >= -118.6 && c.lng <= -86.5;

export interface PuntoEntrega {
  nombre?: string; direccion?: string; lat?: number | string; lng?: number | string; radioM?: number | string;
  pinConfirmado?: boolean; horario?: string; contacto?: string; telefono?: string; notasAcceso?: string; activo?: boolean;
  [k: string]: unknown;
}
export function coordenadaDe(p: PuntoEntrega): Coordenada | null {
  if(p.lat === "" || p.lng === "" || p.lat === undefined || p.lng === undefined || p.lat === null || p.lng === null) return null;
  return parsearCoordenadas(`${p.lat}, ${p.lng}`);
}
export function validarPunto(p: PuntoEntrega): { ok: boolean; errores: string[]; pendientes: string[]; avisos: string[] } {
  const errores: string[] = [], pendientes: string[] = [], avisos: string[] = [];
  if(!txt(p.nombre)) errores.push("Nombre del punto");
  if(!txt(p.direccion)) errores.push("Dirección");
  const hayAlgo = txt(p.lat) || txt(p.lng);
  const c = coordenadaDe(p);
  if(hayAlgo && !c) errores.push("Coordenada con formato latitud, longitud");
  if(!c) pendientes.push("Coordenada");
  else if(!dentroDeMexico(c)) avisos.push("La coordenada cae fuera de México: revisa que no esté invertida");
  if(c && !p.pinConfirmado) pendientes.push("Confirmar el pin en el mapa");
  const r = Number(p.radioM);
  if(txt(p.radioM) && !(r >= 30 && r <= 2000)) errores.push("Radio de geocerca entre 30 y 2,000 metros");
  if(!txt(p.horario)) pendientes.push("Horario de recepción");
  if(!txt(p.contacto)) pendientes.push("Contacto que recibe");
  return { ok: errores.length === 0, errores, pendientes, avisos };
}
/** Solo un punto con coordenada válida y pin confirmado puede validar una geocerca. */
export const puntoListoParaRuta = (p: PuntoEntrega): boolean => p.activo !== false && !!coordenadaDe(p) && p.pinConfirmado === true;
export const radioDe = (p: PuntoEntrega): number => { const r = Number(p.radioM); return r >= 30 && r <= 2000 ? r : RADIO_GEOCERCA_DEFAULT_M; };

/* ── Proveedores ─────────────────────────────────────────────────────────── */
export const DOCUMENTOS_PROVEEDOR = [
  { id: "seguroUnidad", nombre: "Seguro vigente de la unidad", obligatorio: true },
  { id: "tarjetaCirculacion", nombre: "Tarjeta de circulación", obligatorio: true },
  { id: "licenciaOperador", nombre: "Licencia del operador", obligatorio: false },
  { id: "seguroCarga", nombre: "Seguro de carga", obligatorio: false },
] as const;

export type EstadoDocumento = "vigente" | "por vencer" | "vencido" | "sin registrar";
/** `vence` y `hoy` en formato AAAA-MM-DD. Por vencer = 30 días o menos. */
export function estadoDocumento(vence: unknown, hoyISO: string): EstadoDocumento {
  const v = txt(vence);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "sin registrar";
  if(v < hoyISO) return "vencido";
  const dias = Math.round((Date.parse(v + "T00:00:00Z") - Date.parse(hoyISO + "T00:00:00Z")) / 86400000);
  return dias <= 30 ? "por vencer" : "vigente";
}

export interface Proveedor {
  nombre?: string; contacto?: string; telefono?: string; correo?: string; comisionPct?: number | string;
  emiteCartaPorte?: boolean; documentos?: Record<string, string>; unidades?: string; activo?: boolean;
  [k: string]: unknown;
}
export function validarProveedor(p: Proveedor): { ok: boolean; errores: string[]; pendientes: string[] } {
  const errores: string[] = [], pendientes: string[] = [];
  if(!txt(p.nombre)) errores.push("Nombre del proveedor");
  const c = Number(p.comisionPct);
  if(txt(p.comisionPct) && !(c >= 0 && c <= 100)) errores.push("Comisión entre 0 y 100 %");
  if(!txt(p.contacto)) pendientes.push("Persona de contacto");
  if(!txt(p.telefono)) pendientes.push("Teléfono");
  if(!txt(p.comisionPct)) pendientes.push("Comisión acordada");
  if(!txt(p.unidades)) pendientes.push("Unidades que ofrece");
  return { ok: errores.length === 0, errores, pendientes };
}
/** Habilitado para recibir servicios: activo y con todos los documentos obligatorios sin vencer. */
export function proveedorHabilitado(p: Proveedor, hoyISO: string): { habilitado: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if(p.activo === false) motivos.push("Proveedor dado de baja");
  for(const d of DOCUMENTOS_PROVEEDOR.filter(x => x.obligatorio)){
    const e = estadoDocumento(p.documentos?.[d.id], hoyISO);
    if(e === "sin registrar") motivos.push(`${d.nombre}: sin registrar`);
    else if(e === "vencido") motivos.push(`${d.nombre}: vencido`);
  }
  return { habilitado: motivos.length === 0, motivos };
}
