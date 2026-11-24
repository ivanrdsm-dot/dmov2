/* ═══════════════════════════════════════════════════════════════════════════
   FINANZAS · los números del sistema, listos para la oficina y para los socios.
   - resumenFacturacion: facturado, cobrado y pendiente por mes y por cliente (facturas del sistema).
   - antiguedadPendientes: cuánto tiempo lleva cada factura sin cobrarse.
   - conciliacionContable: lo que dice el sistema contra lo que dice la contabilidad (Macotela/DFG)
     a la fecha de corte, cliente por cliente. NO marca nada como pagado: señala qué revisar.
   Nada se inventa: si un dato no está, se reporta como "sin dato".
   Lógica pura: sin Firebase. Probada en finanzas.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */

import { facturaEmitida, facturaPorCobrar, type FacturaCobro } from "./cobranza.ts";

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export interface Factura {
  id?: string; folio?: string; empresa?: string; clienteId?: string; _clienteId?: string; status?: string;
  subtotal?: number | string; total?: number | string; mesOp?: string; anio?: number | string; fechaEmision?: string; fechaPago?: string; [k: string]: unknown;
}
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const t = (v: unknown) => String(v ?? "").trim();
/* Misma regla que el resto del sistema (cobranza.ts): solo cuenta lo emitido (no canceladas, ni solo solicitadas, total > 0). */
export const cancelada = (f: Factura) => !facturaEmitida(f as FacturaCobro);
export const pagada = (f: Factura) => facturaEmitida(f as FacturaCobro) && t(f.status) === "Pagada";
export const pendiente = (f: Factura) => facturaPorCobrar(f as FacturaCobro);

/** Índice del mes de operación (0–11) y año. "Sep" + 2026 → { mes: 8, anio: 2026 }. */
export function periodoDe(f: Factura): { mes: number; anio: number } | null {
  const mes = MESES_CORTOS.findIndex(m => t(f.mesOp).slice(0, 3).toLowerCase() === m.toLowerCase());
  const anio = Math.round(n(f.anio)) || Number(t(f.fechaEmision).slice(0, 4)) || 0;
  if(mes >= 0 && anio) return { mes, anio };
  const m = t(f.fechaEmision).match(/^(\d{4})-(\d{2})/);
  return m ? { mes: Number(m[2]) - 1, anio: Number(m[1]) } : null;
}

