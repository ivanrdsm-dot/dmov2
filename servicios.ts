/* ═══════════════════════════════════════════════════════════════════════════
   SERVICIOS · motor de negocio (Fase 0 — alta manual)
   Un servicio es la unidad operativa: nace como Solicitud y avanza hasta Cobrada.
   Reglas que protege este archivo:
   - Nada se inventa: lo que falta se devuelve como PENDIENTE, nunca se rellena.
   - Avanzar de estado sin cumplir un requisito exige un motivo, que queda en la bitácora.
   - El precio aprobado solo lo fija un admin (además lo exigen las reglas de Firestore).
   Lógica pura: sin Firebase, sin DOM. Probada en servicios.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ESTADOS_SERVICIO = [
  "Solicitud", "Cotizada", "Confirmada", "Asignada", "En ruta",
  "Entregada", "Cerrada", "Conciliada", "Facturada", "Cobrada",
] as const;
export type EstadoLineal = typeof ESTADOS_SERVICIO[number];
export type EstadoServicio = EstadoLineal | "Cancelada";

export const CANALES_SOLICITUD = ["Slack", "Correo", "WhatsApp", "Teléfono", "En persona"] as const;
export const TIPOS_ASIGNACION = ["Flota propia", "Unidad del grupo", "Proveedor externo"] as const;

export interface PuntoServicio {
  nombre?: string; direccion?: string; contacto?: string; telefono?: string; ventana?: string;
}
export interface Servicio {
  folio?: string;
  estado?: EstadoServicio;
  canal?: string;
  recibidaEn?: string;            // "YYYY-MM-DDTHH:mm" — cuándo llegó la solicitud
  empresa?: string; clienteId?: string; plan?: string; centroCostos?: string;
  solicitante?: string; solicitanteContacto?: string;
  fechaServicio?: string;         // "YYYY-MM-DD"
  horaServicio?: string;
  origenes?: PuntoServicio[];
  destinos?: PuntoServicio[];
  mercancia?: string;
  cajas?: number | string; tarimas?: number | string; pesoKg?: number | string; volumenM3?: number | string;
  maniobras?: string; valorDeclarado?: number | string; requisitos?: string;
  cotizacionFolio?: string;
  precioPropuesto?: number | string;   // lo captura operaciones
  precio?: number | string;            // precio aprobado: solo admin
  precioAprobadoPor?: string;
  confirmadoPor?: string;
  asignacionTipo?: string; unidadPlaca?: string; choferNombre?: string; proveedor?: string;
  receptor?: string;
  notas?: string;
  estadoTs?: Record<string, number>;   // ms por estado alcanzado
  [k: string]: unknown;
}

const _txt = (v: unknown): string => String(v ?? "").trim();
const _num = (v: unknown): number => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const _puntosConDireccion = (ps: PuntoServicio[] | undefined): PuntoServicio[] => (ps ?? []).filter(p => _txt(p?.direccion));

/** Folio consecutivo por año: SRV-2026-0001. */
export function folioServicio(consecutivo: number, anio: number): string {
  if(!Number.isInteger(consecutivo) || consecutivo < 1) throw new Error("Consecutivo de folio inválido");
  if(!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new Error("Año de folio inválido");
  return `SRV-${anio}-${String(consecutivo).padStart(4, "0")}`;
}

/** Errores impiden guardar; pendientes se guardan marcados como PENDIENTE (no se inventan). */
export function validarServicio(s: Servicio): { ok: boolean; errores: string[]; pendientes: string[] } {
  const errores: string[] = [], pendientes: string[] = [];
  if(!_txt(s.canal)) errores.push("Canal por el que llegó la solicitud");
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(_txt(s.recibidaEn))) errores.push("Fecha y hora en que se recibió");
  if(!_txt(s.empresa)) errores.push("Empresa o cliente");
  if(!_txt(s.solicitante)) errores.push("Nombre de quien solicita");
  if(_puntosConDireccion(s.origenes).length === 0) errores.push("Al menos un origen con dirección");
  if(_puntosConDireccion(s.destinos).length === 0) errores.push("Al menos un destino con dirección");

  if(!/^\d{4}-\d{2}-\d{2}$/.test(_txt(s.fechaServicio))) pendientes.push("Fecha del servicio");
  if(!_txt(s.mercancia)) pendientes.push("Tipo de mercancía");
  if(!(_num(s.cajas) > 0 || _num(s.tarimas) > 0 || _num(s.pesoKg) > 0 || _num(s.volumenM3) > 0)) pendientes.push("Cantidad: cajas, tarimas, peso o volumen");
  if(!_txt(s.solicitanteContacto)) pendientes.push("Correo o teléfono de quien solicita");
  if(_puntosConDireccion(s.destinos).some(p => !_txt(p.contacto))) pendientes.push("Quién recibe en cada destino");
  if(!_txt(s.centroCostos) && !_txt(s.plan)) pendientes.push("Plan o centro de costos");
  return { ok: errores.length === 0, errores, pendientes };
}

