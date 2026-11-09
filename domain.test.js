/* Tests del motor de cálculo de negocio DMOV (F5).
   Si un test truena, alguien cambió POLÍTICA DE NEGOCIO — verificar con dirección. */
import { describe, it, expect } from "vitest";
import {
  KM_DIA, COMIDA, HOTEL, IVA_RATE,
  diasRuta, calcViaticos, calcFlota, calcTotales, genTrackingId, hashPin,
  PL_CLASIFICACION, etapaDeBucket, buildEstadoResultados, generarAnalisisCFO,
  grupoDeBucket,
  PLANES, planPorNumero, normalizarPlan, planDeFactura, planearNormalizacionPlanes,
  etapaFactura, facturasLigadas, buscarCotizaciones, mismaEmpresa,
  rangoPeriodo, etiquetaPeriodo, columnasPeriodo, filasPorPeriodo, ingresosPorColumna,
  pctGuardado, kpisCierre, resumenEstimados,
  periodoDeCierre, empresaCanonica, periodoDeFactura, conciliarIngresos, conciliarCxC,
  coincideAlias, clienteIdCorrecto, fechaLocalISO,
  catalogoPlanes, setCatalogoPlanes, planDesdeDoc, fusionarCatalogoPlanes,
} from "./domain";

describe("diasRuta", () => {
  it("sin km no hay ruta", () => {
    expect(diasRuta(0)).toEqual({ ida: 0, noches: 0, total: 0 });
  });
  it("ruta corta local (<300km): sin hotel, ida y vuelta en el día", () => {
    expect(diasRuta(100)).toEqual({ ida: 1, noches: 0, total: 2 });
  });
  it("ruta >300km genera noches de hotel", () => {
    expect(diasRuta(301)).toEqual({ ida: 1, noches: 1, total: 2 });
  });
  it("Monterrey (933km): 2 días de ida, 2 noches, 4 días totales", () => {
    expect(diasRuta(933)).toEqual({ ida: 2, noches: 2, total: 4 });
  });
  it("frontera exacta de KM_DIA no agrega día extra", () => {
    expect(diasRuta(KM_DIA).ida).toBe(1);
    expect(diasRuta(KM_DIA + 1).ida).toBe(2);
  });
});

describe("calcViaticos", () => {
  it("MTY 933km, 2 personas, 1 unidad: comidas 700×2×4, hotel 1100×2×1", () => {
    const v = calcViaticos(933, 2);
    expect(v.dias).toBe(4);
    expect(v.noches).toBe(2);
    expect(v.xC).toBe(COMIDA * 2 * 4);   // 5,600
    expect(v.xH).toBe(HOTEL * 2 * 1);    // 2,200
    expect(v.total).toBe(v.xC + v.xH);
  });
  it("2 unidades duplican habitaciones de hotel, no comidas", () => {
    const una = calcViaticos(933, 2, COMIDA, HOTEL, 1);
    const dos = calcViaticos(933, 2, COMIDA, HOTEL, 2);
    expect(dos.xH).toBe(una.xH * 2);
    expect(dos.xC).toBe(una.xC);
  });
  it("override manual de días/noches manda sobre el cálculo automático", () => {
    const v = calcViaticos(933, 1, COMIDA, HOTEL, 1, 10, 9);
    expect(v.dias).toBe(10);
    expect(v.noches).toBe(9);
  });
  it("ruta local: cero hotel", () => {
    expect(calcViaticos(150, 3).xH).toBe(0);
  });
});

describe("calcFlota", () => {
  it("100 PDVs, 10 por día, 2 días de plazo → 5 vans", () => {
    expect(calcFlota(100, 10, 2)).toEqual({ vans: 5, dias: 2, capDia: 50 });
  });
  it("siempre al menos 1 van", () => {
    expect(calcFlota(1, 100, 30).vans).toBe(1);
  });
  it("PDVs no divisibles redondean vans hacia arriba", () => {
    expect(calcFlota(101, 10, 2).vans).toBe(6);
  });
});

describe("calcTotales (IVA)", () => {
  it("IVA 16% estándar", () => {
    expect(calcTotales(1000)).toEqual({ subtotal: 1000, ivaAmt: 160, total: 1160 });
  });
  it("sin IVA cuando conIva=false", () => {
    expect(calcTotales(1000, false)).toEqual({ subtotal: 1000, ivaAmt: 0, total: 1000 });
  });
  it("redondeo a centavos sin drift de flotantes", () => {
    const t = calcTotales(33.33);
    expect(t.ivaAmt).toBe(5.33);
    expect(t.total).toBe(38.66);
  });
  it("IVA_RATE es la política vigente (16%)", () => {
    expect(IVA_RATE).toBe(0.16);
  });
});

describe("genTrackingId", () => {
  it("10 caracteres alfanuméricos en mayúsculas", () => {
    const id = genTrackingId();
    expect(id).toMatch(/^[A-Z0-9]{10}$/);
  });
  it("no se repite en 1000 generaciones", () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(genTrackingId());
    expect(seen.size).toBe(1000);
  });
});

describe("buildEstadoResultados (motor CFO)", () => {
  const escenario = {
    ingresos: [{ subtotal: 100000 }, { subtotal: 50000 }],  // $150,000 ventas
    costos: [
      { bucket: "Subcontrato",   monto: 40000 },  // directo (operadores)
      { bucket: "Transporte",    monto: 20000 },  // directo
      { bucket: "Viáticos",      monto: 10000 },  // directo
      { bucket: "Nómina",        monto: 25000 },  // operativo
      { bucket: "Administración",monto: 5000 },   // operativo
      { bucket: "Fiscal",        monto: 3000 },   // impuestos
      { bucket: "Bancario",      monto: 500 },    // financieros
    ],
  };
  const er = buildEstadoResultados(escenario);

  it("ventas = suma de subtotales sin IVA", () => {
    expect(er.ventas).toBe(150000);
  });
  it("costos directos = Subcontrato+Transporte+Viáticos+Operación", () => {
    expect(er.costosDirectos.total).toBe(70000);
    expect(er.costosDirectos.detalle["Subcontrato"]).toBe(40000);
  });
  it("utilidad bruta = ventas − costos directos", () => {
    expect(er.utilidadBruta.total).toBe(80000);
    expect(er.utilidadBruta.pct).toBeCloseTo(53.33, 1);
  });
  it("EBITDA = bruta − gastos operativos (sin D&A registrada)", () => {
    expect(er.gastosOperativos.total).toBe(30000);
    expect(er.ebitda.total).toBe(50000);
    expect(er.utilidadOperativa.total).toBe(er.ebitda.total);
  });
  it("utilidad neta descuenta impuestos y financieros", () => {
    expect(er.utilidadNeta.total).toBe(50000 - 3000 - 500);
    expect(er.utilidadNeta.pct).toBeCloseTo(31.0, 1);
  });
  it("todos los buckets de CATS_COSTO tienen etapa asignada", () => {
    const todos = [...PL_CLASIFICACION.directos, ...PL_CLASIFICACION.operativos,
                   ...PL_CLASIFICACION.impuestos, ...PL_CLASIFICACION.financieros];
    ["Nómina","Subcontrato","Transporte","Viáticos","Operación","Administración","Comunicación","Fiscal","Bancario","Otro"]
      .forEach(b => expect(todos).toContain(b));
  });
  it("bucket desconocido cae en operativos (no se pierde dinero)", () => {
    expect(etapaDeBucket("CategoriaInventada")).toBe("operativos");
    const conRaro = buildEstadoResultados({ ingresos: [{subtotal:1000}], costos: [{bucket:"Rarísimo",monto:100}] });
    expect(conRaro.gastosOperativos.total).toBe(100);
  });
  it("sin ventas: porcentajes null, sin división entre cero", () => {
    const vacio = buildEstadoResultados({ ingresos: [], costos: [{bucket:"Transporte",monto:500}] });
    expect(vacio.ventas).toBe(0);
    expect(vacio.utilidadBruta.pct).toBeNull();
    expect(vacio.utilidadNeta.total).toBe(-500);
  });
});

