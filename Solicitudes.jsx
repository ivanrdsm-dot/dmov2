/* SOLICITUDES · bandeja de entrada con acuse y reloj de respuesta.
   Las de correo y Slack entran solas desde el servidor; las de WhatsApp o teléfono
   se registran aquí a mano. El reloj corre en minutos hábiles hasta la primera respuesta.
   No habla con Firestore: recibe un `store` (solicitudesStore.js o uno en memoria). */
import { useEffect, useMemo, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, VIOLET, MUTED, TEXT, BORDER, BD2, DISP, MONO, ahoraLocal, fechaHora, etiqueta, caja, rejilla, boton, Campo, Chip, Seccion, Dialogo } from "./uiBasico.jsx";
import {
  ESTADOS_SOLICITUD, CANALES_SOLICITUD, META_PRIMERA_RESPUESTA_MIN,
  minutosDeRespuesta, semaforoRespuesta, kpisSolicitudes, textoDuracion, solicitudAbierta, enHorarioLaboral,
} from "./functions/lib/solicitudes.js";

const COLOR_ESTADO = { Nueva: AMBER, "En revisión": BLUE, Respondida: GREEN, Convertida: VIOLET, Descartada: MUTED };
const COLOR_SEMAFORO = { verde: GREEN, ambar: AMBER, rojo: ROSE, gris: MUTED };
const CONECTORES = [{ id: "gmail", nombre: "Correo" }, { id: "slack", nombre: "Slack" }];

function Reloj({ s, ahora }){
  const min = minutosDeRespuesta(s, ahora);
  if(s.estado === "Descartada") return <span style={{ color: MUTED }}>—</span>;
  const contestada = Number(s.primeraRespuestaEn) > 0;
  const color = COLOR_SEMAFORO[semaforoRespuesta(min)];
  return <span style={{ fontFamily: MONO, fontWeight: 700, color }} title={contestada ? "Tiempo hábil hasta la primera respuesta" : "Tiempo hábil sin responder"}>
    {contestada ? "✓ " : "⏱ "}{textoDuracion(min)}</span>;
}

function Nueva({ onGuardar, onClose, guardando }){
  const [f, setF] = useState({ canal: "WhatsApp", recibidaEn: ahoraLocal(), remitenteNombre: "", remitenteContacto: "", asunto: "", texto: "" });
  const [intento, setIntento] = useState(false);
  const s = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const falta = [!f.remitenteNombre.trim() && "Quién la pidió", !f.texto.trim() && "Qué pidió", !f.recibidaEn && "Cuándo llegó"].filter(Boolean);
  return (
    <form onSubmit={e => { e.preventDefault(); setIntento(true); if(!falta.length) onGuardar(f); }}>
      <div style={rejilla}>
        <Campo label="Canal *" opciones={[...CANALES_SOLICITUD]} value={f.canal} onChange={s("canal")}/>
        <Campo label="Recibida el *" type="datetime-local" value={f.recibidaEn} max={ahoraLocal()} onChange={s("recibidaEn")}/>
        <Campo label="Quién la pidió *" value={f.remitenteNombre} onChange={s("remitenteNombre")}/>
        <Campo label="Su correo o teléfono" value={f.remitenteContacto} onChange={s("remitenteContacto")}/>
      </div>
      <div style={{ marginTop: 12 }}><Campo label="Asunto" value={f.asunto} onChange={s("asunto")} placeholder="Camioneta a Puebla el jueves"/></div>
      <div style={{ marginTop: 12 }}><Campo label="Qué pidió, tal como lo escribió o lo dijo *" area value={f.texto} onChange={s("texto")} style={{ minHeight: 130 }}/></div>
      {intento && falta.length > 0 && <div role="alert" style={{ color: ROSE, fontSize: 13, marginTop: 10 }}><b>Falta:</b> {falta.join(" · ")}</div>}
      <p style={{ fontSize: 12, color: MUTED }}>Las solicitudes de correo entran solas. Usa este formulario para WhatsApp, teléfono o en persona.</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onClose} style={boton(MUTED, false)}>Cancelar</button>
        <button type="submit" disabled={guardando} style={{ ...boton(A), opacity: guardando ? .6 : 1 }}>{guardando ? "Guardando…" : "Registrar pedido"}</button>
      </div>
    </form>
  );
}

