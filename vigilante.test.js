import { describe, it, expect } from "vitest";
import { alertasEsperadas, planVigilante, UMBRALES } from "./functions/lib/vigilante.js";

const ms = iso => Date.parse(iso);
const MARTES_11 = ms("2026-11-10T11:00:00-06:00"), SABADO = ms("2026-11-14T11:00:00-06:00"), MARTES_20 = ms("2026-11-10T20:00:00-06:00");
const tipos = a => a.map(x => x.type).sort();

describe("solicitudes", () => {
  const s = (extra = {}) => ({ id: "s1", folio: "SOL-2026-0001", estado: "Nueva", recibidaEn: ms("2026-11-10T10:30:00-06:00"), ...extra });
  it("avisa cuando pasa la meta en minutos hábiles y no antes", () => {
    expect(alertasEsperadas({ solicitudes: [s()] }, MARTES_11)).toHaveLength(1);
    expect(alertasEsperadas({ solicitudes: [s({ recibidaEn: ms("2026-11-10T10:50:00-06:00") })] }, MARTES_11)).toHaveLength(0);
    const a = alertasEsperadas({ solicitudes: [s()] }, MARTES_11)[0];
    expect(a).toMatchObject({ id: "vig-sol-s1", type: "solicitud_sin_respuesta", folio: "SOL-2026-0001", ref: { coleccion: "solicitudes", id: "s1" } });
    expect(a.message).toContain("30 min hábiles");
  });
  it("lo que llega en la noche no cuenta hasta que abre la oficina", () => {
    const noche = s({ recibidaEn: ms("2026-11-10T19:00:00-06:00") });
    expect(alertasEsperadas({ solicitudes: [noche] }, ms("2026-11-11T09:10:00-06:00"))).toHaveLength(0);
    expect(alertasEsperadas({ solicitudes: [noche] }, ms("2026-11-11T09:20:00-06:00"))).toHaveLength(1);
  });
  it("respondidas, descartadas o convertidas no alertan", () => {
    for(const x of [s({ primeraRespuestaEn: ms("2026-11-10T10:35:00-06:00") }), s({ estado: "Descartada" }), s({ estado: "Convertida" }), s({ recibidaEn: undefined })])
      expect(alertasEsperadas({ solicitudes: [x] }, MARTES_11)).toHaveLength(0);
  });
});

describe("cotizaciones", () => {
  it("propuesta sin aprobar y aprobada sin enviar, con umbral en minutos hábiles", () => {
    const c = [{ id: "c1", folio: "COT-1", estado: "Propuesta", empresa: "Cliente", creadoEn: ms("2026-11-10T09:30:00-06:00") },
      { id: "c2", folio: "COT-2", estado: "Aprobada", creadoEn: ms("2026-11-10T09:00:00-06:00"), estadoTs: { Aprobada: ms("2026-11-10T09:45:00-06:00") } },
      { id: "c3", folio: "COT-3", estado: "Propuesta", creadoEn: ms("2026-11-10T10:30:00-06:00") },
      { id: "c4", folio: "COT-4", estado: "Enviada", creadoEn: ms("2026-11-09T09:00:00-06:00") }];
    const a = alertasEsperadas({ cotizaciones: c }, MARTES_11);
    expect(a.map(x => x.id)).toEqual(["vig-cot-c1-aprobar", "vig-cot-c2-enviar"]);
    expect(a[0].message).toContain("1 h 30 min hábiles");
  });
});

describe("servicios del día", () => {
  const sv = [{ id: "v1", folio: "SRV-1", estado: "Confirmada", fechaServicio: "2026-11-10", horaServicio: "15:00", empresa: "Cliente" },
    { id: "v2", folio: "SRV-2", estado: "Asignada", fechaServicio: "2026-11-10" }, { id: "v3", folio: "SRV-3", estado: "Solicitud", fechaServicio: "2026-11-11" }];
  it("solo los de hoy que siguen sin unidad, y solo en horario laboral", () => {
    const a = alertasEsperadas({ servicios: sv }, MARTES_11);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ id: "vig-srv-v1-2026-11-10", type: "servicio_sin_asignar" });
    expect(a[0].message).toContain("a las 15:00");
    expect(alertasEsperadas({ servicios: sv }, MARTES_20)).toHaveLength(0);
    expect(alertasEsperadas({ servicios: [{ ...sv[0], fechaServicio: "2026-11-14" }] }, SABADO)).toHaveLength(0);
  });
});

describe("conectores", () => {
  it("avisa si el correo deja de latir; sin latido registrado no inventa", () => {
    expect(alertasEsperadas({ conectores: { gmail: { ultimoLatido: MARTES_11 - 3 * 60000 } } }, MARTES_11)).toHaveLength(0);
    const a = alertasEsperadas({ conectores: { gmail: { ultimoLatido: MARTES_11 - 25 * 60000 } } }, MARTES_11);
    expect(a[0]).toMatchObject({ id: "vig-con-gmail", type: "conector_sin_senal" });
    expect(a[0].message).toContain("correo");
    expect(alertasEsperadas({ conectores: { gmail: {} } }, MARTES_11)).toHaveLength(0);
    expect(alertasEsperadas({ conectores: { gmail: { ultimoLatido: MARTES_20 - 25 * 60000 } } }, MARTES_20)).toHaveLength(1);   // el conector corre 24/7
  });
});

describe("plan contra lo existente", () => {
  it("crea solo las nuevas y resuelve las que dejaron de aplicar", () => {
    const esperadas = [{ id: "a" }, { id: "b" }];
    expect(planVigilante(esperadas, [{ id: "b" }, { id: "z" }])).toEqual({ crear: [{ id: "a" }], resolver: ["z"] });
    expect(planVigilante([], [])).toEqual({ crear: [], resolver: [] });
  });
  it("todo junto, sin duplicar ids", () => {
    const a = alertasEsperadas({ solicitudes: [{ id: "s1", estado: "En revisión", recibidaEn: ms("2026-11-10T09:00:00-06:00") }],
      cotizaciones: [{ id: "c1", estado: "Propuesta", creadoEn: ms("2026-11-10T09:00:00-06:00") }],
      conectores: { gmail: { ultimoLatido: MARTES_11 - 60 * 60000 } } }, MARTES_11);
    expect(tipos(a)).toEqual(["conector_sin_senal", "cotizacion_por_aprobar", "solicitud_sin_respuesta"]);
    expect(new Set(a.map(x => x.id)).size).toBe(a.length);
    expect(UMBRALES.primeraRespuestaMin).toBe(15);
  });
});
