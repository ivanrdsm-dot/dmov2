import { describe, it, expect } from "vitest";
import { tablasPro, puntoAdicionalSugerido, CONCEPTOS_LOCALES } from "./tarifarioPro.ts";

const L = (nombre, base, extra = {}) => ({ tipo: "local", nombre, base, activo: true, ...extra });
const TARIFAS = [
  L("Viaje local", { eur: 2500, cam: 3200, kra: 3600, rab: 6000, mud: 8000 }),
  L("Viaje local con 1 ayudante y/o maniobra", { eur: 3000, cam: 4300, kra: 5000, rab: 8000, mud: 10000 }),
  L("Viaje urgente", { eur: 2500, cam: 3200 }),
  L("Viaje urgente con 1 ayudante", { eur: 3000, cam: 4300 }),
  L("Resguardo de materiales x 1 dia", { eur: 1200, cam: 1200, kra: 1200, rab: 1200, mud: 1200 }),
  L("Renta por dia sin chofer", { eur: 1600, cam: 2800 }),
  L("Renta por día con chofer local", { eur: 3500, cam: 5800 }),
  L("Renta por mes sin chofer", { eur: 36000, cam: 63000 }),
  L("Entrega adicional en ruta local", {}, { valorUnico: 1200 }),
  { id: "nacional_puebla", tipo: "nacional", nombre: "Puebla", km: 123, base: { eur: 5080.32, cam: 7727.1, kra: 8718.08, rab: 13610.24, mud: 16808.96 }, cliente: { eur: 9999 }, activo: true },
  { id: "nacional_acapulco", tipo: "nacional", nombre: "Acapulco", km: 395, base: { eur: 13310, cam: 0 }, activo: true },
  { id: "nacional_chiapas", tipo: "nacional", nombre: "chiapas", km: null, base: { eur: 20000 }, activo: true },
  { id: "nacional_baja", tipo: "nacional", nombre: "Destino dado de baja", km: 50, base: { eur: 1 }, activo: false },
];

describe("tablas del Cotizador Pro desde el tarifario", () => {
  const t = tablasPro(TARIFAS);
  it("las ciudades son solo las del tarifario activas, con precio BASE (no el bloque cliente)", () => {
    expect(t.ciudades.map(c => c.c)).toEqual(["Ciudad de México", "Acapulco", "chiapas", "Puebla"]);
    expect(t.ciudades.find(c => c.c === "Puebla")).toMatchObject({ km: 123, eur: 5080.32, mud: 16808.96, local: false });
    expect(t.ciudades.find(c => c.c === "Acapulco").cam).toBeUndefined();       // un cero no es precio
  });
  it("la Ciudad de México sale del viaje local del tarifario", () => {
    expect(t.ciudades[0]).toMatchObject({ c: "Ciudad de México", km: 0, local: true, eur: 2500, cam: 3200, mud: 8000 });
  });
  it("precios locales por unidad, resguardo de $1,200 y entrega adicional del tarifario", () => {
    expect(t.local.eur).toEqual({ normal: 2500, ayudante: 3000, urgente: 2500, urgente_ay: 3000, resguardo: 1200, renta_dia: 1600, renta_chofer: 3500, renta_mes: 36000 });
    expect(t.local.mud).toEqual({ normal: 8000, ayudante: 10000, resguardo: 1200 });
    expect(t.entregaAdicionalLocal).toBe(1200);
  });
  it("lo que falta se dice: ciudad sin kilómetros", () => {
    expect(t.faltantes).toEqual(["Kilómetros de chiapas"]);
  });
  it("sin tarifario no hay ni un precio", () => {
    const v = tablasPro([]);
    expect(v.ciudades).toEqual([]);
    expect(v.local).toEqual({});
    expect(v.entregaAdicionalLocal).toBeNull();
    expect(v.faltantes).toHaveLength(CONCEPTOS_LOCALES.length + 1);
  });
  it("una tarifa local dada de baja deja de existir", () => {
    const v = tablasPro(TARIFAS.map(x => x.nombre === "Resguardo de materiales x 1 dia" ? { ...x, activo: false } : x));
    expect(v.local.eur.resguardo).toBeUndefined();
    expect(v.faltantes).toContain('Tarifa local "Resguardo de materiales x 1 dia"');
  });
});

