import { describe, it, expect } from "vitest";
import { datosHojaEntrega, CAMPOS_INTERNOS } from "./hojaEntrega.ts";

const servicio = { folio: "SRV-2026-0007", empresa: "EMPRESA EJEMPLO SA DE CV", solicitante: "Persona Solicitante", fechaServicio: "2026-11-12", horaServicio: "9:00",
  unidadPlaca: "ABC123D", choferNombre: "Juan Carlos Pérez López", mercancia: "Exhibidores", cajas: 40, tarimas: "", pesoKg: 350,
  precio: 4640, precioPropuesto: 4000, proveedor: "Proveedor Interno", notas: "margen 30%", comisionPct: 30 };
const T = Date.parse("2026-11-12T16:30:00Z");
const paradas = [
  { id: "p02", orden: 2, tipo: "entrega", nombre: "Tienda A", direccion: "Av. Dos 20", estado: "Entregada", cerradaEn: T, distanciaAlCerrarM: 40, evidencia: { receptor: "Recibo Uno", cantidadEntregada: 40, fotos: ["a.jpg", "b.jpg"] } },
  { id: "p01", orden: 1, tipo: "carga", nombre: "Bodega", direccion: "Calle Uno 10", estado: "Entregada", cerradaEn: T - 3600000, evidencia: { receptor: "Almacén", fotos: ["c.jpg"] } },
];

describe("datosHojaEntrega", () => {
  it("ordena las paradas y arma el resumen", () => {
    const h = datosHojaEntrega(servicio, paradas);
    expect(h.filas.map(f => f.n)).toEqual([1, 2]);
    expect(h.filas[1]).toMatchObject({ punto: "Tienda A · Av. Dos 20", tipo: "Entrega", resultado: "Entregado", recibio: "Recibo Uno", cantidad: "40", evidencia: "2 foto(s)" });
    expect(h.resumen).toEqual({ paradas: 2, entregadas: 2, incidencias: 0, fotos: 3 });
    expect(h.completa).toBe(true);
    expect(h.carga).toBe("Exhibidores · 40 cajas · 350 kg");
  });
  it("muestra solo el nombre de pila del chofer", () => {
    expect(datosHojaEntrega(servicio, paradas).chofer).toBe("Juan");
  });
  it("nunca incluye costos, márgenes, proveedor ni notas internas", () => {
    const texto = JSON.stringify(datosHojaEntrega(servicio, paradas));
    for(const prohibido of ["4640", "4000", "Proveedor Interno", "margen", "30%"]) expect(texto).not.toContain(prohibido);
    expect(CAMPOS_INTERNOS).toContain("precioPropuesto");
  });
  it("marca incidencias, cierres por excepción y lo que falta", () => {
    const h = datosHojaEntrega(servicio, [
      { orden: 1, estado: "Incidencia", incidencia: "Entrega parcial", nombre: "X", evidencia: { receptor: "R", fotos: ["a"] }, cerradaPorExcepcion: true },
      { orden: 2, estado: "Pendiente", nombre: "Y" }]);
    expect(h.filas[0].resultado).toBe("Entrega parcial");
    expect(h.filas[0].evidencia).toBe("1 foto(s) · cierre autorizado por operaciones");
    expect(h.filas[1].resultado).toBe("Pendiente");
    expect(h).toMatchObject({ completa: false, pendientes: ["1 parada(s) sin cerrar"], resumen: { incidencias: 1 } });
  });
  it("sin paradas lo dice en vez de inventar un cierre", () => {
    expect(datosHojaEntrega(servicio, [])).toMatchObject({ completa: false, pendientes: ["El servicio no tiene paradas registradas"], filas: [] });
  });
});
