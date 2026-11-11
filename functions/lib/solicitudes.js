/* SOLICITUDES · lógica pura compartida por el servidor (Cloud Functions) y la pantalla.
   Sin Firebase ni DOM. Probada en solicitudes.test.js.
   Regla de fondo: lo que llega por correo, Slack o WhatsApp es DATO. Aquí solo se
   limpia y se mide; ningún texto recibido decide precios, asignaciones ni permisos. */

export const ESTADOS_SOLICITUD = ["Nueva", "En revisión", "Respondida", "Convertida", "Descartada"];
export const CANALES_SOLICITUD = ["Correo", "Slack", "WhatsApp", "Teléfono", "En persona"];
export const META_PRIMERA_RESPUESTA_MIN = 15;
/* SUPUESTO por confirmar con dirección: horario laboral L–V 9:00–18:00, hora de CDMX (UTC−6, sin horario de verano). */
export const HORARIO_LABORAL = { dias: [1, 2, 3, 4, 5], inicioMin: 9 * 60, finMin: 18 * 60, utcOffsetMin: -360 };

const txt = (v, max) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);

/** Folio consecutivo por año: SOL-2026-0001. */
export function folioSolicitud(consecutivo, anio){
  if(!Number.isInteger(consecutivo) || consecutivo < 1) throw new Error("Consecutivo de folio inválido");
  if(!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new Error("Año de folio inválido");
  return `SOL-${anio}-${String(consecutivo).padStart(4, "0")}`;
}

/** Id de documento estable a partir del id externo (mensaje de Gmail, ts de Slack): reintentar no duplica. */
export function idDocumento(idExterno){
  const limpio = String(idExterno ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200);
  if(limpio.length < 3 || /^_+$/.test(limpio)) throw new Error("idExterno inválido");
  return limpio;
}

/** Remitentes que no son personas: no se les manda acuse (evita ciclos de autorrespuestas). */
export function esRemitenteAutomatico({ remitenteCorreo = "", cabeceras = {} } = {}){
  const c = String(remitenteCorreo).toLowerCase();
  if(/(^|[._-])(no-?reply|noreply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|notificaciones)([._+-]|@)/.test(c)) return true;
  const h = Object.fromEntries(Object.entries(cabeceras || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? "").toLowerCase()]));
  if(h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if(/bulk|junk|list/.test(h["precedence"] || "")) return true;
  if(h["list-unsubscribe"] || h["list-id"] || h["x-autoreply"] || h["x-autorespond"]) return true;
  return false;
}

/** Valida y recorta lo que manda un conector. Lanza Error con mensaje claro si no sirve. */
export function limpiarEntrada(cuerpo){
  const b = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
  const canal = txt(b.canal, 30);
  if(!CANALES_SOLICITUD.includes(canal)) throw new Error("Canal desconocido");
  const idExterno = txt(b.idExterno, 300);
  idDocumento(idExterno);
  const correo = txt(b.remitenteCorreo, 320).toLowerCase();
  if(correo && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(correo)) throw new Error("Correo del remitente inválido");
  const textoCrudo = String(b.texto ?? "").replace(/\u0000/g, "");
  const MAX = 20000;
  const recibidaMs = Date.parse(txt(b.recibidaEn, 40));
  const adjuntos = (Array.isArray(b.adjuntos) ? b.adjuntos : []).slice(0, 20).map(a => ({
    nombre: txt(a?.nombre, 300), tipo: txt(a?.tipo, 100), tamano: Number.isFinite(Number(a?.tamano)) ? Math.max(0, Math.round(Number(a.tamano))) : 0,
  })).filter(a => a.nombre);
  const cabeceras = b.cabeceras && typeof b.cabeceras === "object" ? b.cabeceras : {};
  return {
    canal, idExterno, hilo: txt(b.hilo, 300),
    remitenteNombre: txt(b.remitenteNombre, 200), remitenteCorreo: correo,
    asunto: txt(b.asunto, 500),
    texto: textoCrudo.trim().slice(0, MAX), textoTruncado: textoCrudo.trim().length > MAX,
    recibidaMs: Number.isFinite(recibidaMs) ? recibidaMs : null,
    adjuntos,
    automatico: esRemitenteAutomatico({ remitenteCorreo: correo, cabeceras }),
  };
}

