/* DESPACHO Y TORRE DE CONTROL · quién va a dónde, quién está transmitiendo y qué alertas hay.
   Asignar, armar ruta, ligar cuentas y autorizar excepciones lo ejecuta el servidor. */
import { useEffect, useMemo, useRef, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, etiqueta, caja, boton, Campo, Chip, Seccion, Dialogo } from "./uiBasico.jsx";
import { estadoSenal, faltantesChoferApp, avanceRuta, semaforoViaje } from "./despacho.ts";

const COLOR = { verde: GREEN, ambar: AMBER, rojo: ROSE };
const COLOR_SENAL = { "en vivo": GREEN, "con retraso": AMBER, "sin señal": ROSE, nunca: MUTED };
const TIPO_ALERTA = { sos: "SOS", ubicacion_simulada: "Ubicación simulada", velocidad_imposible: "Salto imposible", reloj_adelantado: "Reloj adelantado",
  cierre_fuera_de_punto: "Cierre fuera del punto", incidencia: "Incidencia", dispositivo_no_autorizado: "Equipo no autorizado" };
const haceCuanto = (ms, ahora) => { if(!ms) return ""; const m = Math.max(0, Math.round((ahora - ms) / 60000)); return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`; };
const mensajeError = e => String(e?.message || "No se pudo completar").replace(/^(functions\/[a-z-]+:?\s*)/i, "");

function Viaje({ s, ubicacion, choferes, store, ahora, avisar }){
  const [paradas, setParadas] = useState([]);
  const [choferId, setChoferId] = useState(s.choferId || "");
  const [excepcion, setExcepcion] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => store.suscribirParadas(s.id, setParadas), [s.id, store]);
  const av = avanceRuta(paradas), sem = semaforoViaje(ubicacion, paradas, ahora), senal = estadoSenal(ubicacion, ahora);
  const listos = choferes.filter(c => faltantesChoferApp(c).length === 0);
  const correr = async (fn, ok) => { setOcupado(true); try { await fn(); avisar(ok); } catch(e){ avisar(mensajeError(e), true); } finally { setOcupado(false); } };
  return (
    <div style={{ background: "#fff", border: "1.5px solid " + (s.estado === "En ruta" ? COLOR[sem.color] + "70" : BORDER), borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontFamily: MONO }}>{s.folio}</b><span style={{ fontWeight: 700 }}>{s.empresa}</span>
        <Chip color={s.estado === "En ruta" ? COLOR[sem.color] : BLUE}>{s.estado === "En ruta" ? sem.motivo : "Por salir"}</Chip>
        <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>{s.choferNombre || "Sin chofer"}{s.unidadPlaca ? " · " + s.unidadPlaca : ""}</span>
      </div>
      {s.estado === "En ruta" && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
        Señal: <b style={{ color: COLOR_SENAL[senal.senal] }}>{senal.senal}{senal.minutos !== null ? ` · ${senal.minutos} min` : ""}</b>
        {typeof ubicacion?.bateria === "number" ? ` · batería ${ubicacion.bateria} %` : ""}
        {ubicacion?.lat ? <> · <a href={`https://www.google.com/maps?q=${ubicacion.lat},${ubicacion.lng}`} target="_blank" rel="noreferrer" style={{ color: BLUE, fontWeight: 700 }}>ver en el mapa</a></> : ""}
      </div>}
      {paradas.length === 0 ? (
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ flex: "1 1 220px" }}><Campo label="Chofer con app lista" opciones={["", ...listos.map(c => c.nombre || c.id)]} value={listos.find(c => c.id === choferId)?.nombre || ""}
            onChange={e => setChoferId(listos.find(c => (c.nombre || c.id) === e.target.value)?.id || "")}/>
            {listos.length === 0 && <div style={{ fontSize: 11, color: AMBER, fontWeight: 700, marginTop: 3 }}>Ningún chofer tiene la app lista. Crea su cuenta abajo.</div>}</div>
          <button disabled={!choferId || ocupado} onClick={() => correr(() => store.prepararRuta(s.id, choferId), "Ruta armada y asignada")} style={{ ...boton(A), opacity: !choferId || ocupado ? .5 : 1 }}>Mandar ruta al chofer</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 8, background: BORDER, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}><div style={{ width: av.pct + "%", height: "100%", background: GREEN }}/></div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{av.cerradas} de {av.total} paradas{av.incidencias ? ` · ${av.incidencias} con incidencia` : ""}</div>
          {paradas.map(p => (
            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, padding: "6px 0", borderTop: "1px solid " + BORDER }}>
              <span style={{ fontFamily: MONO, color: MUTED }}>{p.orden}</span><span style={{ flex: "1 1 200px" }}><b>{p.nombre}</b> <span style={{ color: MUTED }}>{p.tipo === "carga" ? "· carga" : ""}</span></span>
              <Chip color={p.estado === "Entregada" ? GREEN : p.estado === "Incidencia" ? AMBER : MUTED}>{p.estado === "Incidencia" ? p.incidencia || "Incidencia" : p.estado}</Chip>
              {p.estado === "Entregada" && <span style={{ fontSize: 11, color: MUTED }}>{p.cerradaPorExcepcion ? "por excepción" : p.distanciaAlCerrarM !== null && p.distanciaAlCerrarM !== undefined ? `a ${p.distanciaAlCerrarM} m` : ""}{p.cerradaDiferida ? " · sin señal" : ""}</span>}
              {p.estado === "Pendiente" && (p.excepcion ? <span style={{ fontSize: 11, color: AMBER, fontWeight: 700 }}>Excepción autorizada</span>
                : <button onClick={() => { setExcepcion(p); setMotivo(""); }} style={{ ...boton(MUTED, false), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>Autorizar cierre fuera del punto</button>)}
            </div>))}
        </div>)}
      {excepcion && <Dialogo titulo={"Cerrar la entrega fuera del punto · " + excepcion.nombre} onClose={() => setExcepcion(null)}>
        <p style={{ fontSize: 14, marginTop: 0 }}>El chofer podrá cerrar esta parada aunque el sistema no lo ubique dentro del punto. Queda registrado quién lo autorizó y por qué.</p>
        <Campo label="Motivo (mínimo 10 caracteres) *" area value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="CEDIS techado sin señal de GPS; confirmado por teléfono con recibo"/>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={() => setExcepcion(null)} style={boton(MUTED, false)}>Cancelar</button>
          <button disabled={motivo.trim().length < 10 || ocupado} onClick={() => correr(async () => { await store.autorizarExcepcion(s.id, excepcion.id, motivo.trim()); setExcepcion(null); }, "Excepción autorizada")} style={{ ...boton(AMBER), opacity: motivo.trim().length < 10 || ocupado ? .5 : 1 }}>Autorizar</button>
        </div></Dialogo>}
    </div>);
}

