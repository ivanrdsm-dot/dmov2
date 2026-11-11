/* COBRANZA · una sola regla para todas las pantallas (Inicio, Resumen ejecutivo,
   Portal financiero, Facturación). Antes había 4 reglas distintas de "vencida":
   unas solo contaban el estado "Vencida" (que nadie pone solo), otras la fecha.
   Lógica pura; probada en cobranza.test.js. */

export interface FacturaCobro { status?: string; tipoDocumento?: string; total?: number | string; fechaVenc?: string; [k: string]: unknown; }

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const NO_EMITIDA = ["Cancelada", "Solicitada a Katia", "Solicitud interna"];

/** Factura que sí existe para cobrar: no cancelada, no solo solicitada, con monto. */
export const facturaEmitida = (f: FacturaCobro): boolean =>
  !!f && !NO_EMITIDA.includes(String(f.status)) && f.tipoDocumento !== "solicitud_interna" && n(f.total) > 0;

/** Emitida y sin pagar. */
export const facturaPorCobrar = (f: FacturaCobro): boolean => facturaEmitida(f) && f.status !== "Pagada";

/** Por cobrar y ya pasó su fecha de vencimiento (o alguien la marcó "Vencida"). */
export function facturaVencida(f: FacturaCobro, hoyMs: number): boolean {
  if(!facturaPorCobrar(f)) return false;
  if(f.fechaVenc){ const t = new Date(String(f.fechaVenc) + (String(f.fechaVenc).length === 10 ? "T23:59:59" : "")).getTime(); return Number.isFinite(t) && t < hoyMs; }
  return f.status === "Vencida";
}

/** Por cobrar sin fecha de vencimiento: no se sabe si ya se atrasó. */
export const facturaSinFechaVenc = (f: FacturaCobro): boolean => facturaPorCobrar(f) && !f.fechaVenc && f.status !== "Vencida";

/** Días de atraso (0 si no está vencida o no tiene fecha). */
export function diasDeAtraso(f: FacturaCobro, hoyMs: number): number {
  if(!facturaVencida(f, hoyMs) || !f.fechaVenc) return 0;
  return Math.max(0, Math.floor((hoyMs - new Date(String(f.fechaVenc) + "T12:00:00").getTime()) / 86400000));
}

export function resumenCobranza(facturas: FacturaCobro[], hoyMs: number){
  let porCobrar = 0, vencido = 0, sinFecha = 0, nPorCobrar = 0, nVencidas = 0, nSinFecha = 0;
  for(const f of facturas ?? []){
    if(!facturaPorCobrar(f)) continue;
    const t = n(f.total); porCobrar += t; nPorCobrar++;
    if(facturaVencida(f, hoyMs)){ vencido += t; nVencidas++; }
    else if(facturaSinFechaVenc(f)){ sinFecha += t; nSinFecha++; }
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return { porCobrar: r(porCobrar), vencido: r(vencido), sinFecha: r(sinFecha), nPorCobrar, nVencidas, nSinFecha };
}
