/* FACTURA → SERVICIO · cuando cambia el estado de una factura pedida desde un
   servicio, el servidor lo refleja en el servicio (facturaEstado) y lo anota en su
   bitácora. No cambia el estado del servicio: eso sigue siendo decisión de la oficina. */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const reflejarFacturaEnServicio = onDocumentWritten({ document: "facturas/{fid}", region: "us-central1", memory: "256MiB", retry: false }, async ev => {
  const antes = ev.data?.before?.exists ? ev.data.before.data() : null;
  const despues = ev.data?.after?.exists ? ev.data.after.data() : null;
  const sid = despues?.servicioOrigenId || antes?.servicioOrigenId;
  if(!sid) return;
  const estado = despues ? String(despues.status || "") : "Borrada";
  if(antes && despues && antes.status === despues.status && antes.folio === despues.folio) return;
  const ref = getFirestore().doc("servicios/" + sid);
  const s = await ref.get();
  if(!s.exists) return;
  const lote = getFirestore().batch();
  lote.update(ref, { facturaEstado: estado, facturaFolio: despues?.folio || s.data().facturaFolio || "", facturaActualizadaEn: FieldValue.serverTimestamp() });
  lote.set(ref.collection("eventos").doc(), { tipo: "factura_estado", de: antes?.status || "", a: estado, facturaFolio: despues?.folio || "",
    actorUid: "sistema", actorNombre: "Facturación", actorRol: "sistema", ts: FieldValue.serverTimestamp() });
  await lote.commit();
});
