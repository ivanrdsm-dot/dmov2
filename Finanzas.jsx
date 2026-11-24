/* FINANZAS · Resumen, Clientes y Cobranza en estilo limpio (tipo Apple).
   - Resumen: lo facturado, lo cobrado, lo que nos deben, lo que debemos y el resultado contable.
   - Clientes: cada cliente completo (datos fiscales + lo facturado, cobrado y por cobrar).
   - Cobranza: cuánto lleva cada factura sin cobrarse, registrar cobros, mandar estados de cuenta
     y conciliar contra la contabilidad del despacho. Nada se marca pagado sin que alguien lo registre.
   Reglas de "emitida / por cobrar": cobranza.ts (las mismas de todo el sistema). */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { resumenFacturacion, antiguedadPendientes, conciliacionContable, mismaEmpresa, claveEmpresa, pagada, fechaReferencia, MESES_CORTOS } from "./finanzas.ts";
import { C, CSS, num, pct, dinero, Apiladas, BarrasH, Dato } from "./graficasApple.jsx";
import { porPagarPorTipo } from "./deudas.ts";

const hoyISO = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const fechaCorta = f => f ? new Date(f + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";
const Titulo = ({ t, sub }) => <div style={{ margin: "4px 0 18px" }}><h2>{t}</h2>{sub && <p className="lead" style={{ margin: "6px 0 0" }}>{sub}</p>}</div>;
const caja = { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid " + C.linea, font: "inherit", fontSize: 16, background: "#fff", boxSizing: "border-box" };

function useDatos(db){
  const [d, setD] = useState({ facturas: null, pagos: [], proveedores: [], cuentas: [], cierre: null, servicios: [] });
  useEffect(() => {
    const set = k => s => setD(x => ({ ...x, [k]: s.docs.map(y => ({ id: y.id, ...y.data() })) }));
    const us = [
      onSnapshot(query(collection(db, "facturas"), limit(3000)), set("facturas"), () => setD(x => ({ ...x, facturas: [] }))),
      onSnapshot(query(collection(db, "pagos"), limit(3000)), set("pagos"), () => {}),
      onSnapshot(query(collection(db, "pagosProveedores"), limit(3000)), set("proveedores"), () => {}),
      onSnapshot(collection(db, "cuentas"), set("cuentas"), () => {}),
      onSnapshot(query(collection(db, "cierresContables"), orderBy("corte", "desc"), limit(1)), s => setD(x => ({ ...x, cierre: s.docs[0]?.data() || {} })), () => setD(x => ({ ...x, cierre: {} }))),
      onSnapshot(query(collection(db, "servicios"), limit(2000)), set("servicios"), () => {}),
    ];
    return () => us.forEach(u => u());
  }, [db]);
  return d;
}

/* Registrar un cobro: igual que en Facturación (pagos + la factura queda Pagada si se cubre el total). */
function RegistrarCobro({ db, factura, pagado, onListo }){
  const saldo = Math.max(0, num(factura.total) - pagado);
  const [f, setF] = useState({ monto: String(Math.round(saldo * 100) / 100), fecha: hoyISO(), metodo: "Transferencia", notas: "" }), [estado, setEstado] = useState("");
  const guardar = async () => {
    const monto = num(f.monto);
    if(monto <= 0){ setEstado("Escribe el monto cobrado."); return; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)){ setEstado("Pon la fecha del depósito."); return; }
    setEstado("Guardando…");
    try {
      await addDoc(collection(db, "pagos"), { facturaId: factura.id, folio: factura.folio || "", clienteId: factura.clienteId || "", empresa: factura.empresa || "",
        monto, fecha: f.fecha, metodo: f.metodo, notas: f.notas.trim(), origen: "Finanzas · Cobranza", createdAt: serverTimestamp() });
      if(saldo - monto <= 0.5) await updateDoc(doc(db, "facturas", factura.id), { status: "Pagada", fechaPago: f.fecha });
      onListo(saldo - monto <= 0.5 ? "✓ Cobro registrado: la factura quedó pagada." : `✓ Abono registrado. Saldo: ${dinero(saldo - monto, false)}.`);
    } catch(e){ setEstado("No se pudo: " + e.message); }
  };
  return <div className="card" style={{ marginTop: 10, border: "1px solid " + C.linea, boxShadow: "none" }}>
    <b>Registrar cobro de {factura.folio}</b> <span style={{ color: C.gris }}>· saldo {dinero(saldo, false)}</span>
    <div className="rej" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit,minmax(min(160px,100%),1fr))" }}>
      <label><span className="et">Monto cobrado</span><input style={caja} inputMode="decimal" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value.replace(/[^\d.]/g, "") })}/></label>
      <label><span className="et">Fecha del depósito</span><input style={caja} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })}/></label>
      <label><span className="et">Cómo pagó</span><select style={caja} value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value })}>{["Transferencia", "Depósito", "Cheque", "Efectivo"].map(m => <option key={m}>{m}</option>)}</select></label>
      <label><span className="et">Referencia (opcional)</span><input style={caja} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Ej. SPEI 1234"/></label>
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button className="boton" style={{ background: C.azul, color: "#fff" }} onClick={guardar}>Guardar cobro</button>
      <button className="boton" onClick={() => onListo("")}>Cancelar</button>
      {estado && <span className="et" style={{ margin: 0 }}>{estado}</span>}</div>
  </div>;
}

