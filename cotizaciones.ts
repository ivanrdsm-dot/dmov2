/* COTIZACIONES DE LOGÍSTICA · lógica pura.
   Una cotización es la foto de lo que calculó el cotizador automático, con folio
   consecutivo, ligada a su solicitud y, si se acepta, a su servicio.
   - El cálculo guardado no se edita: si cambia la carga se emite otra cotización.
   - El precio que ve el cliente lo aprueba un administrador (regla de negocio #2).
   - Nada se borra: una cotización se cancela o se rechaza, con motivo. */

export const ESTADOS_COTIZACION = ["Propuesta", "Aprobada", "Enviada", "Aceptada", "Rechazada", "Cancelada"] as const;
export type EstadoCotizacion = typeof ESTADOS_COTIZACION[number];
export const ESTADOS_FINALES: EstadoCotizacion[] = ["Aceptada", "Rechazada", "Cancelada"];

export interface ConceptoCot { concepto: string; detalle: string; monto: number; }
export interface ResumenCalculo {
  unidadClave: string | null; unidadNombre: string | null; unidades: number; conProveedor: boolean;
  tarimas: number | null; pesoKg: number | null; volumenM3: number | null;
  maniobra: boolean | null; ayudantes: number;
  motivoUnidad: string; conceptos: ConceptoCot[];
  subtotalBase: number | null; gananciaPct: number; precio: number | null; iva: number | null; total: number | null;
  supuestos: string[]; pendientes: string[]; lista: boolean;
}
export interface Cotizacion {
  id?: string; folio?: string; estado?: EstadoCotizacion;
  empresa?: string; solicitante?: string; contacto?: string; notas?: string;
  solicitudId?: string; solicitudFolio?: string; solicitudRecibidaEn?: number | null;
  servicioId?: string; servicioFolio?: string;
  entrada?: Record<string, unknown>; resultado?: ResumenCalculo;
  precioPropuesto?: number | null; precioAprobado?: number; aprobadoPor?: string; aprobadoEn?: number | null;
  motivo?: string; sustituyeA?: string;
  creadoEn?: number | null; creadoPorNombre?: string; estadoTs?: Record<string, number>;
  [k: string]: unknown;
}

/** Folio consecutivo por año: COT-2026-0001. */
export function folioCotizacion(consecutivo: number, anio: number): string {
  if(!Number.isInteger(consecutivo) || consecutivo < 1) throw new Error("Consecutivo de folio inválido");
  if(!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new Error("Año de folio inválido");
  return `COT-${anio}-${String(consecutivo).padStart(4, "0")}`;
}

const num = (v: unknown): number | null => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };

/** Lo que se guarda del cálculo: solo datos planos, sin objetos del catálogo. */
export function resumirCalculo(c: any): ResumenCalculo {
  const u = c?.unidad ?? null;
  return {
    unidadClave: u?.tipo?.clave ?? null, unidadNombre: u?.tipo?.nombre ?? null, unidades: Number(u?.cantidad) || 0, conProveedor: !!u?.conProveedor,
    tarimas: num(c?.cubicaje?.tarimas), pesoKg: num(c?.cubicaje?.pesoKg), volumenM3: num(c?.cubicaje?.volumenM3),
    maniobra: c?.maniobra?.requerida === true ? true : c?.maniobra?.requerida === false ? false : null, ayudantes: Number(c?.maniobra?.ayudantes) || 0,
    motivoUnidad: String(c?.motivoUnidad ?? ""),
    conceptos: (c?.conceptos ?? []).map((x: any) => ({ concepto: String(x.concepto), detalle: String(x.detalle ?? ""), monto: Number(x.monto) || 0 })),
    subtotalBase: num(c?.subtotalBase), gananciaPct: Number(c?.gananciaPct) || 0, precio: num(c?.precio), iva: num(c?.iva), total: num(c?.total),
    supuestos: [...(c?.supuestos ?? [])].map(String), pendientes: [...(c?.pendientes ?? [])].map(String), lista: !!c?.lista,
  };
}

