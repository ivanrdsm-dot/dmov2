/* DISTRIBUCIÓN A PUNTOS DE VENTA · precio por camioneta y por día de trabajo.
   Decisión del dueño (2026-11-11): antes el precio dependía solo de cuántas
   camionetas salían, así que con más días salía MÁS BARATO. Ahora:
   - Primer día de cada camioneta: el flete del tarifario a esa ciudad (incluye el viaje).
   - Cada día extra de trabajo en la ciudad: "Renta por día con chofer" del tarifario.
   - Viáticos (comida y hotel) por cada día de ruta, incluidos los días de trabajo.
   Si falta un precio, no se inventa: se avisa. Lógica pura; probada en distribucion.test.js. */
import { diasRuta } from "./domain.ts";

export interface CiudadDist { c: string; km: number; tarifa: number; pdv: number; dias: number; }
export interface OpcionesDist {
  maxPorDia: number;            // puntos de venta que atiende una camioneta en un día
  precioDiaExtra: number | null; // renta por día con chofer de la unidad elegida (tarifario)
  personasPorVan: number;       // chofer + ayudantes
  comida: number; hotel: number; // reglas del tarifario
  urgentePct: number;           // recargo urgente (%), 0 si no es urgente
}
export interface RenglonDist {
  c: string; km: number; pdv: number; dias: number; vans: number;
  flete: number; diasExtra: number; montoDiasExtra: number; diasRutaTotal: number; noches: number;
  comida: number; hotel: number; subtotal: number; faltantes: string[];
}

const ent = (v: unknown, min = 0): number => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min ? n : min; };
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Camionetas necesarias para atender los PDV en los días dados. */
export const camionetasNecesarias = (pdv: number, maxPorDia: number, dias: number): number =>
  Math.max(1, Math.ceil(ent(pdv, 0) / (Math.max(1, ent(maxPorDia, 1)) * Math.max(1, ent(dias, 1)))));

export function renglonDistribucion(c: CiudadDist, o: OpcionesDist): RenglonDist {
  const dias = Math.max(1, ent(c.dias, 1)), km = Math.max(0, Number(c.km) || 0);
  const vans = camionetasNecesarias(c.pdv, o.maxPorDia, dias);
  const faltantes: string[] = [];
  const tarifa = Number(c.tarifa) > 0 ? Number(c.tarifa) : 0;
  if(!tarifa) faltantes.push(`${c.c}: sin tarifa para esta unidad`);
  const flete = tarifa * vans;
  const diasExtra = dias - 1;
  let montoDiasExtra = 0;
  if(diasExtra > 0){
    if(o.precioDiaExtra && o.precioDiaExtra > 0) montoDiasExtra = o.precioDiaExtra * vans * diasExtra;
    else faltantes.push(`${c.c}: falta el precio de "Renta por día con chofer" para esta unidad (días extra)`);
  }
  /* Viáticos solo fuera de la zona local: días de ruta = ida y vuelta + días extra de trabajo;
     hotel si el viaje pasa de 300 km (misma regla que el viaje foráneo). */
  const diasRutaTotal = km > 0 ? diasRuta(km).total + diasExtra : 0;
  const noches = km > 300 ? Math.max(1, diasRutaTotal - 1) : 0;
  const comida = (Number(o.comida) || 0) * Math.max(1, ent(o.personasPorVan, 1)) * vans * diasRutaTotal;
  const hotel = (Number(o.hotel) || 0) * vans * noches;
  return { c: c.c, km, pdv: ent(c.pdv, 0), dias, vans, flete: r2(flete), diasExtra, montoDiasExtra: r2(montoDiasExtra), diasRutaTotal, noches,
    comida: r2(comida), hotel: r2(hotel), subtotal: r2(flete + montoDiasExtra + comida + hotel), faltantes };
}

export function cotizarDistribucion(ciudades: CiudadDist[], o: OpcionesDist){
  const renglones = (ciudades ?? []).map(c => renglonDistribucion(c, o));
  const transporte = r2(renglones.reduce((a, r) => a + r.flete + r.montoDiasExtra, 0));
  const urgente = r2(transporte * (Number(o.urgentePct) || 0) / 100);
  const comida = r2(renglones.reduce((a, r) => a + r.comida, 0)), hotel = r2(renglones.reduce((a, r) => a + r.hotel, 0));
  const subtotal = r2(transporte + urgente + comida + hotel);
  return { renglones, transporte, urgente, comida, hotel, subtotal, iva: r2(subtotal * 0.16), total: r2(subtotal * 1.16),
    vans: renglones.reduce((a, r) => a + r.vans, 0), pdv: renglones.reduce((a, r) => a + r.pdv, 0),
    faltantes: renglones.flatMap(r => r.faltantes) };
}
