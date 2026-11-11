import { describe, it, expect } from "vitest";
import { cubicar, estibar, evaluarManiobra, elegirUnidad, cotizar, PARAMETROS } from "./cotizacionAuto.ts";

/* Catálogo y tarifario de EJEMPLO para probar la lógica; no son los datos reales. */
const tipo = (clave, nombre, tarifa, kg, m3, piso, alto, enFlota, extra = {}) => ({ clave, nombre, tarifa, capacidadKg: kg, capacidadM3: m3, tarimasPiso: piso, altoInteriorM: alto, enFlota, fuente: "ejemplo", confirmada: true, ...extra });
const TIPOS = [
  tipo("van", "Van chica", "eur", 1000, 6, 2, 1.4, 3, { cajasSueltasMax: 125 }),
  tipo("grande", "Van grande", "kra", 1400, 14, 4, 1.9, 1),
  tipo("c35", "Camioneta 3.5", "cam", 3500, 16, 10, 2.0, 1),
  tipo("rabon", "Rabón", "rab", 8000, 40, 14, 2.4, 0),
];
const TARIFAS = [
  { tipo: "local", nombre: "Viaje local", base: { eur: 2500, cam: 3200, kra: 3600, rab: 6000 } },
  { tipo: "local", nombre: "Viaje local con 1 ayudante y/o maniobra", base: { eur: 3000, cam: 4300, kra: 5000, rab: 8000 } },
  { tipo: "local", nombre: "Resguardo de materiales x 1 dia", base: { eur: 1200, cam: 1200, kra: 1200, rab: 1200 } },
  { tipo: "local", nombre: "Entrega adicional en ruta local", valorUnico: 1200 },
  { tipo: "nacional", nombre: "Puebla", km: 123, base: { eur: 5080.32, cam: 7727.1 } },
];
const CAJA = { cajaLargoCm: 40, cajaAnchoCm: 30, cajaAltoCm: 25, cajaPesoKg: 10 };
const CON_ANDEN = { tieneAnden: true, tieneMontacargas: true };

describe("cubicaje y entarimado", () => {
  it("calcula peso, volumen y tarimas a partir de cajas con medidas", () => {
    const c = cubicar({ cajas: 200, ...CAJA, entarimada: true });
    expect(c).toMatchObject({ pesoKg: 2000, volumenM3: 6, cajasPorCama: 9, camas: 5, cajasPorTarima: 45, tarimas: 5, tarimasCalculadas: true, altoTarimaM: 1.4, pesoPorTarimaKg: 450 });
    expect(c.pendientes).toEqual([]);
    expect(c.supuestos[0]).toContain("Tarima estándar");
  });
  it("si no se sabe si va en tarimas, calcula en tarimas pero lo pregunta", () => {
    expect(cubicar({ cajas: 200, ...CAJA }).pendientes).toEqual(["¿La mercancía viaja en tarimas o a granel? Se calculó en tarimas"]);
  });
  it("respeta la estiba máxima de la caja y el peso máximo por tarima", () => {
    expect(cubicar({ cajas: 200, ...CAJA, maxNivelesCaja: 3 })).toMatchObject({ cajasPorTarima: 27, tarimas: 8, altoTarimaM: 0.9 });
    expect(cubicar({ cajas: 200, ...CAJA, cajaPesoKg: 40 })).toMatchObject({ cajasPorTarima: 25, tarimas: 8 });
  });
  it("si la solicitud ya trae tarimas, no las recalcula", () => {
    const c = cubicar({ tarimas: 6, tarimaPesoKg: 500 });
    expect(c).toMatchObject({ tarimas: 6, tarimasCalculadas: false, pesoKg: 3000, altoTarimaM: 1.5 });
    expect(c.supuestos).toEqual(["Altura de cada tarima: 1.5 m (no viene en la solicitud)."]);
  });
  it("no inventa: sin medidas ni peso lo pide", () => {
    expect(cubicar({ cajas: 80 }).pendientes).toEqual(["Peso total o peso por caja", "Medidas de la caja, volumen o número de tarimas"]);
    expect(cubicar({}).tarimas).toBeNull();
  });
  it("carga declarada a granel no se entarima; caja más grande que la tarima se reporta", () => {
    expect(cubicar({ cajas: 200, ...CAJA, entarimada: false })).toMatchObject({ tarimas: null, volumenM3: 6 });
    expect(cubicar({ cajas: 4, cajaLargoCm: 180, cajaAnchoCm: 130, cajaAltoCm: 50, cajaPesoKg: 30 }).pendientes).toContain("La caja no cabe en una tarima estándar: viaja a granel o en tarima especial");
  });
});

