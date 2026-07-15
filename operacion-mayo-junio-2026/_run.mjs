/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · Ejecutor desde Node
   Conecta a Firebase con auth anónima (las rules permiten cualquier auth)
   y ejecuta backup → delete mayo → import 50 servicios.
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, query, where, getDocs,
  addDoc, doc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config Firebase (del .env) ────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB7tuRYUEY471IPJdnOB69DI2yKLCU72T0",
  authDomain: "salesflow-crm-13c4a.firebaseapp.com",
  projectId: "salesflow-crm-13c4a",
  storageBucket: "salesflow-crm-13c4a.firebasestorage.app",
  messagingSenderId: "525995422237",
  appId: "1:525995422237:web:e69d7e7dd76ac9640c8cf4",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ─── Mapeo cliente → plan ───────────────────────────────────────────
const PLANES = {
  "SCJ": {
    cliente: "SCJ",
    empresa: "MARKETING & PROMOTION SAPI DE CV",
    plan: "10344 MAP → SCJ Promotores Operación",
  },
  "ACT NOW": {
    cliente: "Actnow",
    empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV",
    plan: "210201 PL → Campari Promotores",
  },
  "CANNON": {
    cliente: "Canon",
    empresa: "G-MAP OPERADORA SA DE CV",
    plan: "202003 GMAP → Canon Promotores",
  },
  "ROBOTS": {
    cliente: "Robots / POD",
    empresa: "PROMOTOR ON DEMAND SA DE CV",
    plan: "212802 POD Robots",
  },
  "HERSHEYS": {
    cliente: "Hersheys",
    empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV",
    plan: "222829 → Hersheys Implementaciones",
  },
  "HENRY": {
    cliente: "Henry / Walmart",
    empresa: "POR DEFINIR",
    plan: "Walmart Canjes Promotores",
  },
  // ✅ IVAN → POD 212802 (confirmado por el usuario)
  "IVAN": {
    cliente: "Robots / POD",
    empresa: "PROMOTOR ON DEMAND SA DE CV",
    plan: "212802 POD Robots",
  },
};

const uid = () => Math.random().toString(36).slice(2, 9).toUpperCase();

// ─── Datos de los 50 servicios (parseados del Excel) ────────────────
const SERVICIOS = JSON.parse(readFileSync(join(__dirname, "_servicios.json"), "utf8"));

// ─── MAIN ────────────────────────────────────────────────────────────
async function main() {
  console.log("🔐 Autenticando anónimamente con Firebase...");
  const cred = await signInAnonymously(auth);
  console.log(`✓ Autenticado · uid: ${cred.user.uid.slice(0, 12)}...`);

  // PASO 1 · BACKUP
  console.log("\n📦 PASO 1 · Backup de mayo 2026...");
  const q = query(
    collection(db, "facturas"),
    where("mesOp", "==", "MAYO"),
    where("anio", "==", 2026)
  );
  const snap = await getDocs(q);
  const existentes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`  Encontradas: ${existentes.length} facturas en mayo 2026`);

  const backupPath = join(__dirname, `backup-mayo-2026-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`);
  const safe = existentes.map(f => {
    const out = {};
    for (const [k, v] of Object.entries(f)) {
      if (v && typeof v === "object" && v.toDate) out[k] = v.toDate().toISOString();
      else out[k] = v;
    }
    return out;
  });
  writeFileSync(backupPath, JSON.stringify({
    backupAt: new Date().toISOString(),
    mesOp: "MAYO", anio: 2026,
    totalFacturas: existentes.length,
    facturas: safe,
  }, null, 2));
  console.log(`  ✓ Backup guardado: ${backupPath}`);

  // PASO 2 · DELETE
  console.log(`\n🗑️  PASO 2 · Borrando ${existentes.length} facturas de mayo 2026...`);
  let borradas = 0;
  for (const f of existentes) {
    await deleteDoc(doc(db, "facturas", f.id));
    borradas++;
    if (borradas % 5 === 0) process.stdout.write(`\r  Borradas: ${borradas}/${existentes.length}`);
  }
  console.log(`\n  ✓ ${borradas} facturas borradas`);

  // PASO 3 · IMPORT
  console.log(`\n📥 PASO 3 · Creando ${SERVICIOS.length} facturas (mayo + junio)...`);
  let creadas = 0;
  const errores = [];
  const creadasInfo = [];

  for (const s of SERVICIOS) {
    const p = PLANES[s.clienteRaw.toUpperCase()];
    if (!p) {
      errores.push({ servicio: s.servicio, error: `Cliente sin plan: ${s.clienteRaw}` });
      continue;
    }
    try {
      const fechaFin = new Date(s.fecha);
      const venc = new Date(fechaFin.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const folio = "FAC-" + uid();

      await addDoc(collection(db, "facturas"), {
        folio,
        mesOp: s.mes,
        anio: 2026,
        empresa: p.empresa,
        cliente: p.cliente,
        plan: p.plan,
        solicitante: p.cliente,
        servicio: `${s.fecha} - ${s.servicio}`,
        subtotal: 0, ivaAmt: 0, total: 0,
        iva: true,
        status: "Pendiente",
        notas: `Bitácora may-jun 2026 · Chofer ${s.chofer} · Unidad ${s.unidad}`,
        fechaEmision: new Date().toISOString().slice(0, 10),
        fechaVenc: venc,
        emailCliente: "",
        bitacoraImport: true,
        bitacoraServicios: [{
          fecha: s.fecha,
          chofer: s.chofer,
          unidad: s.unidad,
          clienteRaw: s.clienteRaw,
          servicio: s.servicio,
          monto: 0,
        }],
        createdAt: serverTimestamp(),
      });
      creadas++;
      creadasInfo.push({ folio, cliente: p.cliente, plan: p.plan, fecha: s.fecha, mes: s.mes });
      if (creadas % 5 === 0) process.stdout.write(`\r  Creadas: ${creadas}/${SERVICIOS.length}`);
    } catch (e) {
      errores.push({ servicio: s.servicio, error: e.message });
    }
  }
  console.log(`\n  ✓ ${creadas} facturas creadas`);

  if (errores.length) {
    console.log(`\n⚠️  Errores: ${errores.length}`);
    errores.forEach(e => console.log("  -", e.error, "·", e.servicio.slice(0, 60)));
  }

  // Resumen
  const porCliente = {};
  creadasInfo.forEach(f => {
    porCliente[f.cliente] = (porCliente[f.cliente] || 0) + 1;
  });
  console.log("\n📊 RESUMEN POR CLIENTE:");
  console.table(porCliente);

  const porMes = {};
  creadasInfo.forEach(f => {
    porMes[f.mes] = (porMes[f.mes] || 0) + 1;
  });
  console.log("📅 POR MES:");
  console.table(porMes);

  // Guardar log de creadas
  const logPath = join(__dirname, `import-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`);
  writeFileSync(logPath, JSON.stringify({ creadas: creadasInfo, errores }, null, 2));
  console.log(`\n✅ COMPLETADO. Log: ${logPath}`);

  process.exit(0);
}

main().catch(e => {
  console.error("❌ Error fatal:", e);
  process.exit(1);
});
