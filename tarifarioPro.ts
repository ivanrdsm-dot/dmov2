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
