/* DMOV · Fase 1 — funciones del chofer y de la oficina para la ruta.
   Toda validación crítica vive aquí: identidad, dispositivo, check-in, posiciones,
   geocerca y cierre de parada. La app solo PIDE; el servidor decide y deja bitácora.
   El chofer no escribe Firestore directo: las reglas se lo impiden. */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { validarLote, coordenadaValida, distanciaM, RADIO_GEOCERCA_DEFAULT_M } from "./lib/geo.js";
import { evaluarCierreParada, validarCheckIn, TIPOS_INCIDENCIA } from "./lib/paradas.js";
import { ordenarParadas } from "./lib/rutas.js";
import { fusionarClaims } from "./permisos.js";
import { actualizarQuieto, actualizarFueraDeRuta, lineaDeParadas, alertasChoferes, UMBRALES_CHOFER, TIPOS_ALERTA_CHOFER } from "./lib/vigilancia.js";
import { revisarFotoJornada, lineaDeTexto, lineaATexto } from "./lib/evidencia.js";

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

/* Alerta con id estable (la misma situación nunca se duplica). Si ya existe, no hace nada. */
async function alertaUnica(a){
  await db().collection("alertas").doc(a.id).create({ type: a.type, titulo: TIPOS_ALERTA_CHOFER[a.type] || a.type, message: a.message, msg: a.message, folio: a.folio || "",
    choferId: a.choferId || "", choferNombre: a.choferNombre || "", servicioId: a.servicioId || "", ref: a.ref || null,
    ...(Number.isFinite(a.lat) && Number.isFinite(a.lng) ? { lat: a.lat, lng: a.lng } : {}),
    origen: "vigilante", atendida: false, read: false, ts: ahora(), createdAt: ahora() }).catch(() => {});
}

/* Fotos de check-in/out: el SERVIDOR revisa que existan, que sean imágenes y que se hayan subido hace
   unos minutos (hora de Google, no del celular). Se guarda su huella (md5) para que no se puedan cambiar. */
async function sellarFotos(rutas, prefijo){
  const out = {}, problemas = [];
  for(const [k, ruta] of Object.entries(rutas)){
    const r = txt(ruta, 400);
    if(!r.startsWith(prefijo)) throw falla("invalid-argument", "Las fotos deben tomarse desde la app");
    let meta = null;
    try { [meta] = await getStorage().bucket().file(r).getMetadata(); } catch { meta = null; }
    const v = revisarFotoJornada(meta, Date.now());
    if(!v.ok) throw falla("failed-precondition", v.motivo);
    if(v.aviso) problemas.push(v.aviso);
    out[k] = { ruta: r, md5: v.md5, bytes: v.bytes, subidaEnMs: v.subidaEnMs, selloCliente: meta?.metadata?.sello || "" };
  }
  return { fotos: out, problemas };
}