/** Texto del acuse. Vive en un solo lugar: el conector solo lo envía. */
export function acuseTexto(folio, nombre = ""){
  const n = txt(nombre, 80).split(/\s+/)[0] || "";
  return `Hola${n ? " " + n : ""}:\n\nRecibimos tu solicitud. Tu folio es ${folio}.\nEn breve te enviamos la cotización por este mismo medio.\n\nLogística D Movimiento\n(Acuse automático)`;
}
export const esAcuseAutomatico = cuerpo => /\(Acuse automático\)/.test(String(cuerpo ?? ""));

/** Minutos dentro del horario laboral entre dos instantes (ms). */
export function minutosHabiles(desdeMs, hastaMs, horario = HORARIO_LABORAL){
  if(!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs) || hastaMs <= desdeMs) return 0;
  const off = horario.utcOffsetMin * 60000, DIA = 86400000;
  const a = desdeMs + off, b = hastaMs + off;                       // "reloj local" expresado en UTC
  let total = 0;
  for(let dia = Math.floor(a / DIA) * DIA; dia < b; dia += DIA){
    if(!horario.dias.includes(new Date(dia).getUTCDay())) continue;
    const ini = Math.max(a, dia + horario.inicioMin * 60000), fin = Math.min(b, dia + horario.finMin * 60000);
    if(fin > ini) total += fin - ini;
  }
  return Math.round(total / 60000);
}

/** ¿El instante cae dentro del horario laboral? */
export function enHorarioLaboral(ms, horario = HORARIO_LABORAL){
  const d = new Date(ms + horario.utcOffsetMin * 60000), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return horario.dias.includes(d.getUTCDay()) && m >= horario.inicioMin && m < horario.finMin;
}

/** Minutos hábiles que tardó (o lleva) la primera respuesta. null si no hay hora de recepción. */
export function minutosDeRespuesta(s, ahoraMs){
  const ini = Number(s?.recibidaEn);
  if(!Number.isFinite(ini) || ini <= 0) return null;
  const fin = Number(s?.primeraRespuestaEn);
  return minutosHabiles(ini, Number.isFinite(fin) && fin > 0 ? fin : ahoraMs);
}

export const solicitudAbierta = s => ["Nueva", "En revisión"].includes(s?.estado);

/** verde: dentro de meta · ambar: hasta 4 veces la meta · rojo: más. */
export function semaforoRespuesta(min, meta = META_PRIMERA_RESPUESTA_MIN){
  if(min === null || min === undefined) return "gris";
  return min <= meta ? "verde" : min <= meta * 4 ? "ambar" : "rojo";
}

export function kpisSolicitudes(lista, ahoraMs, meta = META_PRIMERA_RESPUESTA_MIN){
  let sinResponder = 0, fueraDeMeta = 0, respondidas = 0, dentro = 0, descartadas = 0;
  const tiempos = [];
  for(const s of lista ?? []){
    if(s.estado === "Descartada"){ descartadas++; continue; }
    const min = minutosDeRespuesta(s, ahoraMs);
    const contestada = Number(s.primeraRespuestaEn) > 0;
    if(contestada){ respondidas++; if(min !== null){ tiempos.push(min); if(min <= meta) dentro++; } }
    else if(solicitudAbierta(s)){ sinResponder++; if(min !== null && min > meta) fueraDeMeta++; }
  }
  tiempos.sort((x, y) => x - y);
  const n = tiempos.length;
  const mediana = n === 0 ? null : (n % 2 ? tiempos[(n - 1) / 2] : Math.round((tiempos[n / 2 - 1] + tiempos[n / 2]) / 2));
  return { total: (lista ?? []).length, sinResponder, fueraDeMeta, respondidas, descartadas,
    medianaMin: mediana, pctDentroDeMeta: respondidas ? Math.round(dentro / respondidas * 100) : null };
}

export function textoDuracion(min){
  if(min === null || min === undefined) return "—";
  if(min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if(h < 24) return `${h} h${m ? " " + m + " min" : ""}`;
  return `${Math.floor(h / 9)} día(s) hábil(es)`;
}
