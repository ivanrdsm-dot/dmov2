import { describe, it, expect } from "vitest";
import { parsearCoordenadas, dentroDeMexico, validarPunto, puntoListoParaRuta, radioDe, coordenadaDe,
  estadoDocumento, validarProveedor, proveedorHabilitado } from "./catalogos.ts";

describe("coordenadas", () => {
  it("lee el formato que copia Google Maps", () => {
    expect(parsearCoordenadas("19.432608, -99.133209")).toEqual({ lat: 19.432608, lng: -99.133209 });
    expect(parsearCoordenadas("(19.4326,-99.1332)")).toEqual({ lat: 19.4326, lng: -99.1332 });
    expect(parsearCoordenadas("19.4326 -99.1332")).toEqual({ lat: 19.4326, lng: -99.1332 });
  });
  it("rechaza texto, rangos imposibles y direcciones", () => {
    for(const t of ["", "Av. Reforma 222", "19.43", "95, -99", "19.4, -200", "19,43, -99,13"]) expect(parsearCoordenadas(t)).toBeNull();
  });
  it("detecta coordenadas fuera de México, como las invertidas", () => {
    expect(dentroDeMexico({ lat: 19.43, lng: -99.13 })).toBe(true);
    expect(dentroDeMexico({ lat: -99.13, lng: 19.43 })).toBe(false);
  });
});

describe("puntos de entrega", () => {
  const punto = () => ({ nombre: "CEDIS Ejemplo", direccion: "Av. Uno 100", lat: 19.43, lng: -99.13, pinConfirmado: true, horario: "8 a 14", contacto: "Recibo" });
  it("un punto completo no tiene pendientes y está listo para ruta", () => {
    expect(validarPunto(punto())).toEqual({ ok: true, errores: [], pendientes: [], avisos: [] });
    expect(puntoListoParaRuta(punto())).toBe(true);
  });
  it("exige nombre y dirección; lo demás queda pendiente", () => {
    expect(validarPunto({}).errores).toEqual(["Nombre del punto", "Dirección"]);
    const v = validarPunto({ nombre: "X", direccion: "Y" });
    expect(v.ok).toBe(true);
    expect(v.pendientes).toEqual(["Coordenada", "Horario de recepción", "Contacto que recibe"]);
  });
  it("sin pin confirmado no se usa en ruta, aunque tenga coordenada", () => {
    const p = { ...punto(), pinConfirmado: false };
    expect(validarPunto(p).pendientes).toEqual(["Confirmar el pin en el mapa"]);
    expect(puntoListoParaRuta(p)).toBe(false);
    expect(puntoListoParaRuta({ ...punto(), activo: false })).toBe(false);
    expect(puntoListoParaRuta({ ...punto(), lat: "", lng: "" })).toBe(false);
  });
  it("coordenada mal escrita es error; fuera de México es aviso", () => {
    expect(validarPunto({ ...punto(), lat: "abc", lng: "-99" }).errores).toEqual(["Coordenada con formato latitud, longitud"]);
    expect(validarPunto({ ...punto(), lat: 40.4168, lng: -3.7038 }).avisos).toHaveLength(1);                 // válida, pero no es México
    expect(validarPunto({ ...punto(), lat: -99.13, lng: 19.43 }).errores).toHaveLength(1);                   // invertida: latitud imposible
    expect(coordenadaDe({ lat: "19.5", lng: "-99.2" })).toEqual({ lat: 19.5, lng: -99.2 });
  });
  it("radio de geocerca: default 150 m y límites", () => {
    expect(radioDe({})).toBe(150);
    expect(radioDe({ radioM: "300" })).toBe(300);
    expect(radioDe({ radioM: 5 })).toBe(150);
    expect(validarPunto({ ...punto(), radioM: 5 }).errores).toEqual(["Radio de geocerca entre 30 y 2,000 metros"]);
  });
});

describe("proveedores", () => {
  const hoy = "2026-11-10";
  it("estado de un documento por fecha", () => {
    expect(estadoDocumento("", hoy)).toBe("sin registrar");
    expect(estadoDocumento("2026-11-09", hoy)).toBe("vencido");
    expect(estadoDocumento("2026-11-10", hoy)).toBe("por vencer");
    expect(estadoDocumento("2026-12-10", hoy)).toBe("por vencer");
    expect(estadoDocumento("2026-12-11", hoy)).toBe("vigente");
  });
  it("valida nombre y comisión; lo demás queda pendiente", () => {
    expect(validarProveedor({}).errores).toEqual(["Nombre del proveedor"]);
    expect(validarProveedor({ nombre: "P", comisionPct: 130 }).errores).toEqual(["Comisión entre 0 y 100 %"]);
    expect(validarProveedor({ nombre: "P" }).pendientes).toEqual(["Persona de contacto", "Teléfono", "Comisión acordada", "Unidades que ofrece"]);
    expect(validarProveedor({ nombre: "P", contacto: "C", telefono: "55", comisionPct: 0, unidades: "1 rabón" })).toEqual({ ok: true, errores: [], pendientes: [] });
  });
  it("no queda habilitado sin seguro y tarjeta de circulación vigentes", () => {
    expect(proveedorHabilitado({ nombre: "P" }, hoy)).toEqual({ habilitado: false, motivos: ["Seguro vigente de la unidad: sin registrar", "Tarjeta de circulación: sin registrar"] });
    expect(proveedorHabilitado({ nombre: "P", documentos: { seguroUnidad: "2026-01-01", tarjetaCirculacion: "2027-01-01" } }, hoy).motivos).toEqual(["Seguro vigente de la unidad: vencido"]);
    expect(proveedorHabilitado({ nombre: "P", documentos: { seguroUnidad: "2026-11-20", tarjetaCirculacion: "2027-01-01" } }, hoy).habilitado).toBe(true);
    expect(proveedorHabilitado({ nombre: "P", activo: false, documentos: { seguroUnidad: "2027-01-01", tarjetaCirculacion: "2027-01-01" } }, hoy).motivos).toEqual(["Proveedor dado de baja"]);
  });
});