describe("Estado de Resultados — nómina operativa como costo directo y subgrupos", () => {
  const er = buildEstadoResultados({
    ingresos: [{ subtotal: 200000 }],
    costos: [
      { bucket: "Sueldos",         monto: 60000 },  // directo (nómina operativa)
      { bucket: "Cargas Sociales", monto: 20000 },  // directo
      { bucket: "Subcontrato",     monto: 30000 },  // directo (RESICO)
      { bucket: "Transporte",      monto: 15000 },  // directo
      { bucket: "Operación",       monto: 10000 },  // directo
      { bucket: "Administración",  monto: 5000  },  // operativo (estructura)
      { bucket: "Fiscal",          monto: 2000  },  // impuestos
    ],
  });
  it("Sueldos y Cargas Sociales cuentan como costo DIRECTO", () => {
    expect(etapaDeBucket("Sueldos")).toBe("directos");
    expect(etapaDeBucket("Cargas Sociales")).toBe("directos");
    expect(er.costosDirectos.total).toBe(135000); // 60+20+30+15+10
  });
  it("utilidad bruta descuenta la nómina operativa", () => {
    expect(er.utilidadBruta.total).toBe(65000); // 200k − 135k
  });
  it("estructura administrativa queda en gastos operativos", () => {
    expect(er.gastosOperativos.total).toBe(5000);
    expect(er.ebitda.total).toBe(60000);
  });
  it("subgrupos agrupan Sueldos + Cargas en 'Personal operativo'", () => {
    const pers = er.costosDirectos.subgrupos["Personal operativo"];
    expect(pers.total).toBe(80000);
    expect(pers.detalle["Sueldos"]).toBe(60000);
    expect(pers.detalle["Cargas Sociales"]).toBe(20000);
  });
  it("cada bucket cae en su subgrupo legible", () => {
    expect(grupoDeBucket("Subcontrato")).toBe("Subcontratación (RESICO / operadores)");
    expect(grupoDeBucket("Transporte")).toBe("Transporte y viáticos");
    expect(grupoDeBucket("Operación")).toBe("Operación y maniobras");
  });
});

describe("generarAnalisisCFO", () => {
  const er = buildEstadoResultados({
    ingresos: [{ subtotal: 100000 }],
    costos: [{ bucket: "Transporte", monto: 90000 }], // margen bruto 10% — débil
  });
  const analisis = generarAnalisisCFO({
    er, erPrev: buildEstadoResultados({ ingresos: [{subtotal:150000}], costos: [] }),
    periodoLabel: "Jul 2026",
    topClientes: [{ nombre: "SCJ", total: 60000, pctIngresos: 60 }],
    carteraVencida: 200000, ventasMesProm: 100000,
    sinCaptura: 12,
    topProveedores: [{ proveedor: "Gasolinera X", total: 50000, n: 14 }],
    topOperadores: [],
    mesesConDatos: 2,
  });
  const tipos = analisis.map(a => a.tipo);

  it("detecta margen bruto débil (<15%) como riesgo", () => {
    expect(tipos).toContain("riesgo");
    expect(analisis.some(a => (a.texto||"").includes("POR DEBAJO"))).toBe(true);
  });
  it("detecta caída fuerte de facturación", () => {
    expect(analisis.some(a => (a.texto||"").includes("cayó 33.3%"))).toBe(true);
  });
  it("alerta concentración de cliente ≥35%", () => {
    expect(analisis.some(a => (a.texto||"").includes("Concentración"))).toBe(true);
  });
  it("cartera vencida >1 mes de ventas es riesgo de caja", () => {
    expect(analisis.some(a => (a.texto||"").includes("2.0 meses"))).toBe(true);
  });
  it("señala servicios sin captura como subestimación del ingreso", () => {
    expect(analisis.some(a => (a.texto||"").includes("12 servicios"))).toBe(true);
  });
  it("cierra con recomendaciones accionables", () => {
    const recs = analisis.find(a => a.tipo === "recomendaciones");
    expect(recs.lista.length).toBeGreaterThanOrEqual(3);
  });
});

describe("hashPin", () => {
  it("es determinista para el mismo pin+salt", async () => {
    expect(await hashPin("123456", "uidA")).toBe(await hashPin("123456", "uidA"));
  });
  it("el salt hace que el mismo PIN dé hashes distintos por usuario", async () => {
    expect(await hashPin("123456", "uidA")).not.toBe(await hashPin("123456", "uidB"));
  });
  it("compatible con esquema legacy (sin salt)", async () => {
    const legacy = await hashPin("123456");
    expect(legacy).toMatch(/^[a-f0-9]{64}$/);
  });
  it("recorta espacios del pin", async () => {
    expect(await hashPin(" 123456 ", "u")).toBe(await hashPin("123456", "u"));
  });
});

/* ── Facturación: catálogo de planes, normalización, etapas y ligas ───────── */
describe("PLANES (catálogo cerrado)", () => {
  it("números únicos y datos fiscales completos", () => {
    const nums = PLANES.map(p => p.numero);
    expect(new Set(nums).size).toBe(nums.length);
    for (const p of PLANES) {
      expect(p.empresa).toBeTruthy();
      expect(p.rfc).toMatch(/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/);
      expect(p.clienteId).toBeTruthy();
    }
  });
  it("empresa y director de intranet por plan", () => {
    expect(planPorNumero("10344").empresa).toBe("MARKETING & PROMOTION SAPI DE CV");
    expect(planPorNumero("10344").directorIntranet).toEqual({ nombre: "PEREZ MENDEZ ADAN", id: "135832" });
    expect(planPorNumero("122721").directorIntranet.id).toBe("135832");
    expect(planPorNumero("210212").directorIntranet.nombre).toBe("MAGAÑA NAVARRETE RICARDO");
    expect(planPorNumero("22845").directorIntranet.id).toBe("149636");
    expect(planPorNumero("222829").directorIntranet.id).toBe("73357");
    expect(planPorNumero("202003").directorIntranet.id).toBe("135851");
    expect(planPorNumero("204113").empresa).toBe("G-MAP OPERADORA SA DE CV");
    expect(planPorNumero("204113").directorIntranet.id).toBe("20240513");
  });
  it("Loreal: intercompañía con director y director general", () => {
    const p = planPorNumero("619715");
    expect(p.empresa).toBe("COMPRAS CENTRALES Y ADMINISTRACION SA DE CV");
    expect(p.directorIntranet.id).toBe("122633");
    expect(p.directorGeneralIntranet).toEqual({ nombre: "SALDAÑO CAROLINA", id: "135876" });
  });
  it("TACRE 142804 no va por intranet", () => {
    const p = planPorNumero("142804");
    expect(p.vaPorIntranet).toBe(false);
    expect(p.directorIntranet).toBeNull();
    expect(PLANES.filter(x => !x.vaPorIntranet).map(x => x.numero)).toEqual(["142804"]);
  });
  it("planPorNumero tolera número, espacios y desconocidos", () => {
    expect(planPorNumero(10344).numero).toBe("10344");
    expect(planPorNumero(" 202003 ").numero).toBe("202003");
    expect(planPorNumero("999999")).toBeNull();
    expect(planPorNumero("")).toBeNull();
    expect(planPorNumero(undefined)).toBeNull();
  });
});

