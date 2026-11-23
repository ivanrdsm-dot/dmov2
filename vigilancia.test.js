import { describe, it, expect } from "vitest";
import { actualizarQuieto, actualizarFueraDeRuta, distanciaALineaM, alertasChoferes, UMBRALES_CHOFER } from "./functions/lib/vigilancia.js";
import { revisarFotoJornada, lineaATexto, lineaDeTexto } from "./functions/lib/evidencia.js";

const MIN = 60000, T0 = Date.parse("2026-11-24T10:00:00-06:00");
const p = (lat, lng, tMs) => ({ lat, lng, tMs, confiable: true });

describe("chofer detenido", () => {
  it("cuenta desde que llegó al lugar y se reinicia al moverse", () => {
    let q = actualizarQuieto(null, p(19.4, -99.15, T0));
    q = actualizarQuieto(q, p(19.4005, -99.15, T0 + 10 * MIN));      // ~55 m: sigue en el mismo lugar
    expect(q.quietoDesdeMs).toBe(T0);
    q = actualizarQuieto(q, p(19.41, -99.15, T0 + 12 * MIN));        // ~1.1 km: ya se movió
    expect(q.quietoDesdeMs).toBe(T0 + 12 * MIN);
    expect(actualizarQuieto(q, { ...p(19.5, -99.2, T0 + 13 * MIN), confiable: false })).toBe(q);   // un punto dudoso no cuenta
  });
  it("alerta a los 20 min fuera de paradas, a los 60 en una parada; id estable", () => {
    const s = { id: "s1", folio: "SRV-1", choferId: "c1", choferNombre: "Israel", paradas: [{ lat: 19.4, lng: -99.15, radioM: 150 }] };
    const u = (lat, desde, t = T0 + 25 * MIN) => ({ c1: { tMs: t, servicioId: "s1", quietoDesdeMs: desde, quietoLat: lat, quietoLng: -99.15 } });
    const fuera = alertasChoferes({ ubicaciones: u(19.45, T0), enRuta: [s] }, T0 + 25 * MIN);
    expect(fuera).toHaveLength(1); expect(fuera[0]).toMatchObject({ id: `chf-det-c1-${T0}`, type: "detenido", choferNombre: "Israel" });
    expect(fuera[0].message).toMatch(/FUERA de sus paradas/);
    expect(alertasChoferes({ ubicaciones: u(19.4, T0), enRuta: [s] }, T0 + 25 * MIN)).toHaveLength(0);   // entregando: aún no
    expect(alertasChoferes({ ubicaciones: u(19.4, T0, T0 + 61 * MIN), enRuta: [s] }, T0 + 61 * MIN)[0]?.type).toBe("detenido");
  });
});

describe("fuera de ruta", () => {
  const linea = [[-99.15, 19.40], [-99.15, 19.50]];
  it("mide la distancia al camino", () => {
    expect(distanciaALineaM({ lat: 19.45, lng: -99.15 }, linea)).toBeLessThan(1);
    expect(Math.round(distanciaALineaM({ lat: 19.45, lng: -99.16 }, linea) / 10) * 10).toBeGreaterThan(1000);
  });
  it("solo alerta si se aleja más de 1.5 km por más de 3 min", () => {
    let f = actualizarFueraDeRuta(null, p(19.45, -99.17, T0), linea);       // ~2.1 km
    expect(f.fueraDesdeMs).toBe(T0);
    f = actualizarFueraDeRuta(f, p(19.46, -99.17, T0 + 2 * MIN), linea);
    expect(f.fueraDesdeMs).toBe(T0);
    expect(actualizarFueraDeRuta(f, p(19.46, -99.151, T0 + 3 * MIN), linea)).toBe(null);   // regresó
    const s = { id: "s1", folio: "SRV-1", choferId: "c1", paradas: [] };
    const ubi = d => ({ c1: { tMs: T0 + d, servicioId: "s1", fueraDesdeMs: T0, fueraM: 2100 } });
    expect(alertasChoferes({ ubicaciones: ubi(2 * MIN), enRuta: [s] }, T0 + 2 * MIN)).toHaveLength(0);
    expect(alertasChoferes({ ubicaciones: ubi(4 * MIN), enRuta: [s] }, T0 + 4 * MIN)[0]).toMatchObject({ type: "fuera_de_ruta", id: `chf-ruta-c1-${T0}` });
  });
});

