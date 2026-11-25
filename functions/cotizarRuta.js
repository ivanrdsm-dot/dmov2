/* PEDIDO → RUTA → COTIZACIÓN, en automático.
   Cuando operaciones asigna una ruta (oficinaPrepararRuta), el servidor:
     1. Calcula la cotización con el tarifario (lib/cotizarRuta.js) y la guarda en cotizaciones_logistica
        con folio consecutivo, ligada al servicio y a su pedido (solicitud), en estado "Propuesta".
     2. Deja en el servicio el folio y el estado de la cotización (sin montos: operaciones no ve números).
     3. Deja el precio propuesto en servicios_precios (solo el director lo lee) y le avisa al director.
   Cuando el director aprueba (o la cotización cambia de estado), el servicio se actualiza solo.
   El precio que ve el cliente lo aprueba SIEMPRE el director. Nada se borra: una cotización se cancela con motivo. */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { cotizarRuta } from "./lib/cotizarRuta.js";

const db = () => getFirestore();
const ahora = () => FieldValue.serverTimestamp();
const COL = "cotizaciones_logistica";
const folioCot = (n, anio) => `COT-${anio}-${String(n).padStart(4, "0")}`;
const anioCDMX = () => Number(new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 4));
const pesos = n => "$" + Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });

/** Arma y guarda la cotización de un servicio con ruta. Idempotente: si ya tiene cotización viva, no hace nada.
 *  `actor` = { uid, nombre, rol }. `sustituye` = cotización anterior que se reemplaza (al recalcular). */
export async function generarCotizacionRuta(servicioId, actor, { sustituye = null } = {}){
  const refS = db().doc("servicios/" + servicioId);
  const s = await refS.get();
  if(!s.exists) return null;
  const servicio = s.data();
  if(servicio.cotizacionId && !sustituye) return { yaExistia: true, folio: servicio.cotizacionFolio || "" };
  const placa = String(servicio.unidadPlaca || "").trim().toUpperCase();
  const [unidadSnap, paradasSnap, tarifasSnap] = await Promise.all([
    placa ? db().doc("unidades/" + placa).get() : null,
    refS.collection("paradas").get(),
    db().collection("tarifario").get(),
  ]);
  const c = cotizarRuta({ servicio, unidad: unidadSnap?.exists ? unidadSnap.data() : null,
    paradas: paradasSnap.docs.map(d => d.data()), tarifas: tarifasSnap.docs.map(d => ({ id: d.id, ...d.data() })) });
  const r = c.resultado, anio = anioCDMX();
  const refC = db().collection(COL).doc(), refCont = db().doc(`contadores/${COL}-${anio}`), refP = db().doc("servicios_precios/" + servicioId);
  const quien = { actorUid: actor.uid, actorNombre: actor.nombre, actorRol: actor.rol };
  const folio = await db().runTransaction(async tx => {
    const [cont, sAhora] = await Promise.all([tx.get(refCont), tx.get(refS)]);
    if(sAhora.data().cotizacionId && sAhora.data().cotizacionId !== sustituye?.id) return null;   // otra llamada ya la creó
    const n = (cont.exists ? Number(cont.data().n) || 0 : 0) + 1, f = folioCot(n, anio);
    tx.set(refCont, { n, ultimoFolio: f, actualizadoEn: ahora() });
    tx.set(refC, {
      folio: f, estado: "Propuesta", estadoTs: { Propuesta: ahora() }, origen: "ruta_asignada",
      empresa: String(servicio.empresa || "").slice(0, 200), solicitante: String(servicio.solicitante || "").slice(0, 200),
      contacto: String(servicio.solicitanteContacto || "").slice(0, 320), notas: String(servicio.indicaciones || servicio.notas || "").slice(0, 2000),
      servicioId, servicioFolio: servicio.folio || "",
      ...(servicio.solicitudId ? { solicitudId: servicio.solicitudId, solicitudFolio: servicio.solicitudFolio || "" } : {}),
      ...(sustituye ? { sustituyeA: sustituye.folio } : {}),
      entrada: { modo: "Ruta asignada", tipoRuta: c.tipoRuta, destino: c.destino, entregas: c.entregas, conAyudante: c.conAyudante,
        unidadPlaca: c.unidadPlaca, unidadTipo: c.unidadTipo, fechaServicio: servicio.fechaServicio || "", foraneo: servicio.foraneo ?? null },
      resultado: r, precioPropuesto: r.precio,
      creadoEn: ahora(), creadoPor: actor.uid, creadoPorNombre: `Sistema · al asignar la ruta (${actor.nombre})`,
    });
    tx.set(refC.collection("eventos").doc(), { tipo: "creada", a: "Propuesta", ...quien, ts: ahora(),
      nota: r.precio ? "Calculada en automático al asignar la ruta" : "Calculada al asignar la ruta; faltan datos para el precio",
      datos: { precioPropuesto: r.precio, servicioFolio: servicio.folio || "", pendientes: r.pendientes } });
    tx.update(refS, { cotizacionId: refC.id, cotizacionFolio: f, cotizacionEstado: "Propuesta", cotizacionEn: ahora(),
      cotizacionPendientes: r.pendientes.length, actualizadoEn: ahora() });
    tx.set(refS.collection("eventos").doc(), { tipo: "cotizacion_generada", cotizacionFolio: f, precioPropuesto: r.precio, pendientes: r.pendientes, ...quien, ts: ahora() });
    tx.set(refP, { precioPropuesto: r.precio, cotizacionId: refC.id, cotizacionFolio: f, servicioId, servicioFolio: servicio.folio || "", actualizadoEn: ahora() }, { merge: true });
    if(sustituye) tx.update(db().doc(`${COL}/${sustituye.id}`), { estado: "Cancelada", "estadoTs.Cancelada": ahora(), motivo: `Se recalculó: la sustituye ${f}`, actualizadoEn: ahora() });
    if(sustituye) tx.set(db().collection(`${COL}/${sustituye.id}/eventos`).doc(), { tipo: "estado", de: sustituye.estado, a: "Cancelada", motivo: `Se recalculó: la sustituye ${f}`, ...quien, ts: ahora() });
    return f;
  });
  if(!folio) return { yaExistia: true };
  /* Aviso al director (solo él lo ve): qué servicio, cuánto propone el tarifario o qué falta. */
  const msg = `${servicio.folio || ""} · ${servicio.empresa || ""} · ${r.precio ? pesos(r.precio) + " + IVA" : "sin precio"}${r.pendientes.length ? " · falta: " + r.pendientes.join("; ") : ""}`;
  await db().collection("alertas_director").add({ type: "cotizacion_por_aprobar", informativa: true, atendida: true, titulo: "Cotización por aprobar",
    msg: `${folio} · ${msg}`.slice(0, 600), cotizacionId: refC.id, servicioId, url: "/?v=cotizaciones", ts: ahora() });
  logger.info("cotización automática", { servicioId, folio, precio: r.precio, pendientes: r.pendientes.length });
  return { folio, precio: r.precio, pendientes: r.pendientes };
}

