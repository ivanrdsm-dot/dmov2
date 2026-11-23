/* Buscar lugares para una ruta (lo usan Asignar ruta y Editar ruta):
   catálogo + Mapbox + coordenada/enlace de Google Maps, "Pegar lista" y la tarjeta de cada parada
   con su confirmación en el mapa (nada se manda sin que alguien vea la marca en la puerta). */
import { useEffect, useMemo, useRef, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, BORDER, MONO, boton, caja } from "./uiBasico.jsx";
import { coordenadaDeTexto, esEnlaceCortoMaps, buscarEnCatalogo, lineasDeLista, lugarExacto } from "./lugares.ts";

export const CDMX = [-99.1332, 19.4326];
export const mapaFijo = (token, c, ancho = 560, alto = 220) =>
  `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+F27B13(${c.lng},${c.lat})/${c.lng},${c.lat},16,0/${ancho}x${alto}@2x?access_token=${token}`;

/* ── Buscador de lugares: catálogo + Mapbox + coordenada/enlace de Google Maps ── */
export function BuscadorLugar({ token, lugares, onElegir }){
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

/* ── Pegar lista: un lugar por renglón. Cada uno queda por confirmar en su mapa. ── */
async function buscarRenglon(token, lugares, linea){
  const guardado = lugarExacto(lugares, linea);
  if(guardado && Number.isFinite(Number(guardado.lat)) && Number.isFinite(Number(guardado.lng)))
    return { nombre: guardado.nombre || "", direccion: guardado.direccion || "", lat: Number(guardado.lat), lng: Number(guardado.lng), puntoId: guardado.id, confirmada: true, contacto: guardado.contacto || "", telefono: guardado.telefono || "" };
  const c = coordenadaDeTexto(linea);
  if(c) return { nombre: "", direccion: `${c.lat}, ${c.lng}`, lat: c.lat, lng: c.lng, puntoId: "", confirmada: false };
  if(!token) return null;
  /* Igual que el buscador de arriba (sugerencia + detalle, cerca de CDMX): da mejores resultados que la búsqueda directa. */
  const sesion = crypto?.randomUUID?.() || String(Date.now() + Math.random());
  const s = (await (await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(linea)}&access_token=${token}&session_token=${sesion}&country=MX&language=es&limit=1&proximity=${CDMX[0]},${CDMX[1]}`)).json()).suggestions?.[0];
  if(!s?.mapbox_id) return null;
  const f = (await (await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(s.mapbox_id)}?access_token=${token}&session_token=${sesion}&language=es`)).json()).features?.[0];
  const [lng, lat] = f?.geometry?.coordinates || [];
  if(!Number.isFinite(lat)) return null;
  return { nombre: s.name || f.properties?.name || linea, direccion: f.properties?.full_address || s.full_address || s.place_formatted || linea, lat, lng, puntoId: "", confirmada: false };
}

export function PegarLista({ token, lugares, onAgregar }){
  const [abierto, setAbierto] = useState(false), [texto, setTexto] = useState(""), [estado, setEstado] = useState("");
  const lineas = lineasDeLista(texto);
  const buscar = async () => {
    const noHallados = [];
    for(const [i, l] of lineas.entries()){
      setEstado(`Buscando ${i + 1} de ${lineas.length}…`);
      try { const p = await buscarRenglon(token, lugares, l); if(p) onAgregar(p); else noHallados.push(l); }
      catch { noHallados.push(l); }
    }
    setTexto(noHallados.join("\n"));
    setEstado(noHallados.length ? `No encontré ${noHallados.length}: se quedaron en el cuadro. Búscalos uno por uno arriba.` : "✓ Listo. Revisa cada mapa abajo y confirma.");
  };
  if(!abierto) return <button onClick={() => setAbierto(true)} style={{ ...boton(BLUE, false), marginTop: 8 }}>📋 Pegar lista de direcciones</button>;
  return (
    <div style={{ border: "1px dashed " + BLUE, borderRadius: 12, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>Pega un lugar por renglón (nombre de tienda guardada, dirección o ubicación de Google Maps).</div>
      <textarea style={{ ...caja, minHeight: 110 }} value={texto} onChange={e => setTexto(e.target.value)} placeholder={"Walmart Coyoacán\nAv. Insurgentes Sur 1234, Benito Juárez\n19.4326, -99.1332"}/>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button disabled={!lineas.length || estado.startsWith("Buscando")} onClick={buscar} style={boton(A)}>Buscar {lineas.length || ""} {lineas.length === 1 ? "lugar" : "lugares"}</button>
        <button onClick={() => { setAbierto(false); setTexto(""); setEstado(""); }} style={boton(MUTED, false)}>Cerrar</button>
        {estado && <span style={{ fontSize: 13, color: estado.startsWith("No") ? AMBER : MUTED }}>{estado}</span>}
      </div>
    </div>);
}

/* ── Tarjeta de una parada nueva: recoger/entregar, nombre, confirmación en el mapa y quién recibe ── */
export function TarjetaParada({ p, i, token, cambiar, quitar }){
  return (
            <div style={{ border: "1.5px solid " + (p.confirmada ? BORDER : A), borderRadius: 14, padding: 12, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontFamily: MONO }}>{i + 1}.</b>
                {[["carga", "Recoger"], ["entrega", "Entregar"]].map(([k, l]) => <button key={k} onClick={() => cambiar(p.clave, { tipo: k })}
                  style={{ ...boton(k === "carga" ? BLUE : GREEN, p.tipo === k), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>{l}</button>)}
                <button onClick={() => quitar(p.clave)} style={{ marginLeft: "auto", background: "none", border: "none", color: ROSE, cursor: "pointer", fontWeight: 700 }}>Quitar</button>
              </div>
              <input style={{ ...caja, marginTop: 8 }} value={p.nombre} onChange={e => cambiar(p.clave, { nombre: e.target.value })} placeholder="Nombre del lugar (ej. Walmart Coyoacán)"/>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{p.direccion}</div>
              {!p.confirmada && token && <div style={{ marginTop: 8 }}>
                <img src={mapaFijo(token, p)} alt="Mapa del lugar" style={{ width: "100%", borderRadius: 12, border: "1px solid " + BORDER }}/>
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
            </div>
  );
}
