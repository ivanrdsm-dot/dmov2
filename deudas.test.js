import { describe, it, expect } from "vitest";
import { tipoDeuda, porPagarPorTipo } from "./deudas.ts";

/* Casos tomados de los conceptos reales de la balanza (sin montos de clientes). */
describe("tipo de deuda", () => {
  it("separa préstamos, PTU, impuestos y otras deudas de los proveedores", () => {
    expect(tipoDeuda({ categoria: "Otros", concepto: "Préstamo por pagar — capital (balanza 2120)" })).toBe("Préstamos e intereses");
    expect(tipoDeuda({ categoria: "Otros", concepto: "Intereses devengados junio por pagar (balanza 2175)" })).toBe("Préstamos e intereses");
    expect(tipoDeuda({ categoria: "Otros", concepto: "PTU por pagar ejercicios anteriores (balanza 2180)" })).toBe("PTU");
    expect(tipoDeuda({ categoria: "Impuestos", concepto: "Contribuciones seguridad social patronales por pagar" })).toBe("Impuestos y seguridad social");
    expect(tipoDeuda({ categoria: "Impuestos", concepto: "Impuestos retenidos por enterar: ISR, IVA ret" })).toBe("Impuestos y seguridad social");
    expect(tipoDeuda({ categoria: "Otros", concepto: "Acreedor diverso por pagar (balanza 2120)" })).toBe("Otras deudas");
    expect(tipoDeuda({ categoria: "Otros", concepto: "Reembolsos de caja chica por pagar (balanza 2120)" })).toBe("Otras deudas");
    expect(tipoDeuda({ categoria: "Servicios externos", concepto: "Proveedor por pagar (balanza 2130)" })).toBe("Proveedores");
    expect(tipoDeuda({ categoria: "Combustible", concepto: "Diésel ruta Puebla" })).toBe("Proveedores");
  });
  it("suma solo lo pendiente, por tipo", () => {
    const r = porPagarPorTipo([
      { status: "Pendiente", total: 4000000, concepto: "Préstamo por pagar" },
      { status: "Pendiente", total: 44534, categoria: "Servicios externos", concepto: "Proveedor por pagar" },
      { status: "Pagado", total: 999, concepto: "Diésel" },
      { status: "Programado", total: 100.5, categoria: "Casetas", concepto: "TAG" },
    ]);
    expect(r["Proveedores"]).toEqual({ monto: 44634.5, n: 2 });
    expect(r["Préstamos e intereses"]).toEqual({ monto: 4000000, n: 1 });
    expect(r["PTU"]).toEqual({ monto: 0, n: 0 });
  });
});
