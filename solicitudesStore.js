/* Acceso a datos de la bandeja de Solicitudes. Las de correo y Slack las crea el
   servidor (functions/index.js); aquí la oficina las lee en vivo, registra las
   manuales y cambia su estado. Cada escritura lleva su evento de bitácora. */
import {
  collection, doc, getDoc, onSnapshot, query, orderBy, limit, runTransaction, writeBatch, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { folioSolicitud } from "./functions/lib/solicitudes.js";

const aMs = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);
const CAMPOS_TS = ["recibidaEn", "registradaEn", "acuseEnviadoEn", "primeraRespuestaEn", "actualizadoEn"];
export const normalizarSolicitud = (id, d) => { const o = { id, ...d }; for(const k of CAMPOS_TS) o[k] = aMs(d[k]); return o; };
const actor = u => ({ actorUid: u.uid, actorNombre: u.nombre || u.email || "", actorRol: u.rol || "" });
const t = (v, max) => String(v ?? "").trim().slice(0, max);

export function crearSolicitudesStore(db){
  const col = collection(db, "solicitudes");
  const escribir = async (usuario, s, cambios, ev) => {
    const ref = doc(db, "solicitudes", s.id);
    const lote = writeBatch(db);
    lote.update(ref, { ...cambios, actualizadoEn: serverTimestamp() });
    lote.set(doc(collection(ref, "eventos")), { ...ev, ...actor(usuario), ts: serverTimestamp() });
    await lote.commit();
  };
  return {
    suscribir(cb, onErr){
      return onSnapshot(query(col, orderBy("registradaEn", "desc"), limit(300)),
        s => cb(s.docs.map(d => normalizarSolicitud(d.id, d.data({ serverTimestamps: "estimate" })))), onErr);
    },
    suscribirEventos(id, cb, onErr){
      return onSnapshot(query(collection(db, "solicitudes", id, "eventos"), orderBy("ts", "asc"), limit(200)),
        s => cb(s.docs.map(d => { const e = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...e, ts: aMs(e.ts) }; })), onErr);
    },
    /* Una solicitud por id, con su estado actual (para ligarla desde otro módulo). */
    async leer(id){
      const s = await getDoc(doc(db, "solicitudes", id));
      return s.exists() ? normalizarSolicitud(s.id, s.data()) : null;
    },
    /* Latido del vigilante (función programada del servidor). */
    suscribirVigilante(cb){
      return onSnapshot(doc(db, "sistema", "vigilante"), s => { const d = s.exists() ? s.data({ serverTimestamps: "estimate" }) : {}; cb({ ...d, ultimaCorrida: aMs(d.ultimaCorrida) }); }, () => cb({}));
    },
    suscribirConectores(cb){
      return onSnapshot(doc(db, "sistema", "conectores"), s => {
        const d = s.exists() ? s.data({ serverTimestamps: "estimate" }) : {};
        cb(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, ultimoLatido: aMs(v?.ultimoLatido) }])));
      }, () => cb({}));
    },
    /* Solicitud que llegó por un canal sin conector (WhatsApp, teléfono, en persona). */
    async crearManual(usuario, datos){
      const anio = new Date().getFullYear();
      const refContador = doc(db, "contadores", "solicitudes-" + anio);
      const ref = doc(col);
      const recibida = new Date(datos.recibidaEn);
      if(Number.isNaN(recibida.getTime()) || recibida.getTime() > Date.now() + 60000) throw new Error("La hora de recepción no es válida");
      const folio = await runTransaction(db, async tx => {
        const snap = await tx.get(refContador);
        const n = (snap.exists() ? Number(snap.data().n) || 0 : 0) + 1;
        const f = folioSolicitud(n, anio);
        tx.set(refContador, { n, ultimoFolio: f, actualizadoEn: serverTimestamp() });
        tx.set(ref, { folio: f, estado: "Nueva", origen: "manual", creadoPor: usuario.uid, creadoPorNombre: usuario.nombre || usuario.email || "",
          canal: datos.canal, remitenteNombre: t(datos.remitenteNombre, 200), remitenteCorreo: t(datos.remitenteContacto, 320),
          asunto: t(datos.asunto, 500), texto: t(datos.texto, 20000), adjuntos: [],
          recibidaEn: Timestamp.fromDate(recibida), registradaEn: serverTimestamp() });
        tx.set(doc(collection(ref, "eventos")), { tipo: "recibida", manual: true, ...actor(usuario), ts: serverTimestamp() });
        return f;
      });
      return { id: ref.id, folio };
    },
    /* Detiene el reloj: alguien ya le contestó al solicitante. La hora la pone el servidor. */
    async marcarRespondida(usuario, s, nota = ""){
      const cambios = { estado: "Respondida" };
      if(!s.primeraRespuestaEn){ cambios.primeraRespuestaEn = serverTimestamp(); cambios.primeraRespuestaVia = "manual"; cambios.primeraRespuestaPor = usuario.nombre || usuario.email || usuario.uid; }
      await escribir(usuario, s, cambios, { tipo: "respondida", de: s.estado, a: "Respondida", nota: t(nota, 500) });
    },
    async cambiarEstado(usuario, s, a, motivo = ""){
      await escribir(usuario, s, { estado: a }, { tipo: "estado", de: s.estado, a, motivo: t(motivo, 500) });
    },
    /* La solicitud ya tiene cotización: queda ligada a su folio. No detiene el reloj:
       eso pasa cuando alguien le responde al solicitante. */
    async vincularCotizacion(usuario, s, cotizacion){
      await escribir(usuario, s, { cotizacionId: cotizacion.id, cotizacionFolio: cotizacion.folio, ...(s.estado === "Nueva" ? { estado: "En revisión" } : {}) },
        { tipo: "cotizada", de: s.estado, a: s.estado === "Nueva" ? "En revisión" : s.estado, cotizacionFolio: cotizacion.folio });
    },
    async vincularServicio(usuario, s, servicio){
      const cambios = { estado: "Convertida", servicioId: servicio.id, servicioFolio: servicio.folio };
      if(!s.primeraRespuestaEn){ cambios.primeraRespuestaEn = serverTimestamp(); cambios.primeraRespuestaVia = "servicio"; }
      await escribir(usuario, s, cambios, { tipo: "convertida", de: s.estado, a: "Convertida", servicioFolio: servicio.folio });
    },
  };
}
