/* Mueve los montos de cada servicio (precio, precio propuesto, costos) del documento del servicio
   (que lee operaciones) a servicios_precios/{id} (solo el director).
   - Primero guarda un respaldo JSON con todo lo que va a mover.
   - Nada se pierde: lo que se quita del servicio queda copiado en servicios_precios con su bitácora.
   Uso:  node scripts/mover-precios-servicios.mjs <ruta-respaldo.json> [--aplicar]
   Sin --aplicar solo cuenta (no escribe nada). Credencial: serviceAccount.json (local). */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(fileURLToPath(new URL("../serviceAccount.json", import.meta.url))) });
const db = admin.firestore(), FV = admin.firestore.FieldValue;
const CAMPOS = ["precio", "precioPropuesto", "precioAprobadoPor", "precioAprobadoEn", "costoTotal", "costosN", "costosPorConcepto", "costosActualizadosEn"];
const [respaldo, bandera] = process.argv.slice(2);
if(!respaldo) { console.error("Falta la ruta del respaldo JSON"); process.exit(1); }
const aplicar = bandera === "--aplicar";

const todos = await db.collection("servicios").get();
const conMontos = todos.docs.filter(d => CAMPOS.some(k => d.data()[k] !== undefined));
const plano = v => v?.toMillis ? { _ts: v.toMillis() } : v;
writeFileSync(respaldo, JSON.stringify(conMontos.map(d => ({ id: d.id, folio: d.data().folio, montos: Object.fromEntries(CAMPOS.filter(k => d.data()[k] !== undefined).map(k => [k, plano(d.data()[k])])) })), null, 1));
console.log(`servicios: ${todos.size} · con montos: ${conMontos.length} · respaldo: ${respaldo}`);
if(!aplicar) { console.log("Solo conteo (sin --aplicar): no se escribió nada."); process.exit(0); }

let n = 0;
for(const d of conMontos){
  const s = d.data(), montos = Object.fromEntries(CAMPOS.filter(k => s[k] !== undefined).map(k => [k, s[k]]));
  const refP = db.collection("servicios_precios").doc(d.id);
  const lote = db.batch();
  lote.set(refP, { ...montos, servicioId: d.id, servicioFolio: s.folio || "", migradoEn: FV.serverTimestamp() }, { merge: true });
  lote.set(refP.collection("eventos").doc(), { tipo: "migrado", motivo: "Los montos se separaron del servicio para que operaciones no los vea", campos: Object.keys(montos),
    actorUid: "sistema", actorNombre: "Migración (director)", ts: FV.serverTimestamp() });
  lote.update(d.ref, Object.fromEntries(CAMPOS.filter(k => s[k] !== undefined).map(k => [k, FV.delete()])));
  await lote.commit(); n++;
}
const quedan = (await db.collection("servicios").get()).docs.filter(d => CAMPOS.some(k => d.data()[k] !== undefined)).length;
console.log(`movidos: ${n} · servicios que aún tienen montos: ${quedan}`);
process.exit(0);
