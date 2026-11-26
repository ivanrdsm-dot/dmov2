/* 📋 REPORTE DEL DÍA (solo director): quién vino, a qué hora, desde dónde, cuánto trabajó y qué faltó.
   Cualquier fecha (historial). Se puede mandar por WhatsApp. La lógica vive en reporteDia.ts. */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, limit, getDocs, doc, getDoc, Timestamp } from "firebase/firestore";
import { BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, BD2, DISP, MONO, boton, Chip } from "./uiBasico.jsx";
import { reporteDia, textoReporte } from "./reporteDia.ts";

const tarjeta = { background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 14px" };
const hhmm = t => t ? new Date(t).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }) : "";
const dur = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `${m} min`;
const diaBonito = f => { const d = /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) ? new Date(f + "T12:00:00") : null;
  const s = d ? d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : String(f || ""); return s.charAt(0).toUpperCase() + s.slice(1); };
const NIVEL = { grave: { color: ROSE, icono: "🛑", texto: "Grave" }, revisar: { color: AMBER, icono: "⚠️", texto: "Revisar" }, info: { color: MUTED, icono: "ℹ️", texto: "Dato" } };
const NOMBRE_ALERTA = { sin_ubicacion: "sin GPS", movimiento_sin_ruta: "sin ruta", cierre_fuera_de_punto: "cierre lejos", fuera_de_ruta: "fuera de ruta", detenido: "detenido",
  km_sin_explicar: "km sin explicar", km_no_coinciden: "km no cuadran", sin_checkout: "sin salida", velocidad_imposible: "salto GPS", unidad_no_coincide: "otra camioneta", checkin_dudoso: "check-in dudoso" };

