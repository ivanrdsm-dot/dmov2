/* 🏆 DESEMPEÑO DE OPERADORES (solo director): cuánto tarda cada chofer por ruta, puntualidad, evidencia,
   alertas y si califica a incentivo. Los números salen de lo que registró el servidor (desempeno.ts);
   el monto del incentivo lo decide el dueño (PENDIENTE). */
import { useEffect, useMemo, useState } from "react";
import { collection, query, where, limit, getDocs, Timestamp, doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, boton, Chip } from "./uiBasico.jsx";
import { tarjetasOperadores, volumenHistorico, costosOperador, resumenCamionetas, REGLAS_INCENTIVO } from "./desempeno.ts";

const ms = v => v?.toMillis ? v.toMillis() : typeof v === "number" ? v : null;
const mesCDMX = (n = 0) => { const d = new Date(Date.now() - 6 * 3600000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = m => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const horas = m => m == null ? "sin dato" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
const tarjeta = { background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" };
const pesos = n => "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const bonito = n => String(n || "").toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
const COLOR = { "Califica": GREEN, "Casi": AMBER, "No califica": MUTED };

function Dato({ t, v, sub, color = TEXT }){
  return <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{t}</div>
    <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 20, color, fontVariantNumeric: "tabular-nums" }}>{v}</div>
    {sub && <div style={{ fontSize: 12, color: MUTED }}>{sub}</div>}</div>;
}

/* 🤖 Resumen del día que escribe la IA con los números del sistema (21:00 automático, o con el botón). */
function ResumenIA({ db, app }){
  const hoy = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
  const [r, setR] = useState(null), [estado, setEstado] = useState("");
  useEffect(() => { getDoc(doc(db, "resumenes_ia", hoy)).then(s => setR(s.exists() ? s.data() : null)).catch(() => {}); }, [db, hoy]);
  const generar = async () => {
    setEstado("Escribiendo el resumen…");
    try { const { data } = await httpsCallable(getFunctions(app, "us-central1"), "oficinaResumenIA", { timeout: 120000 })({ fecha: hoy });
      if(data.vacio){ setEstado("Hoy todavía no hay actividad registrada."); return; } setR(data); setEstado(""); }
    catch(e){ setEstado("No se pudo: " + String(e?.message || "").replace(/^.*?:\s*/, "")); }
  };
  return <div style={{ ...tarjeta, borderColor: A + "66" }}>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <b style={{ fontSize: 16, color: TEXT }}>🤖 Resumen del día (IA)</b>
      <button onClick={generar} disabled={!!estado && estado.endsWith("…")} style={{ ...boton(A, false), marginLeft: "auto", padding: "5px 12px", minHeight: 32, fontSize: 13 }}>{r ? "Actualizar" : "Generar ahora"}</button>
    </div>
    {estado && <div style={{ fontSize: 13, color: estado.startsWith("No") ? ROSE : MUTED, marginTop: 6 }}>{estado}</div>}
    {r?.texto ? <div style={{ whiteSpace: "pre-wrap", fontSize: 14, color: TEXT, lineHeight: 1.6, marginTop: 8 }}>{r.texto}</div>
      : !estado && <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Se genera solo a las 9:00 p.m. y te llega al celular. Lo escribe la IA con los números del sistema; no inventa datos.</div>}
  </div>;
}

export default function Desempeno({ db, app }){
  const [mes, setMes] = useState(mesCDMX()), [datos, setDatos] = useState(null), [abierto, setAbierto] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let vivo = true; setDatos(null); setError("");
    (async () => {
      const ini = mes + "-01", fin = mes + "-31", iniMs = Date.parse(ini + "T00:00:00-06:00"), finMs = Date.parse(mesSiguiente(mes) + "-01T00:00:00-06:00");
      const [srv, jor, ale, aleDir, cho, his, gas] = await Promise.all([
        getDocs(query(collection(db, "servicios"), where("fechaServicio", ">=", ini), where("fechaServicio", "<=", fin), limit(600))),
        getDocs(query(collection(db, "jornadas"), where("fecha", ">=", ini), where("fecha", "<=", fin), limit(1000))),
        getDocs(query(collection(db, "alertas"), where("ts", ">=", Timestamp.fromMillis(iniMs)), where("ts", "<", Timestamp.fromMillis(finMs)), limit(2000))),
        getDocs(query(collection(db, "alertas_director"), where("ts", ">=", Timestamp.fromMillis(iniMs)), where("ts", "<", Timestamp.fromMillis(finMs)), limit(2000))),
        getDocs(collection(db, "choferes")),
        getDocs(query(collection(db, "servicios"), where("historico", "==", true), limit(1000))),
        getDocs(query(collection(db, "gastosChofer"), where("fechaTs", ">=", Timestamp.fromMillis(iniMs)), where("fechaTs", "<", Timestamp.fromMillis(finMs)), limit(2000)))]);
      const nombres = Object.fromEntries(cho.docs.map(d => [d.id, String(d.data().nombre || "")]));
      const prueba = new Set(cho.docs.filter(d => d.data().prueba === true).map(d => d.id));   // perfiles de prueba: no cuentan
      const deApp = srv.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.choferId && !s.historico && s.estado !== "Cancelada");
      const rutas = await Promise.all(deApp.map(async s => {
        const ps = await getDocs(collection(db, "servicios", s.id, "paradas")).catch(() => null);
        return { id: s.id, folio: s.folio, choferId: s.choferId, segundoChoferId: s.segundoChoferId || "", choferNombre: s.choferNombre, fechaServicio: s.fechaServicio, estado: s.estado,
          salidaMs: ms(s.estadoTs?.["En ruta"]), finMs: ms(s.estadoTs?.Entregada), estimadoManejoSeg: s.rutaDuracionSeg ?? null, km: s.rutaKm ?? null, foraneo: s.foraneo === true,
          paradas: (ps?.docs || []).map(d => { const p = d.data(), e = p.evidencia || {};
            return { tipo: p.tipo, estado: p.estado, llegadaMs: p.llegadaGpsMs ?? p.llegadaMs ?? null, cerradaMs: p.cerradaMs ?? ms(p.cerradaEn),
              incidencia: p.incidencia, conFoto: (e.fotos || []).length > 0, conFirmaOReceptor: !!(e.firmaRuta || e.receptor), porExcepcion: p.cerradaPorExcepcion === true, horaPactada: p.horaPactada || "" }; }) };
      }));
      const jornadas = jor.docs.map(d => d.data()).filter(j => j.choferId && !prueba.has(j.choferId));
      const alertas = [...ale.docs, ...aleDir.docs].map(d => d.data());
      const historico = volumenHistorico(his.docs.map(d => d.data()), nombres);
      const gastos = gas.docs.map(d => d.data());
      const tarjetas = tarjetasOperadores(rutas, jornadas, alertas, nombres).filter(t => !prueba.has(t.choferId)).map(t => ({ ...t, costos: costosOperador(t.choferId, jornadas, gastos) }));
      if(vivo) setDatos({ tarjetas, historico, rutasMes: rutas.length, camionetas: resumenCamionetas(jornadas, gastos) });
    })().catch(e => vivo && setError("No se pudieron leer los datos: " + String(e?.message || "").replace(/^.*?:\s*/, "")));
    return () => { vivo = false; };
  }, [db, mes]);

  const meses = useMemo(() => [mesCDMX(), mesCDMX(-1), mesCDMX(-2)], []);
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 40px", background: "#f1f4fb" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 26, color: TEXT, margin: 0 }}>Desempeño de operadores</h1>
          <p style={{ color: MUTED, fontSize: 14, margin: "4px 0 0" }}>Cuánto tarda cada chofer por ruta y si califica a incentivo. Solo cuenta lo que registró el sistema.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {meses.map(m => <button key={m} onClick={() => setMes(m)} style={{ ...boton(BLUE, mes === m), padding: "6px 14px", minHeight: 36, fontSize: 14 }}>{nombreMes(m)}</button>)}
        </div>
        {app && <ResumenIA db={db} app={app}/>}
        {error && <div style={{ ...tarjeta, color: ROSE, fontWeight: 700 }}>{error}</div>}
        {!datos && !error && <div style={{ color: MUTED }}>Calculando…</div>}

        {datos && <>
          <div style={{ ...tarjeta, background: BLUE + "0d", borderColor: BLUE + "55", fontSize: 14, color: TEXT, lineHeight: 1.6 }}>
            <b>Eficiencia</b>: su tiempo manejando contra lo que estimó el mapa para esa misma ruta (100 % = lo estimado; más = más rápido). No cuentan las esperas en el cliente.
            <div style={{ marginTop: 6 }}><b>Califica a incentivo</b> si cumple: {REGLAS_INCENTIVO.minRutas}+ rutas, puntualidad {REGLAS_INCENTIVO.puntualidadMin} %+, evidencia {REGLAS_INCENTIVO.evidenciaMin} %+, eficiencia {REGLAS_INCENTIVO.eficienciaMin} %+ y cero alertas de posible engaño.
              Son reglas propuestas para arrancar. <b>Monto del incentivo: PENDIENTE (lo decides tú).</b></div>
          </div>

          {datos.tarjetas.length === 0 && <div style={{ ...tarjeta, color: MUTED, fontSize: 15 }}>
            En {nombreMes(mes)} todavía no hay rutas terminadas ni check-ins en la app. En cuanto los choferes hagan su día y cierren entregas, aquí aparece cuánto tarda cada uno.</div>}

          {datos.tarjetas.map(t => <div key={t.choferId} style={tarjeta}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 18, color: TEXT }}>{bonito(t.nombre)}</b>
              <Chip color={COLOR[t.incentivo.estado] || MUTED}>{t.incentivo.estado === "Califica" ? "🏆 " : ""}{t.incentivo.estado} · {t.incentivo.cumple}/{t.incentivo.total}</Chip>
              {t.trampas > 0 && <Chip color={ROSE}>🛑 {t.trampas} alerta{t.trampas > 1 ? "s" : ""} de posible engaño</Chip>}
              <button onClick={() => setAbierto(abierto === t.choferId ? "" : t.choferId)} style={{ ...boton(A, false), marginLeft: "auto", padding: "5px 12px", minHeight: 32, fontSize: 13 }}>{abierto === t.choferId ? "Cerrar" : "Ver detalle"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginTop: 12 }}>
              <Dato t="Rutas" v={t.rutas} sub={`${t.entregas} entregas`}/>
              <Dato t="Promedio por ruta" v={horas(t.minPromedioRuta)} sub={t.minPorParada != null ? `${t.minPorParada} min por parada` : ""}/>
              <Dato t="Eficiencia" v={t.eficiencia == null ? "sin dato" : t.eficiencia + " %"} color={t.eficiencia == null ? MUTED : t.eficiencia >= REGLAS_INCENTIVO.eficienciaMin ? GREEN : AMBER}/>
              <Dato t="Puntualidad" v={t.puntualidad == null ? "sin dato" : t.puntualidad + " %"} sub={t.retardos ? `${t.retardos} retardo${t.retardos > 1 ? "s" : ""} · ${t.minTarde} min` : t.diasTrabajados ? `${t.diasTrabajados} día${t.diasTrabajados > 1 ? "s" : ""}` : ""}
                color={t.puntualidad == null ? MUTED : t.puntualidad >= REGLAS_INCENTIVO.puntualidadMin ? GREEN : ROSE}/>
              <Dato t="Evidencia" v={t.evidencia == null ? "sin dato" : t.evidencia + " %"} sub={t.incidencias ? `${t.incidencias} incidencias` : ""} color={t.evidencia == null ? MUTED : t.evidencia >= REGLAS_INCENTIVO.evidenciaMin ? GREEN : AMBER}/>
              <Dato t="A tiempo con cliente" v={t.aTiempoCliente == null ? "sin horas" : t.aTiempoCliente + " %"} sub={t.conPactada ? `${t.conPactada} con hora pactada${t.minTardeCliente ? ` · ${t.minTardeCliente} min tarde` : ""}` : "pacta horas al asignar"}
                color={t.aTiempoCliente == null ? MUTED : t.aTiempoCliente >= REGLAS_INCENTIVO.aTiempoClienteMin ? GREEN : ROSE}/>
              <Dato t="Alertas de ruta" v={t.alertasOperacion} color={t.alertasOperacion ? AMBER : TEXT}/>
              <Dato t="Kilómetros" v={t.costos.km ? t.costos.km.toLocaleString("es-MX") + " km" : "sin dato"} sub={t.costos.kmGps ? `GPS ${t.costos.kmGps.toLocaleString("es-MX")} km` : ""} color={t.costos.km ? TEXT : MUTED}/>
              <Dato t="Gasolina" v={t.costos.gasolina ? pesos(t.costos.gasolina) : "sin cargas"} sub={t.costos.litros ? `${t.costos.litros} L${t.costos.costoGasKm ? ` · ${pesos(t.costos.costoGasKm)}/km` : ""}` : ""} color={t.costos.gasolina ? TEXT : MUTED}/>
              <Dato t="Otros gastos" v={t.costos.otros ? pesos(t.costos.otros) : "$0"} sub={t.costos.gastosDudosos ? `⚠️ ${t.costos.gastosDudosos} que no cuadran` : ""} color={t.costos.gastosDudosos ? ROSE : TEXT}/>
            </div>
            {abierto === t.choferId && <div style={{ marginTop: 12, borderTop: "1px solid " + BORDER, paddingTop: 10, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 4 }}>{t.incentivo.reglas.map(r => <div key={r.regla} style={{ fontSize: 14, color: r.ok ? GREEN : ROSE }}>{r.ok ? "✓" : "✗"} {r.regla} <span style={{ color: MUTED }}>· {r.valor}</span></div>)}</div>
              {t.medidas.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead><tr style={{ color: MUTED, textAlign: "left", fontSize: 11 }}>{["Ruta", "Día", "Paradas", "Total", "En sitio", "Manejo", "Estimado", "Eficiencia"].map(h => <th key={h} style={{ padding: "4px 6px" }}>{h}</th>)}</tr></thead>
                <tbody>{t.medidas.map(m => <tr key={m.id} style={{ borderTop: "1px solid " + BORDER, fontVariantNumeric: "tabular-nums" }}>
                  <td style={{ padding: "5px 6px", fontFamily: MONO }}>{m.folio}{m.foraneo ? " 🛣️" : ""}</td><td style={{ padding: "5px 6px" }}>{m.fecha.slice(5)}</td><td style={{ padding: "5px 6px" }}>{m.paradas}</td>
                  <td style={{ padding: "5px 6px" }}>{horas(m.totalMin)}</td><td style={{ padding: "5px 6px" }}>{horas(m.enSitioMin)}</td><td style={{ padding: "5px 6px" }}>{horas(m.manejoMin)}</td>
                  <td style={{ padding: "5px 6px" }}>{horas(m.estimadoMin)}</td><td style={{ padding: "5px 6px", fontWeight: 800 }}>{m.eficiencia == null ? "—" : m.eficiencia + " %"}</td></tr>)}</tbody></table></div>}
            </div>}
          </div>)}

          {datos.camionetas.length > 0 && <div style={tarjeta}>
            <b style={{ fontSize: 16, color: TEXT }}>Camionetas · {nombreMes(mes)}</b>
            <div style={{ fontSize: 13, color: MUTED, margin: "2px 0 8px" }}>Kilómetros del tablero (check-in a check-out) y cargas de gasolina con ticket. Rendimiento = km ÷ litros.</div>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
              <thead><tr style={{ color: MUTED, textAlign: "left", fontSize: 11 }}>{["Placa", "Días", "Km", "Cargas", "Litros", "Gasolina", "Rendimiento", "$ por km", "$ por litro"].map(h => <th key={h} style={{ padding: "4px 6px" }}>{h}</th>)}</tr></thead>
              <tbody>{datos.camionetas.map(c => <tr key={c.placa} style={{ borderTop: "1px solid " + BORDER, fontVariantNumeric: "tabular-nums" }}>
                <td style={{ padding: "5px 6px", fontFamily: MONO, fontWeight: 700 }}>{c.placa}{c.dudas ? " ⚠️" : ""}</td><td style={{ padding: "5px 6px" }}>{c.dias}</td>
                <td style={{ padding: "5px 6px" }}>{c.km.toLocaleString("es-MX")}</td><td style={{ padding: "5px 6px" }}>{c.cargas}</td><td style={{ padding: "5px 6px" }}>{c.litros || "—"}</td>
                <td style={{ padding: "5px 6px" }}>{c.gasto ? pesos(c.gasto) : "—"}</td><td style={{ padding: "5px 6px", fontWeight: 800 }}>{c.rendimiento ? c.rendimiento + " km/L" : "sin dato"}</td>
                <td style={{ padding: "5px 6px" }}>{c.costoKm ? pesos(c.costoKm) : "—"}</td><td style={{ padding: "5px 6px" }}>{c.precioLitro ? pesos(c.precioLitro) : "—"}</td></tr>)}</tbody></table></div>
          </div>}

          {datos.historico.length > 0 && <div style={tarjeta}>
            <b style={{ fontSize: 16, color: TEXT }}>Viajes por chofer · bitácora de Ilse (antes de la app)</b>
            <div style={{ fontSize: 13, color: MUTED, margin: "2px 0 8px" }}>Solo cantidad: la bitácora no tiene horas, así que no mide tiempos.</div>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ color: MUTED, textAlign: "left", fontSize: 11 }}><th style={{ padding: "4px 6px" }}>Chofer</th><th style={{ padding: "4px 6px" }}>Viajes</th><th style={{ padding: "4px 6px" }}>Por mes</th></tr></thead>
              <tbody>{datos.historico.map(h => <tr key={h.choferId} style={{ borderTop: "1px solid " + BORDER }}>
                <td style={{ padding: "5px 6px", fontWeight: 700 }}>{bonito(h.nombre)}</td><td style={{ padding: "5px 6px", fontVariantNumeric: "tabular-nums" }}>{h.viajes}</td>
                <td style={{ padding: "5px 6px", color: MUTED }}>{Object.entries(h.porMes).sort().map(([m, n]) => `${MESES[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${n}`).join(" · ")}</td></tr>)}</tbody></table></div>
          </div>}
        </>}
      </div>
    </div>);
}
function mesSiguiente(m){ const d = new Date(m + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); }
