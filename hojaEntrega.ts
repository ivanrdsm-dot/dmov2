/* HOJA DE ENTREGA · arma los datos del cierre formal de un servicio para el cliente.
   Solo datos de operación: nunca costos internos, márgenes, viáticos ni nombres de otros clientes.
   Lógica pura; probada en hojaEntrega.test.js. */
import type { Servicio } from "./servicios.ts";

export interface ParadaCerrada {
  id?: string; orden?: number; tipo?: string; nombre?: string; direccion?: string; estado?: string; incidencia?: string;
  cerradaEn?: number | null; distanciaAlCerrarM?: number | null; cerradaPorExcepcion?: boolean;
  evidencia?: { receptor?: string; cantidadEntregada?: number | string; fotos?: string[]; notas?: string };
  [k: string]: unknown;
}
export interface HojaEntrega {
  folio: string; titulo: string; cliente: string; solicitante: string; fechaServicio: string; unidad: string; chofer: string;
  carga: string; completa: boolean; pendientes: string[];
  filas: { n: number; punto: string; tipo: string; resultado: string; recibio: string; cantidad: string; hora: string; evidencia: string }[];
  resumen: { paradas: number; entregadas: number; incidencias: number; fotos: number };
}
const t = (v: unknown): string => String(v ?? "").trim();
const hora = (ms: unknown): string => { const n = Number(ms); if(!Number.isFinite(n) || n <= 0) return ""; return new Date(n).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }); };

/** Campos que jamás deben llegar al cliente aunque existan en el servicio. */
export const CAMPOS_INTERNOS = ["precioPropuesto", "costoInterno", "margen", "viaticos", "comisionPct", "proveedor", "notas"];

export function datosHojaEntrega(s: Servicio, paradas: ParadaCerrada[]): HojaEntrega {
  const orden = [...(paradas ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const pendientes: string[] = [];
  const cerradas = orden.filter(p => p.estado === "Entregada" || p.estado === "Incidencia");
  if(orden.length === 0) pendientes.push("El servicio no tiene paradas registradas");
  if(cerradas.length < orden.length) pendientes.push(`${orden.length - cerradas.length} parada(s) sin cerrar`);
  const filas = orden.map((p, i) => {
    const fotos = (p.evidencia?.fotos ?? []).length;
    const cant = t(p.evidencia?.cantidadEntregada);
    return { n: p.orden ?? i + 1, punto: [t(p.nombre), t(p.direccion)].filter(Boolean).join(" · "), tipo: p.tipo === "carga" ? "Carga" : "Entrega",
      resultado: p.estado === "Incidencia" ? (t(p.incidencia) || "Incidencia") : p.estado === "Entregada" ? "Entregado" : "Pendiente",
      recibio: t(p.evidencia?.receptor), cantidad: cant, hora: hora(p.cerradaEn),
      evidencia: fotos ? `${fotos} foto(s)${p.cerradaPorExcepcion ? " · cierre autorizado por operaciones" : ""}` : "" };
  });
  const carga = [s.mercancia && t(s.mercancia), s.cajas && `${s.cajas} cajas`, s.tarimas && `${s.tarimas} tarimas`, s.pesoKg && `${s.pesoKg} kg`, s.volumenM3 && `${s.volumenM3} m³`].filter(Boolean).join(" · ");
  return {
    folio: t(s.folio), titulo: "Hoja de entrega", cliente: t(s.empresa), solicitante: t(s.solicitante),
    fechaServicio: [t(s.fechaServicio), t(s.horaServicio)].filter(Boolean).join(" · "),
    unidad: t(s.unidadPlaca), chofer: t(s.choferNombre).split(/\s+/)[0] ?? "",      // solo nombre de pila
    carga, completa: pendientes.length === 0, pendientes, filas,
    resumen: { paradas: orden.length, entregadas: orden.filter(p => p.estado === "Entregada").length, incidencias: orden.filter(p => p.estado === "Incidencia").length,
      fotos: orden.reduce((a, p) => a + (p.evidencia?.fotos ?? []).length, 0) },
  };
}
