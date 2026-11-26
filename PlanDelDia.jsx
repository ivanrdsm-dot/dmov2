/* 📋 PLAN DEL DÍA (operaciones, justo después de su check-in): cada chofer con su ruta de hoy
   o con el motivo por el que no sale. Mientras falte alguno no se entra al sistema.
   Para asignar, se abre "Asignar ruta" aquí mismo y al terminar se regresa al plan. Lógica en planDia.ts. */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { planDelDia, MOTIVOS } from "./planDia.ts";

const AsignarRuta = lazy(() => import("./AsignarRuta.jsx"));
const AZUL = "#042552", NARANJA = "#F27B13", VERDE = "#047857", ROJO = "#b91c1c", AMBAR = "#b45309", GRIS = "#56637a";
const hoyCDMX = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const clave = (uid, dia) => `dmov_plan_${uid}_${dia}`;
const caja = { minHeight: "100dvh", background: "#eef2f9", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: AZUL,
  padding: "calc(18px + env(safe-area-inset-top)) 14px calc(110px + env(safe-area-inset-bottom))" };
const tarjeta = { background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 1px 3px rgba(4,37,82,.08)", marginBottom: 10 };
const chip = (activo, color = AZUL) => ({ border: "2px solid " + (activo ? color : "#d6deea"), background: activo ? color + "12" : "#fff", color: activo ? color : AZUL,
  borderRadius: 12, padding: "9px 12px", fontSize: 15, fontWeight: 800, cursor: "pointer", textAlign: "left" });

function Fila({ f, app, onAsignar }){
  const [abierto, setAbierto] = useState(false), [motivo, setMotivo] = useState(""), [nota, setNota] = useState(""), [ocupado, setOcupado] = useState(false), [error, setError] = useState("");
  const guardar = async () => {
    if(!motivo) return setError("Elige un motivo");
    if(motivo === "otro" && !nota.trim()) return setError("Escribe el motivo");
    setOcupado(true); setError("");
    try { await httpsCallable(getFunctions(app, "us-central1"), "oficinaDiaSinRuta")({ choferId: f.id, motivo, nota: nota.trim() }); setAbierto(false); }
    catch(e){ setError(String(e?.message || "No se pudo guardar").replace(/^(functions\/[a-z-]+:?\s*|Firebase:\s*)/i, "")); }
    setOcupado(false);
  };
  const estado = { con_ruta: { c: VERDE, t: "✓ Con ruta: " + f.rutas.join(", ") }, justificado: { c: GRIS, t: "No sale: " + f.motivo + (f.nota ? " · " + f.nota : "") },
    vencido: { c: ROJO, t: "⏰ Ya pasaron 2 h esperando pedido: asígnale ruta o cambia el motivo" }, pendiente: { c: ROJO, t: "Falta: asigna su ruta o di por qué no sale" } }[f.estado];
  const falta = f.estado === "pendiente" || f.estado === "vencido";
  return <div style={{ ...tarjeta, borderLeft: "5px solid " + estado.c }}>
    <div style={{ fontWeight: 900, fontSize: 18 }}>{f.nombre}</div>
    <div style={{ color: estado.c, fontWeight: 700, fontSize: 14, marginTop: 2 }}>{estado.t}</div>
    {(falta || f.estado === "justificado") && <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      <button onClick={onAsignar} style={{ flex: "1 1 140px", border: 0, borderRadius: 14, padding: "13px 0", fontSize: 16, fontWeight: 900, color: "#fff", background: NARANJA, cursor: "pointer" }}>🚚 Asignar ruta</button>
      <button onClick={() => setAbierto(!abierto)} style={{ flex: "1 1 140px", border: "2px solid " + AZUL, borderRadius: 14, padding: "11px 0", fontSize: 16, fontWeight: 800, color: AZUL, background: "#fff", cursor: "pointer" }}>{f.estado === "justificado" ? "Cambiar motivo" : "No sale hoy"}</button>
    </div>}
    {abierto && <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      {MOTIVOS.map(m => <button key={m.k} onClick={() => { setMotivo(m.k); setError(""); }} style={chip(motivo === m.k)}>{m.t}{m.sub ? <div style={{ fontSize: 12, fontWeight: 600, color: GRIS }}>{m.sub}</div> : null}</button>)}
      {motivo && <input value={nota} onChange={e => setNota(e.target.value)} placeholder={motivo === "otro" ? "Escribe el motivo (obligatorio)" : "Nota (opcional)"} maxLength={300}
        style={{ border: "2px solid #d6deea", borderRadius: 12, padding: "12px", fontSize: 16, fontFamily: "inherit" }}/>}
      {error && <div style={{ color: ROJO, fontWeight: 800 }}>{error}</div>}
      <button onClick={guardar} disabled={ocupado} style={{ border: 0, borderRadius: 14, padding: "13px 0", fontSize: 16, fontWeight: 900, color: "#fff", background: motivo ? AZUL : "#b9c2d0", cursor: "pointer" }}>{ocupado ? "Guardando…" : "Guardar motivo"}</button>
    </div>}
  </div>;
}

export default function PlanDelDia({ db, app, usuario, mapboxToken, onListo, onSalir }){
  const dia = hoyCDMX();
  const [choferes, setChoferes] = useState(null), [delDia, setDelDia] = useState([]), [enRuta, setEnRuta] = useState([]), [sinRuta, setSinRuta] = useState([]);
  const [asignando, setAsignando] = useState(false), [ahoraMs, setAhoraMs] = useState(Date.now());
  /* Si ya lo completó hoy en este equipo, no se le vuelve a pedir (el aviso de "chofer sin ruta" sigue durante el día). */
  useEffect(() => { try { if(localStorage.getItem(clave(usuario.uid, dia)) === "ok") onListo(); } catch {} }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setAhoraMs(Date.now()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const us = [
      onSnapshot(query(collection(db, "choferes"), limit(300)), s => setChoferes(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setChoferes([])),
      onSnapshot(query(collection(db, "servicios"), where("fechaServicio", "==", dia), limit(300)), s => setDelDia(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(query(collection(db, "servicios"), where("estado", "==", "En ruta"), limit(200)), s => setEnRuta(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(query(collection(db, "dia_sin_ruta"), where("fecha", "==", dia), limit(300)), s => setSinRuta(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
    ];
    return () => us.forEach(u => u());
  }, [db, dia]);
  const p = useMemo(() => planDelDia({ choferes: choferes || [], servicios: [...delDia, ...enRuta], sinRuta, dia, ahoraMs }), [choferes, delDia, enRuta, sinRuta, dia, ahoraMs]);
  const entrar = () => { try { localStorage.setItem(clave(usuario.uid, dia), "ok"); } catch {} onListo(); };

  if(asignando) return <div style={{ minHeight: "100dvh", background: "#f1f4fb" }}>
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: AZUL, color: "#fff", padding: "calc(12px + env(safe-area-inset-top)) 14px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={() => setAsignando(false)} style={{ border: 0, borderRadius: 12, background: "#fff", color: AZUL, fontWeight: 900, fontSize: 15, padding: "9px 14px", cursor: "pointer" }}>← Volver al plan</button>
      <span style={{ fontWeight: 800 }}>{p.faltan === 1 ? "Falta 1 chofer" : `Faltan ${p.faltan} choferes`}</span>
    </div>
    <Suspense fallback={<div style={{ padding: 30, color: GRIS }}>Cargando…</div>}><AsignarRuta db={db} app={app} usuario={usuario} mapboxToken={mapboxToken} onVer={() => setAsignando(false)}/></Suspense>
  </div>;

  return (
    <div style={caja}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: NARANJA }}>D Movimiento · Plan del día</div>
        <h1 style={{ fontSize: 26, margin: "4px 0 6px", fontWeight: 900 }}>📋 ¿Qué hace hoy cada chofer?</h1>
        <p style={{ color: GRIS, fontSize: 15, margin: "0 0 14px" }}>Antes de entrar, registra la ruta de cada chofer o di por qué no sale. Así el director sabe qué hace cada quien.</p>
        {choferes === null ? <div style={{ color: GRIS }}>Cargando choferes…</div>
          : p.filas.length === 0 ? <div style={tarjeta}>No hay choferes activos.</div>
          : p.filas.map(f => <Fila key={f.id} f={f} app={app} onAsignar={() => setAsignando(true)}/>)}
      </div>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid #dbe3ef", padding: "12px 14px calc(12px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={onSalir} style={{ border: 0, background: "none", color: GRIS, fontWeight: 700, fontSize: 15, padding: "12px 6px", cursor: "pointer" }}>Salir</button>
          <button onClick={entrar} disabled={!p.completo || choferes === null} style={{ flex: 1, border: 0, borderRadius: 16, padding: "15px 0", fontSize: 17, fontWeight: 900, color: "#fff", background: p.completo && choferes !== null ? VERDE : "#b9c2d0", cursor: p.completo ? "pointer" : "not-allowed" }}>
            {choferes === null ? "Cargando…" : p.completo ? `✓ Listo · entrar (${p.conRuta} con ruta${p.sinSalir ? `, ${p.sinSalir} no salen` : ""})` : p.faltan === 1 ? "Falta 1 chofer" : `Faltan ${p.faltan} choferes`}</button>
        </div>
      </div>
    </div>);
}
