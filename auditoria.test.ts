import { describe, it, expect } from "vitest";
import { auditarServicios, lugaresNuevos, resumenPorPersona, fueraDeHorario } from "./auditoria.ts";

const ms = (iso: string) => Date.parse(iso);
const s = (extra: any = {}) => ({ id: "s1", folio: "SRV-1", creadoPor: "ilse", creadoPorNombre: "Ilse", empresa: "SCJ", estado: "Asignada", creadoEnMs: ms("2026-11-25T10:00:00-06:00"), ...extra });

describe("auditoría de la oficina", () => {
  it("horario de oficina: lunes a sábado de 7 a 20 h", () => {
    expect(fueraDeHorario(ms("2026-11-25T10:00:00-06:00"))).toBe(false);
    expect(fueraDeHorario(ms("2026-11-25T22:30:00-06:00"))).toBe(true);
    expect(fueraDeHorario(ms("2026-11-29T11:00:00-06:00"))).toBe(true);   // domingo
  });
  it("marca cliente fuera del catálogo, sin cliente, fuera de horario y canceladas; no audita al director ni la bitácora vieja", () => {
    const filas = auditarServicios([
      s(), s({ id: "s2", empresa: "Mudanza de mi prima" }), s({ id: "s3", empresa: "" }), s({ id: "s4", creadoEnMs: ms("2026-11-25T23:00:00-06:00") }),
      s({ id: "s5", estado: "Cancelada" }), s({ id: "s6", creadoPor: "ivan" }), s({ id: "s7", historico: true }),
    ], { admins: ["ivan"], clientes: ["SCJ", "Loreal Logística"] });
    const por = Object.fromEntries(filas.map(f => [f.id, f.banderas]));
    expect(por.s1).toEqual([]);
    expect(por.s2).toEqual(["Cliente fuera del catálogo"]);
    expect(por.s3).toEqual(["Sin cliente"]);
    expect(por.s4).toEqual(["Creada fuera de horario"]);
    expect(por.s5).toEqual(["Cancelada"]);
    expect(por.s6).toBeUndefined(); expect(por.s7).toBeUndefined();
  });
  it("lugares nuevos de la oficina y resumen por persona", () => {
    const filas = auditarServicios([s(), s({ id: "s2", empresa: "Otro" })], { clientes: ["SCJ"] });
    const ls = lugaresNuevos([{ id: "l1", nombre: "Casa X", creadoPor: "ilse", creadoEnMs: ms("2026-11-25T21:00:00-06:00") }, { id: "l2", creadoPor: "ivan", creadoEnMs: ms("2026-11-25T10:00:00-06:00") }],
      { admins: ["ivan"], desdeMs: ms("2026-11-01T00:00:00-06:00") });
    expect(ls).toHaveLength(1); expect(ls[0].fueraDeHorario).toBe(true);
    const [p] = resumenPorPersona(filas, ls, { ilse: "Ilse" });
    expect(p).toMatchObject({ nombre: "Ilse", rutas: 2, conBanderas: 1, fueraDeCatalogo: 1, lugaresNuevos: 1 });
  });
});