describe("estiba de tarimas", () => {
  const cub = cubicar({ tarimas: 8, tarimaAltoM: 1.1, tarimaPesoKg: 300 });
  it("apila a dos niveles solo si es apilable y cabe en la altura de la unidad", () => {
    expect(estibar(cub, { apilable: true }, { altoInteriorM: 2.4 })).toMatchObject({ niveles: 2, posicionesPiso: 4 });
    expect(estibar(cub, { apilable: true }, { altoInteriorM: 2.0 })).toMatchObject({ niveles: 1, posicionesPiso: 8 });
  });
  it("no apila si no se sabe, si no se permite o si es frágil", () => {
    expect(estibar(cub, {}, { altoInteriorM: 2.4 }).motivo).toContain("No se sabe");
    expect(estibar(cub, { apilable: false }, { altoInteriorM: 2.4 }).niveles).toBe(1);
    expect(estibar(cub, { apilable: true, fragil: true }, { altoInteriorM: 2.4 }).niveles).toBe(1);
  });
  it("nunca más de dos niveles, y a granel no ocupa posiciones", () => {
    expect(estibar(cubicar({ tarimas: 9, tarimaAltoM: 0.5 }), { apilable: true }, { altoInteriorM: 2.6 })).toMatchObject({ niveles: 2, posicionesPiso: 5 });
    expect(estibar(cubicar({ pesoKg: 100, volumenM3: 1 }), { apilable: true }, { altoInteriorM: 2 }).posicionesPiso).toBeNull();
  });
});

describe("maniobra", () => {
  const sol = (carga, extra = {}) => ({ carga, tipoRuta: "local", ...extra });
  it("pieza pesada o voluminosa pide ayudante y explica por qué", () => {
    const s = sol({ cajas: 10, ...CAJA, cajaPesoKg: 32, entarimada: false });
    expect(evaluarManiobra(s, cubicar(s.carga))).toMatchObject({ requerida: true, ayudantes: 1 });
    const v = sol({ cajas: 6, voluminosa: true, pesoKg: 300, volumenM3: 4, entarimada: false });
    expect(evaluarManiobra(v, cubicar(v.carga)).motivos[0]).toContain("voluminosas");
  });
  it("carga a granel: depende de cuántos bultos tocan por punto", () => {
    const pocas = sol({ cajas: 60, ...CAJA, entarimada: false });
    expect(evaluarManiobra(pocas, cubicar(pocas.carga))).toMatchObject({ requerida: false, ayudantes: 0 });
    const muchas = sol({ cajas: 300, ...CAJA, entarimada: false });
    expect(evaluarManiobra(muchas, cubicar(muchas.carga))).toMatchObject({ requerida: true });
    const repartidas = sol({ cajas: 300, ...CAJA, entarimada: false }, { entregas: 4 });
    expect(evaluarManiobra(repartidas, cubicar(repartidas.carga)).requerida).toBe(false);
  });
  it("tarimas: sin andén ni montacargas hay maniobra; si no se sabe, se pregunta", () => {
    const base = { tarimas: 4, tarimaPesoKg: 400 };
    const sinDato = sol(base);
    expect(evaluarManiobra(sinDato, cubicar(base))).toMatchObject({ requerida: null, pendientes: ["¿Hay andén o montacargas en el origen?", "¿Hay andén o montacargas en el destino?"] });
    const ok = sol(base, { origen: CON_ANDEN, destinoOp: CON_ANDEN });
    expect(evaluarManiobra(ok, cubicar(base))).toMatchObject({ requerida: false, ayudantes: 0 });
    const sinAnden = sol(base, { origen: CON_ANDEN, destinoOp: { tieneAnden: false, tieneMontacargas: false } });
    expect(evaluarManiobra(sinAnden, cubicar(base))).toMatchObject({ requerida: true, ayudantes: 1 });
  });
  it("carga pesada a granel pide dos ayudantes", () => {
    const s = sol({ cajas: 400, ...CAJA, entarimada: false });
    expect(evaluarManiobra(s, cubicar(s.carga)).ayudantes).toBe(2);
  });
});

