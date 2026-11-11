/* Papelera: nada se borra sin dejar rastro (regla 7 del plan).
   Antes de borrar un registro se guarda una copia completa en papelera/{coleccion}__{id},
   con quién y cuándo, en el mismo lote que el borrado: o pasan las dos cosas o ninguna.
   Las reglas de Firestore no dejan borrar estas colecciones si la copia no existe al final
   del lote, y nadie puede editar ni borrar la papelera. Solo un admin la lee. */
import { doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";

export const COLECCION_PAPELERA = "papelera";

/** Colecciones que solo se borran con copia en la papelera (deben coincidir con firestore.rules). */
export const CON_PAPELERA = ["rutas", "choferes", "facturas", "pagosProveedores", "presupuestos", "cuentas",
  "viaticos", "prospeccion", "proyectos", "plantillasCotizador", "unidades", "entregas"];

export const idPapelera = (coleccion, id) => `${coleccion}__${id}`;

/** Borra `coleccion/id` guardando antes la copia. `usuario` = { uid, nombre? }. */
export async function borrarConRastro(db, usuario, coleccion, id, motivo = "") {
  if (!CON_PAPELERA.includes(coleccion)) throw new Error("Colección sin papelera: " + coleccion);
  if (!usuario?.uid) throw new Error("Necesitas sesión para borrar");
  const ref = doc(db, coleccion, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Ese registro ya no existe");
  const lote = writeBatch(db);
  lote.set(doc(db, COLECCION_PAPELERA, idPapelera(coleccion, id)), {
    coleccion, docId: id, datos: snap.data(),
    borradoPorUid: usuario.uid, borradoPorNombre: String(usuario.nombre || usuario.email || "").slice(0, 120),
    motivo: String(motivo || "").slice(0, 500), borradoEn: serverTimestamp(),
  });
  lote.delete(ref);
  await lote.commit();
}
