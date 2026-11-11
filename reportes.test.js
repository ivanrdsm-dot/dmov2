import { describe, it, expect } from "vitest";
import { periodoDe, diaLocal, reporteOperacion, aCsv, csvServicios, csvCotizaciones } from "./reportes.ts";

const ms = iso => Date.parse(iso);                       // ISO con zona explícita
const AHORA = ms("2026-11-10T18:00:00-06:00");           // martes
const P30 = periodoDe("30d", AHORA);

describe("periodos en hora local de la operación", () => {
  it("el día local no se recorre por la zona horaria", () => {
    expect(diaLocal(ms("2026-11-10T23:30:00-06:00"))).toBe("2026-11-10");
    expect(diaLocal(ms("2026-11-11T00:10:00-06:00"))).toBe("2026-11-11");
  });
  it("7 y 30 días incluyen hoy; mes y año arrancan el día 1 a medianoche local", () => {
    expect(diaLocal(periodoDe("7d", AHORA).desdeMs)).toBe("2026-11-04");
    expect(diaLocal(P30.desdeMs)).toBe("2026-10-12");
    expect(periodoDe("mes", AHORA).desdeMs).toBe(ms("2026-11-01T00:00:00-06:00"));
    expect(periodoDe("anio", AHORA).desdeMs).toBe(ms("2026-01-01T00:00:00-06:00"));
    expect(periodoDe("otro", AHORA).clave).toBe("30d");
  });
});