describe("sin ubicación y asistencia", () => {
  it("en ruta sin mandar ubicación más de 10 min", () => {
    const s = { id: "s1", folio: "SRV-1", choferId: "c1", choferNombre: "Elías", enRutaMs: T0, paradas: [] };
    expect(alertasChoferes({ ubicaciones: { c1: { tMs: T0 + 5 * MIN, servicioId: "s1" } }, enRuta: [s] }, T0 + 12 * MIN)).toHaveLength(0);
    const a = alertasChoferes({ ubicaciones: { c1: { tMs: T0, servicioId: "s1" } }, enRuta: [s] }, T0 + 12 * MIN);
    expect(a[0]).toMatchObject({ type: "sin_ubicacion", id: "chf-sinubi-s1" });
    expect(alertasChoferes({ ubicaciones: {}, enRuta: [s] }, T0 + 12 * MIN)[0].type).toBe("sin_ubicacion");   // nunca mandó
  });
  it("falta: tiene ruta hoy y no hizo check-in a la hora", () => {
    const hoy = "2026-11-24", r = [{ id: "s1", folio: "SRV-1", choferId: "c1", choferNombre: "Elías", fechaServicio: hoy, estado: "Asignada" }];
    const nueve = Date.parse(`${hoy}T${UMBRALES_CHOFER.horaCheckIn}:00-06:00`);
    expect(alertasChoferes({ conRutaHoy: r }, nueve - MIN)).toHaveLength(0);
    expect(alertasChoferes({ conRutaHoy: r }, nueve + MIN)[0]).toMatchObject({ type: "sin_checkin", id: `chf-asis-c1-${hoy}` });
    expect(alertasChoferes({ conRutaHoy: r, ubicaciones: { c1: { tMs: nueve } }, jornadas: [{ id: "c1_" + hoy, choferId: "c1", fecha: hoy, estado: "Abierta", checkInMs: nueve - 30 * MIN }] }, nueve + MIN)).toHaveLength(0);
  });
  it("jornada sin ubicación (sin ruta) y jornada sin check-out", () => {
    const j = { id: "c1_2026-11-24", choferId: "c1", choferNombre: "Elías", fecha: "2026-11-24", estado: "Abierta", checkInMs: T0 };
    expect(alertasChoferes({ jornadas: [j], ubicaciones: { c1: { tMs: T0 + 20 * MIN } } }, T0 + 40 * MIN)).toHaveLength(0);
    expect(alertasChoferes({ jornadas: [j], ubicaciones: { c1: { tMs: T0 + 5 * MIN } } }, T0 + 40 * MIN)[0].type).toBe("sin_ubicacion");
    const tarde = alertasChoferes({ jornadas: [j], ubicaciones: { c1: { tMs: T0 + 15 * 3600000 } } }, T0 + 15 * 3600000);
    expect(tarde.map(a => a.type)).toEqual(["sin_checkout"]);
  });
});

describe("fotos de check-in revisadas por el servidor", () => {
  const meta = (extra = {}) => ({ contentType: "image/jpeg", size: 90000, timeCreated: new Date(T0).toISOString(), md5Hash: "abc==", metadata: { sello: "DMOV", tomadaMs: String(T0) }, ...extra });
  it("acepta una foto de este momento y guarda su huella", () => {
    expect(revisarFotoJornada(meta(), T0 + 2 * MIN)).toMatchObject({ ok: true, md5: "abc==", aviso: "" });
  });
  it("rechaza fotos viejas, vacías o que no son imagen", () => {
    expect(revisarFotoJornada(meta(), T0 + 20 * MIN).ok).toBe(false);
    expect(revisarFotoJornada(meta({ size: 100 }), T0).ok).toBe(false);
    expect(revisarFotoJornada(meta({ contentType: "application/pdf" }), T0).ok).toBe(false);
    expect(revisarFotoJornada(null, T0).ok).toBe(false);
  });
  it("avisa si la hora del celular no cuadra o falta el sello", () => {
    expect(revisarFotoJornada(meta({ metadata: { sello: "x", tomadaMs: String(T0 - 3600000) } }), T0).aviso).toMatch(/no coincide/);
    expect(revisarFotoJornada(meta({ metadata: {} }), T0).aviso).toMatch(/sin sello/);
  });
  it("el trazo de la ruta va y viene como texto", () => {
    expect(lineaDeTexto(lineaATexto([[-99.15, 19.4], [-99.16, 19.5]]))).toEqual([[-99.15, 19.4], [-99.16, 19.5]]);
    expect(lineaDeTexto("")).toEqual([]);
  });
});

import { avisoDeAlerta } from "./functions/lib/avisosOficina.js";
describe("avisos al celular de la oficina", () => {
  it("solo las alertas de choferes, con quién y qué pasó", () => {
    expect(avisoDeAlerta({ id: "a1", type: "detenido", choferNombre: "Israel", message: "Israel lleva 25 min detenido" })).toEqual({ title: "⏸️ Chofer detenido", body: "Israel lleva 25 min detenido", tag: "alerta-a1", url: "/?v=operacion" });
    expect(avisoDeAlerta({ id: "a2", type: "sos", choferNombre: "Elías", msg: "SOS del chofer" }).title).toBe("🚨 SOS del chofer · Elías");
    expect(avisoDeAlerta({ id: "a3", type: "solicitud_sin_respuesta", message: "x" })).toBe(null);
    expect(avisoDeAlerta({ id: "a4", type: "sos", atendida: true })).toBe(null);
  });
});
