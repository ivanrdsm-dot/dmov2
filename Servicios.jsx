/* SERVICIOS · alta manual (Fase 0). Todo servicio del grupo se registra aquí:
   quién lo pidió, por dónde llegó, qué se mueve, quién lo ejecuta y en qué estado va.
   No habla con Firestore: recibe un `store` (serviciosStore.js o uno en memoria). */
import { useEffect, useMemo, useState } from "react";
import {
  ESTADOS_SERVICIO, CANALES_SOLICITUD, TIPOS_ASIGNACION,
  validarServicio, evaluarCambioEstado, kpisServicios, resumenRuta, minutosACotizacion,
} from "./servicios.ts";

const A = "#f97316", BLUE = "#2563eb", GREEN = "#059669", ROSE = "#e11d48", AMBER = "#d97706", VIOLET = "#7c3aed";
const MUTED = "#607080", TEXT = "#0c1829", BORDER = "#e8eef6", BD2 = "#d2dcea";
const DISP = "'Bricolage Grotesque',sans-serif", MONO = "'JetBrains Mono',monospace";
const COLOR_ESTADO = { Solicitud: AMBER, Cotizada: BLUE, Confirmada: VIOLET, Asignada: VIOLET, "En ruta": A, Entregada: GREEN,
  Cerrada: GREEN, Conciliada: GREEN, Facturada: MUTED, Cobrada: MUTED, Cancelada: ROSE };

const p2 = n => String(n).padStart(2, "0");
const ahoraLocal = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const dinero = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 2 }) : "—"; };
const fechaHora = ms => ms ? new Date(ms).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const VACIO = () => ({
  canal: "", recibidaEn: ahoraLocal(), empresa: "", clienteId: "", plan: "", centroCostos: "", solicitante: "", solicitanteContacto: "",
  fechaServicio: "", horaServicio: "", origenes: [{ nombre: "", direccion: "", contacto: "", telefono: "" }],
  destinos: [{ nombre: "", direccion: "", contacto: "", telefono: "" }],
  mercancia: "", cajas: "", tarimas: "", pesoKg: "", volumenM3: "", maniobras: "", valorDeclarado: "", requisitos: "",
  cotizacionFolio: "", precioPropuesto: "", confirmadoPor: "", asignacionTipo: "", unidadPlaca: "", choferNombre: "", proveedor: "",
  receptor: "", notas: "",
});

const etiqueta = { fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 5, letterSpacing: "0.07em", textTransform: "uppercase", display: "block" };
const caja = { width: "100%", background: "#fff", border: "1.5px solid " + BD2, borderRadius: 10, padding: "10px 13px", fontSize: 14, fontFamily: "inherit", color: TEXT, boxSizing: "border-box" };
const rejilla = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 };
const boton = (color, lleno = true) => ({ background: lleno ? color : "#fff", color: lleno ? "#fff" : color, border: "1.5px solid " + color, borderRadius: 10,
  padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 42 });

