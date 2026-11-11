/* TABLAS DEL COTIZADOR PRO · salen SOLO del Tarifario (Firestore).
   Antes el Cotizador Pro tenía precios escritos en el código: 214 ciudades con
   precio calculado por fórmula, resguardo y entrega adicional distintos al Excel
   del dueño. Ahora no hay un solo precio en el código: lo que no está en el
   tarifario no tiene precio y se dice. Lógica pura; probada en tarifarioPro.test.js. */
import { UNIDADES_TARIFA, sinAcentos, type Tarifa, type UnidadTarifa } from "./tarifario.ts";

export type PreciosLocales = Partial<Record<"normal" | "ayudante" | "urgente" | "urgente_ay" | "resguardo" | "renta_dia" | "renta_chofer" | "renta_mes", number>>;
export interface CiudadPro { id: string; c: string; km: number; local: boolean; eur?: number; cam?: number; kra?: number; rab?: number; mud?: number; }
export interface TablasPro {
  ciudades: CiudadPro[];
  local: Partial<Record<UnidadTarifa, PreciosLocales>>;
  entregaAdicionalLocal: number | null;
  faltantes: string[];
}

/* Concepto del Cotizador Pro → nombre de la tarifa local en el tarifario. */
export const CONCEPTOS_LOCALES: [keyof PreciosLocales, string][] = [
  ["normal", "Viaje local"],
  ["ayudante", "Viaje local con 1 ayudante y/o maniobra"],
  ["urgente", "Viaje urgente"],
  ["urgente_ay", "Viaje urgente con 1 ayudante"],
  ["resguardo", "Resguardo de materiales x 1 dia"],
  ["renta_dia", "Renta por dia sin chofer"],
  ["renta_chofer", "Renta por dia con chofer local"],
  ["renta_mes", "Renta por mes sin chofer"],
];
export const NOMBRE_ENTREGA_ADICIONAL = "Entrega adicional en ruta local";
export const CDMX = "Ciudad de México";

const positivo = (v: unknown): number | undefined => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined; };
const preciosBase = (t: Tarifa): Partial<Record<UnidadTarifa, number>> => {
  const o: Partial<Record<UnidadTarifa, number>> = {};
  for(const { k } of UNIDADES_TARIFA){ const v = positivo(t.base?.[k]); if(v !== undefined) o[k] = v; }
  return o;
};

export function tablasPro(tarifas: Tarifa[]): TablasPro {
  const vivas = (tarifas ?? []).filter(t => t && t.activo !== false);
  const locales = vivas.filter(t => t.tipo === "local");
  const porNombre = (nombre: string) => locales.find(t => sinAcentos(t.nombre) === sinAcentos(nombre)) ?? null;
  const faltantes: string[] = [];

  const local: TablasPro["local"] = {};
  for(const [concepto, nombre] of CONCEPTOS_LOCALES){
    const t = porNombre(nombre);
    if(!t){ faltantes.push(`Tarifa local "${nombre}"`); continue; }
    for(const [k, v] of Object.entries(preciosBase(t)) as [UnidadTarifa, number][]) (local[k] ??= {})[concepto] = v;
  }
  const ea = porNombre(NOMBRE_ENTREGA_ADICIONAL);
  const entregaAdicionalLocal = positivo(ea?.valorUnico) ?? null;
  if(entregaAdicionalLocal === null) faltantes.push(`Tarifa local "${NOMBRE_ENTREGA_ADICIONAL}"`);

  const ciudades: CiudadPro[] = vivas.filter(t => t.tipo === "nacional" && String(t.nombre ?? "").trim())
    .map(t => ({ id: String(t.id ?? ""), c: String(t.nombre).trim(), km: Math.max(0, Number(t.km) || 0), local: false, ...preciosBase(t) }))
    .sort((a, b) => a.c.localeCompare(b.c, "es"));
  /* La Ciudad de México se cotiza con el viaje local del tarifario (no es una ciudad del tarifario nacional). */
  if(!ciudades.some(c => sinAcentos(c.c) === sinAcentos(CDMX))){
    const normal: Partial<Record<UnidadTarifa, number>> = {};
    for(const { k } of UNIDADES_TARIFA){ const v = local[k]?.normal; if(v) normal[k] = v; }
    if(Object.keys(normal).length) ciudades.unshift({ id: "local_viaje-local", c: CDMX, km: 0, local: true, ...normal });
  }
  for(const c of ciudades) if(!c.km && !c.local) faltantes.push(`Kilómetros de ${c.c}`);
  return { ciudades, local, entregaAdicionalLocal, faltantes };
}

