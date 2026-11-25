import { describe, it, expect } from "vitest";
import { etapasServicio, enQueVa } from "./seguimientoServicio.ts";

const estado = (s: any, clave: string) => etapasServicio(s).find(e => e.clave === clave)!;

describe("seguimiento de un servicio", () => {
  it("recién registrado: lo que toca es asignar la ruta", () => {
    const s = { estado: "Solicitud", canal: "Correo", recibidaEn: "2026-11-24T09:00" };
    expect(estado(s, "pedido").estado).toBe("hecho");
    expect(estado(s, "ruta").estado).toBe("actual");
    expect(estado(s, "cotizacion").detalle).toContain("Se crea sola");
    expect(enQueVa(s)).toContain("Ruta asignada");
  });
  it("ruta asignada con cotización por aprobar: lo que toca es la cotización y dice cuántos datos faltan", () => {
    const s = { estado: "Asignada", rutaArmadaEn: 1, choferNombre: "Elías", unidadPlaca: "NXE007C", cotizacionFolio: "COT-2026-0002", cotizacionEstado: "Propuesta", cotizacionPendientes: 1 };
    expect(estado(s, "ruta").estado).toBe("hecho");
    const c = estado(s, "cotizacion");
    expect(c.estado).toBe("actual");
    expect(c.detalle).toBe("COT-2026-0002 · por aprobar del director · 1 dato(s) por completar");
  });
  it("cotización aceptada y servicio entregado: lo que toca es facturar", () => {
    const s = { estado: "Entregada", rutaArmadaEn: 1, cotizacionFolio: "COT-2026-0002", cotizacionEstado: "Aceptada", estadoTs: { "En ruta": 1, Entregada: 2 } };
    expect(estado(s, "cotizacion").estado).toBe("hecho");
    expect(estado(s, "entregada").estado).toBe("hecho");
    expect(estado(s, "facturada").estado).toBe("actual");
  });
  it("cotización rechazada se marca como problema", () => {
    expect(estado({ estado: "Asignada", rutaArmadaEn: 1, cotizacionFolio: "COT-1", cotizacionEstado: "Rechazada" }, "cotizacion").estado).toBe("problema");
  });
  it("servicio cancelado: todo lo que faltaba queda como problema con el motivo", () => {
    const e = etapasServicio({ estado: "Cancelada", motivoCancelacion: "lo pidió el cliente" });
    expect(e.filter(x => x.estado === "problema").length).toBe(e.length - 1);
    expect(e.at(-1)!.detalle).toContain("lo pidió el cliente");
  });
  it("nunca muestra montos", () => {
    const txt = JSON.stringify(etapasServicio({ estado: "Cobrada", precio: 12345, precioPropuesto: 9999, cotizacionFolio: "COT-1", cotizacionEstado: "Aceptada" }));
    expect(txt).not.toMatch(/12345|9999|\$/);
  });
});
