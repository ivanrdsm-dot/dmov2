import { describe, it, expect } from "vitest";
import { leerCola, agregarACola, quitarDeCola, marcarError, esErrorDeRed, yaEstabaCerrada, MAX_COLA } from "./colaChofer.ts";

const almacen = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const item = (n, extra = {}) => ({ id: "s1_p" + n, servicioId: "s1", paradaId: "p" + n, cerradaMs: 1000 + n, fotos: ["data:image/jpeg;base64,AAA"], evidencia: { receptor: "Ana" }, ...extra });

describe("entregas sin señal", () => {
  it("guarda, reemplaza la misma parada y quita al enviar", () => {
    const a = almacen();
    expect(agregarACola(a, item(1)).ok).toBe(true);
    expect(agregarACola(a, item(1, { evidencia: { receptor: "Luis" } })).ok).toBe(true);
    expect(leerCola(a)).toHaveLength(1); expect(leerCola(a)[0].evidencia.receptor).toBe("Luis");
    agregarACola(a, item(2)); quitarDeCola(a, "s1_p1");
    expect(leerCola(a).map(x => x.paradaId)).toEqual(["p2"]);
    marcarError(a, "s1_p2", "La parada no está en ruta");
    expect(leerCola(a)[0]).toMatchObject({ error: "La parada no está en ruta", intentos: 1 });
  });
  it("no se pierde en silencio: avisa si está llena o sin espacio", () => {
    const a = almacen();
    for(let i = 0; i < MAX_COLA; i++) agregarACola(a, item(i));
    expect(agregarACola(a, item(99)).ok).toBe(false);
    const lleno = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(agregarACola(lleno, item(1))).toMatchObject({ ok: false });
    expect(leerCola({ getItem: () => "{roto", setItem() {} })).toEqual([]);
  });
  it("distingue falta de internet de otros errores", () => {
    expect(esErrorDeRed(new Error("cualquier cosa"), false)).toBe(true);
    expect(esErrorDeRed({ code: "functions/unavailable", message: "x" })).toBe(true);
    expect(esErrorDeRed(new TypeError("Failed to fetch"))).toBe(true);
    expect(esErrorDeRed({ code: "functions/failed-precondition", message: "Estás a 900 m del punto" })).toBe(false);
    expect(esErrorDeRed({ code: "storage/unauthorized", message: "permission denied network" })).toBe(false);
    expect(yaEstabaCerrada({ message: "Esta parada ya está cerrada" })).toBe(true);
  });
});
