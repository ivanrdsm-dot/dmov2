/* DMOV · Fase 1 — funciones del chofer y de la oficina para la ruta.
   Toda validación crítica vive aquí: identidad, dispositivo, check-in, posiciones,
   geocerca y cierre de parada. La app solo PIDE; el servidor decide y deja bitácora.
   El chofer no escribe Firestore directo: las reglas se lo impiden. */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { validarLote, coordenadaValida, RADIO_GEOCERCA_DEFAULT_M } from "./lib/geo.js";
import { evaluarCierreParada, validarCheckIn, TIPOS_INCIDENCIA } from "./lib/paradas.js";
import { ordenarParadas } from "./lib/rutas.js";

const OPC = { region: "us-central1", maxInstances: 5, memory: "256MiB", timeoutSeconds: 30 };
const db = () => getFirestore();
const ahora = () => FieldValue.serverTimestamp();
const fechaCDMX = (ms = Date.now()) => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);
const txt = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const falla = (codigo, mensaje) => new HttpsError(codigo, mensaje);

/* ── Identidad ───────────────────────────────────────────────────────────── */
async function choferDe(req, { exigirDispositivo = true } = {}){
  const auth = req.auth;
  if(!auth || auth.token?.firebase?.sign_in_provider === "anonymous") throw falla("unauthenticated", "Inicia sesión para continuar");
  const liga = await db().doc("choferes_auth/" + auth.uid).get();
  if(!liga.exists) throw falla("permission-denied", "Esta cuenta no está ligada a un chofer");
  const ref = db().doc("choferes/" + liga.data().choferId), snap = await ref.get();
  if(!snap.exists || snap.data().activo === false || snap.data().status === "Inactivo") throw falla("permission-denied", "Chofer inactivo");
  const chofer = { id: snap.id, ...snap.data() };
  if(exigirDispositivo){
    const disp = txt(req.data?.dispositivoId, 120);
    if(!disp || !chofer.dispositivoId || disp !== chofer.dispositivoId) throw falla("permission-denied", "Este equipo no está autorizado para tu cuenta. Avisa a operaciones.");
  }
  return { chofer, ref };
}
async function oficinaDe(req, { admin = false } = {}){
  const auth = req.auth;
  if(!auth || auth.token?.firebase?.sign_in_provider === "anonymous") throw falla("unauthenticated", "Inicia sesión para continuar");
  const p = await db().doc("dmov_usuarios/" + auth.uid).get();
  if(!p.exists || p.data().activo !== true) throw falla("permission-denied", "Sin perfil de oficina activo");
  if(admin && p.data().rol !== "admin") throw falla("permission-denied", "Solo un administrador puede hacer esto");
  return { uid: auth.uid, nombre: p.data().nombre || p.data().email || auth.uid, rol: p.data().rol };
}
const actorChofer = c => ({ actorUid: "chofer:" + c.id, actorNombre: c.nombre || c.id, actorRol: "chofer" });
const actorOficina = o => ({ actorUid: o.uid, actorNombre: o.nombre, actorRol: o.rol });
const eventoServicio = (tx, servicioId, datos) => tx.set(db().collection(`servicios/${servicioId}/eventos`).doc(), { ...datos, ts: ahora() });
const alerta = (datos) => db().collection("alertas").add({ atendida: false, ts: ahora(), ...datos });

async function servicioDelChofer(servicioId, chofer){
  const id = txt(servicioId, 80);
  if(!id) throw falla("invalid-argument", "Falta el servicio");
  const ref = db().doc("servicios/" + id), snap = await ref.get();
  if(!snap.exists || snap.data().choferId !== chofer.id) throw falla("permission-denied", "Este servicio no está asignado a ti");
  return { ref, servicio: { id: snap.id, ...snap.data() } };
}
async function jornadaDeHoy(chofer, ms = Date.now()){
  const snap = await db().doc(`jornadas/${chofer.id}_${fechaCDMX(ms)}`).get();
  if(!snap.exists) throw falla("failed-precondition", "Primero haz tu check-in de hoy");
  return snap.data();
}

