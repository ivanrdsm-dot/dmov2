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
    expect(UMBRALES_CHOFER.horaCheckIn).toBe("07:00");
    expect(alertasChoferes({ conRutaHoy: r }, nueve + 9 * MIN)).toHaveLength(0);          // tolerancia de 10 min
    expect(alertasChoferes({ conRutaHoy: r }, nueve + 11 * MIN)[0]).toMatchObject({ type: "sin_checkin", id: `chf-asis-c1-${hoy}` });
    expect(alertasChoferes({ conRutaHoy: r, ubicaciones: { c1: { tMs: nueve } }, jornadas: [{ id: "c1_" + hoy, choferId: "c1", fecha: hoy, estado: "Abierta", checkInMs: nueve - 30 * MIN }] }, nueve + MIN)).toHaveLength(0);
  });
  it("jornada sin ubicación (sin ruta) y jornada sin check-out", () => {
    const j = { id: "c1_2026-11-24", choferId: "c1", choferNombre: "Elías", fecha: "2026-11-24", estado: "Abierta", checkInMs: T0 };
    expect(alertasChoferes({ jornadas: [j], ubicaciones: { c1: { tMs: T0 + 20 * MIN } } }, T0 + 40 * MIN)).toHaveLength(0);
    expect(alertasChoferes({ jornadas: [j], ubicaciones: { c1: { tMs: T0 + 5 * MIN } } }, T0 + 40 * MIN)[0].type).toBe("sin_ubicacion");
    const tarde = alertasChoferes({ jornadas: [j], ubicaciones: { c1: { tMs: T0 + 17 * 3600000 } } }, T0 + 17 * 3600000);
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

import { clasificarRuta } from "./functions/lib/rutas.js";
describe("ruta local o foránea", () => {
  it("dentro de la ciudad es local y de un día", () => {
    expect(clasificarRuta([{ lat: 19.35, lng: -99.16 }, { lat: 19.5, lng: -99.2 }], { fechaServicio: "2026-11-24" })).toMatchObject({ foraneo: false, dias: 1, regresoEstimado: "2026-11-24" });
  });
  it("Puebla ida y vuelta: foránea; Tuxtla: varios días", () => {
    const puebla = clasificarRuta([{ lat: 19.04, lng: -98.2 }], { fechaServicio: "2026-11-24" });
    expect(puebla.foraneo).toBe(true); expect(puebla.dias).toBe(1);
    const tuxtla = clasificarRuta([{ lat: 18.85, lng: -97.1 }, { lat: 17.06, lng: -96.72 }, { lat: 16.75, lng: -93.12 }], { fechaServicio: "2026-11-24", duracionSeg: 13 * 3600 });
    expect(tuxtla).toMatchObject({ foraneo: true }); expect(tuxtla.dias).toBeGreaterThanOrEqual(3);
    expect(tuxtla.regresoEstimado > "2026-11-25").toBe(true);
  });
});

describe("horario local y rutas foráneas", () => {
  const hoy = "2026-11-24", H = h => Date.parse(`${hoy}T${h}:00-06:00`);
  const j = (estado = "Abierta") => ({ id: "c1_" + hoy, choferId: "c1", choferNombre: "Elías", fecha: hoy, estado, checkInMs: H("07:00") });
  it("local: a las 17:30 sin check-out avisa, salvo que siga en ruta", () => {
    const u = { c1: { tMs: H("17:35"), servicioId: "s1" } };
    expect(alertasChoferes({ jornadas: [j()], ubicaciones: u }, H("17:20"))).toHaveLength(0);
    expect(alertasChoferes({ jornadas: [j()], ubicaciones: u }, H("17:35"))[0]).toMatchObject({ type: "sin_checkout" });
    const enRuta = [{ id: "s1", folio: "SRV-1", choferId: "c1", paradas: [], enRutaMs: H("08:00") }];
    expect(alertasChoferes({ jornadas: [j()], ubicaciones: u, enRuta }, H("17:35")).filter(a => a.type === "sin_checkout")).toHaveLength(0);
  });
  it("foránea: de noche descansando no alerta; al día siguiente pide check-in; si se pasa de días avisa", () => {
    const ayer = Date.parse("2026-11-23T08:00:00-06:00");
    const s = { id: "s9", folio: "SRV-9", choferId: "c1", choferNombre: "Elías", foraneo: true, regresoEstimado: "2026-11-25", enRutaMs: ayer, paradas: [] };
    // Cerró su día ayer y hoy a las 06:00 no ha empezado: sin alertas aunque no mande ubicación.
    expect(alertasChoferes({ enRuta: [s], ubicaciones: { c1: { tMs: ayer + 10 * 3600000, servicioId: "s9" } } }, H("06:00"))).toHaveLength(0);
    // A las 9:10 sin check-in: avisa.
    expect(alertasChoferes({ enRuta: [s], ubicaciones: {} }, H("09:10")).map(a => a.type)).toEqual(["sin_checkin"]);
    // Hoy ya cerró su día (descanso): no se vigila la ubicación.
    expect(alertasChoferes({ enRuta: [s], jornadas: [j("Cerrada")], ubicaciones: {} }, H("22:00"))).toHaveLength(0);
    // Con su jornada abierta sí se vigila.
    expect(alertasChoferes({ enRuta: [s], jornadas: [j()], ubicaciones: {} }, H("12:00")).map(a => a.type)).toEqual(["sin_ubicacion"]);
    // Se pasó del regreso estimado.
    expect(alertasChoferes({ enRuta: [{ ...s, regresoEstimado: "2026-11-23" }], jornadas: [j()], ubicaciones: { c1: { tMs: H("12:00"), servicioId: "s9" } } }, H("12:00")).map(a => a.type)).toEqual(["ruta_excedida"]);
  });
});

import { evaluarCierreParada, resumenCambio, estaDetenida } from "./functions/lib/paradas.js";
describe("detener entrega y Enterado del chofer", () => {
  const parada = { id: "p1", nombre: "Soriana Miyana", estado: "Pendiente", lat: 19.44, lng: -99.2, detenida: { activa: true, motivo: "No entregar hoy, se reprograma" } };
  it("una parada detenida no se puede cerrar, aunque traiga todo y esté en el punto", () => {
    const r = evaluarCierreParada({ parada, posicion: { lat: 19.44, lng: -99.2, tMs: T0, confiable: true }, ahoraMs: T0, evidencia: { fotos: ["f.jpg"], receptor: "Ana" } });
    expect(r).toMatchObject({ permitido: false, detenida: true });
    expect(r.motivo).toMatch(/No entregar hoy/);
    expect(estaDetenida({ ...parada, detenida: { activa: false } })).toBe(false);
  });
  it("el aviso al chofer dice clarito qué cambió", () => {
    expect(resumenCambio({ detenidas: [{ nombre: "Soriana Miyana", motivo: "se reprograma" }], quitadas: ["Tienda C"], agregadas: ["Tienda D"], reanudadas: ["Chedraui"] }))
      .toEqual(["⛔ NO ENTREGAR en Soriana Miyana — se reprograma", "✅ Ya puedes entregar en Chedraui", "➖ Se quitó: Tienda C", "➕ Nueva parada: Tienda D"]);
    expect(resumenCambio({})).toEqual([]);
  });
  it("si el chofer no toca Enterado en 5 min, alerta a la oficina", () => {
    const s = { id: "s1", folio: "SRV-1", choferId: "c1", choferNombre: "Israel", estado: "En ruta", paradas: [], enRutaMs: T0,
      cambioPendiente: { id: "abc", enMs: T0, lineas: ["⛔ NO ENTREGAR en Soriana Miyana"], enteradoMs: null } };
    const u = { c1: { tMs: T0 + 6 * MIN, servicioId: "s1" } };
    expect(alertasChoferes({ enRuta: [s], ubicaciones: u }, T0 + 4 * MIN).filter(a => a.type === "cambio_sin_enterado")).toHaveLength(0);
    const a = alertasChoferes({ enRuta: [s], ubicaciones: u }, T0 + 6 * MIN).find(x => x.type === "cambio_sin_enterado");
    expect(a).toMatchObject({ id: "chf-ent-s1-abc" }); expect(a.message).toMatch(/NO ENTREGAR en Soriana Miyana/);
    expect(alertasChoferes({ enRuta: [{ ...s, cambioPendiente: { ...s.cambioPendiente, enteradoMs: T0 + MIN } }], ubicaciones: u }, T0 + 6 * MIN).filter(x => x.type === "cambio_sin_enterado")).toHaveLength(0);
  });
});