/* Mapa de choferes en ruta: un punto por chofer con su última ubicación (verde = señal
   reciente, ámbar = vieja, rojo = sin señal). Mapbox se carga solo al abrir esta pantalla. */
function MapaChoferes({ cargarMapa, puntos }){
  const cont = useRef(null), mapa = useRef(null), marcas = useRef([]);
  const [listo, setListo] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    cargarMapa().then(mb => {
      if(!vivo || !cont.current || mapa.current) return;
      mapa.current = new mb.Map({ container: cont.current, style: "mapbox://styles/mapbox/streets-v12", center: [-99.1332, 19.4326], zoom: 9 });
      mapa.current.addControl(new mb.NavigationControl({ showCompass: false }), "top-right");
      mapa.current.on("load", () => vivo && setListo(true));
      mapa.current.__mb = mb;
    }).catch(() => vivo && setError("No se pudo cargar el mapa."));
    return () => { vivo = false; marcas.current.forEach(m => m.remove()); mapa.current?.remove(); mapa.current = null; };
  }, [cargarMapa]);
  useEffect(() => {
    const m = mapa.current, mb = m?.__mb;
    if(!listo || !mb) return;
    marcas.current.forEach(x => x.remove()); marcas.current = [];
    const conPos = puntos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    for(const p of conPos){
      const el = document.createElement("div");
      el.style.cssText = `width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px ${p.color};background:${p.color}`;
      el.title = p.titulo;
      marcas.current.push(new mb.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(new mb.Popup({ offset: 12 }).setText(p.titulo)).addTo(m));
    }
    if(conPos.length === 1) m.flyTo({ center: [conPos[0].lng, conPos[0].lat], zoom: 12 });
    else if(conPos.length > 1){ const b = new mb.LngLatBounds(); conPos.forEach(p => b.extend([p.lng, p.lat])); m.fitBounds(b, { padding: 60, maxZoom: 13 }); }
  }, [listo, puntos]);
  return (
    <div style={{ position: "relative", height: 340, borderRadius: 14, overflow: "hidden", border: "1px solid " + BORDER, background: "#eef2f7" }}>
      <div ref={cont} style={{ position: "absolute", inset: 0 }}/>
      {(error || (listo && puntos.every(p => !Number.isFinite(p.lat)))) && <div style={{ position: "absolute", left: 12, bottom: 12, right: 12, background: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: MUTED, boxShadow: "0 4px 16px rgba(0,0,0,.08)" }}>
        {error || "Todavía ningún chofer está mandando ubicación. Aparecerán aquí cuando usen la app."}</div>}
    </div>);
}

