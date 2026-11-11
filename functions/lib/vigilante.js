/* VIGILANTE · decide qué alertas de operación deben estar abiertas en este momento.
   Lógica pura: recibe los registros (con horas en ms) y la hora actual, y devuelve
   la lista de alertas que deben existir. El servidor crea las nuevas y da por
   resueltas las que ya no aplican. No manda mensajes a nadie: solo avisa en la app.

   Umbrales: la meta de 15 min de primera respuesta viene del plan; los demás
   son SUPUESTOS a confirmar con el dueño y están juntos aquí para cambiarlos. */
import { minutosDeRespuesta, minutosHabiles, enHorarioLaboral, solicitudAbierta, META_PRIMERA_RESPUESTA_MIN, HORARIO_LABORAL } from "./solicitudes.js";

export const UMBRALES = {
  primeraRespuestaMin: META_PRIMERA_RESPUESTA_MIN,   // del plan
  aprobarCotizacionMin: 60,                          // supuesto: minutos hábiles para que un admin apruebe
  enviarCotizacionMin: 60,                           // supuesto: minutos hábiles para enviarla ya aprobada
  conectorSinSenalMin: 10,                           // supuesto: el conector late cada minuto
};
export const TIPOS_ALERTA = {
  solicitud_sin_respuesta: "Solicitud sin responder",
  cotizacion_por_aprobar: "Cotización por aprobar",
  cotizacion_sin_enviar: "Cotización aprobada sin enviar",
  servicio_sin_asignar: "Servicio de hoy sin asignar",
  conector_sin_senal: "Conector sin señal",
};
const ANTES_DE_ASIGNADA = ["Solicitud", "Cotizada", "Confirmada"];
const n = v => Number(v) || 0;
const diaLocal = (ms, h = HORARIO_LABORAL) => new Date(ms + h.utcOffsetMin * 60000).toISOString().slice(0, 10);
const dur = min => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? " " + (min % 60) + " min" : ""}`;

/** Alertas que deben estar abiertas. El id es estable: la misma situación nunca duplica alerta. */
export function alertasEsperadas({ solicitudes = [], cotizaciones = [], servicios = [], conectores = {} }, ahoraMs, U = UMBRALES){
  const out = [];
  const add = (id, type, folio, message, ref) => out.push({ id, type, folio: folio || "", message, ref });
  for(const s of solicitudes){
    if(!solicitudAbierta(s) || n(s.primeraRespuestaEn) > 0) continue;
    const min = minutosDeRespuesta(s, ahoraMs);
    if(min !== null && min > U.primeraRespuestaMin)
      add(`vig-sol-${s.id}`, "solicitud_sin_respuesta", s.folio, `${s.folio || "Solicitud"} lleva ${dur(min)} hábiles sin primera respuesta (meta ${U.primeraRespuestaMin} min).${s.asunto ? " " + String(s.asunto).slice(0, 120) : ""}`, { coleccion: "solicitudes", id: s.id });
  }
  for(const c of cotizaciones){
    if(c.estado === "Propuesta" && n(c.creadoEn) > 0){
      const min = minutosHabiles(n(c.creadoEn), ahoraMs);
      if(min > U.aprobarCotizacionMin) add(`vig-cot-${c.id}-aprobar`, "cotizacion_por_aprobar", c.folio, `${c.folio} de ${c.empresa || "sin cliente"} lleva ${dur(min)} hábiles esperando que un administrador apruebe el precio.`, { coleccion: "cotizaciones_logistica", id: c.id });
    }
    const apr = n(c.estadoTs?.Aprobada);
    if(c.estado === "Aprobada" && apr > 0){
      const min = minutosHabiles(apr, ahoraMs);
      if(min > U.enviarCotizacionMin) add(`vig-cot-${c.id}-enviar`, "cotizacion_sin_enviar", c.folio, `${c.folio} de ${c.empresa || "sin cliente"} está aprobada desde hace ${dur(min)} hábiles y no se ha enviado al cliente.`, { coleccion: "cotizaciones_logistica", id: c.id });
    }
  }
  if(enHorarioLaboral(ahoraMs)){
    const hoy = diaLocal(ahoraMs);
    for(const s of servicios){
      if(s.fechaServicio === hoy && ANTES_DE_ASIGNADA.includes(s.estado))
        add(`vig-srv-${s.id}-${hoy}`, "servicio_sin_asignar", s.folio, `${s.folio} de ${s.empresa || "sin cliente"} es para hoy${s.horaServicio ? " a las " + s.horaServicio : ""} y sigue en "${s.estado}": falta unidad y chofer.`, { coleccion: "servicios", id: s.id });
    }
  }
  for(const [nombre, c] of Object.entries(conectores || {})){
    const ult = n(c?.ultimoLatido);
    if(ult <= 0) continue;
    const min = Math.floor((ahoraMs - ult) / 60000);
    if(min > U.conectorSinSenalMin) add(`vig-con-${nombre}`, "conector_sin_senal", "", `El conector de ${nombre === "gmail" ? "correo" : nombre} no reporta desde hace ${dur(min)}: las solicitudes nuevas no están entrando a la bandeja.`, { coleccion: "sistema", id: "conectores" });
  }
  return out;
}

/** Qué hacer contra lo que ya existe: crear las que faltan y resolver las abiertas que ya no aplican. */
export function planVigilante(esperadas, abiertas){
  const ids = new Set(esperadas.map(a => a.id)), existentes = new Set(abiertas.map(a => a.id));
  return { crear: esperadas.filter(a => !existentes.has(a.id)), resolver: abiertas.filter(a => !ids.has(a.id)).map(a => a.id) };
}
