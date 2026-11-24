/* ASIGNAR RUTA · una sola hoja para la oficina (Ilse):
   ¿quién maneja? → ¿qué camioneta? → ¿a dónde va? → indicaciones → Mandar al chofer.
   Por dentro hace lo mismo que el camino largo: guarda los lugares (con su punto confirmado
   en el mapa), crea el servicio con folio, arma la ruta en el servidor (oficinaPrepararRuta,
   que ordena por cercanía) y lo pasa a "Asignada" dejando en la bitácora lo que falta
   (cotización, precio): nada se inventa. Al chofer le aparece solo en su celular. */
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, where, limit, getDocs, orderBy } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, boton, caja, Chip } from "./uiBasico.jsx";
import { correoDeChofer, telefono10 } from "./lugares.ts";
import { BuscadorLugar, PegarLista, TarjetaParada } from "./BuscadorLugar.jsx";
import EditarRuta from "./EditarRuta.jsx";

/* Manda al cliente su link privado de seguimiento (mapa en vivo). Abre WhatsApp con el mensaje listo; la oficina lo envía. */
function BotonSeguimiento({ servicio, telefono = "", llamar, compacto = false }){
  const [estado, setEstado] = useState("");
  const mandar = async () => {
    setEstado("…");
    try {
      const r = await llamar("oficinaLinkSeguimiento", { servicioId: servicio.id });
      const url = `${window.location.origin}/s/${r.token}`, tel = telefono10(telefono);
      const texto = `Hola, soy de D Movimiento. Aquí puedes ver tu envío ${servicio.folio || ""} en el mapa, en vivo; se actualiza solo y te avisa cada entrega:\n${url}`;
      if(tel.length === 10){ window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(texto)}`, "_blank", "noopener"); setEstado("✓ Abrí WhatsApp"); }
      else { await navigator.clipboard?.writeText(url).catch(() => {}); setEstado("✓ Link copiado: pégalo al cliente"); }
    } catch(e){ setEstado("No se pudo: " + mensajeError(e)); }
  };
  return <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <button onClick={mandar} style={{ ...boton(GREEN, !compacto), ...(compacto ? { padding: "5px 10px", minHeight: 30, fontSize: 12 } : {}) }}>📲 {compacto ? "Seguimiento" : "Mandar seguimiento al cliente"}</button>
    {estado && <span style={{ fontSize: 12, color: estado.startsWith("No") ? ROSE : MUTED }}>{estado}</span>}</span>;
}
import { guardarLugares, datosServicio, crearServicioRuta, terminarAsignacion, sinUbicacion } from "./asignarRutaFlujo.js";

/* La dirección del sistema es la misma desde la que se abre (Firebase o Vercel). */
const URL_CHOFER = (typeof window !== "undefined" ? window.location.origin : "https://salesflow-crm-13c4a.web.app") + "/chofer";
const hoyCDMX = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const mensajeError = e => String(e?.message || "No se pudo").replace(/^(functions\/[a-z-]+:?\s*)/i, "");
const Paso = ({ n, titulo, children }) => (
  <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ width: 28, height: 28, borderRadius: "50%", background: A, color: "#fff", fontWeight: 900, display: "grid", placeItems: "center" }}>{n}</span>
      <span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 18, color: TEXT }}>{titulo}</span>
    </div>
    {children}
  </div>);

/* ── Acceso del chofer a su app (solo admin): cuenta con su celular + enlace por WhatsApp ── */
function AccesoChofer({ chofer, llamar, esAdmin, enlace, setEnlace }){
  const [error, setError] = useState(""), [ocupado, setOcupado] = useState(false);
  const tel = telefono10(chofer.tel);
  if(!esAdmin) return <div style={{ fontSize: 13, color: AMBER, marginTop: 8 }}>⚠️ {chofer.nombre} todavía no tiene la app. Pídele a un administrador que le dé acceso (aquí mismo).</div>;
  const crear = async () => {
    const correo = correoDeChofer(tel);
    if(!correo){ setError("Primero captura su celular de 10 dígitos en Choferes."); return; }
    setOcupado(true); setError("");
    try { const r = await llamar("oficinaVincularChofer", { choferId: chofer.id, correo }); setEnlace(r.enlace); }
    catch(e){ setError(mensajeError(e)); }
    setOcupado(false);
  };
  const texto = `Hola ${String(chofer.nombre || "").split(" ")[0]}, esta es tu entrada a la app de DMovimiento:\n1) Abre este enlace y pon una contraseña: ${enlace}\n2) Abre ${URL_CHOFER} y ANTES de entrar agrégala a tu pantalla de inicio (menú del navegador → Agregar a pantalla de inicio).\n3) Entra SIEMPRE desde ese ícono, con tu celular ${tel} y tu contraseña.`;
  return (
    <div style={{ background: AMBER + "12", border: "1px solid " + AMBER + "55", borderRadius: 12, padding: 12, marginTop: 8, fontSize: 14 }}>
      {!enlace ? <>
        <div>⚠️ <b>{chofer.nombre}</b> todavía no tiene la app en su celular.</div>
        <button onClick={crear} disabled={ocupado} style={{ ...boton(BLUE), marginTop: 8 }}>{ocupado ? "Creando…" : "Darle acceso con su celular " + (tel || "")}</button>
        {error && <div style={{ color: ROSE, marginTop: 6 }}>{error}</div>}
      </> : <>
        <div>✓ Acceso listo. Mándale este mensaje (se abre tu WhatsApp; tú lo envías):</div>
        <a href={`https://wa.me/52${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" style={{ ...boton(GREEN), display: "inline-block", marginTop: 8, textDecoration: "none" }}>Mandar por WhatsApp</a>
        <div style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>El enlace sirve una sola vez. Trátalo como una llave.</div>
      </>}
    </div>);
}

