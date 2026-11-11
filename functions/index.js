/* DMOV · Cloud Functions
   conectorSolicitudes: única puerta por la que los conectores (correo, Slack) meten
   solicitudes a la bandeja. Corre en la nube de Google; no depende de ninguna computadora.

   Seguridad:
   - Exige el token del conector (Secret Manager), comparado en tiempo constante.
   - El cuerpo es DATO: se valida y recorta con limpiarEntrada(); nada de lo recibido
     decide estado, folio, precio ni permisos.
   - Idempotente: el mismo mensaje externo nunca crea dos solicitudes. */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { createHash, timingSafeEqual } from "node:crypto";
import { limpiarEntrada, idDocumento, folioSolicitud, acuseTexto } from "./lib/solicitudes.js";

initializeApp();
const db = getFirestore();
const TOKEN = defineSecret("DMOV_CONECTOR_TOKEN");

const sha = v => createHash("sha256").update(String(v ?? "")).digest();
const tokenValido = recibido => { const esperado = TOKEN.value(); return !!esperado && timingSafeEqual(sha(recibido), sha(esperado)); };
const anioCDMX = () => new Date(Date.now() - 6 * 3600000).getUTCFullYear();
const evento = ref => ref.collection("eventos").doc();
const ACTOR = canal => ({ actorUid: "conector", actorNombre: "Conector " + canal, actorRol: "sistema" });

async function ingresar(cuerpo){
  const d = limpiarEntrada(cuerpo);
  const ref = db.collection("solicitudes").doc(idDocumento(d.idExterno));
  const r = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(snap.exists) return { folio: snap.data().folio, nuevo: false, acuseEnviado: !!snap.data().acuseEnviadoEn };
    const anio = anioCDMX();
    const refContador = db.collection("contadores").doc("solicitudes-" + anio);
    const c = await tx.get(refContador);
    const n = (c.exists ? Number(c.data().n) || 0 : 0) + 1;
    const folio = folioSolicitud(n, anio);
    tx.set(refContador, { n, ultimoFolio: folio, actualizadoEn: FieldValue.serverTimestamp() });
    tx.set(ref, {
      folio, estado: "Nueva", origen: "conector", creadoPor: "conector",
      canal: d.canal, idExterno: d.idExterno, hilo: d.hilo,
      remitenteNombre: d.remitenteNombre, remitenteCorreo: d.remitenteCorreo,
      asunto: d.asunto, texto: d.texto, textoTruncado: d.textoTruncado, adjuntos: d.adjuntos, automatico: d.automatico,
      recibidaEn: d.recibidaMs ? Timestamp.fromMillis(d.recibidaMs) : FieldValue.serverTimestamp(),
      registradaEn: FieldValue.serverTimestamp(),
    });
    tx.set(evento(ref), { tipo: "recibida", ...ACTOR(d.canal), ts: FieldValue.serverTimestamp() });
    return { folio, nuevo: true, acuseEnviado: false };
  });
  return { ...r, acusar: !r.acuseEnviado && !d.automatico, acuse: acuseTexto(r.folio, d.remitenteNombre) };
}

async function marcar(cuerpo, tipo){
  const ref = db.collection("solicitudes").doc(idDocumento(cuerpo?.idExterno));
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists) throw Object.assign(new Error("Solicitud no encontrada"), { status: 404 });
    const s = snap.data();
    if(tipo === "acuse"){
      if(s.acuseEnviadoEn) return { folio: s.folio, cambio: false };
      tx.update(ref, { acuseEnviadoEn: FieldValue.serverTimestamp() });
      tx.set(evento(ref), { tipo: "acuse_enviado", ...ACTOR(s.canal), ts: FieldValue.serverTimestamp() });
      return { folio: s.folio, cambio: true };
    }
    /* respondida: la primera respuesta humana por el canal detiene el reloj */
    if(s.primeraRespuestaEn) return { folio: s.folio, cambio: false };
    const ms = Date.parse(String(cuerpo?.respondidaEn ?? ""));
    const recibida = s.recibidaEn?.toMillis?.() ?? 0;
    const cuando = Number.isFinite(ms) && ms >= recibida && ms <= Date.now() + 60000 ? Timestamp.fromMillis(ms) : FieldValue.serverTimestamp();
    const cambios = { primeraRespuestaEn: cuando, primeraRespuestaVia: "canal" };
    if(["Nueva", "En revisión"].includes(s.estado)) cambios.estado = "Respondida";
    tx.update(ref, cambios);
    tx.set(evento(ref), { tipo: "respondida", de: s.estado, a: cambios.estado || s.estado, ...ACTOR(s.canal), ts: FieldValue.serverTimestamp() });
    return { folio: s.folio, cambio: true };
  });
}

async function latido(cuerpo){
  const conector = String(cuerpo?.conector ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  if(!conector) throw new Error("Conector sin nombre");
  await db.collection("sistema").doc("conectores").set({ [conector]: { ultimoLatido: FieldValue.serverTimestamp(), version: String(cuerpo?.version ?? "").slice(0, 20) } }, { merge: true });
  return { conector };
}

export const conectorSolicitudes = onRequest(
  { region: "us-central1", secrets: [TOKEN], maxInstances: 3, memory: "256MiB", timeoutSeconds: 30, invoker: "public" },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    if(req.method !== "POST") return void res.status(405).json({ ok: false, error: "Solo POST" });
    if(!tokenValido(req.get("x-dmov-token"))) return void res.status(401).json({ ok: false, error: "No autorizado" });
    const cuerpo = req.body && typeof req.body === "object" ? req.body : {};
    try {
      const accion = String(cuerpo.accion ?? "");
      const r = accion === "ingresar" ? await ingresar(cuerpo)
        : accion === "acuse" ? await marcar(cuerpo, "acuse")
        : accion === "respondida" ? await marcar(cuerpo, "respondida")
        : accion === "latido" ? await latido(cuerpo)
        : null;
      if(!r) return void res.status(400).json({ ok: false, error: "Acción desconocida" });
      res.json({ ok: true, ...r });
    } catch(e){
      const status = e.status || (/inválid|desconocid|sin nombre/i.test(e.message) ? 400 : 500);
      if(status >= 500) logger.error("conectorSolicitudes", e);
      res.status(status).json({ ok: false, error: status >= 500 ? "Error interno" : e.message });
    }
  });

/* Fase 1 · chofer rastreado y verificado */
export {
  choferRegistrarDispositivo, choferCheckIn, choferIniciarRuta, choferSubirPosiciones, choferCerrarParada, choferSOS,
  oficinaVincularChofer, oficinaLiberarDispositivo, oficinaPrepararRuta, oficinaAutorizarExcepcion,
} from "./chofer.js";

/* Fase 2 · vigilante de la operación (alertas automáticas cada 5 min) */
export { vigilante } from "./vigilante.js";

/* Fase 6 · costos reales por servicio: el total lo recalcula el servidor */
export { recalcularCostos } from "./costos.js";
