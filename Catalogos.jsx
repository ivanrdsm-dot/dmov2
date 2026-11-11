/* CATÁLOGOS OPERATIVOS · Puntos de entrega y Proveedores (una pantalla, dos configuraciones).
   Un punto no se usa en ruta sin pin confirmado; un proveedor no queda habilitado sin documentos vigentes. */
import { useEffect, useMemo, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, ahoraLocal, etiqueta, caja, rejilla, boton, Campo, Chip, Seccion, Dialogo } from "./uiBasico.jsx";
import { parsearCoordenadas, coordenadaDe, validarPunto, puntoListoParaRuta, radioDe, RADIO_GEOCERCA_DEFAULT_M,
  DOCUMENTOS_PROVEEDOR, estadoDocumento, validarProveedor, proveedorHabilitado } from "./catalogos.ts";

const COLOR_DOC = { vigente: GREEN, "por vencer": AMBER, vencido: ROSE, "sin registrar": MUTED };
const Marca = ({ checked, onChange, children }) => <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer", minHeight: 42 }}>
  <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ width: 20, height: 20 }}/>{children}</label>;

function FormPunto({ inicial, onGuardar, onClose, guardando, SelectorMapa = null }){
  const [mapa, setMapa] = useState(false);
  const c0 = coordenadaDe(inicial || {});
  const [f, setF] = useState({ nombre: "", direccion: "", radioM: "", horario: "", contacto: "", telefono: "", notasAcceso: "", pinConfirmado: false, activo: true, ...inicial, coordenada: c0 ? `${c0.lat}, ${c0.lng}` : "" });
  const [intento, setIntento] = useState(false);
  const s = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const c = parsearCoordenadas(f.coordenada);
  const datos = { ...f, lat: c ? c.lat : (f.coordenada.trim() ? f.coordenada : ""), lng: c ? c.lng : (f.coordenada.trim() ? "x" : ""), radioM: f.radioM === "" ? "" : Number(f.radioM), pinConfirmado: !!c && f.pinConfirmado };
  const v = validarPunto(datos);
  const guardar = () => { setIntento(true); if(!v.ok) return; const { coordenada, ...resto } = datos; onGuardar({ ...resto, lat: c ? c.lat : "", lng: c ? c.lng : "" }); };
  return (
    <form onSubmit={e => { e.preventDefault(); guardar(); }}>
      <div style={rejilla}>
        <Campo label="Nombre del punto *" value={f.nombre} onChange={s("nombre")} placeholder="CEDIS, tienda, bodega"/>
        <Campo label="Dirección *" value={f.direccion} onChange={s("direccion")}/>
        <Campo label="Horario de recepción" value={f.horario} onChange={s("horario")} placeholder="L a V de 8:00 a 14:00"/>
        <Campo label="Contacto que recibe" value={f.contacto} onChange={s("contacto")}/>
        <Campo label="Teléfono" inputMode="tel" value={f.telefono} onChange={s("telefono")}/>
      </div>
      <Seccion titulo="Ubicación exacta">
        <div style={rejilla}>
          <Campo label="Coordenada (latitud, longitud)" value={f.coordenada} onChange={e => setF(x => ({ ...x, coordenada: e.target.value, pinConfirmado: false }))} placeholder="19.432608, -99.133209"/>
          <Campo label={`¿A cuántos metros puede cerrar la entrega el chofer? (normal ${RADIO_GEOCERCA_DEFAULT_M})`} inputMode="numeric" value={f.radioM} onChange={s("radioM")} placeholder={String(RADIO_GEOCERCA_DEFAULT_M)}/>
        </div>
        {SelectorMapa && <button type="button" onClick={() => setMapa(true)} style={{ ...boton(A), marginTop: 10 }}>📍 Buscar el lugar en el mapa</button>}
        <p style={{ fontSize: 12, color: MUTED, margin: "8px 0" }}>{SelectorMapa ? "Busca la dirección y toca el lugar exacto de la recepción. También puedes pegar la coordenada de Google Maps." : "En Google Maps, deja presionado sobre la puerta de recepción y copia los dos números que aparecen."}</p>
        {mapa && SelectorMapa && <SelectorMapa title="Ubica el lugar" initialQuery={[f.nombre, f.direccion].filter(Boolean).join(", ")} onClose={() => setMapa(false)}
          onSelect={p => { setF(x => ({ ...x, coordenada: `${Number(p.lat).toFixed(6)}, ${Number(p.lng).toFixed(6)}`, direccion: x.direccion || p.address || "", nombre: x.nombre || p.name || "", pinConfirmado: false })); setMapa(false); }}/>}
        {c && <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer" style={{ ...boton(BLUE, false), display: "inline-block", textDecoration: "none", lineHeight: "20px" }}>Ver el pin en el mapa</a>}
        {c && <Marca checked={f.pinConfirmado} onChange={x => setF(y => ({ ...y, pinConfirmado: x }))}>Abrí el mapa y el pin cae en el lugar correcto</Marca>}
        {v.avisos.map(a => <div key={a} style={{ color: AMBER, fontSize: 13, fontWeight: 700 }}>{a}</div>)}
      </Seccion>
      <Campo label="Notas de acceso" area value={f.notasAcceso} onChange={s("notasAcceso")} placeholder="Entrada por andén 3, pedir cita, EPP obligatorio"/>
      <Marca checked={f.activo !== false} onChange={x => setF(y => ({ ...y, activo: x }))}>Punto activo</Marca>
      <Avisos intento={intento} v={v}/>
      <Botones onClose={onClose} guardando={guardando}/>
    </form>
  );
}

function FormProveedor({ inicial, onGuardar, onClose, guardando }){
  const [f, setF] = useState({ nombre: "", contacto: "", telefono: "", correo: "", comisionPct: "", unidades: "", emiteCartaPorte: false, notas: "", activo: true, ...inicial, documentos: { ...(inicial?.documentos || {}) } });
  const [intento, setIntento] = useState(false);
  const s = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const hoy = ahoraLocal().slice(0, 10);
  const v = validarProveedor(f), h = proveedorHabilitado(f, hoy);
  return (
    <form onSubmit={e => { e.preventDefault(); setIntento(true); if(v.ok) onGuardar({ ...f, comisionPct: f.comisionPct === "" ? "" : Number(f.comisionPct) }); }}>
      <div style={rejilla}>
        <Campo label="Nombre del proveedor *" value={f.nombre} onChange={s("nombre")}/>
        <Campo label="Persona de contacto" value={f.contacto} onChange={s("contacto")}/>
        <Campo label="Teléfono" inputMode="tel" value={f.telefono} onChange={s("telefono")}/>
        <Campo label="Correo" type="email" value={f.correo} onChange={s("correo")}/>
        <Campo label="Comisión acordada (%)" inputMode="decimal" value={f.comisionPct} onChange={s("comisionPct")}/>
        <Campo label="Unidades que ofrece" value={f.unidades} onChange={s("unidades")} placeholder="2 camionetas 3.5, 1 rabón"/>
      </div>
      <Seccion titulo="Documentos y vigencias">
        <div style={rejilla}>
          {DOCUMENTOS_PROVEEDOR.map(d => { const e = estadoDocumento(f.documentos[d.id], hoy); return (
            <div key={d.id}><Campo label={d.nombre + (d.obligatorio ? " *" : "") + " · vence"} type="date" value={f.documentos[d.id] || ""} onChange={ev => setF(x => ({ ...x, documentos: { ...x.documentos, [d.id]: ev.target.value } }))}/>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLOR_DOC[e], marginTop: 3 }}>{e}</div></div>); })}
        </div>
        <Marca checked={f.emiteCartaPorte} onChange={x => setF(y => ({ ...y, emiteCartaPorte: x }))}>Puede emitir Carta Porte</Marca>
      </Seccion>
      <Campo label="Notas" area value={f.notas} onChange={s("notas")}/>
      <Marca checked={f.activo !== false} onChange={x => setF(y => ({ ...y, activo: x }))}>Proveedor activo</Marca>
      {!h.habilitado && <div style={{ background: ROSE + "10", border: "1px solid " + ROSE + "50", color: ROSE, borderRadius: 12, padding: "10px 14px", fontSize: 13, margin: "10px 0" }}><b>No queda habilitado para recibir servicios:</b> {h.motivos.join(" · ")}</div>}
      <Avisos intento={intento} v={v}/>
      <Botones onClose={onClose} guardando={guardando}/>
    </form>
  );
}
const Avisos = ({ intento, v }) => <>
  {intento && !v.ok && <div role="alert" style={{ background: ROSE + "10", border: "1px solid " + ROSE + "50", color: ROSE, borderRadius: 12, padding: "10px 14px", fontSize: 13, margin: "10px 0" }}><b>Falta para poder guardar:</b> {v.errores.join(" · ")}</div>}
  {v.pendientes.length > 0 && <div style={{ background: AMBER + "10", border: "1px solid " + AMBER + "50", color: "#92400e", borderRadius: 12, padding: "10px 14px", fontSize: 13, margin: "10px 0" }}><b>Se guardará como PENDIENTE:</b> {v.pendientes.join(" · ")}</div>}</>;
