/* COTIZADOR AUTOMÁTICO · de la carga a la unidad y al precio, explicando cada paso.
   Calcula tarimas, estiba, maniobra, unidad y precio. Lo que falta lo pregunta; no lo supone.
   El precio final lo aprueba un administrador: aquí solo se propone. */
import { useEffect, useMemo, useState } from "react";
import { A, BLUE, GREEN, ROSE, AMBER, MUTED, TEXT, BORDER, DISP, MONO, etiqueta, rejilla, boton, Campo, Chip, Seccion } from "./uiBasico.jsx";
import { cotizar } from "./cotizacionAuto.ts";
import { resumirCalculo, validarCotizacion } from "./cotizaciones.ts";
import { tiposParaCotizar, TIPOS_UNIDAD } from "./tiposUnidad.ts";

const pesos = n => n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 });
const TRI = ["No sé", "Sí", "No"];
const tri = v => v === "Sí" ? true : v === "No" ? false : undefined;
const VACIO = { tipoRuta: "local", destino: "", entregas: "1", diasResguardo: "", gananciaPct: "", modo: "Cajas",
  cajas: "", cajaLargoCm: "", cajaAnchoCm: "", cajaAltoCm: "", cajaPesoKg: "", maxNivelesCaja: "", tarimas: "", tarimaAltoM: "", tarimaPesoKg: "", pesoKg: "", volumenM3: "",
  entarimada: "No sé", apilable: "No sé", fragil: false, voluminosa: false, origenAnden: "No sé", destinoAnden: "No sé", pisoAlto: false };

const Lista = ({ titulo, items, color }) => items.length === 0 ? null : <div style={{ background: color + "10", border: "1px solid " + color + "50", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
  <b style={{ color }}>{titulo}</b>{items.map(x => <div key={x} style={{ color: TEXT, marginTop: 3 }}>• {x}</div>)}</div>;
const Marca = ({ checked, onChange, children }) => <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer", minHeight: 42 }}>
  <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ width: 20, height: 20 }}/>{children}</label>;

