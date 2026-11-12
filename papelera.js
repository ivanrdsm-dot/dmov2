/* Papelera: nada se borra sin dejar rastro (regla 7 del plan).
   Antes de borrar un registro se guarda una copia completa en papelera/{coleccion}__{id},
   con quién y cuándo, en el mismo lote que el borrado: o pasan las dos cosas o ninguna.
   Las reglas de Firestore no dejan borrar estas colecciones si en ese lote no se guardó
   una copia nueva. Nadie borra ni cambia la papelera; solo se le anota "recuperado"
   una vez. Solo un admin la lee.
   Un registro recuperado se puede volver a borrar: la copia va a {coleccion}__{id}__2,
   luego __3 (máximo 3 copias por registro). */
import { doc, getDoc, writeBatch, serverTimestamp, collection, query, orderBy, limit, getDocs } from "firebase/firestore";

export const COLECCION_PAPELERA = "papelera";
export const MAX_COPIAS = 3;

/** Colecciones que solo se borran con copia en la papelera (deben coincidir con firestore.rules). */
export const CON_PAPELERA = ["rutas", "choferes", "facturas", "pagosProveedores", "presupuestos", "cuentas",
  "viaticos", "prospeccion", "proyectos", "plantillasCotizador", "unidades", "entregas"];

/** Nombre de cada colección en palabras de todos los días. */
export const NOMBRE_COLECCION = {
  rutas: "Ruta", choferes: "Chofer", facturas: "Factura", pagosProveedores: "Pago a proveedor",
  presupuestos: "Presupuesto", cuentas: "Cliente", viaticos: "Viático / gasto", prospeccion: "Prospecto",
  proyectos: "Proyecto", plantillasCotizador: "Plantilla de cotización", unidades: "Unidad", entregas: "Entrega",
};

export const idPapelera = (coleccion, id, n = 1) => `${coleccion}__${id}${n > 1 ? "__" + n : ""}`;

/** Un texto corto para reconocer el registro en la lista. */
export function resumenRegistro(datos = {}){
  const d = datos || {};
  const partes = [d.folio, d.numFactura, d.nombre, d.empresa || d.cliente, d.proveedor, d.concepto, d.titulo]
    .filter(x => typeof x === "string" && x.trim()).map(x => x.trim());
  const monto = Number(d.total ?? d.monto);
  return [...new Set(partes)].slice(0, 3).join(" · ") + (Number.isFinite(monto) && monto > 0 ? " · $" + monto.toLocaleString("es-MX") : "");
}

/** Borra `coleccion/id` guardando antes la copia. `usuario` = { uid, nombre? }. */
export async function borrarConRastro(db, usuario, coleccion, id, motivo = ""){
  if(!CON_PAPELERA.includes(coleccion)) throw new Error("Colección sin papelera: " + coleccion);
  if(!usuario?.uid) throw new Error("Necesitas sesión para borrar");
  const ref = doc(db, coleccion, id);
  const snap = await getDoc(ref);
  if(!snap.exists()) throw new Error("Ese registro ya no existe");
  let n = 1;
  for(; n <= MAX_COPIAS; n++){
    const ya = await getDoc(doc(db, COLECCION_PAPELERA, idPapelera(coleccion, id, n))).catch(() => null);
    if(!ya || !ya.exists()) break;
  }
  if(n > MAX_COPIAS) throw new Error("Este registro ya se borró y recuperó " + MAX_COPIAS + " veces; ya no se puede borrar");
  const lote = writeBatch(db);
  lote.set(doc(db, COLECCION_PAPELERA, idPapelera(coleccion, id, n)), {
    coleccion, docId: id, datos: snap.data(),
    borradoPorUid: usuario.uid, borradoPorNombre: String(usuario.nombre || usuario.email || "").slice(0, 120),
    motivo: String(motivo || "").slice(0, 500), borradoEn: serverTimestamp(),
  });
  lote.delete(ref);
  await lote.commit();
}

/** Lo borrado más reciente primero. */
export async function listarPapelera(db, max = 300){
  const s = await getDocs(query(collection(db, COLECCION_PAPELERA), orderBy("borradoEn", "desc"), limit(max)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Vuelve a poner el registro con su mismo id. La copia se queda y se anota quién lo recuperó. */
export async function recuperar(db, usuario, copia){
  if(!usuario?.uid) throw new Error("Necesitas sesión para recuperar");
  if(copia.recuperadoEn) throw new Error("Ya se recuperó");
  const ref = doc(db, copia.coleccion, copia.docId);
  if((await getDoc(ref)).exists()) throw new Error("Ya existe un registro con ese id: no se sobrescribe");
  const lote = writeBatch(db);
  lote.set(ref, copia.datos || {});
  lote.update(doc(db, COLECCION_PAPELERA, copia.id), { recuperadoPorUid: usuario.uid, recuperadoEn: serverTimestamp() });
  await lote.commit();
}
