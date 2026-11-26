/* CRONOGRAMA EN VIVO · cada ruta del día en una línea de tiempo:
   cuándo empezó, cada parada (hora pactada contra hora real), qué va tarde AHORA y qué sigue.
   Sin montos. Lógica pura; probada en cronograma.test.ts. */

export const TOLERANCIA_MIN = 15;     // minutos de gracia sobre la hora pactada (criterio; se muestra en pantalla)

export type Semaforo = "a_tiempo" | "tarde" | "atrasada" | "pendiente" | "incidencia" | "quitada";
export interface ParadaCron {
  id: string; orden: number; nombre: string; tipo: string; estado: string;
  pactadaMs: number | null; llegadaMs: number | null; cerradaMs: number | null;
  semaforo: Semaforo; retrasoMin: number | null;
}
export interface FilaCron {
  servicioId: string; folio: string; empresa: string; chofer: string; placa: string; estado: string; foraneo: boolean;
  inicioMs: number | null; finMs: number | null; activa: boolean;
  paradas: ParadaCron[]; hechas: number; total: number; proxima: ParadaCron | null; atrasadas: number;
}

const num = (v: unknown): number | null => {
  const x = v && typeof (v as any).toMillis === "function" ? (v as any).toMillis() : Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};
/** "HH:MM" del día (hora de CDMX) → ms. */
export function pactadaMs(dia: string, hhmm: unknown): number | null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hhmm ?? ""))) return null;
  const t = Date.parse(`${dia}T${hhmm}:00-06:00`);
  return Number.isFinite(t) ? t : null;
}

export function semaforoParada(p: { estado?: string; pactadaMs: number | null; llegadaMs: number | null; cerradaMs: number | null }, ahoraMs: number, tol = TOLERANCIA_MIN): { semaforo: Semaforo; retrasoMin: number | null } {
  if(p.estado === "Quitada") return { semaforo: "quitada", retrasoMin: null };
  if(p.estado === "Incidencia") return { semaforo: "incidencia", retrasoMin: null };
  const real = p.llegadaMs ?? p.cerradaMs;
  if(real !== null){
    if(p.pactadaMs === null) return { semaforo: "a_tiempo", retrasoMin: null };
    const r = Math.round((real - p.pactadaMs) / 60000);
    return { semaforo: r > tol ? "tarde" : "a_tiempo", retrasoMin: r };
  }
  if(p.pactadaMs !== null && ahoraMs > p.pactadaMs + tol * 60000) return { semaforo: "atrasada", retrasoMin: Math.round((ahoraMs - p.pactadaMs) / 60000) };
  return { semaforo: "pendiente", retrasoMin: null };
}

