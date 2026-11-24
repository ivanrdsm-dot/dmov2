/* PRESENTACIÓN A SOCIOS · D en Movimiento, paso a paso, con datos reales.
   Fuentes: el cierre contable del despacho (cierresContables, cargado de los estados financieros
   firmados por la C.P.) y el sistema (facturas, servicios). Cada número dice de dónde sale.
   Diseño limpio tipo Apple: fondo claro, tarjetas blancas, números grandes, gráficas simples. */
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { resumenFacturacion, conciliacionContable, estadoResultados } from "./finanzas.ts";
import { resumenHistorial } from "./historialRutas.ts";
import { C, CSS, ORDEN_PERIODOS, num, pct, dinero, Barras, BarrasH, Apiladas, Cascada, Linea, Dato } from "./graficasApple.jsx";

export default function Socios({ db }){
  const [cierre, setCierre] = useState(null), [facturas, setFacturas] = useState([]), [servicios, setServicios] = useState([]), [error, setError] = useState("");
  const [i, setI] = useState(0), [modo, setModo] = useState("presentar");
  useEffect(() => { (async () => {
    try {
      const [c, f, s] = await Promise.all([getDocs(query(collection(db, "cierresContables"), orderBy("corte", "desc"), limit(1))), getDocs(collection(db, "facturas")), getDocs(query(collection(db, "servicios"), limit(2000)))]);
      setCierre(c.docs[0]?.data() || {}); setFacturas(f.docs.map(d => ({ id: d.id, ...d.data() }))); setServicios(s.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e){ setError(e.message); setCierre({}); }
  })(); }, [db]);

  const hojas = useMemo(() => {
    if(!cierre) return [];
    const er = cierre.estadoResultados, res = cierre.resultados || {}, bal = cierre.balance || {}, corte = cierre.corte || "", periodoTxt = er?.periodo || "Ene–Sep 2026";
    const corteTxt = corte ? new Date(corte + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "";
    const fuenteDespacho = `Estados financieros al ${corteTxt} del despacho contable (${(cierre.fuente || "").replace(/^.*\(/, "").replace(/\)$/, "") || "C.P. del despacho"}).`;
    const anio = Number(String(corte).slice(0, 4)) || new Date().getFullYear();
    const fac = resumenFacturacion(facturas, { anio });
    const conc = conciliacionContable(facturas, cierre.cuentasPorCobrar || {}, corte);
    const estado = er ? estadoResultados(er) : null;
    const periodos = Object.entries(res.ingresosPorPeriodo || {}).sort((a, b) => ORDEN_PERIODOS.indexOf(a[0]) - ORDEN_PERIODOS.indexOf(b[0])).map(([k, v]) => ({ k, v: num(v), nota: k.includes("-") ? "dos meses juntos" : "" }));
    const mejor = periodos.reduce((m, p) => p.v > (m?.v ?? -1) ? p : m, null), ultimo = periodos.at(-1);
    const clientes = Object.entries(cierre.clientes || {}).map(([k, v]) => ({ k, v: num(v.ytd) })).sort((a, b) => b.v - a.v);
    const totalCli = clientes.reduce((s, c) => s + c.v, 0), top2 = clientes.slice(0, 2);
    const costos = Object.entries(res.costosPorCategoria || {}).map(([k, v]) => ({ k, v: num(v.ytd) })).sort((a, b) => b.v - a.v);
    const totalCostos = costos.reduce((s, c) => s + c.v, 0);
    const creski = Object.entries(cierre.creskiHistorico || {}).map(([k, v]) => ({ k: k[0].toUpperCase() + k.slice(1, 3), v: num(v) })).sort((a, b) => ORDEN_PERIODOS.indexOf(a.k) - ORDEN_PERIODOS.indexOf(b.k));
    const viajes = resumenHistorial(servicios);
    const mesesFac = fac.meses.filter(m => m.facturado > 0).map(m => ({ k: m.mes, cobrado: m.cobrado, pendiente: m.pendiente }));
    const H = [];
    H.push({ seccion: "Inicio", portada: true, titulo: "D en Movimiento", mensaje: `Resultados ${periodoTxt}, explicados paso a paso.`,
      contenido: <div className="rej"><Dato valor={dinero(er?.ventas)} etiqueta="Ventas del periodo"/><Dato valor={dinero(er?.resultado)} etiqueta="Resultado del periodo" color={num(er?.resultado) < 0 ? C.rojo : C.verde}/>
        <Dato valor={dinero(er?.cajaYBancos ?? (num(bal.caja) + num(bal.bancos)))} etiqueta="Efectivo en caja y bancos"/><Dato valor={dinero(er?.clientes ?? bal.clientes)} etiqueta="Lo que nos deben los clientes"/></div>,
      fuente: fuenteDespacho + " Facturas y viajes: sistema DMOV, al día de hoy." });
    if(periodos.length) H.push({ seccion: "Ventas", titulo: "¿Cuánto vendimos?", mensaje: `${dinero(er?.ventas ?? periodos.reduce((s, p) => s + p.v, 0))} en el periodo, ${dinero(res.ingresoPromedioMensual)} al mes en promedio. El mejor periodo fue ${mejor?.k} (${dinero(mejor?.v)}); el último registrado, ${ultimo?.k}, fue de ${dinero(ultimo?.v)}.${periodos.filter(p => p.v === 0).length ? ` En ${periodos.filter(p => p.v === 0).map(p => p.k).join(" y ")} la contabilidad no registra ingresos.` : ""}`,
      contenido: <Barras datos={periodos}/>, fuente: fuenteDespacho + " Julio y agosto vienen juntos en la contabilidad (el despacho los repartió como estimación).",
      calculo: "Ventas = ingresos por servicios del estado de resultados" + (er?.celdas?.ventas ? ` (celda ${er.celdas.ventas})` : "") + ". Promedio = ventas ÷ meses." });
    if(clientes.length) H.push({ seccion: "Clientes", titulo: "¿Quién nos compra?", mensaje: `${clientes.length} clientes facturados en el periodo. ${top2.map(c => c.k).join(" y ")} suman el ${pct(top2.reduce((s, c) => s + c.v, 0), totalCli)}% de las ventas.`,
      contenido: <BarrasH datos={clientes.map(c => ({ ...c, extra: pct(c.v, totalCli) + "%" }))}/>, fuente: fuenteDespacho + " Ventas por cliente (sin IVA), acumulado del periodo." });
    if(mesesFac.length) H.push({ seccion: "Cobranza", titulo: "Lo que facturamos y lo que ya cobramos", mensaje: `En ${anio} el sistema tiene ${dinero(fac.totales.facturado)} facturados (con IVA). Cobrado: ${dinero(fac.totales.cobrado)} (${pct(fac.totales.cobrado, fac.totales.facturado)}%). Pendiente: ${dinero(fac.totales.pendiente)}.`,
      contenido: <Apiladas datos={mesesFac} series={[{ k: "cobrado", nombre: "Cobrado", color: C.verde }, { k: "pendiente", nombre: "Por cobrar", color: "#f0a33a" }]}/>,
      fuente: `Sistema DMOV: ${fac.nFacturas} facturas no canceladas de ${anio}, por mes de operación, según el estatus de cada factura.`,
      calculo: "Cobrado = facturas con estatus Pagada. Por cobrar = todas las demás no canceladas. Montos con IVA." });
    if(estado) H.push({ seccion: "Resultados", titulo: "Estado de resultados", mensaje: `Vendimos ${dinero(er.ventas)} y el costo de dar los servicios fue ${dinero(er.costoServicios)}. Con gastos y financiamiento, el periodo cierra en ${dinero(estado.neta)} (${estado.renglones.at(-1).pct}% de las ventas).`,
      contenido: <><Cascada renglones={estado.renglones}/><table style={{ marginTop: 10 }}><thead><tr><th>Concepto</th><th>Pesos</th><th>% ventas</th></tr></thead>
        <tbody>{estado.renglones.map(r => <tr key={r.nombre} style={{ fontWeight: r.tipo === "resta" || r.tipo === "suma" ? 400 : 700 }}><td>{r.nombre}</td><td style={{ color: r.valor < 0 ? C.rojo : C.texto, fontVariantNumeric: "tabular-nums" }}>{dinero(r.valor, false)}</td><td style={{ color: C.gris }}>{r.pct}%</td></tr>)}</tbody></table></>,
      fuente: er.fuente || fuenteDespacho, calculo: "Cifras tal cual del estado de resultados firmado" + (er.celdas ? `: ventas ${er.celdas.ventas}, costo ${er.celdas.costoServicios}, gastos ${er.celdas.gastosAdministracion}, resultado ${er.celdas.resultado}.` : ".") });
    if(costos.length) H.push({ seccion: "Costos", titulo: "¿En qué se va el dinero?", mensaje: `${costos[0].k} es el costo más grande: ${dinero(costos[0].v)} (${pct(costos[0].v, totalCostos)}% de costos y gastos).${cierre.nomina?.costoLaboralPctIngresos ? ` Todo el costo laboral equivale al ${Math.round(cierre.nomina.costoLaboralPctIngresos * 100)}% de las ventas.` : ""}`,
      contenido: <BarrasH datos={costos.slice(0, 8).map(c => ({ ...c, extra: pct(c.v, totalCostos) + "%" }))} color="#6e6e73"/>, fuente: fuenteDespacho + ` Costos y gastos por categoría, acumulado (${dinero(totalCostos)} en total).` });
    if(res.puntoEquilibrioMensual) H.push({ seccion: "Equilibrio", titulo: "¿Cuánto necesitamos vender para no perder?", mensaje: `Con la estructura actual hay que vender ${dinero(res.puntoEquilibrioMensual)} al mes; hoy el promedio es ${dinero(res.ingresoPromedioMensual)}. Faltan ${dinero(res.puntoEquilibrioMensual - res.ingresoPromedioMensual)} al mes (${(res.puntoEquilibrioMensual / (res.ingresoPromedioMensual || 1)).toFixed(1)} veces lo actual).`,
      contenido: <Barras datos={[{ k: "Venta promedio al mes", v: num(res.ingresoPromedioMensual) }, { k: "Punto de equilibrio", v: num(res.puntoEquilibrioMensual), color: C.naranja }]} alto={220}/>,
      fuente: "Análisis del cierre con los estados financieros del despacho.", calculo: `Punto de equilibrio = costos fijos ÷ margen de contribución (${Math.round(num(res.margenContribucionPct) * 100)}%).` });
    H.push({ seccion: "Balance", titulo: "¿Cómo está la empresa al cierre?", mensaje: `Tiene ${dinero(cierre.activoTotal ?? er?.activoTotal)} en bienes y derechos, y debe ${dinero(cierre.pasivoTotal ?? er?.pasivoTotal)}. El capital contable es ${dinero(cierre.capitalContable ?? er?.capitalContable)}.${creski.length ? ` La deuda con Creski pasó de ${dinero(creski[0].v)} (${creski[0].k}) a ${dinero(creski.at(-1).v)} (${creski.at(-1).k}).` : ""}`,
      contenido: <><div className="rej"><Dato valor={dinero(cierre.activoTotal ?? er?.activoTotal)} etiqueta="Activo total"/><Dato valor={dinero(cierre.pasivoTotal ?? er?.pasivoTotal)} etiqueta="Pasivo total" color={C.rojo}/><Dato valor={dinero(cierre.capitalContable ?? er?.capitalContable)} etiqueta="Capital contable" color={num(cierre.capitalContable) < 0 ? C.rojo : C.verde}/></div>
        {creski.length > 1 && <div className="card" style={{ marginTop: 14, boxShadow: "none", padding: 0 }}><div className="et" style={{ marginBottom: 6 }}>Deuda con Creski (meses con dato)</div><Linea puntos={creski}/></div>}</>,
      fuente: fuenteDespacho + " Estado de situación financiera." });
    if(conc.filas.length) H.push({ seccion: "Por cobrar", titulo: "Lo que nos deben, cliente por cliente", mensaje: `La contabilidad marca ${dinero(conc.totalContable)} por cobrar al ${corteTxt}. Las facturas del sistema con fecha hasta ese día suman ${dinero(conc.totalSistemaAlCorte)} pendientes. Las diferencias se revisan con el despacho (Finanzas → Cobranza).`,
      contenido: <table><thead><tr><th>Cliente</th><th>Contabilidad</th><th>Sistema</th><th>Diferencia</th></tr></thead><tbody>{conc.filas.map(f => <tr key={f.cliente}><td>{f.cliente}</td><td>{dinero(f.contable, false)}</td><td>{dinero(f.sistema, false)}</td>
        <td style={{ color: f.estado === "Cuadra" ? C.verde : C.naranja, fontWeight: 600 }}>{f.estado === "Cuadra" ? "✓ cuadra" : dinero(f.diferencia, false)}</td></tr>)}</tbody></table>,
      fuente: fuenteDespacho + " Sistema DMOV: facturas pendientes con fecha hasta el corte." + (bal.isr_favor ? ` Además hay ${dinero(num(bal.isr_favor) + num(bal.iva_favor) + num(bal.pago_indebido))} de impuestos a favor por recuperar.` : "") });
    if(viajes.viajes) H.push({ seccion: "Operación", titulo: "La operación detrás de los números", mensaje: `${viajes.viajes} viajes registrados con ${viajes.choferes.length} choferes para ${new Set(servicios.filter(s => s.empresa).map(s => s.empresa)).size} clientes.`,
      contenido: <BarrasH datos={viajes.choferes.slice(0, 6).map(c => ({ k: c.chofer, v: c.viajes }))} formato={v => `${v} viajes`}/>, fuente: "Sistema DMOV: historial de rutas (bitácora de viajes y rutas asignadas)." });
    if((cierre.hallazgos || []).length) H.push({ seccion: "Hallazgos", titulo: "Lo más importante", mensaje: "Lo que salió del análisis del cierre.",
      contenido: <ol style={{ margin: 0, paddingLeft: 22, fontSize: 18, lineHeight: 1.55 }}>{cierre.hallazgos.map((h, k) => <li key={k} style={{ marginBottom: 8 }}>{h}</li>)}</ol>,
      fuente: `Análisis del cierre cargado el ${cierre.cargadoEl || "—"} con los estados financieros del despacho.` });
    return H;
  }, [cierre, facturas, servicios]);

  useEffect(() => {
    const k = e => { if(modo !== "presentar") return; if(e.key === "ArrowRight") setI(x => Math.min(x + 1, hojas.length - 1)); if(e.key === "ArrowLeft") setI(x => Math.max(x - 1, 0)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [modo, hojas.length]);

  if(!cierre) return <div className="so" style={{ flex: 1, display: "grid", placeItems: "center" }}><style>{CSS}</style><div className="et">Cargando los números…</div></div>;
  const Hoja = ({ h, n }) => <section className="hoja" style={{ maxWidth: 980, margin: "0 auto", padding: "34px 20px 20px", minHeight: modo === "presentar" ? "calc(100% - 70px)" : "auto", paddingBottom: modo === "presentar" ? 90 : 20 }}>
    <div className="kick">{n + 1} de {hojas.length} · {h.seccion}</div>
    {h.portada ? <h1 style={{ marginTop: 10 }}>{h.titulo}</h1> : <h2>{h.titulo}</h2>}
    <p className="lead">{h.mensaje}</p>
    <div className={h.portada ? "" : "card"}>{h.contenido}</div>
    <div className="fuente">Fuente: {h.fuente}</div>
    {h.calculo && <details><summary>¿De dónde sale este número?</summary><div className="fuente">{h.calculo}</div></details>}
  </section>;
  return (
    <div className="so" style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
      <style>{CSS}</style>
      {error && <div className="fuente" style={{ color: C.rojo, padding: 16 }}>No se pudo leer todo: {error}</div>}
      <div className="nav" style={{ position: "sticky", top: 0, zIndex: 2, background: "rgba(245,245,247,.85)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderBottom: "1px solid " + C.linea, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 17 }}>Presentación a socios</b>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="boton" onClick={() => setModo(modo === "presentar" ? "leer" : "presentar")}>{modo === "presentar" ? "Ver todo seguido" : "Modo presentación"}</button>
          <button className="boton" onClick={() => { setModo("leer"); setTimeout(() => window.print(), 300); }}>Imprimir / PDF</button></span>
      </div>
      {modo === "presentar" ? <>
        {hojas[i] && <Hoja h={hojas[i]} n={i}/>}
        <div className="nav" style={{ position: "sticky", bottom: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 14, padding: "12px 0 18px", background: "linear-gradient(transparent, " + C.fondo + " 40%)" }}>
          <button className="boton" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Anterior">‹ Anterior</button>
          <span style={{ display: "flex", gap: 6 }}>{hojas.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Ir a ${k + 1}`} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 999, border: 0, background: k === i ? C.azul : "#c7c7cc", cursor: "pointer", transition: "width .2s" }}/>)}</span>
          <button className="boton" disabled={i === hojas.length - 1} onClick={() => setI(i + 1)} aria-label="Siguiente">Siguiente ›</button>
        </div></>
        : hojas.map((h, k) => <Hoja key={k} h={h} n={k}/>)}
    </div>);
}