describe("normalizarPlan — variantes reales del campo plan en facturas", () => {
  // [texto tal como está en Firestore (respaldos jul-2026 + cierre sep/oct), plan esperado]
  const casos = [
    ["10344 MAP → SCJ Promotores Operación",   "10344"],
    ["P-10344 MAP SCJ Promotores Operación",   "10344"],
    ["10344 SCJ PROMOTORES",                   "10344"],
    ["142804 SCJ Promotores",                  "10344"],   // prefijo = plan propio DMOV
    ["210212 PL → Actnow Campari Summit",      "210212"],
    ["P-210212 ACTNOW CAMPARI SUMMIT",         "210212"],
    ["210212 Campari Summit Actnow",           "210212"],
    ["CAMPARI SUMMIT ACTNOW 210212",           "210212"],
    ["210212 CAMPARI ",                        "210212"],
    ["210201 PL → Campari Promotores",         "210201"],
    ["P-210201 Campari Promotores",            "210201"],
    ["202003 GMAP → Canon Promotores",         "202003"],
    ["P-202003 GMAP Canon Promotores",         "202003"],
    ["202003 GMAP CANON PROMOTORES",           "202003"],
    ["P-202003 GMAP Operaciones",              "202003"],
    ["222829 → Hersheys Implementaciones",     "222829"],
    ["P-222829 Hersheys Implementaciones",     "222829"],
    ["142804 → Servicios de Logística",        "142804"],
    ["P-142804 SERVICIOS DE LOGISTICA",        "142804"],
    ["PLAN 142804 SERVICIOS DE LOGISTICA",     "142804"],
    ["142804 Mucha Chamba",                    "142804"],
    ["P-142804 MUCHA CHAMBA",                  "142804"],
    ["12801 MAP → Varios 2011",                "12801"],
    ["P-12801 MAP Varios 2011",                "12801"],
    ["212802 POD Robots",                      "212802"],
    ["212802 PROMOTOR ON DEMAND",              "212802"],
    ["212802",                                 "212802"],
    ["142804 POD Robots",                      "212802"],
    ["203801 ACTIVVACIONES WYDER",             "203801"],  // typo real
    ["203801 ACTIVACIONES WYDER ",             "203801"],
    ["210402 MUSTELLA PROMOTORES",             "210402"],
    ["122721 3M CBG Pinturas",                 "122721"],
    ["22845 Actnow Varios 2014",               "22845"],
    ["204113 Electrolit WM E RDE",             "204113"],
    ["619715 Loreal Logística",                "619715"],
    ["P-204113 GMAP ELECTROLIT",                "204113"],
    ["619716 Loreal",                           "619716"],
    ["142805 Rentas Logística",                 "142805"],
  ];
  it.each(casos)("%j → %s", (texto, esperado) => {
    expect(normalizarPlan(texto)).toBe(esperado);
  });

  it("sin número: decide por nombre solo si apunta a un plan", () => {
    expect(normalizarPlan("SCJ Promotores")).toBe("10344");
    expect(normalizarPlan("Campari Summit Actnow")).toBe("210212");
    expect(normalizarPlan("L'Oréal logística")).toBe("619715");
    expect(normalizarPlan("hersheys")).toBe("222829");
    expect(normalizarPlan("Entrega LP Agency Puebla")).toBe("204113");   // Ceci (LP Agency) factura con el plan Electrolit
    expect(normalizarPlan("Loreal")).toBe("619715");                      // el plan 2 solo por número
    expect(normalizarPlan("Campari")).toBeNull();          // ¿Promotores o Summit?
    expect(normalizarPlan("Actnow")).toBeNull();           // 3 planes Actnow
    expect(normalizarPlan("SCJ y Canon")).toBeNull();      // dos planes
  });
  it("no adivina: razón social, RFC o texto genérico no son un plan", () => {
    for (const t of ["G-MAP OPERADORA", "MARKETING & PROMOTION", "PROMOCIONES AMERICA LATINA",
      "PAL030731427", "MPR930115NN0", "Standard", "Walmart Canjes Promotores", "", null, undefined]) {
      expect(normalizarPlan(t)).toBeNull();
    }
  });
  it("142804 + cliente no identificable queda sin resolver (revisión manual)", () => {
    expect(normalizarPlan("142804 ACT NOW")).toBeNull();
    expect(normalizarPlan("142804 Adm. Marketing")).toBeNull();
    expect(normalizarPlan("142804")).toBe("142804");
    expect(normalizarPlan("P-142804")).toBe("142804");
  });
  it("todo resultado existe en el catálogo", () => {
    for (const [texto] of casos) expect(planPorNumero(normalizarPlan(texto))).not.toBeNull();
  });
});

describe("mismaEmpresa", () => {
  it("tolera AND/&, guiones, mayúsculas y sufijo societario", () => {
    expect(mismaEmpresa("MARKETING AND PROMOTION ", "MARKETING & PROMOTION SAPI DE CV")).toBe(true);
    expect(mismaEmpresa("GMAP", "G-MAP OPERADORA SA DE CV")).toBe(true);
    expect(mismaEmpresa("Promociones America Latina", "PROMOCIONES AMERICA LATINA SAPI DE CV")).toBe(true);
    expect(mismaEmpresa("G-MAP OPERADORA SA DE CV", "MARKETING & PROMOTION SAPI DE CV")).toBe(false);
    expect(mismaEmpresa("", "TACRE SA DE CV")).toBe(false);
    expect(mismaEmpresa(undefined, undefined)).toBe(false);
  });
});

describe("planDeFactura / planearNormalizacionPlanes", () => {
  it("el texto manda sobre un planNumero heredado", () => {
    expect(planDeFactura({ plan: "142804 SCJ Promotores", planNumero: "142804" })).toBe("10344");
  });
  it("texto ilegible: respeta un planNumero guardado solo si es de la misma empresa", () => {
    expect(planDeFactura({ plan: "G-MAP OPERADORA", planNumero: "202003", empresa: "G-MAP OPERADORA SA DE CV" })).toBe("202003");
    expect(planDeFactura({ plan: "MPR930115NN0", planNumero: "12801", empresa: "MARKETING AND PROMOTION" })).toBe("12801");
    // backfill histórico equivocado: plan de MAP en factura de G-MAP, plan de TACRE en factura de MAP
    expect(planDeFactura({ plan: "Standard", planNumero: "12801", empresa: "G-MAP OPERADORA SA DE CV" })).toBeNull();
    expect(planDeFactura({ plan: "142804 Adm. Marketing", planNumero: "142804", empresa: "MARKETING & PROMOTION SAPI DE CV" })).toBeNull();
    expect(planDeFactura({ plan: "G-MAP OPERADORA", planNumero: "202003" })).toBeNull(); // sin empresa no se puede validar
    expect(planDeFactura({ plan: "Standard", planNumero: "777", empresa: "X SA DE CV" })).toBeNull();
    expect(planDeFactura({ plan: "", planOverride: "P-142804 MUCHA CHAMBA" })).toBe("142804");
    expect(planDeFactura(null)).toBeNull();
  });
  it("separa cambios, ya normalizadas y sin resolver — sin tocar el texto", () => {
    const facts = [
      { id: "a", folio: "FAC-1", plan: "P-10344 MAP SCJ Promotores Operación" },                 // cambio "" → 10344
      { id: "b", folio: "FAC-2", plan: "142804 SCJ Promotores", planNumero: "142804" },          // cambio 142804 → 10344
      { id: "c", folio: "FAC-3", plan: "202003 GMAP → Canon Promotores", planNumero: "202003" }, // ya ok
      { id: "d", folio: "FAC-4", plan: "Standard", planNumero: "12801", empresa: "G-MAP" },      // sin resolver
      { id: "e", folio: "FAC-5" },                                                               // sin plan
    ];
    const r = planearNormalizacionPlanes(facts);
    expect(r.cambios.map(c => [c.id, c.de, c.a])).toEqual([["a", "", "10344"], ["b", "142804", "10344"]]);
    expect(r.yaNormalizadas).toBe(1);
    expect(r.sinResolver.map(c => c.id)).toEqual(["d", "e"]);
    expect(r.cambios[1].plan).toBe("142804 SCJ Promotores");
    expect(facts[1].plan).toBe("142804 SCJ Promotores"); // entrada intacta
  });
});

