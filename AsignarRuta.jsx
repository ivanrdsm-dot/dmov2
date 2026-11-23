/* ASIGNAR RUTA · una sola hoja para la oficina (Ilse):
   ¿quién maneja? → ¿qué camioneta? → ¿a dónde va? → indicaciones → Mandar al chofer.
   Por dentro hace lo mismo que el camino largo: guarda los lugares (con su punto confirmado
   en el mapa), crea el servicio con folio, arma la ruta en el servidor (oficinaPrepararRuta,
   que ordena por cercanía) y lo pasa a "Asignada" dejando en la bitácora lo que falta
   (cotización, precio): nada se inventa. Al chofer le aparece solo en su celular. */
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, boton, caja, Chip } from "./uiBasico.jsx";
import { coordenadaDeTexto, esEnlaceCortoMaps, buscarEnCatalogo, correoDeChofer, telefono10 } from "./lugares.ts";
import { guardarLugares, datosServicio, crearServicioRuta, terminarAsignacion, sinUbicacion } from "./asignarRutaFlujo.js";

const CDMX = [-99.1332, 19.4326];
/* La dirección del sistema es la misma desde la que se abre (Firebase o Vercel). */
const URL_CHOFER = (typeof window !== "undefined" ? window.location.origin : "https://salesflow-crm-13c4a.web.app") + "/chofer";
const hoyCDMX = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const mensajeError = e => String(e?.message || "No se pudo").replace(/^(functions\/[a-z-]+:?\s*)/i, "");
const mapaFijo = (token, c, ancho = 560, alto = 220) =>
  `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+F27B13(${c.lng},${c.lat})/${c.lng},${c.lat},16,0/${ancho}x${alto}@2x?access_token=${token}`;
const Paso = ({ n, titulo, children }) => (
  <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ width: 28, height: 28, borderRadius: "50%", background: A, color: "#fff", fontWeight: 900, display: "grid", placeItems: "center" }}>{n}</span>
      <span style={{ fontFamily: DISP, fontWeight: 800, fontSize: 18, color: TEXT }}>{titulo}</span>
    </div>
    {children}
  </div>);

