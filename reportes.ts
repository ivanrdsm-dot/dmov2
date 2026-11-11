/* REPORTES DE OPERACIÓN · lógica pura.
   Mide el flujo completo con lo que ya está capturado: solicitudes → cotizaciones
   → servicios → entregas. No estima ni rellena: lo que no se puede medir sale null
   y la pantalla lo muestra como "sin datos". Las horas se inyectan (determinista). */
// @ts-ignore: módulo JS compartido con las funciones del servidor (sin tipos)
import { kpisSolicitudes, META_PRIMERA_RESPUESTA_MIN } from "./functions/lib/solicitudes.js";
import { margenServicio } from "./costos.ts";

export const UTC_OFFSET_MIN = -360;            // hora del centro de México, sin horario de verano
export interface Periodo { clave: string; nombre: string; desdeMs: number; hastaMs: number; }
export const PERIODOS = [["7d", "Últimos 7 días"], ["30d", "Últimos 30 días"], ["mes", "Este mes"], ["anio", "Este año"]] as const;

const DIA = 86400000;
const local = (ms: number, off = UTC_OFFSET_MIN): Date => new Date(ms + off * 60000);
/** "YYYY-MM-DD" en hora local de la operación. */
export const diaLocal = (ms: number, off = UTC_OFFSET_MIN): string => local(ms, off).toISOString().slice(0, 10);
const inicioDia = (ms: number, off = UTC_OFFSET_MIN): number => Date.parse(diaLocal(ms, off) + "T00:00:00Z") - off * 60000;

export function periodoDe(clave: string, ahoraMs: number, off = UTC_OFFSET_MIN): Periodo {
  const nombre = PERIODOS.find(p => p[0] === clave)?.[1] ?? "Últimos 30 días";
  const hoy0 = inicioDia(ahoraMs, off), d = local(ahoraMs, off);
  if(clave === "7d") return { clave, nombre, desdeMs: hoy0 - 6 * DIA, hastaMs: ahoraMs };
  if(clave === "mes") return { clave, nombre, desdeMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - off * 60000, hastaMs: ahoraMs };
  if(clave === "anio") return { clave, nombre, desdeMs: Date.UTC(d.getUTCFullYear(), 0, 1) - off * 60000, hastaMs: ahoraMs };
  return { clave: "30d", nombre, desdeMs: hoy0 - 29 * DIA, hastaMs: ahoraMs };
}

const n = (v: unknown): number => { const x = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(x) ? x : 0; };
const dentro = (ms: unknown, p: Periodo): boolean => { const x = Number(ms); return Number.isFinite(x) && x >= p.desdeMs && x <= p.hastaMs; };
const mediana = (xs: number[]): number | null => {
  if(xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y), k = a.length;
  return k % 2 ? a[(k - 1) / 2]! : Math.round((a[k / 2 - 1]! + a[k / 2]!) / 2);
};
const pct = (parte: number, total: number): number | null => total > 0 ? Math.round(parte / total * 100) : null;
const contar = (xs: string[]): { nombre: string; n: number }[] => {
  const m: Record<string, number> = {};
  for(const x of xs) m[x] = (m[x] ?? 0) + 1;
  return Object.entries(m).map(([nombre, k]) => ({ nombre, n: k })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));
};

type Reg = Record<string, any>;
export interface Reporte {
  periodo: Periodo;
  solicitudes: { recibidas: number; porCanal: { nombre: string; n: number }[]; respondidas: number; sinResponder: number; descartadas: number;
    medianaMinRespuesta: number | null; pctDentroDeMeta: number | null; metaMin: number; cotizadas: number; convertidas: number; pctConversion: number | null; };
  cotizaciones: { emitidas: number; porEstado: Record<string, number>; aprobadas: number; enviadas: number; aceptadas: number; rechazadas: number;
    tasaCierrePct: number | null; montoPropuesto: number; montoAceptado: number; medianaMinSolicitudACotizacion: number | null; medianaMinAprobacion: number | null; };
  servicios: { creados: number; porEstado: Record<string, number>; cancelados: number; entregados: number; entregadosEnFecha: number; pctEnFecha: number | null;
    montoAprobado: number; sinPrecioAprobado: number; porCliente: { nombre: string; n: number; monto: number }[]; porUnidad: { nombre: string; n: number }[]; porAsignacion: { nombre: string; n: number }[]; };
  /** Solo servicios con precio aprobado Y costos capturados; el resto se cuenta aparte. */
  margen: { medidos: number; sinCostos: number; conPerdida: number; ingreso: number; costo: number; margen: number; margenPct: number | null;
    porCliente: { nombre: string; n: number; ingreso: number; costo: number; margen: number; margenPct: number | null }[];
    porUnidad: { nombre: string; n: number; ingreso: number; costo: number; margen: number; margenPct: number | null }[]; };
  embudo: { etapa: string; n: number }[];
  actividad: { dia: string; solicitudes: number; cotizaciones: number; servicios: number }[];
}

