/* GEO · validación de ubicación en el SERVIDOR. Nunca se confía en lo que diga el celular:
   aquí se decide si una posición es creíble y si un chofer está dentro de una geocerca.
   Lógica pura; probada en geo.test.js. */

export const RADIO_GEOCERCA_DEFAULT_M = 150;
/* Parámetros técnicos de plausibilidad (no son reglas de negocio): */
export const VELOCIDAD_MAX_KMH = 160;            // por encima, el salto entre dos puntos no es físicamente creíble
export const PRECISION_MAX_M = 200;              // lecturas con peor precisión no sirven para validar presencia
export const RELOJ_ADELANTADO_MAX_MS = 2 * 60000; // un punto "del futuro" indica reloj manipulado
export const ANTIGUEDAD_MAX_LOTE_MS = 72 * 3600000; // puntos guardados sin señal: se aceptan hasta 3 días

const rad = g => g * Math.PI / 180;
const esNum = v => typeof v === "number" && Number.isFinite(v);
export const coordenadaValida = p => !!p && esNum(p.lat) && esNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

/** Distancia en metros entre dos coordenadas (haversine). */
export function distanciaM(a, b){
  const R = 6371000, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ¿La posición cae dentro de la geocerca del punto? La precisión mala no se premia: se reporta. */
export function evaluarGeocerca(posicion, punto){
  if(!coordenadaValida(posicion)) return { dentro: false, motivo: "Sin posición válida", distanciaM: null, radioM: null };
  if(!coordenadaValida(punto)) return { dentro: false, motivo: "El punto no tiene coordenada verificada", distanciaM: null, radioM: null };
  const r = Number(punto.radioM), radioM = r >= 30 && r <= 2000 ? r : RADIO_GEOCERCA_DEFAULT_M;
  const d = Math.round(distanciaM(posicion, punto));
  const precision = esNum(posicion.precisionM) ? posicion.precisionM : null;
  if(precision !== null && precision > PRECISION_MAX_M)
    return { dentro: false, motivo: `La precisión del GPS es de ${Math.round(precision)} m; hace falta una lectura mejor`, distanciaM: d, radioM, precisionBaja: true };
  return d <= radioM ? { dentro: true, motivo: "", distanciaM: d, radioM } : { dentro: false, motivo: `Está a ${d} m del punto; el límite es ${radioM} m`, distanciaM: d, radioM };
}

/** Velocidad media en km/h entre dos puntos con hora (tMs). null si no se puede calcular. */
export function velocidadKmh(a, b){
  const dt = (b.tMs - a.tMs) / 1000;
  if(!(dt > 0)) return null;
  return distanciaM(a, b) / dt * 3.6;
}

/** Revisa un lote de posiciones enviado por la app. Devuelve qué se guarda, qué se rechaza y qué alertas levantar.
 *  Una posición simulada o con salto imposible SÍ se guarda (es evidencia), pero marcada como no confiable. */
export function validarLote(posiciones, { ahoraMs, ultimaConfiable = null } = {}){
  const aceptadas = [], rechazadas = [], alertas = [];
  const lote = (Array.isArray(posiciones) ? posiciones : []).slice(0, 500)
    .map((p, i) => ({ i, lat: Number(p?.lat), lng: Number(p?.lng), tMs: Number(p?.tMs), precisionM: Number(p?.precisionM), velocidadMs: Number(p?.velocidadMs),
      bateria: Number(p?.bateria), simulada: p?.simulada === true }))
    .sort((x, y) => x.tMs - y.tMs);
  let previa = ultimaConfiable && coordenadaValida(ultimaConfiable) ? ultimaConfiable : null;
  const vistos = new Set();
  for(const p of lote){
    if(!coordenadaValida(p)){ rechazadas.push({ i: p.i, motivo: "Coordenada inválida" }); continue; }
    if(!Number.isFinite(p.tMs) || p.tMs <= 0){ rechazadas.push({ i: p.i, motivo: "Sin hora" }); continue; }
    if(p.tMs > ahoraMs + RELOJ_ADELANTADO_MAX_MS){ rechazadas.push({ i: p.i, motivo: "Hora en el futuro" }); alertas.push({ tipo: "reloj_adelantado", tMs: p.tMs }); continue; }
    if(p.tMs < ahoraMs - ANTIGUEDAD_MAX_LOTE_MS){ rechazadas.push({ i: p.i, motivo: "Demasiado antigua" }); continue; }
    if(vistos.has(p.tMs)){ rechazadas.push({ i: p.i, motivo: "Duplicada" }); continue; }
    vistos.add(p.tMs);
    const punto = { lat: p.lat, lng: p.lng, tMs: p.tMs,
      precisionM: Number.isFinite(p.precisionM) && p.precisionM >= 0 ? Math.round(p.precisionM) : null,
      velocidadMs: Number.isFinite(p.velocidadMs) && p.velocidadMs >= 0 ? Math.round(p.velocidadMs * 10) / 10 : null,
      bateria: Number.isFinite(p.bateria) && p.bateria >= 0 && p.bateria <= 100 ? Math.round(p.bateria) : null,
      simulada: p.simulada, confiable: true };
    if(p.simulada){ punto.confiable = false; alertas.push({ tipo: "ubicacion_simulada", tMs: p.tMs, lat: p.lat, lng: p.lng }); }
    else if(previa){
      const v = velocidadKmh(previa, punto);
      if(v !== null && v > VELOCIDAD_MAX_KMH && distanciaM(previa, punto) > 500){
        punto.confiable = false; punto.velocidadImposibleKmh = Math.round(v);
        alertas.push({ tipo: "velocidad_imposible", tMs: p.tMs, kmh: Math.round(v), lat: p.lat, lng: p.lng });
      }
    }
    if(punto.confiable) previa = punto;
    aceptadas.push(punto);
  }
  /* Una alerta por tipo y lote es suficiente para operaciones */
  const unicas = [...new Map(alertas.map(a => [a.tipo, a])).values()];
  return { aceptadas, rechazadas, alertas: unicas, ultimaConfiable: previa };
}
