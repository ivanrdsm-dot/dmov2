/* PARADAS · reglas para cerrar una entrega. Las decide el servidor.
   Lógica pura; probada en geo.test.js. */
import { evaluarGeocerca } from "./geo.js";

export const ESTADOS_PARADA = ["Pendiente", "En sitio", "Entregada", "Incidencia"];
export const TIPOS_INCIDENCIA = ["Cliente ausente", "Entrega rechazada", "Entrega parcial", "Faltantes", "Daños", "Devolución al origen"];
export const POSICION_MAX_EDAD_MS = 5 * 60000;   // la presencia se valida con una lectura reciente

/** ¿Se puede cerrar la parada? Devuelve el veredicto y por qué, para mostrárselo al chofer y dejarlo en bitácora. */
export function evaluarCierreParada({ parada, posicion, ahoraMs, evidencia = {}, excepcion = null }){
  const no = (motivo, extra = {}) => ({ permitido: false, motivo, ...extra });
  if(!parada) return no("Parada no encontrada");
  if(parada.estado === "Entregada") return no("Esta parada ya está cerrada");
  const fotos = Array.isArray(evidencia.fotos) ? evidencia.fotos.filter(Boolean) : [];
  if(fotos.length === 0) return no("Falta la foto de evidencia");
  if(!String(evidencia.receptor ?? "").trim()) return no("Falta el nombre de quien recibe");
  const cant = Number(evidencia.cantidadEntregada);
  if(evidencia.cantidadEntregada !== undefined && evidencia.cantidadEntregada !== "" && !(cant >= 0)) return no("La cantidad entregada no es válida");

  /* Excepción: solo cuenta si la autorizó la oficina para ESTA parada y trae motivo */
  if(excepcion){
    if(excepcion.paradaId === parada.id && String(excepcion.motivo ?? "").trim() && String(excepcion.autorizadaPor ?? "").trim())
      return { permitido: true, motivo: "", porExcepcion: true, distanciaM: null };
    return no("La excepción no es válida para esta parada");
  }
  if(!posicion || posicion.confiable === false) return no("No hay una ubicación confiable reciente. Sal a cielo abierto y vuelve a intentar.");
  if(!(ahoraMs - Number(posicion.tMs) <= POSICION_MAX_EDAD_MS)) return no("La última ubicación tiene más de 5 minutos. Espera a que se actualice.");
  const g = evaluarGeocerca(posicion, parada);
  if(!g.dentro) return no(g.motivo, { distanciaM: g.distanciaM, radioM: g.radioM, fueraDeGeocerca: g.distanciaM !== null && !g.precisionBaja });
  return { permitido: true, motivo: "", porExcepcion: false, distanciaM: g.distanciaM, radioM: g.radioM };
}

/** Validación del check-in de jornada (sin biometría: selfie de cámara + inspección de unidad). */
export function validarCheckIn(d){
  const errores = [];
  if(!String(d?.selfieRuta ?? "").trim()) errores.push("Selfie");
  if(!String(d?.unidadPlaca ?? "").trim()) errores.push("Placas de la unidad");
  if(!String(d?.fotoPlacasRuta ?? "").trim()) errores.push("Foto de las placas");
  if(!String(d?.fotoOdometroRuta ?? "").trim()) errores.push("Foto del odómetro");
  const km = Number(d?.odometroKm);
  if(!(km >= 0 && km < 2000000)) errores.push("Kilometraje");
  const comb = Number(d?.combustiblePct);
  if(!(comb >= 0 && comb <= 100)) errores.push("Nivel de combustible");
  return { ok: errores.length === 0, errores };
}
