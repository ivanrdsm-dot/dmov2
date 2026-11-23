/* DMOV · HISTORIAL DE RUTAS desde la bitácora de Ilse (mayo–junio 2026)
   Convierte cada viaje de operacion-mayo-junio-2026/_servicios.json en un servicio
   HISTÓRICO (folio BIT-2026-0001…): chofer, unidad, cliente, fecha y el texto tal cual.
   Lo que la bitácora no trae (precio, direcciones, quién recibió) queda PENDIENTE.
   Concilia contra las facturas del mismo cliente y mes (solo lectura de facturas).

   Por omisión NO escribe: muestra lo que haría.   node scripts/importar-historial-bitacora.mjs
   Para escribir en producción:                    node scripts/importar-historial-bitacora.mjs --escribir
   Se puede repetir: un viaje ya cargado no se toca (mismo id). Nada se borra.
   Requiere SISTEMA DMOV/serviceAccount.json (ignorado por git; nunca al repo). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { viajeAServicio, resumenHistorial } from "../historialRutas.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "functions/package.json"));
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const ESCRIBIR = process.argv.includes("--escribir");
const FUENTE = "Bitácora de viajes de Ilse · mayo–junio 2026";

initializeApp({ credential: cert(join(ROOT, "serviceAccount.json")) });
const db = getFirestore();
const lee = async c => (await db.collection(c).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const [choferes, cuentas, facturas] = await Promise.all([lee("choferes"), lee("cuentas"), lee("facturas")]);

const viajes = JSON.parse(readFileSync(join(ROOT, "operacion-mayo-junio-2026/_servicios.json"), "utf8"))
  .map((v, i) => ({ ...v, i })).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.i - b.i);
const docs = viajes.map((v, k) => viajeAServicio(v, k + 1, { choferes, cuentas, facturas, fuente: FUENTE }));

console.log(`${docs.length} viajes de la bitácora → servicios históricos ${docs[0].datos.folio} a ${docs.at(-1).datos.folio}\n`);
for(const { datos: d } of docs)
  console.log(`${d.folio}  ${d.fechaServicio}  ${d.estado.padEnd(9)}  ${(d.choferNombre || "—").slice(0, 34).padEnd(34)}  ${(d.unidadPlaca || "—").padEnd(8)}  ${d.empresa.slice(0, 16).padEnd(16)}  ${d.conciliacion.estado}${d.conciliacion.facturas.length ? " (" + d.conciliacion.facturas.map(f => f.folio).join(", ") + ")" : ""}`);
const r = resumenHistorial(docs.map(x => x.datos));
console.log(`\nViajes que cuentan: ${r.viajes} · cancelados: ${docs.filter(x => x.datos.estado === "Cancelada").length} · sin factura: ${r.sinFactura} · factura del mes por revisar: ${r.porRevisar} · con incidencia: ${r.incidencias}`);
console.log("Por chofer:", r.choferes.map(c => `${c.chofer} ${c.viajes}`).join(" · "));
const sinAlta = [...new Set(docs.flatMap(x => x.datos.pendientes.filter(p => p.startsWith("Dar de alta")).map(p => p.replace("Dar de alta chofer: ", ""))))];
if(sinAlta.length) console.log("Choferes que no están dados de alta (se guardan con su nombre):", sinAlta.join(", "));

if(!ESCRIBIR){ console.log("\nModo prueba: no se escribió nada. Agrega --escribir para cargarlo."); process.exit(0); }

let creados = 0, yaEstaban = 0;
for(const { id, datos } of docs){
  const ref = db.collection("servicios").doc(id);
  const ts = Timestamp.fromDate(new Date(datos.fechaServicio + "T12:00:00-06:00"));   // ordena por la fecha del viaje (hora no registrada)
  try {
    const lote = db.batch();
    lote.create(ref, { ...datos, estadoTs: { [datos.estado]: ts }, creadoEn: ts, importadoEn: FieldValue.serverTimestamp(),
      creadoPor: "importacion-historial", creadoPorNombre: "Importación de bitácora" });
    lote.set(ref.collection("eventos").doc("importado"), { tipo: "importado_historico", a: datos.estado, fuente: FUENTE, textoOriginal: datos.descripcion,
      pendientes: datos.pendientes, actorUid: "sistema", actorNombre: "Importación de bitácora", actorRol: "sistema", ts: FieldValue.serverTimestamp() });
    await lote.commit();
    creados++;
  } catch(e){
    if(e.code === 6 || /already exists/i.test(e.message)) yaEstaban++;
    else throw e;
  }
}
console.log(`\nListo: ${creados} creados, ${yaEstaban} ya estaban (no se tocaron).`);
process.exit(0);