export default function CotizadorAuto({ tarifarioStore, serviciosStore, cotizacionesStore = null, usuario = null, solicitud: origen = null, onGuardada = null }){
  const [f, setF] = useState(VACIO);
  const [g, setG] = useState({ empresa: "", solicitante: "", contacto: "", notas: "" }), [guardando, setGuardando] = useState(false), [aviso, setAviso] = useState(null);
  /* Viene de la bandeja: la cotización queda ligada a esa solicitud. */
  useEffect(() => { if(origen) setG(x => ({ ...x, solicitante: origen.remitenteNombre || "", contacto: origen.remitenteCorreo || "", notas: origen.asunto || "" })); }, [origen]);
  const [tarifas, setTarifas] = useState([]), [unidades, setUnidades] = useState([]), [verCatalogo, setVerCatalogo] = useState(false);
  useEffect(() => tarifarioStore.suscribir(setTarifas, () => setTarifas([])), [tarifarioStore]);
  useEffect(() => serviciosStore.suscribirCatalogo("unidades", setUnidades), [serviciosStore]);
  const s = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const tipos = useMemo(() => tiposParaCotizar(unidades), [unidades]);
  const destinos = useMemo(() => tarifas.filter(t => t.tipo === "nacional" && t.activo !== false).map(t => t.nombre).sort((a, b) => a.localeCompare(b, "es")), [tarifas]);
  const solicitud = useMemo(() => {
    const anden = v => v === "No sé" ? undefined : { tieneAnden: v === "Sí", tieneMontacargas: v === "Sí", pisoAlto: false };
    const carga = { entarimada: f.modo === "Tarimas" ? true : tri(f.entarimada), apilable: tri(f.apilable), fragil: f.fragil, voluminosa: f.voluminosa, pesoKg: f.pesoKg, volumenM3: f.volumenM3 };
    if(f.modo === "Cajas") Object.assign(carga, { cajas: f.cajas, cajaLargoCm: f.cajaLargoCm, cajaAnchoCm: f.cajaAnchoCm, cajaAltoCm: f.cajaAltoCm, cajaPesoKg: f.cajaPesoKg, maxNivelesCaja: f.maxNivelesCaja });
    if(f.modo === "Tarimas") Object.assign(carga, { tarimas: f.tarimas, tarimaAltoM: f.tarimaAltoM, tarimaPesoKg: f.tarimaPesoKg });
    const dest = anden(f.destinoAnden);
    return { carga, tipoRuta: f.tipoRuta, destino: f.destino, entregas: Number(f.entregas) || 1, diasResguardo: Number(f.diasResguardo) || 0, gananciaPct: f.gananciaPct,
      origen: anden(f.origenAnden), destinoOp: f.pisoAlto ? { ...(dest || {}), pisoAlto: true } : dest };
  }, [f]);
  const hayCarga = [f.cajas, f.tarimas, f.pesoKg, f.volumenM3].some(v => String(v).trim());
  const c = useMemo(() => hayCarga ? cotizar(solicitud, tipos, tarifas) : null, [hayCarga, solicitud, tipos, tarifas]);
  const u = c?.unidad;
  const sg = k => e => setG(x => ({ ...x, [k]: e.target.value }));
  const resumen = useMemo(() => c ? resumirCalculo(c) : null, [c]);
  const faltaParaGuardar = validarCotizacion({ empresa: g.empresa, resultado: resumen });
  const guardar = async () => {
    setGuardando(true); setAviso(null);
    try {
      const r = await cotizacionesStore.crear(usuario, { ...g, entrada: f, resultado: resumen, solicitud: origen });
      setAviso({ msg: `Cotización ${r.folio} guardada. Falta que un administrador apruebe el precio.` });
      if(onGuardada) await onGuardada(r);
      setF(VACIO); setG({ empresa: "", solicitante: "", contacto: "", notas: "" });
    } catch(e){ setAviso({ msg: "No se pudo guardar: " + e.message, mal: true }); }
    finally { setGuardando(false); }
  };
  const barra = (nombre, pct) => pct === null ? null : <div key={nombre} style={{ marginTop: 6 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED }}><span>{nombre}</span><b style={{ color: pct > 90 ? AMBER : TEXT }}>{pct} %</b></div>
    <div style={{ height: 8, background: BORDER, borderRadius: 6, overflow: "hidden" }}><div style={{ width: Math.min(100, pct) + "%", height: "100%", background: pct > 90 ? AMBER : GREEN }}/></div></div>;
  return (
    <div style={{ padding: "22px 20px", maxWidth: 1280, margin: "0 auto" }}>
      <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 24, margin: 0 }}>Cotizador automático</h1>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>Escribe lo que pide el cliente. El sistema calcula tarimas, si se apilan, si hace falta maniobra, qué unidad va y cuánto cuesta. Lo que falta lo pregunta.</div>
      {origen && <div style={{ background: BLUE + "10", border: "1px solid " + BLUE + "50", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>Cotizando la solicitud <b style={{ fontFamily: MONO }}>{origen.folio}</b>{origen.asunto ? ` · ${origen.asunto}` : ""}. El texto del correo es solo referencia: captura aquí la carga.</div>}
      {aviso && <div role="status" style={{ background: (aviso.mal ? ROSE : GREEN) + "10", border: "1px solid " + (aviso.mal ? ROSE : GREEN) + "50", color: aviso.mal ? ROSE : GREEN, borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{aviso.msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, alignItems: "start" }}>
        <div>
          <Seccion titulo="Ruta">
            <div style={rejilla}>
              <Campo label="¿A dónde va?" opciones={["CDMX y zona metropolitana", "Fuera de CDMX (foráneo)"]} value={f.tipoRuta === "local" ? "CDMX y zona metropolitana" : "Fuera de CDMX (foráneo)"} onChange={e => setF(x => ({ ...x, tipoRuta: e.target.value.startsWith("Fuera") ? "nacional" : "local" }))}/>
              {f.tipoRuta === "nacional" && <Campo label="Destino" lista={destinos} value={f.destino} onChange={s("destino")} placeholder="Escribe o elige"/>}
              <Campo label="¿En cuántos lugares se entrega?" inputMode="numeric" value={f.entregas} onChange={s("entregas")}/>
              <Campo label="Días que guardamos la mercancía (si aplica)" inputMode="numeric" value={f.diasResguardo} onChange={s("diasResguardo")} placeholder="0"/>
            </div>
          </Seccion>
          <Seccion titulo="Carga">
            <Campo label="¿Cómo te la describió el cliente?" opciones={["Cajas", "Tarimas", "Solo peso y volumen"]} value={f.modo} onChange={s("modo")}/>
            <div style={{ ...rejilla, marginTop: 12 }}>
              {f.modo === "Cajas" && <>
                <Campo label="Número de cajas o piezas" inputMode="numeric" value={f.cajas} onChange={s("cajas")}/>
                <Campo label="Largo de la caja (cm)" inputMode="decimal" value={f.cajaLargoCm} onChange={s("cajaLargoCm")}/>
                <Campo label="Ancho de la caja (cm)" inputMode="decimal" value={f.cajaAnchoCm} onChange={s("cajaAnchoCm")}/>
                <Campo label="Alto de la caja (cm)" inputMode="decimal" value={f.cajaAltoCm} onChange={s("cajaAltoCm")}/>
                <Campo label="Peso por caja (kg)" inputMode="decimal" value={f.cajaPesoKg} onChange={s("cajaPesoKg")}/>
                <Campo label="¿Cuántas cajas aguantan una encima de otra?" inputMode="numeric" value={f.maxNivelesCaja} onChange={s("maxNivelesCaja")} placeholder="Viene impreso en la caja"/>
                <Campo label="¿Viaja en tarimas?" opciones={TRI} value={f.entarimada} onChange={s("entarimada")}/></>}
              {f.modo === "Tarimas" && <>
                <Campo label="Número de tarimas" inputMode="numeric" value={f.tarimas} onChange={s("tarimas")}/>
                <Campo label="Alto de cada tarima (m)" inputMode="decimal" value={f.tarimaAltoM} onChange={s("tarimaAltoM")} placeholder="1.5 si no se sabe"/>
                <Campo label="Peso por tarima (kg)" inputMode="decimal" value={f.tarimaPesoKg} onChange={s("tarimaPesoKg")}/></>}
              {f.modo === "Solo peso y volumen" && <>
                <Campo label="Peso total (kg)" inputMode="decimal" value={f.pesoKg} onChange={s("pesoKg")}/>
                <Campo label="Volumen total (m³)" inputMode="decimal" value={f.volumenM3} onChange={s("volumenM3")}/></>}
              {f.modo !== "Solo peso y volumen" && <Campo label="¿Se puede poner una tarima encima de otra?" opciones={TRI} value={f.apilable} onChange={s("apilable")}/>}
            </div>
            <Marca checked={f.fragil} onChange={v => setF(x => ({ ...x, fragil: v }))}>Mercancía frágil</Marca>
            <Marca checked={f.voluminosa} onChange={v => setF(x => ({ ...x, voluminosa: v }))}>Piezas voluminosas: muebles, exhibidores armados</Marca>
          </Seccion>
          <Seccion titulo="Al cargar y al entregar">
            <div style={rejilla}>
              <Campo label="¿Hay andén o montacargas en el origen?" opciones={TRI} value={f.origenAnden} onChange={s("origenAnden")}/>
              <Campo label="¿Hay andén o montacargas en el destino?" opciones={TRI} value={f.destinoAnden} onChange={s("destinoAnden")}/>
            </div>
            <Marca checked={f.pisoAlto} onChange={v => setF(x => ({ ...x, pisoAlto: v }))}>Se entrega en piso alto o por escaleras</Marca>
          </Seccion>
          <Seccion titulo="Tu ganancia">
            <Campo label="¿Cuánto quieres ganar encima del precio? (%)" inputMode="decimal" value={f.gananciaPct} onChange={s("gananciaPct")} placeholder="Vacío = precio de la lista"/>
          </Seccion>
          <button onClick={() => setF(VACIO)} style={boton(MUTED, false)}>Limpiar</button>
        </div>
        <div>
          {!c ? <Seccion titulo="Resultado"><div style={{ fontSize: 14, color: MUTED }}>Captura la carga para ver el cálculo.</div></Seccion> : <>
            <div style={{ background: "#fff", border: "2px solid " + (c.lista ? GREEN : AMBER), borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
              <Chip color={c.lista ? GREEN : AMBER}>{c.lista ? "Lista para aprobar" : c.precio !== null ? `Precio preliminar · faltan ${c.pendientes.length} dato(s)` : "Sin precio: falta información"}</Chip>
              <div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 34, marginTop: 8 }}>{pesos(c.precio)} <span style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>+ IVA {pesos(c.iva)} = {pesos(c.total)}</span></div>
              <div style={{ fontSize: 13, color: MUTED }}>{u ? `${u.cantidad} × ${u.tipo.nombre}${u.conProveedor ? " · con proveedor" : ""}` : "Sin unidad elegida"}{c.maniobra.requerida === true ? ` · con ${c.maniobra.ayudantes} ayudante(s)` : ""}</div>
            </div>
            <Lista titulo="Falta confirmar con el cliente o capturar" items={c.pendientes} color={AMBER}/>
            <Seccion titulo="1 · Cuánta carga es">
              {c.cubicaje.pasos.map(x => <div key={x} style={{ fontSize: 13, marginBottom: 4 }}>{x}</div>)}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {c.cubicaje.pesoKg !== null && <Chip color={BLUE}>{c.cubicaje.pesoKg.toLocaleString("es-MX")} kg</Chip>}
                {c.cubicaje.volumenM3 !== null && <Chip color={BLUE}>{c.cubicaje.volumenM3} m³</Chip>}
                {c.cubicaje.tarimas !== null && <Chip color={BLUE}>{c.cubicaje.tarimas} tarima(s){c.cubicaje.tarimasCalculadas ? " calculadas" : ""}</Chip>}
              </div>
            </Seccion>
            <Seccion titulo="2 · Qué unidad va">
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.motivoUnidad}</div>
              {u && <><div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{u.estiba.motivo}</div>
                {barra("Peso", u.usoPct.peso)}{barra("Volumen", u.usoPct.volumen)}{barra("Posiciones de piso", u.usoPct.piso)}</>}
              {c.alternativa && <div style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>Alternativa con más holgura: {c.alternativa.tipo.nombre}.</div>}
            </Seccion>
            <Seccion titulo="3 · ¿Hacen falta ayudantes?">
              <Chip color={c.maniobra.requerida === true ? AMBER : c.maniobra.requerida === false ? GREEN : MUTED}>{c.maniobra.requerida === true ? `Sí requiere · ${c.maniobra.ayudantes} ayudante(s)` : c.maniobra.requerida === false ? "No requiere" : "Por definir"}</Chip>
              {c.maniobra.motivos.map(x => <div key={x} style={{ fontSize: 13, marginTop: 6 }}>{x}</div>)}
            </Seccion>
            <Seccion titulo="4 · Cómo se armó el precio (solo para ti)">
              {c.conceptos.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Sin conceptos del tarifario.</div> : c.conceptos.map(x => (
                <div key={x.concepto} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "5px 0", borderBottom: "1px solid " + BORDER }}>
                  <span>{x.concepto} <span style={{ color: MUTED }}>· {x.detalle}</span></span><b style={{ fontFamily: MONO }}>{pesos(x.monto)}</b></div>))}
              {c.subtotalBase !== null && <div style={{ fontSize: 13, marginTop: 8 }}>Base {pesos(c.subtotalBase)}{c.gananciaPct ? ` + ${c.gananciaPct} % de ganancia` : ""} → redondeado a decenas hacia arriba: <b>{pesos(c.precio)}</b></div>}
              <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Al cliente se le presenta un solo precio. Este desglose no sale en la cotización.</div>
            </Seccion>
            <Lista titulo="Supuestos usados en el cálculo" items={c.supuestos} color={BLUE}/>
            {cotizacionesStore && usuario && <Seccion titulo="Guardar como cotización">
              <div style={rejilla}>
                <Campo label="Cliente o empresa" value={g.empresa} onChange={sg("empresa")}/>
                <Campo label="Quién la pide" value={g.solicitante} onChange={sg("solicitante")}/>
                <Campo label="Correo o teléfono" value={g.contacto} onChange={sg("contacto")}/>
              </div>
              <div style={{ marginTop: 12 }}><Campo label="Notas" area value={g.notas} onChange={sg("notas")}/></div>
              {faltaParaGuardar.length > 0 && <div style={{ fontSize: 12, color: AMBER, marginTop: 8 }}>Para guardar falta: {faltaParaGuardar.join(" · ")}</div>}
              <div style={{ marginTop: 12 }}><button onClick={guardar} disabled={guardando || faltaParaGuardar.length > 0} style={{ ...boton(A), opacity: guardando || faltaParaGuardar.length > 0 ? .5 : 1 }}>{guardando ? "Guardando…" : "Guardar cotización con folio"}</button></div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Se guarda como propuesta{c.pendientes.length ? `, con ${c.pendientes.length} dato(s) por confirmar` : ""}. El precio que ve el cliente lo aprueba un administrador.</div>
            </Seccion>}
          </>}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <button onClick={() => setVerCatalogo(v => !v)} style={boton(BLUE, false)}>{verCatalogo ? "Ocultar" : "Ver"} capacidades que usa el cotizador</button>
        {verCatalogo && <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
            <thead><tr>{["Tipo", "En flota", "Carga útil", "Volumen", "Tarimas a piso", "Alto interior", "De dónde sale"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px", fontSize: 10, color: MUTED, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid " + BORDER }}>{h}</th>)}</tr></thead>
            <tbody>{tipos.map(t => { const ref = TIPOS_UNIDAD.find(x => x.clave === t.clave); return (
              <tr key={t.clave} style={{ borderBottom: "1px solid " + BORDER, verticalAlign: "top" }}>
                <td style={{ padding: 10 }}><b>{t.nombre}</b><div style={{ fontSize: 11, color: MUTED }}>{ref.version}</div></td>
                <td style={{ padding: 10, fontFamily: MONO }}>{t.enFlota || "proveedor"}</td>
                <td style={{ padding: 10, fontFamily: MONO }}>{t.capacidadKg.toLocaleString("es-MX")} kg</td>
                <td style={{ padding: 10, fontFamily: MONO }}>{t.capacidadM3} m³</td>
                <td style={{ padding: 10, fontFamily: MONO }}>{t.tarimasPiso}</td>
                <td style={{ padding: 10, fontFamily: MONO }}>{t.altoInteriorM} m</td>
                <td style={{ padding: 10 }}><Chip color={t.confirmada ? GREEN : AMBER}>{t.confirmada ? "Unidad real" : "Referencia"}</Chip><div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{t.fuente}</div><div style={{ fontSize: 11, color: MUTED }}>{ref.nota}</div></td>
              </tr>); })}</tbody>
          </table></div>}
      </div>
    </div>);
}