/* ── Chofer ──────────────────────────────────────────────────────────────── */
/** Liga el equipo al chofer la primera vez. Después solo ese equipo sirve; liberarlo es de oficina. */
export const choferRegistrarDispositivo = onCall(OPC, async req => {
  const { chofer, ref } = await choferDe(req, { exigirDispositivo: false });
  const disp = txt(req.data?.dispositivoId, 120);
  if(disp.length < 8) throw falla("invalid-argument", "Identificador de equipo inválido");
  if(chofer.dispositivoId && chofer.dispositivoId !== disp){
    await alerta({ type: "dispositivo_no_autorizado", choferId: chofer.id, choferNombre: chofer.nombre || "", msg: "Intento de entrar desde otro equipo" });
    throw falla("permission-denied", "Tu cuenta ya está ligada a otro equipo. Avisa a operaciones.");
  }
  if(!chofer.dispositivoId) await ref.update({ dispositivoId: disp, dispositivoModelo: txt(req.data?.modelo, 80), dispositivoRegistradoEn: ahora() });
  return { ok: true, choferId: chofer.id, nombre: chofer.nombre || "" };
});

/** Check-in de jornada: selfie + inspección de unidad, sellado con hora del servidor. Uno por día. */
export const choferCheckIn = onCall(OPC, async req => {
  const { chofer } = await choferDe(req);
  const d = req.data || {};
  const v = validarCheckIn(d);
  if(!v.ok) throw falla("invalid-argument", "Falta: " + v.errores.join(", "));
  const prefijo = `jornadas/${chofer.id}/`;
  for(const k of ["selfieRuta", "fotoPlacasRuta", "fotoOdometroRuta"]) if(!txt(d[k], 400).startsWith(prefijo)) throw falla("invalid-argument", "Las fotos deben subirse desde la app");
  const pos = { lat: Number(d.lat), lng: Number(d.lng) };
  const fecha = fechaCDMX(), ref = db().doc(`jornadas/${chofer.id}_${fecha}`);
  const creada = await db().runTransaction(async tx => {
    if((await tx.get(ref)).exists) return false;
    tx.set(ref, { choferId: chofer.id, choferNombre: chofer.nombre || "", fecha, estado: "Abierta", checkInEn: ahora(), dispositivoId: chofer.dispositivoId,
      selfieRuta: txt(d.selfieRuta, 400), fotoPlacasRuta: txt(d.fotoPlacasRuta, 400), fotoOdometroRuta: txt(d.fotoOdometroRuta, 400),
      unidadPlaca: txt(d.unidadPlaca, 20).toUpperCase(), odometroKm: Number(d.odometroKm), combustiblePct: Number(d.combustiblePct),
      ubicacion: coordenadaValida(pos) ? pos : null, ubicacionSimulada: d.simulada === true, verificacionFacial: "no_aplicada" });
    return true;
  });
  if(creada && d.simulada === true) await alerta({ type: "ubicacion_simulada", choferId: chofer.id, choferNombre: chofer.nombre || "", msg: "Check-in con ubicación simulada" });
  return { ok: true, fecha, yaExistia: !creada };
});

/** El chofer inicia la ruta: exige check-in de hoy. */
export const choferIniciarRuta = onCall(OPC, async req => {
  const { chofer } = await choferDe(req);
  const { ref, servicio } = await servicioDelChofer(req.data?.servicioId, chofer);
  await jornadaDeHoy(chofer);
  if(servicio.estado === "En ruta") return { ok: true, estado: "En ruta" };
  if(servicio.estado !== "Asignada") throw falla("failed-precondition", `El servicio está en "${servicio.estado}" y no se puede iniciar`);
  await db().runTransaction(async tx => {
    tx.update(ref, { estado: "En ruta", "estadoTs.En ruta": ahora(), actualizadoEn: ahora() });
    eventoServicio(tx, servicio.id, { tipo: "estado", de: "Asignada", a: "En ruta", ...actorChofer(chofer) });
  });
  return { ok: true, estado: "En ruta" };
});

