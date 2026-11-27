/* OPERACIÓN · UNA sola sección para todo lo de choferes y rutas (la plataforma de Ilse y el
   "ojo de águila" del director): Ahora · Asignar ruta · Rutas y paradas · Mapa en vivo · Asistencia ·
   Alertas · Choferes · Gastos · Historial. Los módulos que viven en App.jsx llegan por `vistas`.
   Ilse (operaciones) VE lo operativo: choferes, asistencia con fotos y ubicación, rutas y paradas y alertas.
   NO ve números ni finanzas: gastos, montos e incentivos son solo del director (también lo bloquea el servidor).
   No puede cambiar ni borrar esos registros (lo impiden las reglas del servidor): solo el director (admin)
   da por atendida una alerta. Link directo: /operacion */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, limit, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, caja, boton, Chip, dinero } from "./uiBasico.jsx";
import Evidencias, { Miniatura } from "./Evidencias.jsx";
import { resumenOperacion } from "./operacion.ts";
import { correoDeChofer, telefono10 } from "./lugares.ts";

const AsignarRuta = lazy(() => import("./AsignarRuta.jsx"));
const HistorialRutas = lazy(() => import("./HistorialRutas.jsx"));
const Desempeno = lazy(() => import("./Desempeno.jsx"));
const Auditoria = lazy(() => import("./Auditoria.jsx"));
const TableroVivo = lazy(() => import("./TableroVivo.jsx"));
const ReporteDia = lazy(() => import("./ReporteDia.jsx"));
const ClaveApp = lazy(() => import("./ClaveApp.jsx"));
import { NATIVO } from "./nativo.js";
/* Alertas que traen montos ($): solo las ve el director. */
const ALERTAS_CON_MONTOS = ["gasto_dudoso", "cotizacion_por_aprobar", "resumen_diario"];
const PESTANAS = ["tablero", "reporte", "ahora", "asignar", "rutas", "mapa", "asistencia", "alertas", "choferes", "gastos", "historial", "desempeno", "auditoria"];
const Cargando = () => <div style={{ padding: 40, color: MUTED }}>Cargando…</div>;

