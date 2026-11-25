import { describe, it, expect } from "vitest";
import { medirRuta, tarjetasOperadores, calificar, volumenHistorico, REGLAS_INCENTIVO } from "./desempeno.ts";

const T = Date.parse("2026-11-25T09:00:00-06:00"), M = 60000;
const ruta = (extra: any = {}) => ({ id: "r1", choferId: "c1", estado: "Entregada", salidaMs: T, finMs: T + 120 * M, estimadoManejoSeg: 80 * 60,
  paradas: [
    { tipo: "carga", estado: "Entregada", llegadaMs: T + 10 * M, cerradaMs: T + 25 * M, conFoto: true, conFirmaOReceptor: true },
    { tipo: "entrega", estado: "Entregada", llegadaMs: T + 60 * M, cerradaMs: T + 80 * M, conFoto: true, conFirmaOReceptor: true },
    { tipo: "entrega", estado: "Entregada", llegadaMs: T + 105 * M, cerradaMs: T + 120 * M, conFoto: true, conFirmaOReceptor: false },
  ], ...extra });

describe("medir una ruta", () => {
  it("separa manejo de tiempo en sitio y compara contra el estimado", () => {
    const m = medirRuta(ruta());
    expect(m.totalMin).toBe(120); expect(m.enSitioMin).toBe(50); expect(m.manejoMin).toBe(70);
    expect(m.estimadoMin).toBe(80); expect(m.eficiencia).toBe(114);   // manejó 70 min de 80 estimados
    expect(m.entregas).toBe(2); expect(m.conEvidencia).toBe(1); expect(m.minPorParada).toBe(40);
  });
  it("sin llegadas por GPS no inventa el manejo", () => {
    const r = ruta(); r.paradas[1].llegadaMs = null as any;
    const m = medirRuta(r);
    expect(m.totalMin).toBe(120); expect(m.manejoMin).toBe(null); expect(m.eficiencia).toBe(null);
  });
  it("las quitadas no cuentan", () => {
    const r = ruta(); r.paradas.push({ tipo: "entrega", estado: "Quitada" } as any);
    expect(medirRuta(r).paradas).toBe(3);
  });
});

describe("tarjeta del operador e incentivo", () => {
  it("califica con buenos números y sin trampas", () => {
    const rutas = [1, 2, 3, 4].map(i => { const r = ruta({ id: "r" + i }); r.paradas[2].conFirmaOReceptor = true; return r; });
    const js = [1, 2, 3, 4].map(i => ({ choferId: "c1", fecha: "2026-11-0" + i, llegoTarde: false }));
    const [t] = tarjetasOperadores(rutas, js, [], { c1: "Elías" });
    expect(t.nombre).toBe("Elías"); expect(t.rutas).toBe(4); expect(t.puntualidad).toBe(100); expect(t.evidencia).toBe(100); expect(t.eficiencia).toBe(114);
    expect(t.incentivo.estado).toBe("Califica");
  });
  it("una alerta de engaño lo descalifica aunque lo demás esté bien", () => {
    const r = calificar({ rutas: 10, puntualidad: 100, evidencia: 100, eficiencia: 120, trampas: 1 });
    expect(r.estado).toBe("No califica");
    expect(r.reglas.find(x => !x.ok)?.regla).toContain("engaño");
  });
  it("le falta una regla → Casi, y dice cuál", () => {
    const r = calificar({ rutas: 10, puntualidad: 80, evidencia: 100, eficiencia: 100, trampas: 0 });
    expect(r.estado).toBe("Casi"); expect(r.reglas.filter(x => !x.ok)).toHaveLength(1);
  });
  it("sin datos no califica (no se regala)", () => {
    expect(calificar({ rutas: 0, puntualidad: null, evidencia: null, eficiencia: null, trampas: 0 }).estado).toBe("No califica");
    expect(REGLAS_INCENTIVO.trampasMax).toBe(0);
  });
  it("retardos y minutos tarde", () => {
    const js = [{ choferId: "c2", llegoTarde: true, tardeMin: 23 }, { choferId: "c2", llegoTarde: false }];
    const [t] = tarjetasOperadores([], js);
    expect(t.retardos).toBe(1); expect(t.minTarde).toBe(23); expect(t.puntualidad).toBe(50);
  });
});

describe("bitácora histórica", () => {
  it("cuenta viajes por chofer y mes, con viajes compartidos", () => {
    const v = volumenHistorico([{ fechaServicio: "2026-05-04", choferIds: ["a", "b"] }, { fechaServicio: "2026-06-01", choferId: "a" }], { a: "Israel" });
    expect(v[0]).toMatchObject({ choferId: "a", nombre: "Israel", viajes: 2, porMes: { "2026-05": 1, "2026-06": 1 } });
  });
});
