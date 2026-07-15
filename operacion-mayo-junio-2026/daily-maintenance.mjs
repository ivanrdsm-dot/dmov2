/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · MANTENIMIENTO DIARIO (F0)
   1. Backup completo de Firestore → SISTEMA DMOV/backups/AAAA-MM-DD/
   2. Marca facturas Pendientes con fechaVenc < hoy como Vencida
   3. Retención: conserva los últimos 30 backups, borra los más viejos
   Programado vía launchd: com.dmov.daily-maintenance (21:30 todos los días)
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_ROOT = join(__dirname, "..", "backups");

const COLECCIONES = [
  "facturas", "cotizaciones", "rutas", "entregas", "choferes", "cuentas",
  "jornadas", "viaticos", "gastosChofer", "presupuestos", "proyectos",
  "prospeccion", "mensajes", "alertas", "dmov_usuarios", "plantillasCotizador",
];

const app = initializeApp({
  apiKey: "AIzaSyB7tuRYUEY471IPJdnOB69DI2yKLCU72T0",
  authDomain: "salesflow-crm-13c4a.firebaseapp.com",
  projectId: "salesflow-crm-13c4a",
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));

const hoy = new Date().toISOString().slice(0, 10);
const dir = join(BACKUP_ROOT, hoy);
mkdirSync(dir, { recursive: true });

const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = (v && v.toDate) ? v.toDate().toISOString() : v; return r; };

/* 1. Backup */
let totalDocs = 0;
const resumen = {};
for (const col of COLECCIONES) {
  try {
    const snap = await getDocs(collection(db, col));
    const docs = snap.docs.map(d => ({ id: d.id, ...clean(d.data()) }));
    writeFileSync(join(dir, `${col}.json`), JSON.stringify(docs, null, 1));
    resumen[col] = docs.length;
    totalDocs += docs.length;
  } catch (e) {
    resumen[col] = "ERR: " + (e.code || e.message);
  }
}
writeFileSync(join(dir, "_resumen.json"), JSON.stringify({ fecha: hoy, totalDocs, colecciones: resumen }, null, 2));
console.log(`✓ Backup ${hoy}: ${totalDocs} docs en ${Object.keys(resumen).length} colecciones → ${dir}`);

/* 2. Marcar Vencidas */
try {
  const fSnap = await getDocs(collection(db, "facturas"));
  let venc = 0;
  for (const d of fSnap.docs) {
    const f = d.data();
    if (f.status === "Pendiente" && f.fechaVenc && f.fechaVenc < hoy) {
      await updateDoc(doc(db, "facturas", d.id), { status: "Vencida", vencidaMarcadaEn: hoy });
      venc++;
    }
  }
  console.log(`✓ ${venc} facturas marcadas Vencida`);
} catch (e) {
  console.error("Error marcando vencidas:", e.message);
}

/* 3. Retención 30 backups */
try {
  if (existsSync(BACKUP_ROOT)) {
    const dirs = readdirSync(BACKUP_ROOT).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    while (dirs.length > 30) {
      const old = dirs.shift();
      rmSync(join(BACKUP_ROOT, old), { recursive: true, force: true });
      console.log(`  retención: borrado backup ${old}`);
    }
  }
} catch (e) { console.error("Error retención:", e.message); }

process.exit(0);