/* 📲 Acceso del chofer a su app (solo director): crea/renueva su cuenta y abre WhatsApp con su enlace. */
function BotonAcceso({ chofer, app }){
  const [estado, setEstado] = useState("");
  const tel = telefono10(chofer.tel || chofer.telefono || "");
  if(tel.length !== 10) return <span style={{ fontSize: 12, color: AMBER }}>Falta celular</span>;
  const mandar = async () => {
    setEstado("…");
    try {
      const { data } = await httpsCallable(getFunctions(app, "us-central1"), "oficinaVincularChofer")({ choferId: chofer.id, correo: correoDeChofer(tel) });
      const pila = String(chofer.nombre || "").replace(/^jose\s+/i, "").split(/\s+/)[0] || "";
      const texto = `Hola ${pila}, soy de D Movimiento. Ya tienes tu cuenta en la app de choferes.\n\n1) Abre este enlace y crea tu contraseña (sirve 7 días):\n${data.enlace}\n\n2) Las siguientes veces entras aquí con tu celular ${tel} y tu contraseña:\nhttps://salesflow-crm-13c4a.web.app/chofer`;
      window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      setEstado("✓ Abrí WhatsApp");
    } catch(e){ setEstado("No se pudo: " + String(e?.message || "").replace(/^.*?:\s*/, "")); }
  };
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
    <button onClick={mandar} style={{ ...boton(GREEN, false), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>📲 {chofer.authUid ? "Reenviar acceso" : "Mandar acceso"}</button>
    {estado && <span style={{ fontSize: 11, color: estado.startsWith("No") ? ROSE : MUTED }}>{estado}</span>}</span>;
}

/* Mapita con el punto exacto (Mapbox) y la dirección; al tocarlo abre Google Maps en ese lugar. */
function MapaPunto({ token, punto, titulo, lugar, hora: h }){
  const ok = Number.isFinite(Number(punto?.lat)) && Number.isFinite(Number(punto?.lng));
  if(!ok) return null;
  const { lat, lng } = punto;
  const img = token ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+f27b13(${lng},${lat})/${lng},${lat},15/240x184@2x?access_token=${token}` : "";
  return <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" title={`${titulo}: ${lugar || `${lat}, ${lng}`}`}
    style={{ flex: "none", width: 160, textDecoration: "none", color: TEXT, border: "1px solid " + BORDER, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
    {img ? <img src={img} alt={`Mapa de ${titulo.toLowerCase()}`} style={{ width: 160, height: 92, objectFit: "cover", display: "block" }}/> : <div style={{ height: 92, display: "grid", placeItems: "center", background: "#f1f5f9" }}>📍</div>}
    <div style={{ padding: "5px 7px", fontSize: 11, lineHeight: 1.3 }}><b>📍 {titulo}{h ? " · " + h : ""}</b><div style={{ color: MUTED }}>{lugar || `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`}</div></div>
  </a>;
}

const hoyCDMX = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const ms = v => v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0;
/* "2026-11-27" → "jue 27 nov" (para que se lea de un vistazo). */
const diaBonito = f => { const d = /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) ? new Date(f + "T12:00:00") : null;
  return d ? d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "") : String(f || "sin fecha"); };
const hora = v => { const t = ms(v); return t ? new Date(t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""; };
const hace = min => min === null ? "sin datos" : min < 1 ? "ahora" : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`;
const mapa = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
const tarjeta = { background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 14px" };
/* Nunca se muestra un código interno ("checkin_dudoso") ni un título vacío. */
const TITULOS_ALERTA = { sos: "SOS del chofer", checkin_dudoso: "Check-in con dudas", ubicacion_simulada: "Ubicación falsa (simulada)", velocidad_imposible: "Salto imposible de ubicación",
  reloj_adelantado: "Reloj del celular manipulado", dispositivo_no_autorizado: "Celular no autorizado", incidencia: "Incidencia en una entrega", cierre_fuera_de_punto: "Entrega cerrada fuera del punto",
  detenido: "Chofer detenido mucho tiempo", fuera_de_ruta: "Chofer fuera de ruta", sin_ubicacion: "La app del chofer no manda ubicación", sin_checkin: "Chofer con ruta y sin check-in",
  sin_checkout: "Jornada sin check-out", ruta_excedida: "Ruta foránea pasada de días", cambio_sin_enterado: "El chofer no ha confirmado un cambio de ruta",
  fuera_de_cdmx: "Chofer fuera de CDMX sin ruta", km_no_coinciden: "Kilómetros no coinciden con el GPS", unidad_no_coincide: "El chofer usa otra camioneta", gasto_dudoso: "Gasto o gasolina que no cuadra",
  solicitud_sin_respuesta: "Solicitud sin responder", cotizacion_por_aprobar: "Cotización por aprobar" };
const tituloAlerta = a => String(a?.titulo || "").trim() || TITULOS_ALERTA[a?.type] || "Alerta";
const COLOR_ASIS = { "Trabajando": GREEN, "Terminó": BLUE, "Faltó": ROSE, "Sin ruta hoy": MUTED, "Por llegar": AMBER, "Descansando (foránea)": BLUE };

/* 🔔 Avisos al celular: la persona activa en SU celular las alertas de choferes (llegan aunque el sistema esté cerrado). */
function AvisosCelular({ app }){
  const [estado, setEstado] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted" ? "listo?" : "");
  const activar = async () => {
    try {
      if(!("serviceWorker" in navigator) || !("PushManager" in window)){ setEstado("Este navegador no recibe avisos. En iPhone: Compartir → Agregar a inicio y ábrelo desde ahí."); return; }
      setEstado("Activando…");
      const llamar = httpsCallable(getFunctions(app, "us-central1"), "oficinaAvisos");
      const { data } = await llamar({ accion: "llave" });
      if(await Notification.requestPermission() !== "granted"){ setEstado("Bloqueaste los avisos. Actívalos en la configuración del navegador."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
      const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
      const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(data.vapid) });
      await llamar({ accion: "suscribir", sub: sub.toJSON() });
      setEstado("✓ Listo: te llegan las alertas a este celular.");
    } catch(e){ setEstado("No se pudo: " + String(e?.message || e).slice(0, 120)); }
  };
  return <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <button onClick={activar} style={boton(A, false)}>🔔 Recibir alertas en este celular</button>
    {estado && estado !== "listo?" && <span style={{ fontSize: 12, color: estado.startsWith("✓") ? GREEN : MUTED }}>{estado}</span>}</span>;
}

export default function OperacionHoy({ db, app, usuario, mapboxToken, vistas = {}, inicial = "", onVer, onTerminarDia = null }){
  const esAdmin = usuario?.rol === "admin";
  const [pestana, setPestanaEstado] = useState(() => {
    let t = inicial; try { t = t || new URLSearchParams(window.location.search).get("t") || ""; } catch {}
    /* Ilse (operaciones) entra directo a asignar: es lo que más hace, sobre todo desde el celular. */
    return PESTANAS.includes(t) ? t : usuario?.rol === "operaciones" ? "asignar" : "tablero";
  });
  const setPestana = t => { setPestanaEstado(t); try { const u = new URL(window.location.href); u.searchParams.set("v", "operacion"); u.searchParams.set("t", t); window.history.replaceState(null, "", u); } catch {} };
  const [verFichas, setVerFichas] = useState("");
  const [claveApp, setClaveApp] = useState(false);   // 📱 contraseña para entrar a la app nativa   // director: editar fichas de choferes o camionetas
  const [dia, setDia] = useState(hoyCDMX());
  const [choferes, setChoferes] = useState([]), [jornadas, setJornadas] = useState([]), [ubic, setUbic] = useState({});
  const [delDia, setDelDia] = useState([]), [enCurso, setEnCurso] = useState([]), [proximas, setProximas] = useState([]);
  /* Rutas de días que vienen (todas, de quien sea y con o sin chofer): que nada cargado quede fuera de la vista. */
  useEffect(() => onSnapshot(query(collection(db, "servicios"), where("fechaServicio", ">", hoyCDMX()), limit(200)),
    s => setProximas(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.estado !== "Cancelada" && !x.historico && String(x.fechaServicio) > hoyCDMX())
      .sort((a, b) => String(a.fechaServicio).localeCompare(String(b.fechaServicio)) || String(a.folio).localeCompare(String(b.folio)))), () => setProximas([])), [db]);
  const servicios = useMemo(() => [...new Map([...delDia, ...enCurso].map(x => [x.id, x])).values()], [delDia, enCurso]);
  const [alertasBase, setAlertas] = useState([]), [alertasDir, setAlertasDir] = useState([]), [gastos, setGastos] = useState([]), [abierto, setAbierto] = useState(""), [paradas, setParadas] = useState({});
  const [, setReloj] = useState(0);
  const [oficinaAsis, setOficinaAsis] = useState([]);
  useEffect(() => { const t = setInterval(() => setReloj(x => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const us = [
      onSnapshot(collection(db, "choferes"), s => setChoferes(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(collection(db, "ubicaciones"), s => setUbic(Object.fromEntries(s.docs.map(d => [d.id, d.data()]))), () => {}),
      onSnapshot(query(collection(db, "alertas"), where("atendida", "==", false), limit(300)), s => setAlertas(s.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(a => esAdmin || !ALERTAS_CON_MONTOS.includes(a.type))   // operaciones no ve montos
        .sort((a, b) => ms(b.ts || b.createdAt) - ms(a.ts || a.createdAt))), () => {}),
      ...(esAdmin ? [onSnapshot(query(collection(db, "gastosChofer"), orderBy("createdAt", "desc"), limit(300)), s => setGastos(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
        /* Alertas de auditoría (posibles engaños, check-ins con dirección): solo el director las puede leer. */
        onSnapshot(query(collection(db, "alertas_director"), where("atendida", "==", false), limit(300)), s => setAlertasDir(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})] : []),
    ];
    return () => us.forEach(u => u());
  }, [db, esAdmin]);
  useEffect(() => {
    const us = [
      onSnapshot(query(collection(db, "jornadas"), where("fecha", "==", dia)), s => setJornadas(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setJornadas([])),
      /* Entrada y salida de la oficina (Ilse): solo el director las ve. */
      ...(esAdmin ? [onSnapshot(query(collection(db, "asistencia_oficina"), where("fecha", "==", dia)), s => setOficinaAsis(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setOficinaAsis([]))] : []),
      onSnapshot(query(collection(db, "servicios"), where("fechaServicio", "==", dia), limit(300)), s => setDelDia(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.historico)), () => setDelDia([])),
      /* Rutas foráneas de varios días: siguen "En ruta" aunque su fecha sea de antes. */
    ];
    if(dia === hoyCDMX()) us.push(onSnapshot(query(collection(db, "servicios"), where("estado", "==", "En ruta"), limit(200)), s => setEnCurso(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.choferId)), () => setEnCurso([])));
    else setEnCurso([]);
    return () => us.forEach(u => u());
  }, [db, dia, esAdmin]);
  const verParadas = async id => {
    setAbierto(abierto === id ? "" : id);
    if(!paradas[id]) { const s = await getDocs(query(collection(db, "servicios", id, "paradas"), orderBy("orden"))).catch(() => null);
      setParadas(p => ({ ...p, [id]: s ? s.docs.map(d => ({ id: d.id, ...d.data() })) : [] })); }
  };
  /* Una sola lista: alertas de la operación + (solo director) las de auditoría. Cada una recuerda su colección. */
  const alertas = useMemo(() => [...alertasBase.map(a => ({ ...a, _col: "alertas" })), ...alertasDir.map(a => ({ ...a, _col: "alertas_director" }))]
    .sort((a, b) => ms(b.ts || b.createdAt) - ms(a.ts || a.createdAt)), [alertasBase, alertasDir]);
  /* Atender una alerta: la nota se escribe en la misma tarjeta (sin ventanas del navegador). */
  const [atendiendo, setAtendiendo] = useState(""), [nota, setNota] = useState(""), [errAtender, setErrAtender] = useState("");
  const atender = async a => {
    setErrAtender("");
    try {
      await updateDoc(doc(db, a._col || "alertas", a.id), { atendida: true, atendidaPor: usuario?.nombre || "", atendidaPorUid: usuario?.uid || "", atendidaEn: serverTimestamp(), notaAtencion: nota.trim() });
      setAtendiendo(""); setNota("");
    } catch(e){ setErrAtender("No se pudo guardar: " + String(e?.message || "").replace(/^.*?:\s*/, "")); }
  };

  const activos = useMemo(() => choferes.filter(c => c.status !== "Inactivo" && c.activo !== false && !c.baja), [choferes]);
  const r = resumenOperacion({ choferes: activos, jornadas, servicios: servicios.filter(x => x.choferId), ubicaciones: ubic, alertas, dia, ahoraMs: Date.now() });
  const gastosSemana = gastos.filter(g => Date.now() - ms(g.fechaTs || g.createdAt) < 7 * 86400000);

  const P = [["tablero", "📺 Tablero"], ...(esAdmin ? [["reporte", "📋 Reporte del día"]] : []), ["ahora", "👀 Ahora"], ["asignar", "🚚 Asignar ruta"], ["rutas", "🗺️ Rutas y paradas"], ["mapa", "📍 Mapa en vivo"], ["asistencia", "🕘 Asistencia"],
    ["alertas", `🚨 Alertas${alertas.length ? " (" + alertas.length + ")" : ""}`], ["choferes", "👤 Choferes"], ...(esAdmin ? [["gastos", "💵 Gastos"]] : []), ["historial", "📚 Historial"],
    ...(esAdmin ? [["desempeno", "🏆 Desempeño"], ["auditoria", "🔎 Auditoría"]] : [])];   // incentivos y auditoría: solo el director
  /* Al ir de una pestaña a otra desde dentro de un módulo (p. ej. Asignar ruta → "En vivo"). */
  const irA = v => ({ despacho: "mapa", choferes: "choferes", operacion: "ahora", historialRutas: "historial" }[v] ? setPestana({ despacho: "mapa", choferes: "choferes", operacion: "ahora", historialRutas: "historial" }[v]) : onVer?.(v));
  const embebida = pestana === "asignar" ? <Suspense fallback={<Cargando/>}><AsignarRuta db={db} app={app} usuario={usuario} mapboxToken={mapboxToken} onVer={irA}/></Suspense>
    : pestana === "historial" ? <Suspense fallback={<Cargando/>}><HistorialRutas db={db}/></Suspense>
    : pestana === "desempeno" && esAdmin ? <Suspense fallback={<Cargando/>}><Desempeno db={db} app={app}/></Suspense>
    : pestana === "auditoria" && esAdmin ? <Suspense fallback={<Cargando/>}><Auditoria db={db}/></Suspense>
    : pestana === "mapa" ? (vistas.mapa || <Cargando/>)
    : pestana === "choferes" && esAdmin && verFichas === "choferes" ? (vistas.choferes || null)
    : pestana === "choferes" && esAdmin && verFichas === "unidades" ? (vistas.unidades || null)
    : null;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "#f1f4fb" }}>
      <div style={{ padding: "14px 18px 0", background: "#fff", borderBottom: "1px solid " + BORDER }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, color: TEXT, margin: 0 }}>Operación</h1>
            <span style={{ fontSize: 13, color: MUTED }}>{esAdmin ? "Todo lo de choferes y rutas en un solo lugar." : "Asigna rutas y revisa todo; los cambios a registros los hace el director."}</span>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {onTerminarDia && <button onClick={onTerminarDia} style={boton(TEXT, false)}>🏁 Terminar mi día</button>}
              {NATIVO ? <span style={{ fontSize: 12, color: MUTED }}>Los avisos al celular llegan por Chrome</span> : <AvisosCelular app={app}/>}
              {!NATIVO && <button onClick={() => setClaveApp(true)} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>📱 Activar la app en mi celular</button>}</span>
          </div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", marginTop: 10, scrollbarWidth: "none" }}>
            {P.map(([k, l]) => <button key={k} onClick={() => { setPestana(k); setVerFichas(""); }} style={{ background: "none", border: "none", borderBottom: "3px solid " + (pestana === k ? A : "transparent"),
              color: k === "alertas" && alertas.length ? ROSE : pestana === k ? TEXT : MUTED, fontWeight: pestana === k ? 800 : 600, fontSize: 14, padding: "8px 10px 10px", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>{l}</button>)}
          </div>
        </div>
      </div>
      {embebida ? <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {pestana === "choferes" && <div style={{ padding: "8px 18px", background: "#fff", borderBottom: "1px solid " + BORDER }}><button onClick={() => setVerFichas("")} style={{ ...boton(BLUE, false), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>← Volver a la lista</button></div>}
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>{embebida}</div></div>
      : <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {["asistencia", "rutas"].includes(pestana) && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><input type="date" value={dia} onChange={e => setDia(e.target.value)} style={{ ...caja, width: "auto" }}/></div>}

        {pestana === "tablero" && <Suspense fallback={<Cargando/>}><TableroVivo db={db} dia={dia} setDia={setDia} hoy={hoyCDMX()} servicios={servicios} jornadas={jornadas} proximas={proximas}
          alertasAbiertas={alertas.length} onVerAlertas={() => setPestana("alertas")} onVerRutas={() => setPestana("rutas")}/></Suspense>}
        {pestana === "reporte" && esAdmin && <Suspense fallback={<Cargando/>}><ReporteDia db={db} dia={dia} setDia={setDia} hoy={hoyCDMX()} choferes={choferes} jornadas={jornadas} servicios={servicios} oficina={oficinaAsis}/></Suspense>}
        {pestana === "ahora" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            {[["Trabajando", r.trabajando, GREEN], ["En ruta", r.enRuta, BLUE], ["Faltan (con ruta)", r.faltan, r.faltan ? ROSE : TEXT], ["Sin señal", r.sinSenal, r.sinSenal ? AMBER : TEXT], ["Alertas abiertas", alertas.length, alertas.length ? ROSE : GREEN]].map(([t, v, c]) =>
              <div key={t} style={tarjeta}><div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>{t}</div><div style={{ fontFamily: DISP, fontSize: 30, fontWeight: 800, color: c }}>{v}</div></div>)}
          </div>
          {proximas.length > 0 && <div onClick={() => setPestana("rutas")} style={{ ...tarjeta, borderColor: BLUE, background: BLUE + "08", marginBottom: 8, cursor: "pointer" }}>
            <b style={{ color: BLUE }}>📅 {proximas.length} {proximas.length === 1 ? "ruta próxima" : "rutas próximas"}</b> · <span style={{ fontSize: 14 }}>la siguiente: {diaBonito(proximas[0].fechaServicio)} · {proximas[0].folio} · {proximas[0].empresa}{proximas[0].choferNombre ? " · " + proximas[0].choferNombre : " · sin chofer"}. Toca para ver todas.</span></div>}
          {alertas.slice(0, 3).map(a => <div key={a.id} onClick={() => setPestana("alertas")} style={{ ...tarjeta, borderColor: ROSE, background: ROSE + "08", marginBottom: 8, cursor: "pointer" }}>
            <b style={{ color: ROSE }}>{tituloAlerta(a)}</b> · <span style={{ fontSize: 14 }}>{a.message || a.msg || "Toca para ver"}</span></div>)}
          <div style={{ ...tarjeta, padding: 0, overflow: "auto", marginTop: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}><thead><tr style={{ background: "#f8fafc", fontSize: 11, color: MUTED, textAlign: "left" }}>
              {["Chofer", "Hoy", "Ruta", "Última ubicación", ""].map(h => <th key={h} style={{ padding: "8px 10px" }}>{h}</th>)}</tr></thead>
              <tbody>{r.filas.map(f => <tr key={f.id} style={{ borderTop: "1px solid " + BORDER, fontSize: 14 }}>
                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{f.nombre}</td>
                <td style={{ padding: "8px 10px" }}><Chip color={COLOR_ASIS[f.asistencia] || MUTED}>{f.asistencia}</Chip>{f.checkIn > 0 && <span style={{ fontSize: 12, color: f.jornada?.llegoTarde ? ROSE : MUTED }}> desde {hora(f.checkIn)}{f.jornada?.llegoTarde ? ` · ${f.jornada.tardeMin} min tarde` : ""}</span>}</td>
                <td style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>{f.ruta ? `${f.ruta.folio} · ${f.ruta.estado}` : "—"}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, color: f.sinSenal ? AMBER : TEXT }}>{f.ubicacion ? <>{hace(f.minUbicacion)}{f.sinSenal && " ⚠️"}</> : <span style={{ color: MUTED }}>sin datos</span>}</td>
                <td style={{ padding: "8px 10px" }}>{f.ubicacion && <a href={mapa(f.ubicacion.lat, f.ubicacion.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE, fontWeight: 700, fontSize: 13 }}>Ver en mapa</a>}</td>
              </tr>)}</tbody></table>
          </div>
        </>}

        {pestana === "asistencia" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {esAdmin && oficinaAsis.map(o => <div key={o.id} style={{ ...tarjeta, borderLeft: "4px solid " + BLUE }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 16 }}>🏢 {o.nombre}</b><Chip color={BLUE}>Oficina</Chip>
              {o.llegoTarde && <Chip color={ROSE}>⏰ Llegó {o.tardeMin} min tarde</Chip>}
              {(o.dudas || []).length > 0 && <Chip color={AMBER}>⚠️ {o.dudas.join(", ")}</Chip>}
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>
              Entrada: <b style={{ color: TEXT }}>{hora(o.checkInEn)}</b>{o.horaEntradaEsperada ? ` (entrada ${o.horaEntradaEsperada})` : ""} · {o.lugarEntrada || "—"}
              <br/>Ubicación en el día: {o.ultimaUbicacion ? <><b style={{ color: TEXT }}>{hace(Math.round((Date.now() - o.ultimaUbicacion.tMs) / 60000))}</b>{o.ultimaUbicacion.distEntradaM !== null && o.ultimaUbicacion.distEntradaM !== undefined ? ` · a ${o.ultimaUbicacion.distEntradaM < 1000 ? o.ultimaUbicacion.distEntradaM + " m" : (o.ultimaUbicacion.distEntradaM / 1000).toFixed(1) + " km"} de su entrada` : ""} · {o.puntosGps || 0} lecturas{o.maxDistEntradaM > 1000 ? <b style={{ color: ROSE }}> · se alejó hasta {(o.maxDistEntradaM / 1000).toFixed(1)} km</b> : ""}</> : <span style={{ color: MUTED }}>sin lecturas (solo se registra con el sistema abierto en su celular)</span>}
              <br/>Salida: {o.checkOutEn ? <><b style={{ color: TEXT }}>{hora(o.checkOutEn)}</b> · {o.lugarSalida || "—"}{o.horasTrabajadas != null ? ` · ${o.horasTrabajadas} h` : ""}</> : <span style={{ color: AMBER }}>todavía no registra su salida</span>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
              {o.ubicacion && <MapaPunto token={mapboxToken} punto={o.ubicacion} titulo="Entrada" lugar={o.lugarEntrada} hora={hora(o.checkInEn)}/>}
              {o.fotos?.selfie?.ruta && <Miniatura ruta={o.fotos.selfie.ruta} etiqueta={"Entrada · " + o.nombre}/>}
              {o.ultimaUbicacion && <MapaPunto token={mapboxToken} punto={o.ultimaUbicacion} titulo="Última ubicación" lugar={o.ultimaUbicacion.distEntradaM !== null ? `a ${o.ultimaUbicacion.distEntradaM} m de su entrada` : ""} hora={hora(o.ultimaUbicacion.tMs)}/>}
              {o.ubicacionSalida && <MapaPunto token={mapboxToken} punto={o.ubicacionSalida} titulo="Salida" lugar={o.lugarSalida} hora={hora(o.checkOutEn)}/>}
              {o.fotosSalida?.selfieSalida?.ruta && <Miniatura ruta={o.fotosSalida.selfieSalida.ruta} etiqueta={"Salida · " + o.nombre}/>}
            </div>
          </div>)}
          {r.filas.map(f => { const j = f.jornada, fotos = j ? [j.fotos?.selfie?.ruta || j.selfieRuta, j.fotos?.placas?.ruta || j.fotoPlacasRuta, j.fotos?.odometro?.ruta || j.fotoOdometroRuta].filter(Boolean) : [];
            const salida = j?.fotosSalida?.odometroSalida?.ruta;
            return <div key={f.id} style={tarjeta}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 16 }}>{f.nombre}</b><Chip color={COLOR_ASIS[f.asistencia] || MUTED}>{f.asistencia}</Chip>
                {j?.llegoTarde && <Chip color={ROSE}>⏰ Llegó {j.tardeMin} min tarde</Chip>}
                {j?.fueraDeCdmxEntrada && <Chip color={ROSE}>🗺️ Entrada fuera de CDMX ({j.kmDesdeZocaloEntrada} km)</Chip>}
                {(j?.dudas || []).length > 0 && <Chip color={AMBER}>⚠️ {j.dudas.join(", ")}</Chip>}
                {(j?.dudasSalida || []).length > 0 && <Chip color={AMBER}>⚠️ salida: {j.dudasSalida.join(", ")}</Chip>}
              </div>
              {j ? <div style={{ fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>
                Entrada: <b style={{ color: TEXT }}>{hora(j.checkInEn)}</b>{j.horaEntradaEsperada ? ` (entrada ${j.horaEntradaEsperada})` : ""}{j.ubicacion && <> · <a href={mapa(j.ubicacion.lat, j.ubicacion.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE }}>{j.lugarEntrada || "dónde"}</a>{j.precisionM ? ` (±${j.precisionM} m)` : ""}</>}
                {" · "}Unidad {j.unidadPlaca || "—"} · {j.odometroKm ?? "—"} km · gasolina {j.combustiblePct ?? "—"}%
                <br/>Salida: {j.checkOutEn ? <><b style={{ color: TEXT }}>{hora(j.checkOutEn)}</b>{j.ubicacionSalida && <> · <a href={mapa(j.ubicacionSalida.lat, j.ubicacionSalida.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE }}>{j.lugarSalida || "dónde"}</a></>}{j.kmRecorridos != null && ` · ${j.kmRecorridos} km en el tablero`}{j.kmGps ? ` · GPS ${j.kmGps} km` : ""}</> : <span style={{ color: AMBER }}>todavía no cierra su día</span>}
              </div> : <div style={{ fontSize: 13, color: f.asistencia === "Faltó" ? ROSE : MUTED, marginTop: 4 }}>{f.asistencia === "Faltó" ? "Tenía ruta y no hizo check-in." : "Sin check-in este día."}</div>}
              {(fotos.length > 0 || salida || j?.ubicacion || j?.ubicacionSalida) && <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
                {j?.ubicacion && <MapaPunto token={mapboxToken} punto={j.ubicacion} titulo="Entrada" lugar={j.lugarEntrada} hora={hora(j.checkInEn)}/>}
                {esAdmin && fotos[0] && (() => { const c = choferes.find(x => x.id === f.id) || {};
                  return c.fotoReferenciaRuta && c.fotoReferenciaRuta !== fotos[0]
                    ? <div style={{ flex: "none", textAlign: "center" }}><Miniatura ruta={c.fotoReferenciaRuta} etiqueta={"Referencia · " + f.nombre}/><div style={{ fontSize: 10, color: MUTED }}>Referencia</div></div>
                    : null; })()}
                {fotos.map((ru, i) => <div key={ru} style={{ flex: "none", textAlign: "center" }}><Miniatura ruta={ru} etiqueta={["Selfie", "Placas", "Tablero"][i] + " · " + f.nombre}/>
                  {i === 0 && esAdmin && (choferes.find(x => x.id === f.id) || {}).fotoReferenciaRuta !== ru &&
                    <button onClick={() => updateDoc(doc(db, "choferes", f.id), { fotoReferenciaRuta: ru, fotoReferenciaEn: serverTimestamp(), fotoReferenciaPor: usuario?.nombre || "" }).catch(() => {})}
                      style={{ display: "block", margin: "4px auto 0", background: "none", border: "none", color: BLUE, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Usar como referencia</button>}
                  {i === 0 && <div style={{ fontSize: 10, color: MUTED }}>Hoy</div>}</div>)}
                {j?.ubicacionSalida && <MapaPunto token={mapboxToken} punto={j.ubicacionSalida} titulo="Salida" lugar={j.lugarSalida} hora={hora(j.checkOutEn)}/>}
                {salida && <Miniatura ruta={salida} etiqueta={"Tablero al salir · " + f.nombre}/>}</div>}
            </div>; })}
          <p style={{ fontSize: 12, color: MUTED }}>Cada foto lleva impresos el nombre, la hora y la ubicación, y el servidor guarda la hora real en que se subió y su huella digital: no se puede cambiar después. Nadie (ni el director) puede editar un check-in.</p>
        </div>}

        {pestana === "rutas" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {proximas.length > 0 && <div style={{ ...tarjeta, borderLeft: "4px solid " + BLUE }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>📅 Próximas rutas ({proximas.length})</div>
            {proximas.map(s => <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "7px 0", borderTop: "1px solid " + BORDER, fontSize: 14 }}>
              <b style={{ minWidth: 92 }}>{diaBonito(s.fechaServicio)}</b><b style={{ fontFamily: MONO, fontSize: 13 }}>{s.folio}</b><span>{s.empresa}</span>
              <span style={{ color: s.choferNombre ? MUTED : ROSE }}>· {s.choferNombre || "sin chofer"}{s.segundoChoferNombre ? " y " + s.segundoChoferNombre : ""}{s.unidadPlaca ? " · " + s.unidadPlaca : ""}</span>
              {s.creadoPorNombre && <span style={{ fontSize: 12, color: MUTED }}>· registró {s.creadoPorNombre}</span>}
              <button onClick={() => setDia(s.fechaServicio)} style={{ ...boton(BLUE, false), padding: "4px 10px", minHeight: 30, fontSize: 12, marginLeft: "auto" }}>Ver ese día</button>
            </div>)}
          </div>}
          {servicios.length === 0 && <div style={{ ...tarjeta, color: MUTED }}>No hay rutas asignadas el {diaBonito(dia)}.</div>}
          {servicios.map(s => <div key={s.id} style={tarjeta}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontFamily: MONO }}>{s.folio}</b><span style={{ color: s.choferNombre ? TEXT : ROSE }}>{s.choferNombre || "sin chofer"}</span><span style={{ color: MUTED }}>· {[s.unidadPlaca, s.empresa, s.creadoPorNombre && "registró " + s.creadoPorNombre].filter(Boolean).join(" · ")}</span>
              {s.cambioPendiente && (s.cambioPendiente.enteradoMs ? <Chip color={GREEN}>✓ Chofer enterado del cambio</Chip> : <Chip color={ROSE}>⏳ Chofer sin confirmar cambio</Chip>)}
              {s.foraneo && <Chip color={A}>🛣️ Foránea · {s.diasFuera || 1} días{s.regresoEstimado ? ` · regresa ${s.regresoEstimado}` : ""}</Chip>}
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                <Chip color={s.estado === "En ruta" ? BLUE : ["Entregada", "Cerrada"].includes(s.estado) ? GREEN : A}>{s.estado === "Asignada" ? "Por salir" : s.estado}</Chip>
                <button onClick={() => verParadas(s.id)} style={{ ...boton(BLUE, false), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>{abierto === s.id ? "Cerrar" : "Ver paradas y fotos"}</button></span>
            </div>
            {abierto === s.id && <div style={{ marginTop: 10 }}>{paradas[s.id] ? <Evidencias paradas={paradas[s.id]}/> : <span style={{ color: MUTED }}>Cargando…</span>}</div>}
          </div>)}
        </div>}

        {pestana === "alertas" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alertas.length === 0 && <div style={{ ...tarjeta, color: GREEN, fontWeight: 700 }}>✓ Sin alertas abiertas.</div>}
          {alertas.map(a => <div key={a.id} style={{ ...tarjeta, borderLeft: "4px solid " + (["sos", "ubicacion_simulada", "velocidad_imposible", "fuera_de_ruta"].includes(a.type) ? ROSE : AMBER) }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b>{tituloAlerta(a)}</b><span style={{ fontSize: 12, color: MUTED }}>{hora(a.ts || a.createdAt)}</span>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
                {Number.isFinite(a.lat) && Number.isFinite(a.lng) && <a href={mapa(a.lat, a.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE, fontSize: 13, fontWeight: 700 }}>Ver dónde</a>}
                {esAdmin ? <button onClick={() => { setAtendiendo(atendiendo === a.id ? "" : a.id); setNota(""); setErrAtender(""); }} style={{ ...boton(GREEN, false), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>✓ Atendida</button>
                  : <span style={{ fontSize: 11, color: MUTED }}>La cierra el director</span>}</span>
            </div>
            <div style={{ fontSize: 14, color: TEXT, marginTop: 4 }}>{a.message || a.msg || "Sin detalle: revisa la ubicación del chofer."}</div>
            {atendiendo === a.id && <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input autoFocus value={nota} onChange={e => setNota(e.target.value)} onKeyDown={e => e.key === "Enter" && atender(a)} placeholder="¿Qué se hizo? (queda en el registro)"
                style={{ flex: "1 1 220px", minWidth: 0, border: "1.5px solid " + BORDER, borderRadius: 10, padding: "9px 12px", fontSize: 15 }}/>
              <button onClick={() => atender(a)} style={{ ...boton(GREEN), padding: "8px 14px" }}>Guardar</button>
              {errAtender && <div style={{ width: "100%", color: ROSE, fontSize: 13, fontWeight: 700 }}>{errAtender}</div>}</div>}
          </div>)}
        </div>}

        {pestana === "choferes" && <div>
          {esAdmin && <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={() => setVerFichas("choferes")} style={boton(BLUE, false)}>✏️ Editar fichas de choferes</button>
            <button onClick={() => setVerFichas("unidades")} style={boton(BLUE, false)}>🚚 Camionetas</button></div>}
          <div style={{ ...tarjeta, padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}><thead><tr style={{ background: "#f8fafc", fontSize: 11, color: MUTED, textAlign: "left" }}>
              {["Chofer", "Celular", "App", "Hoy", ""].map(h => <th key={h} style={{ padding: "8px 10px" }}>{h}</th>)}</tr></thead>
              <tbody>{activos.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(c => { const f = r.filas.find(x => x.id === c.id);
                return <tr key={c.id} style={{ borderTop: "1px solid " + BORDER, fontSize: 14 }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{c.nombre}{c.porConfirmar && <span style={{ fontSize: 11, color: AMBER }}> · por confirmar</span>}</td>
                  <td style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>{c.tel || c.telefono || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{c.authUid ? <Chip color={GREEN}>✓ Tiene la app</Chip> : <Chip color={AMBER}>Sin app</Chip>}</td>
                  <td style={{ padding: "8px 10px" }}>{f && <Chip color={COLOR_ASIS[f.asistencia] || MUTED}>{f.asistencia}</Chip>}</td>
                  <td style={{ padding: "8px 10px" }}>{esAdmin && <BotonAcceso chofer={c} app={app}/>}</td></tr>; })}</tbody></table>
          </div>
          <p style={{ fontSize: 12, color: MUTED }}>{esAdmin ? "📲 Mandar acceso: crea su cuenta con su celular y abre WhatsApp con su enlace para poner contraseña. El chofer entra en /chofer con su celular." : "Dar de alta o cambiar datos de un chofer lo hace el director."}</p>
        </div>}

        {pestana === "gastos" && esAdmin && <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 12 }}>
            <div style={tarjeta}><div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Últimos 7 días</div><div style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800 }}>{dinero(gastosSemana.reduce((t, g) => t + (Number(g.monto) || 0), 0))}</div></div>
            <div style={tarjeta}><div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Por aprobar</div><div style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800, color: AMBER }}>{gastos.filter(g => !g.estado || g.estado === "pendiente").length}</div></div>
          </div>
          <div style={{ ...tarjeta, padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}><thead><tr style={{ background: "#f8fafc", fontSize: 11, color: MUTED, textAlign: "left" }}>
              {["Fecha", "Chofer", "Tipo", "Monto", "Detalle", "Ticket", "Estado"].map(h => <th key={h} style={{ padding: "8px 10px" }}>{h}</th>)}</tr></thead>
              <tbody>{gastos.slice(0, 150).map(g => <tr key={g.id} style={{ borderTop: "1px solid " + BORDER, fontSize: 13 }}>
                <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{ms(g.fechaTs || g.createdAt) ? new Date(ms(g.fechaTs || g.createdAt)).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"}</td>
                <td style={{ padding: "7px 10px" }}>{g.choferNombre}</td><td style={{ padding: "7px 10px" }}>{g.tipo}</td>
                <td style={{ padding: "7px 10px", fontFamily: MONO }}>{dinero(g.monto)}</td>
                <td style={{ padding: "7px 10px", color: MUTED, minWidth: 180 }}>{[g.litros && `${g.litros} L`, g.precioLitro && `${dinero(g.precioLitro)}/L`, g.rendimientoKmL && `${g.rendimientoKmL} km/L`, g.unidadPlaca, g.lugar, g.nota].filter(Boolean).join(" · ") || "—"}
                  {(g.dudas || []).length > 0 && <div style={{ color: ROSE, fontWeight: 700 }}>⚠️ {g.dudas.join("; ")}</div>}
                  {g.lecturaIA?.ok && <div style={{ color: (g.dudasIA || []).length ? ROSE : GREEN, fontWeight: 700 }}>🤖 Ticket: {g.lecturaIA.total != null ? dinero(g.lecturaIA.total) : "sin total"}{g.lecturaIA.litros ? ` · ${g.lecturaIA.litros} L` : ""}{g.lecturaIA.fecha ? ` · ${g.lecturaIA.fecha}` : ""}{(g.dudasIA || []).length ? ` · no cuadra: ${g.dudasIA.join("; ")}` : " · cuadra ✓"}</div>}</td>
                <td style={{ padding: "7px 10px" }}>{g.ticketRuta ? <Miniatura ruta={g.ticketRuta} etiqueta={"Ticket · " + (g.choferNombre || "")}/> : g.ticketURL ? <a href={g.ticketURL} target="_blank" rel="noreferrer" style={{ color: BLUE }}>ver</a> : "—"}</td>
                <td style={{ padding: "7px 10px" }}><Chip color={g.estado === "aprobado" ? GREEN : g.estado === "rechazado" ? ROSE : AMBER}>{g.estado || "pendiente"}</Chip></td></tr>)}</tbody></table>
          </div>
          <p style={{ fontSize: 12, color: MUTED }}>Aprobar o rechazar un gasto lo hace el director.</p>
        </div>}
      </div>
    </div>}
      {claveApp && <Suspense fallback={null}><ClaveApp app={app} onCerrar={() => setClaveApp(false)}/></Suspense>}
    </div>);
}
