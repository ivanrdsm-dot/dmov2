/* SEGUIMIENTO DE UN SERVICIO · de punta a punta, en una sola línea:
   pedido → ruta asignada → cotización → aprobada → en ruta → entregada → facturada → cobrada.
   Sin montos (lo ve operaciones). Lógica pura; probada en seguimientoServicio.test.ts. */

export type EstadoEtapa = "hecho" | "actual" | "falta" | "problema";
export interface Etapa { clave: string; titulo: string; estado: EstadoEtapa; detalle: string; }

const ORDEN = ["Solicitud", "Cotizada", "Confirmada", "Asignada", "En ruta", "Entregada", "Cerrada", "Conciliada", "Facturada", "Cobrada"];
const ETIQUETA_COT: Record<string, string> = { Propuesta: "por aprobar del director", Aprobada: "aprobada · falta enviarla al cliente", Enviada: "enviada · esperando al cliente",
  Aceptada: "aceptada por el cliente", Rechazada: "rechazada por el cliente", Cancelada: "cancelada" };
const txt = (v: unknown) => String(v ?? "").trim();
const hora = (ms: unknown) => { const n = Number(ms); return Number.isFinite(n) && n > 0 ? new Date(n).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };

export function etapasServicio(s: Record<string, any>): Etapa[] {
  const ts = (s?.estadoTs ?? {}) as Record<string, number>;
  const i = ORDEN.indexOf(txt(s?.estado));
  const llego = (e: string) => i >= 0 && i >= ORDEN.indexOf(e);
  const cancelada = s?.estado === "Cancelada";
  const e: Etapa[] = [];
  e.push({ clave: "pedido", titulo: "Pedido", estado: "hecho",
    detalle: [txt(s?.solicitudFolio) && `Solicitud ${txt(s.solicitudFolio)}`, txt(s?.canal), txt(s?.recibidaEn).replace("T", " ")].filter(Boolean).join(" · ") });
  const ruta = !!s?.rutaArmadaEn || llego("Asignada");
  e.push({ clave: "ruta", titulo: "Ruta asignada", estado: ruta ? "hecho" : "falta",
    detalle: ruta ? [txt(s?.choferNombre), txt(s?.segundoChoferNombre), txt(s?.unidadPlaca)].filter(Boolean).join(" · ") : "Falta asignar chofer y unidad" });
  const ce = txt(s?.cotizacionEstado), folio = txt(s?.cotizacionFolio);
  const cotOk = ["Aprobada", "Enviada", "Aceptada"].includes(ce) || (!ce && !!folio && llego("Cotizada"));
  e.push({ clave: "cotizacion", titulo: "Cotización",
    estado: !folio ? "falta" : ["Rechazada", "Cancelada"].includes(ce) ? "problema" : ce === "Aceptada" || (cotOk && !ce) ? "hecho" : "actual",
    detalle: !folio ? (ruta ? "Sin cotización ligada" : "Se crea sola al asignar la ruta")
      : `${folio}${ce ? " · " + (ETIQUETA_COT[ce] || ce) : ""}${Number(s?.cotizacionPendientes) > 0 && ce === "Propuesta" ? ` · ${s.cotizacionPendientes} dato(s) por completar` : ""}` });
  const etapa = (clave: string, titulo: string, estadoSrv: string, falta: string) => {
    const hecho = llego(estadoSrv);
    e.push({ clave, titulo, estado: hecho ? "hecho" : "falta", detalle: hecho ? hora(ts[estadoSrv]) || "Listo" : falta });
  };
  etapa("en_ruta", "En ruta", "En ruta", "El chofer no ha salido");
  etapa("entregada", "Entregada", "Entregada", "Pendiente de entregar");
  const fact = llego("Facturada") || /factur|emitid|timbr/i.test(txt(s?.facturaEstado));
  e.push({ clave: "facturada", titulo: "Facturada", estado: fact ? "hecho" : "falta", detalle: fact ? hora(ts.Facturada) || txt(s?.facturaEstado) || "Listo" : "Sin factura" });
  etapa("cobrada", "Cobrada", "Cobrada", "Sin cobrar");
  if(cancelada) return e.map(x => x.estado === "hecho" ? x : { ...x, estado: "problema" as EstadoEtapa, detalle: "Servicio cancelado" + (txt(s?.motivoCancelacion) ? ": " + txt(s.motivoCancelacion) : "") });
  /* La primera que falta es la que toca ahora. */
  const k = e.findIndex(x => x.estado === "falta" || x.estado === "actual");
  if(k >= 0 && e[k]!.estado === "falta") e[k] = { ...e[k]!, estado: "actual" };
  return e;
}

/** Texto corto de en qué va el servicio (para listas). */
export function enQueVa(s: Record<string, any>): string {
  const e = etapasServicio(s), a = e.find(x => x.estado === "actual" || x.estado === "problema");
  return a ? `${a.titulo}: ${a.detalle}` : "Completo";
}
