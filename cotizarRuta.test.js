import { describe, it, expect } from "vitest";
import { cotizarRuta, destinoEnTarifario, TARIFA_POR_TIPO_FLOTA, redondearDecenasArriba } from "./functions/lib/cotizarRuta.js";
import { TIPOS_UNIDAD } from "./tiposUnidad.ts";
import { redondearDecenasArriba as redondearCliente } from "./tarifario.ts";
import { avisoDeAlerta, coleccionDeAlerta } from "./functions/lib/avisosOficina.js";

/* Tarifario de prueba: mismos nombres que el real; montos inventados solo para la prueba. */
const T = [
  { tipo: "local", nombre: "Viaje local", base: { eur: 2000, cam: 3000, kra: 3500 } },
  { tipo: "local", nombre: "Viaje local con 1 ayudante y/o maniobra", base: { eur: 2600, cam: 3700, kra: 4200 } },
  { tipo: "local", nombre: "Entrega adicional en ruta local", valorUnico: 1200 },
  { tipo: "nacional", nombre: "Querétaro", base: { eur: 8000.5, kra: 11000 } },
  { tipo: "nacional", nombre: "San Luis Potosí", base: { eur: 12000 } },
  { tipo: "nacional", nombre: "San Luis", base: { eur: 1 } },
  { tipo: "regla", nombre: "Ayudante o maniobra en viaje foráneo", clave: "ayudante_foraneo", valor: 2800, unidad: "$" },
];
const P = (tipo, nombre, lat, lng, direccion = nombre) => ({ tipo, nombre, lat, lng, direccion });
const local = [P("carga", "Bodega", 19.40, -99.10), P("entrega", "Walmart A", 19.42, -99.15), P("entrega", "Walmart B", 19.35, -99.20)];
const srv = (x = {}) => ({ empresa: "Cliente", unidadPlaca: "nxe007c", foraneo: false, ...x });

describe("cotización automática al asignar la ruta", () => {
  it("ruta local con 2 entregas: viaje local + 1 entrega adicional, precio de lista redondeado", () => {
    const c = cotizarRuta({ servicio: srv(), unidad: { tipo: "VW Transporter" }, paradas: local, tarifas: T });
    expect(c.tipoRuta).toBe("local");
    expect(c.resultado.conceptos.map(x => [x.concepto, x.monto])).toEqual([["Viaje local", 2000], ["Entregas adicionales en ruta", 1200]]);
    expect(c.resultado.precio).toBe(3200);
    expect(c.resultado.iva).toBe(512);
    expect(c.resultado.gananciaPct).toBe(0);
    expect(c.resultado.lista).toBe(true);
    expect(c.resultado.unidadNombre).toBe("Eurovan (1 t) · NXE007C");
  });
  it("con 2 choferes se cotiza como viaje con ayudante y lo dice en supuestos", () => {
    const c = cotizarRuta({ servicio: srv({ segundoChoferId: "c2" }), unidad: { tipo: "Camioneta 3.5T" }, paradas: local.slice(0, 2), tarifas: T });
    expect(c.resultado.conceptos[0]).toMatchObject({ concepto: "Viaje local con ayudante o maniobra", monto: 3700 });
    expect(c.resultado.supuestos.join(" ")).toContain("2 choferes");
  });
  it("la unidad sin tipo en Flota deja el precio PENDIENTE (no se inventa)", () => {
    const c = cotizarRuta({ servicio: srv(), unidad: { tipo: "" }, paradas: local, tarifas: T });
    expect(c.resultado.precio).toBeNull();
    expect(c.resultado.lista).toBe(false);
    expect(c.resultado.pendientes[0]).toContain("Tipo de la unidad NXE007C");
  });
  it("placa que no está en Flota y ruta sin placa", () => {
    expect(cotizarRuta({ servicio: srv(), unidad: null, paradas: local, tarifas: T }).resultado.pendientes[0]).toContain("no está en Flota");
    expect(cotizarRuta({ servicio: srv({ unidadPlaca: "" }), unidad: null, paradas: local, tarifas: T }).resultado.pendientes[0]).toContain("no tiene placa");
  });
  it("foránea: cobra el destino más lejano que esté en el tarifario, más ayudante foráneo", () => {
    const paradas = [P("carga", "Bodega", 19.40, -99.10), P("entrega", "Cliente Qro", 20.59, -100.39, "Av. 5 de Febrero 100, Querétaro, Qro."), P("entrega", "Cliente Tepotzotlán", 19.71, -99.22, "Tepotzotlán, Méx.")];
    const c = cotizarRuta({ servicio: srv({ foraneo: true, maniobras: "Sí, 1 ayudante(s)" }), unidad: { tipo: "Mercedes Sprinter" }, paradas, tarifas: T });
    expect(c.tipoRuta).toBe("nacional");
    expect(c.destino).toBe("Querétaro");
    expect(c.resultado.conceptos.map(x => x.monto)).toEqual([11000, 2800]);
    expect(c.resultado.precio).toBe(13800);
    expect(c.resultado.pendientes.join(" ")).toContain("entregas adicionales");      // el nacional no trae precio de entregas extra
  });
  it("destino foráneo que no está en el tarifario queda PENDIENTE", () => {
    const paradas = [P("carga", "Bodega", 19.40, -99.10), P("entrega", "Mérida", 20.97, -89.62, "Mérida, Yuc.")];
    const c = cotizarRuta({ servicio: srv({ foraneo: true }), unidad: { tipo: "VW Transporter" }, paradas, tarifas: T });
    expect(c.resultado.precio).toBeNull();
    expect(c.resultado.pendientes[0]).toContain("no está en el tarifario nacional");
  });
  it("si no se pudo trazar la ruta (local o foránea desconocido) no hay precio", () => {
    const c = cotizarRuta({ servicio: srv({ foraneo: undefined }), unidad: { tipo: "VW Transporter" }, paradas: local, tarifas: T });
    expect(c.resultado.precio).toBeNull();
    expect(c.resultado.pendientes.join(" ")).toContain("local o foránea");
  });
  it("las paradas quitadas no cuentan como entregas", () => {
    const c = cotizarRuta({ servicio: srv(), unidad: { tipo: "VW Transporter" }, paradas: [...local.slice(0, 2), { ...local[2], estado: "Quitada" }], tarifas: T });
    expect(c.entregas).toBe(1);
    expect(c.resultado.precio).toBe(2000);
  });
});

