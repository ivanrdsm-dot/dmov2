/* SERVICIOS · alta manual (Fase 0). Todo servicio del grupo se registra aquí:
   quién lo pidió, por dónde llegó, qué se mueve, quién lo ejecuta y en qué estado va.
   No habla con Firestore: recibe un `store` (serviciosStore.js o uno en memoria). */
import { useEffect, useMemo, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, VIOLET, MUTED, TEXT, BORDER, BD2, DISP, MONO, ahoraLocal, dinero, fechaHora, etiqueta, caja, rejilla, boton, Campo, Chip, Seccion, Dialogo } from "./uiBasico.jsx";
import {
  ESTADOS_SERVICIO, CANALES_SOLICITUD, TIPOS_ASIGNACION,
  validarServicio, evaluarCambioEstado, kpisServicios, resumenRuta, minutosACotizacion,
} from "./servicios.ts";
import { recomendarUnidades } from "./dimensionamiento.ts";
import { proveedorHabilitado, puntoListoParaRuta } from "./catalogos.ts";
import { CONCEPTOS_COSTO, validarCosto, totalCostos, margenServicio } from "./costos.ts";

/* Costos reales del servicio. Los captura la oficina; el margen lo ve solo un admin.
   Un costo no se edita ni se borra: se anula con motivo. */
function CostosServicio({ s, store, usuario, avisar }){
  const esAdmin = usuario.rol === "admin";
  const [costos, setCostos] = useState([]), [f, setF] = useState({ concepto: CONCEPTOS_COSTO[0], monto: "", nota: "" });
  const [anulando, setAnulando] = useState(null), [motivo, setMotivo] = useState(""), [ocupado, setOcupado] = useState(false);
  useEffect(() => store.suscribirCostos ? store.suscribirCostos(s.id, setCostos, () => setCostos([])) : undefined, [store, s.id]);
  const t = totalCostos(costos);
  /* El margen usa el total que calcula el servidor; mientras llega, el de la lista. */
  const m = margenServicio({ precio: s.precio, costoTotal: t.total, costosN: t.n });
  const errores = validarCosto(f);
  const correr = async (fn, ok) => { setOcupado(true); try { await fn(); avisar(ok); } catch(e){ avisar("No se pudo guardar: " + e.message, true); } finally { setOcupado(false); } };
  const agregar = () => { if(errores.length){ avisar("Falta: " + errores.join(" · "), true); return; }
    correr(async () => { await store.agregarCosto(usuario, s, f); setF(x => ({ ...x, monto: "", nota: "" })); }, "Costo agregado"); };
  const colorM = m.estado === "pérdida" ? ROSE : m.estado === "con margen" ? GREEN : AMBER;
  return (
    <Seccion titulo="Costos reales">
      {esAdmin && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {[["Precio aprobado", dinero(m.precio)], ["Costo real", m.costo === null ? "—" : dinero(m.costo) || "$0"], ["Margen", m.margen === null ? "—" : (m.margen < 0 ? "−" : "") + dinero(Math.abs(m.margen))], ["Margen %", m.margenPct === null ? "—" : m.margenPct + " %"]].map(([k, v]) =>
          <div key={k} style={{ flex: "1 1 130px", border: "1px solid " + BORDER, borderRadius: 12, padding: "8px 12px" }}><span style={etiqueta}>{k}</span><b style={{ fontFamily: MONO, fontSize: 15 }}>{v}</b></div>)}
        <div style={{ flexBasis: "100%" }}><Chip color={colorM}>{m.estado === "sin precio" ? "Sin precio aprobado: no hay margen que medir" : m.estado === "sin costos" ? "Faltan los costos reales" : m.estado === "pérdida" ? "Este servicio dejó pérdida" : "Con margen"}</Chip></div>
      </div>}
      {costos.length === 0 ? <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>Todavía no se capturan costos de este servicio.</div> : costos.map(c => (
        <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, padding: "6px 0", borderBottom: "1px solid " + BORDER, opacity: c.anulado ? .55 : 1 }}>
          <span style={{ flex: "1 1 180px", textDecoration: c.anulado ? "line-through" : "none" }}><b>{c.concepto}</b>{c.nota ? <span style={{ color: MUTED }}> · {c.nota}</span> : null}</span>
          <b style={{ fontFamily: MONO, textDecoration: c.anulado ? "line-through" : "none" }}>{dinero(c.monto)}</b>
          <span style={{ fontSize: 11, color: MUTED, flexBasis: "100%" }}>{c.actorNombre} · {fechaHora(c.ts)}{c.anulado ? ` · anulado por ${c.anuladoNombre || ""}: ${c.motivoAnulacion || ""}` : ""}</span>
          {!c.anulado && (anulando === c.id ? <div style={{ display: "flex", gap: 8, flexBasis: "100%", alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}><Campo label="Motivo de la anulación" value={motivo} onChange={e => setMotivo(e.target.value)}/></div>
              <button onClick={() => correr(async () => { await store.anularCosto(usuario, s, c, motivo); setAnulando(null); setMotivo(""); }, "Costo anulado")} disabled={ocupado} style={boton(ROSE)}>Anular</button>
              <button onClick={() => { setAnulando(null); setMotivo(""); }} style={boton(MUTED, false)}>Cancelar</button></div>
            : <button onClick={() => setAnulando(c.id)} style={{ ...boton(MUTED, false), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>Anular</button>)}
        </div>))}
      {t.n > 0 && <div style={{ fontSize: 13, marginTop: 8 }}>Total vigente: <b style={{ fontFamily: MONO }}>{dinero(t.total)}</b> en {t.n} costo(s), sin IVA.</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: "1 1 190px" }}><Campo label="Concepto" opciones={[...CONCEPTOS_COSTO]} value={f.concepto} onChange={e => setF(x => ({ ...x, concepto: e.target.value }))}/></div>
        <div style={{ flex: "0 1 140px" }}><Campo label="Monto sin IVA" inputMode="decimal" value={f.monto} onChange={e => setF(x => ({ ...x, monto: e.target.value }))}/></div>
        <div style={{ flex: "1 1 200px" }}><Campo label={f.concepto === "Otro" ? "Nota (qué fue) *" : "Nota"} value={f.nota} onChange={e => setF(x => ({ ...x, nota: e.target.value }))} placeholder="Factura, proveedor, ruta…"/></div>
        <button onClick={agregar} disabled={ocupado} style={boton(A)}>Agregar costo</button>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Uso interno: estos costos nunca salen en documentos para el cliente.</div>
    </Seccion>);
}