describe("elección de unidad", () => {
  it("la unidad propia más chica en la que cabe todo", () => {
    const r = elegirUnidad(cubicar({ cajas: 60, ...CAJA, entarimada: false }), { cajas: 60, entarimada: false }, TIPOS);
    expect(r.eleccion).toMatchObject({ cantidad: 1, conProveedor: false, usoPct: { peso: 60, volumen: 30, piso: null } });
    expect(r.eleccion.tipo.clave).toBe("van");
    expect(r.alternativa.tipo.clave).toBe("grande");
  });
  it("respeta la regla de la casa de cajas a granel y el factor de llenado", () => {
    expect(elegirUnidad(cubicar({ cajas: 130, cajaPesoKg: 5, volumenM3: 3, entarimada: false }), { cajas: 130, entarimada: false }, TIPOS).eleccion.tipo.clave).toBe("grande");
    expect(elegirUnidad(cubicar({ pesoKg: 500, volumenM3: 5.5 }), {}, TIPOS).eleccion.tipo.clave).toBe("grande");      // 5.5 m³ no caben en 6 × 0.85
  });
  it("por posiciones de piso, y apilar puede bajar de unidad", () => {
    const carga = { tarimas: 6, tarimaAltoM: 0.9, tarimaPesoKg: 200 };
    expect(elegirUnidad(cubicar(carga), carga, TIPOS).eleccion.tipo.clave).toBe("c35");
    const apilada = { ...carga, apilable: true };
    const r = elegirUnidad(cubicar(apilada), apilada, TIPOS);
    expect(r.eleccion.tipo.clave).toBe("grande");
    expect(r.eleccion.estiba).toMatchObject({ niveles: 2, posicionesPiso: 3 });
  });
  it("si no cabe en una propia: varias del mismo tipo, o proveedor", () => {
    const tres = elegirUnidad(cubicar({ pesoKg: 2600, volumenM3: 4 }), {}, TIPOS.filter(t => t.clave === "van"));
    expect(tres.eleccion).toMatchObject({ cantidad: 3, conProveedor: false });
    const prov = elegirUnidad(cubicar({ tarimas: 12, tarimaPesoKg: 400 }), { tarimas: 12 }, TIPOS);
    expect(prov.eleccion.tipo.clave).toBe("rabon");
    expect(prov.eleccion.conProveedor).toBe(true);
    expect(elegirUnidad(cubicar({ tarimas: 40, tarimaPesoKg: 500 }), { tarimas: 40 }, TIPOS).eleccion).toBeNull();
    expect(elegirUnidad(cubicar({}), {}, TIPOS).eleccion).toBeNull();
  });
});