const Botones = ({ onClose, guardando }) => <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
  <button type="button" onClick={onClose} style={boton(MUTED, false)}>Cancelar</button>
  <button type="submit" disabled={guardando} style={{ ...boton(A), opacity: guardando ? .6 : 1 }}>{guardando ? "Guardando…" : "Guardar"}</button></div>;

const CONFIG = {
  puntos: { titulo: "Lugares de carga y entrega", sub: "Tiendas, CEDIS y bodegas con su ubicación exacta. Un lugar se usa en una ruta cuando confirmas su pin.", nuevo: "+ Agregar lugar", Form: FormPunto,
    columnas: ["Punto", "Dirección", "Coordenada", "Recepción", "Estado"],
    fila: p => { const c = coordenadaDe(p), v = validarPunto(p); return [
      <b>{p.nombre}</b>, p.direccion, c ? <span style={{ fontFamily: MONO, fontSize: 12 }}>{c.lat.toFixed(5)}, {c.lng.toFixed(5)}<div style={{ color: MUTED }}>radio {radioDe(p)} m</div></span> : <span style={{ color: AMBER, fontWeight: 700 }}>PENDIENTE</span>,
      <span>{p.horario || "—"}<div style={{ fontSize: 11, color: MUTED }}>{p.contacto}</div></span>,
      p.activo === false ? <Chip color={MUTED}>Baja</Chip> : puntoListoParaRuta(p) ? <Chip color={GREEN}>Listo para ruta</Chip> : <span><Chip color={AMBER}>No listo</Chip><div style={{ fontSize: 11, color: AMBER, marginTop: 3 }}>{v.pendientes.slice(0, 2).join(" · ")}</div></span>]; },
    resumen: lista => { const act = lista.filter(p => p.activo !== false); return [["Puntos activos", act.length, TEXT], ["Listos para ruta", act.filter(puntoListoParaRuta).length, GREEN], ["Sin pin confirmado", act.filter(p => !puntoListoParaRuta(p)).length, AMBER]]; },
    texto: p => [p.nombre, p.direccion, p.contacto].join(" ") },
  proveedores: { titulo: "Proveedores", sub: "Quién puede ejecutar un servicio por nosotros. Sin seguro y tarjeta de circulación vigentes no quedan habilitados.", nuevo: "+ Agregar proveedor", Form: FormProveedor,
    columnas: ["Proveedor", "Contacto", "Unidades", "Comisión", "Estado"],
    fila: (p, hoy) => { const h = proveedorHabilitado(p, hoy); return [
      <b>{p.nombre}</b>, <span>{p.contacto || "—"}<div style={{ fontSize: 11, color: MUTED }}>{p.telefono}</div></span>, p.unidades || <span style={{ color: AMBER, fontWeight: 700 }}>PENDIENTE</span>,
      p.comisionPct === "" || p.comisionPct === undefined ? <span style={{ color: AMBER, fontWeight: 700 }}>PENDIENTE</span> : <span style={{ fontFamily: MONO }}>{p.comisionPct} %</span>,
      h.habilitado ? <Chip color={GREEN}>Habilitado</Chip> : <span><Chip color={ROSE}>No habilitado</Chip><div style={{ fontSize: 11, color: ROSE, marginTop: 3 }}>{h.motivos[0]}</div></span>]; },
    resumen: (lista, hoy) => [["Proveedores", lista.length, TEXT], ["Habilitados", lista.filter(p => proveedorHabilitado(p, hoy).habilitado).length, GREEN],
      ["Con documento por vencer", lista.filter(p => DOCUMENTOS_PROVEEDOR.some(d => estadoDocumento(p.documentos?.[d.id], hoy) === "por vencer")).length, AMBER]],
    texto: p => [p.nombre, p.contacto, p.unidades].join(" ") },
};