const COLOR_ESTADO = { Solicitud: AMBER, Cotizada: BLUE, Confirmada: VIOLET, Asignada: VIOLET, "En ruta": A, Entregada: GREEN,
  Cerrada: GREEN, Conciliada: GREEN, Facturada: MUTED, Cobrada: MUTED, Cancelada: ROSE };

const VACIO = () => ({
  canal: "", recibidaEn: ahoraLocal(), empresa: "", clienteId: "", plan: "", centroCostos: "", solicitante: "", solicitanteContacto: "",
  fechaServicio: "", horaServicio: "", origenes: [{ nombre: "", direccion: "", contacto: "", telefono: "" }],
  destinos: [{ nombre: "", direccion: "", contacto: "", telefono: "" }],
  mercancia: "", cajas: "", tarimas: "", pesoKg: "", volumenM3: "", maniobras: "", valorDeclarado: "", requisitos: "",
  cotizacionFolio: "", precioPropuesto: "", confirmadoPor: "", asignacionTipo: "", unidadPlaca: "", choferNombre: "", proveedor: "",
  receptor: "", notas: "",
});

/* Unidad sugerida: compara la carga contra las capacidades capturadas en Flota. */
function UnidadSugerida({ carga, unidades, onElegir }){
  const r = useMemo(() => recomendarUnidades(carga, unidades), [carga.pesoKg, carga.volumenM3, carga.tarimas, carga.cajas, unidades]);
  const color = r.estado === "ok" ? GREEN : r.estado === "no_cabe" ? ROSE : AMBER;
  return (
    <div style={{ border: "1px solid " + color + "50", background: color + "0d", borderRadius: 12, padding: "12px 14px", fontSize: 13 }}>
      <div style={{ fontWeight: 800, color, marginBottom: 6 }}>{r.estado === "ok" ? "Unidad sugerida: " + r.unidades.map(u => u.placa + (u.tipo ? " · " + u.tipo : "")).join(" + ")
        : r.estado === "no_cabe" ? "No cabe en la flota con capacidad capturada" : r.estado === "sin_datos_carga" ? "Sin datos para dimensionar" : "Falta capturar capacidades en Flota"}</div>
      {r.justificacion.map((j, i) => <div key={i} style={{ color: TEXT, lineHeight: 1.5 }}>{j}</div>)}
      {r.unidadesSinCapacidad.length > 0 && <div style={{ color: MUTED, marginTop: 6 }}>No se consideraron por falta de capacidad capturada: {r.unidadesSinCapacidad.join(", ")}.</div>}
      {onElegir && r.estado === "ok" && r.unidades.length === 1 && <button type="button" onClick={() => onElegir(r.unidades[0].placa)} style={{ ...boton(GREEN, false), marginTop: 10, minHeight: 36, padding: "6px 12px" }}>Usar {r.unidades[0].placa}</button>}
    </div>
  );
}

