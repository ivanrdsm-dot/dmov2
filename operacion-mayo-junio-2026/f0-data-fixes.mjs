/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · FASE 0 — Correcciones de datos en producción
   1. Migra alertas de la colección "alerts" (inglés) → "alertas" (español)
   2. Normaliza el campo `plan` de facturas (solo variantes del MISMO número de plan)
   3. Persiste status "Vencida" en facturas Pendientes con fechaVenc < hoy
   4. Recategoriza viáticos "otro" usando el prefijo del concepto (Nómina—, etc.)
   Todo con backup previo por sección. Idempotente.
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, getDocs, query, where,
  addDoc, doc, updateDoc, deleteDoc
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = initializeApp({
  apiKey: "AIzaSyB7tuRYUEY471IPJdnOB69DI2yKLCU72T0",
  authDomain: "salesflow-crm-13c4a.firebaseapp.com",
  projectId: "salesflow-crm-13c4a",
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
console.log("✓ Autenticado\n");

const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = (v && v.toDate) ? v.toDate().toISOString() : v; return r; };

/* ── 1. MIGRAR alerts → alertas ──────────────────────────────────────────── */
console.log("1️⃣  Migrando colección alerts → alertas...");
const aSnap = await getDocs(collection(db, "alerts"));
if (aSnap.size > 0) {
  writeFileSync(join(__dirname, `backup-alerts-${stamp}.json`), JSON.stringify(aSnap.docs.map(d => ({ id: d.id, ...clean(d.data()) })), null, 2));
  let mig = 0;
  for (const d of aSnap.docs) {
    const data = d.data();
    // atendida = equivalente semántico de read en la colección destino
    await addDoc(collection(db, "alertas"), { ...data, atendida: data.read === true, migradaDeAlerts: true });
    await deleteDoc(doc(db, "alerts", d.id));
    mig++;
  }
  console.log(`   ✓ ${mig} alertas migradas (backup guardado)\n`);
} else {
  console.log("   ✓ alerts ya está vacía — nada que migrar\n");
}

/* ── 2. NORMALIZAR planes (solo mismo número de plan / typos evidentes) ──── */
console.log("2️⃣  Normalizando campo plan en facturas...");
// REGLA: solo se fusionan variantes que comparten el MISMO número de plan.
// Los planes 142804 con sub-etiquetas distintas (TACRE) NO se tocan — decisión de negocio.
const PLAN_CANONICO = {
  "P-10344 MAP SCJ Promotores Operación": "10344 MAP → SCJ Promotores Operación",
  "10344 SCJ PROMOTORES":                  "10344 MAP → SCJ Promotores Operación",
  "P-210201 Campari Promotores":           "210201 PL → Campari Promotores",
  "CAMPARI SUMMIT ACTNOW 210212":          "210212 Campari Summit Actnow",
  "210212 CAMPARI":                        "210212 Campari Summit Actnow",
  "202003 GMAP CANON PROMOTORES":          "202003 GMAP → Canon Promotores",
  "P-202003 GMAP Canon Promotores":        "202003 GMAP → Canon Promotores",
  "P-202003 GMAP Operaciones":             "202003 GMAP → Canon Promotores",
  "212802":                                "212802 POD Robots",
  "212802 PROMOTOR ON DEMAND":             "212802 POD Robots",
  "P-222829 Hersheys Implementaciones":    "222829 → Hersheys Implementaciones",
  "P-12801 MAP Varios 2011":               "12801 MAP → Varios 2011",
  "203801 ACTIVVACIONES WYDER":            "203801 Activaciones Wyder",   // typo VV
  "203801 ACTIVACIONES WYDER":             "203801 Activaciones Wyder",
};
const fSnap = await getDocs(collection(db, "facturas"));
writeFileSync(join(__dirname, `backup-facturas-pre-f0-${stamp}.json`), JSON.stringify(fSnap.docs.map(d => ({ id: d.id, ...clean(d.data()) })), null, 2));
let planFix = 0;
const ambiguos = {};
for (const d of fSnap.docs) {
  const f = d.data();
  const p = (f.plan || "").trim();
  if (PLAN_CANONICO[p]) {
    await updateDoc(doc(db, "facturas", d.id), { plan: PLAN_CANONICO[p], planOriginal: p });
    planFix++;
  } else if (p && !Object.values(PLAN_CANONICO).includes(p)) {
    ambiguos[p] = (ambiguos[p] || 0) + 1;
  }
}
console.log(`   ✓ ${planFix} facturas normalizadas (backup completo guardado)`);
console.log("   Planes NO tocados (requieren decisión de negocio):");
Object.entries(ambiguos).sort((a,b)=>b[1]-a[1]).forEach(([k, n]) => console.log(`     · ${k}  (${n})`));
console.log("");

/* ── 3. PERSISTIR "Vencida" ──────────────────────────────────────────────── */
console.log("3️⃣  Persistiendo status Vencida...");
const hoy = new Date().toISOString().slice(0, 10);
let venc = 0;
for (const d of fSnap.docs) {
  const f = d.data();
  if (f.status === "Pendiente" && f.fechaVenc && f.fechaVenc < hoy) {
    await updateDoc(doc(db, "facturas", d.id), { status: "Vencida", vencidaMarcadaEn: hoy });
    venc++;
  }
}
console.log(`   ✓ ${venc} facturas marcadas Vencida (fechaVenc < ${hoy})\n`);

/* ── 4. RECATEGORIZAR viáticos "otro" por prefijo del concepto ───────────── */
console.log("4️⃣  Recategorizando gastos 'otro'...");
const PREFIJOS = [
  [/^nómina|^nomina/i,        "nomina"],
  [/^subcontrato/i,           "subcontrato"],
  [/^transporte\s*—?\s*flete|^flete/i, "flete"],
  [/^comunicación|^comunicacion/i, "comunicacion"],
  [/^fiscal/i,                "fiscal"],
  [/^bancario/i,              "bancario"],
  [/mantenimiento/i,          "mantenimiento"],
  [/^operación|^operacion/i,  "operacion"],
];
const vSnap = await getDocs(collection(db, "viaticos"));
writeFileSync(join(__dirname, `backup-viaticos-pre-f0-${stamp}.json`), JSON.stringify(vSnap.docs.map(d => ({ id: d.id, ...clean(d.data()) })), null, 2));
let recat = 0, sinCat = [];
for (const d of vSnap.docs) {
  const v = d.data();
  if ((v.tipo || "otro") !== "otro") continue;
  const c = (v.concepto || "").trim();
  const hit = PREFIJOS.find(([rx]) => rx.test(c));
  if (hit) {
    await updateDoc(doc(db, "viaticos", d.id), { tipo: hit[1], tipoOriginal: "otro" });
    recat++;
  } else {
    sinCat.push({ concepto: c.slice(0, 60), monto: v.monto });
  }
}
console.log(`   ✓ ${recat} gastos recategorizados`);
if (sinCat.length) {
  console.log("   Quedan en 'otro' (revisar a mano):");
  sinCat.forEach(s => console.log(`     · $${Number(s.monto||0).toLocaleString("es-MX")} — ${s.concepto}`));
}

/* ── Verificación final ──────────────────────────────────────────────────── */
console.log("\n📊 VERIFICACIÓN FINAL:");
const fin = await getDocs(collection(db, "facturas"));
const st = {}; fin.docs.forEach(d => { const s = d.data().status || "?"; st[s] = (st[s]||0)+1; });
console.log("   Facturas por status:", JSON.stringify(st));
const planes = new Set(); fin.docs.forEach(d => planes.add((d.data().plan||"SIN PLAN").trim()));
console.log("   Planes distintos ahora:", planes.size, "(antes: 35)");
const v2 = await getDocs(collection(db, "viaticos"));
const tp = {}; let totOtro = 0;
v2.docs.forEach(d => { const x = d.data(); const t = x.tipo||"otro"; tp[t]=(tp[t]||0)+Number(x.monto||0); if(t==="otro") totOtro+=Number(x.monto||0); });
console.log("   Gasto restante en 'otro': $" + totOtro.toLocaleString("es-MX"));
const al = await getDocs(collection(db, "alertas"));
console.log("   Docs en alertas:", al.size);
process.exit(0);
