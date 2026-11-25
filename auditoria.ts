/* ═══════════════════════════════════════════════════════════════════════════
   AUDITORÍA DE LA OFICINA (solo el director): qué rutas y lugares dio de alta cada quien, cuándo y
   con qué cliente, y qué tiene señales de un viaje que no es de la empresa.
   Lógica pura (sin Firebase). Probada en auditoria.test.ts. No acusa: marca para revisar.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ServicioA { id: string; folio?: string; fechaServicio?: string; creadoEnMs?: number | null; creadoPor?: string; creadoPorNombre?: string;
  empresa?: string; choferNombre?: string; segundoChoferNombre?: string; estado?: string; historico?: boolean; motivoCancelacion?: string; }
export interface LugarA { id: string; nombre?: string; direccion?: string; creadoEnMs?: number | null; creadoPor?: string; }

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Hora local de CDMX (UTC-6) y día de la semana (0 = domingo). */
export function horaLocal(ms: number){ const d = new Date(ms - 6 * 3600000); return { hora: d.getUTCHours(), dia: d.getUTCDay() }; }
/* Horario de oficina para dar de alta rutas (supuesto: lunes a sábado de 7:00 a 20:00). */
export const HORARIO_OFICINA = { desde: 7, hasta: 20 };
export const fueraDeHorario = (ms?: number | null) => { if(!ms) return false; const { hora, dia } = horaLocal(ms); return dia === 0 || hora < HORARIO_OFICINA.desde || hora >= HORARIO_OFICINA.hasta; };

/** Rutas creadas en el periodo con sus banderas para revisar. `admins` = uid del director (no se auditan a sí mismos). */
export function auditarServicios(servicios: ServicioA[], { admins = [] as string[], clientes = [] as string[] } = {}){
  const catalogo = new Set(clientes.map(norm).filter(Boolean));
  return servicios.filter(s => !s.historico && s.creadoPor && !admins.includes(s.creadoPor)).map(s => {
    const banderas: string[] = [];
    if(!String(s.empresa ?? "").trim()) banderas.push("Sin cliente");
    else if(catalogo.size && !catalogo.has(norm(s.empresa))) banderas.push("Cliente fuera del catálogo");
    if(fueraDeHorario(s.creadoEnMs)) banderas.push("Creada fuera de horario");
    if(s.estado === "Cancelada") banderas.push("Cancelada");
    return { ...s, banderas };
  }).sort((a, b) => (b.creadoEnMs || 0) - (a.creadoEnMs || 0));
}

/** Lugares nuevos que dio de alta la oficina en el periodo (un destino propio aparece aquí). */
export function lugaresNuevos(lugares: LugarA[], { admins = [] as string[], desdeMs = 0, hastaMs = Infinity } = {}){
  return lugares.filter(l => l.creadoPor && !admins.includes(l.creadoPor) && (l.creadoEnMs || 0) >= desdeMs && (l.creadoEnMs || 0) < hastaMs)
    .map(l => ({ ...l, fueraDeHorario: fueraDeHorario(l.creadoEnMs) })).sort((a, b) => (b.creadoEnMs || 0) - (a.creadoEnMs || 0));
}

/** Resumen por persona de la oficina. */
export function resumenPorPersona(filas: ReturnType<typeof auditarServicios>, lugares: ReturnType<typeof lugaresNuevos>, nombres: Record<string, string> = {}){
  const out: Record<string, { uid: string; nombre: string; rutas: number; conBanderas: number; canceladas: number; fueraDeHorario: number; fueraDeCatalogo: number; lugaresNuevos: number }> = {};
  const de = (uid: string, nombre?: string) => out[uid] || (out[uid] = { uid, nombre: nombres[uid] || nombre || uid, rutas: 0, conBanderas: 0, canceladas: 0, fueraDeHorario: 0, fueraDeCatalogo: 0, lugaresNuevos: 0 });
  for(const f of filas){ const p = de(f.creadoPor as string, f.creadoPorNombre); p.rutas++; if(f.banderas.length) p.conBanderas++;
    if(f.banderas.includes("Cancelada")) p.canceladas++; if(f.banderas.includes("Creada fuera de horario")) p.fueraDeHorario++; if(f.banderas.includes("Cliente fuera del catálogo")) p.fueraDeCatalogo++; }
  for(const l of lugares) de(l.creadoPor as string).lugaresNuevos++;
  return Object.values(out).sort((a, b) => b.conBanderas - a.conBanderas || b.rutas - a.rutas);
}
