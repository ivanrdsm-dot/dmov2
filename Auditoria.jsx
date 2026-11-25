/* 🔎 AUDITORÍA DE LA OFICINA (solo el director): qué rutas y lugares dio de alta cada quien, cuándo y con
   qué cliente, y las alertas de posibles viajes por fuera (movimiento sin ruta, km sin explicar, fuera de CDMX).
   Marca para revisar; no acusa. La lógica está en auditoria.ts. */
import { useEffect, useMemo, useState } from "react";
import { collection, query, where, limit, getDocs, Timestamp } from "firebase/firestore";
import { A, BLUE, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, boton, Chip } from "./uiBasico.jsx";
import { auditarServicios, lugaresNuevos, resumenPorPersona } from "./auditoria.ts";

const ms = v => v?.toMillis ? v.toMillis() : typeof v === "number" ? v : null;
const mesCDMX = (n = 0) => { const d = new Date(Date.now() - 6 * 3600000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = m => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const cuando = t => t ? new Date(t).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
const tarjeta = { background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" };
const ALERTAS_VIAJE = ["movimiento_sin_ruta", "km_sin_explicar", "fuera_de_cdmx", "unidad_no_coincide", "km_no_coinciden"];
const TITULO = { movimiento_sin_ruta: "Se movió sin ruta asignada", km_sin_explicar: "Kilómetros sin explicar", fuera_de_cdmx: "Fuera de CDMX sin ruta",
  unidad_no_coincide: "Usó otra camioneta", km_no_coinciden: "Tablero y GPS no coinciden" };

export default function Auditoria({ db }){
  const [mes, setMes] = useState(mesCDMX()), [datos, setDatos] = useState(null), [error, setError] = useState(""), [todas, setTodas] = useState(false);
  useEffect(() => {
    let vivo = true; setDatos(null); setError("");
    (async () => {
      const ini = mes + "-01", fin = mes + "-31", iniMs = Date.parse(ini + "T00:00:00-06:00");
      const d = new Date(mes + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1);
      const finMs = Date.parse(d.toISOString().slice(0, 7) + "-01T00:00:00-06:00");
      const [srv, usu, cue, lug, ale] = await Promise.all([
        getDocs(query(collection(db, "servicios"), where("fechaServicio", ">=", ini), where("fechaServicio", "<=", fin), limit(800))),
        getDocs(collection(db, "dmov_usuarios")),
        getDocs(collection(db, "cuentas")),
        getDocs(query(collection(db, "puntos_entrega"), where("creadoEn", ">=", Timestamp.fromMillis(iniMs)), where("creadoEn", "<", Timestamp.fromMillis(finMs)), limit(800))),
        getDocs(query(collection(db, "alertas_director"), where("ts", ">=", Timestamp.fromMillis(iniMs)), where("ts", "<", Timestamp.fromMillis(finMs)), limit(1000)))]);
      const admins = usu.docs.filter(x => x.data().rol === "admin").map(x => x.id);
      const nombres = Object.fromEntries(usu.docs.map(x => [x.id, String(x.data().nombre || x.data().email || x.id)]));
      const filas = auditarServicios(srv.docs.map(x => ({ id: x.id, ...x.data(), creadoEnMs: ms(x.data().creadoEn) })), { admins, clientes: cue.docs.map(x => String(x.data().nombre || "")) });
      const lugares = lugaresNuevos(lug.docs.map(x => ({ id: x.id, ...x.data(), creadoEnMs: ms(x.data().creadoEn) })), { admins, desdeMs: iniMs, hastaMs: finMs });
      const viajes = ale.docs.map(x => ({ id: x.id, ...x.data() })).filter(a => ALERTAS_VIAJE.includes(a.type)).sort((a, b) => ms(b.ts) - ms(a.ts));
      if(vivo) setDatos({ filas, lugares, viajes, personas: resumenPorPersona(filas, lugares, nombres) });
    })().catch(e => vivo && setError("No se pudieron leer los datos: " + String(e?.message || "").replace(/^.*?:\s*/, "")));
    return () => { vivo = false; };
  }, [db, mes]);
  const meses = useMemo(() => [mesCDMX(), mesCDMX(-1), mesCDMX(-2)], []);
  const visibles = datos ? (todas ? datos.filas : datos.filas.filter(f => f.banderas.length)) : [];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 40px", background: "#f1f4fb" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 26, color: TEXT, margin: 0 }}>Auditoría</h1>
          <p style={{ color: MUTED, fontSize: 14, margin: "4px 0 0" }}>Qué dio de alta cada persona de la oficina y señales de viajes por fuera. Solo tú ves esta pantalla. Marca para revisar; no acusa.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {meses.map(m => <button key={m} onClick={() => setMes(m)} style={{ ...boton(BLUE, mes === m), padding: "6px 14px", minHeight: 36, fontSize: 14 }}>{nombreMes(m)}</button>)}
        </div>
        {error && <div style={{ ...tarjeta, color: ROSE, fontWeight: 700 }}>{error}</div>}
        {!datos && !error && <div style={{ color: MUTED }}>Revisando…</div>}
        {datos && <>
          <div style={tarjeta}>
            <b style={{ fontSize: 16, color: TEXT }}>🕵️ Señales de viajes por fuera ({datos.viajes.length})</b>
            <div style={{ fontSize: 13, color: MUTED, margin: "2px 0 8px" }}>Choferes que se movieron sin ruta, km sin explicar, fuera de CDMX o con otra camioneta.</div>
            {datos.viajes.length === 0 ? <div style={{ fontSize: 14, color: MUTED }}>Sin señales en {nombreMes(mes)}.</div>
              : datos.viajes.map(a => <div key={a.id} style={{ borderTop: "1px solid " + BORDER, padding: "8px 0", fontSize: 14 }}>
                <b style={{ color: ROSE }}>{TITULO[a.type] || a.type}</b> <span style={{ color: MUTED, fontSize: 12 }}>· {cuando(ms(a.ts))}</span>
                <div style={{ color: TEXT }}>{a.message || a.msg}</div>
                {Number.isFinite(a.lat) && <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" style={{ color: BLUE, fontWeight: 700, fontSize: 13 }}>Ver dónde</a>}
              </div>)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
            {datos.personas.length === 0 && <div style={{ ...tarjeta, color: MUTED }}>La oficina no dio de alta rutas ni lugares en {nombreMes(mes)}.</div>}
            {datos.personas.map(p => <div key={p.uid} style={tarjeta}>
              <b style={{ fontSize: 16, color: TEXT }}>{p.nombre}</b>
              <div style={{ fontSize: 14, color: TEXT, marginTop: 6, lineHeight: 1.7 }}>
                {p.rutas} rutas dadas de alta · <b style={{ color: p.conBanderas ? AMBER : TEXT }}>{p.conBanderas} para revisar</b><br/>
                {p.fueraDeCatalogo} con cliente fuera del catálogo · {p.fueraDeHorario} fuera de horario · {p.canceladas} canceladas<br/>
                {p.lugaresNuevos} lugares nuevos
              </div>
            </div>)}
          </div>

          <div style={tarjeta}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 16, color: TEXT }}>Rutas de la oficina {todas ? "" : "para revisar"} ({visibles.length})</b>
              <button onClick={() => setTodas(x => !x)} style={{ ...boton(A, false), marginLeft: "auto", padding: "5px 12px", minHeight: 32, fontSize: 13 }}>{todas ? "Solo para revisar" : "Ver todas"}</button>
            </div>
            <div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
              <thead><tr style={{ color: MUTED, textAlign: "left", fontSize: 11 }}>{["Ruta", "Creada", "Por", "Cliente", "Chofer", "Estado", "Revisar"].map(h => <th key={h} style={{ padding: "4px 6px" }}>{h}</th>)}</tr></thead>
              <tbody>{visibles.map(f => <tr key={f.id} style={{ borderTop: "1px solid " + BORDER }}>
                <td style={{ padding: "5px 6px", fontFamily: MONO }}>{f.folio}</td><td style={{ padding: "5px 6px" }}>{cuando(f.creadoEnMs)}</td>
                <td style={{ padding: "5px 6px" }}>{f.creadoPorNombre || "—"}</td><td style={{ padding: "5px 6px" }}>{f.empresa || "—"}</td>
                <td style={{ padding: "5px 6px" }}>{f.choferNombre || "—"}{f.segundoChoferNombre ? " + " + f.segundoChoferNombre : ""}</td><td style={{ padding: "5px 6px" }}>{f.estado}</td>
                <td style={{ padding: "5px 6px" }}>{f.banderas.length ? f.banderas.map(b => <Chip key={b} color={b === "Cancelada" ? MUTED : AMBER}>{b}</Chip>) : "—"}</td></tr>)}</tbody></table></div>
          </div>

          {datos.lugares.length > 0 && <div style={tarjeta}>
            <b style={{ fontSize: 16, color: TEXT }}>Lugares nuevos que dio de alta la oficina ({datos.lugares.length})</b>
            <div style={{ fontSize: 13, color: MUTED, margin: "2px 0 8px" }}>Un destino que no es de un cliente aparece aquí.</div>
            {datos.lugares.map(l => <div key={l.id} style={{ borderTop: "1px solid " + BORDER, padding: "6px 0", fontSize: 14 }}>
              <b>{l.nombre || "Sin nombre"}</b> <span style={{ color: MUTED, fontSize: 12 }}>· {cuando(l.creadoEnMs)}{l.fueraDeHorario ? " · fuera de horario" : ""}</span>
              <div style={{ color: MUTED }}>{l.direccion || ""}</div></div>)}
          </div>}
        </>}
      </div>
    </div>);
}
