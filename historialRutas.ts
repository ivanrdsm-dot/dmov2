/* ═══════════════════════════════════════════════════════════════════════════
   HISTORIAL DE RUTAS · lo que cada chofer ha hecho y si ya está facturado.
   - viajeAServicio: convierte un renglón de la bitácora de Ilse en un servicio
     histórico. Solo usa lo que dice la bitácora: lo que no trae (precio, direcciones,
     quién recibió) queda PENDIENTE; el texto original se guarda tal cual.
   - conciliarViaje: busca la factura del MISMO cliente y MISMO mes. Si existe, queda
     "por revisar" (una factura puede agrupar varios viajes); si no, "sin factura".
   - resumenHistorial: el reporte (por chofer, por cliente y mes, por unidad).
   Lógica pura: sin Firebase. Probada en historialRutas.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ViajeBitacora { fecha: string; mes?: string; chofer?: string; unidad?: string; clienteRaw?: string; servicio?: string; }
export interface ChoferRef { id: string; nombre?: string; }
export interface CuentaRef { id: string; nombre?: string; }
export interface FacturaRef { id: string; folio?: string; clienteId?: string; _clienteId?: string; mesOp?: string; anio?: number | string; total?: number | string; status?: string; }

/* Cómo viene el cliente en la bitácora → cuenta del sistema (misma tabla que usó la importación de facturas de mayo). */
export const CLIENTES_BITACORA: Record<string, { id: string; porConfirmar?: boolean }> = {
  "SCJ": { id: "scj" }, "HENRY": { id: "henry_walmart" }, "ACT NOW": { id: "actnow" }, "ROBOTS": { id: "robots" },
  "CANNON": { id: "canon" }, "HERSHEYS": { id: "hersheys" }, "IVAN": { id: "map_varios", porConfirmar: true },
};
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const t = (v: unknown) => String(v ?? "").trim();
const vacio = (v: unknown) => { const s = t(v); return !s || /^[—–-]+$/.test(s); };
const norm = (s: unknown) => t(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** "ELIAS/ISRAEL" → choferes registrados que coinciden por nombre; los que no están quedan en `sinRegistro`. */
export function choferesDeTexto(texto: unknown, choferes: ChoferRef[]): { ids: string[]; nombres: string[]; sinRegistro: string[] } {
  const ids: string[] = [], nombres: string[] = [], sinRegistro: string[] = [];
  if(vacio(texto)) return { ids, nombres, sinRegistro };
  for(const parte of t(texto).split(/[\/,&]| Y /i).map(norm).filter(Boolean)){
    const hallados = (choferes || []).filter(c => norm(c.nombre).split(/\s+/).includes(parte));
    if(hallados.length === 1){ if(!ids.includes(hallados[0].id)){ ids.push(hallados[0].id); nombres.push(t(hallados[0].nombre)); } }
    else { sinRegistro.push(parte); nombres.push(parte); }   // no está dado de alta (o hay dos iguales): se queda el nombre como vino
  }
  return { ids, nombres, sinRegistro };
}

/** Facturas del mismo cliente y mismo mes (sin las canceladas). */
export function conciliarViaje(clienteId: string, fecha: string, facturas: FacturaRef[]) {
  const [anio, mes] = t(fecha).split("-").map(Number);
  const corto = MESES[(mes || 0) - 1] || "?";
  const del = (facturas || []).filter(f => (t(f.clienteId) || t(f._clienteId)) === clienteId && t(f.mesOp).slice(0, 3) === corto
    && Number(f.anio) === anio && t(f.status) !== "Cancelada");
  return {
    estado: del.length ? "Factura del mes por revisar" : "Sin factura",
    facturas: del.map(f => ({ id: f.id, folio: t(f.folio), total: Number(f.total) || 0, status: t(f.status) })),
    nota: del.length ? "Factura del mismo cliente y mes; puede agrupar varios viajes. Revisar que este viaje esté incluido."
      : "No hay factura de este cliente en ese mes. Revisar si se cobró.",
  };
}

/** Un renglón de la bitácora → servicio histórico (sin marcas de tiempo: las pone quien escribe). */
export function viajeAServicio(v: ViajeBitacora, n: number, ctx: { choferes: ChoferRef[]; cuentas: CuentaRef[]; facturas: FacturaRef[]; fuente: string }) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(t(v.fecha))) throw new Error(`Renglón ${n}: fecha no válida`);
  const anio = t(v.fecha).slice(0, 4);
  const cli = CLIENTES_BITACORA[norm(v.clienteRaw)] || null;
  const cuenta = cli ? (ctx.cuentas || []).find(c => c.id === cli.id) : null;
  const ch = choferesDeTexto(v.chofer, ctx.choferes);
  const texto = t(v.servicio);
  const cancelado = /SE CANCELA/i.test(texto);
  const incidencia = !cancelado && /NO (LOS |LO |SE )?(ENTREGAN|ENTREGA|HUBO|HABIA)/i.test(texto);
  const pendientes = ["Precio", "Direcciones de origen y destino", "Quién recibió"];
  if(!cuenta) pendientes.push("Cliente (no se reconoce: " + (t(v.clienteRaw) || "vacío") + ")");
  else if(cli?.porConfirmar) pendientes.push("Confirmar cliente/plan (" + t(v.clienteRaw) + ")");
  if(vacio(v.unidad)) pendientes.push("Placas de la unidad");
  if(ch.nombres.length === 0) pendientes.push("Chofer");
  if(ch.sinRegistro.length) pendientes.push("Dar de alta chofer: " + ch.sinRegistro.join(", "));
  const folio = `BIT-${anio}-${String(n).padStart(4, "0")}`;
  return {
    id: folio.toLowerCase(),
    datos: {
      folio, historico: true, fuente: ctx.fuente, canal: "Bitácora histórica",
      estado: cancelado ? "Cancelada" : "Entregada",
      ...(cancelado ? { motivoCancelacion: texto } : {}),
      fechaServicio: t(v.fecha), horaServicio: "",
      empresa: t(cuenta?.nombre) || t(v.clienteRaw), clienteId: cuenta?.id || "", clienteOriginal: t(v.clienteRaw),
      choferId: ch.ids.length === 1 && ch.sinRegistro.length === 0 ? ch.ids[0] : "", choferIds: ch.ids,
      choferNombre: ch.nombres.join(" / "), choferOriginal: t(v.chofer),
      unidadPlaca: vacio(v.unidad) ? "" : t(v.unidad).toUpperCase(), asignacionTipo: "Flota propia",
      descripcion: texto, notas: texto, conIncidencia: incidencia,
      origenes: [], destinos: [],
      pendientes,
      conciliacion: cuenta ? conciliarViaje(cuenta.id, t(v.fecha), ctx.facturas) : { estado: "Sin factura", facturas: [], nota: "Cliente no reconocido." },
    },
  };
}