/* Trazo de calles de la ruta (Mapbox) para saber si el chofer se sale. Si falla, queda la línea entre paradas. */
async function trazarRuta(servicioId, desde = null){
  const ref = db().doc("servicios/" + servicioId);
  const ps = (await ref.collection("paradas").orderBy("orden").get()).docs.map(d => d.data()).filter(p => p.estado === "Pendiente" && coordenadaValida(p));
  const puntos = [...(desde && coordenadaValida(desde) ? [desde] : []), ...ps].slice(0, 25);
  let linea = lineaDeParadas(puntos), fuente = "paradas";
  const token = String(process.env.MAPBOX_TOKEN || "");
  if(token && puntos.length >= 2){
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${puntos.map(p => `${p.lng},${p.lat}`).join(";")}?geometries=geojson&overview=simplified&access_token=${token}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const c = r.ok ? (await r.json()).routes?.[0]?.geometry?.coordinates : null;
      if(Array.isArray(c) && c.length >= 2){ linea = c; fuente = "calles"; }
    } catch(e){ console.warn("trazo de ruta", e?.message); }
  }
  await ref.update({ rutaLinea: lineaATexto(linea), rutaLineaFuente: fuente, rutaLineaEn: ahora() });
  return { puntos: linea.length, fuente };
}

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
  const pos = { lat: Number(d.lat), lng: Number(d.lng) }, precisionM = Number(d.precisionM), posTMs = Number(d.posTMs);
  if(!coordenadaValida(pos)) throw falla("failed-precondition", "No llegó tu ubicación. Prende el GPS y permite la ubicación para hacer tu check-in.");
  const fecha = fechaCDMX(), ref = db().doc(`jornadas/${chofer.id}_${fecha}`);
  if((await ref.get()).exists) return { ok: true, fecha, yaExistia: true };
  const { fotos, problemas } = await sellarFotos({ selfie: d.selfieRuta, placas: d.fotoPlacasRuta, odometro: d.fotoOdometroRuta }, prefijo);
  const dudas = [...problemas,
    ...(Number.isFinite(precisionM) && precisionM > 150 ? [`GPS impreciso (±${Math.round(precisionM)} m)`] : []),
    ...(Number.isFinite(posTMs) && Math.abs(Date.now() - posTMs) > 3 * 60000 ? ["la ubicación no era del momento"] : []),
    ...(d.simulada === true ? ["ubicación simulada"] : [])];
  const creada = await db().runTransaction(async tx => {
    if((await tx.get(ref)).exists) return false;
    tx.set(ref, { choferId: chofer.id, choferNombre: chofer.nombre || "", fecha, estado: "Abierta", checkInEn: ahora(), dispositivoId: chofer.dispositivoId,
      selfieRuta: txt(d.selfieRuta, 400), fotoPlacasRuta: txt(d.fotoPlacasRuta, 400), fotoOdometroRuta: txt(d.fotoOdometroRuta, 400),
      unidadPlaca: txt(d.unidadPlaca, 20).toUpperCase(), odometroKm: Number(d.odometroKm), combustiblePct: Number(d.combustiblePct),
      ubicacion: pos, precisionM: Number.isFinite(precisionM) ? Math.round(precisionM) : null, ubicacionTMs: Number.isFinite(posTMs) ? posTMs : null,
      ubicacionSimulada: d.simulada === true, fotos, dudas, verificacionFacial: "no_aplicada" });
    return true;
  });
  if(creada){
    await db().doc("ubicaciones/" + chofer.id).set({ choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: "", servicioFolio: "", lat: pos.lat, lng: pos.lng,
      tMs: Date.now(), precisionM: Number.isFinite(precisionM) ? Math.round(precisionM) : null, confiable: d.simulada !== true, origen: "check-in", actualizadoEn: ahora() });
    if(dudas.length) await alerta({ type: d.simulada === true ? "ubicacion_simulada" : "checkin_dudoso", choferId: chofer.id, choferNombre: chofer.nombre || "",
      msg: `Check-in de ${chofer.nombre || "chofer"} con dudas: ${dudas.join(", ")}`, lat: pos.lat, lng: pos.lng });
  }
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
  const u = await db().doc("ubicaciones/" + chofer.id).get();
  await trazarRuta(servicio.id, u.exists && Date.now() - (u.data().tMs || 0) < 30 * 60000 ? { lat: u.data().lat, lng: u.data().lng } : null).catch(e => console.warn("trazo", e?.message));
  return { ok: true, estado: "En ruta" };
});

/** Lote de posiciones. El servidor decide cuáles son confiables y levanta alertas.
 *  Con ruta: se guardan en el servicio. Sin ruta pero con jornada abierta: se guardan en la jornada
 *  (la ubicación se pide TODA la jornada, del check-in al check-out). */
