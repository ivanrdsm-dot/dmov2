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
    suscribirAlertas: cb => lista(query(collection(db, "alertas"), orderBy("ts", "desc"), limit(25)), cb, d => ({ id: d.id, ...d.data(), ts: aMs(d.data({ serverTimestamps: "estimate" }).ts) })),
    vincularChofer: (choferId, correo) => llamar("oficinaVincularChofer", { choferId, correo }),
    liberarDispositivo: (choferId, motivo) => llamar("oficinaLiberarDispositivo", { choferId, motivo }),
    prepararRuta: (servicioId, choferId) => llamar("oficinaPrepararRuta", { servicioId, choferId }),
    autorizarExcepcion: (servicioId, paradaId, motivo) => llamar("oficinaAutorizarExcepcion", { servicioId, paradaId, motivo }),
    linkSeguimiento: (servicioId, nuevo = false) => llamar("oficinaLinkSeguimiento", { servicioId, nuevo }),
  };
}
