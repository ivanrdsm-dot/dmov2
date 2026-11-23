import { describe, it, expect } from "vitest";
import { coordenadaDeTexto, esEnlaceCortoMaps, buscarEnCatalogo, correoDeChofer, telefono10, enlaceNavegar } from "./lugares.ts";

describe("coordenadaDeTexto", () => {
  it("lee una coordenada escrita", () => {
    expect(coordenadaDeTexto("19.432608, -99.133209")).toEqual({ lat: 19.432608, lng: -99.133209 });
    expect(coordenadaDeTexto("19.4326 -99.1332")).toEqual({ lat: 19.4326, lng: -99.1332 });
  });
  it("voltea lat/lng si vienen al revés en México", () => {
    expect(coordenadaDeTexto("-99.1332, 19.4326")).toEqual({ lat: 19.4326, lng: -99.1332 });
  });
  it("lee enlaces largos de Google Maps; prefiere el punto exacto del lugar", () => {
    expect(coordenadaDeTexto("https://www.google.com/maps/place/Walmart/@19.40,-99.17,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d19.4012345!4d-99.1712345"))
      .toEqual({ lat: 19.401235, lng: -99.171235 });
    expect(coordenadaDeTexto("https://www.google.com/maps/@19.41,-99.16,15z")).toEqual({ lat: 19.41, lng: -99.16 });
    expect(coordenadaDeTexto("https://maps.google.com/?q=19.42,-99.15")).toEqual({ lat: 19.42, lng: -99.15 });
    expect(coordenadaDeTexto("https://www.google.com/maps/search/?api=1&query=19.43%2C-99.14")).toEqual({ lat: 19.43, lng: -99.14 });
  });
  it("texto normal no es coordenada", () => {
    expect(coordenadaDeTexto("Walmart Plaza Universidad")).toBeNull();
    expect(coordenadaDeTexto("")).toBeNull();
    expect(coordenadaDeTexto("0, 0")).toBeNull();
    expect(coordenadaDeTexto("Calle 5 #120, 03100")).toBeNull();
  });
  it("detecta enlaces cortos que no traen coordenada", () => {
    expect(esEnlaceCortoMaps("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(esEnlaceCortoMaps("https://www.google.com/maps/@19.4,-99.1,15z")).toBe(false);
  });
});

describe("buscarEnCatalogo", () => {
  const lugares = [
    { id: "a", nombre: "Bodega Iztapalapa", direccion: "Av. Tláhuac 100", pinConfirmado: false },
    { id: "b", nombre: "Walmart Coyoacán", direccion: "Av. Universidad 1000", pinConfirmado: true },
    { id: "c", nombre: "Walmart Toluca", direccion: "Paseo Tollocan", pinConfirmado: true, activo: false },
  ];
  it("todas las palabras, sin importar acentos; los de baja no salen", () => {
    expect(buscarEnCatalogo(lugares, "walmart").map(l => l.id)).toEqual(["b"]);
    expect(buscarEnCatalogo(lugares, "tlahuac bodega").map(l => l.id)).toEqual(["a"]);
    expect(buscarEnCatalogo(lugares, "x")).toEqual([]);
  });
});

describe("cuenta del chofer", () => {
  it("con celular arma un correo interno; con correo lo respeta", () => {
    expect(correoDeChofer("55 1234 5678")).toBe("5512345678@choferes.denmovimiento.mx");
    expect(correoDeChofer("+52 1 55 1234 5678")).toBe("5512345678@choferes.denmovimiento.mx");
    expect(correoDeChofer("Elias@Correo.com")).toBe("elias@correo.com");
    expect(correoDeChofer("12345")).toBe("");
    expect(telefono10("044 55-1234-5678")).toBe("5512345678");
  });
  it("enlace de navegación", () => {
    expect(enlaceNavegar({ lat: 19.4, lng: -99.1 })).toContain("destination=19.4,-99.1");
  });
});
