import { describe, it, expect } from "vitest";
import { resumenOperacion, estadoAsistencia } from "./operacion.ts";

const DIA = "2026-11-24", T = h => Date.parse(`${DIA}T${h}:00-06:00`);
describe("centro de operación", () => {
  it("asistencia: trabajando, terminó, faltó, por llegar y sin ruta", () => {
    expect(estadoAsistencia({ estado: "Abierta" }, true, true, true)).toBe("Trabajando");
    expect(estadoAsistencia({ estado: "Cerrada" }, true, true, true)).toBe("Terminó");
    expect(estadoAsistencia(undefined, true, true, true)).toBe("Faltó");
    expect(estadoAsistencia(undefined, true, true, false)).toBe("Por llegar");
    expect(estadoAsistencia(undefined, false, true, true)).toBe("Sin ruta hoy");
  });
  it("resume por chofer y marca a quien perdió señal; primero lo urgente", () => {
    const r = resumenOperacion({
      choferes: [{ id: "a", nombre: "Elías" }, { id: "b", nombre: "Israel" }, { id: "c", nombre: "Eder" }],
      jornadas: [{ choferId: "a", fecha: DIA, estado: "Abierta", checkInEn: T("08:30") }, { choferId: "b", fecha: DIA, estado: "Abierta", checkInEn: T("08:40") }],
      servicios: [{ id: "s1", folio: "SRV-1", choferId: "a", fechaServicio: DIA, estado: "En ruta" }, { id: "s2", folio: "SRV-2", choferId: "c", fechaServicio: DIA, estado: "Asignada" }],
      ubicaciones: { a: { lat: 19.4, lng: -99.1, tMs: T("10:00") }, b: { lat: 19.4, lng: -99.1, tMs: T("10:28") } },
      dia: DIA, ahoraMs: T("10:30"),
    });
    expect(r.filas.map(f => [f.nombre, f.asistencia, f.sinSenal])).toEqual([["Elías", "Trabajando", true], ["Eder", "Faltó", false], ["Israel", "Trabajando", false]]);
    expect(r).toMatchObject({ trabajando: 2, enRuta: 1, faltan: 1, sinSenal: 1 });
    expect(r.filas[0].minUbicacion).toBe(30);
  });
});