export const choferSubirPosiciones = onCall(OPC, async req => {
  const { chofer } = await choferDe(req);
  const sid = txt(req.data?.servicioId, 80);
  const servicio = sid ? (await servicioDelChofer(sid, chofer)).servicio : null;
  let jornadaRef = null;
  if(!servicio){
    const ab = await db().collection("jornadas").where("choferId", "==", chofer.id).where("estado", "==", "Abierta").limit(5).get();
    if(ab.empty) throw falla("failed-precondition", "No tienes una jornada abierta");
    jornadaRef = ab.docs.map(d => d.ref).sort((a, b) => b.id.localeCompare(a.id))[0];
  }
  const refUlt = db().doc("ubicaciones/" + chofer.id), ult = await refUlt.get();
  const U = ult.exists ? ult.data() : {};
  const previa = ult.exists && U.confiable !== false ? { lat: U.lat, lng: U.lng, tMs: U.tMs } : null;
  const r = validarLote(req.data?.posiciones, { ahoraMs: Date.now(), ultimaConfiable: previa });
  /* Vigilancia: desde cuándo está en el mismo lugar y desde cuándo está fuera de su ruta (solo en ruta). */
  const mismoServicio = servicio && U.servicioId === servicio.id;
  let quieto = mismoServicio && U.quietoDesdeMs ? { quietoDesdeMs: U.quietoDesdeMs, quietoLat: U.quietoLat, quietoLng: U.quietoLng } : null;
  let fuera = mismoServicio && U.fueraDesdeMs ? { fueraDesdeMs: U.fueraDesdeMs, fueraM: U.fueraM } : null;
  const enRuta = servicio?.estado === "En ruta", linea = enRuta ? lineaDeTexto(servicio.rutaLinea) : [];
  for(const p of r.aceptadas){
    if(p.confiable === false || p.precisionM > 200) continue;
    if(enRuta) quieto = actualizarQuieto(quieto, p);
    if(enRuta && linea.length >= 2) fuera = actualizarFueraDeRuta(fuera, p, linea);
  }
  if(r.aceptadas.length > 0){
    const lote = db().batch(), n = r.aceptadas.length, fin = r.aceptadas[n - 1];
    const destino = servicio ? db().collection(`servicios/${servicio.id}/posiciones`).doc() : jornadaRef.collection("posiciones").doc();
    lote.set(destino, { choferId: chofer.id, desdeMs: r.aceptadas[0].tMs, hastaMs: fin.tMs, n, puntos: r.aceptadas, recibidoEn: ahora() });
    if(!ult.exists || fin.tMs >= (U.tMs || 0))
      lote.set(refUlt, { choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio?.id || "", servicioFolio: servicio?.folio || "",
        lat: fin.lat, lng: fin.lng, tMs: fin.tMs, precisionM: fin.precisionM, bateria: fin.bateria, confiable: fin.confiable, origen: servicio ? "ruta" : "jornada", actualizadoEn: ahora(),
        quietoDesdeMs: quieto?.quietoDesdeMs ?? null, quietoLat: quieto?.quietoLat ?? null, quietoLng: quieto?.quietoLng ?? null,
        fueraDesdeMs: fuera?.fueraDesdeMs ?? null, fueraM: fuera?.fueraM ?? null,
        ...(r.ultimaConfiable ? { confiableLat: r.ultimaConfiable.lat, confiableLng: r.ultimaConfiable.lng, confiableTMs: r.ultimaConfiable.tMs } : {}) });
    await lote.commit();
  }
  /* Alerta al momento (no esperar al vigilante): detenido demasiado o fuera de ruta. */
  const ahoraMs = Date.now();
  if(enRuta && ((quieto && ahoraMs - quieto.quietoDesdeMs >= UMBRALES_CHOFER.detenidoMin * 60000) || (fuera && ahoraMs - fuera.fueraDesdeMs >= UMBRALES_CHOFER.fueraDeRutaMin * 60000))){
    try {
      const ps = (await db().collection(`servicios/${servicio.id}/paradas`).get()).docs.map(d => d.data()).filter(p => p.estado === "Pendiente");
      const fin = r.aceptadas[r.aceptadas.length - 1] || {};
      const alertas = alertasChoferes({ ubicaciones: { [chofer.id]: { tMs: fin.tMs || U.tMs, servicioId: servicio.id, lat: fin.lat, lng: fin.lng, ...quieto, ...fuera } },
        enRuta: [{ id: servicio.id, folio: servicio.folio || "", choferId: chofer.id, choferNombre: chofer.nombre || "", paradas: ps }] }, ahoraMs);
      for(const a of alertas.filter(x => ["detenido", "fuera_de_ruta"].includes(x.type))) await alertaUnica(a);
    } catch(e){ console.warn("vigilancia al momento", e?.message); }
  }
  /* "Está por llegar": si el cliente tiene link de seguimiento y la camioneta ya está a < 1 km de su
     siguiente entrega, se anota UNA vez en la bitácora (de ahí sale el aviso a su celular). */
  const ultima = r.aceptadas.filter(p => p.confiable !== false).pop();
  if(ultima && servicio?.seguimientoToken && servicio.estado === "En ruta"){
    try {
      const ps = (await db().collection(`servicios/${servicio.id}/paradas`).orderBy("orden").get()).docs;
      const sig = ps.find(d => d.data().tipo !== "carga" && !["Entregada", "Incidencia", "Quitada"].includes(d.data().estado));
      if(sig && !sig.data().avisoCercaEn && coordenadaValida({ lat: sig.data().lat, lng: sig.data().lng }) && distanciaM(ultima, { lat: sig.data().lat, lng: sig.data().lng }) < 1000){
        await db().runTransaction(async tx => {
          const p = await tx.get(sig.ref);
          if(p.data().avisoCercaEn) return;
          tx.update(sig.ref, { avisoCercaEn: ahora() });
          eventoServicio(tx, servicio.id, { tipo: "llegando", paradaId: sig.id, paradaNombre: p.data().nombre || "", ...actorChofer(chofer) });
        });
      }
    } catch(e){ console.warn("aviso de llegada", e?.message); }
  }
  for(const a of r.alertas) await alerta({ type: a.tipo, choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio?.id || "",
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
    const v = evaluarCierreParada({ parada, posicion, ahoraMs: momento, evidencia, incidencia, excepcion: parada.excepcion ? { ...parada.excepcion, paradaId: parada.id } : null });
    if(!v.permitido){
      eventoServicio(tx, servicio.id, { tipo: "cierre_rechazado", paradaId, motivo: v.motivo, distanciaM: v.distanciaM ?? null, ...actorChofer(chofer) });
      return { ...v, parada };
    }
    tx.update(refParada, { estado: incidencia ? "Incidencia" : "Entregada", incidencia, evidencia, cerradaEn: ahora(), cerradaPor: chofer.id,
      distanciaAlCerrarM: v.distanciaM ?? null, cerradaPorExcepcion: v.porExcepcion === true, cerradaDiferida: diferida, cerradaEnEquipoMs: diferida ? cerradaMs : null });
    eventoServicio(tx, servicio.id, { tipo: incidencia ? "parada_incidencia" : "parada_entregada", paradaId, paradaNombre: parada.nombre || "", receptor: evidencia.receptor,
      incidencia, distanciaM: v.distanciaM ?? null, porExcepcion: v.porExcepcion === true, diferida, ...actorChofer(chofer) });
    const pendientes = todas.docs.filter(d => d.id !== paradaId && !["Entregada", "Incidencia", "Quitada"].includes(d.data().estado)).length;
    /* Paradas con problema (contando esta): la ruta termina igual, pero queda marcado y se avisa si no se entregó nada. */
    const conProblema = todas.docs.filter(d => d.id !== paradaId && d.data().estado === "Incidencia").length + (incidencia ? 1 : 0);
    const entregadas = todas.docs.filter(d => d.id !== paradaId && d.data().estado === "Entregada").length + (incidencia ? 0 : 1);
    if(pendientes === 0){
      tx.update(refServicio, { estado: "Entregada", "estadoTs.Entregada": ahora(), receptor: evidencia.receptor || "", actualizadoEn: ahora(),
        paradasConProblema: conProblema, paradasEntregadas: entregadas, sinEntregas: entregadas === 0 });
      eventoServicio(tx, servicio.id, { tipo: "estado", de: "En ruta", a: "Entregada", ...actorChofer(chofer) });
    }
    return { ...v, parada, pendientes, sinEntregas: pendientes === 0 && entregadas === 0 };
  });
  if(!resultado.permitido){
    if(resultado.fueraDeGeocerca) await alerta({ type: "cierre_fuera_de_punto", choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio.id,
      msg: `Intentó cerrar "${resultado.parada.nombre || paradaId}" a ${resultado.distanciaM} m del punto` });
    throw falla("failed-precondition", resultado.motivo);
  }
  if(incidencia) await alerta({ type: "incidencia", choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio.id, msg: `${incidencia} en "${resultado.parada.nombre || paradaId}"` });
  if(resultado.sinEntregas) await alerta({ type: "incidencia", choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: servicio.id, msg: `Ruta ${servicio.folio || ""} terminada SIN ninguna entrega: revisar antes de facturar` });
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
  const pos = { lat: Number(req.data?.lat), lng: Number(req.data?.lng) }, km = Number(req.data?.odometroKm), precisionM = Number(req.data?.precisionM);
  if(!coordenadaValida(pos)) throw falla("failed-precondition", "No llegó tu ubicación. Prende el GPS y permite la ubicación para cerrar tu día.");
  if(!(km > 0 && km < 2000000)) throw falla("invalid-argument", "Escribe los kilómetros que marca el tablero");
  const { fotos, problemas } = await sellarFotos({ odometroSalida: req.data?.fotoOdometroRuta }, `jornadas/${chofer.id}/`);
  const dudas = [...problemas, ...(Number.isFinite(precisionM) && precisionM > 150 ? [`GPS impreciso (±${Math.round(precisionM)} m)`] : [])];
  const r = await db().runTransaction(async tx => {
    const j = await tx.get(ref);
    if(!j.exists) throw falla("failed-precondition", "No tienes una jornada abierta");
    if(j.data().estado === "Cerrada") return { yaEstaba: true };
    const kmIni = Number(j.data().odometroKm);
    if(Number.isFinite(kmIni) && km < kmIni) throw falla("invalid-argument", `Los kilómetros (${km}) son menos que los de la mañana (${kmIni}). Revisa el tablero.`);
    tx.update(ref, { estado: "Cerrada", checkOutEn: ahora(), ubicacionSalida: pos, precisionSalidaM: Number.isFinite(precisionM) ? Math.round(precisionM) : null,
      odometroFinalKm: km, kmRecorridos: Number.isFinite(kmIni) ? km - kmIni : null, fotosSalida: fotos, dudasSalida: dudas });
    return { yaEstaba: false, kmIni };
  });
  if(!r.yaEstaba){
    await db().doc("ubicaciones/" + chofer.id).set({ choferId: chofer.id, choferNombre: chofer.nombre || "", servicioId: "", servicioFolio: "", lat: pos.lat, lng: pos.lng,
      tMs: Date.now(), precisionM: Number.isFinite(precisionM) ? Math.round(precisionM) : null, confiable: true, origen: "check-out", jornadaCerrada: true, actualizadoEn: ahora() });
    if(dudas.length) await alerta({ type: "checkin_dudoso", choferId: chofer.id, choferNombre: chofer.nombre || "", msg: `Check-out de ${chofer.nombre || "chofer"} con dudas: ${dudas.join(", ")}`, lat: pos.lat, lng: pos.lng });
  }
  return { ok: true, yaEstaba: r.yaEstaba };
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
  /* El permiso de subir sus fotos va dentro de su cuenta (no depende de que Storage lea Firestore). */
  await fusionarClaims(usuario.uid, { choferId });
  /* Al poner su contraseña, el botón "Continuar" lo lleva a la app del chofer; la página sale en español. */
  let enlace;
  const origen = String(req.rawRequest?.headers?.origin || "");
  const base = /^https:\/\/(salesflow-crm-13c4a\.(web\.app|firebaseapp\.com)|dmov2-ixgf\.vercel\.app)$/.test(origen) ? origen : "https://salesflow-crm-13c4a.web.app";
  try { enlace = await getAuth().generatePasswordResetLink(correo, { url: base + "/chofer" }); }
  catch { enlace = await getAuth().generatePasswordResetLink(correo); }
  enlace = /[?&]lang=/.test(enlace) ? enlace.replace(/([?&])lang=[^&]*/, "$1lang=es") : enlace + (enlace.includes("?") ? "&" : "?") + "lang=es";
  return { ok: true, enlace };
});

