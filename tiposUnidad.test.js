import { describe, it, expect } from "vitest";
import { TIPOS_UNIDAD, tipoPorNombreFlota, tiposParaCotizar } from "./tiposUnidad.ts";
import { cotizar } from "./cotizacionAuto.ts";

describe("catálogo de tipos de unidad", () => {
  it("cada tipo tiene capacidades positivas, fuente y versión, y claves únicas", () => {
    expect(new Set(TIPOS_UNIDAD.map(t => t.clave)).size).toBe(TIPOS_UNIDAD.length);
    for(const t of TIPOS_UNIDAD){
      for(const k of ["capacidadKg", "capacidadM3", "tarimasPiso", "altoInteriorM"]) expect(t[k], `${t.clave}.${k}`).toBeGreaterThan(0);
      expect(t.fuente.length).toBeGreaterThan(5); expect(t.version.length).toBeGreaterThan(5);
      expect(t.confirmada).toBe(false);          // la referencia nunca se presenta como dato confirmado
    }
  });
  it("va de menor a mayor: más volumen nunca significa menos tarimas de piso", () => {
    const orden = [...TIPOS_UNIDAD].sort((a, b) => a.capacidadM3 - b.capacidadM3);
    for(let i = 1; i < orden.length; i++) expect(orden[i].tarimasPiso, orden[i].clave).toBeGreaterThanOrEqual(orden[i - 1].tarimasPiso);
  });
  it("las tarimas de piso caben físicamente en el largo y ancho interior declarados", () => {
    for(const t of TIPOS_UNIDAD){
      const derechas = Math.floor(t.largoInteriorM / 1.2 + 1e-9) * Math.floor(t.anchoInteriorM / 1.0 + 1e-9);
      const giradas = Math.floor(t.largoInteriorM / 1.0 + 1e-9) * Math.floor(t.anchoInteriorM / 1.2 + 1e-9);
      /* acomodo mixto: una fila con el lado de 1.2 m a lo ancho y otra con el de 1.0 m (necesita 2.2 m de ancho) */
      const mixto = t.anchoInteriorM >= 2.2 - 1e-9 ? Math.floor(t.largoInteriorM / 1.0 + 1e-9) + Math.floor(t.largoInteriorM / 1.2 + 1e-9) : 0;
      expect(t.tarimasPiso, t.clave).toBeLessThanOrEqual(Math.max(derechas, giradas, mixto));
    }
  });
  it("reconoce los nombres de tipo que usa Flota", () => {
    expect(tipoPorNombreFlota("Eurovan 1T").clave).toBe("transporter");
    expect(tipoPorNombreFlota(" krafter ").clave).toBe("crafter");
    expect(tipoPorNombreFlota("Otro")).toBeNull();
    expect(tipoPorNombreFlota("")).toBeNull();
  });
  it("solo torton y tráiler van sin tarifa y sin unidades propias", () => {
    expect(TIPOS_UNIDAD.filter(t => t.tarifa === null).map(t => t.clave)).toEqual(["torton", "trailer48", "trailer53"]);
    expect(TIPOS_UNIDAD.filter(t => t.enFlotaHabitual === 0).map(t => t.clave)).toEqual(["torton", "trailer48", "trailer53"]);
  });
});

describe("tiposParaCotizar: aprende de la flota real", () => {
  it("sin unidades tipificadas usa la referencia y las cantidades habituales", () => {
    const t = tiposParaCotizar([{ tipo: "", status: "Activa" }]);
    expect(t.find(x => x.clave === "transporter")).toMatchObject({ enFlota: 4, confirmada: false, capacidadKg: 943 });
  });
  it("con unidades tipificadas cuenta las activas de cada tipo", () => {
    const t = tiposParaCotizar([{ tipo: "VW Transporter" }, { tipo: "VW Transporter", status: "Baja" }, { tipo: "Rabón" }]);
    expect(t.find(x => x.clave === "transporter").enFlota).toBe(1);
    expect(t.find(x => x.clave === "rabon").enFlota).toBe(1);
    expect(t.find(x => x.clave === "sprinter").enFlota).toBe(0);
  });
  it("si la unidad tiene su capacidad capturada, manda la unidad y queda confirmada", () => {
    const t = tiposParaCotizar([{ tipo: "Mercedes Sprinter", capacidadKg: "1,661", capacidadM3: 14, capacidadTarimas: 4, altoCm: 200 },
      { tipo: "Mercedes Sprinter", capacidadKg: 1805, capacidadM3: 10.5, capacidadTarimas: 3 }]);
    expect(t.find(x => x.clave === "sprinter")).toMatchObject({ capacidadKg: 1661, capacidadM3: 10.5, tarimasPiso: 3, altoInteriorM: 2, enFlota: 2, confirmada: true });
    expect(t.find(x => x.clave === "crafter").confirmada).toBe(false);
  });
  it("una unidad con capacidad incompleta no reemplaza la referencia", () => {
    expect(tiposParaCotizar([{ tipo: "Rabón", capacidadKg: 9000 }]).find(x => x.clave === "rabon")).toMatchObject({ capacidadKg: 5400, confirmada: false, enFlota: 1 });
  });
});

describe("casos de logística con el catálogo real", () => {
  const TARIFAS = [{ tipo: "local", nombre: "Viaje local", base: { eur: 2500, cam: 3200, kra: 3600, rab: 6000, mud: 8000 } },
    { tipo: "local", nombre: "Viaje local con 1 ayudante y/o maniobra", base: { eur: 3000, cam: 4300, kra: 5000, rab: 8000, mud: 10000 } }];
  const tipos = tiposParaCotizar([]), anden = { tieneAnden: true, tieneMontacargas: true };
  const caso = (carga, extra = {}) => cotizar({ carga, tipoRuta: "local", origen: anden, destinoOp: anden, ...extra }, tipos, TARIFAS);
  it("2 tarimas van en Transporter; 3 ya piden Sprinter o Crafter", () => {
    expect(caso({ tarimas: 2, tarimaPesoKg: 400 }).unidad.tipo.clave).toBe("transporter");
    expect(["sprinter", "crafter"]).toContain(caso({ tarimas: 3, tarimaPesoKg: 250 }).unidad.tipo.clave);
  });
  it("10 tarimas no apilables piden rabón; apilables caben en la 3½ a dos niveles", () => {
    expect(caso({ tarimas: 10, tarimaPesoKg: 250, tarimaAltoM: 1.0, apilable: false }).unidad.tipo.clave).toBe("rabon");
    const ap = caso({ tarimas: 10, tarimaPesoKg: 250, tarimaAltoM: 1.0, apilable: true });
    expect(ap.unidad.tipo.clave).toBe("c35");
    expect(ap.unidad.estiba).toMatchObject({ niveles: 2, posicionesPiso: 5 });
  });
  it("el peso manda aunque quepa en el piso", () => {
    expect(caso({ tarimas: 2, tarimaPesoKg: 900 }).unidad.tipo.clave).toBe("c35");      // 1,800 kg no van en van de 1 t
  });
  it("lo que rebasa al mudancero se manda a proveedor con tráiler, sin precio inventado", () => {
    const c = caso({ tarimas: 22, tarimaPesoKg: 600, apilable: false });
    expect(c.unidad.tipo.clave).toBe("trailer48");
    expect(c.precio).toBeNull();
    expect(c.pendientes.join(" ")).toContain("cotizar con proveedor");
  });
});
