/* EDITAR UNA RUTA YA ENVIADA (oficina): quitar paradas que aún no se hacen o agregar nuevas.
   Lo quitado no se borra: queda "Quitada por la oficina" con quién y cuándo (lo decide el servidor,
   oficinaEditarRuta). Lo nuevo se confirma en el mapa igual que al asignar. El chofer lo ve al momento. */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { A, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, MONO, boton, Chip } from "./uiBasico.jsx";
import { BuscadorLugar, PegarLista, TarjetaParada } from "./BuscadorLugar.jsx";
import { guardarLugares, sinUbicacion } from "./asignarRutaFlujo.js";

const mensajeError = e => String(e?.message || "No se pudo").replace(/^(functions\/[a-z-]+:?\s*)/i, "");

export default function EditarRuta({ db, usuario, servicio, lugares, token, llamar, onListo }){
  const [actuales, setActuales] = useState([]), [quitar, setQuitar] = useState([]), [nuevas, setNuevas] = useState([]);
  const [ocupado, setOcupado] = useState(""), [error, setError] = useState(""), [hecho, setHecho] = useState("");
  useEffect(() => onSnapshot(query(collection(db, "servicios", servicio.id, "paradas"), orderBy("orden")),
    s => setActuales(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setActuales([])), [db, servicio.id]);

  const agregar = p => setNuevas(ps => [...ps, { tipo: "entrega", contacto: "", telefono: "", ...p, clave: Date.now() + Math.random() }]);
  const cambiar = (clave, cambio) => setNuevas(ps => ps.map(p => p.clave === clave ? { ...p, ...cambio } : p));
  const sacar = clave => setNuevas(ps => ps.filter(p => p.clave !== clave));
  const alternar = id => setQuitar(q => q.includes(id) ? q.filter(x => x !== id) : [...q, id]);
  const cambios = quitar.length + nuevas.length;
  /* ⛔ Detener / reanudar una entrega: al chofer le sale "NO ENTREGAR" y el servidor no le deja cerrarla. */
  /* El motivo se escribe ahí mismo (sin ventanas del navegador); hay motivos rápidos de un toque. */
  const [motivoDe, setMotivoDe] = useState(""), [motivo, setMotivo] = useState("");
  const detener = async (p, detenerla) => {
    if(detenerla && motivoDe !== p.id){ setMotivoDe(p.id); setMotivo(""); setError(""); return; }
    if(detenerla && motivo.trim().length < 5){ setError("Escribe el motivo (lo ve el chofer)."); return; }
    setMotivoDe("");
    setError(""); setOcupado(detenerla ? "Deteniendo…" : "Reanudando…");
    try { await llamar("oficinaDetenerParada", { servicioId: servicio.id, paradaId: p.id, detener: detenerla, motivo: (motivo || "").trim() });
      setHecho(detenerla ? `⛔ Entrega detenida en ${p.nombre}. El chofer tiene que confirmar con "Enterado".` : `✅ ${p.nombre} reanudada. El chofer tiene que confirmar con "Enterado".`); }
    catch(e){ setError(mensajeError(e)); }
    setOcupado("");
  };
  const cp = servicio.cambioPendiente, horaDe = ms => ms ? new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "";
  const faltan = [nuevas.some(p => !p.confirmada) && "confirmar en el mapa cada lugar nuevo", nuevas.some(p => !String(p.nombre).trim()) && "nombre de cada lugar nuevo"].filter(Boolean);

  const guardar = async () => {
    if(faltan.length){ setError("Falta: " + faltan.join(", ") + "."); return; }
    const malos = sinUbicacion(nuevas);
    if(malos.length){ setError("Estos lugares no tienen ubicación: " + malos.map(p => p.nombre || p.direccion).join(", ")); return; }
    setError(""); setOcupado("Guardando…");
    try {
      const conId = await guardarLugares(db, usuario, nuevas, lugares);
      const r = await llamar("oficinaEditarRuta", { servicioId: servicio.id, quitar,
        agregar: conId.map(p => ({ puntoId: p.puntoId, nombre: String(p.nombre).trim(), direccion: p.direccion || "", tipo: p.tipo, contacto: p.contacto || "", telefono: p.telefono || "" })) });
      setQuitar([]); setNuevas([]);
      setHecho(`✓ Listo: ${[r.agregadas && `${r.agregadas} agregada${r.agregadas === 1 ? "" : "s"}`, r.quitadas && `${r.quitadas} quitada${r.quitadas === 1 ? "" : "s"}`].filter(Boolean).join(" y ")}. ${servicio.choferNombre || "El chofer"} ya lo ve en su celular.`);
    } catch(e){ setError(mensajeError(e)); }
    setOcupado("");
  };

  return (
    <div style={{ borderTop: "1px solid " + BORDER, marginTop: 10, paddingTop: 10 }}>
      {cp && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, padding: "8px 10px", borderRadius: 10,
        background: cp.enteradoMs ? GREEN + "14" : AMBER + "18", color: cp.enteradoMs ? GREEN : AMBER }}>
        {cp.enteradoMs ? `✓ El chofer confirmó el último cambio a las ${horaDe(cp.enteradoMs)}` : `⏳ Cambio enviado a las ${horaDe(cp.enMs)}: esperando que el chofer toque "Enterado". Si no lo hace en 5 min, te llega alerta.`}
        <div style={{ fontWeight: 400, color: TEXT, marginTop: 2 }}>{(cp.lineas || []).join(" · ")}</div></div>}
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>Toca <b>Quitar</b> en lo que ya no va, <b>⛔ Detener</b> si no se debe entregar, o agrega lugares abajo.</div>
      {actuales.map(p => {
        const marcada = quitar.includes(p.id), pendiente = p.estado === "Pendiente";
        return <div key={p.id} style={{ borderBottom: "1px dashed " + BORDER }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", opacity: p.estado === "Quitada" ? .55 : 1 }}>
          <b style={{ fontFamily: MONO, minWidth: 22 }}>{p.orden}.</b>
          <span style={{ flex: 1, color: TEXT, textDecoration: marcada || p.estado === "Quitada" ? "line-through" : "none" }}>{p.tipo === "carga" ? "Recoger" : "Entregar"} · {p.nombre}</span>
          {pendiente && p.detenida?.activa && <Chip color={ROSE}>⛔ Detenida</Chip>}
          {pendiente && <button disabled={!!ocupado} onClick={() => detener(p, !p.detenida?.activa)} style={{ ...boton(p.detenida?.activa ? GREEN : ROSE, false), padding: "4px 10px", minHeight: 28, fontSize: 12 }}>{p.detenida?.activa ? "Reanudar" : "⛔ Detener"}</button>}
          {pendiente
            ? <button onClick={() => alternar(p.id)} style={{ ...boton(marcada ? MUTED : ROSE, false), padding: "4px 10px", minHeight: 28, fontSize: 12 }}>{marcada ? "Dejarla" : "Quitar"}</button>
            : <Chip color={p.estado === "Entregada" ? GREEN : p.estado === "Incidencia" ? AMBER : MUTED}>{p.estado === "Quitada" ? "Quitada" : p.estado}</Chip>}
        </div>
        {motivoDe === p.id && <div style={{ background: ROSE + "0d", border: "1.5px solid " + ROSE, borderRadius: 12, padding: 10, margin: "4px 0 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: ROSE, marginBottom: 6 }}>¿Por qué no se entrega en {p.nombre}? (lo ve el chofer)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {["El cliente lo reprograma", "No hay quien reciba", "Falta mercancía", "Dirección por confirmar"].map(m =>
              <button key={m} onClick={() => setMotivo(m)} style={{ ...boton(ROSE, motivo === m), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>{m}</button>)}</div>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} onKeyDown={e => e.key === "Enter" && detener(p, true)} placeholder="O escribe el motivo"
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + BORDER, borderRadius: 10, padding: "9px 12px", fontSize: 15 }}/>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={!!ocupado} onClick={() => detener(p, true)} style={{ ...boton(ROSE), flex: 1 }}>⛔ Detener entrega</button>
            <button onClick={() => setMotivoDe("")} style={{ ...boton(MUTED, false), flex: 1 }}>Cancelar</button></div>
        </div>}</div>;
      })}
      <div style={{ marginTop: 12, fontWeight: 800, color: TEXT, fontSize: 14 }}>Agregar parada</div>
      <div style={{ marginTop: 6 }}><BuscadorLugar token={token} lugares={lugares} onElegir={agregar} llamar={llamar} cerca={nuevas[nuevas.length - 1] || actuales.filter(x => x.estado === "Pendiente").pop()}/></div>
      <PegarLista token={token} lugares={lugares} onAgregar={agregar} llamar={llamar}/>
      {nuevas.map((p, i) => <TarjetaParada key={p.clave} p={p} i={actuales.length + i} token={token} cambiar={cambiar} quitar={sacar}/>)}
      {error && <div style={{ color: ROSE, fontWeight: 700, marginTop: 10 }}>{error}</div>}
      {hecho && !cambios && <div style={{ color: GREEN, fontWeight: 700, marginTop: 10 }}>{hecho}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button disabled={!cambios || !!ocupado} onClick={guardar} style={{ ...boton(cambios ? A : MUTED), opacity: ocupado ? .6 : 1 }}>
          {ocupado || (cambios ? `Guardar cambios (${cambios})` : "Sin cambios")}</button>
        <button onClick={onListo} style={boton(MUTED, false)}>Cerrar</button>
      </div>
    </div>);
}