function Campo({ label, lista, opciones, area, ...p }){
  const id = "srv-" + label.replace(/[^a-z0-9]/gi, "-").toLowerCase() + (p.name ? "-" + p.name : "");
  return (
    <label style={{ display: "block" }}>
      <span style={etiqueta}>{label}</span>
      {opciones ? <select {...p} style={caja}>{opciones.map(o => <option key={o} value={o}>{o || "— Elegir —"}</option>)}</select>
        : area ? <textarea {...p} style={{ ...caja, minHeight: 70, resize: "vertical" }}/>
        : <input {...p} list={lista ? id + "-l" : undefined} style={caja}/>}
      {lista && <datalist id={id + "-l"}>{lista.map(o => <option key={o} value={o}/>)}</datalist>}
    </label>
  );
}
const Chip = ({ color, children }) => <span style={{ display: "inline-block", background: color + "16", color, border: "1px solid " + color + "40",
  borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
const Seccion = ({ titulo, children }) => <fieldset style={{ border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px", margin: "0 0 14px" }}>
  <legend style={{ fontFamily: DISP, fontWeight: 700, fontSize: 13, padding: "0 6px" }}>{titulo}</legend>{children}</fieldset>;

function Dialogo({ titulo, onClose, children }){
  useEffect(() => { const h = e => { if(e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(12,24,41,.45)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 12, overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 860, margin: "20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid " + BORDER, position: "sticky", top: 0, background: "#fff", borderRadius: "18px 18px 0 0", zIndex: 2 }}>
          <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 16, flex: 1 }}>{titulo}</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ ...boton(MUTED, false), padding: "6px 12px", minHeight: 34 }}>Cerrar</button>
        </div>
        <div style={{ padding: "18px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

function Puntos({ titulo, puntos, onChange }){
  const set = (i, k, v) => onChange(puntos.map((p, j) => j === i ? { ...p, [k]: v } : p));
  return (
    <Seccion titulo={titulo}>
      {puntos.map((p, i) => (
        <div key={i} style={{ ...rejilla, marginBottom: 10, paddingBottom: 10, borderBottom: i < puntos.length - 1 ? "1px dashed " + BD2 : "none" }}>
          <Campo label="Nombre del lugar" name={titulo + i} value={p.nombre || ""} onChange={e => set(i, "nombre", e.target.value)} placeholder="Bodega, tienda, CEDIS"/>
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

function Formulario({ inicial, clientes, choferes, unidades, onGuardar, onClose, guardando }){
  const [f, setF] = useState(() => ({ ...VACIO(), ...inicial }));
  const [intento, setIntento] = useState(false);
  const s = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const v = validarServicio(f);
  const empresas = useMemo(() => [...new Set(clientes.map(c => c.empresa || c.nombre).filter(Boolean))].sort(), [clientes]);
  const elegirEmpresa = e => { const val = e.target.value; const c = clientes.find(x => (x.empresa || x.nombre) === val); setF(x => ({ ...x, empresa: val, clienteId: c ? c.id : "" })); };
  const planes = clientes.find(c => c.id === f.clienteId)?.planes || [];
  return (
    <form onSubmit={e => { e.preventDefault(); setIntento(true); if(v.ok) onGuardar(f); }}>
      <Seccion titulo="Cómo llegó la solicitud">
        <div style={rejilla}>
          <Campo label="Canal *" opciones={["", ...CANALES_SOLICITUD]} value={f.canal} onChange={s("canal")}/>
          <Campo label="Recibida el *" type="datetime-local" value={f.recibidaEn} onChange={s("recibidaEn")}/>
          <Campo label="Empresa o cliente *" lista={empresas} value={f.empresa} onChange={elegirEmpresa} placeholder="Escribe o elige"/>
          <Campo label="Plan" lista={planes.map(String)} value={f.plan} onChange={s("plan")}/>
          <Campo label="Centro de costos" value={f.centroCostos} onChange={s("centroCostos")}/>
          <Campo label="Quién solicita *" value={f.solicitante} onChange={s("solicitante")}/>
          <Campo label="Correo o teléfono de quien solicita" value={f.solicitanteContacto} onChange={s("solicitanteContacto")}/>
        </div>
      </Seccion>
      <Puntos titulo="Orígenes · dónde se carga" puntos={f.origenes} onChange={x => setF(y => ({ ...y, origenes: x }))}/>
      <Puntos titulo="Destinos · dónde se entrega" puntos={f.destinos} onChange={x => setF(y => ({ ...y, destinos: x }))}/>
      <Seccion titulo="Fecha y carga">
        <div style={rejilla}>
          <Campo label="Fecha del servicio" type="date" value={f.fechaServicio} onChange={s("fechaServicio")}/>
          <Campo label="Hora o ventana" value={f.horaServicio} onChange={s("horaServicio")} placeholder="8:00 a 10:00"/>
          <Campo label="Tipo de mercancía" value={f.mercancia} onChange={s("mercancia")}/>
          <Campo label="Cajas" inputMode="numeric" value={f.cajas} onChange={s("cajas")}/>
          <Campo label="Tarimas" inputMode="numeric" value={f.tarimas} onChange={s("tarimas")}/>
          <Campo label="Peso (kg)" inputMode="decimal" value={f.pesoKg} onChange={s("pesoKg")}/>
          <Campo label="Volumen (m³)" inputMode="decimal" value={f.volumenM3} onChange={s("volumenM3")}/>
          <Campo label="Maniobras" value={f.maniobras} onChange={s("maniobras")} placeholder="Carga, descarga, ayudantes"/>
          <Campo label="Valor declarado (MXN)" inputMode="decimal" value={f.valorDeclarado} onChange={s("valorDeclarado")}/>
        </div>
        <div style={{ marginTop: 12 }}><Campo label="Requisitos especiales" area value={f.requisitos} onChange={s("requisitos")} placeholder="Cita en CEDIS, EPP, horario de acceso"/></div>
      </Seccion>
      <Seccion titulo="Cotización y asignación">
        <div style={rejilla}>
          <Campo label="Folio de cotización" value={f.cotizacionFolio} onChange={s("cotizacionFolio")} placeholder="COT-2026-…"/>
          <Campo label="Precio propuesto sin IVA" inputMode="decimal" value={f.precioPropuesto} onChange={s("precioPropuesto")}/>
          <Campo label="Quién confirmó por el cliente" value={f.confirmadoPor} onChange={s("confirmadoPor")}/>
          <Campo label="Tipo de asignación" opciones={["", ...TIPOS_ASIGNACION]} value={f.asignacionTipo} onChange={s("asignacionTipo")}/>
          {f.asignacionTipo === "Proveedor externo" && <Campo label="Proveedor" value={f.proveedor} onChange={s("proveedor")}/>}
          <Campo label="Placas de la unidad" lista={unidades.map(u => u.placa).filter(Boolean)} value={f.unidadPlaca} onChange={s("unidadPlaca")}/>
          <Campo label="Chofer" lista={choferes.map(c => c.nombre).filter(Boolean)} value={f.choferNombre} onChange={s("choferNombre")}/>
          <Campo label="Quién recibió" value={f.receptor} onChange={s("receptor")}/>
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

function Detalle({ s, store, usuario, onEditar, onClose, avisar }){
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
        <button onClick={onEditar} style={{ ...boton(BLUE, false), marginLeft: "auto" }}>Editar datos</button>
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
      <Seccion titulo="Cotización y asignación">
        <div style={rejilla}>{dato("Folio de cotización", s.cotizacionFolio)}{dato("Precio propuesto", s.precioPropuesto ? dinero(s.precioPropuesto) : "")}
          {dato("Precio aprobado", s.precio ? `${dinero(s.precio)} · ${s.precioAprobadoPor || ""}` : "")}{dato("Confirmó el cliente", s.confirmadoPor)}
          {dato("Asignación", [s.asignacionTipo, s.proveedor].filter(Boolean).join(" · "))}{dato("Unidad y chofer", [s.unidadPlaca, s.choferNombre].filter(Boolean).join(" · "))}{dato("Recibió", s.receptor)}</div>
        {esAdmin && <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ flex: "1 1 180px" }}><Campo label="Precio aprobado sin IVA" inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)}/></div>
          <button onClick={aprobar} disabled={ocupado} style={boton(GREEN)}>Aprobar precio</button></div>}
      </Seccion>
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
            {e.tipo === "creado" ? "registró el servicio" : e.tipo === "estado" ? `cambió de ${e.de} a ${e.a}` : e.tipo === "precio_aprobado" ? `aprobó el precio ${dinero(e.cambios?.[0]?.despues)}` : `editó ${(e.cambios || []).map(c => c.campo).join(", ")}`}
            {e.excepcion && <span style={{ color: ROSE }}> · sin {e.faltantes.join(", ")}</span>}{e.motivo && <span style={{ color: MUTED }}> · Motivo: {e.motivo}</span>}
          </div>))}
      </Seccion>
    </Dialogo>
  );
}

export default function Servicios({ store, usuario, clientes = [], choferes = [] }){
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [unidades, setUnidades] = useState([]);
  const [filtro, setFiltro] = useState("Activos");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);       // null | {} nuevo | servicio a editar
  const [detalleId, setDetalleId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  useEffect(() => store.suscribir(x => { setLista(x); setCargando(false); setError(""); }, e => { setError(e.message); setCargando(false); }), [store]);
  useEffect(() => store.suscribirCatalogo("unidades", setUnidades), [store]);
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
      else { const r = await store.crear(usuario, datos); avisar("Servicio registrado: " + r.folio); }
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
        {["Activos", "Todos", ...ESTADOS_SERVICIO, "Cancelada"].map(e => (
          <button key={e} onClick={() => setFiltro(e)} aria-pressed={filtro === e} style={{ border: "1.5px solid " + (filtro === e ? A : BD2), background: filtro === e ? A + "14" : "#fff", color: filtro === e ? A : MUTED,
            borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{e}{k.porEstado[e] ? ` · ${k.porEstado[e]}` : ""}</button>))}
        <input value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar servicio" placeholder="Buscar folio, cliente, chofer, placas…" style={{ ...caja, maxWidth: 300, marginLeft: "auto" }}/>
      </div>
      {error && <div role="alert" style={{ color: ROSE, fontSize: 13, marginBottom: 10 }}>No se pudieron leer los servicios: {error}</div>}
      <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 860 }}>
          <thead><tr>{["Folio", "Recibida", "Cliente y solicitante", "Ruta", "Fecha", "Asignación", "Precio", "Estado", ""].map(h =>
            <th key={h} style={{ textAlign: "left", padding: "11px 12px", fontSize: 10, color: MUTED, letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
          <tbody>
            {visibles.map(s => { const pend = validarServicio(s).pendientes.length; return (
              <tr key={s.id} style={{ borderBottom: "1px solid " + BORDER }}>
                <td style={{ padding: "10px 12px", fontFamily: MONO, fontWeight: 700 }}>{s.folio}</td>
                <td style={{ padding: "10px 12px" }}>{s.recibidaEn?.replace("T", " ")}<div style={{ fontSize: 11, color: MUTED }}>{s.canal}</div></td>
                <td style={{ padding: "10px 12px" }}>{s.empresa}<div style={{ fontSize: 11, color: MUTED }}>{s.solicitante}</div></td>
                <td style={{ padding: "10px 12px" }}>{resumenRuta(s)}</td>
                <td style={{ padding: "10px 12px" }}>{s.fechaServicio || <span style={{ color: AMBER, fontWeight: 700 }}>PENDIENTE</span>}</td>
                <td style={{ padding: "10px 12px" }}>{s.unidadPlaca || "—"}<div style={{ fontSize: 11, color: MUTED }}>{s.choferNombre || s.proveedor || ""}</div></td>
                <td style={{ padding: "10px 12px", fontFamily: MONO }}>{s.precio ? dinero(s.precio) : <span style={{ color: MUTED }}>{s.precioPropuesto ? dinero(s.precioPropuesto) + " prop." : "—"}</span>}</td>
                <td style={{ padding: "10px 12px" }}><Chip color={COLOR_ESTADO[s.estado] || MUTED}>{s.estado}</Chip>{pend > 0 && <div style={{ fontSize: 10, color: AMBER, fontWeight: 700, marginTop: 3 }}>{pend} pendiente(s)</div>}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}><button onClick={() => setDetalleId(s.id)} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34 }}>Abrir</button></td>
              </tr>); })}
            {!cargando && visibles.length === 0 && <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: MUTED }}>{lista.length === 0 ? "Aún no hay servicios registrados. Registra el primero." : "Ningún servicio coincide con el filtro."}</td></tr>}
            {cargando && <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: MUTED }}>Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
      {form && <Dialogo titulo={form.id ? "Editar " + form.folio : "Registrar servicio"} onClose={() => setForm(null)}>
        <Formulario inicial={form} clientes={clientes} choferes={choferes} unidades={unidades} onGuardar={guardar} onClose={() => setForm(null)} guardando={guardando}/></Dialogo>}
      {detalle && !form && <Detalle s={detalle} store={store} usuario={usuario} avisar={avisar} onClose={() => setDetalleId(null)} onEditar={() => setForm(detalle)}/>}
      {aviso && <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: aviso.mal ? ROSE : TEXT, color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 600, zIndex: 700, maxWidth: "90vw" }}>{aviso.msg}</div>}
    </div>
  );
}
