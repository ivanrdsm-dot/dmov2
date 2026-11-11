/* TARIFARIO · la tabla de precios vive aquí, con historial. El Excel deja de ser la fuente.
   Lo consulta toda la oficina; solo un administrador cambia precios. */
import { useEffect, useMemo, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, BD2, DISP, MONO, fechaHora, etiqueta, caja, rejilla, boton, Campo, Chip, Seccion, Dialogo } from "./uiBasico.jsx";
import { UNIDADES_TARIFA, buscarTarifa, precioConGanancia, validarTarifa } from "./tarifario.ts";

const pesos = n => n === null || n === undefined || n === "" ? "—" : "$" + Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 });

function Calculadora({ tarifas }){
  const [tipo, setTipo] = useState("nacional"), [texto, setTexto] = useState(""), [unidad, setUnidad] = useState("eur"), [ganancia, setGanancia] = useState("");
  const nombres = useMemo(() => tarifas.filter(t => t.tipo === tipo && t.activo !== false && !t.valorUnico).map(t => t.nombre).sort((a, b) => a.localeCompare(b, "es")), [tarifas, tipo]);
  const t = buscarTarifa(tarifas, tipo, texto), p = t ? precioConGanancia(t, unidad, ganancia) : null;
  const nombreUnidad = UNIDADES_TARIFA.find(u => u.k === unidad).nombre;
  return (
    <Seccion titulo="Consulta rápida de precio">
      <div style={rejilla}>
        <Campo label="Tipo" opciones={["Nacional", "Local"]} value={tipo === "nacional" ? "Nacional" : "Local"} onChange={e => { setTipo(e.target.value === "Nacional" ? "nacional" : "local"); setTexto(""); }}/>
        <Campo label={tipo === "nacional" ? "Destino" : "Concepto"} lista={nombres} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe o elige"/>
        <Campo label="Unidad" opciones={UNIDADES_TARIFA.map(u => u.nombre)} value={nombreUnidad} onChange={e => setUnidad(UNIDADES_TARIFA.find(u => u.nombre === e.target.value).k)}/>
        <Campo label="Ganancia a agregar (%)" inputMode="decimal" value={ganancia} onChange={e => setGanancia(e.target.value)} placeholder="0 = precio base"/>
      </div>
      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid " + (p ? GREEN + "50" : BD2), background: p ? GREEN + "0d" : "#f8fafc", fontSize: 14 }}>
        {!texto.trim() ? <span style={{ color: MUTED }}>Elige un destino para ver su precio.</span>
          : !t ? <span style={{ color: AMBER, fontWeight: 700 }}>No hay una tarifa con ese nombre. No se estima: hay que capturarla.</span>
          : !p ? <span style={{ color: AMBER, fontWeight: 700 }}>{t.nombre} no tiene precio para {nombreUnidad}.</span>
          : <><b style={{ fontFamily: DISP, fontSize: 22 }}>{pesos(p.redondeado)}</b> <span style={{ color: MUTED }}>+ IVA {pesos(p.iva)} = <b style={{ color: TEXT }}>{pesos(p.total)}</b></span>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{t.nombre}{t.km ? ` · ${t.km} km` : ""} · {nombreUnidad} · base {pesos(p.base)}{p.gananciaPct ? ` + ${p.gananciaPct} % de ganancia = ${pesos(p.tarifa)}` : ""}, redondeado a decenas hacia arriba{p.gananciaPct ? ` · ganancia ${pesos(p.ganancia)}` : ""}</div></>}
      </div>
    </Seccion>);
}

