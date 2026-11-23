/* HISTORIAL DE RUTAS · el reporte de la operación para la oficina (Ilse).
   Todo lo que ya salió a la calle: viajes por chofer, por cliente y mes, y si ya
   está facturado. Incluye la bitácora histórica (folios BIT-) y lo nuevo que se
   asigna en el sistema (folios SRV-). Solo lectura; la lógica vive en historialRutas.ts. */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { A, BLUE, GREEN, AMBER, MUTED, TEXT, BORDER, DISP, MONO, caja, boton, Chip } from "./uiBasico.jsx";
import { resumenHistorial, esViaje, estadoCobro, mesDe } from "./historialRutas.ts";

const COLOR_COBRO = { "Facturado": GREEN, "Por revisar": BLUE, "Sin factura": AMBER };
const celda = { padding: "8px 10px", borderBottom: "1px solid " + BORDER, fontSize: 13, textAlign: "left", verticalAlign: "top" };
const cabeza = { ...celda, fontSize: 11, color: MUTED, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", background: "#f8fafc" };

function Tarjeta({ titulo, valor, color = TEXT, nota }){
  return <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" }}>
    <div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>{titulo}</div>
    <div style={{ fontFamily: DISP, fontSize: 30, fontWeight: 800, color, lineHeight: 1.1 }}>{valor}</div>
    {nota && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{nota}</div>}
  </div>;
}

const csv = filas => filas.map(f => f.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

export default function HistorialRutas({ db }){
  const [todos, setTodos] = useState(null), [error, setError] = useState("");
  const [mes, setMes] = useState(""), [chofer, setChofer] = useState(""), [soloSinFactura, setSoloSinFactura] = useState(false);
  useEffect(() => onSnapshot(query(collection(db, "servicios"), orderBy("fechaServicio", "desc"), limit(2000)),
    s => setTodos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.eliminado)), e => { setError(e.message); setTodos([]); }), [db]);

  const viajes = useMemo(() => (todos || []).filter(esViaje), [todos]);
  const meses = useMemo(() => [...new Set(viajes.map(s => String(s.fechaServicio || "").slice(0, 7)).filter(Boolean))].sort().reverse(), [viajes]);
  const choferes = useMemo(() => [...new Set(viajes.flatMap(s => String(s.choferNombre || "").split(" / ")).filter(Boolean))].sort(), [viajes]);
  const filtrados = viajes.filter(s => (!mes || String(s.fechaServicio).startsWith(mes))
    && (!chofer || String(s.choferNombre || "").split(" / ").includes(chofer)) && (!soloSinFactura || estadoCobro(s) === "Sin factura"));
  const r = resumenHistorial(filtrados);

  const descargar = () => {
    const filas = [["Folio", "Fecha", "Chofer", "Unidad", "Cliente", "Qué se hizo", "Estado", "Factura", "Pendiente"],
      ...filtrados.map(s => [s.folio, s.fechaServicio, s.choferNombre, s.unidadPlaca, s.empresa, s.descripcion || s.indicaciones || "", s.estado,
        s.facturaFolio || (s.conciliacion?.facturas || []).map(f => f.folio).join(" ") || estadoCobro(s), (s.pendientes || []).join("; ")])];
    const url = URL.createObjectURL(new Blob(["﻿" + csv(filas)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `historial-rutas${mes ? "-" + mes : ""}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if(todos === null) return <div style={{ padding: 40, color: MUTED }}>Cargando historial…</div>;
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", background: "#f1f4fb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 28, color: TEXT, margin: 0 }}>Historial de rutas</h1>
        <p style={{ color: MUTED, fontSize: 14, margin: "4px 0 14px" }}>Lo que ha hecho cada chofer y si ya está facturado. Se llena solo con cada ruta que asignas.</p>
        {error && <div style={{ color: AMBER, fontWeight: 700, marginBottom: 10 }}>No se pudo leer: {error}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <select style={{ ...caja, width: "auto" }} value={mes} onChange={e => setMes(e.target.value)}>
            <option value="">Todos los meses</option>{meses.map(m => <option key={m} value={m}>{mesDe(m + "-01")}</option>)}</select>
          <select style={{ ...caja, width: "auto" }} value={chofer} onChange={e => setChofer(e.target.value)}>
            <option value="">Todos los choferes</option>{choferes.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}><input type="checkbox" checked={soloSinFactura} onChange={e => setSoloSinFactura(e.target.checked)}/> Solo sin factura</label>
          <button onClick={descargar} style={{ ...boton(BLUE, false), marginLeft: "auto" }}>⬇️ Descargar (Excel)</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 16 }}>
          <Tarjeta titulo="Viajes" valor={r.viajes}/>
          <Tarjeta titulo="Choferes" valor={r.choferes.length}/>
          <Tarjeta titulo="Sin factura" valor={r.sinFactura} color={r.sinFactura ? AMBER : GREEN} nota={r.sinFactura ? "Revisar si se cobraron" : "Todo facturado"}/>
          <Tarjeta titulo="Factura del mes por revisar" valor={r.porRevisar} color={BLUE} nota="Hay factura del cliente ese mes"/>
          <Tarjeta titulo="Con incidencia" valor={r.incidencias} color={r.incidencias ? A : TEXT}/>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(340px,100%),1fr))", gap: 14, marginBottom: 16 }}>
          <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 17, padding: "12px 14px" }}>Por chofer</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>
              <th style={cabeza}>Chofer</th><th style={cabeza}>Viajes</th><th style={cabeza}>Días</th><th style={cabeza}>Clientes</th><th style={cabeza}>Unidades</th></tr></thead>
              <tbody>{r.choferes.map(c => <tr key={c.chofer} onClick={() => setChofer(chofer === c.chofer ? "" : c.chofer)} style={{ cursor: "pointer", background: chofer === c.chofer ? A + "10" : "" }}>
                <td style={{ ...celda, fontWeight: 700 }}>{c.chofer}{c.incidencias ? <span style={{ color: A, fontSize: 11 }}> · {c.incidencias} con incidencia</span> : null}</td>
                <td style={{ ...celda, fontFamily: MONO, fontWeight: 800 }}>{c.viajes}</td><td style={celda}>{c.dias}</td><td style={celda}>{c.clientes}</td>
                <td style={{ ...celda, fontFamily: MONO, fontSize: 11 }}>{c.unidades.join(", ") || "—"}</td></tr>)}</tbody></table>
          </div>
          <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 17, padding: "12px 14px" }}>Conciliación por cliente y mes</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>
              <th style={cabeza}>Cliente</th><th style={cabeza}>Mes</th><th style={cabeza}>Viajes</th><th style={cabeza}>Facturas</th></tr></thead>
              <tbody>{r.clientesMes.map(c => <tr key={c.cliente + c.orden}>
                <td style={{ ...celda, fontWeight: 700 }}>{c.cliente}</td><td style={celda}>{c.mes}</td><td style={{ ...celda, fontFamily: MONO }}>{c.viajes}</td>
                <td style={celda}>{c.facturas.length ? <span style={{ fontFamily: MONO, fontSize: 11 }}>{c.facturas.join(", ")}</span> : <Chip color={AMBER}>Sin factura</Chip>}
                  {c.facturas.length > 0 && c.sinFactura > 0 && <div style={{ color: AMBER, fontSize: 11 }}>{c.sinFactura} viaje(s) sin factura</div>}</td></tr>)}</tbody></table>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflow: "auto" }}>
          <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 17, padding: "12px 14px" }}>Viajes ({filtrados.length})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}><thead><tr>
            <th style={cabeza}>Fecha</th><th style={cabeza}>Folio</th><th style={cabeza}>Chofer</th><th style={cabeza}>Unidad</th><th style={cabeza}>Cliente</th><th style={cabeza}>Qué se hizo</th><th style={cabeza}>Cobro</th></tr></thead>
            <tbody>{filtrados.map(s => { const cobro = estadoCobro(s);
              return <tr key={s.id}>
                <td style={{ ...celda, whiteSpace: "nowrap" }}>{s.fechaServicio}</td>
                <td style={{ ...celda, fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>{s.folio}{s.historico && <div style={{ fontSize: 10, color: MUTED, fontFamily: "inherit" }}>bitácora</div>}</td>
                <td style={celda}>{s.choferNombre || <span style={{ color: MUTED }}>sin anotar</span>}</td>
                <td style={{ ...celda, fontFamily: MONO, fontSize: 12 }}>{s.unidadPlaca || <span style={{ color: MUTED }}>—</span>}</td>
                <td style={celda}>{s.empresa}</td>
                <td style={{ ...celda, maxWidth: 360 }}>{s.descripcion || s.indicaciones || "—"}{s.conIncidencia && <div><Chip color={A}>Incidencia</Chip></div>}</td>
                <td style={celda}><Chip color={COLOR_COBRO[cobro]}>{cobro}</Chip>
                  {(s.facturaFolio || s.conciliacion?.facturas?.length > 0) && <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, marginTop: 3 }}>{s.facturaFolio || s.conciliacion.facturas.map(f => f.folio).join(", ")}</div>}</td>
              </tr>; })}
              {filtrados.length === 0 && <tr><td colSpan={7} style={{ ...celda, color: MUTED, textAlign: "center", padding: 24 }}>No hay viajes con esos filtros.</td></tr>}</tbody></table>
        </div>
        <p style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Los viajes con folio BIT- vienen de la bitácora que llevaba Ilse (mayo–junio 2026), tal como se anotaron. Precio, direcciones y quién recibió quedan pendientes: no se inventan. "Factura del mes por revisar" significa que el cliente tiene factura ese mes, pero hay que confirmar que incluye ese viaje.</p>
      </div>
    </div>);
}
