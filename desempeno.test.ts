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

describe("ruta con 2 choferes", () => {
  it("la ruta cuenta a los dos", () => {
    const r: any = ruta({ segundoChoferId: "c2" });
    const ts = tarjetasOperadores([r], [], [], { c1: "Elías", c2: "Israel" });
    expect(ts.map(t => t.choferId).sort()).toEqual(["c1", "c2"]);
    expect(ts.every(t => t.rutas === 1 && t.entregas === 2)).toBe(true);
  });
});

describe("bitácora histórica", () => {
  it("cuenta viajes por chofer y mes, con viajes compartidos", () => {
    const v = volumenHistorico([{ fechaServicio: "2026-05-04", choferIds: ["a", "b"] }, { fechaServicio: "2026-06-01", choferId: "a" }], { a: "Israel" });
    expect(v[0]).toMatchObject({ choferId: "a", nombre: "Israel", viajes: 2, porMes: { "2026-05": 1, "2026-06": 1 } });
  });
});

describe("hora pactada con el cliente", () => {
  it("mide si llegó antes de lo pactado (+10 min de gracia)", () => {
    const r: any = ruta({ fechaServicio: "2026-11-25" });
    r.paradas[1].horaPactada = "10:05";   // llegó 10:00 → a tiempo
    r.paradas[2].horaPactada = "10:20";   // llegó 10:45 → 15 min tarde (sobre 10:30)
    const m = medirRuta(r);
    expect(m.conPactada).toBe(2); expect(m.aTiempoCliente).toBe(1); expect(m.minTardeCliente).toBe(15);
    const [t] = tarjetasOperadores([r]);
    expect(t.aTiempoCliente).toBe(50);
    expect(t.incentivo.reglas.find(x => /cliente/.test(x.regla))?.ok).toBe(false);
  });
  it("sin horas pactadas no aplica (no castiga al chofer)", () => {
    const c = calificar({ rutas: 5, puntualidad: 100, evidencia: 100, eficiencia: 100, trampas: 0, aTiempoCliente: null });
    expect(c.estado).toBe("Califica");
  });
});

import { costosOperador, resumenCamionetas } from "./desempeno.ts";
describe("km, gasolina y costo", () => {
  const js = [{ choferId: "c1", kmRecorridos: 120, kmGps: 115, unidadPlaca: "NXE007C" }, { choferId: "c1", kmRecorridos: 80, kmGps: 82, unidadPlaca: "NXE007C" }];
  const gs = [{ choferId: "c1", tipo: "gasolina", monto: 1200, litros: 50, unidadPlaca: "NXE007C" }, { choferId: "c1", tipo: "caseta", monto: 150 },
    { choferId: "c1", tipo: "comida", monto: 999, estado: "rechazado" }, { choferId: "c1", tipo: "gasolina", monto: 600, litros: 25, unidadPlaca: "NXE007C", dudas: ["precio raro"] }];
  it("por chofer: km, gasolina, otros y costo por km (sin rechazados)", () => {
    expect(costosOperador("c1", js as any, gs as any)).toMatchObject({ km: 200, kmGps: 197, gasolina: 1800, litros: 75, otros: 150, total: 1950, costoGasKm: 9, gastosDudosos: 1 });
  });
  it("por camioneta: rendimiento y costo por km", () => {
    const [c] = resumenCamionetas(js as any, gs as any);
    expect(c).toMatchObject({ placa: "NXE007C", dias: 2, km: 200, cargas: 2, litros: 75, gasto: 1800, rendimiento: 2.7, costoKm: 9, precioLitro: 24, dudas: 1 });
  });
  it("sin cargas no inventa rendimiento", () => {
    expect(resumenCamionetas([{ choferId: "c2", kmRecorridos: 50, unidadPlaca: "AAA" }] as any, [])[0].rendimiento).toBe(null);
  });
});
