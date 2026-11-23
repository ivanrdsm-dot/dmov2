/* SEGUIMIENTO PARA EL CLIENTE · página pública con link privado (token largo y aleatorio).
   - El link lo crea la oficina (oficinaLinkSeguimiento); cambiarlo invalida el anterior.
   - La página se arma en el servidor con la vista pública: nada de precios ni datos internos.
   - Al entregar, el cliente puede calificar una sola vez; queda en servicios/{id}/encuesta. */
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { vistaPublica, validarEncuesta, paginaSeguimiento, paginaNoEncontrada, tokenValido, estadoJSON, suscripcionValida, manifestCliente } from "./lib/seguimiento.js";
import { createHash } from "node:crypto";

const db = () => getFirestore();
const ahora = () => FieldValue.serverTimestamp();
/* Token público de Mapbox (pk.…) en functions/.env.<proyecto>; sin token la página sale sin mapa. */
const MAPBOX = () => String(process.env.MAPBOX_TOKEN || "");
const VAPID_PUBLICA = () => String(process.env.VAPID_PUBLIC_KEY || "");
const csp = nonce => ["default-src 'none'", `script-src 'nonce-${nonce}' https://unpkg.com`, "style-src 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob: https://*.mapbox.com", "connect-src 'self' https://*.mapbox.com https://events.mapbox.com", "worker-src 'self' blob:", "child-src blob:", "manifest-src 'self'",
  "font-src https://api.mapbox.com", "form-action 'self'", "frame-ancestors 'none'", "base-uri 'none'"].join("; ");
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const enviar = (res, status, html, nonce = randomBytes(16).toString("base64")) => {
  res.set({ ...HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp(nonce) }); res.status(status).send(html); };

async function servicioPorToken(t){
  if(!tokenValido(t)) return null;
  const q = await db().collection("servicios").where("seguimientoToken", "==", t).limit(1).get();
  return q.empty ? null : q.docs[0];
}

