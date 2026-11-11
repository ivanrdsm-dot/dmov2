import { describe, it, expect } from "vitest";
import { facturaEmitida, facturaVencida, facturaSinFechaVenc, diasDeAtraso, resumenCobranza } from "./cobranza.ts";

const HOY = Date.parse("2026-11-11T12:00:00-06:00");
describe("una sola regla de cobranza", () => {
  it("emitida = no cancelada, no solo solicitada, con monto", () => {
    expect(facturaEmitida({ status: "Pendiente", total: 100 })).toBe(true);
    for(const st of ["Cancelada", "Solicitada a Katia", "Solicitud interna"]) expect(facturaEmitida({ status: st, total: 100 })).toBe(false);
    expect(facturaEmitida({ status: "Pendiente", total: 0 })).toBe(false);
    expect(facturaEmitida({ status: "Pendiente", total: 100, tipoDocumento: "solicitud_interna" })).toBe(false);
  });
  it("vencida por fecha (aunque nadie le cambie el estado); pagada nunca", () => {
    expect(facturaVencida({ status: "Pendiente", total: 100, fechaVenc: "2026-11-10" }, HOY)).toBe(true);
    expect(facturaVencida({ status: "Pendiente", total: 100, fechaVenc: "2026-11-11" }, HOY)).toBe(false);   // vence hoy: aún no
    expect(facturaVencida({ status: "Pagada", total: 100, fechaVenc: "2026-01-01" }, HOY)).toBe(false);
    expect(facturaVencida({ status: "Vencida", total: 100 }, HOY)).toBe(true);
    expect(facturaVencida({ status: "Pendiente", total: 100 }, HOY)).toBe(false);
    expect(facturaSinFechaVenc({ status: "Pendiente", total: 100 })).toBe(true);
    expect(diasDeAtraso({ status: "Pendiente", total: 100, fechaVenc: "2026-10-12" }, HOY)).toBe(30);
  });
  it("resumen: por cobrar, vencido y sin fecha", () => {
    const r = resumenCobranza([
      { status: "Pendiente", total: 1000, fechaVenc: "2026-10-01" },
      { status: "Pendiente", total: 500 },
      { status: "Pendiente", total: 250, fechaVenc: "2026-12-30" },
      { status: "Pagada", total: 9999 },
      { status: "Cancelada", total: 7777 },
    ], HOY);
    expect(r).toEqual({ porCobrar: 1750, vencido: 1000, sinFecha: 500, nPorCobrar: 3, nVencidas: 1, nSinFecha: 1 });
  });
});