/** Precio sugerido por punto adicional: solo existe el de ruta local del tarifario.
    Fuera de la zona local no hay tarifa: devuelve null y el precio se captura a mano. */
export function puntoAdicionalSugerido(t: Pick<TablasPro, "entregaAdicionalLocal">, km: number | null | undefined): number | null {
  return !km || km <= 0 ? t.entregaAdicionalLocal : null;
}

/* ─── Reglas del Cotizador Pro que no son precios por destino ───────────────────
   Antes estaban escritas en el código; ahora viven en el Tarifario (tipo "regla")
   y el dueño las cambia ahí. `valorInicial` es el valor que tenía el código: solo
   lo usa la migración que da de alta cada regla una vez. */
export interface ReglaPro { clave: ClaveRegla; nombre: string; unidad: "%" | "$" | "puntos"; descripcion: string; valorInicial: number; }
export type ClaveRegla = "urgente_pct" | "descuento_puntos_pct" | "descuento_puntos_tramo" | "descuento_puntos_tope" | "ayudante_foraneo" | "hotel_noche" | "comida_dia";
export const REGLAS_PRO: ReglaPro[] = [
  { clave: "urgente_pct", nombre: "Recargo por viaje urgente (foráneo y distribución)", unidad: "%", valorInicial: 35, descripcion: "Se suma al flete y a los puntos adicionales cuando el viaje foráneo o la distribución es urgente." },
  { clave: "descuento_puntos_pct", nombre: "Descuento por volumen: % por tramo", unidad: "%", valorInicial: 5, descripcion: "Descuento sobre los puntos adicionales por cada tramo completo de puntos." },
  { clave: "descuento_puntos_tramo", nombre: "Descuento por volumen: puntos por tramo", unidad: "puntos", valorInicial: 20, descripcion: "Cada cuántos puntos de entrega se gana un tramo de descuento." },
  { clave: "descuento_puntos_tope", nombre: "Descuento por volumen: tope", unidad: "%", valorInicial: 20, descripcion: "Descuento máximo sobre los puntos adicionales." },
  { clave: "ayudante_foraneo", nombre: "Ayudante o maniobra en viaje foráneo", unidad: "$", valorInicial: 2800, descripcion: "Precio por ayudante en un viaje foráneo." },
  { clave: "hotel_noche", nombre: "Hotel por unidad por noche", unidad: "$", valorInicial: 1100, descripcion: "Viáticos: una habitación por unidad, por noche." },
  { clave: "comida_dia", nombre: "Comida por persona por día", unidad: "$", valorInicial: 700, descripcion: "Viáticos: comida de cada persona en ruta, por día." },
];
export const idRegla = (clave: string): string => `regla_${clave}`;

/** Valores vigentes de las reglas. Una regla que no está (o está dada de baja) no se inventa: falta. */
export function reglasPro(tarifas: Tarifa[]): { valores: Partial<Record<ClaveRegla, number>>; faltantes: string[] } {
  const valores: Partial<Record<ClaveRegla, number>> = {}, faltantes: string[] = [];
  for(const r of REGLAS_PRO){
    const t = (tarifas ?? []).find(x => x && x.tipo === "regla" && x.clave === r.clave && x.activo !== false);
    const v = Number(t?.valor);
    if(t && t.valor !== null && t.valor !== undefined && Number.isFinite(v) && v >= 0) valores[r.clave] = v;
    else faltantes.push(`Regla "${r.nombre}"`);
  }
  return { valores, faltantes };
}

/** Descuento por volumen de puntos con las reglas vigentes (0 si alguna falta). */
export function descuentoPorPuntos(valores: Partial<Record<ClaveRegla, number>>, puntos: number): number {
  const pct = valores.descuento_puntos_pct, tramo = valores.descuento_puntos_tramo, tope = valores.descuento_puntos_tope;
  if(!(pct! > 0) || !(tramo! >= 1) || tope === undefined) return 0;
  return Math.min(tope / 100, Math.floor((Number(puntos) || 0) / tramo!) * pct! / 100);
}
