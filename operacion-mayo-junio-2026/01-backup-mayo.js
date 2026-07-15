/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · BACKUP FACTURAS MAYO 2026
   ───────────────────────────────────────────────────────────────────────────
   QUÉ HACE:
   1. Conecta a tu Firestore (usa la sesión de Firebase ya activa en la pestaña).
   2. Lee TODAS las facturas con mesOp = "MAYO" y anio = 2026.
   3. Descarga un JSON con backup completo a tu carpeta de Descargas.
   4. NO modifica nada. Solo lectura.

   CÓMO USAR:
   1. Abre https://dmov2-ixgf.vercel.app/  (logueado como admin)
   2. Abre DevTools: F12 (Mac: Cmd+Opt+I)
   3. Ve a pestaña "Console"
   4. Pega TODO este archivo y dale Enter
   5. Espera a que descargue el archivo dmov-backup-mayo-2026-*.json
   ═══════════════════════════════════════════════════════════════════════════ */

(async function backupMayo2026() {
  console.log("%c🔒 DMOV · BACKUP FACTURAS MAYO 2026", "font-size:16px;font-weight:bold;color:#FF6B35");

  // Detectar Firestore desde la app
  let db = null;
  try {
    const firebase = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
    // Re-usar la app de Firebase ya inicializada
    const appMod = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js");
    const apps = appMod.getApps();
    if (!apps.length) {
      console.error("❌ No hay app de Firebase. Asegúrate de estar en dmov2-ixgf.vercel.app autenticado.");
      return;
    }
    db = firebase.getFirestore(apps[0]);
    var { collection, query, where, getDocs } = firebase;
  } catch (e) {
    console.error("Fallo cargando Firestore SDK:", e);
    return;
  }

  console.log("→ Consultando facturas mesOp='MAYO' anio=2026...");
  const q = query(
    collection(db, "facturas"),
    where("mesOp", "==", "MAYO"),
    where("anio", "==", 2026)
  );
  const snap = await getDocs(q);
  const facturas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`✓ ${facturas.length} facturas encontradas`);

  // Resumen por cliente
  const porCliente = {};
  let totalImporte = 0;
  facturas.forEach(f => {
    const c = f.empresa || f.cliente || "Sin cliente";
    porCliente[c] = porCliente[c] || { count: 0, importe: 0 };
    porCliente[c].count++;
    porCliente[c].importe += Number(f.total || f.subtotal || 0);
    totalImporte += Number(f.total || f.subtotal || 0);
  });
  console.table(porCliente);
  console.log(`Total importe mayo 2026: $${totalImporte.toLocaleString("es-MX")}`);

  // Convertir Timestamp a ISO para serializar
  const safe = facturas.map(f => {
    const out = {};
    for (const [k, v] of Object.entries(f)) {
      if (v && typeof v === "object" && v.toDate) out[k] = v.toDate().toISOString();
      else out[k] = v;
    }
    return out;
  });

  // Descargar JSON
  const payload = {
    backupAt: new Date().toISOString(),
    mesOp: "MAYO",
    anio: 2026,
    totalFacturas: facturas.length,
    totalImporte,
    porCliente,
    facturas: safe,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dmov-backup-mayo-2026-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log(`%c✅ BACKUP DESCARGADO: ${a.download}`, "color:#15803D;font-weight:bold");
  console.log("Guarda este archivo. Si algo sale mal, podemos restaurar las facturas exactamente como estaban.");

  // Hacer disponible en window para inspección
  window.__DMOV_BACKUP_MAYO_2026 = payload;
  console.log("Tip: window.__DMOV_BACKUP_MAYO_2026 tiene el backup completo en memoria");
})();
