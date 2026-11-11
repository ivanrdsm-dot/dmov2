/* Despacho y torre de control: lee en vivo choferes, ubicaciones, servicios y paradas.
   Todo lo que cambia la ruta pasa por Cloud Functions (functions/chofer.js): aquí no se escribe Firestore. */
import { collection, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const aMs = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);
export function crearDespachoStore(db, app){
  const fn = getFunctions(app, "us-central1");
  const llamar = (nombre, datos) => httpsCallable(fn, nombre)(datos).then(r => r.data);
  const lista = (q, cb, mapa = d => ({ id: d.id, ...d.data() })) => onSnapshot(q, s => cb(s.docs.map(mapa)), () => cb([]));
  return {
    suscribirChoferes: cb => lista(query(collection(db, "choferes"), limit(300)), cb),
    suscribirUbicaciones: cb => lista(query(collection(db, "ubicaciones"), limit(300)), x => cb(Object.fromEntries(x.map(u => [u.id, u])))),
    suscribirServicios: cb => lista(query(collection(db, "servicios"), where("estado", "in", ["Asignada", "En ruta"]), limit(100)), cb),
    suscribirParadas: (servicioId, cb) => lista(query(collection(db, "servicios", servicioId, "paradas"), orderBy("orden")), cb),
    /* Todas las sin atender (un SOS nunca queda fuera por el límite), las más nuevas primero. */
    suscribirAlertas: cb => lista(query(collection(db, "alertas"), where("atendida", "==", false), limit(300)), x => cb(x.sort((a, b) => (b.ts || 0) - (a.ts || 0))),
      d => { const v = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...v, msg: v.msg || v.message || v.mensaje || "", ts: aMs(v.ts) ?? aMs(v.createdAt) }; }),
    vincularChofer: (choferId, correo) => llamar("oficinaVincularChofer", { choferId, correo }),
    liberarDispositivo: (choferId, motivo) => llamar("oficinaLiberarDispositivo", { choferId, motivo }),
    prepararRuta: (servicioId, choferId, ordenar = true) => llamar("oficinaPrepararRuta", { servicioId, choferId, ordenar }),
    autorizarExcepcion: (servicioId, paradaId, motivo) => llamar("oficinaAutorizarExcepcion", { servicioId, paradaId, motivo }),
    linkSeguimiento: (servicioId, nuevo = false) => llamar("oficinaLinkSeguimiento", { servicioId, nuevo }),
  };
}