describe("etapaFactura (semáforo)", () => {
  it("Solicitada: status Solicitada a Katia (o solicitud interna) sin CFDI", () => {
    expect(etapaFactura({ status: "Solicitada a Katia" }).etapa).toBe("Solicitada");
    expect(etapaFactura({ status: "Solicitud interna" }).etapa).toBe("Solicitada");
    expect(etapaFactura({ status: "Pendiente", tipoDocumento: "solicitud_interna" }).etapa).toBe("Solicitada");
  });
  it("Emitida: tiene cfdiFolio y no intranetFolio", () => {
    expect(etapaFactura({ status: "Pendiente", cfdiFolio: "A2064" }).etapa).toBe("Emitida");
    expect(etapaFactura({ status: "Solicitada a Katia", cfdiFolio: "A2064" }).etapa).toBe("Emitida");
    expect(etapaFactura({ status: "Pendiente" }).etapa).toBe("Emitida"); // legacy sin folio CFDI capturado
  });
  it("En intranet: tiene intranetFolio, con subestado por intranetEstatus", () => {
    const base = { status: "Pendiente", cfdiFolio: "A2064", intranetFolio: "131405" };
    expect(etapaFactura(base)).toEqual({ etapa: "En intranet", subestado: "", detalle: "" });
    expect(etapaFactura({ ...base, intranetEstatus: "Pendiente autorización Director" }).subestado).toBe("Director");
    expect(etapaFactura({ ...base, intranetEstatus: "EN TESORERÍA" }).subestado).toBe("Tesorería");
    expect(etapaFactura({ ...base, intranetEstatus: "Autorizó director · pasa a tesoreria" }).subestado).toBe("Tesorería");
    expect(etapaFactura({ ...base, intranetEstatus: "Capturada" })).toEqual({ etapa: "En intranet", subestado: "", detalle: "Capturada" });
  });
  it("Pagada / Cancelada / Vencida salen del status aunque haya folio de intranet", () => {
    const f = { cfdiFolio: "A2064", intranetFolio: "131405", intranetEstatus: "DIRECTOR" };
    expect(etapaFactura({ ...f, status: "Pagada" }).etapa).toBe("Pagada");
    expect(etapaFactura({ ...f, status: "Cancelada" }).etapa).toBe("Cancelada");
    expect(etapaFactura({ ...f, status: "Vencida" }).etapa).toBe("Vencida");
    expect(etapaFactura({ ...f, status: "Pagada" }).subestado).toBe("");
  });
  it("tolera factura vacía", () => {
    expect(etapaFactura({}).etapa).toBe("Emitida");
    expect(etapaFactura(null).etapa).toBe("Emitida");
    expect(etapaFactura({ status: "Pendiente", intranetFolio: "  " }).etapa).toBe("Emitida");
  });
});

describe("liga factura ↔ cotización / presupuesto", () => {
  const facts = [
    { id: "f1", cotizacionFolio: "COT-2026-0902" },
    { id: "f2", cotizacionId: "p1", cotizacionFolio: "PRE-5TY5HD" },
    { id: "f3", presupuestoOrigenId: "p2", presupuestoOrigenFolio: "PRE-4IEFM7" }, // liga histórica
    { id: "f4", cotizacionFolio: " cot-2026-0902 " },
    { id: "f5" },
  ];
  it("liga por folio (sin importar mayúsculas/espacios) y por id", () => {
    expect(facturasLigadas({ id: "c1", folio: "COT-2026-0902" }, facts).map(f => f.id)).toEqual(["f1", "f4"]);
    expect(facturasLigadas({ id: "p1", folio: "PRE-OTRO" }, facts).map(f => f.id)).toEqual(["f2"]);
  });
  it("respeta la liga histórica presupuesto → factura", () => {
    expect(facturasLigadas({ id: "p2", folio: "PRE-4IEFM7" }, facts).map(f => f.id)).toEqual(["f3"]);
    expect(facturasLigadas({ id: "p9", folio: "PRE-X", convertidoAFacturaId: "f5" }, facts).map(f => f.id)).toEqual(["f5"]);
  });
  it("folio vacío no liga todo", () => {
    expect(facturasLigadas({ id: "zz", folio: "" }, facts)).toEqual([]);
    expect(facturasLigadas(null, facts)).toEqual([]);
  });
  it("buscarCotizaciones: por folio o cliente, en ambas colecciones", () => {
    const cots = [{ id: "c1", folio: "COT-F46W9J", cliente: "Canon México", total: 11368, createdAt: { seconds: 1773337845 } }];
    const pres = [{ id: "p1", folio: "PRE-4IEFM7", cliente: "Luis Martínez", total: 6844, fecha: "2026-04-30" }];
    expect(buscarCotizaciones("f46", cots, pres).map(r => [r.tipo, r.id])).toEqual([["cotizacion", "c1"]]);
    expect(buscarCotizaciones("martinez", cots, pres)[0]).toMatchObject({ tipo: "presupuesto", folio: "PRE-4IEFM7", total: 6844, fecha: "2026-04-30" });
    expect(buscarCotizaciones("e", cots, pres).map(r => r.id)).toEqual(["p1", "c1"]); // más reciente primero
    expect(buscarCotizaciones("", cots, pres)).toEqual([]);
    expect(buscarCotizaciones("zzz", cots, pres)).toEqual([]);
  });
});

/* ── Cierre contable (solo lectura sobre cierresContables) ─────────────────
   Cifras de prueba INVENTADAS con la forma del doc real; no son contabilidad. */
describe("cierre contable — periodos", () => {
  it("rangoPeriodo entiende claves del doc", () => {
    expect(rangoPeriodo("ene_jun")).toEqual([0, 5]);
    expect(rangoPeriodo("Jul-Ago")).toEqual([6, 7]);
    expect(rangoPeriodo("jul_ago")).toEqual([6, 7]);
    expect(rangoPeriodo("Sep")).toEqual([8, 8]);
    expect(rangoPeriodo("ytd")).toBeNull();
    expect(rangoPeriodo("")).toBeNull();
    expect(rangoPeriodo("septiembre")).toEqual([8, 8]);
    expect(rangoPeriodo("marketing")).toBeNull();   // empieza como "mar" pero no es un mes
    expect(rangoPeriodo("seguros")).toBeNull();
  });
  it("etiquetaPeriodo", () => {
    expect(etiquetaPeriodo("ene_jun")).toBe("Ene–Jun");
    expect(etiquetaPeriodo("jul_ago")).toBe("Jul–Ago");
    expect(etiquetaPeriodo("sep")).toBe("Sep");
    expect(etiquetaPeriodo("ytd")).toBe("Acumulado");
    expect(etiquetaPeriodo("otro")).toBe("otro");
  });
  it("columnasPeriodo: orden de calendario, acumulado al final, sin duplicar", () => {
    expect(columnasPeriodo({ a: { ytd: 1, sep: 1, ene_jun: 1 }, b: { jul_ago: 1, sep: 2 } })).toEqual(["ene_jun", "jul_ago", "sep", "ytd"]);
    expect(columnasPeriodo({ a: { oct: 1, ytd: 2, ene_sep: 3 } })).toEqual(["ene_sep", "oct", "ytd"]);
    expect(columnasPeriodo(null)).toEqual([]);
  });
});

