/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · IMPORTAR 50 SERVICIOS MAYO-JUNIO 2026 A FIRESTORE
   ───────────────────────────────────────────────────────────────────────────
   QUÉ HACE:
   1. Crea 50 facturas en la colección "facturas" de Firestore.
   2. Cada factura tiene cliente → empresa → plan ya mapeados automáticamente.
   3. Campo "subtotal" y "total" quedan en 0 (Juanita captura precio después).
   4. Cada factura lleva folio único FAC-* y status "Pendiente".

   MAPEO AUTOMÁTICO:
   - SCJ          (17) → MARKETING & PROMOTION · plan 10344 MAP SCJ
   - HENRY        (13) → Walmart Canjes (cliente nuevo, datos fiscales pendientes)
   - ACT NOW      (7)  → PROMOCIONES AMERICA LATINA · plan 210201 Campari
   - ROBOTS       (5)  → PROMOTOR ON DEMAND · plan 212802 POD Robots
   - CANNON       (5)  → G-MAP OPERADORA · plan 202003 Canon
   - HERSHEYS     (2)  → PROMOCIONES AMERICA LATINA · plan 222829 Hersheys
   - IVAN         (1)  → MAP / Sofía Trueba (provisional — confirmar)

   CÓMO USAR:
   1. EJECUTA ANTES 01-backup-mayo.js y 02-delete-mayo.js.
   2. En https://dmov2-ixgf.vercel.app/ (logueado admin):
   3. Abre Console (F12)
   4. Pega TODO este archivo y dale Enter
   5. Confirma cuando pregunte.
   ═══════════════════════════════════════════════════════════════════════════ */

