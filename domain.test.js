/* Tests del motor de cálculo de negocio DMOV (F5).
   Si un test truena, alguien cambió POLÍTICA DE NEGOCIO — verificar con dirección. */
import { describe, it, expect } from "vitest";
import {
  KM_DIA, COMIDA, HOTEL, IVA_RATE,
  diasRuta, calcViaticos, calcFlota, calcTotales, genTrackingId, hashPin,
} from "./domain.js";

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
