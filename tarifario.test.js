import { describe, it, expect } from "vitest";
import { redondearDecenasArriba, idTarifa, buscarTarifa, precioDeTarifa, precioConGanancia, factorCliente, validarTarifa, diffTarifa, bajoElBase, sinAcentos } from "./tarifario.ts";

/* Valores de EJEMPLO para probar la lógica; no son el tarifario real. */
const t = (nombre, base, cliente, extra = {}) => ({ tipo: "nacional", nombre, km: 100, base, cliente, ...extra });
const tarifas = [
  t("San Luis Potosí", { eur: 1000, cam: 2000.5 }, { eur: 1120, cam: 2240.56 }),
  t("San Juan del Río", { eur: 500 }, { eur: 560 }),
  t("León", { eur: 800 }, { eur: 896 }),
  t("Baja", { eur: 1 }, { eur: 1 }, { activo: false }),
  { tipo: "local", nombre: "Viaje local", base: { eur: 2500 } },
];

describe("redondeo a decenas hacia arriba", () => {
  it("sube a la decena siguiente y no toca los múltiplos exactos", () => {
    expect([22082.5, 14641, 14640, 14640.01, 9.99, 10, 0, -5, NaN].map(redondearDecenasArriba)).toEqual([22090, 14650, 14640, 14650, 10, 10, 0, 0, 0]);
  });
  it("no sube por errores de punto flotante", () => {
    expect(redondearDecenasArriba(0.1 + 0.2 + 99.7)).toBe(100);
    expect(redondearDecenasArriba(1120.0000000001)).toBe(1120);
  });
});

describe("búsqueda de destino", () => {
  it("ignora acentos y mayúsculas; exacto primero", () => {
    expect(buscarTarifa(tarifas, "nacional", "san luis potosi").nombre).toBe("San Luis Potosí");
    expect(buscarTarifa(tarifas, "nacional", "LEON").nombre).toBe("León");
    expect(sinAcentos("  Cd. Juárez ")).toBe("cd juarez");
  });
  it("por inicio solo si no hay ambigüedad; nunca elige al azar", () => {
    expect(buscarTarifa(tarifas, "nacional", "san juan").nombre).toBe("San Juan del Río");
    expect(buscarTarifa(tarifas, "nacional", "san")).toBeNull();
    expect(buscarTarifa(tarifas, "nacional", "Tijuana")).toBeNull();
    expect(buscarTarifa(tarifas, "nacional", "")).toBeNull();
  });
  it("no mezcla nacional con local ni devuelve tarifas dadas de baja", () => {
    expect(buscarTarifa(tarifas, "nacional", "viaje local")).toBeNull();
    expect(buscarTarifa(tarifas, "nacional", "baja")).toBeNull();
    expect(idTarifa("nacional", "San Luis Potosí")).toBe("nacional_san-luis-potosi");
  });
});

describe("precio de una tarifa", () => {
  it("toma el bloque pedido, redondea hacia arriba y agrega IVA 16 %", () => {
    expect(precioDeTarifa(tarifas[0], "cam", "cliente")).toEqual({ tarifa: 2240.56, redondeado: 2250, iva: 360, total: 2610, bloque: "cliente", unidad: "cam" });
    expect(precioDeTarifa(tarifas[0], "cam", "base").redondeado).toBe(2010);
  });
  it("si la tarifa no existe devuelve null: no se sustituye por otra unidad ni por el otro bloque", () => {
    expect(precioDeTarifa(tarifas[0], "rab", "cliente")).toBeNull();
    expect(precioDeTarifa(tarifas[4], "eur", "cliente")).toBeNull();
    expect(precioDeTarifa(null, "eur", "base")).toBeNull();
  });
});

describe("precio con porcentaje de ganancia", () => {
  it("sin ganancia es el precio base redondeado", () => {
    expect(precioConGanancia(tarifas[0], "cam", 0)).toMatchObject({ base: 2000.5, gananciaPct: 0, tarifa: 2000.5, redondeado: 2010, iva: 321.6, total: 2331.6 });
    expect(precioConGanancia(tarifas[0], "eur", "")).toMatchObject({ gananciaPct: 0, redondeado: 1000, ganancia: 0 });
  });
  it("agrega el porcentaje sobre el base y redondea hacia arriba", () => {
    expect(precioConGanancia(tarifas[0], "eur", 12)).toMatchObject({ base: 1000, gananciaPct: 12, tarifa: 1120, redondeado: 1120, ganancia: 120 });
    expect(precioConGanancia(tarifas[0], "cam", "10")).toMatchObject({ tarifa: 2200.55, redondeado: 2210, ganancia: 209.5 });
  });
  it("ignora porcentajes negativos o absurdos y no inventa si no hay base", () => {
    expect(precioConGanancia(tarifas[0], "eur", -20).redondeado).toBe(1000);
    expect(precioConGanancia(tarifas[0], "eur", 9999).gananciaPct).toBe(300);
    expect(precioConGanancia(tarifas[0], "rab", 10)).toBeNull();
    expect(precioConGanancia(null, "eur", 10)).toBeNull();
  });
});

describe("auditoría del tarifario", () => {
  it("factor del bloque cliente sobre el base", () => {
    expect(factorCliente(tarifas[0])).toBe(1.12);
    expect(factorCliente(t("X", { eur: 100 }, { eur: 110 }))).toBe(1.1);
    expect(factorCliente(t("X", { eur: 100, cam: 100 }, { eur: 110, cam: 112 }))).toBeNaN();
    expect(factorCliente(tarifas[4])).toBeNull();
  });
  it("valida precios positivos y avisa de cliente menor que base o falta de km", () => {
    expect(validarTarifa(tarifas[0])).toEqual({ ok: true, errores: [], avisos: [] });
    expect(validarTarifa({ tipo: "nacional", nombre: "", base: {} }).errores).toEqual(["Nombre", "Al menos un precio"]);
    expect(validarTarifa(t("X", { eur: -5 }, {})).errores).toEqual(["Eurovan 1 tonelada (base): debe ser mayor a cero", "Al menos un precio"]);
    expect(validarTarifa({ tipo: "nacional", nombre: "X", base: { eur: 100 }, cliente: { eur: 90 } }).avisos).toEqual(["Eurovan 1 tonelada: el precio cliente es menor que el base", "Sin kilometraje"]);
    expect(validarTarifa({ tipo: "local", nombre: "Entrega adicional", valorUnico: 1200 }).ok).toBe(true);
  });
  it("historial: solo los precios que cambiaron", () => {
    const antes = tarifas[0], despues = { ...antes, base: { ...antes.base, eur: 1100 }, cliente: { ...antes.cliente, rab: 5000 } };
    expect(diffTarifa(antes, despues)).toEqual([{ campo: "base.eur", antes: 1000, despues: 1100 }, { campo: "cliente.rab", antes: null, despues: 5000 }]);
    expect(diffTarifa(null, { tipo: "local", nombre: "X", valorUnico: 1200 })).toEqual([{ campo: "valorUnico", antes: null, despues: 1200 }]);
    expect(diffTarifa(antes, antes)).toEqual([]);
  });
  it("marca un precio objetivo por debajo del base", () => {
    expect(bajoElBase(tarifas[0], "eur", 900)).toBe(true);
    expect(bajoElBase(tarifas[0], "eur", "1,000")).toBe(false);
    expect(bajoElBase(tarifas[0], "rab", 900)).toBeNull();
  });
});
