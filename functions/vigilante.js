/* VIGILANTE · revisa la operación cada 5 minutos en la nube y deja alertas en el
   Centro de Alertas. No depende de ninguna computadora encendida ni manda mensajes:
   solo crea alertas (con id estable, nunca duplicadas) y da por resueltas las que
   dejaron de aplicar. Cada corrida deja su latido en sistema/vigilante. */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { alertasEsperadas, planVigilante, TIPOS_ALERTA } from "./lib/vigilante.js";
import { enHorarioLaboral } from "./lib/solicitudes.js";
import { alertasChoferes, TIPOS_ALERTA_CHOFER } from "./lib/vigilancia.js";

const TITULOS = { ...TIPOS_ALERTA, ...TIPOS_ALERTA_CHOFER };
const fechaCDMX = (t = Date.now()) => new Date(t - 6 * 3600000).toISOString().slice(0, 10);
/* Campos de la alerta (los de chofer llevan a quién y dónde). */
const cuerpo = a => ({ type: a.type, titulo: TITULOS[a.type] || a.type, message: a.message, msg: a.message, folio: a.folio || "", ref: a.ref || null,
  ...(a.choferId ? { choferId: a.choferId, choferNombre: a.choferNombre || "" } : {}), ...(a.servicioId ? { servicioId: a.servicioId } : {}),
  ...(Number.isFinite(a.lat) && Number.isFinite(a.lng) ? { lat: a.lat, lng: a.lng } : {}),
  origen: "vigilante", atendida: false, read: false, ts: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });

const ms = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : 0);
const plano = (id, d, campos) => { const o = { id, ...d }; for(const k of campos) o[k] = ms(d[k]); return o; };

