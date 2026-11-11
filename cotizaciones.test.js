import { describe, it, expect } from "vitest";
import { folioCotizacion, resumirCalculo, validarCotizacion, evaluarTransicion, servicioDesdeCotizacion, kpisCotizaciones, precioCliente } from "./cotizaciones.ts";
import { cotizar } from "./cotizacionAuto.ts";
import { tiposParaCotizar } from "./tiposUnidad.ts";

const TARIFAS = [{ id: "local_viaje", tipo: "local", nombre: "Viaje local", activo: true, base: { eur: 2200, kra: 3600, cam: 3200, rab: 5200, mud: 7000 } }];

describe("folio", () => {
  it("es consecutivo por año y rechaza valores inválidos", () => {
    expect(folioCotizacion(1, 2026)).toBe("COT-2026-0001");
    expect(folioCotizacion(12345, 2027)).toBe("COT-2027-12345");
    expect(() => folioCotizacion(0, 2026)).toThrow();
    expect(() => folioCotizacion(1, 1999)).toThrow();
  });
});

describe("resumen del cálculo", () => {
  it("guarda solo datos planos, sin undefined ni objetos del catálogo", () => {
    const c = cotizar({ carga: { tarimas: 2, tarimaPesoKg: 400 }, tipoRuta: "local" }, tiposParaCotizar([]), TARIFAS);
    const r = resumirCalculo(c);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(r.unidadClave).toBe("sprinter");
    expect(r.tarimas).toBe(2);
    expect(r.pesoKg).toBe(800);
    expect(r.precio).toBe(c.precio);
    expect(r.pendientes).toEqual(c.pendientes);
  });
  it("un cálculo vacío no inventa nada", () => {
    const r = resumirCalculo(null);
    expect(r.precio).toBeNull(); expect(r.unidadNombre).toBeNull(); expect(r.conceptos).toEqual([]); expect(r.lista).toBe(false);
  });
});

describe("validación y transiciones", () => {
  it("sin cliente o sin precio calculado no se guarda", () => {
    expect(validarCotizacion({ empresa: "", resultado: null })).toHaveLength(2);
    expect(validarCotizacion({ empresa: "Cliente", resultado: resumirCalculo(null) })).toHaveLength(1);
    expect(validarCotizacion({ empresa: "Cliente", resultado: { ...resumirCalculo(null), precio: 100 } })).toEqual([]);
  });
  it("solo un admin aprueba; se envía después de aprobar; se acepta o rechaza después de enviar", () => {
    const en = e => ({ estado: e });
    expect(evaluarTransicion(en("Propuesta"), "Aprobada").permitido).toBe(false);
    expect(evaluarTransicion(en("Propuesta"), "Aprobada", { esAdmin: true }).permitido).toBe(true);
    expect(evaluarTransicion(en("Propuesta"), "Enviada", { esAdmin: true }).permitido).toBe(false);
    expect(evaluarTransicion(en("Aprobada"), "Enviada").permitido).toBe(true);
    expect(evaluarTransicion(en("Aprobada"), "Aceptada").permitido).toBe(false);
    expect(evaluarTransicion(en("Enviada"), "Aceptada").permitido).toBe(true);
    expect(evaluarTransicion(en("Enviada"), "Rechazada")).toMatchObject({ permitido: true, requiereMotivo: true });
    expect(evaluarTransicion(en("Enviada"), "Cancelada")).toMatchObject({ permitido: true, requiereMotivo: true });
  });
  it("una cotización aceptada, rechazada o cancelada ya no cambia", () => {
    for(const e of ["Aceptada", "Rechazada", "Cancelada"]) for(const a of ["Propuesta", "Aprobada", "Enviada", "Cancelada"])
      expect(evaluarTransicion({ estado: e }, a, { esAdmin: true }).permitido).toBe(false);
  });
});

describe("de cotización a servicio", () => {
  const c = { id: "c1", folio: "COT-2026-0007", estado: "Aceptada", empresa: "Cliente", solicitante: "Ana", contacto: "ana@example.invalid",
    solicitudId: "s1", solicitudFolio: "SOL-2026-0003", solicitudCanal: "Correo", entrada: { modo: "Cajas", cajas: "120" }, precioPropuesto: 3200, precioAprobado: 3500,
    resultado: { tarimas: 5, pesoKg: 1440, volumenM3: 7.2, maniobra: true, ayudantes: 2 } };
  it("lleva folio, precio aprobado, carga y la liga a la solicitud", () => {
    expect(servicioDesdeCotizacion(c)).toMatchObject({ empresa: "Cliente", cotizacionId: "c1", cotizacionFolio: "COT-2026-0007", precioPropuesto: 3500,
      cajas: "120", tarimas: 5, pesoKg: 1440, maniobras: "Sí, 2 ayudante(s)", solicitudId: "s1", solicitudFolio: "SOL-2026-0003", canal: "Correo" });
  });
  it("sin aprobación no hay precio para el cliente", () => {
    expect(precioCliente({ precioPropuesto: 3200 })).toBeNull();
    expect(servicioDesdeCotizacion({ ...c, precioAprobado: undefined }).precioPropuesto).toBe("");
  });
});

describe("indicadores", () => {
  it("cuenta por estado, tasa de cierre y monto aceptado; sin respuestas la tasa es null", () => {
    expect(kpisCotizaciones([]).tasaCierrePct).toBeNull();
    const k = kpisCotizaciones([{ estado: "Propuesta" }, { estado: "Aprobada" }, { estado: "Enviada" }, { estado: "Aceptada", precioAprobado: 1000 },
      { estado: "Aceptada", precioAprobado: 500 }, { estado: "Rechazada", precioAprobado: 900 }]);
    expect(k).toMatchObject({ total: 6, porAprobar: 1, porEnviar: 1, esperandoCliente: 1, tasaCierrePct: 67, montoAceptado: 1500 });
  });
});