export function armarCronograma({ servicios = [], paradas = {}, jornadas = [], dia, ahoraMs, tol = TOLERANCIA_MIN }:
  { servicios: any[]; paradas: Record<string, any[]>; jornadas: any[]; dia: string; ahoraMs: number; tol?: number }){
  const filas: FilaCron[] = servicios.filter(s => s && s.estado !== "Cancelada").map(s => {
    const ps: ParadaCron[] = (paradas[s.id] ?? []).map((p: any) => {
      const base = { estado: String(p.estado ?? "Pendiente"), pactadaMs: pactadaMs(dia, p.horaPactada), llegadaMs: num(p.llegadaGpsMs) ?? num(p.llegadaMs), cerradaMs: num(p.cerradaMs) ?? num(p.cerradaEn) };
      return { id: String(p.id ?? p.orden), orden: Number(p.orden) || 0, nombre: String(p.nombre || p.direccion || "Parada"), tipo: String(p.tipo || "entrega"), ...base, ...semaforoParada(base, ahoraMs, tol) };
    }).sort((a, b) => a.orden - b.orden);
    const vivas = ps.filter(p => p.semaforo !== "quitada");
    const hechas = vivas.filter(p => p.cerradaMs !== null || ["Entregada", "Incidencia"].includes(p.estado)).length;
    const j = jornadas.find(x => x.choferId && x.choferId === s.choferId);
    const salida = num(s.estadoTs?.["En ruta"]);
    const inicioMs = salida ?? num(j?.checkInEn) ?? null;
    const terminada = ["Entregada", "Cerrada", "Conciliada", "Facturada", "Cobrada"].includes(s.estado);
    const ultimo = Math.max(0, ...vivas.map(p => p.cerradaMs ?? 0));
    const activa = s.estado === "En ruta";
    const finMs = terminada ? (num(s.estadoTs?.Entregada) ?? (ultimo || null)) : activa ? ahoraMs : null;
    const proxima = vivas.find(p => p.cerradaMs === null && !["Entregada", "Incidencia"].includes(p.estado)) ?? null;
    return { servicioId: s.id, folio: String(s.folio || ""), empresa: String(s.empresa || ""), chofer: String(s.choferNombre || "Sin chofer") + (s.segundoChoferNombre ? " y " + s.segundoChoferNombre : ""),
      placa: String(s.unidadPlaca || ""), estado: String(s.estado || ""), foraneo: s.foraneo === true, inicioMs, finMs, activa,
      paradas: ps, hechas, total: vivas.length, proxima, atrasadas: vivas.filter(p => p.semaforo === "atrasada").length };
  });
  /* Primero lo que necesita atención: atrasadas, luego en ruta, por salir y terminadas. */
  const peso = (f: FilaCron) => f.atrasadas ? 0 : f.activa ? 1 : f.hechas < f.total ? 2 : 3;
  filas.sort((a, b) => peso(a) - peso(b) || (a.proxima?.pactadaMs ?? 9e15) - (b.proxima?.pactadaMs ?? 9e15) || a.folio.localeCompare(b.folio));

  /* Eje del tiempo: de 6:00 a 21:00 del día, y más amplio si algo cae fuera. */
  const marcas = filas.flatMap(f => [f.inicioMs, f.finMs, ...f.paradas.flatMap(p => [p.pactadaMs, p.llegadaMs, p.cerradaMs])]).filter((x): x is number => x !== null);
  const d6 = Date.parse(`${dia}T06:00:00-06:00`), d21 = Date.parse(`${dia}T21:00:00-06:00`);
  const hora = 3600000;
  const desdeMs = Math.floor(Math.min(d6, ...marcas) / hora) * hora, hastaMs = Math.ceil(Math.max(d21, ...marcas) / hora) * hora;

  const todas = filas.flatMap(f => f.paradas.filter(p => p.semaforo !== "quitada"));
  const conHora = todas.filter(p => (p.semaforo === "a_tiempo" || p.semaforo === "tarde") && p.retrasoMin !== null);
  const kpis = {
    rutas: filas.length,
    enRuta: filas.filter(f => f.activa).length,
    porSalir: filas.filter(f => f.estado === "Asignada" || f.estado === "Solicitud").length,
    terminadas: filas.filter(f => f.total > 0 && f.hechas === f.total).length,
    paradasHechas: todas.filter(p => p.cerradaMs !== null || ["Entregada", "Incidencia"].includes(p.estado)).length,
    paradasTotal: todas.length,
    aTiempoPct: conHora.length ? Math.round(conHora.filter(p => p.semaforo === "a_tiempo").length / conHora.length * 100) : null,
    atrasadasAhora: todas.filter(p => p.semaforo === "atrasada").length,
    incidencias: todas.filter(p => p.semaforo === "incidencia").length,
  };
  /* Lo que sigue en el día (las próximas paradas pendientes, por hora pactada). */
  const siguientes = filas.flatMap(f => f.paradas.filter(p => p.cerradaMs === null && ["pendiente", "atrasada"].includes(p.semaforo)).map(p => ({ ...p, folio: f.folio, chofer: f.chofer, empresa: f.empresa })))
    .sort((a, b) => (a.pactadaMs ?? 9e15) - (b.pactadaMs ?? 9e15)).slice(0, 12);
  return { filas, desdeMs, hastaMs, kpis, siguientes, tolMin: tol };
}
