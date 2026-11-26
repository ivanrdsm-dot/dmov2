import { describe, it, expect } from "vitest";
import { reporteDia, textoReporte } from "./reporteDia.ts";

/* Datos con la forma real del 25-nov-2026 (nombres de prueba). */
const dia = "2026-11-25", t = (hhmm: string) => ({ toMillis: () => Date.parse(`${dia}T${hhmm}:00-06:00`) });
const choferes = [{ id: "elias", nombre: "Elías M" }, { id: "israel", nombre: "Israel A" }, { id: "enrique", nombre: "Enrique V" }, { id: "victor", nombre: "Víctor H" },
  { id: "prueba", nombre: "PRUEBA", prueba: true }, { id: "viejo", nombre: "Ivan", baja: true }];
const jornadas = [
  { choferId: "elias", checkInEn: t("09:06"), llegoTarde: true, tardeMin: 126, lugarEntrada: "Donizetti 226, Vallejo", unidadPlaca: "LH23826", odometroKm: 190942 },
  { choferId: "israel", checkInEn: t("08:52"), llegoTarde: true, tardeMin: 112, lugarEntrada: "Bizet, Vallejo", unidadPlaca: "MZ950C", odometroKm: 17341 },
  { choferId: "enrique", checkInEn: t("08:48"), llegoTarde: true, tardeMin: 108, lugarEntrada: "Donizetti 226, Vallejo", unidadPlaca: "KV1043A", odometroKm: 15479,
    checkOutEn: t("17:23"), kmRecorridos: 33, kmGps: 0.1 },
  { choferId: "victor", checkInEn: t("08:48"), llegoTarde: true, tardeMin: 108, lugarEntrada: "Donizetti 226, Vallejo", unidadPlaca: "LH23826", odometroKm: 9 },
];
const oficina = [{ uid: "ilse", checkInEn: t("08:47"), llegoTarde: true, tardeMin: 107, lugarEntrada: "Leopoldo Auer 14" }];
const usuariosOficina = [{ id: "ilse", nombre: "Ilse", rol: "operaciones", activo: true }, { id: "yo", nombre: "Iván", rol: "admin", activo: true }, { id: "p", nombre: "Prueba", rol: "operaciones", prueba: true }];
const servicios = [{ id: "s4", folio: "SRV-2026-0004", empresa: "TACRE", fechaServicio: "2026-11-27", estado: "En ruta", choferId: "elias", segundoChoferId: "victor", estadoTs: { "En ruta": t("08:49") } }];
const alertas = [
  { type: "sin_ubicacion", choferId: "israel", choferNombre: "Israel A" }, { type: "sin_ubicacion", choferId: "enrique", choferNombre: "Enrique V" },
  { type: "movimiento_sin_ruta", choferId: "israel", choferNombre: "Israel A", msg: "Israel A está a 10.1 km de donde hizo su check-in y no tiene ninguna ruta asignada." },
  ...[1, 2, 3].map(() => ({ type: "cierre_fuera_de_punto", choferId: "victor", choferNombre: "Víctor H", msg: 'Intentó cerrar "Lago de Guadalupe Km 27.5" a 14961 m del punto' })),
  { type: "velocidad_imposible", choferId: "victor" },
];
const r = reporteDia({ dia, ahoraMs: Date.parse(`${dia}T17:57:00-06:00`), choferes, jornadas, oficina, usuariosOficina, servicios, alertas,
  placasFlota: ["LH23826", "MZS950C", "KV1043A", "NXE007C"] });
const titulos = r.hallazgos.map(h => h.titulo);

