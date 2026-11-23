import { describe, it, expect } from "vitest";
import { choferesDeTexto, conciliarViaje, viajeAServicio, resumenHistorial, estadoCobro, mesDe } from "./historialRutas.ts";

const CHOFERES = [{ id: "e", nombre: "Jose Elias Muñoz Diaz" }, { id: "i", nombre: "ISRAEL ANAYA" }, { id: "d", nombre: "Jose Eder Mauricio Jimenez" }];
const CUENTAS = [{ id: "scj", nombre: "SCJ" }, { id: "henry_walmart", nombre: "Henry / Walmart" }, { id: "map_varios", nombre: "MAP / Sofía Trueba" }];
const FACTURAS = [
  { id: "f1", folio: "FAC-1", clienteId: "scj", mesOp: "Jun", anio: 2026, total: 4350, status: "Pendiente" },
  { id: "f2", folio: "FAC-2", clienteId: "scj", mesOp: "Jun", anio: 2026, total: 100, status: "Cancelada" },
];
const ctx = { choferes: CHOFERES, cuentas: CUENTAS, facturas: FACTURAS, fuente: "Bitácora de prueba" };

describe("historial de rutas", () => {
  it("reconoce a los choferes por su nombre y deja los que no están dados de alta", () => {
    expect(choferesDeTexto("ELIAS/ISRAEL", CHOFERES)).toEqual({ ids: ["e", "i"], nombres: ["Jose Elias Muñoz Diaz", "ISRAEL ANAYA"], sinRegistro: [] });
    expect(choferesDeTexto("ELIAS/ENRIQUE", CHOFERES).sinRegistro).toEqual(["ENRIQUE"]);
    expect(choferesDeTexto("—", CHOFERES).nombres).toEqual([]);
  });
  it("concilia con la factura del mismo cliente y mes, sin canceladas", () => {
    expect(conciliarViaje("scj", "2026-06-03", FACTURAS)).toMatchObject({ estado: "Factura del mes por revisar", facturas: [{ folio: "FAC-1" }] });
    expect(conciliarViaje("scj", "2026-05-30", FACTURAS).estado).toBe("Sin factura");
    expect(conciliarViaje("henry_walmart", "2026-06-03", FACTURAS).estado).toBe("Sin factura");
  });
  it("convierte un renglón sin inventar: lo que falta queda pendiente y el texto se guarda tal cual", () => {
    const { id, datos } = viajeAServicio({ fecha: "2026-05-27", chofer: "JONATAN", unidad: "—", clienteRaw: "HENRY", servicio: "ENTREGA DE CANJES" }, 7, ctx);
    expect(id).toBe("bit-2026-0007"); expect(datos.folio).toBe("BIT-2026-0007");
    expect(datos).toMatchObject({ historico: true, estado: "Entregada", empresa: "Henry / Walmart", choferId: "", choferNombre: "JONATAN", unidadPlaca: "", descripcion: "ENTREGA DE CANJES" });
    expect(datos.pendientes).toEqual(expect.arrayContaining(["Precio", "Placas de la unidad", "Dar de alta chofer: JONATAN"]));
    expect(datos).not.toHaveProperty("precio");
    expect(datos.conciliacion.estado).toBe("Sin factura");
  });
  it("cancelados, incidencias y clientes por confirmar", () => {
    expect(viajeAServicio({ fecha: "2026-05-18", chofer: "ISRAEL", unidad: "KV1034A", clienteRaw: "SCJ", servicio: "A 5 MINUTOS SE CANCELA EL SERVICIO" }, 1, ctx).datos).toMatchObject({ estado: "Cancelada", choferId: "i" });
    expect(viajeAServicio({ fecha: "2026-05-10", chofer: "ELIAS", unidad: "X", clienteRaw: "SCJ", servicio: "SE RECOGEN 2 ROBOTS Y NO LOS ENTREGAN POR QUE NO HABIA PERMISO" }, 2, ctx).datos.conIncidencia).toBe(true);
    expect(viajeAServicio({ fecha: "2026-06-05", chofer: "ELIAS", unidad: "X", clienteRaw: "IVAN", servicio: "x" }, 3, ctx).datos.pendientes).toContain("Confirmar cliente/plan (IVAN)");
    expect(() => viajeAServicio({ fecha: "mayo", servicio: "x" }, 4, ctx)).toThrow(/fecha/);
  });
  it("el reporte cuenta viajes por chofer (los compartidos a cada uno) y lo que falta por facturar", () => {
    const s = [
      { estado: "Entregada", fechaServicio: "2026-05-05", empresa: "SCJ", choferNombre: "ELIAS / ISRAEL", unidadPlaca: "MZS950C", conciliacion: { estado: "Sin factura" } },
      { estado: "Entregada", fechaServicio: "2026-05-06", empresa: "SCJ", choferNombre: "ELIAS", unidadPlaca: "NXE007C", facturaFolio: "FAC-9", conIncidencia: true },
      { estado: "Cancelada", fechaServicio: "2026-05-07", empresa: "SCJ", choferNombre: "ELIAS" },
      { estado: "Solicitud", fechaServicio: "2026-05-07", empresa: "SCJ" },
      { estado: "Entregada", fechaServicio: "2026-04-30", empresa: "SCJ", choferNombre: "", conciliacion: { estado: "Sin factura" } },
    ];
    const r = resumenHistorial(s);
    expect(r.viajes).toBe(3); expect(r.sinFactura).toBe(2); expect(r.facturados).toBe(1); expect(r.incidencias).toBe(1);
    expect(r.choferes[0]).toMatchObject({ chofer: "ELIAS", viajes: 2, dias: 2, unidades: ["MZS950C", "NXE007C"], incidencias: 1 });
    expect(r.clientesMes[0]).toEqual({ cliente: "SCJ", mes: "Mayo 2026", orden: "2026-05", viajes: 2, sinFactura: 1, facturas: ["FAC-9"] });
    expect(r.choferes.find(c => c.chofer === "Sin chofer anotado").viajes).toBe(1);
    expect(estadoCobro({ conciliacion: { estado: "Factura del mes por revisar" } })).toBe("Por revisar");
    expect(mesDe("2026-06-01")).toBe("Junio 2026");
  });
});