describe("reporte sin datos", () => {
  it("no inventa: ceros en conteos y null en lo que no se puede medir", () => {
    const r = reporteOperacion({}, P30, AHORA);
    expect(r.solicitudes).toMatchObject({ recibidas: 0, medianaMinRespuesta: null, pctDentroDeMeta: null, pctConversion: null });
    expect(r.cotizaciones).toMatchObject({ emitidas: 0, tasaCierrePct: null, medianaMinSolicitudACotizacion: null, montoAceptado: 0 });
    expect(r.servicios).toMatchObject({ creados: 0, pctEnFecha: null, montoAprobado: 0 });
    expect(r.actividad).toHaveLength(30);
    expect(r.embudo.map(e => e.n)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("reporte con operación", () => {
  const lunes = h => ms(`2026-11-09T${h}:00-06:00`);
  const solicitudes = [
    { folio: "SOL-1", canal: "Correo", estado: "Convertida", recibidaEn: lunes("10:00"), primeraRespuestaEn: lunes("10:10"), cotizacionFolio: "COT-1", servicioFolio: "SRV-1" },
    { folio: "SOL-2", canal: "Correo", estado: "Respondida", recibidaEn: lunes("11:00"), primeraRespuestaEn: lunes("12:00"), cotizacionFolio: "COT-2" },
    { folio: "SOL-3", canal: "WhatsApp", estado: "Nueva", recibidaEn: lunes("13:00") },
    { folio: "SOL-4", canal: "Correo", estado: "Descartada", recibidaEn: lunes("14:00") },
    { folio: "SOL-0", canal: "Correo", estado: "Convertida", recibidaEn: ms("2026-09-01T10:00:00-06:00"), primeraRespuestaEn: ms("2026-09-01T10:05:00-06:00") },   // fuera del periodo
  ];
  const cotizaciones = [
    { folio: "COT-1", estado: "Aceptada", creadoEn: lunes("10:30"), solicitudRecibidaEn: lunes("10:00"), precioPropuesto: 3200, precioAprobado: 3500, estadoTs: { Aprobada: lunes("10:50"), Enviada: lunes("11:00"), Aceptada: lunes("12:00") } },
    { folio: "COT-2", estado: "Rechazada", creadoEn: lunes("11:20"), solicitudRecibidaEn: lunes("11:00"), precioPropuesto: 5000, precioAprobado: 5000, estadoTs: { Aprobada: lunes("11:30"), Enviada: lunes("11:40") } },
    { folio: "COT-3", estado: "Propuesta", creadoEn: lunes("15:00"), precioPropuesto: 1000 },
  ];
  const servicios = [
    { folio: "SRV-1", estado: "Entregada", creadoEn: lunes("12:10"), empresa: "Cliente A", precio: 3500, fechaServicio: "2026-11-10", unidadPlaca: "AAA-1", asignacionTipo: "Flota propia", estadoTs: { Entregada: ms("2026-11-10T15:00:00-06:00") } },
    { folio: "SRV-2", estado: "Entregada", creadoEn: lunes("12:20"), empresa: "Cliente A", precio: 2000, fechaServicio: "2026-11-09", unidadPlaca: "AAA-1", asignacionTipo: "Flota propia", estadoTs: { Entregada: ms("2026-11-10T09:00:00-06:00") } },
    { folio: "SRV-3", estado: "Solicitud", creadoEn: lunes("16:00"), empresa: "Cliente B" },
    { folio: "SRV-4", estado: "Cancelada", creadoEn: lunes("16:30"), empresa: "Cliente B", precio: 9999 },
  ];
  const r = reporteOperacion({ solicitudes, cotizaciones, servicios }, P30, AHORA);

  it("solicitudes: canal, respuesta dentro de meta y conversión sin contar las descartadas", () => {
    expect(r.solicitudes).toMatchObject({ recibidas: 4, respondidas: 2, sinResponder: 1, descartadas: 1, medianaMinRespuesta: 35, pctDentroDeMeta: 50, cotizadas: 2, convertidas: 1, pctConversion: 33 });
    expect(r.solicitudes.porCanal).toEqual([{ nombre: "Correo", n: 3 }, { nombre: "WhatsApp", n: 1 }]);
  });
  it("cotizaciones: cierre, montos y tiempos", () => {
    expect(r.cotizaciones).toMatchObject({ emitidas: 3, aprobadas: 2, enviadas: 2, aceptadas: 1, rechazadas: 1, tasaCierrePct: 50,
      montoPropuesto: 9200, montoAceptado: 3500, medianaMinSolicitudACotizacion: 25, medianaMinAprobacion: 15 });
  });
  it("servicios: los cancelados no suman dinero; en fecha = entregado el día pactado o antes", () => {
    expect(r.servicios).toMatchObject({ creados: 4, cancelados: 1, entregados: 2, entregadosEnFecha: 1, pctEnFecha: 50, montoAprobado: 5500, sinPrecioAprobado: 1 });
    expect(r.servicios.porCliente).toEqual([{ nombre: "Cliente A", n: 2, monto: 5500 }, { nombre: "Cliente B", n: 1, monto: 0 }]);
    expect(r.servicios.porUnidad).toEqual([{ nombre: "AAA-1", n: 2 }]);
  });
  it("embudo y actividad por día", () => {
    expect(r.embudo.map(e => e.n)).toEqual([3, 3, 1, 3, 2]);
    expect(r.actividad.find(d => d.dia === "2026-11-09")).toEqual({ dia: "2026-11-09", solicitudes: 4, cotizaciones: 3, servicios: 4 });
    expect(r.actividad.reduce((a, d) => a + d.solicitudes, 0)).toBe(4);
  });
  it("margen: solo servicios con precio y costos; los cancelados y sin costos no cuentan", () => {
    const conCostos = [{ ...servicios[0], costoTotal: 2100, costosN: 3 }, { ...servicios[1], costoTotal: 2500, costosN: 1 }, servicios[2], { ...servicios[3], costoTotal: 50, costosN: 1 }];
    const m = reporteOperacion({ servicios: conCostos }, P30, AHORA).margen;
    expect(m).toMatchObject({ medidos: 2, sinCostos: 0, conPerdida: 1, ingreso: 5500, costo: 4600, margen: 900, margenPct: 16.4 });
    expect(m.porCliente).toEqual([{ nombre: "Cliente A", n: 2, ingreso: 5500, costo: 4600, margen: 900, margenPct: 16.4 }]);
    expect(m.porUnidad).toEqual([{ nombre: "AAA-1", n: 2, ingreso: 5500, costo: 4600, margen: 900, margenPct: 16.4 }]);
    expect(reporteOperacion({ servicios }, P30, AHORA).margen).toMatchObject({ medidos: 0, sinCostos: 2, margenPct: null });
    expect(csvServicios(conCostos, P30, { conMargen: true }).split("\r\n")[1]).toContain(",2100,1400,40");
    expect(csvServicios(conCostos, P30)).not.toContain("Margen");
  });
  it("exporta CSV del periodo con acentos y sin fórmulas ejecutables", () => {
    expect(csvServicios(servicios, P30).split("\r\n")).toHaveLength(5);
    expect(csvCotizaciones(cotizaciones, P30)).toContain("COT-1,Aceptada,2026-11-09 10:30");
    const csv = aCsv(["Nombre", "Nota"], [["=HYPERLINK(\"x\")", "con, coma"], ["Ñandú", -5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\",\"con, coma\"");
    expect(csv).toContain("Ñandú,-5");
  });
});