function Resumen({ d, anio, setAnio }){
  const fac = resumenFacturacion(d.facturas, { anio });
  const ant = antiguedadPendientes(d.facturas.filter(f => !anio || String(f.anio) === String(anio) || fechaReferencia(f).startsWith(String(anio))), hoyISO());
  /* Lo que debemos, separado por tipo (misma regla que Pagos a proveedores): proveedores no es lo mismo que préstamos. */
  const deudas = porPagarPorTipo(d.proveedores), deuda = k => num(deudas?.[k]?.monto);
  const er = d.cierre?.estadoResultados, corte = d.cierre?.corte;
  const meses = fac.meses.filter(m => m.facturado > 0).map(m => ({ k: m.mes, cobrado: m.cobrado, pendiente: m.pendiente }));
  const anios = [...new Set(d.facturas.map(f => Number(f.anio)).filter(Boolean))].sort();
  return <>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <Titulo t="Resumen" sub={`Facturas del sistema de ${anio} y cifras contables al ${corte ? fechaCorta(corte) : "último corte"}.`}/>
      <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{anios.map(a => <button key={a} className="boton" style={a === anio ? { background: C.texto, color: "#fff" } : {}} onClick={() => setAnio(a)}>{a}</button>)}</span>
    </div>
    <div className="rej">
      <Dato valor={dinero(fac.totales.facturado)} etiqueta={`Facturado en ${anio}`} nota={`${fac.nFacturas} facturas, con IVA`}/>
      <Dato valor={dinero(fac.totales.cobrado)} etiqueta="Cobrado" color={C.verde} nota={`${pct(fac.totales.cobrado, fac.totales.facturado)}% de lo facturado`}/>
      <Dato valor={dinero(fac.totales.pendiente)} etiqueta="Nos deben (sistema)" color={C.naranja} nota={ant.tramos[3].total ? `${dinero(ant.tramos[3].total)} con más de 90 días` : "Nada con más de 90 días"}/>
      <Dato valor={dinero(deuda("Proveedores"))} etiqueta="Debemos a proveedores" color={C.rojo} nota={`Pagos pendientes o programados.${deuda("Préstamos e intereses") ? ` Aparte, préstamos e intereses: ${dinero(deuda("Préstamos e intereses"))}.` : ""}`}/>
      {er && <Dato valor={dinero(er.cajaYBancos)} etiqueta="Efectivo (contable)" nota={`Caja y bancos al ${fechaCorta(corte)}`}/>}
      {er && <Dato valor={dinero(er.resultado)} etiqueta={`Resultado ${er.periodo || ""}`} color={num(er.resultado) < 0 ? C.rojo : C.verde} nota="Estado de resultados del despacho"/>}
    </div>
    {meses.length > 0 && <div className="card" style={{ marginTop: 16 }}><b>Facturado por mes: cobrado y por cobrar</b><Apiladas datos={meses} series={[{ k: "cobrado", nombre: "Cobrado", color: C.verde }, { k: "pendiente", nombre: "Por cobrar", color: "#f0a33a" }]}/></div>}
    <div className="rej" style={{ marginTop: 16 }}>
      <div className="card"><b>Quién nos debe más</b><div style={{ marginTop: 12 }}><BarrasH datos={fac.clientes.filter(c => c.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente).slice(0, 6).map(c => ({ k: c.empresa, v: c.pendiente }))} color="#f0a33a"/></div></div>
      <div className="card"><b>Antigüedad de lo que nos deben</b><div style={{ marginTop: 12 }}><BarrasH datos={ant.tramos.map(t => ({ k: t.nombre, v: t.total, extra: `${t.n} fact.` }))} color={C.naranja}/></div></div>
    </div>
    <p className="fuente">Montos de facturas con IVA, por mes de operación. Las cifras contables (efectivo y resultado) salen de los estados financieros del despacho.</p>
  </>;
}

