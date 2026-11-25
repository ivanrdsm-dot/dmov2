import { describe, it, expect } from "vitest";
import { revisarCarga, rendimientoHistorico, resumenUnidad, compararTicket } from "./functions/lib/gasolina.js";

describe("ticket leído por la IA vs. lo que escribió el chofer", () => {
  it("cuadra: sin dudas", () => {
    expect(compararTicket({ monto: 1200, litros: 50 }, { esTicket: true, legible: true, total: 1200.5, litros: 50.1, fecha: "2026-11-25" }, "2026-11-25")).toEqual([]);
  });
  it("monto inflado, litros distintos y ticket viejo", () => {
    const d = compararTicket({ monto: 1500, litros: 60 }, { esTicket: true, legible: true, total: 1200, litros: 50, fecha: "2026-11-02" }, "2026-11-25");
    expect(d).toHaveLength(3); expect(d[0]).toContain("$1200"); expect(d[2]).toContain("2026-11-02");
  });
  it("foto que no es ticket o ilegible", () => {
    expect(compararTicket({ monto: 100 }, { esTicket: false })).toEqual(["la foto no parece un ticket"]);
    expect(compararTicket({ monto: 100 }, { esTicket: true, legible: false })).toEqual(["el ticket no se puede leer"]);
  });
});

describe("revisión de una carga de gasolina", () => {
  it("carga normal: calcula precio y rendimiento sin dudas", () => {
    const r = revisarCarga({ monto: 1200, litros: 50, odometroKm: 85400, kmInicioJornada: 85300, cargaAnterior: { odometroKm: 85000 }, rendimientoPromedio: 8.5, hayGasolinera: true });
    expect(r.precioLitro).toBe(24); expect(r.kmDesdeAnterior).toBe(400); expect(r.rendimiento).toBe(8); expect(r.dudas).toEqual([]);
  });
  it("detecta precio raro, falta de gasolinera, tablero hacia atrás y rendimiento bajo", () => {
    const r = revisarCarga({ monto: 3000, litros: 50, odometroKm: 85100, kmInicioJornada: 85300, cargaAnterior: { odometroKm: 85000 }, rendimientoPromedio: 8.5, hayGasolinera: false });
    expect(r.dudas.join(" | ")).toMatch(/precio por litro/);
    expect(r.dudas.join(" | ")).toMatch(/gasolinera/);
    expect(r.dudas.join(" | ")).toMatch(/menos que en el check-in/);
    expect(r.dudas.join(" | ")).toMatch(/rindió 2 km\/L/);
  });
  it("sin carga anterior no inventa rendimiento", () => {
    const r = revisarCarga({ monto: 1000, litros: 40, odometroKm: 85000 });
    expect(r.rendimiento).toBe(null); expect(r.kmDesdeAnterior).toBe(null); expect(r.dudas).toEqual([]);
  });
});

describe("rendimiento de la camioneta", () => {
  it("tanque lleno a tanque lleno", () => {
    const cargas = [{ odometroKm: 1000, litros: 40 }, { odometroKm: 1400, litros: 50 }, { odometroKm: 1850, litros: 50 }];
    expect(rendimientoHistorico(cargas)).toBe(8.5);   // 850 km / 100 L
    expect(rendimientoHistorico([{ odometroKm: 1000, litros: 40 }])).toBe(null);
  });
  it("resumen con costo por km", () => {
    const u = resumenUnidad([{ odometroKm: 1000, litros: 40, monto: 960 }, { odometroKm: 1400, litros: 50, monto: 1200 }], 400);
    expect(u).toMatchObject({ cargas: 2, litros: 90, gasto: 2160, rendimiento: 8, costoPorKm: 5.4 });
  });
});