const valorRegla = r => r.valor === null || r.valor === undefined ? "—" : r.unidad === "%" ? `${r.valor} %` : r.unidad === "puntos" ? `${r.valor} puntos` : pesos(r.valor);
function EditarRegla({ inicial, store, onGuardar, onClose, guardando }){
  const [valor, setValor] = useState(inicial.valor ?? ""), [cambios, setCambios] = useState([]), [intento, setIntento] = useState(false);
  useEffect(() => store.suscribirCambios(inicial.id, setCambios), [inicial.id, store]);
  const v = validarTarifa({ ...inicial, valor });
  const fmt = x => x === null || x === undefined ? "—" : valorRegla({ ...inicial, valor: x });
  return (
    <form onSubmit={e => { e.preventDefault(); setIntento(true); if(v.ok) onGuardar({ ...inicial, valor }); }}>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>{inicial.descripcion}</div>
      <div style={{ maxWidth: 260 }}><Campo label={`Valor (${inicial.unidad === "%" ? "porcentaje" : inicial.unidad === "puntos" ? "número de puntos" : "pesos, sin IVA"})`} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}/></div>
      {intento && !v.ok && <div role="alert" style={{ color: ROSE, fontSize: 13, margin: "8px 0" }}><b>Falta:</b> {v.errores.join(" · ")}</div>}
      {v.avisos.map(a => <div key={a} style={{ color: AMBER, fontSize: 13, fontWeight: 700, marginTop: 6 }}>{a}</div>)}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", margin: "12px 0" }}>
        <button type="button" onClick={onClose} style={boton(MUTED, false)}>Cancelar</button>
        <button type="submit" disabled={guardando} style={{ ...boton(A), opacity: guardando ? .6 : 1 }}>{guardando ? "Guardando…" : "Guardar regla"}</button>
      </div>
      <Seccion titulo="Historial de cambios">
        {cambios.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Sin cambios registrados.</div> : cambios.map(c => (
          <div key={c.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid " + BORDER }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{fechaHora(c.ts)}</span> · <b>{c.actorNombre}</b> · {c.tipo === "importado" ? "la pasó del código al tarifario" : "cambió el valor"}
            {(c.cambios || []).map(x => <div key={x.campo} style={{ color: MUTED, marginLeft: 12 }}>{fmt(x.antes)} → {fmt(x.despues)}</div>)}
          </div>))}
      </Seccion>
    </form>);
}

function Editar({ inicial, store, usuario, onGuardar, onClose, guardando }){
  const nuevo = !inicial.id;
  const [f, setF] = useState({ tipo: "nacional", nombre: "", km: "", valorUnico: "", activo: true, ...inicial, base: { ...(inicial.base || {}) }, cliente: { ...(inicial.cliente || {}) } });
  const [cambios, setCambios] = useState([]), [intento, setIntento] = useState(false);
  useEffect(() => inicial.id ? store.suscribirCambios(inicial.id, setCambios) : undefined, [inicial.id, store]);
  const v = validarTarifa({ ...f, km: Number(f.km) });
  const precio = (bloque, k) => e => setF(x => ({ ...x, [bloque]: { ...x[bloque], [k]: e.target.value } }));
  return (
    <form onSubmit={e => { e.preventDefault(); setIntento(true); if(v.ok) onGuardar(f); }}>
      <div style={rejilla}>
        <Campo label="Tipo" opciones={["Nacional", "Local"]} value={f.tipo === "nacional" ? "Nacional" : "Local"} disabled={!nuevo} onChange={e => setF(x => ({ ...x, tipo: e.target.value === "Nacional" ? "nacional" : "local" }))}/>
        <Campo label={f.tipo === "nacional" ? "Destino *" : "Concepto *"} value={f.nombre} disabled={!nuevo} onChange={e => setF(x => ({ ...x, nombre: e.target.value }))}/>
        {f.tipo === "nacional" ? <Campo label="Kilometraje" inputMode="numeric" value={f.km ?? ""} onChange={e => setF(x => ({ ...x, km: e.target.value }))}/>
          : <Campo label="Precio único (si no depende de la unidad)" inputMode="decimal" value={f.valorUnico ?? ""} onChange={e => setF(x => ({ ...x, valorUnico: e.target.value }))}/>}
      </div>
      <Seccion titulo={f.tipo === "nacional" ? "Precio base, sin IVA" : "Precio por unidad, sin IVA"}>
        <div style={rejilla}>{UNIDADES_TARIFA.map(u => <Campo key={u.k} label={u.nombre} inputMode="decimal" value={f.base[u.k] ?? ""} onChange={precio("base", u.k)}/>)}</div>
      </Seccion>
      {f.tipo === "nacional" && <Seccion titulo="Precio con ganancia de referencia, sin IVA (opcional)">
        <div style={rejilla}>{UNIDADES_TARIFA.map(u => <Campo key={u.k} label={u.nombre} inputMode="decimal" value={f.cliente[u.k] ?? ""} onChange={precio("cliente", u.k)}/>)}</div>
      </Seccion>}
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, minHeight: 42 }}><input type="checkbox" checked={f.activo !== false} onChange={e => setF(x => ({ ...x, activo: e.target.checked }))} style={{ width: 20, height: 20 }}/>Tarifa vigente</label>
      {intento && !v.ok && <div role="alert" style={{ color: ROSE, fontSize: 13, margin: "8px 0" }}><b>Falta:</b> {v.errores.join(" · ")}</div>}
      {v.avisos.map(a => <div key={a} style={{ color: AMBER, fontSize: 13, fontWeight: 700 }}>{a}</div>)}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", margin: "10px 0" }}>
        <button type="button" onClick={onClose} style={boton(MUTED, false)}>Cancelar</button>
        <button type="submit" disabled={guardando} style={{ ...boton(A), opacity: guardando ? .6 : 1 }}>{guardando ? "Guardando…" : "Guardar precios"}</button>
      </div>
      {inicial.id && <Seccion titulo="Historial de cambios">
        {cambios.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Sin cambios registrados.</div> : cambios.map(c => (
          <div key={c.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid " + BORDER }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{fechaHora(c.ts)}</span> · <b>{c.actorNombre}</b> · {c.tipo === "importado" ? "importó del Excel" : c.tipo === "alta" ? "dio de alta" : c.tipo === "estado" ? (c.activo ? "reactivó" : "dio de baja") : "cambió precios"}
            {(c.cambios || []).slice(0, 6).map(x => <div key={x.campo} style={{ color: MUTED, marginLeft: 12 }}>{x.campo}: {pesos(x.antes)} → {pesos(x.despues)}</div>)}
          </div>))}
      </Seccion>}
    </form>);
}