export const seguimiento = onRequest({ region: "us-central1", maxInstances: 5, memory: "256MiB", timeoutSeconds: 20 }, async (req, res) => {
  try {
    /* Token por ?t= (Vercel reescribe así) o en la ruta /s/<token> (Firebase Hosting manda la ruta tal cual). */
    const t = String(req.query.t ?? "") || String(req.path || "").split("/").filter(Boolean).pop() || "";
    if(!["GET", "POST"].includes(req.method)) return enviar(res, 405, paginaNoEncontrada());
    const doc = await servicioPorToken(t);
    if(!doc) return enviar(res, 404, paginaNoEncontrada());
    /* Vista con mapa en vivo y avisos: paradas, última ubicación del chofer de ESTE servicio y bitácora. */
    const leerVista = async (ref) => {
      const s = (await ref.get()).data();
      const [ps, evs, u] = await Promise.all([ref.collection("paradas").orderBy("orden").get(), ref.collection("eventos").orderBy("ts", "desc").limit(40).get(),
        s.choferId ? db().doc("ubicaciones/" + s.choferId).get() : Promise.resolve(null)]);
      return vistaPublica(s, ps.docs.map(d => ({ id: d.id, ...d.data() })), { servicioId: ref.id, ahoraMs: Date.now(),
        ubicacion: u?.exists ? u.data() : null, eventos: evs.docs.map(d => ({ id: d.id, ...d.data() })) });
    };
    const pagina = (v, opc = {}) => { const nonce = randomBytes(16).toString("base64"); return [paginaSeguimiento(v, { ...opc, nonce, mapboxToken: MAPBOX(), vapidPublica: VAPID_PUBLICA() }), nonce]; };
    if(req.method === "GET" && req.query.formato === "manifest"){
      res.set({ ...HEADERS, "Content-Type": "application/manifest+json; charset=utf-8" });
      return res.status(200).send(JSON.stringify(manifestCliente(`/s/${t}`, doc.data().folio)));
    }
    /* El celular del cliente se suscribe a los avisos (Web Push). Máximo 20 celulares por servicio. */
    if(req.method === "POST" && req.query.accion === "suscribir"){
      const sub = suscripcionValida(req.body || {});
      if(!sub) return res.status(400).json({ ok: false });
      const col = doc.ref.collection("suscripciones"), id = createHash("sha256").update(sub.endpoint).digest("hex").slice(0, 40);
      const activas = await col.where("activo", "==", true).limit(21).get();
      if(activas.size >= 20 && !activas.docs.some(d => d.id === id)) return res.status(429).json({ ok: false });
      await col.doc(id).set({ ...sub, activo: true, creadoEn: ahora(), agente: String(req.get("user-agent") || "").slice(0, 160) }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if(req.method === "GET" && req.query.formato === "json"){
      res.set({ ...HEADERS, "Content-Type": "application/json; charset=utf-8" });
      return res.status(200).send(JSON.stringify(estadoJSON(await leerVista(doc.ref))));
    }
    if(req.method === "POST"){
      const v = validarEncuesta(req.body || {});
      if(!v.ok){ const [h, n] = pagina(await leerVista(doc.ref), { error: v.error }); return enviar(res, 400, h, n); }
      await db().runTransaction(async tx => {
        const s = (await tx.get(doc.ref)).data();
        const vista = vistaPublica(s, []);
        if(!vista.puedeCalificar) return;           // solo una vez y solo ya entregado
        tx.set(doc.ref.collection("encuesta").doc("respuesta"), { calificacion: v.calificacion, comentario: v.comentario, ts: ahora() });
        tx.update(doc.ref, { encuestaRespondida: true, encuestaCalificacion: v.calificacion });
        tx.set(doc.ref.collection("eventos").doc(), { tipo: "encuesta", calificacion: v.calificacion, actorUid: "cliente", actorNombre: "Cliente (link de seguimiento)", actorRol: "cliente", ts: ahora() });
      });
      const [h, n] = pagina(await leerVista(doc.ref), { gracias: true }); return enviar(res, 200, h, n);
    }
    const [h, n] = pagina(await leerVista(doc.ref)); return enviar(res, 200, h, n);
  } catch(e){
    console.error("seguimiento", e);
    return enviar(res, 500, paginaNoEncontrada());
  }
});

/** La oficina crea (o cambia) el link de seguimiento de un servicio. */
export const oficinaLinkSeguimiento = onCall({ region: "us-central1", maxInstances: 5, memory: "256MiB" }, async req => {
  const auth = req.auth;
  if(!auth || auth.token?.firebase?.sign_in_provider === "anonymous") throw new HttpsError("unauthenticated", "Inicia sesión para continuar");
  const p = await db().doc("dmov_usuarios/" + auth.uid).get();
  if(!p.exists || p.data().activo !== true) throw new HttpsError("permission-denied", "Sin perfil de oficina activo");
  const id = String(req.data?.servicioId ?? ""), nuevo = req.data?.nuevo === true;
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new HttpsError("invalid-argument", "Servicio no válido");
  const ref = db().doc("servicios/" + id);
  /* Transacción: dos clics seguidos no generan dos links distintos. */
  return db().runTransaction(async tx => {
    const s = await tx.get(ref);
    if(!s.exists) throw new HttpsError("not-found", "Servicio no encontrado");
    if(s.data().seguimientoToken && !nuevo) return { token: s.data().seguimientoToken };
    const token = randomBytes(32).toString("base64url");
    tx.update(ref, { seguimientoToken: token, seguimientoCreadoEn: ahora() });
    tx.set(ref.collection("eventos").doc(), { tipo: nuevo ? "link_seguimiento_cambiado" : "link_seguimiento_creado",
      actorUid: auth.uid, actorNombre: p.data().nombre || p.data().email || auth.uid, actorRol: p.data().rol || "", ts: ahora() });
    return { token };
  });
});
