import { describe, it, expect } from "vitest";
import { fueraDeCdmx, rutaCoherente, llegada, dudaKilometros, kmDePuntos, kmDesdeZocalo } from "./functions/lib/jornadaReglas.js";
import { avisoDeAlerta } from "./functions/lib/avisosOficina.js";
import { fechaMasDias } from "./functions/lib/rutas.js";

const ms = iso => Date.parse(iso);
const IZTAPALAPA = { lat: 19.3574, lng: -99.0732 }, ECATEPEC = { lat: 19.6018, lng: -99.0507 }, QUERETARO = { lat: 20.5888, lng: -100.3899 }, TOLUCA = { lat: 19.2826, lng: -99.6557 };

describe("zona metropolitana", () => {
  it("CDMX y conurbados están dentro; Querétaro y Toluca fuera", () => {
    expect(fueraDeCdmx(IZTAPALAPA)).toBe(false);
    expect(fueraDeCdmx(ECATEPEC)).toBe(false);
    expect(fueraDeCdmx(QUERETARO)).toBe(true);
    expect(fueraDeCdmx(TOLUCA)).toBe(true);
    expect(kmDesdeZocalo(QUERETARO)).toBeGreaterThan(150);
  });
  it("una ruta con paradas cerca explica que esté lejos; sin ruta, no", () => {
    expect(rutaCoherente(QUERETARO, [{ lat: 20.60, lng: -100.40 }])).toBe(true);
    expect(rutaCoherente(QUERETARO, [IZTAPALAPA])).toBe(false);
    expect(rutaCoherente(QUERETARO, [])).toBe(false);
  });
});

describe("llegada", () => {
  it("7:05 a tiempo; 7:23 tarde 23 min; foránea a las 9", () => {
    expect(llegada(ms("2026-11-25T07:05:00-06:00"))).toEqual({ minutosDespues: 5, tarde: false, tardeMin: 0 });
    expect(llegada(ms("2026-11-25T07:23:00-06:00"))).toEqual({ minutosDespues: 23, tarde: true, tardeMin: 23 });
    expect(llegada(ms("2026-11-25T06:40:00-06:00")).tarde).toBe(false);
    expect(llegada(ms("2026-11-25T09:05:00-06:00"), "09:00").tarde).toBe(false);
  });
});

describe("kilómetros tablero vs GPS", () => {
  it("avisa solo si la diferencia es grande", () => {
    expect(dudaKilometros(80, 86)).toBe("");
    expect(dudaKilometros(30, 120)).toContain("120 km");
    expect(dudaKilometros(10, 0)).toBe("");
  });
  it("suma la distancia y descarta saltos imposibles", () => {
    const t = ms("2026-11-25T08:00:00-06:00");
    const puntos = [{ lat: 19.40, lng: -99.15, tMs: t }, { lat: 19.41, lng: -99.15, tMs: t + 120000 }, { lat: 25.0, lng: -100.0, tMs: t + 130000 }, { lat: 19.42, lng: -99.15, tMs: t + 240000 }];
    const km = kmDePuntos(puntos);
    expect(km).toBeGreaterThan(1.5); expect(km).toBeLessThan(3);
  });
});

describe("avisos al celular", () => {
  it("check-in informativo llega aunque nazca cerrado y abre el mapa", () => {
    const n = avisoDeAlerta({ id: "x", type: "checkin_tarde", informativa: true, atendida: true, choferNombre: "Enrique Vite", message: "Enrique Vite · 7:23 · 23 min tarde · Iztapalapa", lat: 19.35, lng: -99.07 });
    expect(n.title).toBe("⏰ Check-in TARDE");
    expect(n.url).toBe("https://www.google.com/maps?q=19.35,-99.07");
    expect(avisoDeAlerta({ id: "y", type: "checkin_registrado", atendida: true, message: "x" })).toBe(null);   // sin marca informativa no se manda
    expect(avisoDeAlerta({ id: "z", type: "fuera_de_cdmx", message: "a 210 km", choferNombre: "Israel" }).title).toContain("Fuera de CDMX");
  });
});

describe("fechas hacia atrás", () => {
  it("resta días", () => { expect(fechaMasDias("2026-11-02", -3)).toBe("2026-10-30"); });
});

import { llegadaPorGps } from "./functions/lib/jornadaReglas.js";
describe("llegada a la parada por GPS", () => {
  const P = { lat: 19.40, lng: -99.15 }, t = Date.parse("2026-11-25T10:00:00-06:00"), M = 60000;
  const lejos = (m) => ({ lat: 19.42, lng: -99.15, tMs: t + m * M }), cerca = (m) => ({ lat: 19.4003, lng: -99.15, tMs: t + m * M });
  it("toma el inicio de la última estancia dentro del radio", () => {
    expect(llegadaPorGps([lejos(0), cerca(5), lejos(10), lejos(20), cerca(30), cerca(35), cerca(40)], P)).toBe(t + 30 * M);
  });
  it("si nunca entró, no hay llegada", () => { expect(llegadaPorGps([lejos(0), lejos(5)], P)).toBe(null); });
  it("ignora puntos después del cierre", () => { expect(llegadaPorGps([lejos(0), cerca(10), cerca(50)], P, { hastaMs: t + 20 * M })).toBe(t + 10 * M); });
});

import { tiempoJornada } from "./functions/lib/jornadaReglas.js";
describe("tiempo de la jornada contra su horario (7:00–17:00)", () => {
  const d = "2026-11-26", t = h => Date.parse(`${d}T${h}:00-06:00`);
  it("llegó antes y se quedó después: todo cuenta como extra", () => {
    expect(tiempoJornada({ checkInMs: t("05:58"), checkOutMs: t("18:30") })).toEqual({ tardeMin: 0, antesDeEntradaMin: 62, salioAntesMin: 0, despuesDeSalidaMin: 90, extraMin: 152, horasTrabajadas: 12.5 });
  });
  it("llegó tarde y salió antes", () => {
    expect(tiempoJornada({ checkInMs: t("08:48"), checkOutMs: t("16:00") })).toMatchObject({ tardeMin: 108, antesDeEntradaMin: 0, salioAntesMin: 60, extraMin: 0, horasTrabajadas: 7.2 });
  });
  it("dentro de la tolerancia no es retardo; sin salida no hay horas", () => {
    expect(tiempoJornada({ checkInMs: t("07:09") })).toMatchObject({ tardeMin: 0, horasTrabajadas: null, extraMin: 0 });
  });
  it("si entró después de su hora de salida, el extra cuenta desde que entró", () => {
    expect(tiempoJornada({ checkInMs: t("18:00"), checkOutMs: t("20:00") })).toMatchObject({ despuesDeSalidaMin: 120, extraMin: 120 });
  });
});
