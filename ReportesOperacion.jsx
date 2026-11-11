/* REPORTES DE OPERACIÓN · el flujo completo en una pantalla, en vivo.
   Solo cuenta lo que está capturado: lo que no se puede medir aparece como "sin datos". */
import { useEffect, useMemo, useState } from "react";
import { BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, etiqueta, boton, dinero, fechaHora, Campo, Chip, Seccion } from "./uiBasico.jsx";
import { PERIODOS, periodoDe, reporteOperacion, csvServicios, csvCotizaciones, csvSolicitudes } from "./reportes.ts";
import { textoDuracion } from "./functions/lib/solicitudes.js";
import { ESTADOS_SERVICIO } from "./servicios.ts";
import { ESTADOS_COTIZACION } from "./cotizaciones.ts";

const TOPE = 300;                               // cada lista en vivo trae los 300 registros más recientes
const sd = v => v === null || v === undefined ? "sin datos" : v;
const porc = v => v === null || v === undefined ? "sin datos" : v + " %";
const descargar = (nombre, csv) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

const Dato = ({ valor, nombre, nota }) => <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 16px", flex: "1 1 170px", minWidth: 0 }}>
  <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: valor === "sin datos" ? 16 : 24, color: valor === "sin datos" ? MUTED : TEXT }}>{valor}</div>
  <div style={{ fontSize: 12, color: MUTED }}>{nombre}</div>{nota && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{nota}</div>}</div>;

