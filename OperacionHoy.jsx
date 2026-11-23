/* CENTRO DE OPERACIÓN · la plataforma de Ilse y el "ojo de águila" del director.
   Ilse (operaciones) VE todo: choferes, asistencia con fotos y ubicación, rutas y paradas, alertas y gastos.
   No puede cambiar ni borrar esos registros (lo impiden las reglas del servidor): solo el director (admin)
   da por atendida una alerta. Link directo: /operacion */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, limit, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, caja, boton, Chip, dinero } from "./uiBasico.jsx";
import Evidencias, { Miniatura } from "./Evidencias.jsx";
import { resumenOperacion } from "./operacion.ts";

const hoyCDMX = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const ms = v => v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0;
const hora = v => { const t = ms(v); return t ? new Date(t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""; };
const hace = min => min === null ? "sin datos" : min < 1 ? "ahora" : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`;
const mapa = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
const tarjeta = { background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 14px" };
const COLOR_ASIS = { "Trabajando": GREEN, "Terminó": BLUE, "Faltó": ROSE, "Sin ruta hoy": MUTED, "Por llegar": AMBER };

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

export default function OperacionHoy({ db, app, usuario }){
  const esAdmin = usuario?.rol === "admin";
  const [pestana, setPestana] = useState("ahora"), [dia, setDia] = useState(hoyCDMX());
  const [choferes, setChoferes] = useState([]), [jornadas, setJornadas] = useState([]), [ubic, setUbic] = useState({}), [servicios, setServicios] = useState([]);
  const [alertas, setAlertas] = useState([]), [gastos, setGastos] = useState([]), [abierto, setAbierto] = useState(""), [paradas, setParadas] = useState({});
  const [, setReloj] = useState(0);
  useEffect(() => { const t = setInterval(() => setReloj(x => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const us = [
      onSnapshot(collection(db, "choferes"), s => setChoferes(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(collection(db, "ubicaciones"), s => setUbic(Object.fromEntries(s.docs.map(d => [d.id, d.data()]))), () => {}),
      onSnapshot(query(collection(db, "alertas"), where("atendida", "==", false), limit(300)), s => setAlertas(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.ts || b.createdAt) - ms(a.ts || a.createdAt))), () => {}),
      onSnapshot(query(collection(db, "gastosChofer"), orderBy("createdAt", "desc"), limit(300)), s => setGastos(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
    ];
    return () => us.forEach(u => u());
  }, [db]);
  useEffect(() => {
    const us = [
      onSnapshot(query(collection(db, "jornadas"), where("fecha", "==", dia)), s => setJornadas(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setJornadas([])),
      onSnapshot(query(collection(db, "servicios"), where("fechaServicio", "==", dia), limit(300)), s => setServicios(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.choferId && !x.historico)), () => setServicios([])),
    ];
    return () => us.forEach(u => u());
  }, [db, dia]);
  const verParadas = async id => {
    setAbierto(abierto === id ? "" : id);
    if(!paradas[id]) { const s = await getDocs(query(collection(db, "servicios", id, "paradas"), orderBy("orden"))).catch(() => null);
      setParadas(p => ({ ...p, [id]: s ? s.docs.map(d => ({ id: d.id, ...d.data() })) : [] })); }
  };
  const atender = async a => {
    const nota = prompt("¿Qué se hizo? (queda en el registro)", "");
    if(nota === null) return;
    await updateDoc(doc(db, "alertas", a.id), { atendida: true, atendidaPor: usuario?.nombre || "", atendidaPorUid: usuario?.uid || "", atendidaEn: serverTimestamp(), notaAtencion: nota.trim() })
      .catch(e => alert("No se pudo: " + e.message));
  };

  const activos = useMemo(() => choferes.filter(c => c.status !== "Inactivo" && c.activo !== false && !c.baja), [choferes]);
  const r = resumenOperacion({ choferes: activos, jornadas, servicios, ubicaciones: ubic, alertas, dia, ahoraMs: Date.now() });
  const gastosSemana = gastos.filter(g => Date.now() - ms(g.fechaTs || g.createdAt) < 7 * 86400000);

  const P = [["ahora", "👀 Ahora"], ["asistencia", "🕘 Asistencia"], ["rutas", "🗺️ Rutas y paradas"], ["alertas", `🚨 Alertas${alertas.length ? " (" + alertas.length + ")" : ""}`], ["gastos", "💵 Gastos"]];
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "22px 18px", background: "#f1f4fb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 28, color: TEXT, margin: 0 }}>Centro de operación</h1>
          <span style={{ marginLeft: "auto" }}><AvisosCelular app={app}/></span>
        </div>
        <p style={{ color: MUTED, fontSize: 14, margin: "4px 0 12px" }}>Todo lo que pasa con los choferes, en vivo. {esAdmin ? "Tú puedes dar por atendidas las alertas." : "Aquí todo es para ver; los cambios los hace el director."}</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          {P.map(([k, l]) => <button key={k} onClick={() => setPestana(k)} style={{ ...boton(k === "alertas" && alertas.length ? ROSE : BLUE, pestana === k), padding: "8px 14px", minHeight: 38 }}>{l}</button>)}
          {["asistencia", "rutas"].includes(pestana) && <input type="date" value={dia} onChange={e => setDia(e.target.value)} style={{ ...caja, width: "auto", marginLeft: "auto" }}/>}
        </div>

        {pestana === "ahora" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            {[["Trabajando", r.trabajando, GREEN], ["En ruta", r.enRuta, BLUE], ["Faltan (con ruta)", r.faltan, r.faltan ? ROSE : TEXT], ["Sin señal", r.sinSenal, r.sinSenal ? AMBER : TEXT], ["Alertas abiertas", alertas.length, alertas.length ? ROSE : GREEN]].map(([t, v, c]) =>
              <div key={t} style={tarjeta}><div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>{t}</div><div style={{ fontFamily: DISP, fontSize: 30, fontWeight: 800, color: c }}>{v}</div></div>)}
          </div>
          {alertas.slice(0, 3).map(a => <div key={a.id} onClick={() => setPestana("alertas")} style={{ ...tarjeta, borderColor: ROSE, background: ROSE + "08", marginBottom: 8, cursor: "pointer" }}>
            <b style={{ color: ROSE }}>{a.titulo || a.type}</b> · <span style={{ fontSize: 14 }}>{a.message || a.msg}</span></div>)}
          <div style={{ ...tarjeta, padding: 0, overflow: "auto", marginTop: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}><thead><tr style={{ background: "#f8fafc", fontSize: 11, color: MUTED, textAlign: "left" }}>
              {["Chofer", "Hoy", "Ruta", "Última ubicación", ""].map(h => <th key={h} style={{ padding: "8px 10px" }}>{h}</th>)}</tr></thead>
              <tbody>{r.filas.map(f => <tr key={f.id} style={{ borderTop: "1px solid " + BORDER, fontSize: 14 }}>
                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{f.nombre}</td>
                <td style={{ padding: "8px 10px" }}><Chip color={COLOR_ASIS[f.asistencia] || MUTED}>{f.asistencia}</Chip>{f.checkIn > 0 && <span style={{ fontSize: 12, color: MUTED }}> desde {hora(f.checkIn)}</span>}</td>
                <td style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>{f.ruta ? `${f.ruta.folio} · ${f.ruta.estado}` : "—"}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, color: f.sinSenal ? AMBER : TEXT }}>{f.ubicacion ? <>{hace(f.minUbicacion)}{f.sinSenal && " ⚠️"}</> : <span style={{ color: MUTED }}>sin datos</span>}</td>
                <td style={{ padding: "8px 10px" }}>{f.ubicacion && <a href={mapa(f.ubicacion.lat, f.ubicacion.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE, fontWeight: 700, fontSize: 13 }}>Ver en mapa</a>}</td>
              </tr>)}</tbody></table>
          </div>
        </>}

        {pestana === "asistencia" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {r.filas.map(f => { const j = f.jornada, fotos = j ? [j.fotos?.selfie?.ruta || j.selfieRuta, j.fotos?.placas?.ruta || j.fotoPlacasRuta, j.fotos?.odometro?.ruta || j.fotoOdometroRuta].filter(Boolean) : [];
            const salida = j?.fotosSalida?.odometroSalida?.ruta;
            return <div key={f.id} style={tarjeta}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 16 }}>{f.nombre}</b><Chip color={COLOR_ASIS[f.asistencia] || MUTED}>{f.asistencia}</Chip>
                {(j?.dudas || []).length > 0 && <Chip color={AMBER}>⚠️ {j.dudas.join(", ")}</Chip>}
                {(j?.dudasSalida || []).length > 0 && <Chip color={AMBER}>⚠️ salida: {j.dudasSalida.join(", ")}</Chip>}
              </div>
              {j ? <div style={{ fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>
                Entrada: <b style={{ color: TEXT }}>{hora(j.checkInEn)}</b>{j.ubicacion && <> · <a href={mapa(j.ubicacion.lat, j.ubicacion.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE }}>dónde</a>{j.precisionM ? ` (±${j.precisionM} m)` : ""}</>}
                {" · "}Unidad {j.unidadPlaca || "—"} · {j.odometroKm ?? "—"} km · gasolina {j.combustiblePct ?? "—"}%
                <br/>Salida: {j.checkOutEn ? <><b style={{ color: TEXT }}>{hora(j.checkOutEn)}</b>{j.ubicacionSalida && <> · <a href={mapa(j.ubicacionSalida.lat, j.ubicacionSalida.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE }}>dónde</a></>}{j.kmRecorridos != null && ` · ${j.kmRecorridos} km recorridos`}</> : <span style={{ color: AMBER }}>todavía no cierra su día</span>}
              </div> : <div style={{ fontSize: 13, color: f.asistencia === "Faltó" ? ROSE : MUTED, marginTop: 4 }}>{f.asistencia === "Faltó" ? "Tenía ruta y no hizo check-in." : "Sin check-in este día."}</div>}
              {(fotos.length > 0 || salida) && <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
                {fotos.map((ru, i) => <Miniatura key={ru} ruta={ru} etiqueta={["Selfie", "Placas", "Tablero"][i] + " · " + f.nombre}/>)}
                {salida && <Miniatura ruta={salida} etiqueta={"Tablero al salir · " + f.nombre}/>}</div>}
            </div>; })}
          <p style={{ fontSize: 12, color: MUTED }}>Cada foto lleva impresos el nombre, la hora y la ubicación, y el servidor guarda la hora real en que se subió y su huella digital: no se puede cambiar después. Nadie (ni el director) puede editar un check-in.</p>
        </div>}

        {pestana === "rutas" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {servicios.length === 0 && <div style={{ ...tarjeta, color: MUTED }}>No hay rutas asignadas ese día.</div>}
          {servicios.map(s => <div key={s.id} style={tarjeta}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontFamily: MONO }}>{s.folio}</b><span>{s.choferNombre}</span><span style={{ color: MUTED }}>· {s.unidadPlaca} · {s.empresa}</span>
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
              <b>{a.titulo || a.type}</b><span style={{ fontSize: 12, color: MUTED }}>{hora(a.ts || a.createdAt)}</span>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
                {Number.isFinite(a.lat) && Number.isFinite(a.lng) && <a href={mapa(a.lat, a.lng)} target="_blank" rel="noreferrer" style={{ color: BLUE, fontSize: 13, fontWeight: 700 }}>Ver dónde</a>}
                {esAdmin ? <button onClick={() => atender(a)} style={{ ...boton(GREEN, false), padding: "4px 10px", minHeight: 30, fontSize: 12 }}>✓ Atendida</button>
                  : <span style={{ fontSize: 11, color: MUTED }}>La cierra el director</span>}</span>
            </div>
            <div style={{ fontSize: 14, color: TEXT, marginTop: 4 }}>{a.message || a.msg}</div>
          </div>)}
        </div>}

        {pestana === "gastos" && <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 12 }}>
            <div style={tarjeta}><div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Últimos 7 días</div><div style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800 }}>{dinero(gastosSemana.reduce((t, g) => t + (Number(g.monto) || 0), 0))}</div></div>
            <div style={tarjeta}><div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Por aprobar</div><div style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800, color: AMBER }}>{gastos.filter(g => !g.estado || g.estado === "pendiente").length}</div></div>
          </div>
          <div style={{ ...tarjeta, padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}><thead><tr style={{ background: "#f8fafc", fontSize: 11, color: MUTED, textAlign: "left" }}>
              {["Fecha", "Chofer", "Tipo", "Monto", "Nota", "Estado"].map(h => <th key={h} style={{ padding: "8px 10px" }}>{h}</th>)}</tr></thead>
              <tbody>{gastos.slice(0, 150).map(g => <tr key={g.id} style={{ borderTop: "1px solid " + BORDER, fontSize: 13 }}>
                <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{ms(g.fechaTs || g.createdAt) ? new Date(ms(g.fechaTs || g.createdAt)).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"}</td>
                <td style={{ padding: "7px 10px" }}>{g.choferNombre}</td><td style={{ padding: "7px 10px" }}>{g.tipo}</td>
                <td style={{ padding: "7px 10px", fontFamily: MONO }}>{dinero(g.monto)}</td><td style={{ padding: "7px 10px", color: MUTED }}>{g.nota}</td>
                <td style={{ padding: "7px 10px" }}><Chip color={g.estado === "aprobado" ? GREEN : g.estado === "rechazado" ? ROSE : AMBER}>{g.estado || "pendiente"}</Chip></td></tr>)}</tbody></table>
          </div>
          <p style={{ fontSize: 12, color: MUTED }}>Aprobar o rechazar un gasto lo hace el director.</p>
        </div>}
      </div>
    </div>);
}