export const vigilante = onSchedule({ schedule: "every 5 minutes", timeZone: "America/Mexico_City", region: "us-central1", retryCount: 0, memory: "256MiB" }, async () => {
  const db = getFirestore();
  const ahora = Date.now();
  const [sol, cot, srv, con, abiertas] = await Promise.all([
    db.collection("solicitudes").where("estado", "in", ["Nueva", "En revisión"]).limit(500).get(),
    db.collection("cotizaciones_logistica").where("estado", "in", ["Propuesta", "Aprobada"]).limit(500).get(),
    db.collection("servicios").where("estado", "in", ["Solicitud", "Cotizada", "Confirmada"]).limit(500).get(),
    db.collection("sistema").doc("conectores").get(),
    db.collection("alertas").where("origen", "==", "vigilante").where("atendida", "==", false).limit(500).get(),
  ]);
  /* Choferes: quién va en ruta, quién tiene ruta hoy, sus jornadas y su última ubicación. */
  const hoy = fechaCDMX(ahora);
  const [enRutaQ, hoyQ, ubiQ, jorAbQ, jorHoyQ] = await Promise.all([
    db.collection("servicios").where("estado", "==", "En ruta").limit(200).get(),
    db.collection("servicios").where("fechaServicio", "==", hoy).limit(300).get(),
    db.collection("ubicaciones").limit(500).get(),
    db.collection("jornadas").where("estado", "==", "Abierta").limit(300).get(),
    db.collection("jornadas").where("fecha", "==", hoy).limit(300).get(),
  ]);
  const enRuta = await Promise.all(enRutaQ.docs.map(async d => {
    const x = d.data(), ps = (await d.ref.collection("paradas").get()).docs.map(p => p.data()).filter(p => p.estado === "Pendiente");
    return { id: d.id, folio: x.folio || "", choferId: x.choferId || "", choferNombre: x.choferNombre || "", enRutaMs: ms(x.estadoTs?.["En ruta"]), paradas: ps };
  }));
  const ubicaciones = Object.fromEntries(ubiQ.docs.map(d => [d.id, d.data()]));
  const jornadas = [...new Map([...jorAbQ.docs, ...jorHoyQ.docs].map(d => [d.id, { id: d.id, ...d.data(), checkInMs: ms(d.data().checkInEn) }])).values()];
  const conRutaHoy = hoyQ.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => ["Asignada", "En ruta"].includes(x.estado) && !x.historico);
  const deChoferes = alertasChoferes({ ubicaciones, enRuta, conRutaHoy, jornadas }, ahora);
  const conectores = {};
  for(const [k, v] of Object.entries(con.exists ? con.data() : {})) conectores[k] = { ...v, ultimoLatido: ms(v?.ultimoLatido) };
  const esperadas = alertasEsperadas({
    solicitudes: sol.docs.map(d => plano(d.id, d.data(), ["recibidaEn", "primeraRespuestaEn"])),
    cotizaciones: cot.docs.map(d => { const x = d.data(); const estadoTs = {}; for(const [k, v] of Object.entries(x.estadoTs || {})) estadoTs[k] = ms(v); return { id: d.id, ...x, creadoEn: ms(x.creadoEn), estadoTs }; }),
    servicios: srv.docs.map(d => ({ id: d.id, ...d.data() })),
    conectores,
  }, ahora).concat(deChoferes);
  const plan = planVigilante(esperadas, abiertas.docs.map(d => ({ id: d.id })));
  /* Solo se crean las que no existen: una que alguien ya atendió no se vuelve a crear
     (antes se intentaba, fallaba el lote completo y se reintentaba una por una). */
  const refs = plan.crear.map(a => db.collection("alertas").doc(a.id));
  const existen = refs.length ? await db.getAll(...refs) : [];
  const crear = plan.crear.filter((a, i) => !existen[i].exists);
  /* Fuera de horario no se calcula "servicio de hoy sin asignar": no se da por resuelta sola. */
  const resolver = enHorarioLaboral(ahora) ? plan.resolver : plan.resolver.filter(id => !id.startsWith("vig-srv-"));
  const lote = db.batch();
  for(const a of crear){
    // create(): si otra corrida ya la creó, falla ese documento y no se duplica.
    lote.create(db.collection("alertas").doc(a.id), cuerpo(a));
  }
  for(const id of resolver) lote.update(db.collection("alertas").doc(id), { atendida: true, resueltaSola: true, atendidaEn: FieldValue.serverTimestamp() });
  /* El texto dice cuánto lleva esperando: en las que siguen abiertas se actualiza en cada corrida
     (antes se quedaba en "lleva 1 h" aunque ya fuera un día). No cambia ts ni el estado. */
  const abiertasPorId = new Map(abiertas.docs.map(d => [d.id, d.data()]));
  const textos = esperadas.filter(a => abiertasPorId.has(a.id) && abiertasPorId.get(a.id).message !== a.message);
  for(const a of textos) lote.update(db.collection("alertas").doc(a.id), { message: a.message });
  lote.set(db.collection("sistema").doc("vigilante"), { ultimaCorrida: FieldValue.serverTimestamp(), abiertas: esperadas.length, creadas: crear.length, resueltas: resolver.length }, { merge: true });
  try { await lote.commit(); }
  catch(e){
    // Una alerta que ya existe (p. ej. la reabrió alguien) no debe tumbar la corrida: se escriben una por una.
    logger.warn("vigilante: lote con conflicto, se reintenta por documento", { error: e.message });
    for(const a of crear) await db.collection("alertas").doc(a.id).create(cuerpo(a)).catch(() => {});
    for(const id of resolver) await db.collection("alertas").doc(id).update({ atendida: true, resueltaSola: true, atendidaEn: FieldValue.serverTimestamp() }).catch(() => {});
    for(const a of textos) await db.collection("alertas").doc(a.id).update({ message: a.message }).catch(() => {});
    await db.collection("sistema").doc("vigilante").set({ ultimaCorrida: FieldValue.serverTimestamp(), abiertas: esperadas.length }, { merge: true });
  }
  logger.info("vigilante", { abiertas: esperadas.length, creadas: crear.length, resueltas: resolver.length });
});