/* ── Buscador de lugares: catálogo + Mapbox + coordenada/enlace de Google Maps ── */
function BuscadorLugar({ token, lugares, onElegir }){
  const [q, setQ] = useState(""), [sug, setSug] = useState([]), [cargando, setCargando] = useState(false), [aviso, setAviso] = useState("");
  const sesion = useRef(crypto?.randomUUID?.() || String(Date.now()));
  const coord = coordenadaDeTexto(q), delCatalogo = useMemo(() => coord ? [] : buscarEnCatalogo(lugares, q, 4), [lugares, q, coord]);
  useEffect(() => {
    setAviso(esEnlaceCortoMaps(q) ? "Ese enlace corto no trae la ubicación. En Google Maps deja el dedo sobre el lugar y copia los números que aparecen (ej. 19.43, -99.13)." : "");
    if(coord || q.trim().length < 3 || !token || esEnlaceCortoMaps(q)){ setSug([]); return; }
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const r = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${token}&session_token=${sesion.current}&country=MX&language=es&limit=6&proximity=${CDMX[0]},${CDMX[1]}`);
        const d = await r.json(); setSug(d.suggestions || []);
      } catch { setSug([]); }
      setCargando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, token]);   // eslint-disable-line react-hooks/exhaustive-deps
  const limpiar = () => { setQ(""); setSug([]); sesion.current = crypto?.randomUUID?.() || String(Date.now()); };
  const elegirMapbox = async s => {
    setCargando(true);
    try {
      const r = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(s.mapbox_id)}?access_token=${token}&session_token=${sesion.current}&language=es`);
      const f = (await r.json()).features?.[0];
      const [lng, lat] = f?.geometry?.coordinates || [];
      if(!Number.isFinite(lat)) throw new Error();
      onElegir({ nombre: s.name || f.properties?.name || "", direccion: f.properties?.full_address || s.full_address || s.place_formatted || "", lat, lng, puntoId: "", confirmada: false });
      limpiar();
    } catch { setAviso("No se pudo leer ese lugar. Prueba con otro resultado o pega la coordenada."); }
    setCargando(false);
  };
  const elegirCoordenada = async () => {
    let direccion = "";
    try {
      const r = await fetch(`https://api.mapbox.com/search/searchbox/v1/reverse?longitude=${coord.lng}&latitude=${coord.lat}&access_token=${token}&language=es&limit=1`);
      direccion = (await r.json()).features?.[0]?.properties?.full_address || "";
    } catch {}
    onElegir({ nombre: "", direccion: direccion || `${coord.lat}, ${coord.lng}`, lat: coord.lat, lng: coord.lng, puntoId: "", confirmada: false });
    limpiar();
  };
  const opcion = { display: "block", width: "100%", textAlign: "left", background: "#fff", border: "none", borderBottom: "1px solid " + BORDER, padding: "11px 12px", cursor: "pointer", fontSize: 14, fontFamily: "inherit" };
  const hay = coord || delCatalogo.length > 0 || sug.length > 0;
  return (
    <div style={{ position: "relative" }}>
      <input style={{ ...caja, fontSize: 16 }} value={q} onChange={e => setQ(e.target.value)}
        placeholder="Busca: Walmart Coyoacán, una calle y número, o pega la ubicación de Google Maps"/>
      {cargando && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Buscando…</div>}
      {aviso && <div style={{ fontSize: 13, color: AMBER, marginTop: 6 }}>{aviso}</div>}
      {hay && <div style={{ border: "1px solid " + BORDER, borderRadius: 12, marginTop: 6, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,.08)" }}>
        {coord && <button onClick={elegirCoordenada} style={opcion}>📍 <b>Usar esta ubicación</b> <span style={{ color: MUTED, fontFamily: MONO }}>{coord.lat}, {coord.lng}</span></button>}
        {delCatalogo.map(l => <button key={l.id} onClick={() => { if(!Number.isFinite(Number(l.lat)) || !Number.isFinite(Number(l.lng)) || (Number(l.lat) === 0 && Number(l.lng) === 0)){ setAviso(`"${l.nombre}" está guardado sin ubicación. Búscalo por su dirección o pega la ubicación de Google Maps.`); return; } onElegir({ nombre: l.nombre || "", direccion: l.direccion || "", lat: Number(l.lat), lng: Number(l.lng), puntoId: l.id,
            confirmada: l.pinConfirmado === true, contacto: l.contacto || "", telefono: l.telefono || "" }); limpiar(); }} style={opcion}>
          ⭐ <b>{l.nombre}</b> <span style={{ color: MUTED }}>· {l.direccion}</span> <span style={{ color: GREEN, fontSize: 12 }}>· ya guardado</span></button>)}
        {sug.map(s => <button key={s.mapbox_id} onClick={() => elegirMapbox(s)} style={opcion}><b>{s.name}</b> <span style={{ color: MUTED }}>· {s.full_address || s.place_formatted}</span></button>)}
      </div>}
    </div>);
}

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
  const [cliente, setCliente] = useState(""), [indicaciones, setIndicaciones] = useState(""), [paradas, setParadas] = useState([]), [ordenar, setOrdenar] = useState(true);
  const [ocupado, setOcupado] = useState(""), [error, setError] = useState(""), [listo, setListo] = useState(null), [delDia, setDelDia] = useState([]);
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
      const datos = datosServicio({ usuario, cliente, fecha, hora, paradas: conId, placa, chofer, indicaciones });
      const { id, folio } = await crearServicioRuta(db, usuario, datos);
      const p = { id, folio, datos, choferId, choferNombre: chofer.nombre, ordenar };
      setPendiente(p);
      await terminar(p);
    } catch(e){ setError(mensajeError(e)); }
    setOcupado("");
  };
  /* Pasos 3 y 4 por separado: si fallan, "Reintentar" los repite sobre el MISMO servicio (no crea otro folio). */
  const terminar = async p => {
    setOcupado("Mandando la ruta al chofer…");
    await terminarAsignacion(db, usuario, llamar, p);
    setPendiente(null);
    setListo({ folio: p.folio, chofer: p.choferNombre });
    setParadas([]); setIndicaciones(""); setHora("");
  };
  const reintentar = async () => {
    setError("");
    try { await terminar(pendiente); } catch(e){ setError(mensajeError(e)); }
    setOcupado("");
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", background: "#f1f4fb" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 28, color: TEXT, margin: 0 }}>Asignar ruta</h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "4px 0 16px" }}>Llena los 4 pasos y toca <b>Mandar al chofer</b>. Le aparece solo en su celular.</p>
        {listo && <div style={{ background: GREEN + "12", border: "1.5px solid " + GREEN, borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 15 }}>
          ✓ Ruta <b style={{ fontFamily: MONO }}>{listo.folio}</b> mandada a <b>{listo.chofer}</b>. Ya la ve en su celular. Síguelo en <button onClick={() => onVer?.("despacho")} style={{ background: "none", border: "none", color: BLUE, fontWeight: 800, cursor: "pointer", fontSize: 15, padding: 0 }}>En vivo</button>.</div>}

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
        </Paso>

        <Paso n={3} titulo="¿A dónde va?">
          <BuscadorLugar token={mapboxToken} lugares={lugares} onElegir={agregar}/>
          <div style={{ fontSize: 12, color: MUTED, margin: "6px 0 10px" }}>Busca cada lugar y confirma en el mapa que la marca cae en la puerta correcta.</div>
          {paradas.map((p, i) => (
            <div key={p.clave} style={{ border: "1.5px solid " + (p.confirmada ? BORDER : A), borderRadius: 14, padding: 12, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontFamily: MONO }}>{i + 1}.</b>
                {[["carga", "Recoger"], ["entrega", "Entregar"]].map(([k, l]) => <button key={k} onClick={() => cambiar(p.clave, { tipo: k })}
                  style={{ ...boton(k === "carga" ? BLUE : GREEN, p.tipo === k), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>{l}</button>)}
                <button onClick={() => quitar(p.clave)} style={{ marginLeft: "auto", background: "none", border: "none", color: ROSE, cursor: "pointer", fontWeight: 700 }}>Quitar</button>
              </div>
              <input style={{ ...caja, marginTop: 8 }} value={p.nombre} onChange={e => cambiar(p.clave, { nombre: e.target.value })} placeholder="Nombre del lugar (ej. Walmart Coyoacán)"/>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{p.direccion}</div>
              {!p.confirmada && mapboxToken && <div style={{ marginTop: 8 }}>
                <img src={mapaFijo(mapboxToken, p)} alt="Mapa del lugar" style={{ width: "100%", borderRadius: 12, border: "1px solid " + BORDER }}/>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button onClick={() => cambiar(p.clave, { confirmada: true })} style={{ ...boton(GREEN), flex: 1 }}>✓ Sí, es aquí</button>
                  <button onClick={() => quitar(p.clave)} style={{ ...boton(MUTED, false), flex: 1 }}>No, buscar otro</button>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Si la marca no cae justo, quítalo y pega la ubicación exacta de Google Maps (deja el dedo sobre la puerta y copia los números).</div>
              </div>}
              {p.confirmada && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <input style={caja} value={p.contacto} onChange={e => cambiar(p.clave, { contacto: e.target.value })} placeholder="Quién recibe (opcional)"/>
                <input style={caja} inputMode="tel" value={p.telefono} onChange={e => cambiar(p.clave, { telefono: e.target.value })} placeholder="Teléfono (opcional)"/>
              </div>}
            </div>))}
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
          <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 18, color: TEXT, marginBottom: 8 }}>Rutas asignadas para ese día</div>
          {delDia.length === 0 ? <div style={{ color: MUTED, fontSize: 14 }}>Todavía no hay rutas asignadas ese día.</div>
            : delDia.map(s => <div key={s.id} style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontFamily: MONO }}>{s.folio}</b><span>{s.choferNombre}</span><span style={{ color: MUTED }}>· {s.unidadPlaca} · {s.empresa}</span>
                <span style={{ marginLeft: "auto" }}><Chip color={s.estado === "En ruta" ? BLUE : s.estado === "Entregada" ? GREEN : A}>{s.estado === "Asignada" ? "Por salir" : s.estado}</Chip></span></div>)}
        </div>
      </div>
    </div>);
}
