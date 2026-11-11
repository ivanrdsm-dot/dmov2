/* Acceso a datos de Servicios (Firestore). La pantalla nunca habla con Firestore
   directo: recibe este store, así se puede probar con uno en memoria.
   Cada escritura va en la MISMA transacción/lote que su evento de bitácora. */
import {
  collection, doc, onSnapshot, query, orderBy, limit, runTransaction, writeBatch, serverTimestamp, getDocs,
} from "firebase/firestore";
import { folioServicio, diffServicio, resumenRuta } from "./servicios.ts";
import { billingFields } from "./billing.js";
import { planDeFactura } from "./domain.ts";
const MESES_FAC = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const CAMPOS_PRECIO = ["precio", "precioAprobadoPor", "precioAprobadoEn"];
const aMs = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);
/* Timestamps de Firestore → ms, para que el dominio y la pantalla trabajen con números. */
export const normalizarServicio = (id, d) => {
  const estadoTs = {};
  for(const [k, v] of Object.entries(d.estadoTs || {})){ const ms = aMs(v); if(ms !== null) estadoTs[k] = ms; }
  return { id, ...d, estadoTs, creadoEn: aMs(d.creadoEn), actualizadoEn: aMs(d.actualizadoEn) };
};
const limpio = datos => {
  const out = {};
  for(const [k, v] of Object.entries(datos)){
    if(v === undefined || ["id", "folio", "estado", "estadoTs", "creadoEn", "creadoPor", "creadoPorNombre", "actualizadoEn", "costoTotal", "costosN", "costosPorConcepto", "costosActualizadosEn", "seguimientoToken", "seguimientoCreadoEn", "encuestaRespondida", "encuestaCalificacion"].includes(k)) continue;
    out[k] = v;
  }
  return out;
};
const actor = u => ({ actorUid: u.uid, actorNombre: u.nombre || u.email || "", actorRol: u.rol || "" });