export default function AsignarRuta({ db, app, usuario, mapboxToken, onVer }){
  const [choferes, setChoferes] = useState([]), [unidades, setUnidades] = useState([]), [cuentas, setCuentas] = useState([]), [lugares, setLugares] = useState([]);
  const [fecha, setFecha] = useState(hoyCDMX()), [hora, setHora] = useState(""), [choferId, setChoferId] = useState(""), [placa, setPlaca] = useState("");
  const [cliente, setCliente] = useState(""), [telCliente, setTelCliente] = useState(""), [indicaciones, setIndicaciones] = useState(""), [paradas, setParadas] = useState([]), [ordenar, setOrdenar] = useState(true);
  const [ocupado, setOcupado] = useState(""), [error, setError] = useState(""), [listo, setListo] = useState(null), [delDia, setDelDia] = useState([]);
  const [diaLista, setDiaLista] = useState(hoyCDMX()), [lista, setLista] = useState([]), [editando, setEditando] = useState(""), [copiada, setCopiada] = useState("");
  const [enlaces, setEnlaces] = useState({});           // enlace de acceso recién creado, por chofer (sobrevive a que llegue su authUid)
  const [pendiente, setPendiente] = useState(null);     // servicio ya creado al que le faltó armar la ruta o asignarse (para reintentar sin duplicar)
  const fns = useMemo(() => getFunctions(app, "us-central1"), [app]);
  const llamar = (n, d) => httpsCallable(fns, n)(d).then(r => r.data);
  const esAdmin = usuario?.rol === "admin";

  useEffect(() => {
    const l = (c, set) => onSnapshot(query(collection(db, c), limit(1000)), s => set(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => set([]));
    const us = [l("choferes", setChoferes), l("unidades", setUnidades), l("cuentas", setCuentas), l("puntos_entrega", setLugares)];
    return () => us.forEach(u => u());
  }, [db]);
  useEffect(() => onSnapshot(query(collection(db, "servicios"), where("fechaServicio", "==", fecha), limit(200)),
    s => setDelDia(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.choferId)), () => setDelDia([])), [db, fecha]);

  useEffect(() => { setDiaLista(fecha); }, [fecha]);
  useEffect(() => onSnapshot(query(collection(db, "servicios"), where("fechaServicio", "==", diaLista), limit(200)),
    s => setLista(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.choferId && !x.eliminado)), () => setLista([])), [db, diaLista]);

  /* ↺ Repetir: copia al formulario una ruta ya hecha (mismas paradas, cliente, chofer y camioneta) para hoy. Nada se manda hasta tocar "Mandar". */
  const repetir = async s => {
    setError(""); setListo(null); setPendiente(null);
    let ps = [];
    try { ps = (await getDocs(query(collection(db, "servicios", s.id, "paradas"), orderBy("orden")))).docs.map(d => d.data()).filter(p => p.estado !== "Quitada"); } catch {}
    if(!ps.length) ps = [...(s.origenes || []).map(p => ({ ...p, tipo: "carga" })), ...(s.destinos || []).map(p => ({ ...p, tipo: "entrega" }))]
      .map(p => { const l = lugares.find(x => x.id === p.puntoId); return l ? { ...p, lat: Number(l.lat), lng: Number(l.lng) } : p; });
    setParadas(ps.map(p => { const l = lugares.find(x => x.id === p.puntoId);
      return { tipo: p.tipo === "carga" ? "carga" : "entrega", nombre: p.nombre || l?.nombre || "", direccion: p.direccion || l?.direccion || "", lat: Number(p.lat), lng: Number(p.lng),
        puntoId: p.puntoId || "", confirmada: !!(l && l.pinConfirmado === true), contacto: p.contacto || "", telefono: p.telefono || "", clave: Date.now() + Math.random() }; }));
    setCliente(s.empresa || ""); setTelCliente(s.solicitanteContacto || ""); setIndicaciones(s.indicaciones || "");
    if(activos.some(c => c.id === s.choferId)) setChoferId(s.choferId);
    if(s.unidadPlaca) setPlaca(String(s.unidadPlaca).toUpperCase());
    setOrdenar(false); setFecha(hoyCDMX()); setCopiada(s.folio || "la ruta");
    window.scrollTo?.({ top: 0, behavior: "smooth" }); document.querySelector("[data-asignar-ruta]")?.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const activos = choferes.filter(c => c.status !== "Inactivo" && c.activo !== false).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  const camionetas = unidades.filter(u => u.status !== "Baja").map(u => String(u.placa || u.placas || u.id).toUpperCase()).sort();
  const nombresClientes = [...new Set(cuentas.map(c => String(c.nombre || "").trim()).filter(Boolean))].sort();
  const chofer = activos.find(c => c.id === choferId);
  const ocupadoHoy = id => delDia.find(s => s.choferId === id && ["Asignada", "En ruta"].includes(s.estado));

  const agregar = p => setParadas(ps => [...ps, { tipo: "entrega", contacto: "", telefono: "", ...p, clave: Date.now() + Math.random() }]);
  const cambiar = (clave, cambio) => setParadas(ps => ps.map(p => p.clave === clave ? { ...p, ...cambio } : p));
  const quitar = clave => setParadas(ps => ps.filter(p => p.clave !== clave));
  const faltan = [!choferId && "chofer", !placa && "camioneta", !cliente.trim() && "cliente", !paradas.some(p => p.tipo === "entrega") && "al menos una entrega",
    paradas.some(p => !p.confirmada) && "confirmar en el mapa cada lugar", paradas.some(p => !String(p.nombre).trim()) && "nombre de cada lugar"].filter(Boolean);

  const mandar = async () => {
    if(pendiente) return reintentar();   // hay un servicio creado a medias: se termina ese, no se crea otro
    if(faltan.length){ setError("Falta: " + faltan.join(", ") + "."); return; }
    if(!chofer?.authUid){ setError(`${chofer?.nombre || "El chofer"} todavía no tiene la app. Dale acceso primero (arriba).`); return; }
    const malos = sinUbicacion(paradas);
    if(malos.length){ setError("Estos lugares no tienen ubicación en el mapa: " + malos.map(p => p.nombre || p.direccion).join(", ") + ". Quítalos y búscalos otra vez."); return; }
    setError(""); setListo(null);
    try {
      setOcupado("Guardando lugares…");
      const conId = await guardarLugares(db, usuario, paradas, lugares);
      setOcupado("Creando el servicio…");
      const datos = datosServicio({ usuario, cliente, fecha, hora, paradas: conId, placa, chofer, indicaciones, contactoCliente: telCliente });
      const { id, folio } = await crearServicioRuta(db, usuario, datos);
      const p = { id, folio, datos, choferId, choferNombre: chofer.nombre, ordenar };
      setPendiente(p); setCopiada("");
      await terminar(p);
    } catch(e){ setError(mensajeError(e)); }
    setOcupado("");
  };
  /* Pasos 3 y 4 por separado: si fallan, "Reintentar" los repite sobre el MISMO servicio (no crea otro folio). */
  const terminar = async p => {
    setOcupado("Mandando la ruta al chofer…");
    await terminarAsignacion(db, usuario, llamar, p);
    setPendiente(null);
    setListo({ folio: p.folio, chofer: p.choferNombre, id: p.id, tel: p.datos?.solicitanteContacto || "" });
    setParadas([]); setIndicaciones(""); setHora("");
  };
  const reintentar = async () => {
    setError("");
    try { await terminar(pendiente); } catch(e){ setError(mensajeError(e)); }
    setOcupado("");
  };

  return (
    <div data-asignar-ruta style={{ flex: 1, overflowY: "auto", padding: "24px 20px", background: "#f1f4fb" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 28, color: TEXT, margin: 0 }}>Asignar ruta</h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "4px 0 16px" }}>Llena los 4 pasos y toca <b>Mandar al chofer</b>. Le aparece solo en su celular.</p>
        {copiada && !listo && <div style={{ background: BLUE + "10", border: "1.5px solid " + BLUE, borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 15 }}>
          ↺ Copié <b style={{ fontFamily: MONO }}>{copiada}</b> para hoy, en el mismo orden. Revisa chofer, camioneta y lugares, y toca <b>Mandar al chofer</b>.
          <button onClick={() => setCopiada("")} style={{ marginLeft: 8, background: "none", border: "none", color: MUTED, cursor: "pointer" }}>✕</button></div>}
        {listo && <div style={{ background: GREEN + "12", border: "1.5px solid " + GREEN, borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 15 }}>
          ✓ Ruta <b style={{ fontFamily: MONO }}>{listo.folio}</b> mandada a <b>{listo.chofer}</b>. Ya la ve en su celular. Síguelo en <button onClick={() => onVer?.("despacho")} style={{ background: "none", border: "none", color: BLUE, fontWeight: 800, cursor: "pointer", fontSize: 15, padding: 0 }}>En vivo</button>.
          <div style={{ marginTop: 10 }}><BotonSeguimiento servicio={{ id: listo.id, folio: listo.folio }} telefono={listo.tel} llamar={llamar}/></div></div>}

        <Paso n={1} titulo="¿Quién maneja y en qué camioneta?">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <label><span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Chofer</span>
              <select style={caja} value={choferId} onChange={e => setChoferId(e.target.value)}>
                <option value="">— Elige al chofer —</option>
                {activos.map(c => <option key={c.id} value={c.id}>{c.nombre}{!c.authUid ? " (sin app)" : ""}{ocupadoHoy(c.id) ? " · ya tiene ruta ese día" : ""}</option>)}
              </select></label>
            <label><span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Camioneta (placas)</span>
              <select style={caja} value={placa} onChange={e => setPlaca(e.target.value)}>
                <option value="">— Elige la camioneta —</option>
                {camionetas.map(p => <option key={p} value={p}>{p}</option>)}
              </select></label>
            <label><span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Día</span><input type="date" style={caja} value={fecha} onChange={e => setFecha(e.target.value)}/></label>
            <label><span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Hora de salida (opcional)</span><input type="time" style={caja} value={hora} onChange={e => setHora(e.target.value)}/></label>
          </div>
          {chofer && (!chofer.authUid || enlaces[chofer.id]) && <AccesoChofer chofer={chofer} llamar={llamar} esAdmin={esAdmin}
            enlace={enlaces[chofer.id] || ""} setEnlace={e => setEnlaces(x => ({ ...x, [chofer.id]: e }))}/>}
          <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>¿No está el chofer o la camioneta? Agrégalos en <button onClick={() => onVer?.("choferes")} style={{ background: "none", border: "none", color: BLUE, cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 700 }}>Choferes y unidades</button>.</div>
        </Paso>

        <Paso n={2} titulo="¿Para qué cliente?">
          <input style={caja} list="ar-clientes" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Escribe o elige el cliente"/>
          <datalist id="ar-clientes">{nombresClientes.map(n => <option key={n} value={n}/>)}</datalist>
          <input style={{ ...caja, marginTop: 8 }} inputMode="tel" value={telCliente} onChange={e => setTelCliente(e.target.value)}
            placeholder="WhatsApp de tu contacto en el cliente (opcional): le mandas su mapa en vivo"/>
        </Paso>

        <Paso n={3} titulo="¿A dónde va?">
          <BuscadorLugar token={mapboxToken} lugares={lugares} onElegir={agregar} llamar={llamar} cerca={paradas[paradas.length - 1]}/>
          <PegarLista token={mapboxToken} lugares={lugares} onAgregar={agregar} llamar={llamar}/>
          <div style={{ fontSize: 12, color: MUTED, margin: "6px 0 10px" }}>Busca cada lugar y confirma en el mapa que la marca cae en la puerta correcta.</div>
          {paradas.map((p, i) => <TarjetaParada key={p.clave} p={p} i={i} token={mapboxToken} cambiar={cambiar} quitar={quitar}/>)}
          {paradas.length > 1 && <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 14 }}>
            <input type="checkbox" checked={ordenar} onChange={e => setOrdenar(e.target.checked)}/> Que el sistema acomode las entregas por cercanía (las recolecciones van primero)</label>}
        </Paso>

        <Paso n={4} titulo="Indicaciones para el chofer">
          <textarea style={{ ...caja, minHeight: 80 }} value={indicaciones} onChange={e => setIndicaciones(e.target.value)} placeholder="Ej. Recoger 20 cajas en bodega, pedir firma y sello, entrar por andén 3…"/>
        </Paso>

        {error && <div style={{ color: ROSE, fontWeight: 700, margin: "0 0 10px" }}>{error}</div>}
        {pendiente && !ocupado && <div style={{ background: AMBER + "12", border: "1.5px solid " + AMBER, borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 14 }}>
          El servicio <b style={{ fontFamily: MONO }}>{pendiente.folio}</b> ya se creó, pero no se pudo mandar al chofer.
          <button onClick={reintentar} style={{ ...boton(A), marginLeft: 10 }}>Reintentar (sin crear otro)</button></div>}
        <button onClick={mandar} disabled={!!ocupado} style={{ ...boton(faltan.length ? MUTED : A), width: "100%", padding: "16px 0", fontSize: 18, opacity: ocupado ? .6 : 1 }}>
          {ocupado || (faltan.length ? "Falta: " + faltan.join(", ") : "Mandar al chofer")}</button>

        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 18, color: TEXT }}>Rutas del día</span>
            <input type="date" style={{ ...caja, width: "auto", padding: "6px 10px" }} value={diaLista} onChange={e => setDiaLista(e.target.value)}/>
            <span style={{ fontSize: 12, color: MUTED }}>Cambia el día para ver rutas pasadas y repetirlas.</span>
          </div>
          {lista.length === 0 ? <div style={{ color: MUTED, fontSize: 14 }}>No hay rutas asignadas ese día.</div>
            : lista.map(s => { const editable = ["Asignada", "En ruta"].includes(s.estado);
              return <div key={s.id} style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ fontFamily: MONO }}>{s.folio}</b><span>{s.choferNombre}</span><span style={{ color: MUTED }}>· {s.unidadPlaca} · {s.empresa}</span>
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {editable && <button onClick={() => setEditando(editando === s.id ? "" : s.id)} style={{ ...boton(A, false), padding: "5px 10px", minHeight: 30, fontSize: 12 }}>✏️ {editando === s.id ? "Cerrar" : "Editar paradas"}</button>}
                    <button onClick={() => repetir(s)} style={{ ...boton(BLUE, false), padding: "5px 10px", minHeight: 30, fontSize: 12 }}>↺ Repetir</button>
                    {editable && <BotonSeguimiento servicio={s} telefono={s.solicitanteContacto} llamar={llamar} compacto/>}
                    <Chip color={s.estado === "En ruta" ? BLUE : ["Entregada", "Completada", "Cerrada"].includes(s.estado) ? GREEN : s.estado === "Cancelada" ? MUTED : A}>{s.estado === "Asignada" ? "Por salir" : s.estado}</Chip></span>
                </div>
                {editando === s.id && editable && <EditarRuta db={db} usuario={usuario} servicio={s} lugares={lugares} token={mapboxToken} llamar={llamar} onListo={() => setEditando("")}/>}
              </div>; })}
        </div>
      </div>
    </div>);
}
