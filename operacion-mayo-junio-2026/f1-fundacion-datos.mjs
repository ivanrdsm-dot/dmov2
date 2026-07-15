/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · FASE 1 — Fundación de datos
   1. Upsert de `cuentas` (clientes maestros) con ID estable desde CLIENTE_PLANES
   2. Backfill de clienteId + planNumero en TODAS las facturas
   3. Crea colección `unidades` desde las placas reales de la bitácora y rutas
   Idempotente. Backup previo automático del daily-maintenance ya existe.
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const app = initializeApp({
  apiKey: "AIzaSyB7tuRYUEY471IPJdnOB69DI2yKLCU72T0",
  authDomain: "salesflow-crm-13c4a.firebaseapp.com",
  projectId: "salesflow-crm-13c4a",
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
console.log("✓ Autenticado\n");

/* Catálogo maestro (espejo de CLIENTE_PLANES en App.jsx) */
const CLIENTES = [
  { id: "actnow",       nombre: "Actnow",                 empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV", rfc: "PAL030731427", planNumero: "210201", aliases: ["ACTNOW","ACT NOW","CAMPARI","APEROL","PROMOCIONES AMERICA"] },
  { id: "scj",          nombre: "SCJ",                    empresa: "MARKETING & PROMOTION SAPI DE CV",      rfc: "MPR930115NN0", planNumero: "10344",  aliases: ["SCJ"] },
  { id: "canon",        nombre: "Canon",                  empresa: "G-MAP OPERADORA SA DE CV",              rfc: "GOP170407FV7", planNumero: "202003", aliases: ["CANON","CANNON","G-MAP"] },
  { id: "robots",       nombre: "Robots / POD",           empresa: "PROMOTOR ON DEMAND SA DE CV",           rfc: "POD180501C87", planNumero: "212802", aliases: ["ROBOTS","POD","PROMOTOR ON DEMAND","BOTMATE"] },
  { id: "map_varios",   nombre: "MAP / Sofía Trueba",     empresa: "MARKETING & PROMOTION SAPI DE CV",      rfc: "MPR930115NN0", planNumero: "12801",  aliases: ["MAP","SOFIA TRUEBA","VARIOS","MARKETING & PROMOTION"] },
  { id: "tacre",        nombre: "TACRE",                  empresa: "TACRE SA DE CV",                        rfc: "TAC200225LC3", planNumero: "142804", aliases: ["TACRE","JBL"] },
  { id: "cca",          nombre: "Compras Centrales y Adm.", empresa: "COMPRAS CENTRALES Y ADMINISTRACION SA DE CV", rfc: "CCA080602TM1", planNumero: "212801", aliases: ["CCA","COMPRAS CENTRALES"] },
  { id: "hersheys",     nombre: "Hersheys",               empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV", rfc: "PAL030731427", planNumero: "222829", aliases: ["HERSHEYS","HERSHEY"] },
  { id: "henry_walmart",nombre: "Henry / Walmart",        empresa: "POR DEFINIR",                           rfc: "",             planNumero: "",       aliases: ["HENRY","LUIS ENRIQUE","WALMART","CANJES"] },
  { id: "wyder",        nombre: "Wyder",                  empresa: "POR DEFINIR",                           rfc: "",             planNumero: "203801", aliases: ["WYDER","ACTIVACIONES WYDER"] },
  { id: "mustella",     nombre: "Mustella",               empresa: "POR DEFINIR",                           rfc: "",             planNumero: "210402", aliases: ["MUSTELLA"] },
];

/* 1. Upsert cuentas con ID estable */
console.log("1️⃣  Upsert de cuentas maestras...");
for (const c of CLIENTES) {
  await setDoc(doc(db, "cuentas", c.id), {
    nombre: c.nombre,
    razonSocial: c.empresa,
    rfc: c.rfc,
    planNumero: c.planNumero,
    aliases: c.aliases,
    esCatalogoMaestro: true,
    actualizadoF1: new Date().toISOString().slice(0, 10),
  }, { merge: true });
}
console.log(`   ✓ ${CLIENTES.length} cuentas maestras (merge, no destructivo)\n`);

/* 2. Backfill clienteId + planNumero en facturas */
console.log("2️⃣  Backfill clienteId en facturas...");
function matchCliente(f) {
  const hay = [f.plan, f.solicitante, f.empresa, f.cliente].filter(Boolean).join(" ").toUpperCase();
  // 1º: por número de plan (más confiable)
  for (const c of CLIENTES) {
    if (c.planNumero && hay.includes(c.planNumero)) return c;
  }
  // 2º: por alias
  for (const c of CLIENTES) {
    if (c.aliases.some(a => hay.includes(a))) return c;
  }
  return null;
}
const fSnap = await getDocs(collection(db, "facturas"));
let matched = 0, unmatched = [];
for (const d of fSnap.docs) {
  const f = d.data();
  if (f.clienteId) { matched++; continue; } // idempotente
  const c = matchCliente(f);
  if (c) {
    const planNum = (f.plan || "").match(/^\d{4,6}/)?.[0] || c.planNumero || "";
    await updateDoc(doc(db, "facturas", d.id), { clienteId: c.id, planNumero: planNum });
    matched++;
  } else {
    unmatched.push({ folio: f.folio, empresa: f.empresa || f.cliente, plan: f.plan, total: f.total });
  }
}
console.log(`   ✓ ${matched} facturas con clienteId`);
if (unmatched.length) {
  console.log(`   ⚠ ${unmatched.length} sin match (revisar):`);
  unmatched.forEach(u => console.log(`     · ${u.folio} · ${u.empresa} · plan="${u.plan}" · $${Number(u.total||0).toLocaleString("es-MX")}`));
}
console.log("");

/* 3. Colección unidades desde placas reales */
console.log("3️⃣  Creando colección unidades...");
const placas = new Map(); // placa -> {vistas, choferes:Set}
const addPlaca = (p, chofer) => {
  const placa = String(p || "").trim().toUpperCase();
  if (!placa || placa === "—" || placa.length < 4) return;
  if (!placas.has(placa)) placas.set(placa, { vistas: 0, choferes: new Set() });
  const e = placas.get(placa);
  e.vistas++;
  if (chofer && chofer !== "—") e.choferes.add(chofer);
};
// De bitacoraServicios en facturas
fSnap.docs.forEach(d => {
  (d.data().bitacoraServicios || []).forEach(s => addPlaca(s.unidad, s.chofer));
});
// De rutas (choferPlaca)
const rSnap = await getDocs(collection(db, "rutas"));
rSnap.docs.forEach(d => addPlaca(d.data().choferPlaca, d.data().choferNombre));
// De choferes (placa)
const chSnap = await getDocs(collection(db, "choferes"));
chSnap.docs.forEach(d => addPlaca(d.data().placa, d.data().nombre));

for (const [placa, info] of placas) {
  await setDoc(doc(db, "unidades", placa), {
    placa,
    tipo: "",                 // a completar: eurovan / 3.5 / krafter...
    serviciosVistos: info.vistas,
    choferesFrecuentes: [...info.choferes],
    status: "Activa",
    seguroVence: "",          // a completar
    verificacionVence: "",    // a completar
    creadaEnF1: new Date().toISOString().slice(0, 10),
  }, { merge: true });
}
console.log(`   ✓ ${placas.size} unidades creadas/actualizadas:`);
[...placas.entries()].sort((a,b)=>b[1].vistas-a[1].vistas).forEach(([p, i]) =>
  console.log(`     · ${p.padEnd(10)} ${String(i.vistas).padStart(3)} servicios · choferes: ${[...i.choferes].join(", ") || "—"}`));

/* Verificación */
console.log("\n📊 VERIFICACIÓN:");
const f2 = await getDocs(collection(db, "facturas"));
const conCliente = f2.docs.filter(d => d.data().clienteId).length;
console.log(`   Facturas con clienteId: ${conCliente}/${f2.size}`);
const porCliente = {};
f2.docs.forEach(d => { const c = d.data().clienteId || "SIN"; porCliente[c] = (porCliente[c]||0)+1; });
console.log("   Por clienteId:", JSON.stringify(porCliente));
process.exit(0);
