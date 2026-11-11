import { describe, it, expect } from "vitest";
import {
  ESTADOS_SERVICIO, folioServicio, validarServicio, requisitosEstado, evaluarCambioEstado,
  diffServicio, minutosACotizacion, kpisServicios, resumenRuta,
} from "./servicios.ts";

const base = () => ({
  canal: "Slack", recibidaEn: "2026-11-10T09:00", empresa: "PROMOCIONES AMERICA LATINA SAPI DE CV",
  solicitante: "Persona Ejemplo", solicitanteContacto: "persona@example.invalid",
  fechaServicio: "2026-11-12", mercancia: "Exhibidores", cajas: 40, plan: "210212",
  origenes: [{ nombre: "Bodega Vallejo", direccion: "Calle 1, Vallejo, CDMX" }],
  destinos: [{ nombre: "Tienda Polanco", direccion: "Calle 2, Polanco, CDMX", contacto: "Recepción" }],
  estado: "Solicitud",
});

describe("folioServicio", () => {
  it("genera consecutivo con 4 dígitos por año", () => {
    expect(folioServicio(1, 2026)).toBe("SRV-2026-0001");
    expect(folioServicio(727, 2026)).toBe("SRV-2026-0727");
    expect(folioServicio(12345, 2027)).toBe("SRV-2027-12345");
  });
  it("rechaza consecutivos y años inválidos", () => {
    expect(() => folioServicio(0, 2026)).toThrow();
    expect(() => folioServicio(1.5, 2026)).toThrow();
    expect(() => folioServicio(1, 1999)).toThrow();
  });
});

describe("validarServicio", () => {
  it("acepta un servicio completo sin pendientes", () => {
    expect(validarServicio(base())).toEqual({ ok: true, errores: [], pendientes: [] });
  });
  it("bloquea lo mínimo indispensable", () => {
    const v = validarServicio({});
    expect(v.ok).toBe(false);
    expect(v.errores).toHaveLength(6);
  });
  it("un punto sin dirección no cuenta como origen ni destino", () => {
    const v = validarServicio({ ...base(), origenes: [{ nombre: "Bodega" }], destinos: [{ direccion: "  " }] });
    expect(v.errores).toEqual(["Al menos un origen con dirección", "Al menos un destino con dirección"]);
  });
  it("lo que falta se reporta como pendiente, no se inventa ni bloquea", () => {
    const s = { ...base(), fechaServicio: "", mercancia: "", cajas: "", plan: "", solicitanteContacto: "",
      destinos: [{ direccion: "Calle 2" }] };
    const v = validarServicio(s);
    expect(v.ok).toBe(true);
    expect(v.pendientes).toEqual([
      "Fecha del servicio", "Tipo de mercancía", "Cantidad: cajas, tarimas, peso o volumen",
      "Correo o teléfono de quien solicita", "Quién recibe en cada destino", "Plan o centro de costos",
    ]);
  });
  it("cualquier medida de carga cubre la cantidad", () => {
    for(const k of ["cajas", "tarimas", "pesoKg", "volumenM3"]){
      const s = { ...base(), cajas: "", [k]: "3" };
      expect(validarServicio(s).pendientes).not.toContain("Cantidad: cajas, tarimas, peso o volumen");
    }
  });
});

describe("requisitosEstado", () => {
  it("cotizada exige folio y precio aprobado", () => {
    expect(requisitosEstado(base(), "Cotizada")).toEqual(["Folio de cotización", "Precio aprobado por un administrador"]);
    expect(requisitosEstado({ ...base(), cotizacionFolio: "COT-2026-0728", precio: "4,640" }, "Cotizada")).toEqual([]);
  });
  it("el precio propuesto por operaciones no cuenta como aprobado", () => {
    expect(requisitosEstado({ ...base(), cotizacionFolio: "COT-1", precioPropuesto: 5000 }, "Cotizada"))
      .toEqual(["Precio aprobado por un administrador"]);
  });
  it("acumula los requisitos de los estados anteriores", () => {
    expect(requisitosEstado(base(), "Asignada")).toEqual([
      "Folio de cotización", "Precio aprobado por un administrador", "Quién confirmó por parte del cliente",
      "Tipo de asignación", "Placas de la unidad", "Chofer",
    ]);
  });
  it("proveedor externo exige nombrar al proveedor", () => {
    const s = { ...base(), cotizacionFolio: "C", precio: 1, confirmadoPor: "X", asignacionTipo: "Proveedor externo", unidadPlaca: "ABC", choferNombre: "Y" };
    expect(requisitosEstado(s, "Asignada")).toEqual(["Proveedor"]);
  });
  it("entregada exige el nombre de quien recibió", () => {
    const s = { ...base(), cotizacionFolio: "C", precio: 1, confirmadoPor: "X", asignacionTipo: "Flota propia", unidadPlaca: "ABC", choferNombre: "Y" };
    expect(requisitosEstado(s, "Entregada")).toEqual(["Nombre de quien recibió"]);
    expect(requisitosEstado({ ...s, receptor: "Z" }, "Cobrada")).toEqual([]);
  });
});

