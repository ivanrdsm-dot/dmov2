/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · MANTENIMIENTO DIARIO (F0 → RBAC v3)
   1. Backup completo de Firestore → SISTEMA DMOV/backups/AAAA-MM-DD/
   2. Marca facturas Pendientes con fechaVenc < hoy como Vencida
   3. Retención: conserva los últimos 30 backups

   RBAC v3: las reglas ya NO permiten lectura financiera anónima, así que este
   script usa firebase-admin con un SERVICE ACCOUNT (bypassa reglas — es el
   camino correcto para jobs de servidor).

   REQUIERE: SISTEMA DMOV/serviceAccount.json
   (Consola Firebase → Project settings → Service accounts → Generate new
    private key. El archivo está en .gitignore — NUNCA al repo.)
   Programado vía launchd: com.dmov.daily-maintenance (21:30)
   ═══════════════════════════════════════════════════════════════════════════ */

import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SA_PATH = join(ROOT, "serviceAccount.json");
const BACKUP_ROOT = join(ROOT, "backups");

if (!existsSync(SA_PATH)) {
  console.error("═".repeat(70));
  console.error("❌ BACKUP NO EJECUTADO — falta serviceAccount.json");
  console.error("   Con RBAC v3 las reglas bloquean la lectura anónima (correcto),");
  console.error("   así que el backup necesita credencial de administrador:");
  console.error("   1. https://console.firebase.google.com/project/salesflow-crm-13c4a/settings/serviceaccounts/adminsdk");
  console.error("   2. 'Generate new private key' → guardar como:");
  console.error("      " + SA_PATH);
  console.error("   (ya está en .gitignore — no se sube al repo)");
  console.error("═".repeat(70));
  process.exit(1);
}

const { default: admin } = await import("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(SA_PATH, "utf8"))) });
const db = admin.firestore();

const COLECCIONES = [
  "facturas", "pagos", "pagosProveedores", "cotizaciones", "rutas", "entregas",
  "choferes", "cuentas", "jornadas", "viaticos", "gastosChofer", "presupuestos",
  "proyectos", "prospeccion", "mensajes", "alertas", "dmov_usuarios",
  "plantillasCotizador", "unidades",
];

const hoy = new Date().toISOString().slice(0, 10);
const dir = join(BACKUP_ROOT, hoy);
mkdirSync(dir, { recursive: true });

const clean = (o) => {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    r[k] = (v && typeof v.toDate === "function") ? v.toDate().toISOString() : v;
  }
  return r;
};

/* 1. Backup */
let totalDocs = 0;
const resumen = {};
for (const col of COLECCIONES) {
  try {
    const snap = await db.collection(col).get();
    const docs = snap.docs.map(d => ({ id: d.id, ...clean(d.data()) }));
    writeFileSync(join(dir, `${col}.json`), JSON.stringify(docs, null, 1));
    resumen[col] = docs.length;
    totalDocs += docs.length;
  } catch (e) {
    resumen[col] = "ERR: " + e.message;
  }
}
writeFileSync(join(dir, "_resumen.json"), JSON.stringify({ fecha: hoy, totalDocs, colecciones: resumen }, null, 2));
console.log(`✓ Backup ${hoy}: ${totalDocs} docs en ${Object.keys(resumen).length} colecciones → ${dir}`);

/* 2. Marcar Vencidas */
try {
  const snap = await db.collection("facturas").where("status", "==", "Pendiente").get();
  let venc = 0;
  for (const d of snap.docs) {
    const f = d.data();
    if (f.fechaVenc && f.fechaVenc < hoy) {
      await d.ref.update({ status: "Vencida", vencidaMarcadaEn: hoy });
      venc++;
    }
  }
  console.log(`✓ ${venc} facturas marcadas Vencida`);
} catch (e) { console.error("Error marcando vencidas:", e.message); }

/* 3. Retención 30 backups */
try {
  const dirs = readdirSync(BACKUP_ROOT).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  while (dirs.length > 30) {
    const old = dirs.shift();
    rmSync(join(BACKUP_ROOT, old), { recursive: true, force: true });
    console.log(`  retención: borrado backup ${old}`);
  }
} catch (e) { console.error("Error retención:", e.message); }

process.exit(0);
