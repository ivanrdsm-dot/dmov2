/* COSTOS REALES Y MARGEN POR SERVICIO · lógica pura.
   La oficina captura lo que de verdad costó cada servicio. Nada se borra: un costo
   mal capturado se anula con motivo. El total lo recalcula el servidor.
   El margen solo se calcula cuando hay precio aprobado Y costos capturados:
   un servicio sin costos no tiene "100 % de margen", tiene costos pendientes. */

export const CONCEPTOS_COSTO = ["Proveedor / flete externo", "Combustible", "Casetas", "Viáticos", "Ayudantes / maniobra", "Chofer", "Otro"] as const;
export type ConceptoCosto = typeof CONCEPTOS_COSTO[number];
export const MONTO_MAX = 10_000_000;

export interface Costo { id?: string; concepto?: string; monto?: number | string; nota?: string; anulado?: boolean; [k: string]: unknown; }

const num = (v: unknown): number => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : NaN; };

export function validarCosto(c: Costo): string[] {
  const e: string[] = [];
  if(!CONCEPTOS_COSTO.includes(c.concepto as ConceptoCosto)) e.push("Concepto");
  const m = Math.round(num(c.monto) * 100) / 100;   // se guarda a centavos: 0.004 no es un monto
  if(!(m > 0)) e.push("Monto mayor a cero");
  else if(m >= MONTO_MAX) e.push("Monto fuera de rango");
  if(c.concepto === "Otro" && !String(c.nota ?? "").trim()) e.push("Nota: di qué fue");
  return e;
}

/** Suma de los costos vigentes (los anulados no cuentan), redondeada a centavos. */
export function totalCostos(costos: Costo[]): { total: number; n: number; porConcepto: Record<string, number> } {
  let total = 0, n = 0;
  const porConcepto: Record<string, number> = {};
  for(const c of costos ?? []){
    if(c.anulado) continue;
    const m = num(c.monto);
    if(!(m > 0)) continue;
    total += m; n++;
    const k = String(c.concepto ?? "Otro");
    porConcepto[k] = Math.round(((porConcepto[k] ?? 0) + m) * 100) / 100;
  }
  return { total: Math.round(total * 100) / 100, n, porConcepto };
}

export type EstadoMargen = "sin precio" | "sin costos" | "con margen" | "pérdida";
export interface Margen { precio: number | null; costo: number | null; margen: number | null; margenPct: number | null; estado: EstadoMargen; }
/** Margen de un servicio con su precio aprobado y su costo total. */
export function margenServicio(s: { precio?: unknown; costoTotal?: unknown; costosN?: unknown }): Margen {
  const p = num(s.precio), c = num(s.costoTotal), n = num(s.costosN);
  const precio = p > 0 ? p : null, costo = n > 0 && c >= 0 ? c : null;
  if(precio === null) return { precio, costo, margen: null, margenPct: null, estado: "sin precio" };
  if(costo === null) return { precio, costo, margen: null, margenPct: null, estado: "sin costos" };
  const margen = Math.round((precio - costo) * 100) / 100;
  return { precio, costo, margen, margenPct: Math.round(margen / precio * 1000) / 10, estado: margen < 0 ? "pérdida" : "con margen" };
}
