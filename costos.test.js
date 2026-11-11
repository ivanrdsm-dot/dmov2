import { describe, it, expect } from "vitest";
import { validarCosto, totalCostos, margenServicio, CONCEPTOS_COSTO } from "./costos.ts";

describe("captura de costos", () => {
  it("concepto de la lista, monto positivo y nota cuando es Otro", () => {
    expect(validarCosto({ concepto: "Casetas", monto: "1,250.50" })).toEqual([]);
    expect(validarCosto({ concepto: "Hielo", monto: 10 })).toEqual(["Concepto"]);
    expect(validarCosto({ concepto: "Casetas", monto: 0 })).toEqual(["Monto mayor a cero"]);
    expect(validarCosto({ concepto: "Casetas", monto: 20_000_000 })).toEqual(["Monto fuera de rango"]);
    expect(validarCosto({ concepto: "Otro", monto: 100 })).toEqual(["Nota: di qué fue"]);
    expect(CONCEPTOS_COSTO).toContain("Proveedor / flete externo");
  });
  it("el total no cuenta anulados y desglosa por concepto", () => {
    const r = totalCostos([{ concepto: "Casetas", monto: 480.5 }, { concepto: "Combustible", monto: 1200 }, { concepto: "Casetas", monto: 300 }, { concepto: "Combustible", monto: 999, anulado: true }]);
    expect(r).toEqual({ total: 1980.5, n: 3, porConcepto: { Casetas: 780.5, Combustible: 1200 } });
    expect(totalCostos([])).toEqual({ total: 0, n: 0, porConcepto: {} });
  });
});

describe("margen", () => {
  it("sin precio aprobado o sin costos no se inventa margen", () => {
    expect(margenServicio({ costoTotal: 100, costosN: 1 }).estado).toBe("sin precio");
    expect(margenServicio({ precio: 3500 })).toEqual({ precio: 3500, costo: null, margen: null, margenPct: null, estado: "sin costos" });
    expect(margenServicio({ precio: 3500, costoTotal: 0, costosN: 0 }).estado).toBe("sin costos");
  });
  it("margen y porcentaje; negativo es pérdida", () => {
    expect(margenServicio({ precio: 3500, costoTotal: 2100, costosN: 3 })).toEqual({ precio: 3500, costo: 2100, margen: 1400, margenPct: 40, estado: "con margen" });
    expect(margenServicio({ precio: 3000, costoTotal: 3300.5, costosN: 2 })).toMatchObject({ margen: -300.5, margenPct: -10, estado: "pérdida" });
  });
});
