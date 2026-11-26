import { describe, it, expect } from "vitest";
import { planDelDia, ESPERA_PEDIDO_MIN } from "./planDia.ts";
import { justificacionVigente, ESPERA_PEDIDO_MIN as ESPERA_SERVIDOR, alertasChoferes, MOTIVOS_SIN_RUTA } from "./functions/lib/vigilancia.js";
import { MOTIVOS } from "./planDia.ts";
import { avisoDeAlerta, coleccionDeAlerta } from "./functions/lib/avisosOficina.js";

const dia = "2026-11-26", h = (x: string) => Date.parse(`${dia}T${x}:00-06:00`);
const choferes = [{ id: "a", nombre: "Elías" }, { id: "b", nombre: "Israel" }, { id: "c", nombre: "Enrique" }, { id: "d", nombre: "Víctor" }, { id: "p", nombre: "Prueba", prueba: true }, { id: "x", nombre: "Baja", baja: true }];

describe("plan del día de operaciones", () => {
  it("falta quien no tiene ruta ni motivo; no cuentan pruebas ni bajas", () => {
    const p = planDelDia({ choferes, servicios: [{ folio: "SRV-9", fechaServicio: dia, estado: "Asignada", choferId: "a", segundoChoferId: "d" }], sinRuta: [], dia, ahoraMs: h("08:50") });
    expect(p.filas.map(f => [f.nombre, f.estado])).toEqual([["Enrique", "pendiente"], ["Israel", "pendiente"], ["Elías", "con_ruta"], ["Víctor", "con_ruta"]]);
    expect(p).toMatchObject({ faltan: 2, completo: false, conRuta: 2 });
    const dos = planDelDia({ choferes: [choferes[0]], servicios: [{ id: "s", folio: "SRV-9", fechaServicio: dia, estado: "En ruta", choferId: "a" }, { id: "s", folio: "SRV-9", fechaServicio: dia, estado: "En ruta", choferId: "a" }], sinRuta: [], dia, ahoraMs: h("09:00") });
    expect(dos.filas[0]!.rutas).toEqual(["SRV-9"]);     // la de hoy que ya va en ruta no se repite
  });
  it("con motivo registrado queda completo; una ruta de otro día o cancelada no cuenta", () => {
    const p = planDelDia({ choferes, dia, ahoraMs: h("08:55"),
      servicios: [{ folio: "SRV-1", fechaServicio: "2026-11-27", estado: "Asignada", choferId: "a" }, { folio: "SRV-2", fechaServicio: dia, estado: "Cancelada", choferId: "b" },
        { folio: "SRV-3", fechaServicio: "2026-11-25", estado: "En ruta", choferId: "c" }],
      sinRuta: ["a", "b", "d"].map(id => ({ choferId: id, fecha: dia, motivo: "taller", motivoTexto: "Taller o mantenimiento", enMs: h("08:52") })) });
    expect(p.completo).toBe(true);
    expect(p.filas.find(f => f.id === "c")?.rutas).toEqual(["SRV-3"]);     // foránea que sigue en ruta cuenta
    expect(p.sinSalir).toBe(3);
  });
  it('"espera pedido" vence a las 2 h y vuelve a faltar', () => {
    const sinRuta = [{ choferId: "b", fecha: dia, motivo: "espera_pedido", enMs: h("09:00") }];
    const base = { choferes: [choferes[1]], servicios: [], sinRuta, dia };
    expect(planDelDia({ ...base, ahoraMs: h("10:59") }).filas[0]!.estado).toBe("justificado");
    expect(planDelDia({ ...base, ahoraMs: h("11:00") }).filas[0]!.estado).toBe("vencido");
    expect(ESPERA_PEDIDO_MIN).toBe(ESPERA_SERVIDOR);
    expect(justificacionVigente(sinRuta[0], h("10:59"))).toBe(true);
    expect(justificacionVigente(sinRuta[0], h("11:00"))).toBe(false);
  });
  it("los motivos de la pantalla son los mismos que acepta el servidor", () => {
    expect(MOTIVOS.map(m => m.k).sort()).toEqual(Object.keys(MOTIVOS_SIN_RUTA).sort());
  });
});

describe("aviso a operaciones: chofer trabajando sin ruta", () => {
  const jornadas = [{ id: "b_" + dia, choferId: "b", choferNombre: "Israel", fecha: dia, estado: "Abierta", checkInMs: h("08:52") }];
  const sin = (ahora: number, extra: any = {}) => alertasChoferes({ jornadas, ubicaciones: { b: { tMs: ahora } }, ...extra }, ahora).filter((a: any) => a.type === "chofer_sin_ruta");
  it("a los 20 min de su check-in sin ruta ni motivo, avisa (una sola alerta por día)", () => {
    expect(sin(h("09:05"))).toHaveLength(0);
    const a = sin(h("09:15"));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ id: `chf-sinruta-b-${dia}`, choferId: "b" });
    expect(a[0].message).toContain("Israel hizo check-in hace 23 min y no tiene ruta hoy");
  });
  it("no avisa si tiene ruta hoy o motivo vigente; vuelve a avisar cuando vence la espera", () => {
    expect(sin(h("09:15"), { conRutaHoy: [{ choferId: "b", fechaServicio: dia, estado: "Asignada" }] })).toHaveLength(0);
    expect(sin(h("09:15"), { sinRuta: [{ choferId: "b", fecha: dia, motivo: "taller", enMs: h("09:00") }] })).toHaveLength(0);
    expect(sin(h("10:00"), { sinRuta: [{ choferId: "b", fecha: dia, motivo: "espera_pedido", enMs: h("09:00") }] })).toHaveLength(0);
    expect(sin(h("11:10"), { sinRuta: [{ choferId: "b", fecha: dia, motivo: "espera_pedido", enMs: h("09:00") }] })[0].message).toContain("ya venció");
  });
  it("le llega a operaciones (Ilse) y al director", () => {
    expect(coleccionDeAlerta("chofer_sin_ruta")).toBe("alertas");
    expect(avisoDeAlerta({ id: "z", type: "chofer_sin_ruta", choferNombre: "Israel", message: "Israel hizo check-in…" })).toMatchObject({ title: "🚚 Chofer sin ruta: regístrala", soloDirector: false });
  });
});