export default function Tarifario({ store, usuario }){
  const esAdmin = usuario.rol === "admin";
  const [tarifas, setTarifas] = useState([]), [cargando, setCargando] = useState(true), [error, setError] = useState("");
  const [tab, setTab] = useState("nacional"), [q, setQ] = useState(""), [form, setForm] = useState(null), [guardando, setGuardando] = useState(false), [aviso, setAviso] = useState(null);
  useEffect(() => store.suscribir(x => { setTarifas(x); setCargando(false); setError(""); }, e => { setError(e.message); setCargando(false); }), [store]);
  useEffect(() => { if(!aviso) return; const t = setTimeout(() => setAviso(null), 4000); return () => clearTimeout(t); }, [aviso]);
  const visibles = useMemo(() => { const t = q.trim().toLowerCase(); return tarifas.filter(x => x.tipo === tab && (!t || x.nombre.toLowerCase().includes(t))).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")); }, [tarifas, tab, q]);
  const guardar = async datos => {
    setGuardando(true);
    try { const n = await store.guardar(usuario, form.id ? form : null, datos); setAviso({ msg: n ? "Tarifa guardada" : "Sin cambios" }); setForm(null); }
    catch(e){ setAviso({ msg: "No se pudo guardar: " + e.message, mal: true }); }
    finally { setGuardando(false); }
  };
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}><h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>Tarifario</h1>
          <div style={{ fontSize: 13, color: MUTED }}>La tabla de precios del sistema. Cada cambio queda en el historial. Precios sin IVA.</div></div>
        {esAdmin && tab !== "regla" && <button onClick={() => setForm({ tipo: tab })} style={boton(A)}>+ Agregar tarifa</button>}
      </div>
      <Calculadora tarifas={tarifas}/>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {[["nacional", "Nacional"], ["local", "Local ZMCM"], ["regla", "Reglas del cotizador"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} style={{ border: "1.5px solid " + (tab === k ? A : BD2), background: tab === k ? A + "14" : "#fff", color: tab === k ? A : MUTED, borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l} · {tarifas.filter(t => t.tipo === k).length}</button>)}
        <input value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar tarifa" placeholder="Buscar…" style={{ ...caja, maxWidth: 280, marginLeft: "auto" }}/>
      </div>
      {error && <div role="alert" style={{ color: ROSE, fontSize: 13, marginBottom: 10 }}>No se pudo leer el tarifario: {error}</div>}
      {tab === "regla" ? <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead><tr>{["Regla", "Valor", "Para qué sirve", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "11px 10px", fontSize: 10, color: MUTED, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
          <tbody>
            {visibles.map(t => <tr key={t.id} style={{ borderBottom: "1px solid " + BORDER, verticalAlign: "top" }}>
              <td style={{ padding: "9px 10px" }}><b>{t.nombre}</b></td>
              <td style={{ padding: "9px 10px", fontFamily: MONO, fontWeight: 700, whiteSpace: "nowrap" }}>{valorRegla(t)}</td>
              <td style={{ padding: "9px 10px", color: MUTED }}>{t.descripcion}</td>
              <td style={{ padding: "9px 10px", textAlign: "right" }}><button onClick={() => setForm(t)} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34 }}>{esAdmin ? "Editar" : "Ver"}</button></td></tr>)}
            {!cargando && visibles.length === 0 && <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: MUTED }}>Todavía no hay reglas cargadas.</td></tr>}
            {cargando && <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: MUTED }}>Cargando…</td></tr>}
          </tbody>
        </table>
      </div> : <>
      <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead><tr>{[tab === "nacional" ? "Destino" : "Concepto", ...(tab === "nacional" ? ["Km"] : []), ...UNIDADES_TARIFA.map(u => u.nombre), ""].map(h => <th key={h} style={{ textAlign: "left", padding: "11px 10px", fontSize: 10, color: MUTED, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
          <tbody>
            {visibles.map(t => <tr key={t.id} style={{ borderBottom: "1px solid " + BORDER, opacity: t.activo === false ? .5 : 1 }}>
              <td style={{ padding: "9px 10px" }}><b>{t.nombre}</b>{t.activo === false && <div><Chip color={MUTED}>Baja</Chip></div>}{t.valorUnico ? <div style={{ fontFamily: MONO }}>{pesos(t.valorUnico)}</div> : null}</td>
              {tab === "nacional" && <td style={{ padding: "9px 10px", fontFamily: MONO }}>{t.km || <span style={{ color: AMBER, fontWeight: 700 }}>PENDIENTE</span>}</td>}
              {UNIDADES_TARIFA.map(u => <td key={u.k} style={{ padding: "9px 10px", fontFamily: MONO }}>{pesos(t.base?.[u.k])}{tab === "nacional" && <div style={{ fontSize: 11, color: BLUE }}>{pesos(t.cliente?.[u.k])}</div>}</td>)}
              <td style={{ padding: "9px 10px", textAlign: "right" }}><button onClick={() => setForm(t)} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34 }}>{esAdmin ? "Editar" : "Ver"}</button></td></tr>)}
            {!cargando && visibles.length === 0 && <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: MUTED }}>{tarifas.length === 0 ? "El tarifario está vacío." : "Nada coincide con la búsqueda."}</td></tr>}
            {cargando && <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: MUTED }}>Cargando…</td></tr>}
          </tbody>
        </table>
      </div></>}
      {tab === "regla" && <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Estas reglas las usan el Cotizador Pro y el Planificador de rutas. Al guardar un cambio se aplica de inmediato y queda en el historial.</div>}
      {tab === "nacional" && <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Arriba el precio base, que es el que se cotiza. Abajo en azul, la referencia con ganancia que traía el Excel. La ganancia de cada cotización se decide en la consulta de arriba.</div>}
      {form && <Dialogo titulo={form.id ? form.nombre : "Agregar tarifa"} onClose={() => setForm(null)}>
        {form.tipo === "regla" ? (esAdmin ? <EditarRegla inicial={form} store={store} onGuardar={guardar} onClose={() => setForm(null)} guardando={guardando}/>
            : <fieldset disabled style={{ border: "none", padding: 0, margin: 0 }}><EditarRegla inicial={form} store={store} onGuardar={() => {}} onClose={() => setForm(null)} guardando={false}/></fieldset>)
          : esAdmin ? <Editar inicial={form} store={store} usuario={usuario} onGuardar={guardar} onClose={() => setForm(null)} guardando={guardando}/>
          : <fieldset disabled style={{ border: "none", padding: 0, margin: 0 }}><Editar inicial={form} store={store} usuario={usuario} onGuardar={() => {}} onClose={() => setForm(null)} guardando={false}/></fieldset>}
      </Dialogo>}
      {aviso && <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: aviso.mal ? ROSE : TEXT, color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 600, zIndex: 700, maxWidth: "90vw" }}>{aviso.msg}</div>}
    </div>);
}
