/* Qué alertas llegan al celular de la oficina y con qué texto. Lógica pura (avisosOficina.test en vigilancia.test.js). */
export const ALERTAS_AL_CELULAR = {
  sos: "🚨 SOS del chofer", detenido: "⏸️ Chofer detenido", fuera_de_ruta: "🧭 Fuera de ruta", sin_ubicacion: "📵 Sin ubicación",
  sin_checkin: "⏰ Falta check-in", sin_checkout: "🌙 Jornada sin cerrar", checkin_dudoso: "⚠️ Check-in con dudas",
  ubicacion_simulada: "🛑 Ubicación falsa", velocidad_imposible: "🛑 Salto imposible de ubicación", reloj_adelantado: "🛑 Reloj manipulado",
  dispositivo_no_autorizado: "🔒 Celular no autorizado", incidencia: "⚠️ Incidencia en entrega", cierre_fuera_de_punto: "📍 Cierre fuera del punto",
};
export function avisoDeAlerta(a){
  const titulo = ALERTAS_AL_CELULAR[a?.type];
  if(!titulo || a.atendida === true) return null;
  const quien = String(a.choferNombre || "").trim();
  const texto = String(a.message || a.msg || "").trim() || (quien ? quien : "Revisa el sistema");
  return { title: titulo + (quien && !texto.includes(quien) ? " · " + quien : ""), body: texto.slice(0, 220), tag: "alerta-" + a.id, url: "/?v=operacion" };
}
