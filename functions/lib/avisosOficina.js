/* Qué alertas llegan al celular de la oficina y con qué texto. Lógica pura (avisosOficina.test en vigilancia.test.js). */
export const ALERTAS_AL_CELULAR = {
  sos: "🚨 SOS del chofer", detenido: "⏸️ Chofer detenido", fuera_de_ruta: "🧭 Fuera de ruta", sin_ubicacion: "📵 Sin ubicación",
  sin_checkin: "⏰ Falta check-in", sin_checkout: "🌙 Jornada sin cerrar", checkin_dudoso: "⚠️ Check-in con dudas",
  ubicacion_simulada: "🛑 Ubicación falsa", velocidad_imposible: "🛑 Salto imposible de ubicación", reloj_adelantado: "🛑 Reloj manipulado",
  dispositivo_no_autorizado: "🔒 Celular no autorizado", incidencia: "⚠️ Incidencia en entrega", cierre_fuera_de_punto: "📍 Cierre fuera del punto", ruta_excedida: "🛣️ Ruta foránea pasada de días", cambio_sin_enterado: "🔔 Chofer sin confirmar cambio de ruta",
  fuera_de_cdmx: "🗺️ Fuera de CDMX sin ruta", km_no_coinciden: "🛑 Kilómetros no coinciden", unidad_no_coincide: "🚚 Otra camioneta", gasto_dudoso: "⛽ Gasto que no cuadra", movimiento_sin_ruta: "🕵️ Se movió sin ruta asignada", km_sin_explicar: "🕵️ Kilómetros sin explicar",
};
/* Avisos que solo informan (no hay que atenderlos): llegan al celular aunque la alerta nazca cerrada. */
export const AVISOS_INFORMATIVOS = {
  checkin_registrado: "✅ Check-in", checkin_tarde: "⏰ Check-in TARDE", checkout_registrado: "🏁 Check-out", checkin_oficina: "🏢 Entrada (oficina)", checkin_oficina_tarde: "⏰ Entrada TARDE (oficina)", checkout_oficina: "🏢 Salida (oficina)", resumen_diario: "📋 Resumen del día", ruta_asignada: "🚚 Ruta asignada",
};
/* Avisos que puede recibir operaciones (Ilse): solo lo necesario para atender la operación, sin direcciones.
   TODO lo demás (check-in/out con dirección y mapa, posibles trampas, gastos, resumen) llega SOLO al director. */
export const AVISOS_PARA_OPERACIONES = ["sos", "detenido", "fuera_de_ruta", "sin_ubicacion", "sin_checkin", "sin_checkout", "incidencia", "cierre_fuera_de_punto", "ruta_excedida", "cambio_sin_enterado"];
/* Alertas de auditoría (check-ins con dirección, posibles engaños, dinero): se guardan en alertas_director,
   que solo el director puede leer (ni operaciones ni nadie más, ni desde fuera de la app). */
export const ALERTAS_DEL_DIRECTOR = ["checkin_registrado", "checkin_tarde", "checkout_registrado", "checkin_oficina", "checkin_oficina_tarde", "checkout_oficina", "resumen_diario", "ruta_asignada", "gasto_dudoso",
  "km_no_coinciden", "km_sin_explicar", "unidad_no_coincide", "fuera_de_cdmx", "movimiento_sin_ruta", "ubicacion_simulada",
  "velocidad_imposible", "reloj_adelantado", "dispositivo_no_autorizado", "checkin_dudoso"];
export const coleccionDeAlerta = type => ALERTAS_DEL_DIRECTOR.includes(type) ? "alertas_director" : "alertas";
export const soloDirector = a => a?.informativa === true || !AVISOS_PARA_OPERACIONES.includes(a?.type);

export function avisoDeAlerta(a){
  const info = a?.informativa === true ? AVISOS_INFORMATIVOS[a?.type] : null;
  const titulo = info || ALERTAS_AL_CELULAR[a?.type];
  if(!titulo || (a.atendida === true && !info)) return null;
  const quien = String(a.choferNombre || "").trim();
  const texto = String(a.message || a.msg || "").trim() || (quien ? quien : "Revisa el sistema");
  const mapa = Number.isFinite(a.lat) && Number.isFinite(a.lng) ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : "";
  return { title: titulo + (quien && !texto.includes(quien) ? " · " + quien : ""), body: texto.slice(0, 220), tag: "alerta-" + a.id, url: info && mapa ? mapa : "/?v=operacion",
    soloDirector: soloDirector(a) };
}