describe("reporte del día", () => {
  it("cuenta a todos los que trabajan (sin perfiles de prueba, bajas ni director)", () => {
    expect(r.filas.map(f => f.nombre)).toEqual(["Enrique V", "Víctor H", "Israel A", "Elías M", "Ilse"]);
    expect(r.resumen).toMatchObject({ personas: 5, vinieron: 5, faltaron: 0, tarde: 5, sinSalida: 4 });
  });
  it("saca lo que faltó con los datos del día", () => {
    expect(titulos).toContain("5 de 5 llegaron tarde");
    expect(titulos).toContain("4 sin registrar su salida");
    expect(titulos).toContain("Celulares sin mandar ubicación");
    expect(titulos).toContain("Kilómetros sin GPS");
    expect(titulos).toContain("Odómetros que no cuadran en LH23826");
    expect(titulos).toContain("Placa que no está en Flota");
    expect(titulos).toContain("Ruta SRV-2026-0004 iniciada fuera de su fecha");
    expect(titulos).toContain("Intentó cerrar una entrega lejos del punto");
    expect(titulos).toContain("Se movió sin ruta");
    expect(titulos).toContain("2 choferes sin ruta en el sistema");
    expect(r.hallazgos.find(h => h.titulo === "Intentó cerrar una entrega lejos del punto")?.detalle).toMatch(/^3 intentos/);
    expect(r.hallazgos[0]!.nivel).toBe("grave");            // lo grave primero
    expect(r.hallazgos.at(-1)!.nivel).toBe("info");
  });
  it("quien no hizo check-in sale como falta", () => {
    const x = reporteDia({ dia, ahoraMs: Date.parse(`${dia}T10:00:00-06:00`), choferes, jornadas: jornadas.slice(1), oficina: [], usuariosOficina, servicios: [], alertas: [] });
    expect(x.resumen.faltaron).toBe(2);
    expect(x.hallazgos[0]).toMatchObject({ nivel: "grave", titulo: "2 sin check-in", detalle: "Elías M, Ilse" });
    expect(x.hallazgos.map(h => h.titulo)).not.toContain("4 sin registrar su salida");     // antes de la hora de salida no se reclama
  });
  it("texto para WhatsApp sin montos", () => {
    const tx = textoReporte(dia, r);
    expect(tx).toContain("Asistencia: 5/5 · tarde: 5 · sin salida: 4");
    expect(tx).toContain("⏰ Elías M: 9:06 a.m. (2 h 6 min tarde) → sin salida");
    expect(tx).toContain("Qué faltó:");
    expect(tx).not.toMatch(/\$/);
  });
});

describe("retardo y tiempo extra", () => {
  it("se mide quién llegó antes y quién se quedó; quién salió antes; y quien no registró salida no cuenta horas", () => {
    const x = reporteDia({ dia, ahoraMs: Date.parse(`${dia}T20:00:00-06:00`), choferes: choferes.slice(0, 3), oficina: [], usuariosOficina: [], servicios: [], alertas: [],
      jornadas: [
        { choferId: "elias", checkInEn: t("06:40"), checkOutEn: t("18:00"), extraMin: 80 },
        { choferId: "israel", checkInEn: t("07:05"), checkOutEn: t("16:30"), salioAntesMin: 30 },
        { choferId: "enrique", checkInEn: t("07:00"), sinSalidaRegistrada: true },
      ] });
    const tt = x.hallazgos.map(h => h.titulo);
    expect(tt).toContain("Tiempo extra: 1 h 20 min en total");
    expect(tt).toContain("1 salió antes de su hora");
    expect(x.hallazgos.find(h => h.titulo === "1 sin registrar su salida")?.detalle).toContain("no cuenta horas");
    expect(textoReporte(dia, x)).toContain("+1 h 20 min extra");
  });
});

describe("app nativa o página", () => {
  it("avisa quién todavía hace check-in desde la página", () => {
    const x = reporteDia({ dia, ahoraMs: Date.parse(`${dia}T10:00:00-06:00`), choferes: choferes.slice(0, 2), oficina: [], usuariosOficina: [], servicios: [], alertas: [],
      jornadas: [{ choferId: "elias", checkInEn: t("07:00"), appVersion: "1.1.0" }, { choferId: "israel", checkInEn: t("07:00") }] });
    expect(x.filas.find(f => f.id === "elias")?.app).toBe("1.1.0");
    expect(x.hallazgos.find(h => h.titulo === "1 chofer sin la app")?.detalle).toContain("Israel A");
  });
});

describe("ubicación de la oficina durante la jornada", () => {
  it("avisa si se alejó más de 1 km de su entrada; si no hubo lecturas, lo dice", () => {
    const base = { dia, ahoraMs: Date.parse(`${dia}T12:00:00-06:00`), choferes: [], jornadas: [], servicios: [], alertas: [], usuariosOficina: [{ id: "ilse", nombre: "Ilse", rol: "operaciones" }] };
    const lejos = reporteDia({ ...base, oficina: [{ uid: "ilse", checkInEn: t("06:50"), puntosGps: 20, maxDistEntradaM: 3400 }] });
    expect(lejos.hallazgos.find(h => h.quien === "Ilse")).toMatchObject({ nivel: "revisar", titulo: "Se alejó de donde marcó su entrada", detalle: "hasta 3.4 km durante su jornada" });
    const sin = reporteDia({ ...base, oficina: [{ uid: "ilse", checkInEn: t("06:50") }] });
    expect(sin.hallazgos.find(h => h.quien === "Ilse")?.titulo).toBe("Sin lecturas de ubicación en el día");
  });
});
