/* COSTOS · cada vez que se captura o anula un costo de un servicio, el servidor
   recalcula el total desde la subcolección (fuente de verdad) y lo deja en servicios_precios/{id}
   (solo el director lo lee). El servicio nunca lleva montos. */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export function totalDesde(docs){
  let total = 0, n = 0; const porConcepto = {};
  for(const d of docs){
    if(d.anulado) continue;
    const m = num(d.monto);
    if(!(m > 0)) continue;
    total += m; n++;
    const k = String(d.concepto || "Otro");
    porConcepto[k] = Math.round(((porConcepto[k] || 0) + m) * 100) / 100;
  }
  return { costoTotal: Math.round(total * 100) / 100, costosN: n, costosPorConcepto: porConcepto };
}

export const recalcularCostos = onDocumentWritten({ document: "servicios/{sid}/costos/{cid}", region: "us-central1", memory: "256MiB", retry: false }, async ev => {
  const db = getFirestore();
  const ref = db.collection("servicios").doc(ev.params.sid), refP = db.collection("servicios_precios").doc(ev.params.sid);
  await db.runTransaction(async tx => {
    const [srv, costos] = await Promise.all([tx.get(ref), tx.get(ref.collection("costos"))]);
    if(!srv.exists) return;
    const r = totalDesde(costos.docs.map(d => d.data()));
    tx.set(refP, { ...r, servicioId: ev.params.sid, servicioFolio: srv.data().folio || "", costosActualizadosEn: FieldValue.serverTimestamp() }, { merge: true });
    logger.info("costos recalculados", { servicio: ev.params.sid, ...r });
  });
});
