/* Acceso a datos de Cotizaciones de logística (Firestore).
   Cada escritura va en el mismo lote que su evento de bitácora. El cálculo
   guardado (entrada y resultado) no se vuelve a escribir nunca. */
import {
  collection, doc, onSnapshot, query, orderBy, limit, runTransaction, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { folioCotizacion, evaluarTransicion, validarCotizacion } from "./cotizaciones.ts";

export const COLECCION_COTIZACIONES = "cotizaciones_logistica";
const aMs = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);
export const normalizarCotizacion = (id, d) => {
  const estadoTs = {};
  for(const [k, v] of Object.entries(d.estadoTs || {})){ const ms = aMs(v); if(ms !== null) estadoTs[k] = ms; }
  return { id, ...d, estadoTs, creadoEn: aMs(d.creadoEn), aprobadoEn: aMs(d.aprobadoEn), actualizadoEn: aMs(d.actualizadoEn) };
};
const actor = u => ({ actorUid: u.uid, actorNombre: u.nombre || u.email || "", actorRol: u.rol || "" });
const t = (v, max) => String(v ?? "").trim().slice(0, max);
const plano = v => JSON.parse(JSON.stringify(v ?? null));     // Firestore no acepta undefined

export function crearCotizacionesStore(db){
  const col = collection(db, COLECCION_COTIZACIONES);
  return {
    suscribir(cb, onErr){
      return onSnapshot(query(col, orderBy("creadoEn", "desc"), limit(300)),
        s => cb(s.docs.map(d => normalizarCotizacion(d.id, d.data({ serverTimestamps: "estimate" })))), onErr);
    },
    suscribirEventos(id, cb, onErr){
      return onSnapshot(query(collection(db, COLECCION_COTIZACIONES, id, "eventos"), orderBy("ts", "asc"), limit(200)),
        s => cb(s.docs.map(d => { const e = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...e, ts: aMs(e.ts) }; })), onErr);
    },
    /* Guarda la propuesta con folio consecutivo. Nunca lleva precio aprobado. */
    async crear(usuario, datos){
      const faltan = validarCotizacion(datos);
      if(faltan.length) throw new Error("Falta: " + faltan.join(", "));
      const anio = new Date().getFullYear();
      const refContador = doc(db, "contadores", COLECCION_COTIZACIONES + "-" + anio);
      const ref = doc(col);
      const sol = datos.solicitud || null;
      const cuerpo = {
        empresa: t(datos.empresa, 200), solicitante: t(datos.solicitante, 200), contacto: t(datos.contacto, 320), notas: t(datos.notas, 2000),
        entrada: plano(datos.entrada), resultado: plano(datos.resultado), precioPropuesto: Number(datos.resultado.precio),
        ...(sol ? { solicitudId: sol.id, solicitudFolio: sol.folio || "", solicitudCanal: sol.canal || "", solicitudRecibidaEn: Number(sol.recibidaEn) || null } : {}),
        ...(datos.sustituyeA ? { sustituyeA: t(datos.sustituyeA, 40) } : {}),
      };
      const folio = await runTransaction(db, async tx => {
        const snap = await tx.get(refContador);
        const n = (snap.exists() ? Number(snap.data().n) || 0 : 0) + 1;
        const f = folioCotizacion(n, anio);
        tx.set(refContador, { n, ultimoFolio: f, actualizadoEn: serverTimestamp() });
        tx.set(ref, { ...cuerpo, folio: f, estado: "Propuesta", estadoTs: { Propuesta: serverTimestamp() },
          creadoEn: serverTimestamp(), creadoPor: usuario.uid, creadoPorNombre: usuario.nombre || usuario.email || "" });
        tx.set(doc(collection(ref, "eventos")), { tipo: "creada", a: "Propuesta", ...actor(usuario), ts: serverTimestamp(),
          datos: { precioPropuesto: cuerpo.precioPropuesto, solicitudFolio: cuerpo.solicitudFolio || "" } });
        return f;
      });
      return { id: ref.id, folio, precioPropuesto: cuerpo.precioPropuesto };
    },
    /* Solo un administrador fija el precio que verá el cliente. */
    async aprobar(usuario, c, precio, nota = ""){
      const v = evaluarTransicion(c, "Aprobada", { esAdmin: usuario.rol === "admin" });
      if(!v.permitido) throw new Error(v.razon);
      const n = Number(precio);
      if(!(n > 0)) throw new Error("El precio aprobado debe ser mayor a cero");
      const ref = doc(db, COLECCION_COTIZACIONES, c.id);
      const lote = writeBatch(db);
      lote.update(ref, { estado: "Aprobada", "estadoTs.Aprobada": serverTimestamp(), precioAprobado: n,
        aprobadoPor: usuario.nombre || usuario.email || usuario.uid, aprobadoPorUid: usuario.uid, aprobadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
      lote.set(doc(collection(ref, "eventos")), { tipo: "precio_aprobado", de: c.estado, a: "Aprobada", ...actor(usuario), ts: serverTimestamp(),
        nota: t(nota, 500), cambios: [{ campo: "precioAprobado", antes: c.precioPropuesto ?? "", despues: n }] });
      await lote.commit();
    },
    async cambiarEstado(usuario, c, a, motivo = ""){
      const v = evaluarTransicion(c, a, { esAdmin: usuario.rol === "admin" });
      if(!v.permitido) throw new Error(v.razon);
      if(v.requiereMotivo && !t(motivo, 500)) throw new Error("Escribe el motivo");
      const ref = doc(db, COLECCION_COTIZACIONES, c.id);
      const lote = writeBatch(db);
      lote.update(ref, { estado: a, ["estadoTs." + a]: serverTimestamp(), ...(t(motivo, 500) ? { motivo: t(motivo, 500) } : {}), actualizadoEn: serverTimestamp() });
      lote.set(doc(collection(ref, "eventos")), { tipo: "estado", de: c.estado, a, motivo: t(motivo, 500), ...actor(usuario), ts: serverTimestamp() });
      await lote.commit();
    },
    /* Deja rastro de cada PDF entregable que se generó (no cambia la cotización). */
    async registrarPdf(usuario, c, datos){
      const lote = writeBatch(db);
      lote.set(doc(collection(db, COLECCION_COTIZACIONES, c.id, "eventos")), { tipo: "pdf_generado", ...actor(usuario), ts: serverTimestamp(),
        precio: Number(datos.precio) || 0, vigenteHasta: t(datos.vigenteHasta, 60), conNota: !!t(datos.nota, 10) });
      await lote.commit();
    },
    async vincularServicio(usuario, c, servicio){
      const ref = doc(db, COLECCION_COTIZACIONES, c.id);
      const lote = writeBatch(db);
      lote.update(ref, { servicioId: servicio.id, servicioFolio: servicio.folio, actualizadoEn: serverTimestamp() });
      lote.set(doc(collection(ref, "eventos")), { tipo: "servicio_creado", servicioFolio: servicio.folio, ...actor(usuario), ts: serverTimestamp() });
      await lote.commit();
    },
  };
}