function Clientes({ d }){
  const [abierto, setAbierto] = useState("");
  const fac = resumenFacturacion(d.facturas, {});
  /* Un renglón por razón social: sus nombres comerciales (cuentas) + sus números (facturas). */
  const grupos = useMemo(() => {
    const g = {};
    const llave = c => claveEmpresa(c.razonSocial && c.razonSocial !== "POR DEFINIR" ? c.razonSocial : c.nombre) || c.id;
    const conRazon = c => c.razonSocial && c.razonSocial !== "POR DEFINIR";
    for(const c of [...d.cuentas].sort((a, b) => Number(conRazon(b)) - Number(conRazon(a)))){ const k = Object.keys(g).find(x => mismaEmpresa(x, llave(c))) || llave(c); (g[k] ||= { razonSocial: c.razonSocial && c.razonSocial !== "POR DEFINIR" ? c.razonSocial : "", cuentas: [], numeros: null }).cuentas.push(c); }
    for(const c of fac.clientes){
      const k = Object.keys(g).find(x => mismaEmpresa(x, c.empresa)) || claveEmpresa(c.empresa);
      (g[k] ||= { razonSocial: c.empresa, cuentas: [], numeros: null }).numeros = c;
      if(!g[k].razonSocial) g[k].razonSocial = c.empresa;
    }
    return Object.entries(g).map(([k, v]) => ({ k, ...v, servicios: d.servicios.filter(s => mismaEmpresa(s.empresa, v.razonSocial) || v.cuentas.some(c => mismaEmpresa(s.empresa, c.nombre))).length }))
      .sort((a, b) => num(b.numeros?.facturado) - num(a.numeros?.facturado));
  }, [d.cuentas, d.facturas, d.servicios]);   // eslint-disable-line react-hooks/exhaustive-deps
  const contable = d.cierre?.clientes || {};
  return <>
    <Titulo t="Clientes" sub={`${grupos.length} razones sociales con sus marcas, datos fiscales y su dinero. Toca uno para ver el detalle.`}/>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {grupos.map(g => { const n = g.numeros || { facturado: 0, cobrado: 0, pendiente: 0, n: 0, nPendientes: 0, ultima: "" };
        const fiscal = g.cuentas.find(c => c.rfc) || g.cuentas[0] || {}, faltan = !fiscal.rfc || !g.razonSocial;
        const cont = Object.entries(contable).find(([k]) => mismaEmpresa(k, g.razonSocial));
        return <div key={g.k} className="card" style={{ padding: 18, cursor: "pointer" }} onClick={() => setAbierto(abierto === g.k ? "" : g.k)}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220, flex: 1 }}><div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.01em" }}>{g.razonSocial || g.cuentas[0]?.nombre}</div>
              <div className="et" style={{ marginTop: 2 }}>{g.cuentas.map(c => c.nombre).filter(Boolean).join(" · ") || "Sin marca registrada"}{faltan && <span style={{ color: C.naranja }}> · faltan datos fiscales</span>}</div></div>
            {[["Facturado", n.facturado, C.texto], ["Cobrado", n.cobrado, C.verde], ["Nos debe", n.pendiente, n.pendiente ? C.naranja : C.gris]].map(([e, v, col]) =>
              <div key={e} style={{ textAlign: "right", minWidth: 110 }}><div style={{ fontSize: 20, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{dinero(v)}</div><div className="et" style={{ marginTop: 0 }}>{e}</div></div>)}
          </div>
          {abierto === g.k && <div style={{ marginTop: 14, borderTop: "1px solid " + C.linea, paddingTop: 12 }} onClick={e => e.stopPropagation()}>
            <div className="rej" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))" }}>
              <div><div className="et">RFC</div><b>{fiscal.rfc || "PENDIENTE"}</b></div>
              <div><div className="et">Régimen fiscal</div><b>{fiscal.regimenFiscal || "PENDIENTE"}</b></div>
              <div><div className="et">Domicilio</div><b>{[fiscal.domicilio1, fiscal.domicilio2].filter(Boolean).join(", ") || "PENDIENTE"}</b></div>
              <div><div className="et">Contacto</div><b>{[fiscal.contacto, fiscal.email, fiscal.tel].filter(Boolean).join(" · ") || "PENDIENTE"}</b></div>
              <div><div className="et">Facturas</div><b>{n.n} ({n.nPendientes} por cobrar) · última {fechaCorta(n.ultima)}</b></div>
              <div><div className="et">Servicios en el sistema</div><b>{g.servicios}</b></div>
              {cont && <div><div className="et">Ventas en contabilidad ({d.cierre?.estadoResultados?.periodo || "año"})</div><b>{dinero(cont[1].ytd, false)} sin IVA</b></div>}
              {g.cuentas.some(c => c.plan || c.planNumero) && <div><div className="et">Planes</div><b>{[...new Set(g.cuentas.map(c => c.planNumero || c.plan).filter(Boolean))].join(" · ")}</b></div>}
            </div>
            <p className="fuente">Para cambiar datos fiscales: Ventas → Clientes. Lo marcado PENDIENTE no está capturado todavía.</p>
          </div>}
        </div>; })}
    </div>
  </>;
}

