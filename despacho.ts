/* DESPACHO Y TORRE DE CONTROL · lógica pura. Probada en despacho.test.js. */

/* SUPUESTO por confirmar: minutos sin señal antes de alertar a operaciones. */
export const MIN_SIN_SENAL_ALERTA = 10;
export const MIN_EN_VIVO = 2;

export interface Ubicacion { choferId?: string; lat?: number; lng?: number; tMs?: number; bateria?: number | null; confiable?: boolean; servicioId?: string; servicioFolio?: string; [k: string]: unknown; }
export type Senal = "en vivo" | "con retraso" | "sin señal" | "nunca";

/** Estado de la señal de un chofer según su última posición recibida. */
export function estadoSenal(u: Ubicacion | null | undefined, ahoraMs: number, alertaMin = MIN_SIN_SENAL_ALERTA): { senal: Senal; minutos: number | null } {
  const t = Number(u?.tMs);
  if(!Number.isFinite(t) || t <= 0) return { senal: "nunca", minutos: null };
  const min = Math.max(0, Math.round((ahoraMs - t) / 60000));
  return { senal: min <= MIN_EN_VIVO ? "en vivo" : min <= alertaMin ? "con retraso" : "sin señal", minutos: min };
}

export interface ChoferApp { id: string; nombre?: string; authUid?: string; dispositivoId?: string; activo?: boolean; status?: string; correoApp?: string; [k: string]: unknown; }
/** Qué le falta a un chofer para poder recibir una ruta en la app. */
export function faltantesChoferApp(c: ChoferApp): string[] {
  const f: string[] = [];
  if(!c.authUid) f.push("Cuenta de la app");
  else if(!c.dispositivoId) f.push("Entrar por primera vez desde su teléfono");
  if(c.activo === false || c.status === "Inactivo") f.push("Chofer inactivo");
  return f;
}

export interface ParadaRuta { id: string; orden?: number; estado?: string; nombre?: string; excepcion?: unknown; [k: string]: unknown; }
/** Avance de una ruta: cuántas paradas cerradas, cuántas con incidencia y cuál sigue. */
export function avanceRuta(paradas: ParadaRuta[]){
  const orden = [...(paradas ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const cerradas = orden.filter(p => p.estado === "Entregada" || p.estado === "Incidencia").length;
  const incidencias = orden.filter(p => p.estado === "Incidencia").length;
  const siguiente = orden.find(p => p.estado !== "Entregada" && p.estado !== "Incidencia") ?? null;
  return { total: orden.length, cerradas, incidencias, siguiente, pct: orden.length ? Math.round(cerradas / orden.length * 100) : 0 };
}

/** Semáforo de un viaje en curso para la torre de control. */
export function semaforoViaje(u: Ubicacion | null | undefined, paradas: ParadaRuta[], ahoraMs: number): { color: "verde" | "ambar" | "rojo"; motivo: string } {
  const s = estadoSenal(u, ahoraMs);
  if(u && u.confiable === false) return { color: "rojo", motivo: "Ubicación no confiable" };
  if(s.senal === "sin señal") return { color: "rojo", motivo: `Sin señal hace ${s.minutos} min` };
  if(s.senal === "nunca") return { color: "ambar", motivo: "Aún no transmite" };
  if(avanceRuta(paradas).incidencias > 0) return { color: "ambar", motivo: "Tiene incidencias" };
  if(s.senal === "con retraso") return { color: "ambar", motivo: `Última señal hace ${s.minutos} min` };
  if(typeof u?.bateria === "number" && u.bateria <= 15) return { color: "ambar", motivo: `Batería al ${u.bateria} %` };
  return { color: "verde", motivo: "En ruta, transmitiendo" };
}
