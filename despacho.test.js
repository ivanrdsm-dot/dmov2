import { describe, it, expect } from "vitest";
import { estadoSenal, faltantesChoferApp, avanceRuta, semaforoViaje } from "./despacho.ts";

const T = Date.parse("2026-11-10T16:00:00Z"), MIN = 60000;
describe("estadoSenal", () => {
  it("clasifica por minutos desde la última posición", () => {
    expect(estadoSenal({ tMs: T - 1 * MIN }, T)).toEqual({ senal: "en vivo", minutos: 1 });
    expect(estadoSenal({ tMs: T - 6 * MIN }, T)).toEqual({ senal: "con retraso", minutos: 6 });
    expect(estadoSenal({ tMs: T - 25 * MIN }, T)).toEqual({ senal: "sin señal", minutos: 25 });
    expect(estadoSenal(null, T)).toEqual({ senal: "nunca", minutos: null });
    expect(estadoSenal({ tMs: T - 6 * MIN }, T, 5).senal).toBe("sin señal");
  });
});
describe("faltantesChoferApp", () => {
  it("dice qué falta para poder asignarle una ruta", () => {
    expect(faltantesChoferApp({ id: "c1" })).toEqual(["Cuenta de la app"]);
    expect(faltantesChoferApp({ id: "c1", authUid: "u" })).toEqual(["Entrar por primera vez desde su teléfono"]);
    expect(faltantesChoferApp({ id: "c1", authUid: "u", dispositivoId: "d" })).toEqual([]);
    expect(faltantesChoferApp({ id: "c1", authUid: "u", dispositivoId: "d", status: "Inactivo" })).toEqual(["Chofer inactivo"]);
  });
});
describe("avanceRuta y semaforoViaje", () => {
  const paradas = [{ id: "p2", orden: 2, estado: "Pendiente", nombre: "B" }, { id: "p1", orden: 1, estado: "Entregada", nombre: "A" }, { id: "p3", orden: 3, estado: "Pendiente", nombre: "C" }];
  it("cuenta cerradas y encuentra la siguiente en orden", () => {
    expect(avanceRuta(paradas)).toMatchObject({ total: 3, cerradas: 1, incidencias: 0, pct: 33 });
    expect(avanceRuta(paradas).siguiente.id).toBe("p2");
    expect(avanceRuta([])).toMatchObject({ total: 0, pct: 0, siguiente: null });
  });
  it("semáforo: rojo sin señal o ubicación no confiable; ámbar por retraso, incidencia o batería; verde en regla", () => {
    expect(semaforoViaje({ tMs: T - MIN, bateria: 80 }, paradas, T)).toEqual({ color: "verde", motivo: "En ruta, transmitiendo" });
    expect(semaforoViaje({ tMs: T - 30 * MIN }, paradas, T).color).toBe("rojo");
    expect(semaforoViaje({ tMs: T - MIN, confiable: false }, paradas, T)).toEqual({ color: "rojo", motivo: "Ubicación no confiable" });
    expect(semaforoViaje({ tMs: T - 5 * MIN }, paradas, T).color).toBe("ambar");
    expect(semaforoViaje({ tMs: T - MIN, bateria: 9 }, paradas, T).motivo).toBe("Batería al 9 %");
    expect(semaforoViaje({ tMs: T - MIN }, [{ id: "x", orden: 1, estado: "Incidencia" }], T).motivo).toBe("Tiene incidencias");
    expect(semaforoViaje(null, paradas, T).color).toBe("ambar");
  });
});