describe("cierre contable — tablas", () => {
  const costos = {
    "Nómina":      { ene_jun: 600, jul_ago: 200, sep: 100, ytd: 900 },
    "Subcontrato": { ene_jun: 300, jul_ago: 100, sep: 50,  ytd: 450 },
    "Fiscal":      { ene_jun: 10,  sep: 5, ytd: 15 },               // sin jul_ago
  };
  it("filasPorPeriodo: ordena por acumulado, % sobre ingresos y totales por columna", () => {
    const t = filasPorPeriodo(costos, 1500);
    expect(t.columnas).toEqual(["ene_jun", "jul_ago", "sep", "ytd"]);
    expect(t.filas.map(f => f.nombre)).toEqual(["Nómina", "Subcontrato", "Fiscal"]);
    expect(t.filas[0].pctIngresos).toBe(60);
    expect(t.filas[2].valores.jul_ago).toBeNull();   // dato ausente no se vuelve 0
    expect(t.totales).toEqual({ ene_jun: 910, jul_ago: 300, sep: 155, ytd: 1365 });
  });
  it("filasPorPeriodo tolera doc vacío y sin base", () => {
    expect(filasPorPeriodo(undefined)).toEqual({ columnas: [], filas: [], totales: {} });
    expect(filasPorPeriodo(costos).filas[0].pctIngresos).toBeNull();
  });
  it("ingresosPorColumna: meses sueltos → columnas de la tabla", () => {
    const ing = { Ene: 100, Feb: 100, Mar: 100, Abr: 100, May: 100, Jun: 100, "Jul-Ago": 500, Sep: 400 };
    expect(ingresosPorColumna(ing, ["ene_jun", "jul_ago", "sep", "ytd"], 1500)).toEqual({ ene_jun: 600, jul_ago: 500, sep: 400, ytd: 1500 });
  });
  it("ingresosPorColumna: columna sin cobertura completa queda null, no parcial", () => {
    const ing = { Ene: 100, Feb: 100, "Jul-Ago": 500 };              // faltan Mar–Jun y Sep
    expect(ingresosPorColumna(ing, ["ene_jun", "jul_ago", "sep", "ytd"])).toEqual({ ene_jun: null, jul_ago: 500, sep: null, ytd: 700 });
    expect(ingresosPorColumna(null, ["sep", "ytd"])).toEqual({ sep: null, ytd: null });
  });
});

describe("cierre contable — KPIs", () => {
  const doc = {
    resultados: { ingresos: 1000, costosYGastos: 1200, utilidadNeta: -230, costosVariables: 700,
      puntoEquilibrioMensual: 150, ingresoPromedioMensual: 111, costoPromedioMensual: 133, margenContribucionPct: 0.99 },
    nomina: { percepciones: 400, cargaSocial: 100, costoLaboral: 500, costoLaboralPctIngresos: 0.99, cargaPctPercepciones: 99 },
    balance: { creski: -350, bancos: 20 },
    activoTotal: 800, pasivoTotal: 600, capitalContable: 200,
  };
  it("lee importes y calcula % desde los importes (ignora el % guardado)", () => {
    const k = kpisCierre(doc);
    expect(k.ingresos).toBe(1000);
    expect(k.utilidadNeta).toBe(-230);
    expect(k.costoLaboralPct).toBe(50);
    expect(k.cargaSocialPct).toBe(25);
    expect(k.margenContribucionPct).toBeCloseTo(30);
    expect(k.brechaEquilibrio).toBe(-39);       // promedio por debajo del equilibrio
    expect(k.deudaCreski).toBe(350);            // siempre en positivo
    expect(k.capitalContable).toBe(200);
  });
  it("sin importes usa el % guardado, en fracción o en porcentaje", () => {
    const k = kpisCierre({ nomina: { costoLaboralPctIngresos: 0.62, cargaPctPercepciones: 31.5 } });
    expect(k.costoLaboralPct).toBeCloseTo(62);
    expect(k.cargaSocialPct).toBe(31.5);
    expect(pctGuardado("0.4")).toBeCloseTo(40);
    expect(pctGuardado(null)).toBeNull();
  });
  it("doc vacío: todo null, nada inventado", () => {
    const k = kpisCierre({});
    expect(Object.values(k).every(v => v === null)).toBe(true);
    expect(kpisCierre(null).ingresos).toBeNull();
  });
});

describe("resumenEstimados (viáticos con estimado:true)", () => {
  const viat = [
    { mes: "Jul", monto: 100, estimado: true },
    { mes: "Ago", monto: 100, estimado: true },
    { mes: "Ago", monto: 50,  estimado: true },
    { mes: "Sep", monto: 999, estimado: false, cierreSep2026: true },
    { mes: "Jul", monto: 10 },
    { mes: "Jun", monto: 5, estimado: "true" },   // solo cuenta el booleano
  ];
  it("cuenta y suma solo los estimados, por mes en orden de calendario", () => {
    const r = resumenEstimados(viat);
    expect(r.n).toBe(3);
    expect(r.monto).toBe(250);
    expect(r.meses).toEqual(["Jul", "Ago"]);
    expect(r.porMes.Ago).toEqual({ n: 2, monto: 150 });
  });
  it("sin estimados", () => {
    expect(resumenEstimados([{ mes: "Sep", monto: 1 }])).toEqual({ n: 0, monto: 0, meses: [], porMes: {} });
    expect(resumenEstimados(null).n).toBe(0);
  });
});

/* ── Conciliación cierre contable vs sistema ───────────────────────────────
   Cifras INVENTADAS; solo prueban la mecánica de la comparación. */