describe("punto adicional", () => {
  it("solo hay precio sugerido en ruta local; fuera, se captura", () => {
    const t = { entregaAdicionalLocal: 1200 };
    expect(puntoAdicionalSugerido(t, 0)).toBe(1200);
    expect(puntoAdicionalSugerido(t, null)).toBe(1200);
    expect(puntoAdicionalSugerido(t, 395)).toBeNull();
    expect(puntoAdicionalSugerido({ entregaAdicionalLocal: null }, 0)).toBeNull();
  });
});

import { REGLAS_PRO, reglasPro, descuentoPorPuntos, idRegla } from "./tarifarioPro.ts";
import { validarTarifa, diffTarifa } from "./tarifario.ts";

describe("reglas del Cotizador Pro en el tarifario", () => {
  const docs = REGLAS_PRO.map(r => ({ id: idRegla(r.clave), tipo: "regla", clave: r.clave, nombre: r.nombre, unidad: r.unidad, valor: r.valorInicial, activo: true }));
  it("los valores iniciales son los que tenía el código", () => {
    expect(Object.fromEntries(REGLAS_PRO.map(r => [r.clave, r.valorInicial]))).toEqual({ urgente_pct: 35, descuento_puntos_pct: 5, descuento_puntos_tramo: 20, descuento_puntos_tope: 20, ayudante_foraneo: 2800, hotel_noche: 1100, comida_dia: 700 });
  });
  it("lee los valores vigentes; la que falta o está de baja no se inventa", () => {
    expect(reglasPro(docs)).toEqual({ valores: { urgente_pct: 35, descuento_puntos_pct: 5, descuento_puntos_tramo: 20, descuento_puntos_tope: 20, ayudante_foraneo: 2800, hotel_noche: 1100, comida_dia: 700 }, faltantes: [] });
    const r = reglasPro(docs.map(d => d.clave === "hotel_noche" ? { ...d, activo: false } : d.clave === "comida_dia" ? { ...d, valor: 0 } : d));
    expect(r.valores.hotel_noche).toBeUndefined();
    expect(r.valores.comida_dia).toBe(0);
    expect(r.faltantes).toEqual(['Regla "Hotel por unidad por noche"']);
    expect(reglasPro([]).faltantes).toHaveLength(REGLAS_PRO.length);
  });
  it("el descuento por volumen se calcula con las reglas y respeta el tope", () => {
    const v = reglasPro(docs).valores;
    expect([1, 19, 20, 39, 40, 80, 200].map(n => descuentoPorPuntos(v, n))).toEqual([0, 0, 0.05, 0.05, 0.1, 0.2, 0.2]);
    expect(descuentoPorPuntos({ ...v, descuento_puntos_pct: 10, descuento_puntos_tramo: 10, descuento_puntos_tope: 15 }, 30)).toBe(0.15);
    expect(descuentoPorPuntos({ ...v, descuento_puntos_pct: 0 }, 80)).toBe(0);
    expect(descuentoPorPuntos({}, 80)).toBe(0);
  });
  it("validación y historial de una regla", () => {
    const base = { tipo: "regla", nombre: "Hotel", unidad: "$" };
    expect(validarTarifa({ ...base, valor: 1200 }).ok).toBe(true);
    expect(validarTarifa({ ...base, valor: 0 })).toMatchObject({ ok: true, avisos: ["Con valor 0 la regla no se aplica"] });
    expect(validarTarifa({ ...base, valor: -1 }).ok).toBe(false);
    expect(validarTarifa({ ...base, valor: "" }).ok).toBe(false);
    expect(validarTarifa({ ...base, unidad: "%", valor: 120 }).ok).toBe(false);
    expect(validarTarifa({ ...base, unidad: "puntos", valor: 2.5 }).ok).toBe(false);
    expect(diffTarifa({ ...base, valor: 1100 }, { ...base, valor: 1250 })).toEqual([{ campo: "valor", antes: 1100, despues: 1250 }]);
    expect(diffTarifa({ ...base, valor: 5 }, { ...base, valor: 0 })).toEqual([{ campo: "valor", antes: 5, despues: 0 }]);
  });
});