export function crearServiciosStore(db){
  const col = collection(db, "servicios");
  return {
    suscribir(cb, onErr){
      return onSnapshot(query(col, orderBy("creadoEn", "desc"), limit(300)),
        s => cb(s.docs.map(d => normalizarServicio(d.id, d.data({ serverTimestamps: "estimate" })))), onErr);
    },
    suscribirEventos(id, cb, onErr){
      return onSnapshot(query(collection(db, "servicios", id, "eventos"), orderBy("ts", "asc"), limit(200)),
        s => cb(s.docs.map(d => { const e = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...e, ts: aMs(e.ts) }; })), onErr);
    },
    /* Paradas de la ruta (las escribe el servidor): para el detalle y la hoja de entrega. */
    async leerParadas(id){
      const s = await getDocs(query(collection(db, "servicios", id, "paradas"), orderBy("orden")));
      return s.docs.map(d => ({ id: d.id, ...d.data(), cerradaEn: aMs(d.data().cerradaEn) }));
    },
    suscribirCatalogo(nombre, cb){
      return onSnapshot(query(collection(db, nombre), limit(500)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => cb([]));
    },
    /* Folio consecutivo: contador y servicio se escriben en una sola transacción. */
    async crear(usuario, datos){
      const anio = new Date().getFullYear();
      const refContador = doc(db, "contadores", "servicios-" + anio);
      const refServicio = doc(col);
      const cuerpo = limpio(datos);
      /* El precio solo entra al crear si lo fija un admin o si viene de una cotización
         aceptada; en ese caso las reglas lo comparan contra la cotización en el servidor. */
      const deCotizacion = !!cuerpo.cotizacionId && Number(cuerpo.precio) > 0 && !!cuerpo.precioAprobadoPor;
      if(deCotizacion) delete cuerpo.precioAprobadoEn;
      else if(usuario.rol !== "admin") for(const k of CAMPOS_PRECIO) delete cuerpo[k];
      const folio = await runTransaction(db, async tx => {
        const snap = await tx.get(refContador);
        const n = (snap.exists() ? Number(snap.data().n) || 0 : 0) + 1;
        const f = folioServicio(n, anio);
        tx.set(refContador, { n, ultimoFolio: f, actualizadoEn: serverTimestamp() });
        tx.set(refServicio, { ...cuerpo, folio: f, estado: "Solicitud", estadoTs: { Solicitud: serverTimestamp() },
          creadoEn: serverTimestamp(), creadoPor: usuario.uid, creadoPorNombre: usuario.nombre || usuario.email || "" });
        tx.set(doc(collection(refServicio, "eventos")), { tipo: "creado", a: "Solicitud", ...actor(usuario), ts: serverTimestamp(),
          datos: { canal: cuerpo.canal || "", recibidaEn: cuerpo.recibidaEn || "", empresa: cuerpo.empresa || "",
            ...(deCotizacion ? { cotizacionFolio: cuerpo.cotizacionFolio || "", precio: cuerpo.precio } : {}) } });
        return f;
      });
      return { id: refServicio.id, folio };
    },
    async actualizar(usuario, antes, datos){
      const cuerpo = limpio(datos);
      if(usuario.rol !== "admin") for(const k of CAMPOS_PRECIO) delete cuerpo[k];
      const cambios = diffServicio(limpio(antes), { ...limpio(antes), ...cuerpo });
      if(cambios.length === 0) return 0;
      const ref = doc(db, "servicios", antes.id);
      const lote = writeBatch(db);
      lote.update(ref, { ...cuerpo, actualizadoEn: serverTimestamp() });
      lote.set(doc(collection(ref, "eventos")), { tipo: "editado", ...actor(usuario), ts: serverTimestamp(), cambios });
      await lote.commit();
      return cambios.length;
    },
    async aprobarPrecio(usuario, servicio, precio){
      if(usuario.rol !== "admin") throw new Error("Solo un administrador aprueba el precio");
      const ref = doc(db, "servicios", servicio.id);
      const lote = writeBatch(db);
      lote.update(ref, { precio, precioAprobadoPor: usuario.nombre || usuario.email || usuario.uid, precioAprobadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
      lote.set(doc(collection(ref, "eventos")), { tipo: "precio_aprobado", ...actor(usuario), ts: serverTimestamp(),
        cambios: [{ campo: "precio", antes: servicio.precio ?? "", despues: precio }] });
      await lote.commit();
    },
    /* Costos reales del servicio: se agregan con su evento; nunca se editan ni borran. */
    suscribirCostos(id, cb, onErr){
      return onSnapshot(query(collection(db, "servicios", id, "costos"), orderBy("ts", "asc"), limit(300)),
        s => cb(s.docs.map(d => { const c = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...c, ts: aMs(c.ts), anuladoEn: aMs(c.anuladoEn) }; })), onErr);
    },
    async agregarCosto(usuario, servicio, { concepto, monto, nota = "" }){
      const n = Number(String(monto ?? "").replace(/[$,\s]/g, ""));
      const ref = doc(db, "servicios", servicio.id);
      const lote = writeBatch(db);
      lote.set(doc(collection(ref, "costos")), { concepto, monto: Math.round(n * 100) / 100, nota: String(nota).trim().slice(0, 500), actorUid: usuario.uid, actorNombre: usuario.nombre || usuario.email || "", ts: serverTimestamp() });
      lote.set(doc(collection(ref, "eventos")), { tipo: "costo", ...actor(usuario), ts: serverTimestamp(), datos: { concepto, monto: Math.round(n * 100) / 100 } });
      await lote.commit();
    },
    async anularCosto(usuario, servicio, costo, motivo){
      const m = String(motivo ?? "").trim().slice(0, 500);
      if(!m) throw new Error("Escribe el motivo");
      const ref = doc(db, "servicios", servicio.id);
      const lote = writeBatch(db);
      lote.update(doc(ref, "costos", costo.id), { anulado: true, anuladoPor: usuario.uid, anuladoNombre: usuario.nombre || usuario.email || "", anuladoEn: serverTimestamp(), motivoAnulacion: m });
      lote.set(doc(collection(ref, "eventos")), { tipo: "costo_anulado", ...actor(usuario), ts: serverTimestamp(), motivo: m, datos: { concepto: costo.concepto, monto: costo.monto } });
      await lote.commit();
    },
    /* Servicio entregado → solicitud de factura en Facturación (una sola por servicio,
       id determinista). Lleva el precio aprobado; la fecha de vencimiento la pone
       quien emite. Servicio y factura quedan ligados y con evento. */
    async pedirFactura(usuario, servicio){
      const precio = Number(servicio.precio);
      if(!(precio > 0)) throw new Error("Primero un administrador debe aprobar el precio");
      if(!["Entregada", "Cerrada", "Conciliada"].includes(servicio.estado)) throw new Error("La factura se pide cuando el servicio ya se entregó");
      const refS = doc(db, "servicios", servicio.id), refF = doc(db, "facturas", "servicio_" + servicio.id);
      const f = /^\d{4}-\d{2}-\d{2}$/.test(String(servicio.fechaServicio || "")) ? new Date(servicio.fechaServicio + "T12:00:00") : new Date();
      const r2 = n => Math.round(n * 100) / 100;
      const subtotal = r2(precio), ivaAmt = r2(precio * 0.16);
      const contacto = String(servicio.solicitanteContacto || "");
      const folio = "FAC-" + Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 6).toUpperCase();
      await runTransaction(db, async tx => {
        if((await tx.get(refF)).exists()) throw new Error("Este servicio ya tiene su factura pedida");
        tx.set(refF, { ...billingFields({ plan: servicio.plan || "" }), mesOp: MESES_FAC[f.getMonth()], anio: f.getFullYear(),
          empresa: servicio.empresa || "", solicitante: servicio.solicitante || "", plan: servicio.plan || "",
          planNumero: planDeFactura({ plan: servicio.plan, empresa: servicio.empresa }) || "",
          servicio: `${servicio.folio} · ${resumenRuta(servicio)}`, subtotal, ivaAmt, total: r2(subtotal + ivaAmt), iva: true,
          status: "Solicitada a Katia", notas: "Generada desde el servicio " + servicio.folio, fechaEmision: "", fechaVenc: "",
          emailCliente: contacto.includes("@") ? contacto : "", servicioOrigenId: servicio.id, servicioOrigenFolio: servicio.folio,
          cotizacionFolio: servicio.cotizacionFolio || "", folio, createdAt: serverTimestamp() });
        tx.update(refS, { facturaId: refF.id, facturaFolio: folio, facturaPedidaEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
        tx.set(doc(collection(refS, "eventos")), { tipo: "factura_pedida", ...actor(usuario), ts: serverTimestamp(), datos: { facturaFolio: folio, total: r2(subtotal + ivaAmt) } });
      });
      return { folio };
    },
    async cambiarEstado(usuario, servicio, a, { motivo = "", faltantes = [] } = {}){
      const ref = doc(db, "servicios", servicio.id);
      const lote = writeBatch(db);
      lote.update(ref, { estado: a, ["estadoTs." + a]: serverTimestamp(), actualizadoEn: serverTimestamp() });
      lote.set(doc(collection(ref, "eventos")), { tipo: "estado", de: servicio.estado || "Solicitud", a, ...actor(usuario), ts: serverTimestamp(),
        motivo, faltantes, excepcion: faltantes.length > 0 });
      await lote.commit();
    },
  };
}