/** Reporte del periodo. Cada registro cuenta en el periodo por su fecha de entrada
    (recepción de la solicitud, emisión de la cotización, alta del servicio). */
export function reporteOperacion(datos: { solicitudes?: Reg[]; cotizaciones?: Reg[]; servicios?: Reg[] }, periodo: Periodo, ahoraMs: number, off = UTC_OFFSET_MIN): Reporte {
  const sol = (datos.solicitudes ?? []).filter(s => dentro(s.recibidaEn, periodo));
  const cot = (datos.cotizaciones ?? []).filter(c => dentro(c.creadoEn, periodo));
  const srv = (datos.servicios ?? []).filter(s => dentro(s.creadoEn, periodo));

  const ks = kpisSolicitudes(sol, ahoraMs, META_PRIMERA_RESPUESTA_MIN);
  const reales = sol.filter(s => s.estado !== "Descartada");
  const convertidas = reales.filter(s => s.estado === "Convertida" || s.servicioFolio).length;

  const porEstadoC: Record<string, number> = {};
  let montoPropuesto = 0, montoAceptado = 0;
  const aCot: number[] = [], aAprob: number[] = [];
  for(const c of cot){
    const e = String(c.estado ?? "Propuesta");
    porEstadoC[e] = (porEstadoC[e] ?? 0) + 1;
    montoPropuesto += n(c.precioPropuesto);
    if(e === "Aceptada") montoAceptado += n(c.precioAprobado);
    const rec = Number(c.solicitudRecibidaEn), cre = Number(c.creadoEn), apr = Number(c.estadoTs?.Aprobada);
    if(rec > 0 && cre >= rec) aCot.push(Math.round((cre - rec) / 60000));
    if(apr > 0 && apr >= cre) aAprob.push(Math.round((apr - cre) / 60000));
  }
  const pasoPor = (e: string) => cot.filter(c => Number(c.estadoTs?.[e]) > 0 || c.estado === e).length;
  const aceptadas = porEstadoC.Aceptada ?? 0, rechazadas = porEstadoC.Rechazada ?? 0;

  const porEstadoS: Record<string, number> = {};
  let montoAprobado = 0, sinPrecio = 0, entregados = 0, enFecha = 0;
  const clientes: Record<string, { n: number; monto: number }> = {};
  const unidades: string[] = [], asignaciones: string[] = [];
  for(const s of srv){
    const e = String(s.estado ?? "Solicitud");
    porEstadoS[e] = (porEstadoS[e] ?? 0) + 1;
    if(e === "Cancelada") continue;
    const precio = n(s.precio);
    if(precio > 0) montoAprobado += precio; else sinPrecio++;
    const cli = String(s.empresa ?? "").trim() || "Sin cliente";
    clientes[cli] = { n: (clientes[cli]?.n ?? 0) + 1, monto: (clientes[cli]?.monto ?? 0) + precio };
    if(String(s.unidadPlaca ?? "").trim()) unidades.push(String(s.unidadPlaca).trim());
    if(String(s.asignacionTipo ?? "").trim()) asignaciones.push(String(s.asignacionTipo).trim());
    const ent = Number(s.estadoTs?.Entregada);
    if(ent > 0){
      entregados++;
      // "En fecha" = se entregó el día pactado o antes. Sin fecha pactada no se puede medir.
      if(/^\d{4}-\d{2}-\d{2}$/.test(String(s.fechaServicio ?? "")) && diaLocal(ent, off) <= s.fechaServicio) enFecha++;
    }
  }
  let mIng = 0, mCos = 0, medidos = 0, sinCostos = 0, conPerdida = 0;
  const mCli: Record<string, { n: number; ingreso: number; costo: number }> = {}, mUni: Record<string, { n: number; ingreso: number; costo: number }> = {};
  for(const s of srv){
    if(s.estado === "Cancelada") continue;
    const m = margenServicio(s);
    if(m.estado === "sin costos"){ sinCostos++; continue; }
    if(m.estado === "sin precio") continue;
    medidos++; if(m.estado === "pérdida") conPerdida++;
    mIng += m.precio!; mCos += m.costo!;
    const cli = String(s.empresa ?? "").trim() || "Sin cliente";
    mCli[cli] = { n: (mCli[cli]?.n ?? 0) + 1, ingreso: (mCli[cli]?.ingreso ?? 0) + m.precio!, costo: (mCli[cli]?.costo ?? 0) + m.costo! };
    const uni = String(s.unidadPlaca ?? "").trim() || (s.asignacionTipo === "Proveedor externo" ? "Proveedor" : "Sin unidad");
    mUni[uni] = { n: (mUni[uni]?.n ?? 0) + 1, ingreso: (mUni[uni]?.ingreso ?? 0) + m.precio!, costo: (mUni[uni]?.costo ?? 0) + m.costo! };
  }
  const r2 = (x: number) => Math.round(x * 100) / 100, pct1 = (a: number, b: number) => b > 0 ? Math.round(a / b * 1000) / 10 : null;
  const aFilas = (m: Record<string, { n: number; ingreso: number; costo: number }>) => Object.entries(m)
    .map(([nombre, v]) => ({ nombre, n: v.n, ingreso: r2(v.ingreso), costo: r2(v.costo), margen: r2(v.ingreso - v.costo), margenPct: pct1(v.ingreso - v.costo, v.ingreso) }))
    .sort((a, b) => b.margen - a.margen || a.nombre.localeCompare(b.nombre, "es"));
  const conFecha = srv.filter(s => s.estado !== "Cancelada" && Number(s.estadoTs?.Entregada) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(s.fechaServicio ?? ""))).length;

  const dias: Record<string, { solicitudes: number; cotizaciones: number; servicios: number }> = {};
  for(let t = inicioDia(periodo.desdeMs, off); t <= periodo.hastaMs; t += DIA) dias[diaLocal(t, off)] = { solicitudes: 0, cotizaciones: 0, servicios: 0 };
  const suma = (ms: unknown, k: "solicitudes" | "cotizaciones" | "servicios") => { const d = dias[diaLocal(Number(ms), off)]; if(d) d[k]++; };
  sol.forEach(s => suma(s.recibidaEn, "solicitudes")); cot.forEach(c => suma(c.creadoEn, "cotizaciones")); srv.forEach(s => suma(s.creadoEn, "servicios"));

  return {
    periodo,
    solicitudes: { recibidas: sol.length, porCanal: contar(sol.map(s => String(s.canal ?? "Sin canal"))), respondidas: ks.respondidas, sinResponder: ks.sinResponder,
      descartadas: ks.descartadas, medianaMinRespuesta: ks.medianaMin, pctDentroDeMeta: ks.pctDentroDeMeta, metaMin: META_PRIMERA_RESPUESTA_MIN,
      cotizadas: reales.filter(s => s.cotizacionFolio).length, convertidas, pctConversion: pct(convertidas, reales.length) },
    cotizaciones: { emitidas: cot.length, porEstado: porEstadoC, aprobadas: pasoPor("Aprobada"), enviadas: pasoPor("Enviada"), aceptadas, rechazadas,
      tasaCierrePct: pct(aceptadas, aceptadas + rechazadas), montoPropuesto, montoAceptado,
      medianaMinSolicitudACotizacion: mediana(aCot), medianaMinAprobacion: mediana(aAprob) },
    servicios: { creados: srv.length, porEstado: porEstadoS, cancelados: porEstadoS.Cancelada ?? 0, entregados, entregadosEnFecha: enFecha, pctEnFecha: pct(enFecha, conFecha),
      montoAprobado, sinPrecioAprobado: sinPrecio,
      porCliente: Object.entries(clientes).map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.n - a.n || b.monto - a.monto || a.nombre.localeCompare(b.nombre, "es")),
      porUnidad: contar(unidades), porAsignacion: contar(asignaciones) },
    margen: { medidos, sinCostos, conPerdida, ingreso: r2(mIng), costo: r2(mCos), margen: r2(mIng - mCos), margenPct: pct1(mIng - mCos, mIng),
      porCliente: aFilas(mCli), porUnidad: aFilas(mUni) },
    embudo: [{ etapa: "Solicitudes recibidas", n: reales.length }, { etapa: "Cotizaciones emitidas", n: cot.length }, { etapa: "Cotizaciones aceptadas", n: aceptadas },
      { etapa: "Servicios registrados", n: srv.length - (porEstadoS.Cancelada ?? 0) }, { etapa: "Servicios entregados", n: entregados }],
    actividad: Object.entries(dias).map(([dia, v]) => ({ dia, ...v })),
  };
}

