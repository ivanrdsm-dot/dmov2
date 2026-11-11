import { describe, it, expect } from "vitest";
import { ordenarParadas, kmRecorrido } from "./functions/lib/rutas.js";

/* Puntos en línea sobre el mismo paralelo: a 0.01° de longitud ≈ 1 km. */
const P = (nombre, lng, tipo = "entrega") => ({ nombre, tipo, lat: 19.4, lng });
describe("orden de la ruta", () => {
  it("las cargas van primero y las entregas por cercanía, sin cruces", () => {
    const capturado = [P("CEDIS", -99.00, "carga"), P("Lejos", -99.10), P("Cerca", -99.02), P("Medio", -99.05)];
    const r = ordenarParadas(capturado);
    expect(r.paradas.map(p => p.nombre)).toEqual(["CEDIS", "Cerca", "Medio", "Lejos"]);
    expect(r.kmDespues).toBeLessThan(r.kmAntes);
  });
  it("si el orden capturado ya es el mejor, no cambia", () => {
    const capturado = [P("CEDIS", -99.00, "carga"), P("A", -99.02), P("B", -99.05), P("C", -99.10)];
    const r = ordenarParadas(capturado);
    expect(r.paradas.map(p => p.nombre)).toEqual(["CEDIS", "A", "B", "C"]);
    expect(r.kmDespues).toBe(r.kmAntes);
  });
  it("varias cargas conservan su orden", () => {
    const r = ordenarParadas([P("Carga 2", -99.08, "carga"), P("Carga 1", -99.00, "carga"), P("X", -99.01), P("Y", -99.09)]);
    expect(r.paradas.slice(0, 2).map(p => p.nombre)).toEqual(["Carga 2", "Carga 1"]);
    expect(r.paradas.slice(2).map(p => p.nombre)).toEqual(["X", "Y"]);
  });
  it("una sola entrega o lista vacía no truena", () => {
    expect(ordenarParadas([P("C", -99, "carga"), P("E", -99.1)]).paradas.map(p => p.nombre)).toEqual(["C", "E"]);
    expect(ordenarParadas([]).paradas).toEqual([]);
    expect(kmRecorrido([P("a", -99.0), P("b", -99.01)])).toBeCloseTo(1, 0);
  });
});
