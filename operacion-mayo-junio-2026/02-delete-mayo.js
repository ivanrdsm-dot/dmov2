/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · ELIMINAR FACTURAS MAYO 2026
   ───────────────────────────────────────────────────────────────────────────
   ⚠️  ESTE SCRIPT BORRA DATOS DE FIREBASE EN PRODUCCIÓN.
   ⚠️  EJECUTA PRIMERO 01-backup-mayo.js Y CONFIRMA QUE SE DESCARGÓ EL BACKUP.

   QUÉ HACE:
   1. Lee todas las facturas con mesOp = "MAYO" y anio = 2026.
   2. Muestra resumen y pide confirmación INTERACTIVA (3 preguntas).
   3. Las borra una por una de Firestore.
   4. Imprime conteo final.

   CÓMO USAR:
   1. EJECUTA PRIMERO 01-backup-mayo.js. Confirma que se descargó el JSON.
   2. En la misma pestaña (https://dmov2-ixgf.vercel.app/, logueado admin):
   3. Abre Console (F12)
   4. Pega TODO este archivo y dale Enter
   5. Cuando pregunte, escribe exactamente: BORRAR MAYO 2026
   ═══════════════════════════════════════════════════════════════════════════ */

(async function deleteMayo2026() {
  console.log("%c🗑️  DMOV · ELIMINAR FACTURAS MAYO 2026", "font-size:16px;font-weight:bold;color:#DC2626");
  console.warn("⚠️  Operación destructiva. Asegúrate de haber descargado el backup primero.");

  // 1. Conexión
  let db, collection, query, where, getDocs, doc, deleteDoc;
  try {
    const firebase = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
    const appMod = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js");
    const apps = appMod.getApps();
    if (!apps.length) { console.error("❌ Firebase no inicializado."); return; }
    db = firebase.getFirestore(apps[0]);
    ({ collection, query, where, getDocs, doc, deleteDoc } = firebase);
  } catch (e) { console.error("Fallo SDK:", e); return; }

  // 2. Leer
  console.log("→ Buscando facturas mesOp='MAYO' anio=2026...");
  const snap = await getDocs(query(
    collection(db, "facturas"),
    where("mesOp", "==", "MAYO"),
    where("anio", "==", 2026)
  ));
  const facturas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (facturas.length === 0) {
    console.log("✓ No hay facturas en MAYO 2026. Nada que borrar.");
    return;
  }

  // 3. Resumen
  console.log(`Encontradas: ${facturas.length} facturas`);
  const resumen = {};
  let totalImporte = 0;
  facturas.forEach(f => {
    const c = f.empresa || f.cliente || "Sin cliente";
    resumen[c] = resumen[c] || { count: 0, importe: 0 };
    resumen[c].count++;
    resumen[c].importe += Number(f.total || f.subtotal || 0);
    totalImporte += Number(f.total || f.subtotal || 0);
  });
  console.table(resumen);
  console.log(`Total importe a borrar: $${totalImporte.toLocaleString("es-MX")}`);

  // 4. Confirmación triple
  const confirm1 = prompt(
    `⚠️  Vas a BORRAR ${facturas.length} facturas de MAYO 2026.\n` +
    `Total importe: $${totalImporte.toLocaleString("es-MX")}\n\n` +
    `Si descargaste el backup y estás 100% seguro, escribe:\n\n  BORRAR MAYO 2026\n`
  );
  if (confirm1 !== "BORRAR MAYO 2026") {
    console.log("✗ Cancelado. No se borró nada.");
    return;
  }

  const confirm2 = confirm(
    `Última confirmación.\n\n` +
    `Se eliminarán ${facturas.length} facturas de Firestore.\n` +
    `Esta acción NO se puede deshacer (salvo restaurando desde backup manualmente).\n\n` +
    `¿Procedo?`
  );
  if (!confirm2) {
    console.log("✗ Cancelado en confirmación final.");
    return;
  }

  // 5. Borrar
  console.log("→ Borrando...");
  let ok = 0, err = 0;
  const errores = [];
  for (const f of facturas) {
    try {
      await deleteDoc(doc(db, "facturas", f.id));
      ok++;
      if (ok % 10 === 0) console.log(`  ${ok}/${facturas.length} borradas...`);
    } catch (e) {
      err++;
      errores.push({ id: f.id, error: e.message });
    }
  }

  console.log(`%c✅ BORRADO COMPLETADO`, "color:#15803D;font-weight:bold;font-size:14px");
  console.log(`  Borradas: ${ok}`);
  if (err > 0) {
    console.error(`  Errores: ${err}`);
    console.table(errores);
  }
  console.log("\nSiguiente paso: ejecutar 03-importar-bitacora.js para cargar los 50 servicios may-jun.");
})();