(async function importarBitacora() {
  console.log("%c📥 DMOV · IMPORTAR 50 SERVICIOS MAY-JUN 2026", "font-size:16px;font-weight:bold;color:#FF6B35");

  // Conexión Firebase
  let db, collection, addDoc, serverTimestamp;
  try {
    const firebase = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
    const appMod = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js");
    const apps = appMod.getApps();
    if (!apps.length) { console.error("❌ Firebase no inicializado."); return; }
    db = firebase.getFirestore(apps[0]);
    ({ collection, addDoc, serverTimestamp } = firebase);
  } catch (e) { console.error("Fallo SDK:", e); return; }

  // Generador de folio único
  const uid = () => Math.random().toString(36).slice(2, 9).toUpperCase();

  // Helper IVA (16% por defecto)
  const IVA_RATE = 0.16;

  // Los 50 servicios embebidos (generados desde el Excel formateado)
  const SERVICIOS = [
  {
    "fecha": "2026-05-18",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "KV1034A",
    "clienteRaw": "SCJ",
    "servicio": "SE VA A GCA VALLEJO A RECOGER MATERIAL Y A 5 MINUTOS DE LLEGAR A RECOGER SE CANCELA EL SERVICIO",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-27",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "LH02836",
    "clienteRaw": "SCJ",
    "servicio": "SE CARGA PRODUCTO ,PROMOCIONALES Y EXHIBIDORES EN GCA ( SE SDAN 2 VUELTAS POR QUE NO CABE MATERIAL COMPLETO )",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-28",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "NXE007C",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGAN EXHIBIDORES EN TIENDAS 12 PUNTOS DISTINTOS EN PUEBLA (TEXMELUCAN , CHOLULA , TLAXCALA , PUEBLA)",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-28",
    "mes": "MAYO",
    "chofer": "ENRIQUE",
    "unidad": "KV1043A",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGA PRODUCTO Y PROMOCIONALES PARA  EMPLAYE EN DISTINTOS PUNTOS RUTA SURESTE (TUXTLA)",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-28",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "MZS950C",
    "clienteRaw": "SCJ",
    "servicio": "SE CARGA MATERIAL FALTANTE PARA EMPLAYES RUTA PUEBLA (ESE NOS AVISARON DESPUES QUE TENIAMOS QUE CARGARLO)",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-29",
    "mes": "MAYO",
    "chofer": "ULISES",
    "unidad": "MZS950C",
    "clienteRaw": "SCJ",
    "servicio": "SE CARGAN PRODUCTOS , PROMOCIONES PARA EMPLAYE EN GCA",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-29",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "LH23826",
    "clienteRaw": "SCJ",
    "servicio": "SE  ENTREGA PRODUCTO , PROMOCIONALES PARA EMPLAYE EN PUEBLA",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-29",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "564ET8",
    "clienteRaw": "SCJ",
    "servicio": "SE CARGAN PRODUCTOS , PROMOCIONES PARA EMPLAYE EN GCA",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-29",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "NXE007C",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGAN EXHIBIDORES EN TIENDAS 12 PUNTOS DISTINTOS EN PUEBLA (PUEBLA , AMOZOC , TEPEACA , TECAMACHALCO ,ATLIXCO ,IZUCAR)",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-29",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "LH23826",
    "clienteRaw": "SCJ",
    "servicio": "SE  ENTREGA PRODUCTO , PROMOCIONALES PARA EMPLAYE EN AMOZOC PUEBLA",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-30",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "LH23826",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGAN PRODUCTOS Y PROMOCIONALES PARA EMPLAYE EN VERACRUZ",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-30",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "LH02836",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGAN PRODUCTOS Y PROMOCIONALES PARA EMPLAYE RUTA SUROESTE VILLAHERMOSA",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-30",
    "mes": "MAYO",
    "chofer": "—",
    "unidad": "—",
    "clienteRaw": "SCJ",
    "servicio": "SE CARGA PRODUCTO SCJ EN PLANTA AZTECAS Y SE RESGUARDA ( 6 TARIMAS )",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-06-01",
    "mes": "JUNIO",
    "chofer": "ELIAS",
    "unidad": "564ET8",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGA PRODUCTO EN BA MARIANO ESCOBEDO Y SORIANA MIYANA",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-06-01",
    "mes": "JUNIO",
    "chofer": "ISRAEL",
    "unidad": "—",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGA PRODUCTO EN CHEDRAUI POLANCO",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-06-02",
    "mes": "JUNIO",
    "chofer": "ISRAEL",
    "unidad": "NXE007C",
    "clienteRaw": "SCJ",
    "servicio": "SE VA DE COMPRAS POR PRODUCTO A CHRISALIM FRAY SERVANDOY SE ENTREGA EN SORIANA MIYANA Y CHEDRAUI POLANCO",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-06-03",
    "mes": "JUNIO",
    "chofer": "ISRAEL",
    "unidad": "NXE007C",
    "clienteRaw": "SCJ",
    "servicio": "SE ENTREGA PRODUCTO EN BA MARIANO ESCOBEDO",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "10344 MAP → SCJ Promotores Operación",
    "solicitanteCliente": "SCJ"
  },
  {
    "fecha": "2026-05-05",
    "mes": "MAYO",
    "chofer": "ELIAS/ISRAEL",
    "unidad": "MZS950C",
    "clienteRaw": "HENRY",
    "servicio": "SE CARGAN PROMOCIONALES EN RIO MIXCOAC 54 Y SE ENTREGA EN MONTERREY",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-05",
    "mes": "MAYO",
    "chofer": "EDER",
    "unidad": "—",
    "clienteRaw": "HENRY",
    "servicio": "SE CARGAN PROMOCIONALES EN RIO MIXCOAC 54 Y SE ENTREGA EN GUADALAJARA",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-09",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "MZS950C",
    "clienteRaw": "HENRY",
    "servicio": "SE LLEVAN PROMOCIONALES A PROMOTORA EN WALMART TOREO",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-09",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "MZS950C",
    "clienteRaw": "HENRY",
    "servicio": "SE RECOGEN PROMOCIONALES A PROMOTORA EN WALMART TOREO",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-11",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "MZS950C",
    "clienteRaw": "HENRY",
    "servicio": "SE LLEVAN PROMOCIONALES A PROMOTORA EN WALMART TOREO",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-25",
    "mes": "MAYO",
    "chofer": "EDER",
    "unidad": "NXE007C",
    "clienteRaw": "HENRY",
    "servicio": "SE RECOGEN CANJES PROMOCIONALES EN GUADALAJARA Y SE RESGUARDAN EN CDMX",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-25",
    "mes": "MAYO",
    "chofer": "ELIAS/ISRAEL",
    "unidad": "MZS950C",
    "clienteRaw": "HENRY",
    "servicio": "SE RECOGEN CANJES PROMOCIONALES EN MONTERREY Y SE RESGUARDAN EN CDMX",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-27",
    "mes": "MAYO",
    "chofer": "ULISES",
    "unidad": "MZS950C",
    "clienteRaw": "HENRY",
    "servicio": "ENTREGA DE CANJES PROMOCIONALES EN DISTINTAS TIENDAS SC PLAZA ARAGON , BA PLAZA ARAGON , SC PUERTA TEXCOCO , BA PUERTA TEXCOCO",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-27",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "NXE007C",
    "clienteRaw": "HENRY",
    "servicio": "ENTREGA DE CANJES PROMOCIONALES EN DISTINTAS TIENDAS SC TOREO , BA 1 MAYO , SC TEPEYAC , SC EDUARDO MOLINA",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-27",
    "mes": "MAYO",
    "chofer": "ENRIQUE",
    "unidad": "KV1034A",
    "clienteRaw": "HENRY",
    "servicio": "ENTREGA DE CANJES PROMOCIONALES EN DISTINTAS TIENDAS SC HORIZONTE , SC VICENTE GUERRERO , SC IXTAPALUCA",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-27",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "KV1043A",
    "clienteRaw": "HENRY",
    "servicio": "ENTREGA DE CANJES PROMOCIONALES EN DISTINTAS TIENDAS SBA LA AURORA , SC PLAZA ORIENTE , BA IZTAPALAPA NORTE , BA LOS ANGELES IZTAPALAPA",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-27",
    "mes": "MAYO",
    "chofer": "JONATAN",
    "unidad": "—",
    "clienteRaw": "HENRY",
    "servicio": "ENTREGA DE CANJES PROMOCIONALES EN DISTINTAS TIENDAS SC CD JARDIN , SC TLAHUAC , SC UNIVERSIDAD BA INSURGENTES SUR",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-28",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "MZS950C",
    "clienteRaw": "HENRY",
    "servicio": "SE ENTREGAN CANJES PROMOCIONALES EN TIENDAS FALTANTES POR QUE NO HUBO PROMOTOR PARA RECIBIR .",
    "monto": 0,
    "empresa": "POR DEFINIR",
    "plan": "Walmart Canjes Promotores",
    "solicitanteCliente": "Henry / Walmart"
  },
  {
    "fecha": "2026-05-04",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "MZS950C",
    "clienteRaw": "ACT NOW",
    "servicio": "SE ENTREGA MATERIAL EN GOMEZ FARIAS",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "210201 PL → Campari Promotores",
    "solicitanteCliente": "Actnow"
  },
  {
    "fecha": "2026-05-04",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "NXE007C",
    "clienteRaw": "ACT NOW",
    "servicio": "SE ENTREGA MATERIAL EN CAFETAL 360",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "210201 PL → Campari Promotores",
    "solicitanteCliente": "Actnow"
  },
  {
    "fecha": "2026-05-06",
    "mes": "MAYO",
    "chofer": "ELIAS/ISRAEL/ENRIQUE",
    "unidad": "—",
    "clienteRaw": "ACT NOW",
    "servicio": "SE RECOGE MATERIAL EN POLANCO EN UN CAMION Y SE ENTREGA EN ALPES 635 , LOMAS DE CHAPULTEPEC",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "210201 PL → Campari Promotores",
    "solicitanteCliente": "Actnow"
  },
  {
    "fecha": "2026-05-06",
    "mes": "MAYO",
    "chofer": "ELIAS/ENRIQUE",
    "unidad": "—",
    "clienteRaw": "ACT NOW",
    "servicio": "SE RECOGE MATERIAL EN ALPES 635 , LOMAS DE CHAPULTEPEC Y SE RESGUARDA",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "210201 PL → Campari Promotores",
    "solicitanteCliente": "Actnow"
  },
  {
    "fecha": "2026-06-03",
    "mes": "JUNIO",
    "chofer": "ELIAS",
    "unidad": "—",
    "clienteRaw": "ACT NOW",
    "servicio": "SE CARGAN CARRITOS PROMOCIONALES EN HYPY AJUSCO Y SE ENTREGAN EN SORIANA MIYANA , CITY FRESCO CARSO Y LA NAVAL POLANCO .",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "210201 PL → Campari Promotores",
    "solicitanteCliente": "Actnow"
  },
  {
    "fecha": "2026-06-07",
    "mes": "JUNIO",
    "chofer": "ELIAS/ISRAEL",
    "unidad": "—",
    "clienteRaw": "ACT NOW",
    "servicio": "SE ENTREGA PRODUCTO EN RESGUARDO EN POLANCO EN EL CAMION",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "210201 PL → Campari Promotores",
    "solicitanteCliente": "Actnow"
  },
  {
    "fecha": "2026-06-08",
    "mes": "JUNIO",
    "chofer": "ISRAEL",
    "unidad": "LH23826",
    "clienteRaw": "ACT NOW",
    "servicio": "SE RECOGEN LOS CARRITOS EN LA NAVAL POLANCO , SORIANA MIYANA Y CITU FRESCO CARSO Y SE ENTREGAN EN RETO STANDS (AXOXCOTLE 26 , SAN ANDRES TOTOLTEPEC , TLALPAN)",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "210201 PL → Campari Promotores",
    "solicitanteCliente": "Actnow"
  },
  {
    "fecha": "2026-05-07",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "NVF829A",
    "clienteRaw": "ROBOTS",
    "servicio": "SE LLEVAN ROBOTS A ORTELIUS Y SE QUEDAN A RESGUARDO",
    "monto": 0,
    "empresa": "PROMOTOR ON DEMAND SA DE CV",
    "plan": "212802 POD Robots",
    "solicitanteCliente": "Robots / POD"
  },
  {
    "fecha": "2026-05-09",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "NXE007C",
    "clienteRaw": "ROBOTS",
    "servicio": "SE ENTREGAN 2 ROBOTS EN CENTRO COMERCIAL INTERLOMAS Y SE QUEDAN A RESGUARDO",
    "monto": 0,
    "empresa": "PROMOTOR ON DEMAND SA DE CV",
    "plan": "212802 POD Robots",
    "solicitanteCliente": "Robots / POD"
  },
  {
    "fecha": "2026-05-10",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "NXE007C",
    "clienteRaw": "ROBOTS",
    "servicio": "SE RECOGEN 2 ROBOTS EN CENTRO COMERCIAL INTERLOMAS Y NO LOS ENTREGAN POR QUE NO HABIA PERMISO DE SALIDA",
    "monto": 0,
    "empresa": "PROMOTOR ON DEMAND SA DE CV",
    "plan": "212802 POD Robots",
    "solicitanteCliente": "Robots / POD"
  },
  {
    "fecha": "2026-05-11",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "NXE007C",
    "clienteRaw": "ROBOTS",
    "servicio": "SE RECOGEN 2 ROBOTS EN CENTRO COMERCIAL INTERLOMAS Y NO LOS ENTREGAN POR QUE NO HABIA PERMISO DE SALIDA",
    "monto": 0,
    "empresa": "PROMOTOR ON DEMAND SA DE CV",
    "plan": "212802 POD Robots",
    "solicitanteCliente": "Robots / POD"
  },
  {
    "fecha": "2026-05-13",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "NXE007C",
    "clienteRaw": "ROBOTS",
    "servicio": "SE RECOGEN 2 ROBOTS EN CENTRO COMERCIAL INTERLOMAS",
    "monto": 0,
    "empresa": "PROMOTOR ON DEMAND SA DE CV",
    "plan": "212802 POD Robots",
    "solicitanteCliente": "Robots / POD"
  },
  {
    "fecha": "2026-05-04",
    "mes": "MAYO",
    "chofer": "ELIAS",
    "unidad": "MZS950C",
    "clienteRaw": "CANNON",
    "servicio": "SE CARGA MATERIAL CANNON EN ORTELIUS Y SE HACE RUTA VARIO PUNTOS",
    "monto": 0,
    "empresa": "G-MAP OPERADORA SA DE CV",
    "plan": "202003 GMAP → Canon Promotores",
    "solicitanteCliente": "Canon"
  },
  {
    "fecha": "2026-05-04",
    "mes": "MAYO",
    "chofer": "ISRAEL",
    "unidad": "NXE007C",
    "clienteRaw": "CANNON",
    "servicio": "SE CARGA MATERIAL CANNON EN ORTELIUS Y SE HACE RUTA VARIO PUNTOS",
    "monto": 0,
    "empresa": "G-MAP OPERADORA SA DE CV",
    "plan": "202003 GMAP → Canon Promotores",
    "solicitanteCliente": "Canon"
  },
  {
    "fecha": "2026-05-05",
    "mes": "MAYO",
    "chofer": "ELIAS/ISRAEL",
    "unidad": "MZS950C",
    "clienteRaw": "CANNON",
    "servicio": "SE TERMINA  RUTA CANNON VARIO PUNTOS",
    "monto": 0,
    "empresa": "G-MAP OPERADORA SA DE CV",
    "plan": "202003 GMAP → Canon Promotores",
    "solicitanteCliente": "Canon"
  },
  {
    "fecha": "2026-06-04",
    "mes": "JUNIO",
    "chofer": "ISRAEL",
    "unidad": "NXE007C",
    "clienteRaw": "CANNON",
    "servicio": "SE CARGA EN ORTELIUS MATERIAL Y SE NETREGA EN CASA DE LOS PROMOTORES EN DISTINTOS PUNTOS ( TECAMAC , ATIZAPAN ,CHALCO )",
    "monto": 0,
    "empresa": "G-MAP OPERADORA SA DE CV",
    "plan": "202003 GMAP → Canon Promotores",
    "solicitanteCliente": "Canon"
  },
  {
    "fecha": "2026-06-04",
    "mes": "JUNIO",
    "chofer": "ENRIQUE",
    "unidad": "NKV1043A",
    "clienteRaw": "CANNON",
    "servicio": "SE CARGA EN ORTELIUS MATERIAL Y SE NETREGA EN CASA DE LOS PROMOTORES EN DISTINTOS PUNTOS ( SANTA MARTHA ,COYOACAN ,  )",
    "monto": 0,
    "empresa": "G-MAP OPERADORA SA DE CV",
    "plan": "202003 GMAP → Canon Promotores",
    "solicitanteCliente": "Canon"
  },
  {
    "fecha": "2026-06-08",
    "mes": "JUNIO",
    "chofer": "ELIAS",
    "unidad": "—",
    "clienteRaw": "HERSHEYS",
    "servicio": "SE CARGA MATERIAL EN ORTELIUS Y SE ENTREGA EN GCA",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "222829 → Hersheys Implementaciones",
    "solicitanteCliente": "Hersheys"
  },
  {
    "fecha": "2026-06-08",
    "mes": "JUNIO",
    "chofer": "ENRIQUE",
    "unidad": "—",
    "clienteRaw": "HERSHEYS",
    "servicio": "SE CARGA MATERIAL EN ORTELIUS Y SE ENTREGA EN GCA",
    "monto": 0,
    "empresa": "PROMOCIONES AMERICA LATINA SAPI DE CV",
    "plan": "222829 → Hersheys Implementaciones",
    "solicitanteCliente": "Hersheys"
  },
  {
    "fecha": "2026-06-05",
    "mes": "JUNIO",
    "chofer": "ELIAS",
    "unidad": "MZS950C",
    "clienteRaw": "IVAN",
    "servicio": "SE RECOGE MAQUINA DE PELUCHES EN BOSQUE REAL Y SE ENTREGA EN ZONA ESMERALDA",
    "monto": 0,
    "empresa": "MARKETING & PROMOTION SAPI DE CV",
    "plan": "12801 MAP → Varios 2011",
    "solicitanteCliente": "MAP / Sofía Trueba"
  }
];

  console.log(`Total a importar: ${SERVICIOS.length} servicios`);

  // Resumen por cliente
  const porCliente = {};
  SERVICIOS.forEach(s => {
    porCliente[s.solicitanteCliente] = (porCliente[s.solicitanteCliente] || 0) + 1;
  });
  console.table(porCliente);

  // Confirmación
  const ok = confirm(
    `Vas a CREAR ${SERVICIOS.length} facturas en Firestore.\n\n` +
    `Cada una con cliente, empresa y plan ya mapeados.\n` +
    `Subtotal e IVA en $0 (Juanita captura precio después).\n\n` +
    `¿Procedo?`
  );
  if (!ok) { console.log("✗ Cancelado."); return; }

  // Crear
  console.log("→ Creando facturas...");
  let created = 0, errs = 0;
  const errores = [];
  const creadas = [];

  for (const s of SERVICIOS) {
    try {
      const subtotal = 0;
      const ivaAmt = 0;
      const total = 0;
      const folio = "FAC-" + uid();
      const fechaFin = new Date(s.fecha);
      const venc = new Date(fechaFin.getTime() + 30 * 86400000).toISOString().slice(0, 10);

      const docData = {
        folio,
        mesOp: s.mes,
        anio: 2026,
        empresa: s.empresa,
        cliente: s.solicitanteCliente,
        plan: s.plan,
        solicitante: s.solicitanteCliente,
        servicio: `${s.fecha} - ${s.servicio}`,
        subtotal, ivaAmt, total,
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
          monto: 0
        }],
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "facturas"), docData);
      created++;
      creadas.push({ id: ref.id, folio, cliente: s.solicitanteCliente, fecha: s.fecha });
      if (created % 10 === 0) console.log(`  ${created}/${SERVICIOS.length} creadas...`);
    } catch (e) {
      errs++;
      errores.push({ servicio: s.servicio, error: e.message });
    }
  }

  console.log(`%c✅ IMPORTACIÓN COMPLETADA`, "color:#15803D;font-weight:bold;font-size:14px");
  console.log(`  Creadas: ${created}`);
  if (errs > 0) {
    console.error(`  Errores: ${errs}`);
    console.table(errores);
  }

  // Hacer disponible en window
  window.__DMOV_FACTURAS_CREADAS = creadas;
  console.log("Tip: window.__DMOV_FACTURAS_CREADAS tiene las IDs creadas");
  console.log("\nSIGUIENTE PASO:");
  console.log("→ Refresca el módulo de Facturación en la app.");
  console.log("→ Juanita captura el precio de cada factura desde la UI.");
})();