/** Qué le falta al servicio para estar legítimamente en `destino` (acumulado desde Solicitud). */
export function requisitosEstado(s: Servicio, destino: EstadoServicio): string[] {
  if(destino === "Cancelada") return [];
  const hasta = ESTADOS_SERVICIO.indexOf(destino as EstadoLineal);
  const falta: string[] = [];
  const pide = (e: EstadoLineal) => hasta >= ESTADOS_SERVICIO.indexOf(e);
  if(pide("Cotizada")){
    if(!_txt(s.cotizacionFolio)) falta.push("Folio de cotización");
    if(!(_num(s.precio) > 0)) falta.push("Precio aprobado por un administrador");
  }
  if(pide("Confirmada") && !_txt(s.confirmadoPor)) falta.push("Quién confirmó por parte del cliente");
  if(pide("Asignada")){
    if(!_txt(s.asignacionTipo)) falta.push("Tipo de asignación");
    if(s.asignacionTipo === "Proveedor externo" && !_txt(s.proveedor)) falta.push("Proveedor");
    if(!_txt(s.unidadPlaca)) falta.push("Placas de la unidad");
    if(!_txt(s.choferNombre)) falta.push("Chofer");
  }
  if(pide("Entregada") && !_txt(s.receptor)) falta.push("Nombre de quien recibió");
  return falta;
}

export interface VeredictoCambio { permitido: boolean; razon: string; faltantes: string[]; requiereMotivo: boolean; }

/** Reglas de transición. Hacia atrás y reabrir cancelados: solo admin. */
export function evaluarCambioEstado(s: Servicio, destino: EstadoServicio, opts: { esAdmin?: boolean } = {}): VeredictoCambio {
  const de = (s.estado ?? "Solicitud") as EstadoServicio;
  const no = (razon: string): VeredictoCambio => ({ permitido: false, razon, faltantes: [], requiereMotivo: false });
  if(destino === de) return no("El servicio ya está en ese estado");
  if(destino !== "Cancelada" && !ESTADOS_SERVICIO.includes(destino as EstadoLineal)) return no("Estado desconocido");
  if(de === "Cobrada") return no("Un servicio cobrado ya no cambia de estado");
  if(de === "Cancelada"){
    if(!opts.esAdmin) return no("Solo un administrador puede reabrir un servicio cancelado");
    return { permitido: true, razon: "", faltantes: requisitosEstado(s, destino), requiereMotivo: true };
  }
  if(destino === "Cancelada"){
    if((de === "Facturada") && !opts.esAdmin) return no("Solo un administrador cancela un servicio facturado");
    return { permitido: true, razon: "", faltantes: [], requiereMotivo: true };
  }
  const iDe = ESTADOS_SERVICIO.indexOf(de as EstadoLineal), iA = ESTADOS_SERVICIO.indexOf(destino as EstadoLineal);
  if(iA < iDe){
    if(!opts.esAdmin) return no("Solo un administrador puede regresar un servicio de estado");
    return { permitido: true, razon: "", faltantes: [], requiereMotivo: true };
  }
  const faltantes = requisitosEstado(s, destino);
  return { permitido: true, razon: "", faltantes, requiereMotivo: faltantes.length > 0 };
}

