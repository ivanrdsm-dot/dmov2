/* ═══════════════════════════════════════════════════════════════════════════
   CENTRO DE OPERACIÓN · resumen de choferes en vivo (lo ven Ilse y el director).
   Por chofer: asistencia del día, su ruta, su última ubicación y si perdió señal.
   Lógica pura: sin Firebase. Probada en operacion.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */
export interface ChoferOp { id: string; nombre?: string; }
export interface JornadaOp { id?: string; choferId?: string; fecha?: string; estado?: string; checkInEn?: unknown; checkOutEn?: unknown; [k: string]: unknown; }
export interface ServicioOp { id: string; folio?: string; choferId?: string; estado?: string; fechaServicio?: string; }
export interface UbicacionOp { lat?: number; lng?: number; tMs?: number; jornadaCerrada?: boolean; }

export const SIN_SENAL_MIN = { enRuta: 10, enJornada: 30 };
const ms = (v: unknown): number => { const x = v as { toMillis?: () => number }; return typeof x?.toMillis === "function" ? x.toMillis() : typeof v === "number" ? v : 0; };

export const minutosDesde = (tMs: unknown, ahoraMs: number): number | null => { const t = Number(tMs); return t > 0 ? Math.max(0, Math.floor((ahoraMs - t) / 60000)) : null; };

/** Trabajando / Terminó / Faltó (tenía ruta y no hizo check-in) / Por llegar (aún no es la hora) / Sin ruta hoy. */
export function estadoAsistencia(j: JornadaOp | undefined, tieneRuta: boolean, esHoy: boolean, despuesDeHora: boolean): string {
  if(j) return j.estado === "Cerrada" ? "Terminó" : "Trabajando";
  if(!tieneRuta) return "Sin ruta hoy";
  return esHoy && !despuesDeHora ? "Por llegar" : "Faltó";
}

export function resumenOperacion({ choferes = [], jornadas = [], servicios = [], ubicaciones = {}, dia, ahoraMs, horaCheckIn = "09:00" }:
  { choferes: ChoferOp[]; jornadas: JornadaOp[]; servicios: ServicioOp[]; ubicaciones: Record<string, UbicacionOp>; alertas?: unknown[]; dia: string; ahoraMs: number; horaCheckIn?: string }){
  const hoy = new Date(ahoraMs - 6 * 3600000).toISOString().slice(0, 10), esHoy = dia === hoy;
  const despuesDeHora = ahoraMs >= Date.parse(`${dia}T${horaCheckIn}:00-06:00`);
  const filas = choferes.map(c => {
    const jornada = jornadas.find(j => j.choferId === c.id && j.fecha === dia);
    const rutas = servicios.filter(s => s.choferId === c.id && s.fechaServicio === dia && s.estado !== "Cancelada");
    const ruta = rutas.find(s => s.estado === "En ruta") || rutas.find(s => s.estado === "Asignada") || rutas[0] || null;
    const u = ubicaciones[c.id], ubicacion = u && Number.isFinite(u.lat) && Number.isFinite(u.lng) ? { lat: u.lat as number, lng: u.lng as number } : null;
    const minUbicacion = minutosDesde(u?.tMs, ahoraMs);
    const asistencia = estadoAsistencia(jornada, rutas.length > 0, esHoy, despuesDeHora);
    const limite = ruta?.estado === "En ruta" ? SIN_SENAL_MIN.enRuta : SIN_SENAL_MIN.enJornada;
    const sinSenal = esHoy && asistencia === "Trabajando" && (minUbicacion === null || minUbicacion > limite);
    return { id: c.id, nombre: String(c.nombre || c.id), jornada: jornada || null, checkIn: jornada ? ms(jornada.checkInEn) : 0, ruta, ubicacion, minUbicacion, asistencia, sinSenal };
  });
  const orden: Record<string, number> = { "Faltó": 0, "Trabajando": 1, "Por llegar": 2, "Terminó": 3, "Sin ruta hoy": 4 };
  filas.sort((a, b) => Number(b.sinSenal) - Number(a.sinSenal) || (orden[a.asistencia] ?? 9) - (orden[b.asistencia] ?? 9) || a.nombre.localeCompare(b.nombre));
  return {
    filas,
    trabajando: filas.filter(f => f.asistencia === "Trabajando").length,
    enRuta: filas.filter(f => f.ruta?.estado === "En ruta").length,
    faltan: filas.filter(f => f.asistencia === "Faltó").length,
    sinSenal: filas.filter(f => f.sinSenal).length,
  };
}