function Cobranza({ d, esAdmin, db }){
  const [cobrando, setCobrando] = useState(""), [aviso, setAviso] = useState(""), [ver, setVer] = useState("pendientes");
  const pagadoDe = id => d.pagos.filter(p => p.facturaId === id).reduce((s, p) => s + num(p.monto), 0);
  const ant = antiguedadPendientes(d.facturas, hoyISO());
  const porCliente = {};
  ant.lista.forEach(x => { const f = d.facturas.find(y => y.id === x.id); (porCliente[x.empresa || "Sin cliente"] ||= []).push({ ...x, f, saldo: Math.max(0, x.total - pagadoDe(x.id)) }); });
  const clientes = Object.entries(porCliente).map(([empresa, fs]) => ({ empresa, fs, total: fs.reduce((s, x) => s + x.saldo, 0) })).sort((a, b) => b.total - a.total);
  const conc = d.cierre?.cuentasPorCobrar ? conciliacionContable(d.facturas, d.cierre.cuentasPorCobrar, d.cierre.corte) : null;
  const sinFecha = d.facturas.filter(f => pagada(f) && !f.fechaPago);
  const correoDe = fs => fs.map(x => x.f?.emailCliente).find(Boolean) || d.cuentas.find(c => fs[0] && mismaEmpresa(c.razonSocial || c.nombre, fs[0].empresa) && c.email)?.email || "";
  const estadoCuenta = c => {
    const lineas = c.fs.map(x => `• ${x.folio} · ${x.periodo ? MESES_CORTOS[x.periodo.mes] + " " + x.periodo.anio : ""} · ${dinero(x.saldo, false)}${x.dias != null ? ` · ${x.dias} días` : ""}`).join("\n");
    return { asunto: `Estado de cuenta D en Movimiento · ${c.empresa}`, cuerpo: `Hola, buen día.\n\nLes compartimos las facturas pendientes de pago de ${c.empresa}:\n\n${lineas}\n\nTotal pendiente: ${dinero(c.total, false)}\n\nSi alguna ya está pagada, ¿nos comparten el comprobante para registrarla? Gracias.\n\nD en Movimiento` };
  };
  return <>
    <Titulo t="Cobranza" sub="Lo que nos deben, cuánto tiempo lleva, y cómo cuadra contra la contabilidad del despacho."/>
    <div className="rej">{ant.tramos.map(t => <Dato key={t.nombre} valor={dinero(t.total)} etiqueta={t.nombre} color={t.nombre.startsWith("Más") && t.total ? C.rojo : C.texto} nota={`${t.n} facturas`}/>)}</div>
    {aviso && <div className="card" style={{ marginTop: 12, color: C.verde, fontWeight: 600 }}>{aviso}</div>}
    <div style={{ display: "flex", gap: 6, margin: "18px 0 10px", flexWrap: "wrap" }}>
      {[["pendientes", `Por cliente (${clientes.length})`], ["conciliacion", "Contra la contabilidad"], ["sinfecha", `Pagadas sin fecha (${sinFecha.length})`]].map(([k, l]) =>
        <button key={k} className="boton" style={ver === k ? { background: C.texto, color: "#fff" } : {}} onClick={() => setVer(k)}>{l}</button>)}
    </div>
    {ver === "pendientes" && clientes.map(c => { const ec = estadoCuenta(c), mail = correoDe(c.fs);
      return <div key={c.empresa} className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <b style={{ fontSize: 18 }}>{c.empresa}</b><span className="et" style={{ margin: 0 }}>{c.fs.length} facturas</span>
          <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: C.naranja }}>{dinero(c.total, false)}</span></div>
        <table style={{ marginTop: 8 }}><thead><tr><th>Folio</th><th>Mes</th><th>Fecha</th><th>Días</th><th>Saldo</th>{esAdmin && <th/>}</tr></thead>
          <tbody>{c.fs.map(x => <tr key={x.id}><td>{x.folio}</td><td>{x.periodo ? MESES_CORTOS[x.periodo.mes] + " " + x.periodo.anio : "—"}</td><td>{fechaCorta(x.fecha)}</td>
            <td style={{ color: x.dias > 90 ? C.rojo : x.dias > 60 ? C.naranja : C.texto, fontWeight: 600 }}>{x.dias ?? "—"}</td><td style={{ fontVariantNumeric: "tabular-nums" }}>{dinero(x.saldo, false)}</td>
            {esAdmin && <td><button className="boton" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setCobrando(cobrando === x.id ? "" : x.id)}>Registrar cobro</button></td>}</tr>)}</tbody></table>
        {c.fs.filter(x => x.id === cobrando).map(x => <RegistrarCobro key={x.id} db={db} factura={x.f} pagado={pagadoDe(x.id)} onListo={m => { setCobrando(""); if(m) setAviso(m); }}/>)}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <a className="boton" style={{ textDecoration: "none" }} href={`mailto:${mail}?subject=${encodeURIComponent(ec.asunto)}&body=${encodeURIComponent(ec.cuerpo)}`}>✉️ Mandar estado de cuenta{mail ? "" : " (sin correo)"}</a>
          <button className="boton" onClick={() => navigator.clipboard?.writeText(ec.cuerpo).then(() => setAviso("✓ Estado de cuenta copiado: pégalo en WhatsApp o en el correo."))}>📋 Copiar para WhatsApp</button></div>
      </div>; })}
    {ver === "conciliacion" && (conc ? <div className="card">
      <b>Sistema contra contabilidad al {fechaCorta(d.cierre.corte)}</b>
      <p className="fuente" style={{ marginTop: 4 }}>Contabilidad: saldo de CLIENTES en la balanza del despacho. Sistema: facturas pendientes con fecha hasta el corte. No se marca nada solo: aquí se ve qué revisar.</p>
      <table><thead><tr><th>Cliente</th><th>Contabilidad</th><th>Sistema</th><th>Diferencia</th></tr></thead>
        <tbody>{conc.filas.map(f => <tr key={f.cliente} title={f.que}><td>{f.cliente}<div className="et" style={{ marginTop: 2, fontSize: 12 }}>{f.que}</div></td><td>{dinero(f.contable, false)}</td><td>{dinero(f.sistema, false)}</td>
          <td style={{ color: f.estado === "Cuadra" ? C.verde : C.naranja, fontWeight: 700 }}>{f.estado === "Cuadra" ? "✓ Cuadra" : dinero(f.diferencia, false)}</td></tr>)}
          <tr style={{ fontWeight: 700 }}><td>Total</td><td>{dinero(conc.totalContable, false)}</td><td>{dinero(conc.totalSistemaAlCorte, false)}</td><td>{dinero(conc.totalContable - conc.totalSistemaAlCorte, false)}</td></tr></tbody></table>
      {conc.clientesSoloEnSistema.length > 0 && <p className="fuente">Solo en el sistema (sin saldo en la contabilidad al corte): {conc.clientesSoloEnSistema.map(c => `${c.empresa} ${dinero(c.total, false)}`).join(" · ")}.</p>}
    </div> : <div className="card">Todavía no hay un cierre contable cargado.</div>)}
    {ver === "sinfecha" && <div className="card">
      <b>Facturas pagadas sin fecha de pago</b>
      <p className="fuente" style={{ marginTop: 4 }}>Están marcadas Pagadas pero sin la fecha del depósito. Pon la fecha para que cuadre la cobranza por mes{esAdmin ? "" : " (lo hace el director)"}.</p>
      <table><thead><tr><th>Folio</th><th>Cliente</th><th>Mes</th><th>Total</th><th>Fecha de pago</th></tr></thead>
        <tbody>{sinFecha.slice(0, 200).map(f => { const p = d.pagos.filter(x => x.facturaId === f.id).map(x => x.fecha).sort().pop();
          return <tr key={f.id}><td>{f.folio}</td><td style={{ textAlign: "left" }}>{f.empresa}</td><td>{f.mesOp} {f.anio}</td><td>{dinero(f.total, false)}</td>
            <td>{esAdmin ? <input type="date" defaultValue={p || ""} style={{ ...caja, width: 160, padding: "6px 8px", fontSize: 14 }}
              onBlur={e => e.target.value && updateDoc(doc(db, "facturas", f.id), { fechaPago: e.target.value }).then(() => setAviso(`✓ Fecha de pago guardada en ${f.folio}.`)).catch(er => setAviso("No se pudo: " + er.message))}/> : "—"}</td></tr>; })}</tbody></table>
    </div>}
  </>;
}

export default function Finanzas({ db, usuario, vista = "resumen" }){
  const d = useDatos(db), esAdmin = usuario?.rol === "admin";
  const [anio, setAnio] = useState(new Date().getFullYear());
  return <div className="so" style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
    <style>{CSS}</style>
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 18px 40px" }}>
      {!d.facturas || !d.cierre ? <div className="et">Cargando…</div>
        : vista === "clientes" ? <Clientes d={d}/>
        : vista === "cobranza" ? <Cobranza d={d} esAdmin={esAdmin} db={db}/>
        : <Resumen d={d} anio={anio} setAnio={setAnio}/>}
    </div>
  </div>;
}
