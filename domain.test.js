/* Tests del motor de cálculo de negocio DMOV (F5).
   Si un test truena, alguien cambió POLÍTICA DE NEGOCIO — verificar con dirección. */
import { describe, it, expect } from "vitest";
import {
  KM_DIA, COMIDA, HOTEL, IVA_RATE,
  diasRuta, calcViaticos, calcFlota, calcTotales, genTrackingId, hashPin,
  PL_CLASIFICACION, etapaDeBucket, buildEstadoResultados, generarAnalisisCFO,
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