/* Barras horizontales de una sola serie: el título dice qué es, el valor va escrito al lado. */
const Barras = ({ filas, max }) => { const m = Math.max(1, max ?? Math.max(...filas.map(f => f.n), 0));
  return <div role="list">{filas.map(f => <div role="listitem" key={f.nombre} title={`${f.nombre}: ${f.n}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(60px,1fr) 44px", gap: 10, alignItems: "center", padding: "5px 0" }}>
    <span style={{ fontSize: 13, color: TEXT, overflowWrap: "anywhere", lineHeight: 1.3 }}>{f.nombre}</span>
    <span style={{ height: 14, background: BORDER, borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", width: (f.n / m * 100) + "%", minWidth: f.n ? 3 : 0, height: "100%", background: BLUE, borderRadius: "0 4px 4px 0" }}/></span>
    <b style={{ fontFamily: MONO, fontSize: 13, textAlign: "right", color: TEXT }}>{f.n}</b></div>)}</div>; };

/* Actividad por día: una gráfica por medida (misma escala), con el detalle al pasar el cursor. */
const Actividad = ({ dias, campo, titulo }) => { const total = dias.reduce((a, d) => a + d[campo], 0), max = Math.max(1, ...dias.map(d => d[campo]));
  return <div style={{ flex: "1 1 260px", minWidth: 0 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><b>{titulo}</b><span style={{ fontFamily: MONO, color: TEXT }}>{total}</span></div>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64, borderBottom: "1px solid " + BORDER }}>
      {dias.map(d => <span key={d.dia} title={`${d.dia}: ${d[campo]}`} style={{ flex: 1, minWidth: 1, display: "flex", alignItems: "flex-end", height: "100%" }}>
        <span style={{ display: "block", width: "100%", height: (d[campo] / max * 100) + "%", minHeight: d[campo] ? 3 : 0, background: BLUE, borderRadius: "3px 3px 0 0" }}/></span>)}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, marginTop: 3 }}><span>{dias[0]?.dia.slice(5)}</span><span>máx. {max === 1 && total === 0 ? 0 : max} por día</span><span>{dias[dias.length - 1]?.dia.slice(5)}</span></div>
  </div>; };

const Tabla = ({ columnas, filas, vacio }) => filas.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>{vacio}</div> :
  <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
    <thead><tr>{columnas.map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: MUTED, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
    <tbody>{filas.map((f, i) => <tr key={i} style={{ borderBottom: "1px solid " + BORDER }}>{f.map((c, j) => <td key={j} style={{ padding: "6px 8px", fontFamily: j ? MONO : "inherit" }}>{c}</td>)}</tr>)}</tbody></table></div>;

export default function ReportesOperacion({ solicitudesStore, cotizacionesStore, serviciosStore }){
  const [sol, setSol] = useState(null), [cot, setCot] = useState(null), [srv, setSrv] = useState(null), [con, setCon] = useState({});
  const [clave, setClave] = useState("30d"), [ahora, setAhora] = useState(Date.now()), [error, setError] = useState("");
  useEffect(() => solicitudesStore.suscribir(setSol, e => { setSol([]); setError(e.message); }), [solicitudesStore]);
  useEffect(() => cotizacionesStore.suscribir(setCot, e => { setCot([]); setError(e.message); }), [cotizacionesStore]);
  useEffect(() => serviciosStore.suscribir(setSrv, e => { setSrv([]); setError(e.message); }), [serviciosStore]);
  useEffect(() => solicitudesStore.suscribirConectores(setCon), [solicitudesStore]);
  const [vig, setVig] = useState({});
  useEffect(() => solicitudesStore.suscribirVigilante ? solicitudesStore.suscribirVigilante(setVig) : undefined, [solicitudesStore]);
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 60000); return () => clearInterval(t); }, []);
  const listo = sol && cot && srv;
  const periodo = useMemo(() => periodoDe(clave, ahora), [clave, ahora]);
  const r = useMemo(() => listo ? reporteOperacion({ solicitudes: sol, cotizaciones: cot, servicios: srv }, periodo, ahora) : null, [listo, sol, cot, srv, periodo, ahora]);
  const nombres = PERIODOS.map(p => p[1]);
  const correo = con.gmail, minLatido = correo?.ultimoLatido ? Math.round((ahora - correo.ultimoLatido) / 60000) : null;
  const minVig = vig.ultimaCorrida ? Math.round((ahora - vig.ultimaCorrida) / 60000) : null;
  const topado = listo && [sol, cot, srv].some(x => x.length >= TOPE);
  if(!r) return <div style={{ padding: 40, color: MUTED }}>Cargando reportes…</div>;
  const S = r.solicitudes, C = r.cotizaciones, V = r.servicios, sufijo = periodo.clave + "-" + new Date(ahora).toISOString().slice(0, 10) + ".csv";
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 240 }}><h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>Reportes de operación</h1>
          <div style={{ fontSize: 13, color: MUTED }}>De la solicitud a la entrega, en vivo. Actualizado {fechaHora(ahora)}.</div></div>
        <div style={{ flex: "0 1 220px" }}><Campo label="Periodo" opciones={nombres} value={periodo.nombre} onChange={e => setClave(PERIODOS.find(p => p[1] === e.target.value)[0])}/></div>
      </div>
      {error && <div role="alert" style={{ background: ROSE + "10", border: "1px solid " + ROSE + "50", color: ROSE, borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>No se pudo leer parte de la información: {error}</div>}
      {topado && <div style={{ background: AMBER + "10", border: "1px solid " + AMBER + "50", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>El reporte usa los {TOPE} registros más recientes de cada tipo. Si el periodo tiene más, los totales quedan cortos.</div>}

      <Seccion titulo="Estado del sistema">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
          <Chip color={minLatido === null ? MUTED : minLatido <= 5 ? GREEN : ROSE}>{minLatido === null ? "Correo: sin señal registrada" : minLatido <= 5 ? "Correo conectado" : `Correo sin señal hace ${textoDuracion(minLatido)}`}</Chip>
          {correo?.ultimoLatido && <span style={{ color: MUTED }}>Última revisión del buzón: {fechaHora(correo.ultimoLatido)}</span>}
          <Chip color={minVig === null ? MUTED : minVig <= 15 ? GREEN : ROSE}>{minVig === null ? "Alertas automáticas: sin corrida registrada" : minVig <= 15 ? `Alertas automáticas activas · ${vig.abiertas || 0} abiertas` : `Alertas automáticas sin correr hace ${textoDuracion(minVig)}`}</Chip>
          <span style={{ color: MUTED }}>· {sol.length} solicitudes, {cot.length} cotizaciones y {srv.length} servicios en el sistema</span>
        </div>
      </Seccion>

      <Seccion titulo={`Embudo · ${periodo.nombre.toLowerCase()}`}>
        <Barras filas={r.embudo.map(e => ({ nombre: e.etapa, n: e.n }))}/>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Cada renglón cuenta los registros que entraron en el periodo; no son las mismas solicitudes seguidas etapa por etapa.</div>
      </Seccion>

      <Seccion titulo="Actividad por día">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Actividad dias={r.actividad} campo="solicitudes" titulo="Solicitudes recibidas"/>
          <Actividad dias={r.actividad} campo="cotizaciones" titulo="Cotizaciones emitidas"/>
          <Actividad dias={r.actividad} campo="servicios" titulo="Servicios registrados"/>
        </div>
      </Seccion>

      <Seccion titulo="Solicitudes">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Dato valor={S.recibidas} nombre="Recibidas" nota={S.descartadas ? `${S.descartadas} no eran solicitudes` : ""}/>
          <Dato valor={S.medianaMinRespuesta === null ? "sin datos" : textoDuracion(S.medianaMinRespuesta)} nombre="Primera respuesta (mediana)" nota="Minutos hábiles"/>
          <Dato valor={porc(S.pctDentroDeMeta)} nombre={`Respondidas en ${S.metaMin} min o menos`} nota={`${S.respondidas} respondidas`}/>
          <Dato valor={S.sinResponder} nombre="Sin responder"/>
          <Dato valor={porc(S.pctConversion)} nombre="Se volvieron servicio" nota={`${S.convertidas} de ${S.recibidas - S.descartadas} · ${S.cotizadas} cotizadas`}/>
        </div>
        <span style={etiqueta}>Por canal</span>
        {S.porCanal.length ? <Barras filas={S.porCanal}/> : <div style={{ fontSize: 13, color: MUTED }}>Sin solicitudes en el periodo.</div>}
      </Seccion>

      <Seccion titulo="Cotizaciones">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Dato valor={C.emitidas} nombre="Emitidas" nota={`${C.aprobadas} aprobadas · ${C.enviadas} enviadas`}/>
          <Dato valor={porc(C.tasaCierrePct)} nombre="Aceptadas de las respondidas" nota={`${C.aceptadas} aceptadas · ${C.rechazadas} rechazadas`}/>
          <Dato valor={C.montoAceptado ? dinero(C.montoAceptado) : C.emitidas ? "$0" : "sin datos"} nombre="Monto aceptado sin IVA" nota={C.montoPropuesto ? `${dinero(C.montoPropuesto)} propuesto` : ""}/>
          <Dato valor={C.medianaMinSolicitudACotizacion === null ? "sin datos" : textoDuracion(C.medianaMinSolicitudACotizacion)} nombre="De solicitud a cotización (mediana)" nota="Tiempo de reloj"/>
          <Dato valor={C.medianaMinAprobacion === null ? "sin datos" : textoDuracion(C.medianaMinAprobacion)} nombre="Espera de aprobación (mediana)"/>
        </div>
        <span style={etiqueta}>Por estado</span>
        {C.emitidas ? <Barras filas={ESTADOS_COTIZACION.filter(e => C.porEstado[e]).map(e => ({ nombre: e, n: C.porEstado[e] }))}/> : <div style={{ fontSize: 13, color: MUTED }}>Sin cotizaciones en el periodo.</div>}
      </Seccion>

      <Seccion titulo="Servicios">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Dato valor={V.creados} nombre="Registrados" nota={V.cancelados ? `${V.cancelados} cancelados` : ""}/>
          <Dato valor={V.entregados} nombre="Entregados"/>
          <Dato valor={porc(V.pctEnFecha)} nombre="Entregados en la fecha pactada" nota={V.entregados ? `${V.entregadosEnFecha} en fecha` : "Se mide al registrar la entrega"}/>
          <Dato valor={V.montoAprobado ? dinero(V.montoAprobado) : V.creados ? "$0" : "sin datos"} nombre="Monto con precio aprobado, sin IVA" nota={V.sinPrecioAprobado ? `${V.sinPrecioAprobado} sin precio aprobado` : ""}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 }}>
          <div><span style={etiqueta}>Por estado</span>{V.creados ? <Barras filas={[...ESTADOS_SERVICIO, "Cancelada"].filter(e => V.porEstado[e]).map(e => ({ nombre: e, n: V.porEstado[e] }))}/> : <div style={{ fontSize: 13, color: MUTED }}>Sin servicios en el periodo.</div>}</div>
          <div><span style={etiqueta}>Por cliente</span><Tabla columnas={["Cliente", "Servicios", "Monto aprobado"]} filas={V.porCliente.slice(0, 10).map(c => [c.nombre, c.n, c.monto ? dinero(c.monto) : "—"])} vacio="Sin servicios en el periodo."/></div>
          <div><span style={etiqueta}>Por unidad</span><Tabla columnas={["Placas", "Servicios"]} filas={V.porUnidad.slice(0, 10).map(u => [u.nombre, u.n])} vacio="Ningún servicio del periodo tiene unidad asignada."/></div>
          <div><span style={etiqueta}>Propia o proveedor</span><Tabla columnas={["Asignación", "Servicios"]} filas={V.porAsignacion.map(u => [u.nombre, u.n])} vacio="Ningún servicio del periodo tiene asignación."/></div>
        </div>
      </Seccion>

      <Seccion titulo="Descargar el detalle del periodo">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => descargar("solicitudes-" + sufijo, csvSolicitudes(sol, periodo))} style={boton(BLUE, false)}>Solicitudes (CSV)</button>
          <button onClick={() => descargar("cotizaciones-" + sufijo, csvCotizaciones(cot, periodo))} style={boton(BLUE, false)}>Cotizaciones (CSV)</button>
          <button onClick={() => descargar("servicios-" + sufijo, csvServicios(srv, periodo))} style={boton(BLUE, false)}>Servicios (CSV)</button>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Se abren en Excel. Incluyen precios internos: no son para enviar al cliente.</div>
      </Seccion>
    </div>);
}