export default function ReporteDia({ db, dia, setDia, hoy, choferes = [], jornadas = [], servicios = [], oficina = [] }){
  const [alertas, setAlertas] = useState([]), [usuarios, setUsuarios] = useState([]), [placas, setPlacas] = useState([]), [extra, setExtra] = useState([]);
  useEffect(() => {
    const ini = Timestamp.fromMillis(Date.parse(dia + "T00:00:00-06:00")), fin = Timestamp.fromMillis(Date.parse(dia + "T00:00:00-06:00") + 86400000);
    let a1 = [], a2 = [];
    const juntar = () => setAlertas([...a1, ...a2]);
    const us = ["alertas", "alertas_director"].map((col, i) => onSnapshot(query(collection(db, col), where("ts", ">=", ini), where("ts", "<", fin), limit(500)),
      s => { const xs = s.docs.map(d => ({ id: d.id, ...d.data() })); if(i === 0) a1 = xs; else a2 = xs; juntar(); }, () => {}));
    return () => us.forEach(u => u());
  }, [db, dia]);
  useEffect(() => {
    getDocs(query(collection(db, "dmov_usuarios"), limit(100))).then(s => setUsuarios(s.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => {});
    getDocs(query(collection(db, "unidades"), limit(200))).then(s => setPlacas(s.docs.map(d => d.data()).filter(u => u.status !== "Baja").map(u => u.placa || ""))).catch(() => {});
  }, [db]);
  /* Rutas que aparecen en las alertas del día aunque su fecha sea otra (p. ej. una ruta adelantada). */
  useEffect(() => {
    const faltan = [...new Set(alertas.map(a => a.servicioId).filter(Boolean))].filter(id => !servicios.some(s => s.id === id));
    if(!faltan.length){ setExtra([]); return; }
    Promise.all(faltan.slice(0, 20).map(id => getDoc(doc(db, "servicios", id)).then(d => d.exists() ? { id: d.id, ...d.data() } : null).catch(() => null)))
      .then(xs => setExtra(xs.filter(Boolean)));
  }, [db, alertas, servicios]);
  const r = useMemo(() => reporteDia({ dia, ahoraMs: Date.now(), choferes, jornadas, oficina, usuariosOficina: usuarios, servicios: [...servicios, ...extra], alertas, placasFlota: placas }),
    [dia, choferes, jornadas, oficina, usuarios, servicios, extra, alertas, placas]);
  const compartir = () => window.open("https://wa.me/?text=" + encodeURIComponent(textoReporte(dia, r)), "_blank", "noopener");
  const otroDia = n => { const d = new Date(Date.parse(dia + "T12:00:00") + n * 86400000).toISOString().slice(0, 10); setDia(d); };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 240px" }}>
          <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 22, color: TEXT }}>📋 Reporte del día</div>
          <div style={{ fontSize: 13, color: MUTED }}>{diaBonito(dia)}{dia === hoy ? " · se actualiza solo" : ""}</div>
        </div>
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => otroDia(-1)} style={{ ...boton(MUTED, false), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>← Día anterior</button>
          {dia !== hoy && <button onClick={() => setDia(hoy)} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>Hoy</button>}
          <input type="date" value={dia} max={hoy} onChange={e => e.target.value && setDia(e.target.value)} style={{ border: "1.5px solid " + BD2, borderRadius: 10, padding: "5px 8px", fontSize: 13, fontFamily: "inherit" }}/>
          <button onClick={compartir} style={{ ...boton(GREEN), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>📲 Mandar por WhatsApp</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 12 }}>
        {[["Vinieron", `${r.resumen.vinieron}/${r.resumen.personas}`, r.resumen.faltaron ? ROSE : GREEN], ["Llegaron tarde", r.resumen.tarde, r.resumen.tarde ? ROSE : GREEN],
          ["Sin registrar salida", r.resumen.sinSalida, r.resumen.sinSalida ? AMBER : GREEN], ["Graves", r.resumen.graves, r.resumen.graves ? ROSE : GREEN], ["Por revisar", r.resumen.revisar, r.resumen.revisar ? AMBER : GREEN]]
          .map(([t, v, c]) => <div key={t} style={tarjeta}><div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>{t}</div><div style={{ fontFamily: DISP, fontSize: 28, fontWeight: 800, color: c }}>{v}</div></div>)}
      </div>

      <div style={{ ...tarjeta, marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Qué faltó</div>
        {r.hallazgos.length === 0 ? <div style={{ fontSize: 14, color: GREEN, fontWeight: 700 }}>✓ Sin pendientes: todo cuadra.</div> : r.hallazgos.map((h, i) => {
          const n = NIVEL[h.nivel];
          return <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: i ? "1px solid " + BORDER : "none" }}>
            <Chip color={n.color}>{n.icono} {n.texto}</Chip>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}><b>{h.quien ? h.quien + " · " : ""}{h.titulo}</b><div style={{ color: MUTED, fontSize: 13 }}>{h.detalle}</div></div>
          </div>; })}
      </div>

      <div style={{ ...tarjeta, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860, fontSize: 13 }}>
          <thead><tr style={{ background: "#f8fafc", textAlign: "left", color: MUTED, fontSize: 11 }}>
            {["Persona", "Entrada", "Desde dónde", "Salida", "Horas / extra", "Camioneta", "Km tablero / GPS", "Alertas"].map(h => <th key={h} style={{ padding: "9px 10px" }}>{h}</th>)}</tr></thead>
          <tbody>{r.filas.map(f => <tr key={f.tipo + f.id} style={{ borderTop: "1px solid " + BORDER, verticalAlign: "top" }}>
            <td style={{ padding: "9px 10px" }}><b>{f.nombre}</b><div style={{ fontSize: 11, color: MUTED }}>{f.tipo === "oficina" ? "Oficina" : "Chofer"}</div></td>
            <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{f.falto ? <b style={{ color: ROSE }}>❌ Sin check-in</b> : <>{hhmm(f.entradaMs)}{f.tardeMin ? <div style={{ color: ROSE, fontSize: 12, fontWeight: 700 }}>⏰ {dur(f.tardeMin)} tarde</div> : <div style={{ color: GREEN, fontSize: 12, fontWeight: 700 }}>✓ a tiempo</div>}</>}</td>
            <td style={{ padding: "9px 10px", maxWidth: 220 }}>{f.lugarEntrada || "—"}</td>
            <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{f.falto ? "—" : f.salidaMs ? <>{hhmm(f.salidaMs)}<div style={{ fontSize: 11, color: MUTED, maxWidth: 180, whiteSpace: "normal" }}>{f.lugarSalida}</div></> : <span style={{ color: AMBER, fontWeight: 700 }}>⏳ sin salida</span>}</td>
            <td style={{ padding: "9px 10px", fontFamily: MONO, whiteSpace: "nowrap" }}>{f.horas !== null ? f.horas + " h" : "—"}
              {f.extraMin > 0 && <div style={{ color: BLUE, fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>+{dur(f.extraMin)} extra</div>}
              {f.salioAntesMin > 0 && <div style={{ color: AMBER, fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>salió {dur(f.salioAntesMin)} antes</div>}
              {f.sinSalidaRegistrada && <div style={{ color: AMBER, fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>sin salida registrada</div>}</td>
            <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12 }}>{f.placa || "—"}{f.odometroKm !== null && f.tipo === "chofer" ? <div style={{ color: MUTED }}>{f.odometroKm.toLocaleString("es-MX")} km</div> : null}</td>
            <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12 }}>{f.kmTablero !== null ? `${f.kmTablero} / ${f.kmGps ?? 0}` : "—"}</td>
            <td style={{ padding: "9px 10px", fontSize: 12 }}>{Object.entries(f.alertas).filter(([k]) => NOMBRE_ALERTA[k]).map(([k, n]) => <span key={k} style={{ display: "inline-block", marginRight: 6, color: TEXT }}>{NOMBRE_ALERTA[k]}{n > 1 ? ` ×${n}` : ""}</span>)}
              {!Object.keys(f.alertas).some(k => NOMBRE_ALERTA[k]) && <span style={{ color: MUTED }}>—</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>También te llega al celular a las 9:00 p.m. un resumen escrito del día. Los perfiles de prueba no cuentan.</div>
    </div>);
}
