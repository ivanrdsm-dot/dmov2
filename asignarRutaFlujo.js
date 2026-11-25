/* Lo que hace "Mandar al chofer" en Asignar ruta, sin pantalla: lo usan la hoja de Ilse
   y la prueba de punta a punta (e2e/flujo-ruta.mjs), así se prueba el mismo código.
   1. guardarLugares: cada lugar queda en el catálogo con su punto confirmado (o se reutiliza uno a <30 m).
   2. crearServicioRuta: el servicio con folio.
   3-4. terminarAsignacion: el servidor arma la ruta (oficinaPrepararRuta) y queda "Asignada",
        anotando lo que falte (cotización, precio): nada se inventa. Se puede repetir sin duplicar. */
import { crearServiciosStore } from "./serviciosStore.js";
import { crearCatalogoStore } from "./catalogosStore.js";
import { requisitosEstado } from "./servicios.ts";

export const ahoraLocal = (d = new Date()) => { const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const distanciaM = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export const sinUbicacion = paradas => paradas.filter(p => !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng)) || (Number(p.lat) === 0 && Number(p.lng) === 0));

export async function guardarLugares(db, usuario, paradas, lugares = []){
  const catalogo = crearCatalogoStore(db, "puntos_entrega"), conId = [];
  for(const p of paradas){
    let puntoId = p.puntoId;
    const existente = !puntoId && lugares.find(l => l.activo !== false && l.pinConfirmado === true && Number.isFinite(Number(l.lat)) && distanciaM({ lat: Number(l.lat), lng: Number(l.lng) }, p) < 30);
    if(existente) puntoId = existente.id;
    if(!puntoId) puntoId = await catalogo.guardar(usuario, null, { nombre: String(p.nombre).trim(), direccion: p.direccion || `${p.lat}, ${p.lng}`, lat: Number(p.lat), lng: Number(p.lng),
      coordenada: `${p.lat}, ${p.lng}`, pinConfirmado: true, radioM: "", horario: "", contacto: p.contacto || "", telefono: p.telefono || "", notasAcceso: "", origen: "Asignar ruta" });
    else if(p.puntoId && !lugares.find(l => l.id === p.puntoId)?.pinConfirmado){
      const antes = lugares.find(l => l.id === p.puntoId);
      if(antes) await catalogo.guardar(usuario, antes, { ...antes, pinConfirmado: true });
    }
    conId.push({ ...p, puntoId });
  }
  return conId;
}

export function datosServicio({ usuario, cliente, fecha, hora = "", paradas, placa, chofer, indicaciones = "", contactoCliente = "", ahora = new Date() }){
  const punto = p => ({ nombre: String(p.nombre).trim(), direccion: p.direccion || `${p.lat}, ${p.lng}`, puntoId: p.puntoId, contacto: p.contacto || "", telefono: p.telefono || "", horaPactada: p.horaPactada || "" });
  return { canal: "Asignación directa", recibidaEn: ahoraLocal(ahora), empresa: String(cliente).trim(), solicitante: usuario.nombre || usuario.email || "",
    fechaServicio: fecha, horaServicio: hora, origenes: paradas.filter(p => p.tipo === "carga").map(punto), destinos: paradas.filter(p => p.tipo === "entrega").map(punto),
    asignacionTipo: "Flota propia", unidadPlaca: placa, choferNombre: chofer.nombre || "", indicaciones: String(indicaciones).trim(), notas: String(indicaciones).trim(),
    ...(String(contactoCliente).trim() ? { solicitanteContacto: String(contactoCliente).trim() } : {}) };
}

export async function crearServicioRuta(db, usuario, datos){
  return crearServiciosStore(db).crear(usuario, datos);
}

/** `llamar(nombre, datos)` invoca una callable. `p` = { id, datos, choferId, ordenar }. */
export async function terminarAsignacion(db, usuario, llamar, p){
  try { await llamar("oficinaPrepararRuta", { servicioId: p.id, choferId: p.choferId, segundoChoferId: p.segundoChoferId || "", ordenar: p.ordenar !== false }); }
  catch(e){ if(e?.code !== "functions/already-exists") throw e; }   // ya estaba armada: se sigue
  const faltantes = requisitosEstado({ ...p.datos, estado: "Solicitud" }, "Asignada");
  await crearServiciosStore(db).cambiarEstado(usuario, { id: p.id, estado: "Solicitud" }, "Asignada",
    { motivo: faltantes.length ? "Asignada desde Asignar ruta; falta: " + faltantes.join(", ") : "Asignada desde Asignar ruta", faltantes });
  return { faltantes };
}
