/* Reglas del check-in / check-out (lógica pura, probada en jornadaReglas.test.js).
   El servidor las usa para registrar llegadas tarde, detectar a un chofer fuera de la Ciudad de México
   sin una ruta que lo explique y comparar los kilómetros del tablero contra el GPS. */
import { distanciaM, coordenadaValida } from "./geo.js";

/* Zona metropolitana del Valle de México: círculo desde el Zócalo. 45 km cubre CDMX y municipios conurbados
   (Ecatepec, Naucalpan, Tlalnepantla, Nezahualcóyotl, Chalco, Cuautitlán); Toluca, Pachuca y Cuernavaca quedan fuera. */
export const ZONA_CDMX = { lat: 19.4326, lng: -99.1332, radioKm: 45 };
/* Una ruta "explica" dónde está el chofer si alguna de sus paradas recientes queda a esta distancia o menos. */
export const RADIO_RUTA_COHERENTE_KM = 40;
/* Kilómetros: tablero vs GPS. Se avisa si difieren más de esto (lo que sea mayor). */
export const KM_DIFERENCIA_MIN = 15, KM_DIFERENCIA_PCT = 0.35;

export const kmDesdeZocalo = pos => Math.round(distanciaM(pos, ZONA_CDMX) / 100) / 10;
export const fueraDeCdmx = (pos, zona = ZONA_CDMX) => coordenadaValida(pos) && distanciaM(pos, zona) > zona.radioKm * 1000;

/** ¿Alguna parada de sus rutas recientes queda cerca de donde está? */
export function rutaCoherente(pos, paradas = [], radioKm = RADIO_RUTA_COHERENTE_KM){
  return paradas.some(p => coordenadaValida(p) && distanciaM(pos, p) <= radioKm * 1000);
}

/** Minutos de la hora local de CDMX (UTC-6, sin horario de verano). */
export function minutosDelDiaCDMX(ms){
  const d = new Date(Number(ms) - 6 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
const aMin = hhmm => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

/** Llegada: minutos después de la hora de entrada. tarde = pasó de la tolerancia. */
export function llegada(checkInMs, horaEntrada = "07:00", toleranciaMin = 10){
  const despues = minutosDelDiaCDMX(checkInMs) - aMin(horaEntrada);
  return { minutosDespues: despues, tarde: despues > toleranciaMin, tardeMin: despues > toleranciaMin ? despues : 0 };
}

/** Kilómetros del tablero vs los que marcó el GPS en el día. Regresa el texto de la duda o "". */
export function dudaKilometros(kmTablero, kmGps){
  const t = Number(kmTablero), g = Number(kmGps);
  if(!(t >= 0) || !(g > 0)) return "";
  const dif = Math.abs(t - g), tope = Math.max(KM_DIFERENCIA_MIN, KM_DIFERENCIA_PCT * Math.max(t, g));
  return dif > tope ? `el tablero dice ${Math.round(t)} km y el GPS registró ${Math.round(g)} km` : "";
}

/** Distancia recorrida (km) sumando puntos GPS confiables en orden de tiempo. Ignora saltos de señal (>2 km entre puntos seguidos sin tiempo para recorrerlos). */
export function kmDePuntos(puntos = []){
  const ps = puntos.filter(p => coordenadaValida(p) && p.confiable !== false && !(Number(p.precisionM) > 200)).sort((a, b) => a.tMs - b.tMs);
  let m = 0, prev = ps[0];
  for(let i = 1; i < ps.length; i++){
    const d = distanciaM(prev, ps[i]), seg = Math.max(1, (ps[i].tMs - prev.tMs) / 1000);
    if(d / seg <= 45){ m += d; prev = ps[i]; }   // ≤ 162 km/h: movimiento real; un salto falso se descarta completo
  }
  return Math.round(m / 100) / 10;
}

/** Hora local "7:04 a.m." para avisos. */
export function horaCDMX(ms){
  return new Date(ms).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit" });
}

/** Hora de llegada a una parada según el GPS: inicio de la ÚLTIMA estancia continua dentro del radio
    antes de cerrar (si pasó antes por ahí y se fue, esa visita no cuenta). null si nunca entró. */
export function llegadaPorGps(puntos = [], parada, { desdeMs = 0, hastaMs = Infinity, radioM = 150 } = {}){
  if(!coordenadaValida(parada)) return null;
  const ps = puntos.filter(p => coordenadaValida(p) && p.confiable !== false && !(Number(p.precisionM) > 200) && p.tMs >= desdeMs && p.tMs <= hastaMs).sort((a, b) => a.tMs - b.tMs);
  const dentro = p => distanciaM(p, parada) <= radioM;
  let i = ps.length - 1;
  while(i >= 0 && !dentro(ps[i])) i--;
  if(i < 0) return null;
  while(i > 0 && dentro(ps[i - 1])) i--;
  return ps[i].tMs;
}