/** CSV con BOM para que Excel respete acentos. Las celdas que empiezan con = + - @ se
    neutralizan para que una hoja de cálculo no las ejecute como fórmula. */
export function aCsv(columnas: string[], filas: unknown[][]): string {
  const celda = (v: unknown): string => {
    let s = v === null || v === undefined ? "" : String(v);
    if(/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + [columnas, ...filas].map(f => f.map(celda).join(",")).join("\r\n");
}
const fecha = (ms: unknown, off = UTC_OFFSET_MIN): string => Number(ms) > 0 ? local(Number(ms), off).toISOString().slice(0, 16).replace("T", " ") : "";

export function csvServicios(servicios: Reg[], periodo: Periodo, opts: { conMargen?: boolean } = {}): string {
  const extra = opts.conMargen ? ["Costo real", "Margen", "Margen %"] : [];
  return aCsv(["Folio", "Estado", "Alta", "Cliente", "Solicitante", "Fecha de servicio", "Cotización", "Precio propuesto", "Precio aprobado", "Asignación", "Unidad", "Chofer", "Proveedor", "Entregado", ...extra],
    servicios.filter(s => dentro(s.creadoEn, periodo)).map(s => { const m = margenServicio(s);
      return [s.folio, s.estado, fecha(s.creadoEn), s.empresa, s.solicitante, s.fechaServicio, s.cotizacionFolio,
        n(s.precioPropuesto) || "", n(s.precio) || "", s.asignacionTipo, s.unidadPlaca, s.choferNombre, s.proveedor, fecha(s.estadoTs?.Entregada),
        ...(opts.conMargen ? [m.costo ?? "", m.margen ?? "", m.margenPct ?? ""] : [])]; }));
}
export function csvCotizaciones(cotizaciones: Reg[], periodo: Periodo): string {
  return aCsv(["Folio", "Estado", "Emitida", "Cliente", "Solicitud", "Unidad", "Unidades", "Tarimas", "Peso kg", "Precio propuesto", "Precio aprobado", "Aprobó", "Servicio", "Motivo"],
    cotizaciones.filter(c => dentro(c.creadoEn, periodo)).map(c => [c.folio, c.estado, fecha(c.creadoEn), c.empresa, c.solicitudFolio, c.resultado?.unidadNombre, c.resultado?.unidades,
      c.resultado?.tarimas, c.resultado?.pesoKg, n(c.precioPropuesto) || "", n(c.precioAprobado) || "", c.aprobadoPor, c.servicioFolio, c.motivo]));
}
export function csvSolicitudes(solicitudes: Reg[], periodo: Periodo): string {
  return aCsv(["Folio", "Estado", "Canal", "Recibida", "Primera respuesta", "Remitente", "Asunto", "Cotización", "Servicio"],
    solicitudes.filter(s => dentro(s.recibidaEn, periodo)).map(s => [s.folio, s.estado, s.canal, fecha(s.recibidaEn), fecha(s.primeraRespuestaEn), s.remitenteNombre, s.asunto, s.cotizacionFolio, s.servicioFolio]));
}
