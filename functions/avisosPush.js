/* DMOV · avisos al celular del cliente (Web Push).
   Cada evento nuevo del servicio (salió a ruta, está por llegar, entregó, hubo un detalle, completado)
   se manda a los celulares que el cliente suscribió desde su link de seguimiento.
   Solo el texto para el cliente (avisosCliente): nada interno. Celulares que ya no existen se desactivan. */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import webpush from "web-push";
import { notificacionDeEvento } from "./lib/seguimiento.js";

const VAPID_PRIVADA = defineSecret("VAPID_PRIVATE_KEY");
const TIPOS = ["estado", "parada_entregada", "parada_incidencia", "llegando"];

export const avisarClientePush = onDocumentCreated({ document: "servicios/{sid}/eventos/{eid}", region: "us-central1", memory: "256MiB", retry: false, secrets: [VAPID_PRIVADA] }, async ev => {
  const e = ev.data?.data();
  if(!e || !TIPOS.includes(e.tipo)) return;
  const publica = String(process.env.VAPID_PUBLIC_KEY || ""), privada = String(VAPID_PRIVADA.value() || "");
  if(!publica || !privada) return;
  const db = getFirestore(), ref = db.doc("servicios/" + ev.params.sid);
  const [s, subs] = await Promise.all([ref.get(), ref.collection("suscripciones").where("activo", "==", true).limit(20).get()]);
  if(!s.exists || !s.data().seguimientoToken || subs.empty) return;
  const paradas = e.paradaId ? (await ref.collection("paradas").get()).docs.map(d => ({ id: d.id, ...d.data() })) : [];
  const n = notificacionDeEvento({ id: ev.params.eid, ...e }, paradas, s.data(), s.data().seguimientoToken);
  if(!n) return;
  try { webpush.setVapidDetails("https://salesflow-crm-13c4a.web.app", publica, privada); }
  catch(err){ logger.error("avisos push: llaves inválidas", { error: err.message }); return; }
  let enviados = 0;
  await Promise.all(subs.docs.map(async d => {
    try { await webpush.sendNotification({ endpoint: d.data().endpoint, keys: d.data().keys }, JSON.stringify(n), { TTL: 3600, urgency: "high" }); enviados++; }
    catch(err){
      if([404, 410].includes(err?.statusCode)) await d.ref.update({ activo: false, bajaEn: FieldValue.serverTimestamp(), bajaMotivo: "El celular ya no acepta avisos" });
      else logger.warn("avisos push: no se pudo mandar", { status: err?.statusCode, error: String(err?.message || err).slice(0, 200) });
    }
  }));
  logger.info("avisos push", { servicio: ev.params.sid, evento: e.tipo, celulares: subs.size, enviados });
});
