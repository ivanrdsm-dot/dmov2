import { describe, it, expect } from "vitest";
import { vistaPublica, validarEncuesta, paginaSeguimiento, tokenValido } from "./functions/lib/seguimiento.js";

const S = { folio: "SRV-2026-0007", empresa: "Cliente", estado: "En ruta", fechaServicio: "2026-11-12", horaServicio: "9:00",
  choferNombre: "Juan Pérez López", unidadPlaca: "ABC-123", precio: 3500, costoTotal: 2100, notas: "INTERNO: pagar rápido", choferTel: "5555555555",
  estadoTs: { Solicitud: 1000, Confirmada: 2000, Asignada: 3000, "En ruta": 4000 }, destinos: [{ nombre: "Tienda 1", direccion: "Calle 1" }] };
const P = [{ tipo: "carga", nombre: "CEDIS", estado: "Entregada" }, { tipo: "entrega", nombre: "Tienda 1", estado: "Entregada", cerradaEn: 5000, evidencia: { receptor: "Ana" } },
  { tipo: "entrega", nombre: "Tienda 2", estado: "Pendiente", lat: 19.4, lng: -99.1 }];

describe("lo que ve el cliente", () => {
  const v = vistaPublica(S, P);
  it("etapa, chofer de pila y entregas; sin dinero, placas, teléfonos, notas ni coordenadas", () => {
    expect(v).toMatchObject({ folio: "SRV-2026-0007", etapa: 3, chofer: "Juan", entregadas: 1, puedeCalificar: false });
    expect(v.etapas.map(e => e.hecho)).toEqual([true, true, true, true, false]);
    expect(v.entregas).toEqual([{ lugar: "Tienda 1", estado: "Entregado", hora: 5000, recibio: "Ana" }, { lugar: "Tienda 2", estado: "Pendiente", hora: null, recibio: "" }]);
    const todo = JSON.stringify(v) + paginaSeguimiento(v);
    for(const x of ["3500", "2100", "INTERNO", "ABC-123", "5555555555", "Pérez", "19.4", "-99.1", "Calle 1"]) expect(todo).not.toContain(x);
  });
  it("antes de asignar no se muestra chofer; entregado permite calificar una vez; cancelado lo dice", () => {
    expect(vistaPublica({ ...S, estado: "Confirmada" }).chofer).toBe("");
    expect(vistaPublica({ ...S, estado: "Entregada" }).puedeCalificar).toBe(true);
    expect(vistaPublica({ ...S, estado: "Entregada", encuestaRespondida: true })).toMatchObject({ puedeCalificar: false, yaCalifico: true });
    const c = vistaPublica({ ...S, estado: "Cancelada" });
    expect(c.cancelado).toBe(true); expect(c.etapas.every(e => !e.hecho)).toBe(true);
    expect(paginaSeguimiento(c)).toContain("cancelado");
  });
  it("la página escapa todo lo que viene de la base", () => {
    const html = paginaSeguimiento(vistaPublica({ ...S, empresa: "<script>alert(1)</script>" }, P));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("encuesta y token", () => {
  it("de 1 a 5, comentario recortado", () => {
    expect(validarEncuesta({ calificacion: "5", comentario: "Muy bien" })).toEqual({ ok: true, calificacion: 5, comentario: "Muy bien" });
    expect(validarEncuesta({ calificacion: 0 }).ok).toBe(false);
    expect(validarEncuesta({ calificacion: 9 }).ok).toBe(false);
    expect(validarEncuesta({ calificacion: 3, comentario: "x".repeat(900) }).comentario).toHaveLength(600);
  });
  it("solo tokens largos y seguros", () => {
    expect(tokenValido("a".repeat(43))).toBe(true);
    expect(tokenValido("corto")).toBe(false);
    expect(tokenValido("a".repeat(40) + "/../")).toBe(false);
  });
});
