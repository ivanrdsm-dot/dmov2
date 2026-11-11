/* COTIZACIONES DE LOGÍSTICA · bandeja y detalle.
   Aquí vive lo que guardó el cotizador automático: el dueño aprueba el precio,
   operaciones la envía, registra la respuesta del cliente y la convierte en servicio. */
import { useEffect, useMemo, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, VIOLET, MUTED, TEXT, BORDER, DISP, MONO, etiqueta, rejilla, boton, dinero, fechaHora, Campo, Chip, Seccion, Dialogo } from "./uiBasico.jsx";
import { ESTADOS_COTIZACION, evaluarTransicion, kpisCotizaciones, precioCliente } from "./cotizaciones.ts";

const COLOR = { Propuesta: AMBER, Aprobada: BLUE, Enviada: VIOLET, Aceptada: GREEN, Rechazada: ROSE, Cancelada: MUTED };
const dato = (k, v) => <div key={k}><span style={etiqueta}>{k}</span><div style={{ fontSize: 14 }}>{v || <span style={{ color: MUTED }}>—</span>}</div></div>;
const TEXTO_EVENTO = e => e.tipo === "creada" ? "guardó la propuesta" : e.tipo === "precio_aprobado" ? `aprobó el precio ${dinero(e.cambios?.[0]?.despues)}`
  : e.tipo === "servicio_creado" ? `creó el servicio ${e.servicioFolio}` : `cambió de ${e.de} a ${e.a}`;

