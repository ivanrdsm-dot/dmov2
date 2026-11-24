import { describe, it, expect } from "vitest";
import { periodoDe, claveEmpresa, mismaEmpresa, resumenFacturacion, antiguedadPendientes, conciliacionContable, estadoResultados, fechaReferencia } from "./finanzas.ts";

const F = [
  { id: "1", folio: "A1", empresa: "MARKETING & PROMOTION SAPI DE CV", status: "Pagada", total: 1000, mesOp: "Jun", anio: 2026, fechaEmision: "2026-06-20" },
  { id: "2", folio: "A2", empresa: "MARKETING & PROMOTION SAPI DE CV", status: "Pendiente", total: 500, mesOp: "Jun", anio: 2026, fechaEmision: "2026-06-22" },
  { id: "3", folio: "A3", empresa: "G-MAP OPERADORA SA DE CV", status: "Pendiente", total: 15080, mesOp: "Oct", anio: 2026, fechaEmision: "2026-11-04" },
  { id: "4", folio: "A4", empresa: "TACRE SA DE CV", status: "Cancelada", total: 9999, mesOp: "Jun", anio: 2026 },
  { id: "5", folio: "A5", empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV", status: "Pendiente", total: 57420, mesOp: "May", anio: 2026 },
  { id: "6", folio: "A6", empresa: "EL ABC DEL TURISMO INTERNACIONAL", status: "Pendiente", total: 3480, mesOp: "Oct", anio: 2026, fechaEmision: "2026-10-21" },
];

describe("finanzas del sistema", () => {
  it("lee el periodo y agrupa empresas aunque cambie la escritura", () => {
    expect(periodoDe({ mesOp: "Sep", anio: "2026" })).toEqual({ mes: 8, anio: 2026 });
    expect(periodoDe({ fechaEmision: "2026-03-05" })).toEqual({ mes: 2, anio: 2026 });
    expect(claveEmpresa("Compras Centrales y Admon SA de CV")).toBe(claveEmpresa("COMPRAS CENTRALES Y ADMINISTRACION SA DE CV"));
    expect(mismaEmpresa("Marketing & Promotion", "MARKETING & PROMOTION SAPI DE CV")).toBe(true);
    expect(mismaEmpresa("G-Map Operadora", "G-MAP OPERADORA SA DE CV")).toBe(true);
    expect(mismaEmpresa("TACRE", "Promotor On Demand")).toBe(false);
    expect(fechaReferencia({ mesOp: "May", anio: 2026 })).toBe("2026-05-31");
  });
  it("facturado, cobrado y pendiente por mes y cliente (sin canceladas)", () => {
    const r = resumenFacturacion(F, { anio: 2026 });
    expect(r.totales).toEqual({ facturado: 77480, cobrado: 1000, pendiente: 76480 });
    expect(r.meses[5]).toMatchObject({ mes: "Jun", facturado: 1500, cobrado: 1000, pendiente: 500 });
    expect(r.clientes[0]).toMatchObject({ empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV", pendiente: 57420 });
    expect(r.nFacturas).toBe(5);
  });
  it("antigüedad de lo pendiente", () => {
    const a = antiguedadPendientes(F, "2026-11-24");
    expect(a.lista[0]).toMatchObject({ folio: "A5", tramo: "Más de 90 días" });
    expect(a.tramos[0]).toMatchObject({ n: 1, total: 15080 });   // A3: 20 días
    expect(a.tramos[1]).toMatchObject({ n: 1, total: 3480 });    // A6: 34 días
  });
  it("concilia contra la contabilidad al corte, sin marcar nada", () => {
    const c = conciliacionContable(F, { "Marketing & Promotion": 122832.4, "Promociones América Latina": 57420, "G-Map Operadora": 30160, "TACRE": 0 }, "2026-09-30");
    const mp = c.filas.find(x => x.cliente === "Marketing & Promotion");
    expect(mp).toMatchObject({ sistema: 500, estado: "La contabilidad tiene más" });
    expect(c.filas.find(x => x.cliente === "Promociones América Latina").estado).toBe("Cuadra");
    const gm = c.filas.find(x => x.cliente === "G-Map Operadora");
    expect(gm.sistema).toBe(0); expect(gm.posteriores).toBe(15080);   // la de octubre no cuenta al corte
    expect(c.clientesSoloEnSistema).toEqual([{ empresa: "EL ABC DEL TURISMO INTERNACIONAL", total: 3480 }]);
  });
  it("estado de resultados con porcentajes (cifras del despacho ene–sep 2026)", () => {
    const e = estadoResultados({ ventas: 1818006.75, costoServicios: 3700269.22, gastosAdministracion: 247695.12, otrosProductos: 9995.36, costoFinanciero: 145544 });
    expect(Math.round(e.neta * 100) / 100).toBe(-2265506.23);
    expect(Math.round(e.bruta * 100) / 100).toBe(-1882262.47);
    expect(e.renglones.at(-1).pct).toBe(-124.6);
  });
});
