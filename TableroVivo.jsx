/* 📺 TABLERO EN VIVO · el cronograma del día de toda la operación en una sola pantalla:
   cada ruta en su línea de tiempo (salida, paradas con hora pactada contra hora real, la raya de "ahora"),
   lo que va tarde en este momento, lo que sigue y los próximos días. Se actualiza solo.
   Sin montos. La lógica vive en cronograma.ts. */
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, BD2, DISP, MONO, boton } from "./uiBasico.jsx";
import { armarCronograma } from "./cronograma.ts";

const tarjeta = { background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 14px" };
const hhmm = ms => ms ? new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }) : "";
const diaBonito = f => { const d = /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) ? new Date(f + "T12:00:00") : null;
  return d ? d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "") : String(f || ""); };
const hora24 = ms => new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Mexico_City" }).slice(0, 2);
const dur = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `${m} min`;
const retraso = m => m === null || m === undefined ? "" : m > 0 ? `${dur(m)} tarde` : m < 0 ? `${dur(-m)} antes` : "a la hora";

/* Cómo se ve cada parada: forma + color + texto (nunca solo color). */
const ESTILO = {
  a_tiempo:   { color: GREEN, forma: "circulo", relleno: true,  icono: "✓", texto: "A tiempo" },
  tarde:      { color: ROSE,  forma: "rombo",   relleno: true,  icono: "!", texto: "Llegó tarde" },
  atrasada:   { color: ROSE,  forma: "circulo", relleno: false, icono: "⏰", texto: "Va tarde (aún no llega)" },
  pendiente:  { color: BLUE,  forma: "circulo", relleno: false, icono: "",  texto: "Pendiente" },
  incidencia: { color: AMBER, forma: "triangulo", relleno: true, icono: "⚠", texto: "Incidencia" },
};
function Marca({ semaforo, size = 14 }){
  const e = ESTILO[semaforo] || ESTILO.pendiente;
  const base = { width: size, height: size, boxSizing: "border-box", display: "inline-block", flex: "none" };
  if(e.forma === "rombo") return <span style={{ ...base, background: e.color, transform: "rotate(45deg) scale(.85)", borderRadius: 2, boxShadow: "0 0 0 2px #fff" }}/>;
  if(e.forma === "triangulo") return <span style={{ ...base, width: 0, height: 0, borderLeft: `${size / 2}px solid transparent`, borderRight: `${size / 2}px solid transparent`, borderBottom: `${size}px solid ${e.color}`, filter: "drop-shadow(0 0 1px #fff)" }}/>;
  return <span style={{ ...base, borderRadius: size, background: e.relleno ? e.color : "#fff", border: `2.5px solid ${e.color}`, boxShadow: "0 0 0 2px #fff" }}/>;
}

/** Suscribe las paradas de cada ruta (en vivo). */
function useParadas(db, ids){
  const [paradas, setParadas] = useState({});
  const clave = ids.join(",");
  useEffect(() => {
    const us = ids.map(id => onSnapshot(query(collection(db, "servicios", id, "paradas"), orderBy("orden")),
      s => setParadas(p => ({ ...p, [id]: s.docs.map(d => ({ id: d.id, ...d.data() })) })), () => {}));
    return () => us.forEach(u => u());
  }, [db, clave]);   // eslint-disable-line react-hooks/exhaustive-deps
  return paradas;
}

