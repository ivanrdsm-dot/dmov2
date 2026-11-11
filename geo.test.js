import { describe, it, expect } from "vitest";
import { distanciaM, evaluarGeocerca, velocidadKmh, validarLote, coordenadaValida } from "./functions/lib/geo.js";
import { evaluarCierreParada, validarCheckIn } from "./functions/lib/paradas.js";

/* Coordenadas de referencia públicas: Zócalo y Ángel de la Independencia, CDMX. */
const ZOCALO = { lat: 19.432608, lng: -99.133209 }, ANGEL = { lat: 19.427025, lng: -99.167665 };
const T0 = Date.parse("2026-11-10T16:00:00Z"), MIN = 60000;
const mover = (p, metrosNorte) => ({ lat: p.lat + metrosNorte / 111320, lng: p.lng });

describe("distancia y geocerca", () => {
  it("haversine da la distancia conocida entre dos puntos", () => {
    expect(Math.round(distanciaM(ZOCALO, ANGEL) / 10) * 10).toBeGreaterThan(3600);
    expect(Math.round(distanciaM(ZOCALO, ANGEL))).toBeLessThan(3720);
    expect(distanciaM(ZOCALO, ZOCALO)).toBe(0);
  });
  it("dentro del radio pasa; fuera explica a cuántos metros está", () => {
    expect(evaluarGeocerca(mover(ZOCALO, 100), ZOCALO)).toMatchObject({ dentro: true, radioM: 150 });
    const fuera = evaluarGeocerca(mover(ZOCALO, 400), ZOCALO);
    expect(fuera.dentro).toBe(false);
    expect(fuera.motivo).toMatch(/Está a 40\d m del punto; el límite es 150 m/);
  });
  it("respeta el radio propio del punto y vuelve al default si es absurdo", () => {
    expect(evaluarGeocerca(mover(ZOCALO, 400), { ...ZOCALO, radioM: 500 }).dentro).toBe(true);
    expect(evaluarGeocerca(mover(ZOCALO, 100), { ...ZOCALO, radioM: 5 }).radioM).toBe(150);
  });
  it("no valida con GPS impreciso ni con punto sin coordenada", () => {
    expect(evaluarGeocerca({ ...ZOCALO, precisionM: 900 }, ZOCALO)).toMatchObject({ dentro: false, precisionBaja: true });
    expect(evaluarGeocerca(ZOCALO, {}).motivo).toBe("El punto no tiene coordenada verificada");
    expect(evaluarGeocerca(null, ZOCALO).dentro).toBe(false);
    expect(coordenadaValida({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("validarLote", () => {
  const p = (pos, min, extra = {}) => ({ ...pos, tMs: T0 + min * MIN, precisionM: 12, ...extra });
  it("acepta un recorrido normal y lo ordena por hora", () => {
    const r = validarLote([p(mover(ZOCALO, 600), 2), p(ZOCALO, 0), p(mover(ZOCALO, 300), 1)], { ahoraMs: T0 + 3 * MIN });
    expect(r.aceptadas.map(x => x.tMs)).toEqual([T0, T0 + MIN, T0 + 2 * MIN]);
    expect(r.aceptadas.every(x => x.confiable)).toBe(true);
    expect(r.alertas).toEqual([]);
  });
  it("una ubicación simulada se guarda como evidencia, no confiable, y levanta alerta", () => {
    const r = validarLote([p(ZOCALO, 0), p(ANGEL, 1, { simulada: true })], { ahoraMs: T0 + 2 * MIN });
    expect(r.aceptadas[1]).toMatchObject({ simulada: true, confiable: false });
    expect(r.alertas.map(a => a.tipo)).toEqual(["ubicacion_simulada"]);
    expect(r.ultimaConfiable.tMs).toBe(T0);
  });
  it("un salto físicamente imposible se marca y alerta", () => {
    const lejos = { lat: 20.6597, lng: -103.3496 };                       // Guadalajara, a ~460 km
    const r = validarLote([p(lejos, 10)], { ahoraMs: T0 + 11 * MIN, ultimaConfiable: { ...ZOCALO, tMs: T0 } });
    expect(r.aceptadas[0].confiable).toBe(false);
    expect(r.aceptadas[0].velocidadImposibleKmh).toBeGreaterThan(2000);
    expect(r.alertas[0].tipo).toBe("velocidad_imposible");
  });
  it("rechaza coordenadas inválidas, horas del futuro, duplicados y puntos muy viejos", () => {
    const r = validarLote([{ lat: "x", lng: 1, tMs: T0 }, p(ZOCALO, 30), p(ZOCALO, 0), p(ZOCALO, 0), { ...ZOCALO, tMs: T0 - 100 * 3600000 }], { ahoraMs: T0 + MIN });
    expect(r.aceptadas).toHaveLength(1);
    expect(r.rechazadas.map(x => x.motivo).sort()).toEqual(["Coordenada inválida", "Demasiado antigua", "Duplicada", "Hora en el futuro"]);
    expect(r.alertas.map(a => a.tipo)).toEqual(["reloj_adelantado"]);
  });
  it("acepta puntos guardados sin señal y limita el tamaño del lote", () => {
    expect(validarLote([p(ZOCALO, -600)], { ahoraMs: T0 }).aceptadas).toHaveLength(1);
    const muchos = Array.from({ length: 700 }, (_, i) => p(mover(ZOCALO, i), i / 60));
    expect(validarLote(muchos, { ahoraMs: T0 + 20 * MIN }).aceptadas.length).toBeLessThanOrEqual(500);
    expect(validarLote(null, { ahoraMs: T0 }).aceptadas).toEqual([]);
  });
  it("velocidadKmh no divide entre cero", () => {
    expect(velocidadKmh({ ...ZOCALO, tMs: T0 }, { ...ANGEL, tMs: T0 })).toBeNull();
  });
});

describe("cierre de parada", () => {
  const parada = { id: "p1", estado: "Pendiente", ...ZOCALO, radioM: 150 };
  const evidencia = { fotos: ["evidencias/x.jpg"], receptor: "Persona que recibe", cantidadEntregada: 40 };
  const pos = (metros, min = 1, extra = {}) => ({ ...mover(ZOCALO, metros), tMs: T0 - min * MIN, precisionM: 10, confiable: true, ...extra });
  it("cierra dentro de la geocerca con evidencia completa", () => {
    expect(evaluarCierreParada({ parada, posicion: pos(60), ahoraMs: T0, evidencia })).toMatchObject({ permitido: true, porExcepcion: false });
  });
  it("NO cierra fuera del punto, y dice a qué distancia está", () => {
    const v = evaluarCierreParada({ parada, posicion: pos(900), ahoraMs: T0, evidencia });
    expect(v).toMatchObject({ permitido: false, fueraDeGeocerca: true });
    expect(v.motivo).toMatch(/Está a (89|90)\d m del punto; el límite es 150 m/);
  });
  it("NO cierra sin foto, sin receptor, ni con ubicación vieja, simulada o imprecisa", () => {
    expect(evaluarCierreParada({ parada, posicion: pos(10), ahoraMs: T0, evidencia: { ...evidencia, fotos: [] } }).motivo).toBe("Falta la foto de evidencia");
    expect(evaluarCierreParada({ parada, posicion: pos(10), ahoraMs: T0, evidencia: { ...evidencia, receptor: " " } }).motivo).toBe("Falta el nombre de quien recibe");
    expect(evaluarCierreParada({ parada, posicion: pos(10, 9), ahoraMs: T0, evidencia }).permitido).toBe(false);
    expect(evaluarCierreParada({ parada, posicion: pos(10, 1, { confiable: false }), ahoraMs: T0, evidencia }).permitido).toBe(false);
    expect(evaluarCierreParada({ parada, posicion: pos(10, 1, { precisionM: 800 }), ahoraMs: T0, evidencia })).toMatchObject({ permitido: false, fueraDeGeocerca: false });
    expect(evaluarCierreParada({ parada, posicion: null, ahoraMs: T0, evidencia }).permitido).toBe(false);
  });
  it("fuera de geocerca solo cierra con excepción de oficina para esa parada y con motivo", () => {
    const base = { parada, posicion: pos(900), ahoraMs: T0, evidencia };
    expect(evaluarCierreParada({ ...base, excepcion: { paradaId: "p1", motivo: "CEDIS sin señal, confirmado por teléfono", autorizadaPor: "ops" } })).toMatchObject({ permitido: true, porExcepcion: true });
    expect(evaluarCierreParada({ ...base, excepcion: { paradaId: "otra", motivo: "x", autorizadaPor: "ops" } }).permitido).toBe(false);
    expect(evaluarCierreParada({ ...base, excepcion: { paradaId: "p1", motivo: "", autorizadaPor: "ops" } }).permitido).toBe(false);
  });
  it("la excepción no perdona la falta de evidencia; una parada cerrada no se vuelve a cerrar", () => {
    expect(evaluarCierreParada({ parada, posicion: null, ahoraMs: T0, evidencia: { fotos: [], receptor: "X" }, excepcion: { paradaId: "p1", motivo: "m", autorizadaPor: "ops" } }).permitido).toBe(false);
    expect(evaluarCierreParada({ parada: { ...parada, estado: "Entregada" }, posicion: pos(10), ahoraMs: T0, evidencia }).motivo).toBe("Esta parada ya está cerrada");
  });
});

describe("check-in de jornada", () => {
  it("exige selfie, placas, fotos de placas y odómetro, kilometraje y combustible", () => {
    expect(validarCheckIn({}).errores).toEqual(["Selfie", "Placas de la unidad", "Foto de las placas", "Foto del odómetro", "Kilometraje", "Nivel de combustible"]);
    expect(validarCheckIn({ selfieRuta: "a", unidadPlaca: "ABC123", fotoPlacasRuta: "b", fotoOdometroRuta: "c", odometroKm: 120500, combustiblePct: 75 })).toEqual({ ok: true, errores: [] });
    expect(validarCheckIn({ selfieRuta: "a", unidadPlaca: "ABC123", fotoPlacasRuta: "b", fotoOdometroRuta: "c", odometroKm: -1, combustiblePct: 130 }).errores).toEqual(["Kilometraje", "Nivel de combustible"]);
  });
});