function Puntos({ titulo, puntos, onChange, catalogo = [] }){
  const set = (i, k, v) => onChange(puntos.map((p, j) => j === i ? { ...p, [k]: v } : p));
  /* Al elegir un punto del catálogo se llenan dirección y contacto; queda ligado por id. */
  const elegir = (i, nombre) => { const c = catalogo.find(x => x.activo !== false && x.nombre === nombre);
    onChange(puntos.map((p, j) => j !== i ? p : c ? { ...p, nombre, puntoId: c.id, direccion: c.direccion || p.direccion, contacto: c.contacto || p.contacto, telefono: c.telefono || p.telefono, pinListo: puntoListoParaRuta(c) } : { ...p, nombre, puntoId: "", pinListo: false })); };
  return (
    <Seccion titulo={titulo}>
      {puntos.map((p, i) => (
        <div key={i} style={{ ...rejilla, marginBottom: 10, paddingBottom: 10, borderBottom: i < puntos.length - 1 ? "1px dashed " + BD2 : "none" }}>
          <div><Campo label="Nombre del lugar" name={titulo + i} lista={catalogo.filter(x => x.activo !== false).map(x => x.nombre).filter(Boolean)} value={p.nombre || ""} onChange={e => elegir(i, e.target.value)} placeholder="Bodega, tienda, CEDIS"/>
            {p.puntoId && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: p.pinListo ? GREEN : AMBER }}>{p.pinListo ? "Punto del catálogo, pin confirmado" : "Punto del catálogo, pin sin confirmar"}</div>}</div>
          <Campo label="Dirección *" name={titulo + i} value={p.direccion || ""} onChange={e => set(i, "direccion", e.target.value)}/>
          <Campo label="Quién entrega o recibe" name={titulo + i} value={p.contacto || ""} onChange={e => set(i, "contacto", e.target.value)}/>
          <Campo label="Teléfono" name={titulo + i} value={p.telefono || ""} onChange={e => set(i, "telefono", e.target.value)} inputMode="tel"/>
          {puntos.length > 1 && <button type="button" onClick={() => onChange(puntos.filter((_, j) => j !== i))} style={{ ...boton(ROSE, false), alignSelf: "end" }}>Quitar punto</button>}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...puntos, { nombre: "", direccion: "", contacto: "", telefono: "" }])} style={boton(BLUE, false)}>+ Agregar punto</button>
    </Seccion>
  );
}

