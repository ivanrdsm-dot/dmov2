/* DMOV · avisos al celular de la OFICINA (director y operaciones) cuando salta una alerta de chofer.
   Cada persona activa los avisos en su celular desde el sistema; el servidor guarda su suscripción
   (avisos_oficina, solo la escribe el servidor) y manda cada alerta importante al momento. */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { suscripcionValida } from "./lib/seguimiento.js";
import { avisoDeAlerta } from "./lib/avisosOficina.js";

const VAPID_PRIVADA = defineSecret("VAPID_PRIVATE_KEY");
const OPC = { region: "us-central1", maxInstances: 5, memory: "256MiB", timeoutSeconds: 30 };

async function perfilOficina(req){
  const a = req.auth;
  if(!a || a.token?.firebase?.sign_in_provider === "anonymous") throw new HttpsError("unauthenticated", "Inicia sesión");
  const p = await getFirestore().doc("dmov_usuarios/" + a.uid).get();
  if(!p.exists || p.data().activo !== true) throw new HttpsError("permission-denied", "Sin perfil de oficina activo");
  return { uid: a.uid, nombre: p.data().nombre || p.data().email || "", rol: p.data().rol || "" };
}

/** accion: "llave" (devuelve la llave pública), "suscribir" (guarda este celular), "baja" (lo quita). */
export const oficinaAvisos = onCall(OPC, async req => {
  const of = await perfilOficina(req);
  const accion = String(req.data?.accion || "llave");
  if(accion === "llave") return { vapid: String(process.env.VAPID_PUBLIC_KEY || "") };
  const sub = suscripcionValida(req.data?.sub);
  if(!sub) throw new HttpsError("invalid-argument", "Suscripción no válida");
  const id = of.uid + "_" + createHash("sha256").update(sub.endpoint).digest("hex").slice(0, 24);
  const ref = getFirestore().doc("avisos_oficina/" + id);
  if(accion === "baja"){ await ref.set({ activo: false, bajaEn: FieldValue.serverTimestamp() }, { merge: true }); return { ok: true }; }
  await ref.set({ uid: of.uid, nombre: of.nombre, rol: of.rol, endpoint: sub.endpoint, keys: sub.keys, activo: true, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const avisarOficinaPush = onDocumentCreated({ document: "alertas/{aid}", region: "us-central1", memory: "256MiB", retry: false, secrets: [VAPID_PRIVADA] }, async ev => {
  const n = avisoDeAlerta({ id: ev.params.aid, ...(ev.data?.data() || {}) });
  if(!n) return;
  const publica = String(process.env.VAPID_PUBLIC_KEY || ""), privada = String(VAPID_PRIVADA.value() || "");
  if(!publica || !privada) return;
  const todas = await getFirestore().collection("avisos_oficina").where("activo", "==", true).limit(50).get();
  /* Direcciones, check-ins y posibles trampas: solo al celular del director (nunca a operaciones). */
  const subs = { docs: todas.docs.filter(d => !n.soloDirector || d.data().rol === "admin") };
  if(!subs.docs.length) return;
  webpush.setVapidDetails("https://salesflow-crm-13c4a.web.app", publica, privada);
  let enviados = 0;
  await Promise.all(subs.docs.map(async d => {
    try { const { soloDirector: _sd, ...aviso } = n; await webpush.sendNotification({ endpoint: d.data().endpoint, keys: d.data().keys }, JSON.stringify(aviso), { TTL: 3600, urgency: "high" }); enviados++; }
    catch(err){
      if([404, 410].includes(err?.statusCode)) await d.ref.update({ activo: false, bajaEn: FieldValue.serverTimestamp(), bajaMotivo: "El celular ya no acepta avisos" });
      else logger.warn("avisos oficina: no se pudo mandar", { status: err?.statusCode });
    }
  }));
  logger.info("avisos oficina", { alerta: ev.params.aid, tipo: n.tag, enviados });
});