describe("cotización completa", () => {
  it("local sin maniobra: viaje local de la unidad elegida, redondeado y con IVA", () => {
    const c = cotizar({ carga: { cajas: 60, ...CAJA, entarimada: false }, tipoRuta: "local" }, TIPOS, TARIFAS);
    expect(c).toMatchObject({ subtotalBase: 2500, gananciaPct: 0, precio: 2500, iva: 400, total: 2900, lista: true, pendientes: [] });
    expect(c.conceptos).toEqual([{ concepto: "Viaje local", monto: 2500, detalle: "1 unidad(es)" }]);
  });
  it("local con maniobra, entregas adicionales, resguardo y ganancia", () => {
    const c = cotizar({ carga: { cajas: 300, ...CAJA, cajaPesoKg: 4, entarimada: false }, tipoRuta: "local", entregas: 3, diasResguardo: 2, gananciaPct: 12 }, TIPOS, TARIFAS);
    expect(c.unidad.tipo.clave).toBe("grande");
    expect(c.conceptos.map(x => [x.concepto, x.monto])).toEqual([["Viaje local", 3600], ["Entregas adicionales en ruta", 2400], ["Resguardo", 2400]]);
    expect(c).toMatchObject({ subtotalBase: 8400, precio: 9410, iva: 1505.6, total: 10915.6 });
  });
  it("cuando hay maniobra usa la tarifa con ayudante", () => {
    const c = cotizar({ carga: { cajas: 20, ...CAJA, cajaPesoKg: 30, entarimada: false }, tipoRuta: "local" }, TIPOS, TARIFAS);
    expect(c.maniobra.requerida).toBe(true);
    expect(c.conceptos[0]).toMatchObject({ concepto: "Viaje local con ayudante o maniobra", monto: 3000 });
  });
  it("nacional: precio base del destino; lo que el tarifario no cubre queda pendiente", () => {
    const c = cotizar({ carga: { cajas: 60, ...CAJA, entarimada: false }, tipoRuta: "nacional", destino: "puebla" }, TIPOS, TARIFAS);
    expect(c).toMatchObject({ subtotalBase: 5080.32, precio: 5090, lista: true });
    const sinTarifa = cotizar({ carga: { tarimas: 3, tarimaPesoKg: 300 }, tipoRuta: "nacional", destino: "Puebla", origen: CON_ANDEN, destinoOp: CON_ANDEN }, TIPOS, TARIFAS);
    expect(sinTarifa.unidad.tipo.clave).toBe("grande");
    expect(sinTarifa.pendientes).toEqual(['No hay tarifa de "Viaje a Puebla" para Van grande']);
    expect(sinTarifa).toMatchObject({ precio: null, lista: false });
    expect(cotizar({ carga: { cajas: 60, ...CAJA, entarimada: false }, tipoRuta: "nacional" }, TIPOS, TARIFAS).pendientes).toEqual(["Destino"]);
  });
  it("nunca da precio 'listo' con preguntas abiertas ni con unidad de proveedor sin confirmar", () => {
    const sinAnden = cotizar({ carga: { tarimas: 2, tarimaPesoKg: 300 }, tipoRuta: "local" }, TIPOS, TARIFAS);
    expect(sinAnden.lista).toBe(false);
    expect(sinAnden.precio).toBe(2500);
    const prov = cotizar({ carga: { tarimas: 12, tarimaPesoKg: 400 }, tipoRuta: "local", origen: CON_ANDEN, destinoOp: CON_ANDEN }, TIPOS, TARIFAS);
    expect(prov.pendientes[0]).toContain("no está en la flota propia");
    expect(prov.lista).toBe(false);
  });
  it("avisa cuando la capacidad usada es de referencia", () => {
    const tipos = TIPOS.map(t => ({ ...t, confirmada: false, fuente: "ficha de fabricante" }));
    expect(cotizar({ carga: { cajas: 60, ...CAJA, entarimada: false }, tipoRuta: "local" }, tipos, TARIFAS).supuestos.join(" ")).toContain("tomada de referencia (ficha de fabricante)");
    expect(PARAMETROS.pesoManualMaxKg).toBe(25);
  });
});
