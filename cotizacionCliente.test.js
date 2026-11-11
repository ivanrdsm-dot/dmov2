import { describe, it, expect } from "vitest";
import { datosCotizacionCliente, bloqueoPdf } from "./cotizacionCliente.ts";

const AHORA = Date.parse("2026-11-10T18:00:00-06:00");
const base = {
  id: "c1", folio: "COT-2026-0007", estado: "Aprobada", empresa: "Cliente Ejemplo", solicitante: "Ana", contacto: "ana@example.invalid",
  notas: "NOTA INTERNA: cliente regatea", precioPropuesto: 3200, precioAprobado: 3500, aprobadoPor: "Dueño",
  entrada: { tipoRuta: "local", entregas: "2", diasResguardo: "1", modo: "Cajas", cajas: "120", entarimada: "No sé", apilable: "No sé", origenAnden: "Sí", destinoAnden: "No sé", fragil: true },
  resultado: { unidadNombre: "Camioneta 3½ (16 m³)", unidades: 1, conProveedor: true, tarimas: 5, pesoKg: 1440, volumenM3: 7.2, maniobra: true, ayudantes: 2,
    motivoUnidad: "interno", conceptos: [{ concepto: "Viaje local", detalle: "1 unidad", monto: 3200 }], subtotalBase: 3000, gananciaPct: 7,
    supuestos: ["Capacidad tomada de referencia (chasis Isuzu ELF 400)"], pendientes: ["El tarifario solo tiene precio para 1 ayudante"] },
};

describe("cuándo se puede generar", () => {
  it("solo con precio aprobado y en estados que se envían", () => {
    expect(bloqueoPdf({ ...base, estado: "Propuesta" })).toMatch(/aprobar/);
    expect(bloqueoPdf({ ...base, estado: "Rechazada" })).toMatch(/ya no se envía/);
    expect(bloqueoPdf({ ...base, precioAprobado: undefined })).toMatch(/precio aprobado/);
    expect(bloqueoPdf({ ...base, empresa: " " })).toMatch(/cliente/);
    for(const e of ["Aprobada", "Enviada", "Aceptada"]) expect(bloqueoPdf({ ...base, estado: e })).toBe("");
    expect(() => datosCotizacionCliente({ ...base, estado: "Propuesta" }, { ahoraMs: AHORA })).toThrow();
  });
});

describe("lo que ve el cliente", () => {
  const d = datosCotizacionCliente(base, { ahoraMs: AHORA, vigenciaDias: "15", nota: "Pago a 15 días", atendio: "Operaciones" });
  it("un solo precio: el aprobado, con IVA del 16 %", () => {
    expect(d).toMatchObject({ precio: 3500, iva: 560, total: 4060, ivaPct: 16, folio: "COT-2026-0007", cliente: "Cliente Ejemplo", atencion: "Ana" });
  });
  it("nunca sale nada interno", () => {
    const todo = JSON.stringify(d);
    for(const x of ["3200", "3000", "NOTA INTERNA", "Isuzu", "tarifario", "proveedor", "interno", "ganancia", "Dueño"]) expect(todo).not.toContain(x);
  });
  it("describe el servicio con datos de la cotización y lo no confirmado lo dice", () => {
    expect(d.servicio).toBe("Transporte local en la Zona Metropolitana de la Ciudad de México · 1 × Camioneta 3½ (16 m³)");
    expect(d.carga).toBe("120 cajas · 5 tarima(s) · 1,440 kg · 7.2 m³");
    expect(d.considera).toEqual(expect.arrayContaining(["2 puntos de entrega.", "Resguardo de la mercancía: 1 día(s).", "Maniobra de carga y descarga con 2 ayudante(s).", "Origen con andén o montacargas.", "Mercancía frágil."]));
    expect(d.porConfirmar).toEqual(["Si hay andén o montacargas en el destino.", "Si la mercancía viaja en tarimas o suelta."]);
  });
  it("fechas en hora de México; sin vigencia capturada no se inventa", () => {
    expect(d.fecha).toBe("10 de noviembre de 2026");
    expect(d.vigenteHasta).toBe("25 de noviembre de 2026");
    expect(datosCotizacionCliente(base, { ahoraMs: AHORA }).vigenteHasta).toBe("");
  });
  it("viaje nacional sin destino lo marca por confirmar", () => {
    const n = datosCotizacionCliente({ ...base, entrada: { tipoRuta: "nacional", destino: "" }, resultado: { ...base.resultado, maniobra: null } }, { ahoraMs: AHORA });
    expect(n.servicio).toContain("Transporte a destino por confirmar");
    expect(n.considera).toContain("Un punto de entrega.");
    expect(n.porConfirmar).toContain("Si en la carga y la descarga hace falta maniobra con ayudantes.");
  });
});