/** Qué impide guardar una cotización. Sin precio calculado no hay nada que aprobar. */
export function validarCotizacion(d: { empresa?: string; resultado?: ResumenCalculo | null }): string[] {
  const e: string[] = [];
  if(!String(d.empresa ?? "").trim()) e.push("Cliente o empresa");
  if(!d.resultado) e.push("Cálculo del cotizador");
  else if(!(Number(d.resultado.precio) > 0)) e.push("Precio calculado: falta información de la carga o la tarifa");
  return e;
}

export interface VeredictoCot { permitido: boolean; razon: string; requiereMotivo: boolean; }
/** Mismas transiciones que hacen cumplir las reglas del servidor. */
export function evaluarTransicion(c: Cotizacion, a: EstadoCotizacion, opts: { esAdmin?: boolean } = {}): VeredictoCot {
  const de = (c.estado ?? "Propuesta") as EstadoCotizacion;
  const no = (razon: string): VeredictoCot => ({ permitido: false, razon, requiereMotivo: false });
  if(de === a) return no("Ya está en ese estado");
  if(ESTADOS_FINALES.includes(de)) return no(`Una cotización ${de.toLowerCase()} ya no cambia; emite una nueva`);
  if(a === "Cancelada") return { permitido: true, razon: "", requiereMotivo: true };
  if(a === "Aprobada") return de !== "Propuesta" ? no("Solo se aprueba una propuesta") : opts.esAdmin ? { permitido: true, razon: "", requiereMotivo: false } : no("El precio lo aprueba un administrador");
  if(a === "Enviada") return de === "Aprobada" ? { permitido: true, razon: "", requiereMotivo: false } : no("Primero debe aprobarla un administrador");
  if(a === "Aceptada") return de === "Enviada" ? { permitido: true, razon: "", requiereMotivo: false } : no("Primero márcala como enviada al cliente");
  if(a === "Rechazada") return de === "Enviada" ? { permitido: true, razon: "", requiereMotivo: true } : no("Primero márcala como enviada al cliente");
  return no("Cambio no permitido");
}

/** Precio que se le presenta al cliente: solo existe cuando un admin lo aprobó. */
export const precioCliente = (c: Cotizacion): number | null => Number(c.precioAprobado) > 0 ? Number(c.precioAprobado) : null;

/** Datos con los que se abre el formulario de servicio a partir de una cotización aceptada. */
export function servicioDesdeCotizacion(c: Cotizacion): Record<string, unknown> {
  const e = (c.entrada ?? {}) as Record<string, unknown>, r = c.resultado;
  const o: Record<string, unknown> = {
    empresa: c.empresa ?? "", solicitante: c.solicitante ?? "", solicitanteContacto: c.contacto ?? "",
    cotizacionId: c.id ?? "", cotizacionFolio: c.folio ?? "", precioPropuesto: precioCliente(c) ?? "",
    cajas: e.modo === "Cajas" ? e.cajas ?? "" : "", tarimas: r?.tarimas ?? "", pesoKg: r?.pesoKg ?? "", volumenM3: r?.volumenM3 ?? "",
    maniobras: r?.maniobra === true ? `Sí, ${r.ayudantes} ayudante(s)` : r?.maniobra === false ? "No requiere" : "",
    notas: c.notas ?? "",
  };
  if(c.solicitudId){ o.solicitudId = c.solicitudId; o.solicitudFolio = c.solicitudFolio ?? ""; }
  return o;
}

export interface KpisCotizaciones {
  total: number; porEstado: Record<string, number>; porAprobar: number; porEnviar: number; esperandoCliente: number;
  tasaCierrePct: number | null; montoAceptado: number;
}
export function kpisCotizaciones(lista: Cotizacion[]): KpisCotizaciones {
  const porEstado: Record<string, number> = {};
  let montoAceptado = 0;
  for(const c of lista ?? []){
    const e = c.estado ?? "Propuesta";
    porEstado[e] = (porEstado[e] ?? 0) + 1;
    if(e === "Aceptada") montoAceptado += precioCliente(c) ?? 0;
  }
  const ac = porEstado.Aceptada ?? 0, re = porEstado.Rechazada ?? 0;
  return { total: (lista ?? []).length, porEstado, porAprobar: porEstado.Propuesta ?? 0, porEnviar: porEstado.Aprobada ?? 0, esperandoCliente: porEstado.Enviada ?? 0,
    tasaCierrePct: ac + re ? Math.round(ac / (ac + re) * 100) : null, montoAceptado };
}