/** Lote de posiciones. El servidor decide cuáles son confiables y levanta alertas. */
export const choferSubirPosiciones = onCall(OPC, async req => {
  const { chofer } = await choferDe(req);
  const { servicio } = await servicioDelChofer(req.data?.servicioId, chofer);
  const refUlt = db().doc("ubicaciones/" + chofer.id), ult = await refUlt.get();
  const previa = ult.exists && ult.data().confiable !== false ? { lat: ult.data().lat, lng: ult.data().lng, tMs: ult.data().tMs } : null;
  const r = validarLote(req.data?.posiciones, { ahoraMs: Date.now(), ultimaConfiable: previa });
  if(r.aceptadas.length > 0){
    const lote = db().batch(), n = r.aceptadas.length, fin = r.aceptadas[n - 1];
    lote.set(db().collection(`servicios/${servicio.id}/posiciones`).doc(), { choferId: chofer.id, desdeMs: r.aceptadas[0].tMs, hastaMs: fin.tMs, n, puntos: r.aceptadas, recibidoEn: ahora() });
    if(!ult.exists || fin.tMs >= (ult.data().tMs || 0))
      lote.set(refUlt, { choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio.id, servicioFolio: servicio.folio || "",
        lat: fin.lat, lng: fin.lng, tMs: fin.tMs, precisionM: fin.precisionM, bateria: fin.bateria, confiable: fin.confiable, actualizadoEn: ahora(),
        ...(r.ultimaConfiable ? { confiableLat: r.ultimaConfiable.lat, confiableLng: r.ultimaConfiable.lng, confiableTMs: r.ultimaConfiable.tMs } : {}) });
    await lote.commit();
  }
  for(const a of r.alertas) await alerta({ type: a.tipo, choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio.id,
    msg: a.tipo === "ubicacion_simulada" ? "Ubicación simulada detectada" : a.tipo === "velocidad_imposible" ? `Salto imposible: ${a.kmh} km/h` : "Reloj del equipo adelantado", lat: a.lat ?? null, lng: a.lng ?? null });
  return { ok: true, aceptadas: r.aceptadas.length, rechazadas: r.rechazadas.length };
});