function Detalle({ c, store, usuario, onClose, onCrearServicio, avisar }){
  const [eventos, setEventos] = useState([]);
  const [precio, setPrecio] = useState(c.precioPropuesto ?? "");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => store.suscribirEventos(c.id, setEventos, () => setEventos([])), [store, c.id]);
  const admin = usuario.rol === "admin", r = c.resultado || {};
  const correr = async (fn, ok) => { setOcupado(true); try { await fn(); avisar(ok); setNota(""); } catch(e){ avisar(e.message, true); } finally { setOcupado(false); } };
  const pasar = (a, ok) => {
    const v = evaluarTransicion(c, a, { esAdmin: admin });
    if(!v.permitido){ avisar(v.razon, true); return; }
    if(v.requiereMotivo && !nota.trim()){ avisar("Escribe el motivo en la nota", true); return; }
    correr(() => store.cambiarEstado(usuario, c, a, nota), ok);
  };
  const final = precioCliente(c);
  return (
    <Dialogo titulo={`${c.folio} · ${c.empresa || "Sin cliente"}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <Chip color={COLOR[c.estado] || MUTED}>{c.estado}</Chip>
        {c.solicitudFolio && <Chip color={BLUE}>Solicitud {c.solicitudFolio}</Chip>}
        {c.servicioFolio && <Chip color={GREEN}>Servicio {c.servicioFolio}</Chip>}
        {c.sustituyeA && <Chip color={MUTED}>Sustituye a {c.sustituyeA}</Chip>}
      </div>
      <Seccion titulo="Precio">
        <div style={rejilla}>
          {dato("Propuesto por el cotizador", dinero(c.precioPropuesto))}
          {dato("Aprobado para el cliente", final ? `${dinero(final)} + IVA ${dinero(Math.round(final * 16) / 100)}` : "")}
          {dato("Aprobó", c.aprobadoPor ? `${c.aprobadoPor} · ${fechaHora(c.aprobadoEn)}` : "")}
        </div>
        {c.estado === "Propuesta" && (admin ? <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ flex: "1 1 180px" }}><Campo label="Precio aprobado sin IVA" inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)}/></div>
          <button onClick={() => correr(() => store.aprobar(usuario, c, Number(String(precio).replace(/[$,\s]/g, "")), nota), "Precio aprobado")} disabled={ocupado} style={boton(GREEN)}>Aprobar precio</button></div>
          : <p style={{ fontSize: 13, color: AMBER, margin: "10px 0 0" }}>Falta que un administrador apruebe el precio. Hasta entonces no se envía al cliente.</p>)}
        {r.pendientes?.length > 0 && c.estado === "Propuesta" && <p style={{ fontSize: 13, color: AMBER, margin: "10px 0 0" }}>El cálculo se guardó con {r.pendientes.length} dato(s) por confirmar: {r.pendientes.join(" · ")}</p>}
      </Seccion>
      <Seccion titulo="Qué se cotizó">
        <div style={rejilla}>
          {dato("Unidad", r.unidadNombre ? `${r.unidades} × ${r.unidadNombre}${r.conProveedor ? " · con proveedor" : ""}` : "")}
          {dato("Tarimas", r.tarimas)}{dato("Peso", r.pesoKg ? r.pesoKg.toLocaleString("es-MX") + " kg" : "")}{dato("Volumen", r.volumenM3 ? r.volumenM3 + " m³" : "")}
          {dato("Maniobra", r.maniobra === true ? `Sí, ${r.ayudantes} ayudante(s)` : r.maniobra === false ? "No requiere" : "Por definir")}
          {dato("Solicitante", [c.solicitante, c.contacto].filter(Boolean).join(" · "))}
        </div>
        {r.motivoUnidad && <div style={{ fontSize: 13, marginTop: 10 }}>{r.motivoUnidad}</div>}
        {(r.conceptos || []).length > 0 && <div style={{ marginTop: 10 }}><span style={etiqueta}>Desglose interno · no sale al cliente</span>
          {r.conceptos.map(x => <div key={x.concepto} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "4px 0", borderBottom: "1px solid " + BORDER }}>
            <span>{x.concepto} <span style={{ color: MUTED }}>· {x.detalle}</span></span><b style={{ fontFamily: MONO }}>{dinero(x.monto)}</b></div>)}
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Base {dinero(r.subtotalBase)}{r.gananciaPct ? ` + ${r.gananciaPct} % de ganancia` : ""}</div></div>}
        {(r.supuestos || []).length > 0 && <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Supuestos: {r.supuestos.join(" · ")}</div>}
        {c.notas && <div style={{ fontSize: 13, marginTop: 8 }}><span style={etiqueta}>Notas</span>{c.notas}</div>}
        {c.motivo && <div style={{ fontSize: 13, marginTop: 8 }}><span style={etiqueta}>Motivo</span>{c.motivo}</div>}
      </Seccion>
      <Seccion titulo="Qué sigue">
        {["Propuesta", "Aprobada", "Enviada"].includes(c.estado) && <div style={{ marginBottom: 10 }}><Campo label="Nota o motivo" value={nota} onChange={e => setNota(e.target.value)} placeholder="Obligatorio para rechazar o cancelar"/></div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {c.estado === "Aprobada" && <button onClick={() => pasar("Enviada", "Marcada como enviada al cliente")} disabled={ocupado} style={boton(VIOLET)}>Ya se la envié al cliente</button>}
          {c.estado === "Enviada" && <><button onClick={() => pasar("Aceptada", "Cotización aceptada")} disabled={ocupado} style={boton(GREEN)}>El cliente aceptó</button>
            <button onClick={() => pasar("Rechazada", "Cotización rechazada")} disabled={ocupado} style={boton(ROSE, false)}>El cliente rechazó</button></>}
          {c.estado === "Aceptada" && !c.servicioFolio && <button onClick={() => onCrearServicio(c)} disabled={ocupado} style={boton(A)}>Crear servicio</button>}
          {["Propuesta", "Aprobada", "Enviada"].includes(c.estado) && <button onClick={() => pasar("Cancelada", "Cotización cancelada")} disabled={ocupado} style={boton(MUTED, false)}>Cancelar cotización</button>}
          {c.estado === "Aceptada" && c.servicioFolio && <div style={{ fontSize: 14 }}>Convertida en el servicio <b style={{ fontFamily: MONO }}>{c.servicioFolio}</b>.</div>}
          {["Rechazada", "Cancelada"].includes(c.estado) && <div style={{ fontSize: 14, color: MUTED }}>Cerrada. Si el cliente pide otra, emite una cotización nueva desde el cotizador.</div>}
        </div>
      </Seccion>
      <Seccion titulo="Bitácora">
        {eventos.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Sin movimientos.</div> : eventos.map(e => (
          <div key={e.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid " + BORDER }}>
            <span style={{ color: MUTED, fontFamily: MONO, fontSize: 12 }}>{fechaHora(e.ts)}</span> · <b>{e.actorNombre || "Sistema"}</b> {TEXTO_EVENTO(e)}{(e.motivo || e.nota) ? ` — ${e.motivo || e.nota}` : ""}</div>))}
      </Seccion>
    </Dialogo>);
}

export default function Cotizaciones({ store, usuario, onCrearServicio, onNueva }){
  const [lista, setLista] = useState([]), [cargando, setCargando] = useState(true), [error, setError] = useState("");
  const [filtro, setFiltro] = useState("Abiertas"), [q, setQ] = useState(""), [detalleId, setDetalleId] = useState(null), [aviso, setAviso] = useState(null);
  useEffect(() => store.suscribir(x => { setLista(x); setCargando(false); setError(""); }, e => { setError(e.message); setCargando(false); }), [store]);
  useEffect(() => { if(!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  const avisar = (msg, mal = false) => setAviso({ msg, mal });
  const k = useMemo(() => kpisCotizaciones(lista), [lista]);
  const visibles = useMemo(() => { const t = q.trim().toLowerCase();
    return lista.filter(c => (filtro === "Todas" || (filtro === "Abiertas" ? ["Propuesta", "Aprobada", "Enviada"].includes(c.estado) || (c.estado === "Aceptada" && !c.servicioFolio) : c.estado === filtro))
      && (!t || [c.folio, c.empresa, c.solicitante, c.solicitudFolio, c.servicioFolio, c.resultado?.unidadNombre].join(" ").toLowerCase().includes(t))); }, [lista, filtro, q]);
  const detalle = lista.find(c => c.id === detalleId) || null;
  const tile = (n, t, color) => <div key={t} style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 16px", flex: "1 1 150px" }}>
    <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, color: TEXT }}>{n}</div><div style={{ fontSize: 12, color: MUTED }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: color, marginRight: 6 }}/>{t}</div></div>;
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 220 }}><h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>Cotizaciones</h1>
          <div style={{ fontSize: 13, color: MUTED }}>Lo que calculó el cotizador, con folio. El precio lo aprueba un administrador antes de enviarse.</div></div>
        <button onClick={onNueva} style={boton(A)}>Nueva cotización</button>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {tile(k.porAprobar, "Por aprobar", AMBER)}{tile(k.porEnviar, "Aprobadas sin enviar", BLUE)}{tile(k.esperandoCliente, "Esperando al cliente", VIOLET)}
        {tile(k.tasaCierrePct === null ? "—" : k.tasaCierrePct + " %", "Aceptadas de las respondidas", GREEN)}{tile(dinero(k.montoAceptado), "Monto aceptado sin IVA", GREEN)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "0 1 220px" }}><Campo label="Ver" opciones={["Abiertas", "Todas", ...ESTADOS_COTIZACION]} value={filtro} onChange={e => setFiltro(e.target.value)}/></div>
        <div style={{ flex: "1 1 240px" }}><Campo label="Buscar" value={q} onChange={e => setQ(e.target.value)} placeholder="Folio, cliente, solicitud o servicio"/></div>
      </div>
      {error && <div role="alert" style={{ background: ROSE + "10", border: "1px solid " + ROSE + "50", color: ROSE, borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>No se pudieron cargar las cotizaciones: {error}</div>}
      <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 860 }}>
          <thead><tr>{["Folio", "Estado", "Cliente", "Unidad", "Propuesto", "Aprobado", "Emitida", "Ligas"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, color: MUTED, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
          <tbody>
            {cargando ? <tr><td colSpan={8} style={{ padding: 24, color: MUTED }}>Cargando…</td></tr>
              : visibles.length === 0 ? <tr><td colSpan={8} style={{ padding: 24, color: MUTED }}>{lista.length === 0 ? "Todavía no hay cotizaciones guardadas. Se crean desde el Cotizador automático o desde una solicitud." : "Ninguna cotización con ese filtro."}</td></tr>
              : visibles.map(c => <tr key={c.id} onClick={() => setDetalleId(c.id)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetalleId(c.id)} style={{ cursor: "pointer", borderBottom: "1px solid " + BORDER }}>
                <td style={{ padding: "10px 12px", fontFamily: MONO, fontWeight: 700 }}>{c.folio}</td>
                <td style={{ padding: "10px 12px" }}><Chip color={COLOR[c.estado] || MUTED}>{c.estado}</Chip></td>
                <td style={{ padding: "10px 12px" }}>{c.empresa}</td>
                <td style={{ padding: "10px 12px" }}>{c.resultado?.unidadNombre ? `${c.resultado.unidades} × ${c.resultado.unidadNombre}` : "—"}</td>
                <td style={{ padding: "10px 12px", fontFamily: MONO }}>{dinero(c.precioPropuesto)}</td>
                <td style={{ padding: "10px 12px", fontFamily: MONO }}>{dinero(c.precioAprobado)}</td>
                <td style={{ padding: "10px 12px", color: MUTED }}>{fechaHora(c.creadoEn)}</td>
                <td style={{ padding: "10px 12px", fontFamily: MONO, fontSize: 12 }}>{[c.solicitudFolio, c.servicioFolio].filter(Boolean).join(" → ") || "—"}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
      {detalle && <Detalle key={detalle.id} c={detalle} store={store} usuario={usuario} avisar={avisar} onClose={() => setDetalleId(null)} onCrearServicio={x => { setDetalleId(null); onCrearServicio(x); }}/>}
      {aviso && <div role="status" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: aviso.mal ? ROSE : TEXT, color: "#fff", borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 700, zIndex: 700, maxWidth: "90vw" }}>{aviso.msg}</div>}
    </div>);
}