/** Nombre para agrupar empresas: sin acentos, sin "S.A. de C.V.", sin signos. */
export function claveEmpresa(nombre: unknown): string {
  return t(nombre).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/&/g, " ").replace(/[.,]/g, " ")
    .replace(/\b(S\s*A\s*P\s*I|S\s*A|S\s*DE\s*R\s*L|DE|C\s*V|Y|AND|ADMON|ADMINISTRACION|ADMINISTRACIÓN)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
/** ¿Es el mismo cliente? (las dos primeras palabras importantes coinciden: "MARKETING PROMOTION", "G MAP"…) */
export function mismaEmpresa(a: unknown, b: unknown): boolean {
  const x = claveEmpresa(a).split(" ").slice(0, 2).join(" "), y = claveEmpresa(b).split(" ").slice(0, 2).join(" ");
  return !!x && !!y && (x === y || x.replace(/ /g, "") === y.replace(/ /g, ""));
}

export function resumenFacturacion(facturas: Factura[], { anio }: { anio?: number } = {}) {
  const vivas = (facturas || []).filter(f => !cancelada(f) && (!anio || periodoDe(f)?.anio === anio));
  const meses = MESES_CORTOS.map((m, i) => ({ mes: m, i, facturado: 0, cobrado: 0, pendiente: 0, subtotal: 0, n: 0 }));
  const clientes: Record<string, { empresa: string; facturado: number; cobrado: number; pendiente: number; n: number; nPendientes: number; ultima: string }> = {};
  let sinPeriodo = 0;
  for(const f of vivas){
    const p = periodoDe(f), total = n(f.total);
    if(p){ const m = meses[p.mes]; m.facturado += total; m.subtotal += n(f.subtotal); m.n++; if(pagada(f)) m.cobrado += total; else m.pendiente += total; }
    else sinPeriodo++;
    const k = claveEmpresa(f.empresa) || "SIN CLIENTE";
    const c = clientes[k] ||= { empresa: t(f.empresa) || "Sin cliente", facturado: 0, cobrado: 0, pendiente: 0, n: 0, nPendientes: 0, ultima: "" };
    c.facturado += total; c.n++;
    if(pagada(f)) c.cobrado += total; else { c.pendiente += total; c.nPendientes++; }
    const fe = t(f.fechaEmision); if(fe > c.ultima) c.ultima = fe;
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  const totales = vivas.reduce<{ facturado: number; cobrado: number; pendiente: number }>((s, f) => ({ facturado: s.facturado + n(f.total), cobrado: s.cobrado + (pagada(f) ? n(f.total) : 0), pendiente: s.pendiente + (pagada(f) ? 0 : n(f.total)) }), { facturado: 0, cobrado: 0, pendiente: 0 });
  return {
    meses: meses.map(m => ({ ...m, facturado: r(m.facturado), cobrado: r(m.cobrado), pendiente: r(m.pendiente), subtotal: r(m.subtotal) })),
    clientes: Object.values(clientes).map(c => ({ ...c, facturado: r(c.facturado), cobrado: r(c.cobrado), pendiente: r(c.pendiente) })).sort((a, b) => b.facturado - a.facturado),
    totales: { facturado: r(totales.facturado), cobrado: r(totales.cobrado), pendiente: r(totales.pendiente) },
    nFacturas: vivas.length, sinPeriodo,
  };
}

/** Fecha de referencia de una factura: su emisión; si no tiene, el último día de su mes de operación. */
export function fechaReferencia(f: Factura): string {
  const fe = t(f.fechaEmision);
  if(/^\d{4}-\d{2}-\d{2}/.test(fe)) return fe.slice(0, 10);
  const p = periodoDe(f);
  if(!p) return "";
  const ultimo = new Date(Date.UTC(p.anio, p.mes + 1, 0)).toISOString().slice(0, 10);
  return ultimo;
}

export const TRAMOS = ["0–30 días", "31–60 días", "61–90 días", "Más de 90 días"] as const;
export function antiguedadPendientes(facturas: Factura[], hoyISO: string) {
  const hoy = Date.parse(hoyISO + "T12:00:00Z");
  const tramos = TRAMOS.map(nombre => ({ nombre, total: 0, n: 0 }));
  const lista = (facturas || []).filter(pendiente).map(f => {
    const ref = fechaReferencia(f), dias = ref ? Math.max(0, Math.floor((hoy - Date.parse(ref + "T12:00:00Z")) / 86400000)) : null;
    const i = dias === null ? 3 : dias <= 30 ? 0 : dias <= 60 ? 1 : dias <= 90 ? 2 : 3;
    tramos[i].total += n(f.total); tramos[i].n++;
    return { id: f.id, folio: t(f.folio), empresa: t(f.empresa), total: n(f.total), fecha: ref, dias, tramo: TRAMOS[i], periodo: periodoDe(f) };
  }).sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));
  return { tramos: tramos.map(x => ({ ...x, total: Math.round(x.total * 100) / 100 })), lista };
}

/**
 * Sistema contra contabilidad a la fecha de corte, por cliente.
 * contable: { "Marketing & Promotion": 122832.4, ... } (saldo de CLIENTES en la balanza al corte).
 * Solo se comparan facturas pendientes con fecha de referencia ≤ corte; las posteriores se muestran aparte.
 */
