import { describe, it, expect } from "vitest";
import { faltantesCapacidad, medidasDeCarga, recomendarUnidades } from "./dimensionamiento.ts";

/* Capacidades de EJEMPLO para probar la lógica. No son las de la flota real. */
const flota = () => [
  { placa: "CHICA1", tipo: "Van", capacidadKg: 1000, capacidadM3: 6, capacidadTarimas: 2, capacidadCajas: 120 },
  { placa: "CHICA2", tipo: "Van", capacidadKg: 1000, capacidadM3: 6, capacidadTarimas: 2, capacidadCajas: 120 },
  { placa: "MEDIA1", tipo: "Camioneta 3.5", capacidadKg: 3500, capacidadM3: 16, capacidadTarimas: 10 },
  { placa: "GRANDE1", tipo: "Rabón", capacidadKg: 8000, capacidadM3: 40, capacidadTarimas: 14 },
];

describe("faltantesCapacidad y medidasDeCarga", () => {
  it("lista lo que falta capturar de una unidad", () => {
    expect(faltantesCapacidad({ placa: "X" })).toEqual(["Tipo de unidad", "Capacidad en kg", "Capacidad en m³", "Capacidad en tarimas"]);
    expect(faltantesCapacidad(flota()[2])).toEqual([]);
  });
  it("solo toma medidas con valor", () => {
    expect(medidasDeCarga({ pesoKg: "1,200", volumenM3: "", tarimas: 0, cajas: "40" }).map(m => [m.nombre, m.valor])).toEqual([["peso", 1200], ["cajas", 40]]);
  });
});

describe("recomendarUnidades", () => {
  it("sin datos de carga no dimensiona ni inventa", () => {
    const r = recomendarUnidades({}, flota());
    expect(r.estado).toBe("sin_datos_carga");
    expect(r.unidades).toEqual([]);
    expect(r.faltanDeLaCarga).toHaveLength(1);
  });
  it("elige la unidad más chica que alcanza y explica el porqué", () => {
    const r = recomendarUnidades({ pesoKg: 700, volumenM3: 3 }, flota());
    expect(r.estado).toBe("ok");
    expect(r.unidades).toEqual([{ placa: "CHICA1", tipo: "Van" }]);
    expect(r.uso).toEqual([
      { medida: "peso", unidad: "kg", carga: 700, capacidad: 1000, pct: 70 },
      { medida: "volumen", unidad: "m³", carga: 3, capacidad: 6, pct: 50 },
    ]);
    expect(r.justificacion.join(" ")).toContain("70 %");
    expect(r.alternativa).toEqual([{ placa: "MEDIA1", tipo: "Camioneta 3.5" }]);
  });
  it("sube de unidad cuando una sola medida no alcanza", () => {
    expect(recomendarUnidades({ pesoKg: 700, tarimas: 6 }, flota()).unidades).toEqual([{ placa: "MEDIA1", tipo: "Camioneta 3.5" }]);
    expect(recomendarUnidades({ tarimas: 11 }, flota()).unidades).toEqual([{ placa: "GRANDE1", tipo: "Rabón" }]);
  });
  it("no recomienda unidades sin la capacidad que hay que comparar, y las reporta", () => {
    const r = recomendarUnidades({ cajas: 100 }, flota());
    expect(r.unidades).toEqual([{ placa: "CHICA1", tipo: "Van" }]);
    expect(r.unidadesSinCapacidad).toEqual(["MEDIA1", "GRANDE1"]);
  });
  it("si ninguna unidad tiene la capacidad capturada, lo dice en vez de suponer", () => {
    const r = recomendarUnidades({ pesoKg: 500 }, [{ placa: "A1", tipo: "Van" }, { placa: "A2" }]);
    expect(r.estado).toBe("sin_capacidades");
    expect(r.unidadesSinCapacidad).toEqual(["A1", "A2"]);
  });
  it("ignora unidades dadas de baja o en taller", () => {
    const f = flota(); f[0].status = "Baja"; f[1].status = "En taller";
    expect(recomendarUnidades({ pesoKg: 700 }, f).unidades).toEqual([{ placa: "MEDIA1", tipo: "Camioneta 3.5" }]);
  });
  it("combina unidades cuando no cabe en una, usando las menos posibles", () => {
    const r = recomendarUnidades({ tarimas: 20 }, flota());
    expect(r.estado).toBe("ok");
    expect(r.unidades.map(u => u.placa)).toEqual(["GRANDE1", "MEDIA1"]);
    expect(r.uso[0]).toMatchObject({ carga: 20, capacidad: 24, pct: 83 });
    expect(r.justificacion.join(" ")).toContain("Se necesitan 2");
  });
  it("ajusta la última unidad a la más chica que alcanza", () => {
    expect(recomendarUnidades({ tarimas: 15 }, flota()).unidades.map(u => u.placa)).toEqual(["GRANDE1", "CHICA1"]);
  });
  it("cuando no cabe ni con el máximo de unidades, pide proveedor externo", () => {
    const r = recomendarUnidades({ tarimas: 60 }, flota());
    expect(r.estado).toBe("no_cabe");
    expect(r.unidades).toEqual([]);
    expect(r.justificacion.join(" ")).toContain("proveedor externo");
  });
  it("respeta el máximo de unidades configurado", () => {
    expect(recomendarUnidades({ tarimas: 20 }, flota(), { maxUnidades: 1 }).estado).toBe("no_cabe");
  });
});
