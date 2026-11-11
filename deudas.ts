/* DEUDAS · separa lo que se le debe a PROVEEDORES de otras deudas que la balanza
   también trae como "por pagar" (préstamos, intereses, PTU, impuestos, acreedores
   diversos, caja chica). Antes todo se sumaba como "Por pagar a proveedores".
   Se decide con la categoría y con el texto del concepto (que trae la cuenta de
   balanza). Lógica pura; probada en deudas.test.js. */

export type TipoDeuda = "Proveedores" | "Préstamos e intereses" | "Impuestos y seguridad social" | "PTU" | "Otras deudas";
export const TIPOS_DEUDA: TipoDeuda[] = ["Proveedores", "Préstamos e intereses", "Impuestos y seguridad social", "PTU", "Otras deudas"];

const sin = (s: unknown): string => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function tipoDeuda(p: { categoria?: string; concepto?: string }): TipoDeuda {
  const c = sin(p.concepto), cat = sin(p.categoria);
  if(/prestamo|intereses?\b|interes devengad/.test(c)) return "Préstamos e intereses";
  if(/\bptu\b|participacion de (los )?trabajadores/.test(c)) return "PTU";
  if(cat === "impuestos" || /impuesto|isr|iva ret|imss|infonavit|\bsar\b|seguridad social|retenid/.test(c)) return "Impuestos y seguridad social";
  if(/acreedor|caja chica|reembolso/.test(c)) return "Otras deudas";
  return "Proveedores";
}

/** Lo pendiente de pagar, separado por tipo de deuda. */
export function porPagarPorTipo(pagos: { status?: string; total?: number | string; categoria?: string; concepto?: string }[]){
  const out = Object.fromEntries(TIPOS_DEUDA.map(t => [t, { monto: 0, n: 0 }])) as Record<TipoDeuda, { monto: number; n: number }>;
  for(const p of pagos ?? []){
    if(p.status === "Pagado") continue;
    const t = tipoDeuda(p), m = Number(p.total) || 0;
    out[t].monto = Math.round((out[t].monto + m) * 100) / 100; out[t].n++;
  }
  return out;
}