export default function TableroVivo({ db, dia, setDia, hoy, servicios = [], jornadas = [], proximas = [], alertasAbiertas = 0, onVerAlertas, onVerRutas }){
  const [ahoraMs, setAhoraMs] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhoraMs(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ids = useMemo(() => servicios.filter(s => s.estado !== "Cancelada").map(s => s.id).sort(), [servicios]);
  const paradas = useParadas(db, ids);
  const esHoy = dia === hoy;
  const c = useMemo(() => armarCronograma({ servicios, paradas, jornadas, dia, ahoraMs }), [servicios, paradas, jornadas, dia, ahoraMs]);
  const caja = useRef(null), carril = useRef(null);
  /* Al abrir (y al cambiar de día) el cronograma se recorre solo hasta "ahora" (o a la primera parada). */
  const hayFilas = c.filas.length > 0;
  useEffect(() => {
    const el = carril.current; if(!el) return;
    const foco = esHoy ? Date.now() : Math.min(...c.filas.flatMap(f => f.paradas.map(p => p.pactadaMs || Infinity)));
    if(!Number.isFinite(foco)) return;
    const frac = (foco - c.desdeMs) / (c.hastaMs - c.desdeMs);
    el.scrollLeft = Math.max(0, frac * el.scrollWidth - el.clientWidth * 0.6);
  }, [dia, hayFilas, c.desdeMs, c.hastaMs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [hover, setHover] = useState(null);
  const pantallaCompleta = () => { const el = caja.current; if(!el) return; if(document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.().catch(() => {}); };
  const manana = useMemo(() => { const d = new Date(Date.parse(hoy + "T12:00:00") + 86400000); return d.toISOString().slice(0, 10); }, [hoy]);

  const ancho = c.hastaMs - c.desdeMs, x = ms => `${Math.max(0, Math.min(100, (ms - c.desdeMs) / ancho * 100))}%`;
  const horas = []; for(let h = c.desdeMs; h <= c.hastaMs; h += 3600000) horas.push(h);
  const k = c.kpis;
  const tiles = [
    ["Rutas", k.rutas, TEXT, null], ["En ruta", k.enRuta, BLUE, null], ["Por salir", k.porSalir, TEXT, null],
    ["Paradas hechas", `${k.paradasHechas}/${k.paradasTotal}`, TEXT, null],
    ["Llegaron a tiempo", k.aTiempoPct === null ? "—" : k.aTiempoPct + " %", k.aTiempoPct === null ? MUTED : k.aTiempoPct >= 90 ? GREEN : k.aTiempoPct >= 70 ? AMBER : ROSE, null],
    ["Van tarde ahora", k.atrasadasAhora, k.atrasadasAhora ? ROSE : GREEN, null],
    ["Alertas abiertas", alertasAbiertas, alertasAbiertas ? ROSE : GREEN, onVerAlertas],
  ];
  const porDia = useMemo(() => { const m = {}; for(const s of proximas) (m[s.fechaServicio] = m[s.fechaServicio] || []).push(s); return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).slice(0, 7); }, [proximas]);

  return (
    <div ref={caja} style={{ background: "#f1f4fb", padding: 2, overflowY: "auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 240px" }}>
          <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 22, color: TEXT }}>📺 Tablero {esHoy ? "en vivo" : "del día"} · {diaBonito(dia)}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{esHoy ? `Se actualiza solo · ${hhmm(ahoraMs)}` : "Plan del día (todavía no empieza o ya pasó)"} · tolerancia {c.tolMin} min sobre la hora pactada</div>
        </div>
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setDia(hoy)} style={{ ...boton(esHoy ? BLUE : MUTED, !esHoy ? false : true), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>Hoy</button>
          <button onClick={() => setDia(manana)} style={{ ...boton(dia === manana ? BLUE : MUTED, dia === manana), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>Mañana</button>
          <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} style={{ border: "1.5px solid " + BD2, borderRadius: 10, padding: "5px 8px", fontSize: 13, fontFamily: "inherit" }}/>
          <button onClick={pantallaCompleta} style={{ ...boton(BLUE, false), padding: "6px 12px", minHeight: 34, fontSize: 13 }}>⛶ Pantalla completa</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 12 }}>
        {tiles.map(([t, v, color, fn]) => <div key={t} onClick={fn || undefined} style={{ ...tarjeta, cursor: fn ? "pointer" : "default" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{t}</div>
          <div style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800, color }}>{v}</div></div>)}
      </div>

      <div style={{ ...tarjeta, padding: 0, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid " + BORDER, fontSize: 12, color: MUTED }}>
          <b style={{ color: TEXT, fontSize: 14 }}>Cronograma</b>
          {Object.entries(ESTILO).map(([kk, e]) => <span key={kk} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Marca semaforo={kk} size={11}/>{e.texto}</span>)}
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 2, height: 12, background: MUTED, display: "inline-block" }}/>Hora pactada</span>
          {esHoy && <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 2, height: 12, background: ROSE, display: "inline-block" }}/>Ahora</span>}
        </div>
        {c.filas.length === 0 ? <div style={{ padding: 24, color: MUTED }}>No hay rutas el {diaBonito(dia)}.</div> :
        <div ref={carril} style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "max(900px, 100%)", position: "relative" }}>
            <div style={{ display: "flex", borderBottom: "1px solid " + BORDER }}>
              <div style={{ width: "min(230px, 38vw)", flex: "none", position: "sticky", left: 0, background: "#fff", zIndex: 2 }}/>
              <div style={{ flex: 1, position: "relative", height: 26 }}>
                {horas.filter((h, i) => horas.length <= 18 || i % 2 === 0).map(h => <span key={h} style={{ position: "absolute", left: x(h), top: 6, transform: "translateX(-50%)", fontSize: 10, color: MUTED, fontFamily: MONO }}>{hora24(h)}h</span>)}
              </div>
            </div>
            {c.filas.map(f => <div key={f.servicioId} style={{ display: "flex", borderBottom: "1px solid " + BORDER, minHeight: 58 }}>
              <div onClick={onVerRutas} style={{ width: "min(230px, 38vw)", flex: "none", padding: "8px 12px", position: "sticky", left: 0, background: "#fff", zIndex: 2, cursor: onVerRutas ? "pointer" : "default", borderRight: "1px solid " + BORDER }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.chofer}</div>
                <div style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ fontFamily: MONO }}>{f.folio}</span> · {f.empresa}{f.placa ? " · " + f.placa : ""}</div>
                <div style={{ fontSize: 11, marginTop: 2, color: f.atrasadas ? ROSE : f.activa ? BLUE : MUTED, fontWeight: 700 }}>
                  {f.atrasadas ? `⏰ ${f.atrasadas} va${f.atrasadas > 1 ? "n" : ""} tarde · ` : ""}{f.activa ? "En ruta" : f.total > 0 && f.hechas === f.total ? "Terminó" : f.estado === "Asignada" ? "Por salir" : f.estado} · {f.hechas}/{f.total}{f.foraneo ? " · foránea" : ""}</div>
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                {horas.map(h => <span key={h} style={{ position: "absolute", left: x(h), top: 0, bottom: 0, width: 1, background: "#eef2f8" }}/>)}
                {f.inicioMs && f.finMs && <span style={{ position: "absolute", left: x(f.inicioMs), width: `calc(${x(f.finMs)} - ${x(f.inicioMs)})`, top: "50%", height: 6, marginTop: -3, borderRadius: 4, background: f.activa ? BLUE : GREEN, opacity: .35 }}/>}
                {f.paradas.filter(p => p.semaforo !== "quitada").map(p => {
                  const real = p.llegadaMs ?? p.cerradaMs, en = real ?? p.pactadaMs;
                  if(!en) return null;
                  const info = `${p.orden}. ${p.nombre} · ${ESTILO[p.semaforo]?.texto || ""}${p.pactadaMs ? ` · pactada ${hhmm(p.pactadaMs)}` : " · sin hora pactada"}${real ? ` · llegó ${hhmm(real)}` : ""}${p.retrasoMin !== null ? ` · ${retraso(p.retrasoMin)}` : ""}`;
                  return <span key={p.id}>
                    {p.pactadaMs && <span style={{ position: "absolute", left: x(p.pactadaMs), top: "50%", marginTop: -11, width: 2, height: 22, background: MUTED, opacity: .55 }}/>}
                    {p.pactadaMs && real && Math.abs(real - p.pactadaMs) > 60000 && <span style={{ position: "absolute", left: x(Math.min(real, p.pactadaMs)), width: `calc(${x(Math.max(real, p.pactadaMs))} - ${x(Math.min(real, p.pactadaMs))})`, top: "50%", height: 2, marginTop: -1, background: p.semaforo === "tarde" ? ROSE : GREEN }}/>}
                    <span onMouseEnter={() => setHover({ f: f.servicioId, p: p.id, info })} onMouseLeave={() => setHover(null)} onClick={() => setHover(h => h?.p === p.id && h?.f === f.servicioId ? null : { f: f.servicioId, p: p.id, info })}
                      title={info} style={{ position: "absolute", left: x(en), top: "50%", transform: "translate(-50%,-50%)", padding: 6, cursor: "pointer", display: "inline-flex", zIndex: 1 }}><Marca semaforo={p.semaforo}/></span>
                    {hover?.f === f.servicioId && hover?.p === p.id && <span style={{ position: "absolute", left: x(en), bottom: "100%", transform: "translateX(-50%)", background: TEXT, color: "#fff", fontSize: 12, padding: "6px 10px", borderRadius: 8, whiteSpace: "nowrap", zIndex: 5, pointerEvents: "none" }}>{info}</span>}
                  </span>;
                })}
                {esHoy && ahoraMs >= c.desdeMs && ahoraMs <= c.hastaMs && <span style={{ position: "absolute", left: x(ahoraMs), top: 0, bottom: 0, width: 2, background: ROSE, zIndex: 1 }}/>}
              </div>
            </div>)}
          </div>
        </div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        <div style={tarjeta}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>⏭️ Lo que sigue</div>
          {c.siguientes.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>No hay paradas pendientes.</div> : c.siguientes.map(p =>
            <div key={p.folio + p.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid " + BORDER, fontSize: 13 }}>
              <Marca semaforo={p.semaforo} size={12}/>
              <b style={{ fontFamily: MONO, minWidth: 44 }}>{p.pactadaMs ? hhmm(p.pactadaMs) : "—"}</b>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 700 }}>{p.nombre}</span>
                <span style={{ display: "block", fontSize: 11, color: MUTED }}>{p.chofer} · {p.folio}{p.semaforo === "atrasada" ? <b style={{ color: ROSE }}> · ⏰ {retraso(p.retrasoMin)}</b> : null}</span></span>
            </div>)}
        </div>
        <div style={tarjeta}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>📅 Próximos días</div>
          {porDia.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>No hay rutas cargadas para los próximos días.</div> : porDia.map(([d, lista]) =>
            <div key={d} onClick={() => setDia(d)} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderTop: "1px solid " + BORDER, fontSize: 13, cursor: "pointer" }}>
              <b style={{ minWidth: 92 }}>{diaBonito(d)}</b>
              <span style={{ flex: 1 }}>{lista.length} ruta{lista.length > 1 ? "s" : ""}<span style={{ color: MUTED }}> · {lista.map(s => `${s.empresa}${s.choferNombre ? " (" + s.choferNombre.split(" ")[0] + ")" : " (sin chofer)"}`).join(", ")}</span></span>
              <span style={{ color: BLUE, fontWeight: 700, fontSize: 12 }}>Ver →</span>
            </div>)}
        </div>
      </div>
    </div>);
}
