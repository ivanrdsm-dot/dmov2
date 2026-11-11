/* Acceso a datos del tarifario. Lo lee toda la oficina; solo un admin lo modifica (lo exigen las reglas).
   Cada cambio de precio queda en `cambios` con quién, cuándo y de cuánto a cuánto. Nada se borra. */
import { collection, doc, onSnapshot, query, orderBy, limit, writeBatch, serverTimestamp } from "firebase/firestore";
import { diffTarifa, idTarifa } from "./tarifario.ts";

const aMs = v => (v && typeof v.toMillis === "function") ? v.toMillis() : null;
const limpiaPrecios = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Number(String(v ?? "").replace(/[$,\s]/g, ""))]).filter(([, v]) => Number.isFinite(v) && v > 0));

export function crearTarifarioStore(db){
  const col = collection(db, "tarifario");
  /* Reglas del cotizador: solo cambia su valor; nombre, clave y unidad son fijos. */
  const guardarRegla = async (usuario, antes, datos) => {
    if(!antes?.id) throw new Error("Las reglas del cotizador no se dan de alta desde aquí");
    const valor = Number(String(datos.valor ?? "").replace(/[$,%\s]/g, ""));
    if(!Number.isFinite(valor) || valor < 0) throw new Error("Valor inválido");
    const cambios = diffTarifa(antes, { ...antes, valor });
    if(cambios.length === 0) return 0;
    const ref = doc(db, "tarifario", antes.id), quien = usuario.nombre || usuario.email || usuario.uid;
    const lote = writeBatch(db);
    lote.update(ref, { valor, actualizadoEn: serverTimestamp(), actualizadoPor: quien });
    lote.set(doc(collection(ref, "cambios")), { tipo: "precio", cambios, activo: antes.activo !== false, actorUid: usuario.uid, actorNombre: quien, ts: serverTimestamp() });
    await lote.commit();
    return cambios.length;
  };
  return {
    suscribir(cb, onErr){ return onSnapshot(query(col, limit(600)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data(), actualizadoEn: aMs(d.data().actualizadoEn) }))), onErr); },
    suscribirCambios(id, cb){
      return onSnapshot(query(collection(db, "tarifario", id, "cambios"), orderBy("ts", "desc"), limit(30)),
        s => cb(s.docs.map(d => ({ id: d.id, ...d.data(), ts: aMs(d.data({ serverTimestamps: "estimate" }).ts) }))), () => cb([]));
    },
    async guardar(usuario, antes, datos){
      if(datos.tipo === "regla") return guardarRegla(usuario, antes, datos);
      const vu = Number(String(datos.valorUnico ?? "").replace(/[$,\s]/g, "")), km = Number(datos.km);
      const cuerpo = { tipo: datos.tipo, nombre: String(datos.nombre).trim(), km: Number.isFinite(km) && km > 0 ? km : null,
        base: limpiaPrecios(datos.base), cliente: limpiaPrecios(datos.cliente), valorUnico: Number.isFinite(vu) && vu > 0 ? vu : null, activo: datos.activo !== false };
      const cambios = diffTarifa(antes, cuerpo);
      const soloEstado = antes && cambios.length === 0 && (antes.activo !== false) !== cuerpo.activo;
      if(antes && cambios.length === 0 && !soloEstado) return 0;
      const ref = doc(db, "tarifario", antes?.id || idTarifa(cuerpo.tipo, cuerpo.nombre));
      const quien = usuario.nombre || usuario.email || usuario.uid;
      const lote = writeBatch(db);
      lote.set(ref, { ...cuerpo, actualizadoEn: serverTimestamp(), actualizadoPor: quien, ...(antes ? {} : { origen: "captura manual" }) }, { merge: true });
      lote.set(doc(collection(ref, "cambios")), { tipo: antes ? (soloEstado ? "estado" : "precio") : "alta", cambios, activo: cuerpo.activo, actorUid: usuario.uid, actorNombre: quien, ts: serverTimestamp() });
      await lote.commit();
      return cambios.length || 1;
    },
  };
}
