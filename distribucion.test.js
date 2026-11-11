import { describe, it, expect } from "vitest";
import { camionetasNecesarias, renglonDistribucion, cotizarDistribucion } from "./distribucion.ts";

const O = { maxPorDia: 20, precioDiaExtra: 5800, personasPorVan: 1, comida: 700, hotel: 1100, urgentePct: 0 };
const PUEBLA = { c: "Puebla", km: 123, tarifa: 7727.1, pdv: 100, dias: 1 };

describe("distribución: más días ya no sale más barato", () => {
  it("camionetas necesarias", () => {
    expect(camionetasNecesarias(100, 20, 1)).toBe(5);
    expect(camionetasNecesarias(100, 20, 5)).toBe(1);
    expect(camionetasNecesarias(0, 20, 1)).toBe(1);
  });
  it("mismos 100 PDV: 1 día con 5 camionetas o 5 días con 1; el de 5 días no es más barato que una camioneta sola", () => {
    const un = renglonDistribucion(PUEBLA, O), cinco = renglonDistribucion({ ...PUEBLA, dias: 5 }, O);
    expect(un).toMatchObject({ vans: 5, flete: 38635.5, diasExtra: 0, montoDiasExtra: 0 });
    expect(cinco).toMatchObject({ vans: 1, flete: 7727.1, diasExtra: 4, montoDiasExtra: 23200 });
    expect(cinco.subtotal).toBeGreaterThan(renglonDistribucion({ ...PUEBLA, pdv: 20, dias: 1 }, O).subtotal);
  });
  it("viáticos por cada día de ruta, incluidos los de trabajo; hotel solo arriba de 300 km", () => {
    const p = renglonDistribucion({ ...PUEBLA, dias: 3, pdv: 60 }, O);   // 1 van, ida y vuelta 2 días + 2 extra
    expect(p).toMatchObject({ vans: 1, diasRutaTotal: 4, noches: 0, comida: 2800, hotel: 0 });
    const mty = renglonDistribucion({ c: "Monterrey", km: 933, tarifa: 30000, pdv: 40, dias: 2 }, O);   // 1 van, ida y vuelta 4 días + 1
    expect(mty).toMatchObject({ vans: 1, diasRutaTotal: 5, noches: 4, comida: 3500, hotel: 4400 });
    const cdmx = renglonDistribucion({ c: "Ciudad de México", km: 0, tarifa: 3200, pdv: 40, dias: 2 }, O);
    expect(cdmx).toMatchObject({ comida: 0, hotel: 0, montoDiasExtra: 5800 });
  });
  it("lo que falta se avisa y no se inventa", () => {
    const r = renglonDistribucion({ ...PUEBLA, tarifa: 0, dias: 2 }, { ...O, precioDiaExtra: null });
    expect(r.faltantes).toEqual(["Puebla: sin tarifa para esta unidad", 'Puebla: falta el precio de "Renta por día con chofer" para esta unidad (días extra)']);
    expect(r.flete).toBe(0); expect(r.montoDiasExtra).toBe(0);
  });
  it("total con urgente sobre el transporte, viáticos aparte, IVA 16 %", () => {
    const t = cotizarDistribucion([{ ...PUEBLA, pdv: 20 }, { c: "Ciudad de México", km: 0, tarifa: 3200, pdv: 20, dias: 1 }], { ...O, urgentePct: 35 });
    expect(t).toMatchObject({ transporte: 10927.1, urgente: 3824.49, comida: 1400, hotel: 0, subtotal: 16151.59, vans: 2, pdv: 40, faltantes: [] });
    expect(t.total).toBe(18735.84);
  });
});