/** Cierre de parada: geocerca validada aquí, con la última posición CONFIABLE que tiene el servidor. */
export const choferCerrarParada = onCall(OPC, async req => {
  const { chofer } = await choferDe(req);
  const { ref: refServicio, servicio } = await servicioDelChofer(req.data?.servicioId, chofer);
  /* Cierre hecho sin señal: la app lo guardó con su hora y lo manda después. Se valida contra la
     posición confiable más cercana a ESE momento (ya recibida en los lotes), no contra "ahora". */
  const cerradaMs = Number(req.data?.cerradaMs);
  const diferida = Number.isFinite(cerradaMs) && cerradaMs < Date.now() - 2 * 60000 && cerradaMs > Date.now() - 72 * 3600000;
  const momento = diferida ? cerradaMs : Date.now();
  await jornadaDeHoy(chofer, momento);
  if(servicio.estado !== "En ruta") throw falla("failed-precondition", "Inicia la ruta antes de cerrar paradas");
  const paradaId = txt(req.data?.paradaId, 80), refParada = db().doc(`servicios/${servicio.id}/paradas/${paradaId}`);
  const e = req.data?.evidencia || {}, prefijo = `evidencias/${chofer.id}/${servicio.id}/`;
  const fotos = (Array.isArray(e.fotos) ? e.fotos : []).map(f => txt(f, 400)).filter(f => f.startsWith(prefijo)).slice(0, 10);
  const evidencia = { fotos, receptor: txt(e.receptor, 120), cantidadEntregada: e.cantidadEntregada ?? "", firmaRuta: txt(e.firmaRuta, 400).startsWith(prefijo) ? txt(e.firmaRuta, 400) : "", notas: txt(e.notas, 500) };
  const incidencia = TIPOS_INCIDENCIA.includes(e.incidencia) ? e.incidencia : "";
  let posicion = null;
  if(diferida){
    const lotes = await db().collection(`servicios/${servicio.id}/posiciones`).where("hastaMs", ">=", cerradaMs - 5 * 60000).orderBy("hastaMs").limit(8).get();
    const cerca = lotes.docs.flatMap(d => d.data().puntos || []).filter(p => p.confiable !== false && Math.abs(p.tMs - cerradaMs) <= 5 * 60000)
      .sort((x, y) => Math.abs(x.tMs - cerradaMs) - Math.abs(y.tMs - cerradaMs))[0];
    if(cerca) posicion = { lat: cerca.lat, lng: cerca.lng, tMs: Math.min(cerca.tMs, cerradaMs), precisionM: cerca.precisionM, confiable: true };
  } else {
    const u = await db().doc("ubicaciones/" + chofer.id).get();
    if(u.exists && u.data().confiableTMs) posicion = { lat: u.data().confiableLat, lng: u.data().confiableLng, tMs: u.data().confiableTMs, precisionM: u.data().precisionM, confiable: true };
  }

  const resultado = await db().runTransaction(async tx => {
    /* En una transacción todas las lecturas van antes que las escrituras */
    const ps = await tx.get(refParada);
    const todas = await tx.get(db().collection(`servicios/${servicio.id}/paradas`));
    if(!ps.exists) throw falla("not-found", "Parada no encontrada");
    const parada = { id: ps.id, ...ps.data() };
    const v = evaluarCierreParada({ parada, posicion, ahoraMs: momento, evidencia, excepcion: parada.excepcion ? { ...parada.excepcion, paradaId: parada.id } : null });
    if(!v.permitido){
      eventoServicio(tx, servicio.id, { tipo: "cierre_rechazado", paradaId, motivo: v.motivo, distanciaM: v.distanciaM ?? null, ...actorChofer(chofer) });
      return { ...v, parada };
    }
    tx.update(refParada, { estado: incidencia ? "Incidencia" : "Entregada", incidencia, evidencia, cerradaEn: ahora(), cerradaPor: chofer.id,
      distanciaAlCerrarM: v.distanciaM ?? null, cerradaPorExcepcion: v.porExcepcion === true, cerradaDiferida: diferida, cerradaEnEquipoMs: diferida ? cerradaMs : null });
    eventoServicio(tx, servicio.id, { tipo: incidencia ? "parada_incidencia" : "parada_entregada", paradaId, paradaNombre: parada.nombre || "", receptor: evidencia.receptor,
      incidencia, distanciaM: v.distanciaM ?? null, porExcepcion: v.porExcepcion === true, diferida, ...actorChofer(chofer) });
    const pendientes = todas.docs.filter(d => d.id !== paradaId && !["Entregada", "Incidencia"].includes(d.data().estado)).length;
    if(pendientes === 0){
      tx.update(refServicio, { estado: "Entregada", "estadoTs.Entregada": ahora(), receptor: evidencia.receptor, actualizadoEn: ahora() });
      eventoServicio(tx, servicio.id, { tipo: "estado", de: "En ruta", a: "Entregada", ...actorChofer(chofer) });
    }
    return { ...v, parada, pendientes };
  });
  if(!resultado.permitido){
    if(resultado.fueraDeGeocerca) await alerta({ type: "cierre_fuera_de_punto", choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio.id,
      msg: `Intentó cerrar "${resultado.parada.nombre || paradaId}" a ${resultado.distanciaM} m del punto` });
    throw falla("failed-precondition", resultado.motivo);
  }
  if(incidencia) await alerta({ type: "incidencia", choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio.id, msg: `${incidencia} en "${resultado.parada.nombre || paradaId}"` });
  return { ok: true, pendientes: resultado.pendientes, porExcepcion: resultado.porExcepcion === true };
});

/** Fin de la jornada: deja la hora de salida (la pone el servidor). No se puede con una ruta a medias. */
export const choferTerminarJornada = onCall(OPC, async req => {
  const { chofer } = await choferDe(req);
  /* La jornada abierta más reciente (puede ser de ayer si se termina después de medianoche). */
  const abiertas = await db().collection("jornadas").where("choferId", "==", chofer.id).where("estado", "==", "Abierta").limit(10).get();
  if(abiertas.empty) throw falla("failed-precondition", "No tienes una jornada abierta");
  const ref = abiertas.docs.map(d => d.ref).sort((a, b) => b.id.localeCompare(a.id))[0];
  const enRuta = await db().collection("servicios").where("choferId", "==", chofer.id).where("estado", "==", "En ruta").limit(1).get();
  if(!enRuta.empty) throw falla("failed-precondition", "Primero termina tu ruta: aún tienes paradas pendientes");
  const pos = { lat: Number(req.data?.lat), lng: Number(req.data?.lng) }, km = Number(req.data?.odometroKm);
  const r = await db().runTransaction(async tx => {
    const j = await tx.get(ref);
    if(!j.exists) throw falla("failed-precondition", "No tienes una jornada abierta");
    if(j.data().estado === "Cerrada") return { yaEstaba: true };
    tx.update(ref, { estado: "Cerrada", checkOutEn: ahora(), ubicacionSalida: coordenadaValida(pos) ? pos : null,
      ...(Number.isFinite(km) && km > 0 ? { odometroFinalKm: km } : {}) });
    return { yaEstaba: false };
  });
  return { ok: true, ...r };
});

