/* Cálculo automático de gasolina y gastos del chofer (lógica pura, probada en gasolina.test.js).
   Con cada carga se calcula precio por litro y rendimiento (km/L) de la camioneta, y se buscan señales
   de engaño. Nada se inventa: si falta un dato, ese cálculo queda vacío. */

export const TIPOS_GASTO = ["gasolina", "caseta", "comida", "hotel", "refaccion", "otro"];
/* SUPUESTOS para detectar valores raros (ajustables): precio por litro razonable en México y litros por carga. */
export const GAS = { precioLitroMin: 15, precioLitroMax: 40, litrosMax: 200, rendimientoBajoPct: 0.7, gasolineraRadioM: 300 };

/** Rendimiento histórico de una camioneta a partir de sus cargas (ordenadas por km): km recorridos / litros cargados.
    Usa pares de cargas seguidas: los litros de la carga N rinden los km entre la N-1 y la N (tanque lleno a tanque lleno). */
export function rendimientoHistorico(cargas = []){
  const cs = cargas.filter(c => Number(c.odometroKm) > 0 && Number(c.litros) > 0).sort((a, b) => a.odometroKm - b.odometroKm);
  let km = 0, litros = 0;
  for(let i = 1; i < cs.length; i++){
    const d = cs[i].odometroKm - cs[i - 1].odometroKm;
    if(d > 0 && d < 3000){ km += d; litros += cs[i].litros; }
  }
  return litros > 0 ? Math.round((km / litros) * 10) / 10 : null;
}

/** Revisión de una carga de gasolina. Regresa los cálculos y las dudas (texto para la alerta). */
export function revisarCarga({ monto, litros, odometroKm, kmInicioJornada = null, cargaAnterior = null, rendimientoPromedio = null, hayGasolinera = null }, G = GAS){
  const dudas = [];
  const m = Number(monto), l = Number(litros), km = Number(odometroKm);
  const precioLitro = m > 0 && l > 0 ? Math.round((m / l) * 100) / 100 : null;
  if(precioLitro !== null && (precioLitro < G.precioLitroMin || precioLitro > G.precioLitroMax)) dudas.push(`precio por litro de $${precioLitro} fuera de lo normal`);
  if(l > G.litrosMax) dudas.push(`${l} litros en una sola carga`);
  if(Number(kmInicioJornada) > 0 && km > 0 && km < Number(kmInicioJornada)) dudas.push(`el tablero (${km} km) marca menos que en el check-in (${kmInicioJornada} km)`);
  if(hayGasolinera === false) dudas.push("no hay gasolinera en el lugar donde registró la carga");
  let kmDesdeAnterior = null, rendimiento = null;
  const prevKm = Number(cargaAnterior?.odometroKm);
  if(prevKm > 0 && km > 0){
    kmDesdeAnterior = km - prevKm;
    if(kmDesdeAnterior < 0) dudas.push(`el tablero (${km} km) marca menos que en la carga anterior (${prevKm} km)`);
    else if(l > 0 && kmDesdeAnterior < 3000) rendimiento = Math.round((kmDesdeAnterior / l) * 10) / 10;
  }
  if(rendimiento !== null && Number(rendimientoPromedio) > 0 && rendimiento < Number(rendimientoPromedio) * G.rendimientoBajoPct)
    dudas.push(`rindió ${rendimiento} km/L y la camioneta suele rendir ${rendimientoPromedio} km/L`);
  return { precioLitro, kmDesdeAnterior, rendimiento, dudas };
}

/** Resumen por camioneta (para el tablero): km, litros, gasto, rendimiento y costo por km. */
export function resumenUnidad(cargas = [], kmRecorridos = 0){
  const litros = cargas.reduce((s, c) => s + (Number(c.litros) || 0), 0), gasto = cargas.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const rend = rendimientoHistorico(cargas), km = Number(kmRecorridos) || 0;
  return { cargas: cargas.length, litros: Math.round(litros * 10) / 10, gasto: Math.round(gasto * 100) / 100, rendimiento: rend,
    costoPorKm: km > 0 && gasto > 0 ? Math.round((gasto / km) * 100) / 100 : null, km };
}