describe("conciliación — piezas", () => {
  it("periodoDeCierre: id YYYY-MM → año, mes y último día", () => {
    expect(periodoDeCierre("2026-09")).toEqual({ anio: 2026, mes: 8, corte: "2026-09-30" });
    expect(periodoDeCierre("2026-02").corte).toBe("2026-02-28");
    expect(periodoDeCierre("2028-02").corte).toBe("2028-02-29");
    expect(periodoDeCierre("2026-13")).toBeNull();
    expect(periodoDeCierre("sep-2026")).toBeNull();
    expect(periodoDeCierre(undefined)).toBeNull();
  });
  it("empresaCanonica: razón social, variantes y nombres comerciales", () => {
    const MAP = "MARKETING & PROMOTION SAPI DE CV", GMAP = "G-MAP OPERADORA SA DE CV", PAL = "PROMOCIONES AMERICA LATINA SAPI DE CV";
    expect(empresaCanonica("MARKETING AND PROMOTION")).toBe(MAP);
    expect(empresaCanonica("Marketing & Promotion")).toBe(MAP);
    expect(empresaCanonica("SCJ")).toBe(MAP);
    expect(empresaCanonica("MAP")).toBe(MAP);
    expect(empresaCanonica("G-MAP OPERADORA")).toBe(GMAP);   // no debe caer en "MAP"
    expect(empresaCanonica("GMAP")).toBe(GMAP);
    expect(empresaCanonica("Canon")).toBe(GMAP);
    expect(empresaCanonica("Actnow / Campari")).toBe(PAL);
    expect(empresaCanonica("PROMOLATINA")).toBe(PAL);
    expect(empresaCanonica("JBL")).toBe("TACRE SA DE CV");
    expect(empresaCanonica("Tacre")).toBe("TACRE SA DE CV");
    expect(empresaCanonica("  Luis   Martínez ")).toBe("LUIS MARTÍNEZ"); // desconocido: se compara por nombre
    expect(empresaCanonica("")).toBe("");
  });
  it("periodoDeFactura: mes de operación o fecha de emisión", () => {
    const f = { mesOp: "Ago", anio: 2026, fechaEmision: "2026-09-03" };
    expect(periodoDeFactura(f)).toEqual({ anio: 2026, mes: 7, porEmision: false });
    expect(periodoDeFactura(f, "emision")).toEqual({ anio: 2026, mes: 8, porEmision: true });
    expect(periodoDeFactura({ mesOp: "Ago", anio: "2026" }, "emision")).toEqual({ anio: 2026, mes: 7, porEmision: false });
    expect(periodoDeFactura({ mesOp: "", anio: 2026 })).toBeNull();
  });
});

describe("conciliarIngresos", () => {
  const cierre = {
    id: "2026-09",
    resultados: { ingresos: 1000, ingresosPorPeriodo: { Ene: 100, Feb: 100, Mar: 100, Abr: 100, May: 100, Jun: 100, "Jul-Ago": 250, Sep: 150 } },
    clientes: {
      "MARKETING & PROMOTION": { ene_jun: 400, jul_ago: 150, sep: 50, ytd: 600 },
      "G-MAP OPERADORA":       { ene_jun: 200, jul_ago: 100, sep: 0,  ytd: 300 },
      "CLIENTE FANTASMA":      { ene_jun: 0,   jul_ago: 0,   sep: 100, ytd: 100 },
    },
  };
  const F = (id, empresa, mesOp, subtotal, extra = {}) => ({ id, folio: "F-" + id, empresa, mesOp, anio: 2026, subtotal, total: subtotal * 1.16, status: "Pendiente", ...extra });
  const facts = [
    F("1", "MARKETING & PROMOTION SAPI DE CV", "Mar", 400),
    F("2", "MARKETING AND PROMOTION", "Jul", 150),
    F("3", "MARKETING & PROMOTION SAPI DE CV", "Sep", 50),
    F("4", "G-MAP OPERADORA SA DE CV", "Feb", 200),
    F("5", "G-MAP OPERADORA SA DE CV", "Ago", 80),                       // faltan 20 vs contabilidad
    F("6", "TACRE SA DE CV", "Sep", 70),                                 // no está en la balanza
    F("7", "MARKETING & PROMOTION SAPI DE CV", "Sep", 999, { status: "Cancelada" }),
    F("8", "MARKETING & PROMOTION SAPI DE CV", "Sep", 999, { status: "Solicitada a Katia" }),
    F("8b", "MARKETING & PROMOTION SAPI DE CV", "Sep", 999, { status: "Solicitud interna" }),
    F("8c", "MARKETING & PROMOTION SAPI DE CV", "Sep", 999, { tipoDocumento: "solicitud_interna" }),
    F("9", "MARKETING & PROMOTION SAPI DE CV", "Oct", 500),              // después del cierre
    F("10", "MARKETING & PROMOTION SAPI DE CV", "Sep", 500, { anio: 2025 }),
    F("11", "MARKETING & PROMOTION SAPI DE CV", "", 500),                // sin mes: no se puede ubicar
  ];
  const c = conciliarIngresos(cierre, facts);
  const fila = e => c.filas.find(f => f.empresa === e);

  it("total: solo facturas vigentes del año hasta el mes del cierre", () => {
    expect(c.total).toEqual({ contable: 1000, sistema: 950, diferencia: -50, estado: "diferencia", n: 6 });
    expect(c.sinPeriodo).toBe(1);
  });
  it("cliente que cuadra, juntando variantes de la razón social", () => {
    const m = fila("MARKETING & PROMOTION SAPI DE CV");
    expect(m).toMatchObject({ contable: 600, sistema: 600, diferencia: 0, estado: "ok" });
    expect(m.facturas.map(f => f.id)).toEqual(["1", "2", "3"]);
    expect(m.porColumna).toEqual([
      { columna: "ene_jun", contable: 400, sistema: 400, diferencia: 0 },
      { columna: "jul_ago", contable: 150, sistema: 150, diferencia: 0 },
      { columna: "sep",     contable: 50,  sistema: 50,  diferencia: 0 },
    ]);
  });
  it("cliente con diferencia: sistema − contabilidad, ubicada en su periodo", () => {
    const gm = fila("G-MAP OPERADORA SA DE CV");
    expect(gm).toMatchObject({ contable: 300, sistema: 280, diferencia: -20, estado: "diferencia" });
    expect(gm.porColumna.find(x => x.columna === "jul_ago").diferencia).toBe(-20);
  });
  it("solo en contabilidad / solo en sistema", () => {
    expect(fila("CLIENTE FANTASMA")).toMatchObject({ contable: 100, sistema: 0, estado: "solo_contable" });
    expect(fila("TACRE SA DE CV")).toMatchObject({ contable: null, sistema: 70, diferencia: 70, estado: "solo_sistema" });
  });
  it("ordena por tamaño de la diferencia", () => {
    expect(c.filas.map(f => Math.abs(f.diferencia))).toEqual([100, 70, 20, 0]);
  });
  it("por periodo, en orden de calendario", () => {
    expect(c.porPeriodo.map(p => [p.periodo, p.contable, p.sistema, p.diferencia, p.estado])).toEqual([
      ["Ene", 100, 0, -100, "solo_contable"], ["Feb", 100, 200, 100, "diferencia"], ["Mar", 100, 400, 300, "diferencia"],
      ["Abr", 100, 0, -100, "solo_contable"], ["May", 100, 0, -100, "solo_contable"], ["Jun", 100, 0, -100, "solo_contable"],
      ["Jul-Ago", 250, 230, -20, "diferencia"], ["Sep", 150, 120, -30, "diferencia"],
    ]);
  });
  it("base emisión: mueve la factura al mes del CFDI y avisa de las que no tienen fecha", () => {
    const fs = [F("a", "TACRE SA DE CV", "Ago", 100, { fechaEmision: "2026-09-02" }), F("b", "TACRE SA DE CV", "Ago", 40)];
    const op = conciliarIngresos(cierre, fs), em = conciliarIngresos(cierre, fs, { base: "emision" });
    expect(op.porPeriodo.find(p => p.periodo === "Jul-Ago").sistema).toBe(140);
    expect(em.porPeriodo.find(p => p.periodo === "Jul-Ago").sistema).toBe(40);
    expect(em.porPeriodo.find(p => p.periodo === "Sep").sistema).toBe(100);
    expect(em.sinFechaEmision).toBe(1);
    expect(op.sinFechaEmision).toBe(0);
  });
  it("tolerancia: diferencias de centavos cuadran", () => {
    const r = conciliarIngresos({ id: "2026-09", resultados: { ingresos: 100.4 } }, [F("x", "TACRE SA DE CV", "Sep", 100)]);
    expect(r.total.estado).toBe("ok");
    expect(conciliarIngresos({ id: "2026-09", resultados: { ingresos: 102 } }, [F("x", "TACRE SA DE CV", "Sep", 100)]).total.estado).toBe("diferencia");
  });
  it("cierre vacío o id inválido no truena", () => {
    expect(conciliarIngresos(null, facts)).toMatchObject({ periodo: null, filas: [], porPeriodo: [] });
    expect(conciliarIngresos({ id: "2026-09" }, null).total).toMatchObject({ contable: null, sistema: 0, estado: "solo_sistema" });
  });
});

