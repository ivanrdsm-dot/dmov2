/* Acceso a datos de los catálogos operativos (puntos de entrega, proveedores).
   Nada se borra: se da de baja. Cada guardado deja su registro en `cambios`. */
import { collection, doc, onSnapshot, query, limit, writeBatch, serverTimestamp } from "firebase/firestore";

const INTERNOS = ["id", "creadoEn", "creadoPor", "actualizadoEn", "actualizadoPor"];
const limpio = d => Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== undefined && !INTERNOS.includes(k)));

export function crearCatalogoStore(db, coleccion){
  const col = collection(db, coleccion);
  return {
    suscribir(cb, onErr){
      return onSnapshot(query(col, limit(1000)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
    },
    async guardar(usuario, antes, datos){
      const cuerpo = limpio(datos);
      const ref = antes?.id ? doc(db, coleccion, antes.id) : doc(col);
      const quien = usuario.nombre || usuario.email || usuario.uid;
      const campos = antes ? Object.keys(cuerpo).filter(k => JSON.stringify(cuerpo[k] ?? "") !== JSON.stringify(antes[k] ?? "")) : Object.keys(cuerpo);
      if(antes && campos.length === 0) return ref.id;
      const lote = writeBatch(db);
      if(antes) lote.update(ref, { ...cuerpo, actualizadoEn: serverTimestamp(), actualizadoPor: quien });
      else lote.set(ref, { ...cuerpo, activo: cuerpo.activo !== false, creadoEn: serverTimestamp(), creadoPor: usuario.uid, actualizadoEn: serverTimestamp(), actualizadoPor: quien });
      lote.set(doc(collection(ref, "cambios")), { tipo: antes ? "editado" : "creado", campos, actorUid: usuario.uid, actorNombre: quien, ts: serverTimestamp() });
      await lote.commit();
      return ref.id;
    },
  };
}