export interface CambioCampo { campo: string; antes: unknown; despues: unknown; }

/** Diferencias campo a campo para la bitácora (compara por JSON; ignora campos internos). */
export function diffServicio(antes: Servicio, despues: Servicio): CambioCampo[] {
  const ignorar = new Set(["id", "estadoTs", "creadoEn", "creadoPor", "creadoPorNombre", "actualizadoEn", "folio", "estado"]);
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  const out: CambioCampo[] = [];
  for(const k of claves){
    if(ignorar.has(k)) continue;
    const a = antes?.[k] ?? "", d = despues?.[k] ?? "";
    if(JSON.stringify(a) !== JSON.stringify(d)) out.push({ campo: k, antes: a, despues: d });
  }
  return out.sort((x, y) => x.campo.localeCompare(y.campo));
}

/** Minutos entre que llegó la solicitud y que quedó cotizada. null si no se puede medir. */
export function minutosACotizacion(s: Servicio): number | null {
  const ini = Date.parse(_txt(s.recibidaEn));
  const fin = Number(s.estadoTs?.Cotizada);
  if(!Number.isFinite(ini) || !Number.isFinite(fin) || fin < ini) return null;
  return Math.round((fin - ini) / 60000);
}

export interface KpisServicios {
  total: number; activos: number; porEstado: Record<string, number>;
  sinCotizarVencidas: number; paraHoy: number; porFacturar: number; conPendientes: number;
  medianaMinACotizacion: number | null;
}

/** KPIs de la bandeja. `ahoraMs` y `hoyISO` se inyectan para que sea determinista. */
export function kpisServicios(lista: Servicio[], ahoraMs: number, hoyISO: string, opts: { horasParaCotizar?: number } = {}): KpisServicios {
  const limite = (opts.horasParaCotizar ?? 1) * 3600000;
  const porEstado: Record<string, number> = {};
  let activos = 0, sinCotizarVencidas = 0, paraHoy = 0, porFacturar = 0, conPendientes = 0;
  const tiempos: number[] = [];
  for(const s of lista ?? []){
    const e = (s.estado ?? "Solicitud") as string;
    porEstado[e] = (porEstado[e] ?? 0) + 1;
    const cerrado = e === "Cancelada" || e === "Cobrada";
    if(!cerrado) activos++;
    if(e === "Solicitud"){
      const ini = Date.parse(_txt(s.recibidaEn));
      if(Number.isFinite(ini) && ahoraMs - ini > limite) sinCotizarVencidas++;
    }
    const i = ESTADOS_SERVICIO.indexOf(e as EstadoLineal);
    if(e !== "Cancelada" && s.fechaServicio === hoyISO && i < ESTADOS_SERVICIO.indexOf("Entregada")) paraHoy++;
    if(e === "Cerrada" || e === "Conciliada") porFacturar++;
    if(!cerrado && validarServicio(s).pendientes.length > 0) conPendientes++;
    const m = minutosACotizacion(s);
    if(m !== null) tiempos.push(m);
  }
  tiempos.sort((a, b) => a - b);
  const n = tiempos.length;
  const mediana = n === 0 ? null : (n % 2 ? tiempos[(n - 1) / 2]! : Math.round((tiempos[n / 2 - 1]! + tiempos[n / 2]!) / 2));
  return { total: (lista ?? []).length, activos, porEstado, sinCotizarVencidas, paraHoy, porFacturar, conPendientes, medianaMinACotizacion: mediana };
}

/** Texto corto de la ruta: "Vallejo → Polanco (+2)". */
export function resumenRuta(s: Servicio): string {
  const o = _puntosConDireccion(s.origenes), d = _puntosConDireccion(s.destinos);
  const nom = (p: PuntoServicio | undefined) => _txt(p?.nombre) || _txt(p?.direccion).split(",")[0] || "—";
  const extra = Math.max(0, o.length - 1) + Math.max(0, d.length - 1);
  return `${nom(o[0])} → ${nom(d[0])}${extra ? ` (+${extra})` : ""}`;
}