/** Botón de emergencia. No exige check-in ni servicio: siempre debe pasar. */
export const choferSOS = onCall(OPC, async req => {
  const { chofer } = await choferDe(req, { exigirDispositivo: false });
  const pos = { lat: Number(req.data?.lat), lng: Number(req.data?.lng) };
  await alerta({ type: "sos", choferId: chofer.id, choferNombre: chofer.nombre || "", choferTel: chofer.tel || "", servicioId: txt(req.data?.servicioId, 80),
    msg: "SOS del chofer", ...(coordenadaValida(pos) ? pos : { lat: null, lng: null }) });
  return { ok: true };
});

/* ── Oficina ─────────────────────────────────────────────────────────────── */
/** Crea la cuenta del chofer (o liga una existente) y devuelve el enlace para que ponga su contraseña. */
export const oficinaVincularChofer = onCall(OPC, async req => {
  const of = await oficinaDe(req, { admin: true });
  const choferId = txt(req.data?.choferId, 80), correo = txt(req.data?.correo, 200).toLowerCase();
  if(!choferId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw falla("invalid-argument", "Chofer y correo son obligatorios");
  const ref = db().doc("choferes/" + choferId), snap = await ref.get();
  if(!snap.exists) throw falla("not-found", "Chofer no encontrado");
  let usuario;
  try { usuario = await getAuth().getUserByEmail(correo); }
  catch { usuario = await getAuth().createUser({ email: correo, displayName: snap.data().nombre || "", emailVerified: false }); }
  if((await db().doc("dmov_usuarios/" + usuario.uid).get()).exists) throw falla("failed-precondition", "Ese correo ya es de un usuario de oficina");
  const otra = await db().doc("choferes_auth/" + usuario.uid).get();
  if(otra.exists && otra.data().choferId !== choferId) throw falla("already-exists", "Ese correo ya está ligado a otro chofer");
  const lote = db().batch();
  lote.set(db().doc("choferes_auth/" + usuario.uid), { choferId, correo, ligadoPor: of.uid, ligadoEn: ahora() });
  lote.update(ref, { authUid: usuario.uid, correoApp: correo, activo: true });
  await lote.commit();
  return { ok: true, enlace: await getAuth().generatePasswordResetLink(correo) };
});

/** Libera el equipo de un chofer (cambio o reposición de celular). Queda en la bitácora de alertas. */
export const oficinaLiberarDispositivo = onCall(OPC, async req => {
  const of = await oficinaDe(req);
  const choferId = txt(req.data?.choferId, 80), motivo = txt(req.data?.motivo, 300);
  if(!choferId || !motivo) throw falla("invalid-argument", "Chofer y motivo son obligatorios");
  await db().doc("choferes/" + choferId).update({ dispositivoId: FieldValue.delete(), dispositivoLiberadoPor: of.nombre, dispositivoLiberadoEn: ahora(), dispositivoLiberadoMotivo: motivo });
  return { ok: true };
});

/** Arma la ruta del servicio: crea las paradas con la coordenada VERIFICADA del catálogo y asigna al chofer. */
export const oficinaPrepararRuta = onCall(OPC, async req => {
  const of = await oficinaDe(req);
  const servicioId = txt(req.data?.servicioId, 80), choferId = txt(req.data?.choferId, 80);
  const refS = db().doc("servicios/" + servicioId), s = await refS.get();
  if(!s.exists) throw falla("not-found", "Servicio no encontrado");
  const c = await db().doc("choferes/" + choferId).get();
  if(!c.exists || !c.data().authUid) throw falla("failed-precondition", "El chofer no tiene cuenta de la app. Vincúlalo primero.");
  const servicio = s.data();
  const lista = [...(servicio.origenes || []).map(p => ({ ...p, tipo: "carga" })), ...(servicio.destinos || []).map(p => ({ ...p, tipo: "entrega" }))].filter(p => txt(p.direccion));
  const sinPin = [], paradas = [];
  for(const [i, p] of lista.entries()){
    const punto = p.puntoId ? await db().doc("puntos_entrega/" + p.puntoId).get() : null;
    const d = punto?.exists ? punto.data() : null;
    const coord = d ? { lat: Number(d.lat), lng: Number(d.lng) } : null;
    if(!d || d.pinConfirmado !== true || d.activo === false || !coordenadaValida(coord)){ sinPin.push(p.nombre || p.direccion); continue; }
    const r = Number(d.radioM);
    paradas.push({ orden: i + 1, tipo: p.tipo, puntoId: p.puntoId, nombre: txt(p.nombre || d.nombre, 200), direccion: txt(p.direccion, 400), contacto: txt(p.contacto, 120), telefono: txt(p.telefono, 30),
      lat: coord.lat, lng: coord.lng, radioM: r >= 30 && r <= 2000 ? r : RADIO_GEOCERCA_DEFAULT_M, estado: "Pendiente" });
  }
  if(sinPin.length > 0) throw falla("failed-precondition", "Estos puntos no tienen pin confirmado en el catálogo: " + sinPin.join("; "));
  if(paradas.length === 0) throw falla("failed-precondition", "El servicio no tiene orígenes ni destinos con dirección");
  /* Por omisión se ordenan las entregas por cercanía (las cargas van primero); la oficina puede pedir el orden capturado. */
  const ordenar = req.data?.ordenar !== false;
  const o = ordenar ? ordenarParadas(paradas) : { paradas, kmAntes: null, kmDespues: null };
  paradas.splice(0, paradas.length, ...o.paradas.map((p, i) => ({ ...p, orden: i + 1 })));
  const existentes = await db().collection(`servicios/${servicioId}/paradas`).limit(1).get();
  if(!existentes.empty) throw falla("already-exists", "La ruta de este servicio ya está armada");
  const lote = db().batch();
  for(const p of paradas) lote.set(db().collection(`servicios/${servicioId}/paradas`).doc("p" + String(p.orden).padStart(2, "0")), { ...p, creadaEn: ahora() });
  lote.update(refS, { choferId, choferNombre: c.data().nombre || servicio.choferNombre || "", rutaArmadaEn: ahora(), actualizadoEn: ahora() });
  lote.set(db().collection(`servicios/${servicioId}/eventos`).doc(), { tipo: "ruta_armada", paradas: paradas.length, choferId, ordenadaPorCercania: ordenar,
    kmLineaRectaAntes: o.kmAntes, kmLineaRectaDespues: o.kmDespues, ...actorOficina(of), ts: ahora() });
  await lote.commit();
  return { ok: true, paradas: paradas.length, ordenada: ordenar, kmAntes: o.kmAntes, kmDespues: o.kmDespues };
});

/** Autoriza cerrar una parada fuera de geocerca. Solo oficina, siempre con motivo, siempre auditado. */
export const oficinaAutorizarExcepcion = onCall(OPC, async req => {
  const of = await oficinaDe(req);
  const servicioId = txt(req.data?.servicioId, 80), paradaId = txt(req.data?.paradaId, 80), motivo = txt(req.data?.motivo, 500);
  if(!servicioId || !paradaId || motivo.length < 10) throw falla("invalid-argument", "Escribe el motivo de la excepción (mínimo 10 caracteres)");
  const ref = db().doc(`servicios/${servicioId}/paradas/${paradaId}`);
  if(!(await ref.get()).exists) throw falla("not-found", "Parada no encontrada");
  const lote = db().batch();
  lote.update(ref, { excepcion: { motivo, autorizadaPor: of.nombre, autorizadaPorUid: of.uid, autorizadaEn: Timestamp.now() } });
  lote.set(db().collection(`servicios/${servicioId}/eventos`).doc(), { tipo: "excepcion_geocerca", paradaId, motivo, ...actorOficina(of), ts: ahora() });
  await lote.commit();
  return { ok: true };
});