describe("conciliarCxC (saldo al corte)", () => {
  const cierre = { id: "2026-09", cuentasPorCobrar: { "MARKETING & PROMOTION": 1160, "G-MAP OPERADORA": 500, "CLIENTE FANTASMA": 300 } };
  const F = (id, empresa, mesOp, total, extra = {}) => ({ id, folio: "F-" + id, empresa, mesOp, anio: 2026, total, status: "Pendiente", ...extra });
  const facts = [
    F("1", "MARKETING & PROMOTION SAPI DE CV", "Ago", 1160),                                      // abierta
    F("2", "MARKETING & PROMOTION SAPI DE CV", "Jul", 580, { status: "Pagada", fechaPago: "2026-08-15" }), // cobrada antes
    F("3", "G-MAP OPERADORA SA DE CV", "Sep", 1000),                                              // abono parcial antes del corte
    F("4", "G-MAP OPERADORA SA DE CV", "Sep", 200, { status: "Pagada", fechaPago: "2026-10-10" }), // cobrada DESPUÉS: era CxC
    F("5", "TACRE SA DE CV", "Jun", 700, { status: "Pagada" }),                                   // pagada sin fecha
    F("6", "TACRE SA DE CV", "Oct", 900),                                                         // posterior al corte
    F("7", "TACRE SA DE CV", "Sep", 400, { fechaEmision: "2026-10-02" }),                         // emitida después del corte
    F("8", "TACRE SA DE CV", "Dic", 350, { anio: 2025, status: "Vencida" }),                      // de año anterior, sigue abierta
    F("9", "TACRE SA DE CV", "Sep", 999, { status: "Cancelada" }),
  ];
  const pagos = [
    { facturaId: "3", monto: 600, fecha: "2026-09-20" },
    { facturaId: "3", monto: 400, fecha: "2026-10-05" },   // después del corte: no cuenta
    { facturaId: "x", monto: 50,  fecha: "2026-09-01" },
  ];
  const c = conciliarCxC(cierre, facts, pagos);
  const fila = e => c.filas.find(f => f.empresa === e);

  it("corte = último día del mes del cierre", () => { expect(c.corte).toBe("2026-09-30"); });
  it("cliente que cuadra: las cobradas antes del corte no cuentan", () => {
    expect(fila("MARKETING & PROMOTION SAPI DE CV")).toMatchObject({ contable: 1160, sistema: 1160, diferencia: 0, estado: "ok" });
  });
  it("abonos posteriores al corte no reducen el saldo; pagada después del corte sí era CxC", () => {
    const gm = fila("G-MAP OPERADORA SA DE CV");
    expect(gm.facturas.map(f => [f.id, f._saldoCorte])).toEqual([["3", 400], ["4", 200]]);
    expect(gm).toMatchObject({ contable: 500, sistema: 600, diferencia: 100, estado: "diferencia" });
  });
  it("solo sistema: incluye años anteriores, excluye lo emitido u operado después del corte", () => {
    const t = fila("TACRE SA DE CV");
    expect(t.facturas.map(f => f.id)).toEqual(["8"]);
    expect(t).toMatchObject({ contable: null, sistema: 350, estado: "solo_sistema" });
  });
  it("solo contabilidad", () => {
    expect(fila("CLIENTE FANTASMA")).toMatchObject({ contable: 300, sistema: 0, estado: "solo_contable" });
  });
  it("avisa de las 'Pagada' sin fecha de pago (no se sabe si fue antes del corte)", () => {
    expect(c.pagadasSinFecha).toEqual({ n: 1, monto: 700 });
  });
  it("totales", () => {
    expect(c.total).toEqual({ contable: 1960, sistema: 2110, diferencia: 150, estado: "diferencia", n: 4 });
  });
  it("sin datos no truena", () => {
    expect(conciliarCxC(null, facts, pagos)).toMatchObject({ corte: null, filas: [] });
    expect(conciliarCxC({ id: "2026-09" }, [], []).total).toMatchObject({ contable: null, sistema: 0 });
  });
});

/* ── Búsqueda de cliente por alias: palabras completas ─────────────────────
   Regresión: antes era por subcadena y sumaba ventas al cliente equivocado. */
describe("coincideAlias", () => {
  it("no confunde subcadenas", () => {
    expect(coincideAlias("G-MAP OPERADORA SA DE CV", "MAP")).toBe(false);
    expect(coincideAlias("GMAP", "MAP")).toBe(false);
    expect(coincideAlias("Mapfre Seguros", "MAP")).toBe(false);
    expect(coincideAlias("Abbott", "BOT")).toBe(false);
    expect(coincideAlias("SC", "SCJ")).toBe(false);
    expect(coincideAlias("c", "ACTNOW")).toBe(false);
    expect(coincideAlias("Roberto", "ROBOT")).toBe(false);
  });
  it("reconoce el alias como palabra o frase completa, sin acentos ni signos", () => {
    expect(coincideAlias("G-MAP OPERADORA SA DE CV", "G-MAP")).toBe(true);
    expect(coincideAlias("GMAP", "GMAP")).toBe(true);
    expect(coincideAlias("scj promotores", "SCJ")).toBe(true);
    expect(coincideAlias("MAP / Sofía Trueba", "SOFIA TRUEBA")).toBe(true);
    expect(coincideAlias("MARKETING & PROMOTION SAPI DE CV", "MARKETING & PROMOTION")).toBe(true);
    expect(coincideAlias("Hershey's México", "HERSHEY")).toBe(true);
    expect(coincideAlias("S.C.J.", "S.C.J.")).toBe(true);
    expect(coincideAlias("MAP", "MAP")).toBe(true);
  });
  it("prefijo solo en captura interactiva y con 3+ letras", () => {
    expect(coincideAlias("can", "CANON")).toBe(false);
    expect(coincideAlias("can", "CANON", { prefijo: true })).toBe(true);
    expect(coincideAlias("ca", "CANON", { prefijo: true })).toBe(false);
    expect(coincideAlias("non", "CANON", { prefijo: true })).toBe(false);   // no es prefijo
  });
  it("vacíos", () => {
    expect(coincideAlias("", "MAP")).toBe(false);
    expect(coincideAlias("MAP", "")).toBe(false);
    expect(coincideAlias(null, undefined)).toBe(false);
  });
});