describe("destino en el tarifario", () => {
  it("toma el nombre más largo que aparece completo, sin acentos", () => {
    expect(destinoEnTarifario(T, "Carretera 57, San Luis Potosi, S.L.P.").nombre).toBe("San Luis Potosí");
    expect(destinoEnTarifario(T, "Calle Queretaro 12, Col. Roma, CDMX").nombre).toBe("Querétaro");   // un nombre de calle también cuenta: por eso solo se usa en rutas foráneas
    expect(destinoEnTarifario(T, "Puebla, Pue.")).toBeNull();
  });
});

describe("misma tabla que el resto del sistema", () => {
  it("cada tipo de Flota cobra la misma columna que tiposUnidad.ts", () => {
    for(const t of TIPOS_UNIDAD) for(const n of t.nombresFlota) expect([n, TARIFA_POR_TIPO_FLOTA[n] ?? null]).toEqual([n, t.tarifa]);
  });
  it("mismo redondeo que el tarifario", () => {
    for(const v of [22082.5, 13310, 0.01, 9999.99, 10000]) expect(redondearDecenasArriba(v)).toBe(redondearCliente(v));
  });
  it("el aviso de cotización llega solo al director y abre Cotizaciones", () => {
    expect(coleccionDeAlerta("cotizacion_por_aprobar")).toBe("alertas_director");
    const a = avisoDeAlerta({ id: "x", type: "cotizacion_por_aprobar", informativa: true, atendida: true, msg: "COT-2026-0002 · SRV · $3,200 + IVA", url: "/?v=cotizaciones" });
    expect(a).toMatchObject({ title: "📄 Cotización por aprobar", url: "/?v=cotizaciones", soloDirector: true });
    expect(avisoDeAlerta({ id: "y", type: "cotizacion_por_aprobar", informativa: true, url: "https://malo.example" }).url).toBe("/?v=operacion");
  });
});

describe("aviso del resumen diario", () => {
  it("al tocarlo abre el Reporte del día; un enlace raro no pasa", () => {
    expect(avisoDeAlerta({ id: "r", type: "resumen_diario", informativa: true, atendida: true, msg: "Hoy…", url: "/?v=operacion&t=reporte" }).url).toBe("/?v=operacion&t=reporte");
    expect(avisoDeAlerta({ id: "r", type: "resumen_diario", informativa: true, msg: "Hoy…", url: "/?v=operacion&t=reporte&x=https://malo" }).url).toBe("/?v=operacion");
  });
});
