/* VIGILANCIA DE CHOFERES · "ojo de águila". Lógica pura (sin Firebase), probada en vigilancia.test.js.
   - Detenido: lleva mucho tiempo en el mismo lugar (fuera de una parada, o demasiado en una parada).
   - Fuera de ruta: se aleja del camino que traza el sistema entre sus paradas.
   - Sin ubicación: está "En ruta" y su celular dejó de mandar ubicación (app cerrada, sin señal o GPS apagado).
   - Asistencia: tiene ruta hoy y no hizo check-in a la hora; jornada abierta sin check-out.
   Umbrales: SUPUESTOS a confirmar con el director; viven juntos aquí para cambiarlos en un solo lugar. */
import { distanciaM, coordenadaValida } from "./geo.js";

export const UMBRALES_CHOFER = {
  radioQuietoM: 150,            // moverse menos que esto = sigue en el mismo lugar
  detenidoMin: 20,              // parado fuera de una parada
  detenidoEnParadaMin: 60,      // parado en una parada (entregar tarda, pero no tanto)
  fueraDeRutaM: 1500,           // lejos del camino trazado
  fueraDeRutaMin: 3,            // y así por más de esto (evita falsas alarmas por un rodeo)
  sinUbicacionMin: 10,          // en ruta sin mandar ubicación
  enteradoMin: 5,               // la oficina cambió la ruta y el chofer no ha tocado "Enterado"
  sinUbicacionJornadaMin: 30,   // con jornada abierta (sin ruta) sin mandar ubicación
  /* Horario LOCAL (lo dio el director): entrada 7:00, salida 17:00. */
  horaCheckIn: "07:00",         // entrada
  toleranciaEntradaMin: 10,     // a las 7:10 sin check-in → falta
  horaSalida: "17:00",          // salida
  toleranciaSalidaMin: 30,      // a las 17:30 sin check-out (y sin ruta en curso) → avisa
  /* Ruta FORÁNEA: el horario cambia. Cada día hace check-in y check-out donde esté; de noche descansa. */
  horaCheckInForaneo: "09:00",  // en foránea, a esta hora sin check-in → avisa
  jornadaMaxHoras: 16,          // cualquier jornada abierta más de esto → falta el check-out
};
export const TIPOS_ALERTA_CHOFER = {
  detenido: "Chofer detenido mucho tiempo",
  fuera_de_ruta: "Chofer fuera de ruta",
  sin_ubicacion: "La app del chofer no manda ubicación",
  sin_checkin: "Chofer con ruta y sin check-in",
  sin_checkout: "Jornada sin check-out",
  ruta_excedida: "Ruta foránea pasada de días",
  cambio_sin_enterado: "El chofer no ha confirmado un cambio de ruta",
  fuera_de_cdmx: "Chofer fuera de CDMX sin ruta que lo explique",
  km_no_coinciden: "Los kilómetros del tablero no coinciden con el GPS",
  unidad_no_coincide: "El chofer usa otra camioneta",
  chofer_sin_ruta: "Chofer trabajando sin ruta",
  salida_con_ruta_pendiente: "Cerró su día con la ruta sin terminar",
};
/* Por qué un chofer no sale a ruta hoy (lo registra la oficina en el plan del día). "Espera pedido" vale 2 horas. */
export const MOTIVOS_SIN_RUTA = { espera_pedido: "Espera pedido (se asigna más tarde)", taller: "Taller o mantenimiento", descanso: "Descanso o permiso", bodega: "Apoyo en bodega u oficina", otro: "Otro" };
export const ESPERA_PEDIDO_MIN = 120;
/** ¿El motivo registrado sigue cubriendo al chofer? */
export const justificacionVigente = (j, ahoraMs) => !!j && (j.motivo !== "espera_pedido" || ahoraMs - Number(j.enMs || 0) < ESPERA_PEDIDO_MIN * 60000);
/* Título legible de CUALQUIER alerta (nunca se muestra el código interno ni sale en blanco). */
export const TITULO_ALERTA = {
  ...TIPOS_ALERTA_CHOFER,
  sos: "SOS del chofer", checkin_dudoso: "Check-in con dudas", ubicacion_simulada: "Ubicación falsa (simulada)",
  velocidad_imposible: "Salto imposible de ubicación", reloj_adelantado: "Reloj del celular manipulado",
  dispositivo_no_autorizado: "Celular no autorizado", incidencia: "Incidencia en una entrega", cierre_fuera_de_punto: "Entrega cerrada fuera del punto",
  checkin_registrado: "Check-in", checkin_tarde: "Check-in tarde", checkout_registrado: "Check-out", ruta_asignada: "Ruta asignada", cambio_a_app: "Ya usa la app nativa", cotizacion_por_aprobar: "Cotización por aprobar", checkin_oficina: "Entrada de oficina", checkin_oficina_tarde: "Entrada de oficina tarde", checkout_oficina: "Salida de oficina", gasto_dudoso: "Gasto o gasolina que no cuadra",
};
const dur = min => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? " " + (min % 60) + " min" : ""}`;

/** Lleva la cuenta de "desde cuándo está en el mismo lugar". `prev` = { quietoDesdeMs, quietoLat, quietoLng }. */
export function actualizarQuieto(prev, punto, U = UMBRALES_CHOFER){
  if(!coordenadaValida(punto) || punto.confiable === false) return prev || null;
  if(prev && coordenadaValida({ lat: prev.quietoLat, lng: prev.quietoLng }) && Number(prev.quietoDesdeMs) > 0
    && distanciaM(punto, { lat: prev.quietoLat, lng: prev.quietoLng }) <= U.radioQuietoM && punto.tMs >= prev.quietoDesdeMs)
    return prev;
  return { quietoDesdeMs: punto.tMs, quietoLat: punto.lat, quietoLng: punto.lng };
}

/** Distancia (m) de un punto a una línea [[lng,lat],...] (proyección local; suficiente a escala de ciudad/carretera). */
export function distanciaALineaM(p, linea){
  if(!coordenadaValida(p) || !Array.isArray(linea) || linea.length === 0) return null;
  const k = Math.cos(p.lat * Math.PI / 180) * 111320, kLat = 110540;
  const xy = ([lng, lat]) => [(lng - p.lng) * k, (lat - p.lat) * kLat];
  if(linea.length === 1){ const [x, y] = xy(linea[0]); return Math.hypot(x, y); }
  let min = Infinity;
  for(let i = 1; i < linea.length; i++){
    const [ax, ay] = xy(linea[i - 1]), [bx, by] = xy(linea[i]), dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

/** Camino de respaldo si no hay trazo de calles: línea recta entre la posición de salida y las paradas pendientes. */
export const lineaDeParadas = paradas => (paradas || []).filter(p => coordenadaValida(p)).map(p => [p.lng, p.lat]);

/** Lleva la cuenta de "desde cuándo está fuera de ruta". Devuelve { fueraDesdeMs, fueraM } o null si está en ruta. */
export function actualizarFueraDeRuta(prev, punto, linea, { umbralM } = {}){
  const U = umbralM ?? UMBRALES_CHOFER.fueraDeRutaM;
  if(!coordenadaValida(punto) || punto.confiable === false || !Array.isArray(linea) || linea.length < 2) return prev || null;
  const d = distanciaALineaM(punto, linea);
  if(d === null || d <= U) return null;
  return { fueraDesdeMs: prev?.fueraDesdeMs && prev.fueraDesdeMs <= punto.tMs ? prev.fueraDesdeMs : punto.tMs, fueraM: Math.round(d) };
}

/** ¿El lugar donde está quieto es una parada pendiente de su ruta? */
export const enParada = (quieto, paradas) => (paradas || []).some(p => coordenadaValida(p)
  && distanciaM({ lat: quieto.quietoLat, lng: quieto.quietoLng }, p) <= (Number(p.radioM) || 150) + 100);

/** "HH:MM" del día en CDMX → ms. */
const msDeHora = (fecha, hhmm) => Date.parse(`${fecha}T${hhmm}:00-06:00`);
const fechaCDMX = ms => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);

/**
 * Alertas de choferes que deben estar abiertas ahora. Ids estables: la misma situación nunca duplica.
 * ubicaciones: { [choferId]: { tMs, servicioId, quietoDesdeMs, quietoLat, quietoLng, fueraDesdeMs, fueraM, choferNombre } }
 * enRuta: servicios "En ruta" [{ id, folio, choferId, choferNombre, paradas: [pendientes con lat,lng,radioM] }]
 * conRutaHoy: servicios de hoy ya asignados [{ id, folio, choferId, choferNombre, fechaServicio, estado }]
 * jornadas: [{ id, choferId, choferNombre, fecha, estado, checkInMs }]
 */
export function alertasChoferes({ ubicaciones = {}, enRuta = [], conRutaHoy = [], jornadas = [], sinRuta = [] }, ahoraMs, U = UMBRALES_CHOFER){
  const out = [];
  const add = (id, type, s, message, extra = {}) => out.push({ id, type, folio: s?.folio || "", choferId: s?.choferId || extra.choferId || "", choferNombre: s?.choferNombre || extra.choferNombre || "",
    servicioId: s?.id || "", message, ref: s?.id ? { coleccion: "servicios", id: s.id } : { coleccion: "choferes", id: s?.choferId || extra.choferId || "" }, ...extra });
  const hoy = fechaCDMX(ahoraMs);
  const jornadaHoy = id => jornadas.find(j => j.choferId === id && j.fecha === hoy);
  for(const s of enRuta){
    /* Foránea: si ya cerró su día (descansando) o aún no empieza el de hoy, no se le vigila la ubicación. */
    if(s.foraneo){
      const j = jornadaHoy(s.choferId);
      if(s.regresoEstimado && hoy > s.regresoEstimado)
        add(`chf-exc-${s.id}-${hoy}`, "ruta_excedida", s, `${s.choferNombre || "El chofer"} (${s.folio}) sigue en ruta foránea; debía regresar el ${s.regresoEstimado}.`);
      if(!j){
        if(ahoraMs >= msDeHora(hoy, U.horaCheckInForaneo) && Number(s.enRutaMs) < msDeHora(hoy, "00:00"))
          add(`chf-asis-${s.choferId}-${hoy}`, "sin_checkin", s, `${s.choferNombre || "El chofer"} va en ruta foránea (${s.folio}) y hoy no ha hecho check-in (límite ${U.horaCheckInForaneo}).`);
        if(Number(s.enRutaMs) < msDeHora(hoy, "00:00")) continue;   // día 2 en adelante: sin check-in de hoy no se vigila ubicación
      }
      else if(j.estado === "Cerrada") continue;                    // descansando
    }
    const u = ubicaciones[s.choferId];
    const ult = Number(u?.tMs) || 0;
    const sinMin = ult > 0 ? Math.floor((ahoraMs - ult) / 60000) : null;
    if(!u || u.servicioId !== s.id || sinMin === null || sinMin > U.sinUbicacionMin){
      const desde = Number(s.enRutaMs) || 0;
      const min = sinMin ?? (desde ? Math.floor((ahoraMs - desde) / 60000) : null);
      if(min === null || min > U.sinUbicacionMin)
        add(`chf-sinubi-${s.id}`, "sin_ubicacion", s, `${s.choferNombre || "El chofer"} (${s.folio}) no manda ubicación ${min !== null ? "desde hace " + dur(min) : "desde que salió"}. Puede tener la app cerrada, el GPS apagado o estar sin señal. Llámale.`);
      continue;   // con ubicación vieja no se juzga si está detenido o desviado
    }
    if(Number(u.quietoDesdeMs) > 0){
      const min = Math.floor((ahoraMs - u.quietoDesdeMs) / 60000), parada = enParada(u, s.paradas);
      if(min >= (parada ? U.detenidoEnParadaMin : U.detenidoMin))
        add(`chf-det-${s.choferId}-${u.quietoDesdeMs}`, "detenido", s, `${s.choferNombre || "El chofer"} (${s.folio}) lleva ${dur(min)} detenido ${parada ? "en una parada" : "FUERA de sus paradas"}.`,
          { lat: u.quietoLat, lng: u.quietoLng, minutos: min });
    }
    if(Number(u.fueraDesdeMs) > 0){
      const min = Math.floor((ahoraMs - u.fueraDesdeMs) / 60000);
      if(min >= U.fueraDeRutaMin)
        add(`chf-ruta-${s.choferId}-${u.fueraDesdeMs}`, "fuera_de_ruta", s, `${s.choferNombre || "El chofer"} (${s.folio}) va a ${(u.fueraM / 1000).toFixed(1)} km de su ruta desde hace ${dur(min)}.`,
          { lat: u.lat ?? null, lng: u.lng ?? null, distanciaM: u.fueraM });
    }
  }
  /* Cambio de ruta sin "Enterado": la oficina cambió algo (quitar, agregar, detener) y el chofer no lo confirmó. */
  const vistos = new Set();
  for(const s of [...enRuta, ...conRutaHoy]){
    const c = s.cambioPendiente;
    if(!s.id || vistos.has(s.id) || !c || !c.id || Number(c.enteradoMs) > 0 || !(Number(c.enMs) > 0)) continue;
    vistos.add(s.id);
    const min = Math.floor((ahoraMs - Number(c.enMs)) / 60000);
    if(min >= U.enteradoMin)
      add(`chf-ent-${s.id}-${c.id}`, "cambio_sin_enterado", s, `${s.choferNombre || "El chofer"} (${s.folio}) no ha confirmado el cambio de su ruta desde hace ${dur(min)}: ${(c.lineas || []).join(" · ") || c.resumen || "cambio de ruta"}. Llámale.`);
  }
  const limite = msDeHora(hoy, U.horaCheckIn) + U.toleranciaEntradaMin * 60000;
  if(ahoraMs >= limite){
    const conJornada = new Set(jornadas.filter(j => j.fecha === hoy).map(j => j.choferId));
    const avisados = new Set();
    for(const s of conRutaHoy){
      if(s.fechaServicio !== hoy || !s.choferId || conJornada.has(s.choferId) || avisados.has(s.choferId) || s.estado === "En ruta") continue;
      avisados.add(s.choferId);
      add(`chf-asis-${s.choferId}-${hoy}`, "sin_checkin", s, `${s.choferNombre || "Un chofer"} tiene ruta hoy (${s.folio}) y no ha hecho check-in (hora límite ${U.horaCheckIn}).`);
    }
  }
  const choferesEnRuta = new Set(enRuta.map(s => s.choferId));
  for(const j of jornadas){
    if(j.estado !== "Abierta" || !(Number(j.checkInMs) > 0) || choferesEnRuta.has(j.choferId)) continue;
    const u = ubicaciones[j.choferId], ult = Math.max(Number(u?.tMs) || 0, j.checkInMs);
    const min = Math.floor((ahoraMs - ult) / 60000);
    if(min > U.sinUbicacionJornadaMin && (ahoraMs - j.checkInMs) / 3600000 < U.jornadaMaxHoras)
      add(`chf-sinubi-j-${j.id}`, "sin_ubicacion", { choferId: j.choferId, choferNombre: j.choferNombre }, `${j.choferNombre || "Un chofer"} está en jornada y su celular no manda ubicación desde hace ${dur(min)}. Debe tener la app abierta.`, { choferId: j.choferId });
  }
  /* Trabajando sin ruta: 20 min después de su check-in no tiene ruta de hoy ni motivo registrado (o su "espera pedido" ya venció).
     Le llega a operaciones para que la registre. */
  const conRutaHoyIds = new Set(conRutaHoy.filter(s => s.fechaServicio === hoy || s.estado === "En ruta").map(s => s.choferId));
  for(const j of jornadas){
    if(j.estado !== "Abierta" || j.fecha !== hoy || !(Number(j.checkInMs) > 0) || choferesEnRuta.has(j.choferId) || conRutaHoyIds.has(j.choferId)) continue;
    if(ahoraMs - j.checkInMs < 20 * 60000) continue;
    const just = sinRuta.find(x => x.choferId === j.choferId && x.fecha === hoy);
    if(justificacionVigente(just, ahoraMs)) continue;
    add(`chf-sinruta-${j.choferId}-${hoy}`, "chofer_sin_ruta", { choferId: j.choferId, choferNombre: j.choferNombre },
      `${j.choferNombre || "Un chofer"} hizo check-in hace ${dur(Math.floor((ahoraMs - j.checkInMs) / 60000))} y no tiene ruta hoy${just ? " (su \"espera pedido\" ya venció)" : ""}. Asígnale su ruta o registra por qué no sale.`, { choferId: j.choferId });
  }
  /* Salida: local a las 17:30 sin check-out y sin ruta en curso (si sigue en ruta, su horario se extiende).
     Cualquier jornada de más de 16 h también avisa. */
  const salida = msDeHora(hoy, U.horaSalida) + U.toleranciaSalidaMin * 60000;
  for(const j of jornadas){
    if(j.estado !== "Abierta" || !(Number(j.checkInMs) > 0)) continue;
    const h = (ahoraMs - j.checkInMs) / 3600000;
    if(h >= U.jornadaMaxHoras)
      add(`chf-out-${j.id}`, "sin_checkout", { choferId: j.choferId, choferNombre: j.choferNombre }, `${j.choferNombre || "Un chofer"} abrió su jornada hace ${Math.floor(h)} h y no ha hecho check-out.`, { choferId: j.choferId });
    else if(j.fecha === hoy && ahoraMs >= salida && !choferesEnRuta.has(j.choferId))
      add(`chf-out-${j.id}`, "sin_checkout", { choferId: j.choferId, choferNombre: j.choferNombre }, `${j.choferNombre || "Un chofer"} no ha hecho check-out y ya pasó su hora de salida (${U.horaSalida}).`, { choferId: j.choferId });
  }
  return out;
}