/** Libera el equipo de un chofer (cambio o reposición de celular). Queda en la bitácora de alertas. */
export const oficinaLiberarDispositivo = onCall(OPC, async req => {
  const of = await oficinaDe(req);
  const choferId = txt(req.data?.choferId, 80), motivo = txt(req.data?.motivo, 300);
  if(!choferId || !motivo) throw falla("invalid-argument", "Chofer y motivo son obligatorios");
  await db().doc("choferes/" + choferId).update({ dispositivoId: FieldValue.delete(), dispositivoLiberadoPor: of.nombre, dispositivoLiberadoEn: ahora(), dispositivoLiberadoMotivo: motivo });
  return { ok: true };
});

/** Una parada a partir de un lugar del catálogo con su punto confirmado (o null si no sirve para ruta). */
async function paradaDeCatalogo(p, orden){
  const punto = txt(p.puntoId, 80) ? await db().doc("puntos_entrega/" + txt(p.puntoId, 80)).get() : null;
  const d = punto?.exists ? punto.data() : null;
  const coord = d ? { lat: Number(d.lat), lng: Number(d.lng) } : null;
  if(!d || d.pinConfirmado !== true || d.activo === false || !coordenadaValida(coord)) return null;
  const r = Number(d.radioM);
  return { orden, tipo: p.tipo === "carga" ? "carga" : "entrega", puntoId: txt(p.puntoId, 80), nombre: txt(p.nombre || d.nombre, 200),
    direccion: txt(p.direccion, 400) || txt(d.direccion, 400) || `${coord.lat}, ${coord.lng}`, contacto: txt(p.contacto, 120), telefono: txt(p.telefono, 30),
    lat: coord.lat, lng: coord.lng, radioM: r >= 30 && r <= 2000 ? r : RADIO_GEOCERCA_DEFAULT_M, estado: "Pendiente" };
}