export function conciliacionContable(facturas: Factura[], contable: Record<string, number>, corteISO: string) {
  const pend = (facturas || []).filter(pendiente);
  const usadas = new Set<string>();
  const filas = Object.entries(contable || {}).map(([cliente, saldo]) => {
    const suyas = pend.filter(f => mismaEmpresa(f.empresa, cliente));
    suyas.forEach(f => usadas.add(t(f.id) || t(f.folio)));
    const alCorte = suyas.filter(f => { const r = fechaReferencia(f); return r && r <= corteISO; });
    const despues = suyas.filter(f => !alCorte.includes(f));
    const sistema = Math.round(alCorte.reduce((s, f) => s + n(f.total), 0) * 100) / 100;
    const dif = Math.round((n(saldo) - sistema) * 100) / 100;
    const estado = Math.abs(dif) < 1 ? "Cuadra" : dif > 0 ? "La contabilidad tiene más" : "El sistema tiene más";
    const que = estado === "Cuadra" ? "Sin diferencia."
      : dif > 0 ? "Hay facturas en la contabilidad que en el sistema no están como pendientes (o se registraron con otra fecha). Revisar folios con el despacho."
      : "El sistema tiene facturas pendientes que la contabilidad ya no tiene: probablemente ya se cobraron. Confirmar el depósito y registrar el cobro.";
    return { cliente, contable: Math.round(n(saldo) * 100) / 100, sistema, diferencia: dif, estado, que,
      facturasAlCorte: alCorte.map(f => ({ id: f.id, folio: t(f.folio), total: n(f.total), fecha: fechaReferencia(f) })),
      posteriores: despues.reduce((s, f) => s + n(f.total), 0) };
  });
  const sinContable = pend.filter(f => !usadas.has(t(f.id) || t(f.folio)));
  const porEmpresa: Record<string, number> = {};
  sinContable.forEach(f => { const k = t(f.empresa) || "Sin cliente"; porEmpresa[k] = (porEmpresa[k] || 0) + n(f.total); });
  return {
    filas: filas.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
    totalContable: Math.round(filas.reduce((s, f) => s + f.contable, 0) * 100) / 100,
    totalSistemaAlCorte: Math.round(filas.reduce((s, f) => s + f.sistema, 0) * 100) / 100,
    clientesSoloEnSistema: Object.entries(porEmpresa).map(([empresa, total]) => ({ empresa, total: Math.round(total * 100) / 100 })),
  };
}

/** Estado de resultados (líneas del despacho) con sus porcentajes sobre ventas. */
export interface LineasER { ventas: number; costoServicios: number; gastosAdministracion: number; otrosProductos: number; costoFinanciero: number; isr?: number; ptu?: number; }
export function estadoResultados(l: LineasER) {
  const ventas = n(l.ventas), bruta = ventas - n(l.costoServicios);
  const operacion = bruta - n(l.gastosAdministracion) + n(l.otrosProductos);
  const antes = operacion - Math.abs(n(l.costoFinanciero));
  const neta = antes - n(l.isr) - n(l.ptu);
  const pct = (x: number) => ventas ? Math.round(x / ventas * 1000) / 10 : null;
  return {
    renglones: [
      { nombre: "Ventas netas", valor: ventas, pct: 100, tipo: "total" },
      { nombre: "Costo de los servicios", valor: -n(l.costoServicios), pct: pct(-n(l.costoServicios)), tipo: "resta" },
      { nombre: "Utilidad bruta", valor: bruta, pct: pct(bruta), tipo: "subtotal" },
      { nombre: "Gastos de administración", valor: -n(l.gastosAdministracion), pct: pct(-n(l.gastosAdministracion)), tipo: "resta" },
      { nombre: "Otros productos", valor: n(l.otrosProductos), pct: pct(n(l.otrosProductos)), tipo: "suma" },
      { nombre: "Utilidad de operación", valor: operacion, pct: pct(operacion), tipo: "subtotal" },
      { nombre: "Costo integral de financiamiento", valor: -Math.abs(n(l.costoFinanciero)), pct: pct(-Math.abs(n(l.costoFinanciero))), tipo: "resta" },
      { nombre: "Resultado del ejercicio", valor: neta, pct: pct(neta), tipo: "total" },
    ],
    neta, bruta, operacion,
  };
}