export default function Catalogos({ tipo, store, usuario, SelectorMapa = null }){
  const cfg = CONFIG[tipo];
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  useEffect(() => store.suscribir(x => { setLista(x); setCargando(false); setError(""); }, e => { setError(e.message); setCargando(false); }), [store]);
  useEffect(() => { if(!aviso) return; const t = setTimeout(() => setAviso(null), 4000); return () => clearTimeout(t); }, [aviso]);
  const hoy = ahoraLocal().slice(0, 10);
  const visibles = useMemo(() => { const t = q.trim().toLowerCase(); return lista.filter(p => !t || cfg.texto(p).toLowerCase().includes(t)).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")); }, [lista, q, cfg]);
  const guardar = async datos => {
    setGuardando(true);
    try { await store.guardar(usuario, form.id ? form : null, datos); setAviso({ msg: "Guardado" }); setForm(null); }
    catch(e){ setAviso({ msg: "No se pudo guardar: " + e.message, mal: true }); }
    finally { setGuardando(false); }
  };
  const Form = cfg.Form;
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}><h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>{cfg.titulo}</h1><div style={{ fontSize: 13, color: MUTED }}>{cfg.sub}</div></div>
        <button onClick={() => setForm({})} style={boton(A)}>{cfg.nuevo}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        {cfg.resumen(lista, hoy).map(([l, val, color]) => <div key={l} style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" }}><div style={{ ...etiqueta, marginBottom: 6 }}>{l}</div><div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 26, color }}>{val}</div></div>)}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar" placeholder="Buscar…" style={{ ...caja, maxWidth: 320, marginBottom: 12 }}/>
      {error && <div role="alert" style={{ color: ROSE, fontSize: 13, marginBottom: 10 }}>No se pudo leer el catálogo: {error}</div>}
      <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
          <thead><tr>{[...cfg.columnas, ""].map(h => <th key={h} style={{ textAlign: "left", padding: "11px 12px", fontSize: 10, color: MUTED, letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
          <tbody>
            {visibles.map(p => <tr key={p.id} style={{ borderBottom: "1px solid " + BORDER }}>
              {cfg.fila(p, hoy).map((celda, i) => <td key={i} style={{ padding: "10px 12px", verticalAlign: "top" }}>{celda}</td>)}
              <td style={{ padding: "10px 12px", textAlign: "right" }}><button onClick={() => setForm(p)} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34 }}>Editar</button></td></tr>)}
            {!cargando && visibles.length === 0 && <tr><td colSpan={cfg.columnas.length + 1} style={{ padding: 28, textAlign: "center", color: MUTED }}>{lista.length === 0 ? "Aún no hay registros. Agrega el primero." : "Nada coincide con la búsqueda."}</td></tr>}
            {cargando && <tr><td colSpan={cfg.columnas.length + 1} style={{ padding: 28, textAlign: "center", color: MUTED }}>Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
      {form && <Dialogo titulo={form.id ? "Editar " + (form.nombre || "") : cfg.nuevo.replace("+ ", "")} onClose={() => setForm(null)}><Form inicial={form} onGuardar={guardar} onClose={() => setForm(null)} guardando={guardando} SelectorMapa={SelectorMapa}/></Dialogo>}
      {aviso && <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: aviso.mal ? ROSE : TEXT, color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 600, zIndex: 700, maxWidth: "90vw" }}>{aviso.msg}</div>}
    </div>
  );
}
