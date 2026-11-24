import { describe, it, expect } from "vitest";
import { coordenadaDeEnlace, geohashACoordenada, nombreDeEnlace, busquedaDeEnlace, esEnlaceMapa } from "./functions/lib/enlaces.js";

describe("links de Google Maps y Waze", () => {
  it("Google: el punto exacto del lugar gana sobre el centro del mapa", () => {
    const u = "https://www.google.com/maps/place/Walmart+Coyoac%C3%A1n/@19.3500000,-99.1600000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d19.3512345!4d-99.1623456";
    expect(coordenadaDeEnlace(u)).toEqual({ lat: 19.351235, lng: -99.162346 });
    expect(nombreDeEnlace(u)).toBe("Walmart Coyoacán");
  });
  it("Google: q=, destination=, /dir/ y coordenadas sueltas", () => {
    expect(coordenadaDeEnlace("https://maps.google.com/?q=19.4326,-99.1332")).toEqual({ lat: 19.4326, lng: -99.1332 });
    expect(coordenadaDeEnlace("https://www.google.com/maps/dir/?api=1&destination=19.43%2C-99.13")).toEqual({ lat: 19.43, lng: -99.13 });
    expect(coordenadaDeEnlace("https://www.google.com/maps/dir/Mi+ubicacion/19.41,-99.17/")).toEqual({ lat: 19.41, lng: -99.17 });
    expect(coordenadaDeEnlace("-99.1332, 19.4326")).toEqual({ lat: 19.4326, lng: -99.1332 });   // al revés
  });
  it("Waze: ll= y geohash", () => {
    expect(coordenadaDeEnlace("https://waze.com/ul?ll=19.4326%2C-99.1332&navigate=yes")).toEqual({ lat: 19.4326, lng: -99.1332 });
    const g = coordenadaDeEnlace("https://www.waze.com/ul/h9g3qrkq3t");
    expect(Math.abs(g.lat - 19.43)).toBeLessThan(0.05); expect(Math.abs(g.lng + 99.13)).toBeLessThan(0.05);
    expect(geohashACoordenada("no-es")).toBe(null);
  });
  it("sin coordenada: saca el texto buscado", () => {
    expect(busquedaDeEnlace("https://www.google.com/maps?q=Av.+Insurgentes+Sur+1234,+CDMX")).toBe("Av. Insurgentes Sur 1234, CDMX");
    expect(coordenadaDeEnlace("https://www.google.com/maps?q=Av.+Insurgentes+Sur+1234")).toBe(null);
  });
  it("reconoce links de mapas", () => {
    for(const u of ["https://maps.app.goo.gl/AbC123", "https://goo.gl/maps/xyz", "https://www.google.com.mx/maps/place/x", "https://waze.com/ul/h9g3q"]) expect(esEnlaceMapa(u)).toBe(true);
    expect(esEnlaceMapa("https://example.com/maps")).toBe(false);
  });
});