function Detalle({ s, store, usuario, ahora, onClose, onCrearServicio, onCotizar, avisar }){
  const [eventos, setEventos] = useState([]);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => store.suscribirEventos(s.id, setEventos, () => setEventos([])), [s.id, store]);
  const correr = async (fn, ok) => { setOcupado(true); try { await fn(); avisar(ok); setNota(""); } catch(e){ avisar("No se pudo guardar: " + e.message, true); } finally { setOcupado(false); } };
  const abierta = solicitudAbierta(s);
  const descartar = () => { if(!nota.trim()){ avisar("Escribe por qué no es una solicitud: queda en la bitácora", true); return; } correr(() => store.cambiarEstado(usuario, s, "Descartada", nota), "Solicitud descartada"); };
  const textoEvento = e => e.tipo === "recibida" ? (e.manual ? "registró la solicitud" : "recibió la solicitud") : e.tipo === "acuse_enviado" ? "envió el acuse con folio"
    : e.tipo === "respondida" ? "registró la primera respuesta" : e.tipo === "convertida" ? `la convirtió en el servicio ${e.servicioFolio}` : `cambió de ${e.de} a ${e.a}`;
  return (
    <Dialogo titulo={`${s.folio} · ${s.remitenteNombre || s.remitenteCorreo || "Sin remitente"}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <Chip color={COLOR_ESTADO[s.estado] || MUTED}>{s.estado}</Chip>
        <Reloj s={s} ahora={ahora}/>
        <span style={{ fontSize: 12, color: MUTED }}>{s.canal} · recibida {fechaHora(s.recibidaEn)}{!enHorarioLaboral(s.recibidaEn) ? " · fuera de horario" : ""}
          {s.acuseEnviadoEn ? ` · acuse enviado ${fechaHora(s.acuseEnviadoEn)}` : s.origen === "conector" ? (s.automatico ? " · sin acuse: remitente automático" : " · acuse pendiente") : ""}</span>
      </div>
      <Seccion titulo="Mensaje original">
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{s.remitenteNombre}{s.remitenteCorreo ? ` · ${s.remitenteCorreo}` : ""}</div>
        {s.asunto && <div style={{ fontWeight: 700, marginBottom: 8 }}>{s.asunto}</div>}
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.5, maxHeight: 320, overflowY: "auto", background: "#f8fafc", border: "1px solid " + BORDER, borderRadius: 10, padding: 12 }}>{s.texto || "Sin texto."}</div>
        {s.textoTruncado && <div style={{ fontSize: 12, color: AMBER, marginTop: 6 }}>El mensaje era más largo; aquí se muestran los primeros 20,000 caracteres. El original está en el correo.</div>}
        {(s.adjuntos || []).length > 0 && <div style={{ fontSize: 13, marginTop: 10 }}><span style={etiqueta}>Adjuntos en el correo</span>{s.adjuntos.map((a, i) => <div key={i}>{a.nombre} <span style={{ color: MUTED }}>· {Math.max(1, Math.round((a.tamano || 0) / 1024))} KB</span></div>)}</div>}
      </Seccion>
      <Seccion titulo="Qué sigue">
        {s.cotizacionFolio && <div style={{ fontSize: 14, marginBottom: 8 }}>Cotización <b style={{ fontFamily: MONO }}>{s.cotizacionFolio}</b>.</div>}
        {s.servicioFolio ? <div style={{ fontSize: 14 }}>Convertida en el servicio <b style={{ fontFamily: MONO }}>{s.servicioFolio}</b>.</div> : <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {onCotizar && <button onClick={() => onCotizar(s)} disabled={ocupado || s.estado === "Descartada"} style={boton(A)}>{s.cotizacionFolio ? "Cotizar de nuevo" : "Cotizar"}</button>}
            <button onClick={() => onCrearServicio(s)} disabled={ocupado || s.estado === "Descartada"} style={boton(A, !onCotizar)}>Crear servicio</button>
            {!s.primeraRespuestaEn && s.estado !== "Descartada" && <button onClick={() => correr(() => store.marcarRespondida(usuario, s, nota), "Primera respuesta registrada: el reloj se detuvo")} disabled={ocupado} style={boton(GREEN)}>Ya le respondí</button>}
            {s.estado === "Nueva" && <button onClick={() => correr(() => store.cambiarEstado(usuario, s, "En revisión", nota), "En revisión")} disabled={ocupado} style={boton(BLUE, false)}>La estoy revisando</button>}
            {abierta && <button onClick={descartar} disabled={ocupado} style={boton(MUTED, false)}>No es una solicitud</button>}
            {s.estado === "Descartada" && usuario.rol === "admin" && <button onClick={() => correr(() => store.cambiarEstado(usuario, s, "Nueva", nota || "Reabierta"), "Solicitud reabierta")} disabled={ocupado} style={boton(BLUE, false)}>Reabrir</button>}
          </div>
          <div style={{ marginTop: 12 }}><Campo label="Nota o motivo (queda en la bitácora)" area value={nota} onChange={e => setNota(e.target.value)}/></div>
          <p style={{ fontSize: 12, color: MUTED, margin: "8px 0 0" }}>Si contestas por correo en el mismo hilo, el reloj se detiene solo.</p>
        </>}
      </Seccion>
      <Seccion titulo="Bitácora">
        {eventos.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Sin eventos.</div> : eventos.map(e => (
          <div key={e.id} style={{ fontSize: 13, padding: "7px 0", borderBottom: "1px solid " + BORDER }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{fechaHora(e.ts)}</span> · <b>{e.actorNombre || e.actorUid}</b> {textoEvento(e)}
            {(e.motivo || e.nota) && <span style={{ color: MUTED }}> · {e.motivo || e.nota}</span>}
          </div>))}
      </Seccion>
    </Dialogo>
  );
}

export default function Solicitudes({ store, usuario, onCrearServicio, onCotizar = null }){
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [conectores, setConectores] = useState({});
  const [filtro, setFiltro] = useState("Abiertas");
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState(false);
  const [detalleId, setDetalleId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => store.suscribir(x => { setLista(x); setCargando(false); setError(""); }, e => { setError(e.message); setCargando(false); }), [store]);
  useEffect(() => store.suscribirConectores(setConectores), [store]);
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 20000); return () => clearInterval(t); }, []);
  useEffect(() => { if(!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t); }, [aviso]);
  const avisar = (msg, mal = false) => setAviso({ msg, mal });
  const k = useMemo(() => kpisSolicitudes(lista, ahora), [lista, ahora]);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lista.filter(s => (filtro === "Todas" || (filtro === "Abiertas" ? solicitudAbierta(s) : s.estado === filtro))
      && (!t || [s.folio, s.remitenteNombre, s.remitenteCorreo, s.asunto, s.servicioFolio].join(" ").toLowerCase().includes(t)));
  }, [lista, filtro, q]);
  const detalle = lista.find(s => s.id === detalleId) || null;
  const registrar = async datos => {
    setGuardando(true);
    try { const r = await store.crearManual(usuario, datos); avisar("Solicitud registrada: " + r.folio); setNueva(false); }
    catch(e){ avisar("No se pudo guardar: " + e.message, true); }
    finally { setGuardando(false); }
  };
  const tarjeta = (label, valor, color, sub) => <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" }}>
    <div style={{ ...etiqueta, marginBottom: 6 }}>{label}</div><div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 26, color }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}</div>;
  const estadoConector = c => { const u = conectores[c.id]?.ultimoLatido; if(!u) return { color: MUTED, texto: "sin conectar" };
    const min = Math.round((ahora - u) / 60000); return min <= 5 ? { color: GREEN, texto: "activo" } : { color: ROSE, texto: `sin señal hace ${textoDuracion(min)}` }; };
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>Pedidos</h1>
          <div style={{ fontSize: 13, color: MUTED }}>Todo lo que nos piden llega aquí. Hay que contestar cada pedido en menos de {META_PRIMERA_RESPUESTA_MIN} minutos (en horario de oficina).</div>
        </div>
        <button onClick={() => setNueva(true)} style={boton(A)}>+ Registrar pedido</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }} aria-label="Estado de los conectores">
        {CONECTORES.map(c => { const e = estadoConector(c); return <Chip key={c.id} color={e.color}>{c.nombre}: {e.texto}</Chip>; })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        {tarjeta("Sin contestar", k.sinResponder, k.sinResponder ? AMBER : GREEN)}
        {tarjeta(`Llevan más de ${META_PRIMERA_RESPUESTA_MIN} min sin contestar`, k.fueraDeMeta, k.fueraDeMeta ? ROSE : GREEN)}
        {tarjeta("Tiempo normal en contestar", textoDuracion(k.medianaMin), TEXT, k.respondidas ? `${k.respondidas} respondidas` : "Aún sin respuestas medidas")}
        {tarjeta(`Contestados a tiempo`, k.pctDentroDeMeta === null ? "—" : k.pctDentroDeMeta + " %", k.pctDentroDeMeta !== null && k.pctDentroDeMeta < 80 ? AMBER : GREEN)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {["Abiertas", "Todas", ...ESTADOS_SOLICITUD].map(e => (
          <button key={e} onClick={() => setFiltro(e)} aria-pressed={filtro === e} style={{ border: "1.5px solid " + (filtro === e ? A : BD2), background: filtro === e ? A + "14" : "#fff", color: filtro === e ? A : MUTED,
            borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{e}</button>))}
        <input value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar solicitud" placeholder="Buscar folio, persona, asunto…" style={{ ...caja, maxWidth: 300, marginLeft: "auto" }}/>
      </div>
      {error && <div role="alert" style={{ color: ROSE, fontSize: 13, marginBottom: 10 }}>No se pudieron leer las solicitudes: {error}</div>}
      <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
          <thead><tr>{["Folio", "Recibida", "De", "Asunto", "Reloj", "Estado", ""].map(h =>
            <th key={h} style={{ textAlign: "left", padding: "11px 12px", fontSize: 10, color: MUTED, letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
          <tbody>
            {visibles.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid " + BORDER }}>
                <td style={{ padding: "10px 12px", fontFamily: MONO, fontWeight: 700 }}>{s.folio}</td>
                <td style={{ padding: "10px 12px" }}>{fechaHora(s.recibidaEn)}<div style={{ fontSize: 11, color: MUTED }}>{s.canal}</div></td>
                <td style={{ padding: "10px 12px" }}>{s.remitenteNombre || "—"}<div style={{ fontSize: 11, color: MUTED }}>{s.remitenteCorreo}</div></td>
                <td style={{ padding: "10px 12px", maxWidth: 340 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.asunto || (s.texto || "").slice(0, 80) || "—"}</div>
                  {s.servicioFolio && <div style={{ fontSize: 11, color: VIOLET, fontWeight: 700 }}>{s.servicioFolio}</div>}</td>
                <td style={{ padding: "10px 12px" }}><Reloj s={s} ahora={ahora}/></td>
                <td style={{ padding: "10px 12px" }}><Chip color={COLOR_ESTADO[s.estado] || MUTED}>{s.estado}</Chip></td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}><button onClick={() => setDetalleId(s.id)} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34 }}>Abrir</button></td>
              </tr>))}
            {!cargando && visibles.length === 0 && <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: MUTED }}>{lista.length === 0 ? "Aún no hay pedidos. Los que llegan por correo entran solos; los demás se registran con el botón." : "Ninguna solicitud coincide con el filtro."}</td></tr>}
            {cargando && <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: MUTED }}>Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
      {nueva && <Dialogo titulo="Registrar pedido" onClose={() => setNueva(false)}><Nueva onGuardar={registrar} onClose={() => setNueva(false)} guardando={guardando}/></Dialogo>}
      {detalle && <Detalle s={detalle} store={store} usuario={usuario} ahora={ahora} avisar={avisar} onClose={() => setDetalleId(null)} onCrearServicio={x => { setDetalleId(null); onCrearServicio(x); }} onCotizar={onCotizar ? x => { setDetalleId(null); onCotizar(x); } : null}/>}
      {aviso && <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: aviso.mal ? ROSE : TEXT, color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 600, zIndex: 700, maxWidth: "90vw" }}>{aviso.msg}</div>}
    </div>
  );
}