export default function Despacho({ store, usuario, cargarMapa = null }){
  const [choferes, setChoferes] = useState([]), [ubicaciones, setUbicaciones] = useState({}), [servicios, setServicios] = useState([]), [alertas, setAlertas] = useState([]);
  const [ahora, setAhora] = useState(Date.now());
  const [ligar, setLigar] = useState(null), [correo, setCorreo] = useState(""), [enlace, setEnlace] = useState("");
  const [liberar, setLiberar] = useState(null), [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false), [aviso, setAviso] = useState(null);
  useEffect(() => store.suscribirChoferes(setChoferes), [store]);
  useEffect(() => store.suscribirUbicaciones(setUbicaciones), [store]);
  useEffect(() => store.suscribirServicios(setServicios), [store]);
  useEffect(() => store.suscribirAlertas(setAlertas), [store]);
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 20000); return () => clearInterval(t); }, []);
  useEffect(() => { if(!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);
  const avisar = (msg, mal = false) => setAviso({ msg, mal });
  const enRuta = servicios.filter(s => s.estado === "En ruta"), porSalir = servicios.filter(s => s.estado === "Asignada");
  const activos = useMemo(() => choferes.filter(c => c.status !== "Inactivo" && c.activo !== false).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")), [choferes]);
  const criticas = alertas.filter(a => !a.atendida && ["sos", "ubicacion_simulada", "cierre_fuera_de_punto", "velocidad_imposible"].includes(a.type));
  const puntosMapa = useMemo(() => activos.map(c => { const u = ubicaciones[c.id], sn = estadoSenal(u, ahora);
    return { id: c.id, lat: Number(u?.lat), lng: Number(u?.lng), titulo: `${c.nombre || "Chofer"} · ${sn.senal}${sn.minutos !== null ? " (" + sn.minutos + " min)" : ""}`,
      color: COLOR_SENAL[sn.senal] || AMBER }; }), [activos, ubicaciones, ahora]);
  const correr = async (fn) => { setOcupado(true); try { await fn(); } catch(e){ avisar(mensajeError(e), true); } finally { setOcupado(false); } };
  const tarjeta = (l, v, color) => <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" }}><div style={{ ...etiqueta, marginBottom: 6 }}>{l}</div><div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 26, color }}>{v}</div></div>;
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>Choferes en ruta</h1>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>Quién va a dónde y si su teléfono está mandando ubicación.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        {tarjeta("En ruta", enRuta.length, TEXT)}{tarjeta("Por salir", porSalir.length, BLUE)}
        {tarjeta("Sin señal", enRuta.filter(s => estadoSenal(ubicaciones[s.choferId], ahora).senal === "sin señal").length, ROSE)}
        {tarjeta("Alertas críticas sin atender", criticas.length, criticas.length ? ROSE : GREEN)}
      </div>
      {cargarMapa && <Seccion titulo="Mapa"><MapaChoferes cargarMapa={cargarMapa} puntos={puntosMapa}/></Seccion>}
      <Seccion titulo="Viajes">
        {servicios.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Nadie está en ruta ahora. Un servicio aparece aquí cuando le asignas chofer.</div>
          : <div style={{ display: "grid", gap: 10 }}>{[...enRuta, ...porSalir].map(s => <Viaje key={s.id} s={s} ubicacion={ubicaciones[s.choferId]} choferes={activos} store={store} ahora={ahora} avisar={avisar}/>)}</div>}
      </Seccion>
      <Seccion titulo="Choferes y su app">
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}><tbody>
          {activos.map(c => { const f = faltantesChoferApp(c), sn = estadoSenal(ubicaciones[c.id], ahora); return (
            <tr key={c.id} style={{ borderBottom: "1px solid " + BORDER }}>
              <td style={{ padding: "9px 8px" }}><b>{c.nombre}</b><div style={{ fontSize: 11, color: MUTED }}>{c.correoApp || "sin cuenta"}</div></td>
              <td style={{ padding: "9px 8px" }}>{f.length ? <Chip color={AMBER}>{f[0]}</Chip> : <Chip color={GREEN}>App lista</Chip>}</td>
              <td style={{ padding: "9px 8px", color: COLOR_SENAL[sn.senal], fontWeight: 700 }}>{sn.senal}{sn.minutos !== null ? ` · ${haceCuanto(ubicaciones[c.id]?.tMs, ahora)}` : ""}</td>
              <td style={{ padding: "9px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                {usuario.rol === "admin" && <button onClick={() => { setLigar(c); setCorreo(c.correoApp || ""); setEnlace(""); }} style={{ ...boton(BLUE, false), padding: "5px 10px", minHeight: 32, fontSize: 12, marginRight: 6 }}>{c.authUid ? "Nuevo enlace" : "Crear cuenta"}</button>}
                {c.dispositivoId && <button onClick={() => { setLiberar(c); setMotivo(""); }} style={{ ...boton(MUTED, false), padding: "5px 10px", minHeight: 32, fontSize: 12 }}>Cambió de teléfono</button>}
              </td></tr>); })}
          {activos.length === 0 && <tr><td style={{ padding: 16, color: MUTED }}>No hay choferes activos.</td></tr>}
        </tbody></table></div>
      </Seccion>
      <Seccion titulo="Alertas recientes">
        {alertas.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Sin alertas.</div> : alertas.slice(0, 12).map(a => (
          <div key={a.id} style={{ fontSize: 13, padding: "7px 0", borderBottom: "1px solid " + BORDER, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Chip color={a.type === "sos" ? ROSE : ["ubicacion_simulada", "cierre_fuera_de_punto", "velocidad_imposible"].includes(a.type) ? ROSE : AMBER}>{TIPO_ALERTA[a.type] || a.type}</Chip>
            <b>{a.choferNombre || ""}</b><span>{a.message || a.msg || a.mensaje || ""}</span><span style={{ marginLeft: "auto", fontSize: 11, color: MUTED }}>{haceCuanto(a.ts, ahora)}</span>
          </div>))}
      </Seccion>
      {ligar && <Dialogo titulo={"Cuenta de la app · " + ligar.nombre} onClose={() => setLigar(null)}>
        {!enlace ? <>
          <Campo label="Correo del chofer *" type="email" value={correo} onChange={e => setCorreo(e.target.value)}/>
          <p style={{ fontSize: 12, color: MUTED }}>Se crea su cuenta y obtienes un enlace para que él mismo ponga su contraseña. La cuenta solo funciona en el primer teléfono desde el que entre.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button onClick={() => setLigar(null)} style={boton(MUTED, false)}>Cancelar</button>
            <button disabled={!correo.trim() || ocupado} onClick={() => correr(async () => { const r = await store.vincularChofer(ligar.id, correo.trim()); setEnlace(r.enlace); })} style={{ ...boton(A), opacity: !correo.trim() || ocupado ? .5 : 1 }}>Crear y obtener enlace</button></div>
        </> : <>
          <p style={{ fontSize: 14, marginTop: 0 }}>Cuenta lista. Mándale este enlace al chofer para que ponga su contraseña. Trátalo como una llave: sirve una sola vez.</p>
          <textarea readOnly value={enlace} onFocus={e => e.target.select()} style={{ ...caja, minHeight: 90, fontFamily: MONO, fontSize: 12 }}/>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={() => navigator.clipboard?.writeText(enlace).then(() => avisar("Enlace copiado"))} style={boton(BLUE)}>Copiar enlace</button><button onClick={() => setLigar(null)} style={boton(MUTED, false)}>Cerrar</button></div>
        </>}</Dialogo>}
      {liberar && <Dialogo titulo={"Cambio de teléfono · " + liberar.nombre} onClose={() => setLiberar(null)}>
        <p style={{ fontSize: 14, marginTop: 0 }}>Su cuenta dejará de estar ligada al teléfono actual y se ligará al siguiente desde el que entre. Úsalo por cambio o reposición de equipo.</p>
        <Campo label="Motivo *" area value={motivo} onChange={e => setMotivo(e.target.value)}/>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}><button onClick={() => setLiberar(null)} style={boton(MUTED, false)}>Cancelar</button>
          <button disabled={!motivo.trim() || ocupado} onClick={() => correr(async () => { await store.liberarDispositivo(liberar.id, motivo.trim()); setLiberar(null); avisar("Equipo liberado"); })} style={{ ...boton(AMBER), opacity: !motivo.trim() || ocupado ? .5 : 1 }}>Liberar</button></div></Dialogo>}
      {aviso && <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: aviso.mal ? ROSE : TEXT, color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 600, zIndex: 700, maxWidth: "90vw" }}>{aviso.msg}</div>}
    </div>);
}