/** El director recalcula la cotización de un servicio (p. ej. después de registrar el tipo de la unidad). */
export const directorRecotizarServicio = onCall({ region: "us-central1", maxInstances: 5, memory: "256MiB", timeoutSeconds: 30 }, async req => {
  const auth = req.auth;
  if(!auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar");
  const p = await db().doc("dmov_usuarios/" + auth.uid).get();
  if(!p.exists || p.data().activo !== true || p.data().rol !== "admin") throw new HttpsError("permission-denied", "Solo el director puede recalcular");
  const actor = { uid: auth.uid, nombre: p.data().nombre || p.data().email || auth.uid, rol: "admin" };
  const cotizacionId = String(req.data?.cotizacionId || "").slice(0, 80);
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(cotizacionId)) throw new HttpsError("invalid-argument", "Cotización no válida");
  const c = await db().doc(`${COL}/${cotizacionId}`).get();
  if(!c.exists) throw new HttpsError("not-found", "Cotización no encontrada");
  const d = c.data();
  if(d.estado !== "Propuesta") throw new HttpsError("failed-precondition", "Solo se recalcula una cotización por aprobar");
  if(!d.servicioId) throw new HttpsError("failed-precondition", "Esta cotización no viene de una ruta");
  const r = await generarCotizacionRuta(d.servicioId, actor, { sustituye: { id: c.id, folio: d.folio, estado: d.estado } });
  if(!r?.folio) throw new HttpsError("aborted", "No se pudo recalcular; vuelve a intentar");
  return r;
});

/** Cuando la cotización de un servicio cambia de estado, el servicio lo refleja (seguimiento) y,
 *  si el director aprobó el precio, queda como precio del servicio (en servicios_precios, solo director). */
export const reflejarCotizacionEnServicio = onDocumentUpdated({ document: `${COL}/{cid}`, region: "us-central1", memory: "256MiB", retry: false }, async ev => {
  const antes = ev.data.before.data(), d = ev.data.after.data();
  if(!d?.servicioId || antes.estado === d.estado) return;
  const refS = db().doc("servicios/" + d.servicioId), s = await refS.get();
  if(!s.exists || s.data().cotizacionId !== ev.params.cid) return;     // ya la sustituyó otra
  const lote = db().batch();
  lote.update(refS, { cotizacionEstado: d.estado, actualizadoEn: ahora() });
  lote.set(refS.collection("eventos").doc(), { tipo: "cotizacion_estado", cotizacionFolio: d.folio, de: antes.estado, a: d.estado,
    actorUid: "sistema", actorNombre: "Sistema", actorRol: "sistema", ts: ahora() });
  if(d.estado === "Aprobada" && Number(d.precioAprobado) > 0)
    lote.set(db().doc("servicios_precios/" + d.servicioId), { precio: Number(d.precioAprobado), precioAprobadoPor: d.aprobadoPor || "", precioAprobadoEn: ahora(),
      cotizacionFolio: d.folio, servicioId: d.servicioId, servicioFolio: d.servicioFolio || "", actualizadoEn: ahora() }, { merge: true });
  await lote.commit();
});