describe("clienteIdCorrecto / normalización de clienteId", () => {
  const MAP = "MARKETING & PROMOTION SAPI DE CV", GMAP = "G-MAP OPERADORA SA DE CV";
  it("plan legible de la misma empresa → cliente del plan", () => {
    expect(clienteIdCorrecto({ empresa: MAP, clienteId: "tacre" }, "10344")).toBe("scj");   // backfill "142804 SCJ…"
    expect(clienteIdCorrecto({ empresa: MAP, clienteId: "" }, "122721")).toBe("3m");
    expect(clienteIdCorrecto({ empresa: GMAP, clienteId: "canon" }, "203801")).toBe("wyder");
  });
  it("sin plan: quita un clienteId de otra razón social, respeta uno coherente", () => {
    expect(clienteIdCorrecto({ empresa: GMAP, clienteId: "map_varios" }, null)).toBe("");  // "Standard" de G-MAP
    expect(clienteIdCorrecto({ empresa: GMAP, clienteId: "canon" }, null)).toBe("canon");
    expect(clienteIdCorrecto({ empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV", clienteId: "actnow" }, null)).toBe("actnow");
  });
  it("plan de otra empresa que la factura: no impone su cliente", () => {
    // "142804 Mucha Chamba" facturada a Compras Centrales: tacre no es su cliente
    expect(clienteIdCorrecto({ empresa: "COMPRAS CENTRALES Y ADMINISTRACION SA DE CV", clienteId: "tacre" }, "142804")).toBe("");
    expect(clienteIdCorrecto({ empresa: "COMPRAS CENTRALES Y ADMINISTRACION SA DE CV", clienteId: "cca" }, "142804")).toBe("cca");
  });
  it("no toca clientes fuera de catálogo ni facturas sin empresa", () => {
    expect(clienteIdCorrecto({ empresa: "POR DEFINIR", clienteId: "henry_walmart" }, null)).toBe("henry_walmart");
    expect(clienteIdCorrecto({ clienteId: "tacre" }, "10344")).toBe("tacre");
    expect(clienteIdCorrecto({ empresa: "Luis Martinez" }, null)).toBe("");
  });
  it("planearNormalizacionPlanes propone plan y cliente, por separado", () => {
    const r = planearNormalizacionPlanes([
      { id: "a", plan: "142804 SCJ Promotores", planNumero: "142804", clienteId: "tacre", empresa: MAP },          // ambos
      { id: "b", plan: "10344 MAP → SCJ Promotores Operación", planNumero: "10344", clienteId: "", empresa: MAP }, // solo cliente
      { id: "c", plan: "Standard", planNumero: "12801", clienteId: "map_varios", empresa: GMAP },                  // sin plan, cliente ajeno
      { id: "d", plan: "202003 GMAP → Canon Promotores", planNumero: "202003", clienteId: "canon", empresa: GMAP },// ya ok
      { id: "e", plan: "Standard", empresa: GMAP },                                                                // sin resolver, nada que corregir
    ]);
    expect(r.cambios.map(c => [c.id, c.cambiaPlan, c.a, c.cambiaCliente, c.clienteDe, c.clienteA])).toEqual([
      ["a", true, "10344", true, "tacre", "scj"],
      ["b", false, "10344", true, "", "scj"],
      ["c", false, "", true, "map_varios", ""],
    ]);
    expect(r.yaNormalizadas).toBe(1);
    expect(r.sinResolver.map(c => c.id)).toEqual(["c", "e"]);
  });
});

describe("fechaLocalISO", () => {
  it("usa el día local aunque en UTC ya sea el siguiente", () => {
    // 20:30 hora local del 4-nov: en UTC-6 ya es 5-nov, pero el día de captura es el 4
    expect(fechaLocalISO(new Date(2026, 10, 4, 20, 30))).toBe("2026-11-04");
    expect(fechaLocalISO(new Date(2026, 10, 4, 0, 5))).toBe("2026-11-04");
    expect(fechaLocalISO(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
  it("sin argumento devuelve hoy en formato AAAA-MM-DD", () => {
    const d = new Date(), esperado = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    expect(fechaLocalISO()).toBe(esperado);
  });
});

/* ── Catálogo de planes editable desde la app (colección `planes`) ───────── */
describe("catálogo de planes dinámico", () => {
  const GMAP = "G-MAP OPERADORA SA DE CV";
  it("planDesdeDoc normaliza un doc de Firestore", () => {
    const p = planDesdeDoc({ id: "777001", nombre: "Plan de prueba", empresa: " g-map operadora sa de cv ", rfc: " gop170407fv7 ",
      clienteId: "prueba", directorIntranet: { nombre: "APELLIDO NOMBRE", id: "1" }, alias: "Prueba, OTRO ALIAS", vaPorIntranet: true });
    expect(p).toMatchObject({ numero: "777001", empresa: GMAP, rfc: "GOP170407FV7", clienteId: "prueba", alias: ["PRUEBA", "OTRO ALIAS"], activo: true, porConfirmar: false });
    expect(p.directorIntranet).toEqual({ nombre: "APELLIDO NOMBRE", id: "1" });
    expect(p.directorGeneralIntranet).toBeUndefined();
    expect(planDesdeDoc({ nombre: "sin número" })).toBeNull();
    expect(planDesdeDoc(null)).toBeNull();
    expect(planDesdeDoc({ numero: "1", directorIntranet: { nombre: "", id: "" } }).directorIntranet).toBeNull();
  });
  it("fusionar: un doc corrige la semilla sin borrar lo que no trae", () => {
    const lista = fusionarCatalogoPlanes(PLANES, [{ id: "210201", directorIntranet: { nombre: "DIRECTOR CONFIRMADO", id: "99" }, porConfirmar: false }]);
    const p = lista.find(x => x.numero === "210201");
    expect(p.directorIntranet).toEqual({ nombre: "DIRECTOR CONFIRMADO", id: "99" });
    expect(p.porConfirmar).toBe(false);
    expect(p.empresa).toBe("PROMOCIONES AMERICA LATINA SAPI DE CV");   // conservado de la semilla
    expect(p.alias).toContain("CAMPARI PROMOTORES");
    expect(p.origen).toBe("editado");
    expect(lista.find(x => x.numero === "10344").origen).toBe("base");
  });
  it("fusionar: agrega planes nuevos y da de baja con activo:false", () => {
    const lista = fusionarCatalogoPlanes(PLANES, [
      { id: "777001", nombre: "Nuevo", empresa: GMAP, rfc: "GOP170407FV7", clienteId: "nuevo", alias: ["NUEVO"] },
      { id: "210402", activo: false },
    ]);
    expect(lista.find(x => x.numero === "777001")).toMatchObject({ origen: "nuevo", vaPorIntranet: true });
    expect(lista.find(x => x.numero === "210402")).toBeUndefined();
    expect(lista.length).toBe(PLANES.length);   // +1 nuevo, −1 baja
  });
  it("las funciones del catálogo leen el catálogo activo", () => {
    try {
      setCatalogoPlanes(fusionarCatalogoPlanes(PLANES, [{ id: "777001", nombre: "Nuevo Plan GMAP", empresa: GMAP, rfc: "GOP170407FV7", clienteId: "nuevo", alias: ["NUEVOPLAN"] }]));
      expect(planPorNumero("777001").nombre).toBe("Nuevo Plan GMAP");
      expect(normalizarPlan("777001 lo que sea")).toBe("777001");
      expect(normalizarPlan("Servicio NUEVOPLAN octubre")).toBe("777001");
      expect(planDeFactura({ plan: "777001", empresa: GMAP })).toBe("777001");
      expect(clienteIdCorrecto({ empresa: GMAP, clienteId: "" }, "777001")).toBe("nuevo");
      expect(catalogoPlanes().length).toBe(PLANES.length + 1);
    } finally {
      setCatalogoPlanes(null);
    }
    expect(planPorNumero("777001")).toBeNull();        // de vuelta a la semilla
    expect(catalogoPlanes()).toBe(PLANES);
  });
});