describe("evaluarCambioEstado", () => {
  it("avanzar sin requisitos se permite solo con motivo", () => {
    const v = evaluarCambioEstado(base(), "Cotizada");
    expect(v.permitido).toBe(true);
    expect(v.requiereMotivo).toBe(true);
    expect(v.faltantes).toHaveLength(2);
  });
  it("avanzar con todo en regla no pide motivo", () => {
    const v = evaluarCambioEstado({ ...base(), cotizacionFolio: "C", precio: 100 }, "Cotizada");
    expect(v).toMatchObject({ permitido: true, requiereMotivo: false, faltantes: [] });
  });
  it("regresar de estado es solo para admin y siempre con motivo", () => {
    const s = { ...base(), estado: "Asignada" };
    expect(evaluarCambioEstado(s, "Cotizada").permitido).toBe(false);
    expect(evaluarCambioEstado(s, "Cotizada", { esAdmin: true })).toMatchObject({ permitido: true, requiereMotivo: true });
  });
  it("cancelar siempre pide motivo; facturado solo admin", () => {
    expect(evaluarCambioEstado(base(), "Cancelada")).toMatchObject({ permitido: true, requiereMotivo: true });
    expect(evaluarCambioEstado({ ...base(), estado: "Facturada" }, "Cancelada").permitido).toBe(false);
    expect(evaluarCambioEstado({ ...base(), estado: "Facturada" }, "Cancelada", { esAdmin: true }).permitido).toBe(true);
  });
  it("cobrado es final; cancelado solo lo reabre admin", () => {
    expect(evaluarCambioEstado({ ...base(), estado: "Cobrada" }, "Cancelada").permitido).toBe(false);
    expect(evaluarCambioEstado({ ...base(), estado: "Cancelada" }, "Solicitud").permitido).toBe(false);
    expect(evaluarCambioEstado({ ...base(), estado: "Cancelada" }, "Solicitud", { esAdmin: true }).permitido).toBe(true);
  });
  it("rechaza el mismo estado y estados desconocidos", () => {
    expect(evaluarCambioEstado(base(), "Solicitud").permitido).toBe(false);
    expect(evaluarCambioEstado(base(), "Inventado").permitido).toBe(false);
  });
});

describe("diffServicio", () => {
  it("lista solo los campos que cambiaron, ordenados", () => {
    const a = base(), d = { ...base(), cajas: 55, notas: "Llegar por el andén 3" };
    expect(diffServicio(a, d)).toEqual([
      { campo: "cajas", antes: 40, despues: 55 },
      { campo: "notas", antes: "", despues: "Llegar por el andén 3" },
    ]);
  });
  it("detecta cambios dentro de los puntos e ignora campos internos", () => {
    const a = base(), d = { ...base(), estado: "Cotizada", folio: "SRV-2026-0002", destinos: [{ ...base().destinos[0], contacto: "Almacén" }] };
    expect(diffServicio(a, d).map(c => c.campo)).toEqual(["destinos"]);
  });
});

describe("minutosACotizacion y kpisServicios", () => {
  const T0 = Date.parse("2026-11-10T09:00");
  it("mide minutos entre recepción y cotización", () => {
    expect(minutosACotizacion({ ...base(), estadoTs: { Cotizada: T0 + 42 * 60000 } })).toBe(42);
    expect(minutosACotizacion(base())).toBeNull();
    expect(minutosACotizacion({ ...base(), estadoTs: { Cotizada: T0 - 1 } })).toBeNull();
  });
  it("cuenta activos, vencidas sin cotizar, para hoy, por facturar y mediana", () => {
    const lista = [
      { ...base(), estado: "Solicitud" },                                                        // vencida (3 h)
      { ...base(), estado: "Solicitud", recibidaEn: "2026-11-10T11:30" },                        // en tiempo
      { ...base(), estado: "Asignada", fechaServicio: "2026-11-10", estadoTs: { Cotizada: T0 + 30 * 60000 } },
      { ...base(), estado: "Cerrada", estadoTs: { Cotizada: T0 + 90 * 60000 } },
      { ...base(), estado: "Cancelada" },
      { ...base(), estado: "Cobrada", estadoTs: { Cotizada: T0 + 60 * 60000 } },
    ];
    const k = kpisServicios(lista, Date.parse("2026-11-10T12:00"), "2026-11-10");
    expect(k).toMatchObject({ total: 6, activos: 4, sinCotizarVencidas: 1, paraHoy: 1, porFacturar: 1, conPendientes: 0, medianaMinACotizacion: 60 });
    expect(k.porEstado).toEqual({ Solicitud: 2, Asignada: 1, Cerrada: 1, Cancelada: 1, Cobrada: 1 });
  });
  it("lista vacía no truena", () => {
    expect(kpisServicios([], 0, "2026-11-10").medianaMinACotizacion).toBeNull();
  });
});

describe("resumenRuta", () => {
  it("usa nombre, o primer tramo de la dirección, y cuenta puntos extra", () => {
    expect(resumenRuta(base())).toBe("Bodega Vallejo → Tienda Polanco");
    const s = { ...base(), origenes: [{ direccion: "Av. Uno 10, Col. X" }], destinos: [...base().destinos, { direccion: "B" }, { direccion: "C" }] };
    expect(resumenRuta(s)).toBe("Av. Uno 10 → Tienda Polanco (+2)");
  });
  it("los estados cubren el ciclo completo del plan", () => {
    expect(ESTADOS_SERVICIO).toEqual(["Solicitud", "Cotizada", "Confirmada", "Asignada", "En ruta", "Entregada", "Cerrada", "Conciliada", "Facturada", "Cobrada"]);
  });
});