function Formulario({ inicial, clientes, choferes, unidades, puntos = [], proveedores = [], onGuardar, onClose, guardando }){
  const [f, setF] = useState(() => ({ ...VACIO(), ...inicial }));
  const [intento, setIntento] = useState(false);
  const s = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const v = validarServicio(f);
  const empresas = useMemo(() => [...new Set(clientes.map(c => c.empresa || c.nombre).filter(Boolean))].sort(), [clientes]);
  const elegirEmpresa = e => { const val = e.target.value; const c = clientes.find(x => (x.empresa || x.nombre) === val); setF(x => ({ ...x, empresa: val, clienteId: c ? c.id : "" })); };
  const planes = clientes.find(c => c.id === f.clienteId)?.planes || [];
  return (
    <form onSubmit={e => { e.preventDefault(); setIntento(true); if(v.ok) onGuardar(f); }}>
      <Seccion titulo="¿Quién lo pide?">
        <div style={rejilla}>
          <Campo label="¿Por dónde llegó? *" opciones={["", ...CANALES_SOLICITUD]} value={f.canal} onChange={s("canal")}/>
          <Campo label="¿Cuándo llegó? *" type="datetime-local" value={f.recibidaEn} onChange={s("recibidaEn")}/>
          <Campo label="Empresa o cliente *" lista={empresas} value={f.empresa} onChange={elegirEmpresa} placeholder="Escribe o elige"/>
          <Campo label="Quién lo pide *" value={f.solicitante} onChange={s("solicitante")}/>
          <Campo label="Su correo o teléfono" value={f.solicitanteContacto} onChange={s("solicitanteContacto")}/>
        </div>
        <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: BLUE }}>Plan y centro de costos (para facturar)</summary>
        <div style={{ ...rejilla, marginTop: 10 }}>
          <Campo label="Plan" lista={planes.map(String)} value={f.plan} onChange={s("plan")}/>
          <Campo label="Centro de costos" value={f.centroCostos} onChange={s("centroCostos")}/>
        </div></details>
      </Seccion>
      <Puntos titulo="¿Dónde se carga?" puntos={f.origenes} catalogo={puntos} onChange={x => setF(y => ({ ...y, origenes: x }))}/>
      <Puntos titulo="¿Dónde se entrega?" puntos={f.destinos} catalogo={puntos} onChange={x => setF(y => ({ ...y, destinos: x }))}/>
      <Seccion titulo="¿Cuándo y qué se mueve?">
        <div style={rejilla}>
          <Campo label="Fecha del servicio" type="date" value={f.fechaServicio} onChange={s("fechaServicio")}/>
          <Campo label="Hora o ventana" value={f.horaServicio} onChange={s("horaServicio")} placeholder="8:00 a 10:00"/>
          <Campo label="Tipo de mercancía" value={f.mercancia} onChange={s("mercancia")}/>
          <Campo label="Cajas" inputMode="numeric" value={f.cajas} onChange={s("cajas")}/>
          <Campo label="Tarimas" inputMode="numeric" value={f.tarimas} onChange={s("tarimas")}/>
          <Campo label="Peso (kg)" inputMode="decimal" value={f.pesoKg} onChange={s("pesoKg")}/>
          <Campo label="¿Hacen falta ayudantes?" value={f.maniobras} onChange={s("maniobras")} placeholder="Ej. 2 ayudantes para descargar"/>
        </div>
        <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: BLUE }}>Más detalles (opcional): volumen, valor de la mercancía, requisitos</summary>
        <div style={{ ...rejilla, marginTop: 10 }}>
          <Campo label="Volumen (m³)" inputMode="decimal" value={f.volumenM3} onChange={s("volumenM3")}/>
          <Campo label="Valor de la mercancía (MXN)" inputMode="decimal" value={f.valorDeclarado} onChange={s("valorDeclarado")}/>
        </div>
        <div style={{ marginTop: 12 }}><Campo label="Requisitos especiales" area value={f.requisitos} onChange={s("requisitos")} placeholder="Cita en CEDIS, EPP, horario de acceso"/></div></details>
        <div style={{ marginTop: 12 }}><UnidadSugerida carga={f} unidades={unidades} onElegir={placa => setF(x => ({ ...x, unidadPlaca: placa, asignacionTipo: x.asignacionTipo || "Flota propia" }))}/></div>
      </Seccion>
      <Seccion titulo={inicial?.id ? "Cotización y asignación" : "Cotización"}>
        <div style={rejilla}>
          <Campo label="Folio de cotización" value={f.cotizacionFolio} onChange={s("cotizacionFolio")} placeholder="COT-2026-…"/>
          <Campo label="Precio propuesto sin IVA" inputMode="decimal" value={f.precioPropuesto} onChange={s("precioPropuesto")}/>
          <Campo label="Quién confirmó por el cliente" value={f.confirmadoPor} onChange={s("confirmadoPor")}/>
          {/* Al registrar no se pide unidad ni chofer: eso se hace después en "Chofer y ruta" del servicio. */}
          {inicial?.id && <>
          <Campo label="Tipo de asignación" opciones={["", ...TIPOS_ASIGNACION]} value={f.asignacionTipo} onChange={s("asignacionTipo")}/>
          {f.asignacionTipo === "Proveedor externo" && <div><Campo label="Proveedor" lista={proveedores.filter(x => x.activo !== false).map(x => x.nombre).filter(Boolean)} value={f.proveedor} onChange={s("proveedor")}/>
            {(() => { const pr = proveedores.find(x => x.nombre === f.proveedor); if(!f.proveedor) return null; if(!pr) return <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, marginTop: 3 }}>No está en el catálogo de proveedores</div>;
              const h = proveedorHabilitado(pr, ahoraLocal().slice(0, 10)); return <div style={{ fontSize: 11, fontWeight: 700, color: h.habilitado ? GREEN : ROSE, marginTop: 3 }}>{h.habilitado ? "Proveedor habilitado" : "No habilitado: " + h.motivos[0]}</div>; })()}</div>}
          <Campo label="Placas de la unidad" lista={unidades.map(u => u.placa).filter(Boolean)} value={f.unidadPlaca} onChange={s("unidadPlaca")}/>
          <Campo label="Chofer" lista={choferes.map(c => c.nombre).filter(Boolean)} value={f.choferNombre} onChange={s("choferNombre")}/>
          <Campo label="Quién recibió" value={f.receptor} onChange={s("receptor")}/></>}
        </div>
        <div style={{ marginTop: 12 }}><Campo label="Notas" area value={f.notas} onChange={s("notas")}/></div>
        <p style={{ fontSize: 12, color: MUTED, margin: "10px 0 0" }}>El precio aprobado lo fija un administrador desde el detalle del servicio.</p>
      </Seccion>
      {intento && !v.ok && <div role="alert" style={{ background: ROSE + "10", border: "1px solid " + ROSE + "50", color: ROSE, borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
        <b>Falta para poder guardar:</b> {v.errores.join(" · ")}</div>}
      {v.pendientes.length > 0 && <div style={{ background: AMBER + "10", border: "1px solid " + AMBER + "50", color: "#92400e", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
        <b>Se guardará como PENDIENTE:</b> {v.pendientes.join(" · ")}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onClose} style={boton(MUTED, false)}>Cancelar</button>
        <button type="submit" disabled={guardando} style={{ ...boton(A), opacity: guardando ? .6 : 1 }}>{guardando ? "Guardando…" : inicial?.id ? "Guardar cambios" : "Registrar servicio"}</button>
      </div>
    </form>
  );
}

/* Chofer y ruta en un solo paso, desde el servicio: elige unidad y chofer (con la app
   lista), se guardan en el servicio, el servidor arma la ruta con los lugares del
   catálogo y el servicio pasa a "Asignada". Antes había que escribir el chofer aquí
   y volver a elegirlo en Despacho. */
function ChoferYRuta({ s, store, usuario, unidades, choferesApp, despacho, avisar }){
  const [placa, setPlaca] = useState(s.unidadPlaca || ""), [choferId, setChoferId] = useState(s.choferId || ""), [ocupado, setOcupado] = useState(false);
  if(!despacho || !["Confirmada", "Asignada"].includes(s.estado) || s.rutaArmadaEn) return null;
  const listos = choferesApp.filter(c => !!c.authUid && c.status !== "Inactivo");   // tiene cuenta de la app
  const chofer = listos.find(c => c.id === choferId);
  const asignar = async () => {
    if(!placa || !chofer){ avisar("Elige la unidad y el chofer", true); return; }
    setOcupado(true);
    try {
      await store.actualizar(usuario, s, { ...s, unidadPlaca: placa, choferNombre: chofer.nombre || "", asignacionTipo: s.asignacionTipo || "Flota propia" });
      await despacho.prepararRuta(s.id, chofer.id);
      if(s.estado === "Confirmada") await store.cambiarEstado(usuario, { ...s, unidadPlaca: placa, choferNombre: chofer.nombre || "" }, "Asignada", {});
      avisar("Listo: " + (chofer.nombre || "el chofer") + " ya tiene la ruta en su app");
    } catch(e){
      const m = String(e?.message || e);
      avisar(/pin confirmado/.test(m) ? m + ". Ve a Lugares y confirma el pin de esos puntos." : "No se pudo: " + m, true);
    } finally { setOcupado(false); }
  };
  return (
    <Seccion titulo="Chofer y ruta">
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px" }}><Campo label="Unidad (placas)" opciones={["", ...unidades.map(u => u.placa).filter(Boolean)]} value={placa} onChange={e => setPlaca(e.target.value)}/></div>
        <div style={{ flex: "1 1 200px" }}><Campo label="Chofer con la app lista" opciones={["", ...listos.map(c => c.nombre || c.id)]} value={chofer ? (chofer.nombre || chofer.id) : ""}
          onChange={e => setChoferId(listos.find(c => (c.nombre || c.id) === e.target.value)?.id || "")}/></div>
        <button onClick={asignar} disabled={ocupado || !placa || !chofer} style={{ ...boton(A), opacity: ocupado || !placa || !chofer ? .5 : 1 }}>{ocupado ? "Asignando…" : "Asignar y mandar ruta al chofer"}</button>
      </div>
      {listos.length === 0 && <div style={{ fontSize: 12, color: AMBER, fontWeight: 700, marginTop: 8 }}>Ningún chofer tiene la app lista todavía. Su cuenta se crea en En vivo → Choferes en ruta.</div>}
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Los lugares de carga y entrega deben estar en Lugares con su pin confirmado.</div>
    </Seccion>);
}

/* Link para el cliente: una página con la etapa de su servicio y, al final, una encuesta.
   No muestra precios ni datos internos. Cambiar el link apaga el anterior. */
function LinkCliente({ s, despacho, avisar }){
  const [ocupado, setOcupado] = useState(false);
  if(!despacho || s.estado === "Cancelada") return null;
  const url = s.seguimientoToken ? `${window.location.origin}/s/${s.seguimientoToken}` : "";
  const pedir = async nuevo => {
    if(nuevo && !window.confirm("El link anterior dejará de funcionar. ¿Crear uno nuevo?")) return;
    setOcupado(true);
    try { const r = await despacho.linkSeguimiento(s.id, nuevo); const u = `${window.location.origin}/s/${r.token}`; try { await navigator.clipboard.writeText(u); avisar("Link copiado. Pégalo en el correo o WhatsApp del cliente."); } catch { avisar("Link listo"); } }
    catch(e){ avisar("No se pudo: " + (e?.message || e), true); } finally { setOcupado(false); }
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(url); avisar("Link copiado"); } catch { avisar("Cópialo a mano: " + url, true); } };
  return (
    <Seccion titulo="Link para el cliente">
      {s.encuestaCalificacion ? <div style={{ fontSize: 14, marginBottom: 8 }}>El cliente calificó: <b style={{ color: A }}>{"★".repeat(s.encuestaCalificacion)}{"☆".repeat(5 - s.encuestaCalificacion)}</b></div> : null}
      {url ? <>
        <div style={{ fontFamily: MONO, fontSize: 12, wordBreak: "break-all", background: "#f8fafc", border: "1px solid " + BORDER, borderRadius: 10, padding: "8px 10px" }}>{url}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button onClick={copiar} style={boton(A)}>Copiar link</button>
          <a href={url} target="_blank" rel="noreferrer" style={{ ...boton(BLUE, false), textDecoration: "none", lineHeight: "20px" }}>Ver como cliente</a>
          <button onClick={() => pedir(true)} disabled={ocupado} style={boton(MUTED, false)}>Cambiar link</button>
        </div></>
        : <button onClick={() => pedir(false)} disabled={ocupado} style={boton(A)}>{ocupado ? "Creando…" : "Crear link para el cliente"}</button>}
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>El cliente ve en qué etapa va su servicio y, al entregarse, puede calificarlo. No ve precios ni datos internos.</div>
    </Seccion>);
}

function Detalle({ s, store, usuario, unidades, choferesApp = [], despacho = null, onEditar, onClose, avisar }){
  const esAdmin = usuario.rol === "admin";
  const [eventos, setEventos] = useState([]);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [precio, setPrecio] = useState(s.precio || s.precioPropuesto || "");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => store.suscribirEventos(s.id, setEventos, () => setEventos([])), [s.id, store]);
  const v = validarServicio(s);
  const i = ESTADOS_SERVICIO.indexOf(s.estado);
  const opciones = [...ESTADOS_SERVICIO, "Cancelada"].filter(e => evaluarCambioEstado(s, e, { esAdmin }).permitido);
  const siguiente = i >= 0 && i < ESTADOS_SERVICIO.length - 1 ? ESTADOS_SERVICIO[i + 1] : "";
  const elegido = destino || (opciones.includes(siguiente) ? siguiente : "");
  const veredicto = elegido ? evaluarCambioEstado(s, elegido, { esAdmin }) : null;
  const correr = async (fn, ok) => { setOcupado(true); try { await fn(); avisar(ok); } catch(e){ avisar("No se pudo guardar: " + e.message, true); } finally { setOcupado(false); } };
  const cambiar = () => {
    if(veredicto.requiereMotivo && !motivo.trim()){ avisar("Escribe el motivo: queda en la bitácora", true); return; }
    correr(async () => { await store.cambiarEstado(usuario, s, elegido, { motivo: motivo.trim(), faltantes: veredicto.faltantes }); setDestino(""); setMotivo(""); }, "Estado actualizado a " + elegido);
  };
  const aprobar = () => {
    const n = Number(String(precio).replace(/[$,\s]/g, ""));
    if(!(n > 0)){ avisar("Escribe un precio mayor a cero", true); return; }
    correr(() => store.aprobarPrecio(usuario, s, n), "Precio aprobado");
  };
  const dato = (k, val) => <div><span style={etiqueta}>{k}</span><div style={{ fontSize: 14 }}>{val || <span style={{ color: AMBER, fontWeight: 700 }}>PENDIENTE</span>}</div></div>;
  const punto = (p, n) => <div key={n} style={{ fontSize: 13, marginBottom: 6 }}><b>{p.nombre || "Punto " + (n + 1)}</b> · {p.direccion}{p.contacto ? " · " + p.contacto : ""}{p.telefono ? " · " + p.telefono : ""}</div>;
  const min = minutosACotizacion(s);
  return (
    <Dialogo titulo={`${s.folio} · ${s.empresa}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <Chip color={COLOR_ESTADO[s.estado] || MUTED}>{s.estado}</Chip>
        <span style={{ fontSize: 12, color: MUTED }}>Recibida por {s.canal} el {s.recibidaEn?.replace("T", " ")}{min !== null ? ` · cotizada en ${min} min` : ""}</span>
        <button onClick={() => correr(async () => { const { descargarHojaEntrega } = await import("./hojaEntregaPdf.js"); const h = await descargarHojaEntrega(s, await store.leerParadas(s.id)); if(!h.completa) avisar("Hoja generada como documento parcial: " + h.pendientes.join(" · "), true); }, "Hoja de entrega descargada")}
          disabled={ocupado} style={{ ...boton(GREEN, false), marginLeft: "auto" }}>Hoja de entrega (PDF)</button>
        <button onClick={onEditar} style={boton(BLUE, false)}>Editar datos</button>
      </div>
      {v.pendientes.length > 0 && <div style={{ background: AMBER + "10", border: "1px solid " + AMBER + "50", color: "#92400e", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}><b>PENDIENTE:</b> {v.pendientes.join(" · ")}</div>}
      <Seccion titulo="Solicitud">
        <div style={rejilla}>{dato("Solicita", s.solicitante)}{dato("Contacto", s.solicitanteContacto)}{dato("Plan o centro de costos", [s.plan, s.centroCostos].filter(Boolean).join(" · "))}
          {dato("Fecha del servicio", [s.fechaServicio, s.horaServicio].filter(Boolean).join(" · "))}{dato("Mercancía", s.mercancia)}
          {dato("Cantidad", [s.cajas && s.cajas + " cajas", s.tarimas && s.tarimas + " tarimas", s.pesoKg && s.pesoKg + " kg", s.volumenM3 && s.volumenM3 + " m³"].filter(Boolean).join(" · "))}</div>
        <div style={{ marginTop: 12 }}><span style={etiqueta}>Orígenes</span>{(s.origenes || []).filter(p => p.direccion).map(punto)}</div>
        <div style={{ marginTop: 8 }}><span style={etiqueta}>Destinos</span>{(s.destinos || []).filter(p => p.direccion).map(punto)}</div>
        {(s.maniobras || s.requisitos || s.notas) && <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>{[s.maniobras, s.requisitos, s.notas].filter(Boolean).join(" · ")}</div>}
      </Seccion>
      <Seccion titulo="Qué unidad necesita"><UnidadSugerida carga={s} unidades={unidades}/></Seccion>
      <Seccion titulo="Cotización y asignación">
        <div style={rejilla}>{dato("Folio de cotización", s.cotizacionFolio)}{dato("Precio propuesto", s.precioPropuesto ? dinero(s.precioPropuesto) : "")}
          {dato("Precio aprobado", s.precio ? `${dinero(s.precio)} · ${s.precioAprobadoPor || ""}` : "")}{dato("Confirmó el cliente", s.confirmadoPor)}
          {dato("Asignación", [s.asignacionTipo, s.proveedor].filter(Boolean).join(" · "))}{dato("Unidad y chofer", [s.unidadPlaca, s.choferNombre].filter(Boolean).join(" · "))}{dato("Recibió", s.receptor)}</div>
        {esAdmin && <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ flex: "1 1 180px" }}><Campo label="Precio aprobado sin IVA" inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)}/></div>
          <button onClick={aprobar} disabled={ocupado} style={boton(GREEN)}>Aprobar precio</button></div>}
      </Seccion>
      <ChoferYRuta s={s} store={store} usuario={usuario} unidades={unidades} choferesApp={choferesApp} despacho={despacho} avisar={avisar}/>
      <LinkCliente s={s} despacho={despacho} avisar={avisar}/>
      <CostosServicio s={s} store={store} usuario={usuario} avisar={avisar}/>
      <Seccion titulo="Cambiar estado">
        {opciones.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Este servicio ya no cambia de estado.</div> : <>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}><Campo label="Nuevo estado" opciones={["", ...opciones]} value={elegido} onChange={e => setDestino(e.target.value)}/></div>
            <button onClick={cambiar} disabled={!elegido || ocupado} style={{ ...boton(A), opacity: !elegido || ocupado ? .5 : 1 }}>Confirmar cambio</button>
          </div>
          {veredicto?.faltantes.length > 0 && <div style={{ color: ROSE, fontSize: 13, marginTop: 10 }}><b>Falta:</b> {veredicto.faltantes.join(" · ")}</div>}
          {veredicto?.requiereMotivo && <div style={{ marginTop: 10 }}><Campo label="Motivo (queda en la bitácora) *" area value={motivo} onChange={e => setMotivo(e.target.value)}/></div>}
        </>}
      </Seccion>
      <Seccion titulo="Bitácora">
        {eventos.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Sin eventos.</div> : eventos.map(e => (
          <div key={e.id} style={{ fontSize: 13, padding: "7px 0", borderBottom: "1px solid " + BORDER }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{fechaHora(e.ts)}</span> · <b>{e.actorNombre || e.actorUid}</b>{" "}
            {e.tipo === "creado" ? "registró el servicio" : e.tipo === "link_seguimiento_creado" ? "creó el link para el cliente" : e.tipo === "link_seguimiento_cambiado" ? "cambió el link para el cliente" : e.tipo === "encuesta" ? `recibió la calificación del cliente: ${e.calificacion} de 5` : e.tipo === "costo" ? `agregó un costo: ${e.datos?.concepto} ${dinero(e.datos?.monto)}` : e.tipo === "costo_anulado" ? `anuló un costo (${e.datos?.concepto} ${dinero(e.datos?.monto)})` : e.tipo === "estado" ? `cambió de ${e.de} a ${e.a}` : e.tipo === "precio_aprobado" ? `aprobó el precio ${dinero(e.cambios?.[0]?.despues)}` : `editó ${(e.cambios || []).map(c => c.campo).join(", ")}`}
            {e.excepcion && <span style={{ color: ROSE }}> · sin {e.faltantes.join(", ")}</span>}{e.motivo && <span style={{ color: MUTED }}> · Motivo: {e.motivo}</span>}
          </div>))}
      </Seccion>
    </Dialogo>
  );
}

export default function Servicios({ store, usuario, clientes = [], choferes = [], prefill = null, onCreado = null, despacho = null }){
  const [choferesApp, setChoferesApp] = useState([]);
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [unidades, setUnidades] = useState([]);
  const [puntos, setPuntos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [filtro, setFiltro] = useState("Activos");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);       // null | {} nuevo | servicio a editar
  const [detalleId, setDetalleId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  useEffect(() => store.suscribir(x => { setLista(x); setCargando(false); setError(""); }, e => { setError(e.message); setCargando(false); }), [store]);
  useEffect(() => store.suscribirCatalogo("unidades", setUnidades), [store]);
  useEffect(() => store.suscribirCatalogo("puntos_entrega", setPuntos), [store]);
  useEffect(() => store.suscribirCatalogo("proveedores", setProveedores), [store]);
  useEffect(() => store.suscribirCatalogo("choferes", setChoferesApp), [store]);
  /* Viene de la bandeja de Solicitudes: abre el formulario con lo que ya se sabe. */
  useEffect(() => { if(prefill) setForm({ ...prefill }); }, [prefill]);
  useEffect(() => { if(!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  const avisar = (msg, mal = false) => setAviso({ msg, mal });
  const hoy = ahoraLocal().slice(0, 10);
  const k = useMemo(() => kpisServicios(lista, Date.now(), hoy), [lista, hoy]);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lista.filter(s => (filtro === "Todos" || (filtro === "Activos" ? !["Cancelada", "Cobrada"].includes(s.estado) : s.estado === filtro))
      && (!t || [s.folio, s.empresa, s.solicitante, s.cotizacionFolio, s.choferNombre, s.unidadPlaca, resumenRuta(s)].join(" ").toLowerCase().includes(t)));
  }, [lista, filtro, q]);
  const detalle = lista.find(s => s.id === detalleId) || null;
  const guardar = async datos => {
    setGuardando(true);
    try {
      if(form?.id){ const n = await store.actualizar(usuario, form, datos); avisar(n ? `Guardado: ${n} campo(s) cambiaron` : "Sin cambios"); }
      else { const r = await store.crear(usuario, datos); avisar("Servicio registrado: " + r.folio); if(onCreado) await onCreado(r, datos); }
      setForm(null);
    } catch(e){ avisar("No se pudo guardar: " + e.message, true); }
    finally { setGuardando(false); }
  };
  const tarjeta = (label, valor, color, sub) => <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" }}>
    <div style={{ ...etiqueta, marginBottom: 6 }}>{label}</div><div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 26, color }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}</div>;
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>Servicios</h1>
          <div style={{ fontSize: 13, color: MUTED }}>Todo servicio se registra aquí, llegue por Slack, correo o WhatsApp. Si no está registrado, no se hizo.</div>
        </div>
        <button onClick={() => setForm({})} style={boton(A)}>+ Registrar servicio</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        {tarjeta("Activos", k.activos, TEXT, `${k.total} registrados`)}
        {tarjeta("Sin cotizar hace más de 1 h", k.sinCotizarVencidas, k.sinCotizarVencidas ? ROSE : GREEN, k.medianaMinACotizacion !== null ? `Mediana a cotización: ${k.medianaMinACotizacion} min` : "Aún sin tiempos medidos")}
        {tarjeta("Para hoy", k.paraHoy, BLUE)}
        {tarjeta("Por facturar", k.porFacturar, VIOLET)}
        {tarjeta("Con datos PENDIENTES", k.conPendientes, k.conPendientes ? AMBER : GREEN)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {/* Dos botones y un selector, en vez de 13 botones de estado. */}
        {["Activos", "Todos"].map(e => (
          <button key={e} onClick={() => setFiltro(e)} aria-pressed={filtro === e} style={{ border: "1.5px solid " + (filtro === e ? A : BD2), background: filtro === e ? A + "14" : "#fff", color: filtro === e ? A : MUTED,
            borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{e}</button>))}
        <select aria-label="Ver por estado" value={["Activos", "Todos"].includes(filtro) ? "" : filtro} onChange={e => setFiltro(e.target.value || "Activos")} style={{ ...caja, width: "auto", padding: "6px 10px" }}>
          <option value="">Por estado…</option>
          {[...ESTADOS_SERVICIO, "Cancelada"].map(e => <option key={e} value={e}>{e}{k.porEstado[e] ? ` (${k.porEstado[e]})` : ""}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar servicio" placeholder="Buscar folio, cliente, chofer, placas…" style={{ ...caja, maxWidth: 300, marginLeft: "auto" }}/>
      </div>
      {error && <div role="alert" style={{ color: ROSE, fontSize: 13, marginBottom: 10 }}>No se pudieron leer los servicios: {error}</div>}
      <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 860 }}>
          <thead><tr>{["Folio", "Recibida", "Cliente y solicitante", "Ruta", "Fecha", "Asignación", "Precio", "Estado", ""].map(h =>
            <th key={h} style={{ textAlign: "left", padding: "11px 12px", fontSize: 10, color: MUTED, letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
          <tbody>
            {visibles.map(s => { const pend = validarServicio(s).pendientes.length; return (
              <tr key={s.id} onClick={() => setDetalleId(s.id)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setDetalleId(s.id)} style={{ borderBottom: "1px solid " + BORDER, cursor: "pointer" }}>
                <td style={{ padding: "10px 12px", fontFamily: MONO, fontWeight: 700 }}>{s.folio}</td>
                <td style={{ padding: "10px 12px" }}>{s.recibidaEn?.replace("T", " ")}<div style={{ fontSize: 11, color: MUTED }}>{s.canal}</div></td>
                <td style={{ padding: "10px 12px" }}>{s.empresa}<div style={{ fontSize: 11, color: MUTED }}>{s.solicitante}</div></td>
                <td style={{ padding: "10px 12px" }}>{resumenRuta(s)}</td>
                <td style={{ padding: "10px 12px" }}>{s.fechaServicio || <span style={{ color: AMBER, fontWeight: 700 }}>PENDIENTE</span>}</td>
                <td style={{ padding: "10px 12px" }}>{s.unidadPlaca || "—"}<div style={{ fontSize: 11, color: MUTED }}>{s.choferNombre || s.proveedor || ""}</div></td>
                <td style={{ padding: "10px 12px", fontFamily: MONO }}>{s.precio ? dinero(s.precio) : <span style={{ color: MUTED }}>{s.precioPropuesto ? dinero(s.precioPropuesto) + " prop." : "—"}</span>}</td>
                <td style={{ padding: "10px 12px" }}><Chip color={COLOR_ESTADO[s.estado] || MUTED}>{s.estado}</Chip>{pend > 0 && <div style={{ fontSize: 10, color: AMBER, fontWeight: 700, marginTop: 3 }}>{pend} pendiente(s)</div>}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}><button onClick={e => { e.stopPropagation(); setDetalleId(s.id); }} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34 }}>Abrir</button></td>
              </tr>); })}
            {!cargando && visibles.length === 0 && <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: MUTED }}>{lista.length === 0 ? "Aún no hay servicios registrados. Registra el primero." : "Ningún servicio coincide con el filtro."}</td></tr>}
            {cargando && <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: MUTED }}>Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
      {form && <Dialogo titulo={form.id ? "Editar " + form.folio : form.solicitudFolio ? "Registrar servicio de " + form.solicitudFolio : "Registrar servicio"} onClose={() => setForm(null)}>
        <Formulario inicial={form} clientes={clientes} choferes={choferes} unidades={unidades} puntos={puntos} proveedores={proveedores} onGuardar={guardar} onClose={() => setForm(null)} guardando={guardando}/></Dialogo>}
      {detalle && !form && <Detalle s={detalle} store={store} usuario={usuario} unidades={unidades} choferesApp={choferesApp} despacho={despacho} avisar={avisar} onClose={() => setDetalleId(null)} onEditar={() => setForm(detalle)}/>}
      {aviso && <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: aviso.mal ? ROSE : TEXT, color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 600, zIndex: 700, maxWidth: "90vw" }}>{aviso.msg}</div>}
    </div>
  );
}
