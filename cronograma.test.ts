import { describe, it, expect } from "vitest";
import { armarCronograma, pactadaMs, semaforoParada } from "./cronograma.ts";

const dia = "2026-11-24", t = (hhmm: string) => Date.parse(`${dia}T${hhmm}:00-06:00`);

describe("cronograma en vivo", () => {
  it("hora pactada en hora de CDMX", () => {
    expect(pactadaMs(dia, "09:30")).toBe(t("09:30"));
    expect(pactadaMs(dia, "9:30")).toBeNull();
    expect(pactadaMs(dia, "")).toBeNull();
  });
  it("semáforo: a tiempo dentro de la tolerancia, tarde si llegó después, atrasada si ya pasó la hora y no llega", () => {
    expect(semaforoParada({ pactadaMs: t("10:00"), llegadaMs: t("10:10"), cerradaMs: null }, t("11:00"))).toEqual({ semaforo: "a_tiempo", retrasoMin: 10 });
    expect(semaforoParada({ pactadaMs: t("10:00"), llegadaMs: t("10:40"), cerradaMs: t("10:50") }, t("11:00"))).toEqual({ semaforo: "tarde", retrasoMin: 40 });
    expect(semaforoParada({ pactadaMs: t("10:00"), llegadaMs: null, cerradaMs: null }, t("10:20"))).toEqual({ semaforo: "atrasada", retrasoMin: 20 });
    expect(semaforoParada({ pactadaMs: t("10:00"), llegadaMs: null, cerradaMs: null }, t("10:10")).semaforo).toBe("pendiente");
    expect(semaforoParada({ estado: "Incidencia", pactadaMs: t("10:00"), llegadaMs: null, cerradaMs: t("10:05") }, t("11:00")).semaforo).toBe("incidencia");
    expect(semaforoParada({ pactadaMs: null, llegadaMs: null, cerradaMs: null }, t("23:00")).semaforo).toBe("pendiente");   // sin hora pactada no se puede ir tarde
  });
  it("arma filas, pone primero lo atrasado y cuenta lo del día", () => {
    const servicios = [
      { id: "a", folio: "SRV-1", empresa: "SCJ", choferId: "c1", choferNombre: "Israel", unidadPlaca: "NXE007C", estado: "En ruta", estadoTs: { "En ruta": t("08:00") } },
      { id: "b", folio: "SRV-2", empresa: "Canon", choferId: "c2", choferNombre: "Elías", estado: "Asignada" },
      { id: "c", folio: "SRV-3", empresa: "TACRE", choferId: "c3", choferNombre: "Enrique", estado: "Entregada", estadoTs: { "En ruta": t("07:30"), Entregada: t("12:00") } },
      { id: "x", folio: "SRV-9", estado: "Cancelada" },
    ];
    const paradas = {
      a: [{ id: "p01", orden: 1, nombre: "Bodega", tipo: "carga", estado: "Entregada", horaPactada: "08:00", cerradaMs: t("08:05") },
          { id: "p02", orden: 2, nombre: "Walmart", estado: "Pendiente", horaPactada: "09:00" },
          { id: "p03", orden: 3, nombre: "Quitada", estado: "Quitada", horaPactada: "09:30" }],
      b: [{ id: "p01", orden: 1, nombre: "Almacén", estado: "Pendiente", horaPactada: "15:00" }],
      c: [{ id: "p01", orden: 1, nombre: "Cliente", estado: "Entregada", horaPactada: "10:00", llegadaGpsMs: t("10:30"), cerradaMs: t("10:45") }],
    };
    const r = armarCronograma({ servicios, paradas, jornadas: [], dia, ahoraMs: t("09:40") });
    expect(r.filas.map(f => f.folio)).toEqual(["SRV-1", "SRV-2", "SRV-3"]);
    const a = r.filas[0]!;
    expect(a).toMatchObject({ activa: true, hechas: 1, total: 2, atrasadas: 1, inicioMs: t("08:00"), finMs: t("09:40") });
    expect(a.proxima?.nombre).toBe("Walmart");
    expect(r.kpis).toMatchObject({ rutas: 3, enRuta: 1, porSalir: 1, terminadas: 1, paradasHechas: 2, paradasTotal: 4, atrasadasAhora: 1, aTiempoPct: 50 });
    expect(r.siguientes.map(p => p.nombre)).toEqual(["Walmart", "Almacén"]);
    expect(r.desdeMs).toBe(t("06:00")); expect(r.hastaMs).toBe(t("21:00"));
  });
  it("el eje se amplía si algo pasa antes de las 6 o después de las 9 de la noche", () => {
    const r = armarCronograma({ servicios: [{ id: "a", folio: "F", estado: "Asignada" }], paradas: { a: [{ orden: 1, horaPactada: "05:20" }, { orden: 2, horaPactada: "22:10" }] }, jornadas: [], dia, ahoraMs: t("04:00") });
    expect(r.desdeMs).toBe(t("05:00")); expect(r.hastaMs).toBe(t("23:00"));
  });
  it("nunca lleva montos", () => {
    const r = armarCronograma({ servicios: [{ id: "a", folio: "F", estado: "Asignada", precio: 98765 }], paradas: {}, jornadas: [], dia, ahoraMs: t("09:00") });
    expect(JSON.stringify(r)).not.toContain("98765");
  });
});