/** Arma la ruta del servicio: crea las paradas con la coordenada VERIFICADA del catálogo y asigna al chofer. */
export const oficinaPrepararRuta = onCall(OPC, async req => {
  const of = await oficinaDe(req);
  const servicioId = txt(req.data?.servicioId, 80), choferId = txt(req.data?.choferId, 80);
  const refS = db().doc("servicios/" + servicioId), s = await refS.get();
  if(!s.exists) throw falla("not-found", "Servicio no encontrado");
  const c = await db().doc("choferes/" + choferId).get();
  if(!c.exists || !c.data().authUid) throw falla("failed-precondition", "El chofer no tiene cuenta de la app. Vincúlalo primero.");
  const servicio = s.data();
  /* Un lugar del catálogo cuenta aunque no traiga dirección escrita: su coordenada verificada manda. */
  const lista = [...(servicio.origenes || []).map(p => ({ ...p, tipo: "carga" })), ...(servicio.destinos || []).map(p => ({ ...p, tipo: "entrega" }))].filter(p => txt(p.direccion) || txt(p.puntoId));
  const sinPin = [], paradas = [];
  for(const [i, p] of lista.entries()){
    const parada = await paradaDeCatalogo(p, i + 1);
    if(!parada){ sinPin.push(p.nombre || p.direccion); continue; }
    paradas.push(parada);
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

/** Edita una ruta YA enviada: agrega paradas (lugares verificados) o quita pendientes.
 *  Lo quitado no se borra: queda "Quitada", con quién y cuándo. El chofer lo ve al momento. */
export const oficinaEditarRuta = onCall(OPC, async req => {
  const of = await oficinaDe(req);
  const servicioId = txt(req.data?.servicioId, 80);
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(servicioId)) throw falla("invalid-argument", "Servicio no válido");
  const refS = db().doc("servicios/" + servicioId), s = await refS.get();
  if(!s.exists) throw falla("not-found", "Servicio no encontrado");
  if(!["Asignada", "En ruta"].includes(s.data().estado)) throw falla("failed-precondition", `El servicio está en "${s.data().estado}": su ruta ya no se puede cambiar`);
  const quitar = [...new Set((Array.isArray(req.data?.quitar) ? req.data.quitar : []).map(x => txt(x, 80)).filter(Boolean))].slice(0, 50);
  const agregar = (Array.isArray(req.data?.agregar) ? req.data.agregar : []).slice(0, 50);
  if(!quitar.length && !agregar.length) throw falla("invalid-argument", "No hay cambios");
  const existentes = (await refS.collection("paradas").get()).docs, porId = new Map(existentes.map(d => [d.id, d]));
  for(const id of quitar){
    const d = porId.get(id);
    if(!d) throw falla("not-found", "Parada no encontrada");
    if(d.data().estado !== "Pendiente") throw falla("failed-precondition", `"${d.data().nombre || id}" ya se cerró o se quitó: no se puede quitar`);
  }
  let orden = existentes.reduce((m, d) => Math.max(m, Number(d.data().orden) || 0), 0);
  const nuevas = [], sinPin = [];
  for(const p of agregar){ const n = await paradaDeCatalogo(p, ++orden); if(n) nuevas.push(n); else sinPin.push(txt(p.nombre || p.direccion, 80)); }
  if(sinPin.length) throw falla("failed-precondition", "Estos lugares no están confirmados en el mapa: " + sinPin.join("; "));
  const quedan = existentes.filter(d => d.data().estado === "Pendiente" && !quitar.includes(d.id)).length + nuevas.length;
  if(quedan === 0) throw falla("failed-precondition", "La ruta se quedaría sin paradas pendientes. Si ya no va, cancela el servicio.");
  const lote = db().batch();
  for(const id of quitar) lote.update(porId.get(id).ref, { estado: "Quitada", quitadaEn: ahora(), quitadaPor: of.nombre });
  for(const n of nuevas) lote.set(refS.collection("paradas").doc("p" + String(n.orden).padStart(2, "0")), { ...n, agregadaDespues: true, creadaEn: ahora() });
  lote.update(refS, { actualizadoEn: ahora() });
  lote.set(refS.collection("eventos").doc(), { tipo: "ruta_editada", agregadas: nuevas.map(n => n.nombre), quitadas: quitar.map(id => porId.get(id).data().nombre || id), ...actorOficina(of), ts: ahora() });
  await lote.commit();
  if(s.data().estado === "En ruta") await trazarRuta(servicioId, null).catch(e => console.warn("trazo", e?.message));   // el camino nuevo para saber si se sale
  return { ok: true, agregadas: nuevas.length, quitadas: quitar.length };
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