export interface ServicioHistorial {
  id?: string; folio?: string; estado?: string; fechaServicio?: string; empresa?: string; choferNombre?: string; unidadPlaca?: string;
  historico?: boolean; conIncidencia?: boolean; facturaFolio?: string; conciliacion?: { estado?: string; facturas?: { folio?: string }[] };
}

/** ¿Ya hay factura ligada al viaje? (servicios nuevos: facturaFolio; históricos: la del mes). */
export const estadoCobro = (s: ServicioHistorial): "Facturado" | "Por revisar" | "Sin factura" =>
  t(s.facturaFolio) ? "Facturado" : s.conciliacion?.estado === "Factura del mes por revisar" ? "Por revisar" : "Sin factura";

export const mesDe = (fecha: unknown) => { const [a, m] = t(fecha).split("-").map(Number); return a && m ? `${MESES_LARGOS[m - 1]} ${a}` : "Sin fecha"; };

/** Solo cuenta lo que ya salió a la calle (desde Asignada) y no se canceló. */
export const esViaje = (s: ServicioHistorial) => ["Asignada", "En ruta", "Entregada", "Cerrada", "Conciliada", "Facturada", "Cobrada"].includes(t(s.estado));

export function resumenHistorial(servicios: ServicioHistorial[]) {
  const viajes = (servicios || []).filter(esViaje);
  const porChofer: Record<string, { chofer: string; viajes: number; dias: Set<string>; clientes: Set<string>; unidades: Set<string>; incidencias: number }> = {};
  const porClienteMes: Record<string, { cliente: string; mes: string; orden: string; viajes: number; sinFactura: number; facturas: Set<string> }> = {};
  for(const s of viajes){
    for(const c of (t(s.choferNombre) || "Sin chofer anotado").split(" / ").filter(Boolean)){
      const r = porChofer[c] ||= { chofer: c, viajes: 0, dias: new Set(), clientes: new Set(), unidades: new Set(), incidencias: 0 };
      r.viajes++; r.dias.add(t(s.fechaServicio)); if(t(s.empresa)) r.clientes.add(t(s.empresa)); if(t(s.unidadPlaca)) r.unidades.add(t(s.unidadPlaca)); if(s.conIncidencia) r.incidencias++;
    }
    const k = t(s.empresa) + "|" + t(s.fechaServicio).slice(0, 7);
    const m = porClienteMes[k] ||= { cliente: t(s.empresa) || "Sin cliente", mes: mesDe(s.fechaServicio), orden: t(s.fechaServicio).slice(0, 7), viajes: 0, sinFactura: 0, facturas: new Set() };
    m.viajes++;
    if(estadoCobro(s) === "Sin factura") m.sinFactura++;
    if(t(s.facturaFolio)) m.facturas.add(t(s.facturaFolio));
    for(const f of s.conciliacion?.facturas || []) if(t(f.folio)) m.facturas.add(t(f.folio));
  }
  return {
    viajes: viajes.length,
    choferes: Object.values(porChofer).map(r => ({ chofer: r.chofer, viajes: r.viajes, dias: r.dias.size, clientes: r.clientes.size, unidades: [...r.unidades].sort(), incidencias: r.incidencias }))
      .sort((a, b) => b.viajes - a.viajes || a.chofer.localeCompare(b.chofer)),
    clientesMes: Object.values(porClienteMes).map(r => ({ cliente: r.cliente, mes: r.mes, orden: r.orden, viajes: r.viajes, sinFactura: r.sinFactura, facturas: [...r.facturas].sort() }))
      .sort((a, b) => b.orden.localeCompare(a.orden) || b.viajes - a.viajes),
    sinFactura: viajes.filter(s => estadoCobro(s) === "Sin factura").length,
    porRevisar: viajes.filter(s => estadoCobro(s) === "Por revisar").length,
    facturados: viajes.filter(s => estadoCobro(s) === "Facturado").length,
    incidencias: viajes.filter(s => s.conIncidencia).length,
  };
}
