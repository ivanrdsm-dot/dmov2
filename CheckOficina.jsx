/* ENTRADA Y SALIDA DE LA OFICINA (Ilse y quien no sea director): selfie con la cámara EN VIVO (sin galería),
   ubicación y hora. Lo registra el servidor (oficinaCheckIn / oficinaCheckOut) con la dirección y la hora real;
   al director le llega el aviso. Sin entrada del día no se usa el sistema. */
import { useEffect, useState } from "react";
export { useAsistenciaOficina } from "./asistenciaOficina.js";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref as refStorage, uploadBytes } from "firebase/storage";
import { CamaraEnVivo, conSello, lineasSello, metaSello, posicionAhora } from "./ChoferWeb.jsx";

const AZUL = "#042552", NARANJA = "#F27B13", ROJO = "#b91c1c", GRIS = "#56637a";
const fechaCDMX = (ms = Date.now()) => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);
const hora = v => v?.toMillis ? new Date(v.toMillis()).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }) : "";

const caja = { minHeight: "100dvh", background: "#eef2f9", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: AZUL,
  padding: "calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))", display: "flex", alignItems: "flex-start", justifyContent: "center" };
const tarjeta = { width: "100%", maxWidth: 460, background: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 1px 3px rgba(4,37,82,.08)" };
const botonPrin = activo => ({ width: "100%", border: 0, borderRadius: 16, padding: "16px 0", fontSize: 18, fontWeight: 900, color: "#fff", background: activo ? NARANJA : "#b9c2d0", cursor: "pointer" });

/** modo: "entrada" | "salida". */
export default function CheckOficina({ app, usuario, modo = "entrada", onListo, onCerrar, onSalir }){
  const [foto, setFoto] = useState(null), [camara, setCamara] = useState(false), [paso, setPaso] = useState(""), [error, setError] = useState("");
  const url = foto ? URL.createObjectURL(foto) : "";
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  const entrada = modo === "entrada";
  const registrar = async () => {
    if(!foto){ setError("Toma tu foto con la cámara."); return; }
    setError("");
    try {
      setPaso("Leyendo tu ubicación…"); const p = await posicionAhora();
      setPaso("Subiendo tu foto…");
      const t = foto.lastModified || Date.now(), lineas = lineasSello(`D MOVIMIENTO · ${entrada ? "ENTRADA" : "SALIDA"} OFICINA · ${usuario.nombre || ""}`, t, "", p);
      const sellada = await conSello(foto, lineas);
      const ruta = `asistencia_oficina/${usuario.uid}/${fechaCDMX()}_${Date.now()}_${entrada ? "entrada" : "salida"}.jpg`;
      await uploadBytes(refStorage(getStorage(app), ruta), sellada, { contentType: "image/jpeg", customMetadata: metaSello(lineas, t, sellada) });
      setPaso("Registrando…");
      await httpsCallable(getFunctions(app, "us-central1"), entrada ? "oficinaCheckIn" : "oficinaCheckOut")({ selfieRuta: ruta, lat: p.coords.latitude, lng: p.coords.longitude,
        precisionM: p.coords.accuracy, posTMs: Math.round(p.timestamp || Date.now()) });
      onListo?.();
    } catch(e){ setError(String(e?.message || "No se pudo. Intenta otra vez.").replace(/^(functions\/[a-z-]+:?\s*|Firebase:\s*)/i, "")); }
    setPaso("");
  };
  return (
    <div style={entrada ? caja : { ...caja, position: "fixed", inset: 0, zIndex: 90, background: "rgba(4,37,82,.55)", alignItems: "center" }}>
      <div style={tarjeta}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: NARANJA }}>D Movimiento · Oficina</div>
        <h1 style={{ fontSize: 26, margin: "4px 0 6px", fontWeight: 900 }}>{entrada ? "☀️ Registra tu entrada" : "🏁 Registra tu salida"}</h1>
        <p style={{ color: GRIS, fontSize: 15, margin: "0 0 16px" }}>Tómate una foto con la cámara en este momento. Se guarda con tu ubicación y la hora.{entrada ? " Después entras al sistema." : ""}</p>
        <button type="button" onClick={() => setCamara(true)} style={{ width: "100%", aspectRatio: "4 / 3", border: "2px dashed #c9d4e4", borderRadius: 18, background: "#f6f8fc", display: "grid", placeItems: "center", overflow: "hidden", cursor: "pointer", padding: 0 }}>
          {foto ? <img src={url} alt="Tu foto" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ fontSize: 15, fontWeight: 800, color: GRIS }}>🤳 Tomar mi foto</span>}
        </button>
        {error && <div style={{ color: ROJO, fontWeight: 800, marginTop: 10 }}>{error}</div>}
        <button onClick={registrar} disabled={!!paso} style={{ ...botonPrin(!!foto), marginTop: 16 }}>{paso || (entrada ? "Registrar mi entrada" : "Registrar mi salida")}</button>
        {entrada ? <button onClick={onSalir} disabled={!!paso} style={{ width: "100%", border: 0, background: "none", color: GRIS, fontWeight: 700, fontSize: 15, padding: 14, cursor: "pointer" }}>Salir</button>
          : <button onClick={onCerrar} disabled={!!paso} style={{ width: "100%", border: 0, background: "none", color: GRIS, fontWeight: 700, fontSize: 15, padding: 14, cursor: "pointer" }}>Cancelar</button>}
      </div>
      {camara && <CamaraEnVivo frente titulo="Tu foto" onCerrar={() => setCamara(false)} onFoto={f => { setCamara(false); setError(""); setFoto(f); }}/>}
    </div>);
}

/** Pantalla cuando ya cerró su día. */
export function DiaCerrado({ asistencia, onSalir }){
  return <div style={caja}><div style={tarjeta}>
    <h1 style={{ fontSize: 24, margin: "0 0 6px", fontWeight: 900 }}>🌙 Tu día está cerrado</h1>
    <p style={{ color: GRIS, fontSize: 15 }}>Tu salida quedó registrada a las {hora(asistencia?.checkOutEn)}<br/>Mañana registras tu entrada otra vez.</p>
    <button onClick={onSalir} style={{ ...botonPrin(true), marginTop: 12 }}>Salir</button>
  </div></div>;
}
