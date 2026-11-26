/* AVISO DE PRIVACIDAD: se muestra al entrar (app del chofer y sistema de oficina) mientras la persona no
   haya autorizado la versión vigente. Sin autorizar no se avanza; si no autoriza, queda registrado y sale.
   La autorización la guarda el servidor (aceptarAvisoPrivacidad) con su hora y el celular. */
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { VERSION_AVISO, versionAviso, textoAviso, RESPONSABLE } from "./functions/lib/avisoPrivacidad.js";

const AZUL = "#042552", NARANJA = "#F27B13", ROJO = "#b91c1c", GRIS = "#56637a";

/** Hook: ¿esta cuenta ya autorizó la versión vigente? undefined = revisando; true / false. */
export function useAvisoAutorizado(db, uid, version = VERSION_AVISO){
  const [ok, setOk] = useState(undefined);
  useEffect(() => {
    if(!uid){ setOk(undefined); return; }
    let vivo = true;
    getDoc(doc(db, "consentimientos", `${uid}_${version}`)).then(s => vivo && setOk(s.exists() && s.data().acepto === true)).catch(() => vivo && setOk(false));
    return () => { vivo = false; };
  }, [db, uid, version]);
  return [ok, setOk];
}

export default function AvisoPrivacidad({ app, tipo = "chofer", nombre = "", onAutorizado, onSalir }){
  const [leido, setLeido] = useState(false), [ocupado, setOcupado] = useState(false), [error, setError] = useState(""), [rechazando, setRechazando] = useState(false);
  const version = versionAviso(tipo);
  const llamar = d => httpsCallable(getFunctions(app, "us-central1"), "aceptarAvisoPrivacidad")({ version, ...d });
  const autorizar = async () => {
    if(!leido){ setError("Marca la casilla para confirmar que lo leíste."); return; }
    setOcupado(true); setError("");
    try { await llamar({ acepto: true }); onAutorizado(); }
    catch(e){ setError("No se pudo guardar tu autorización. Revisa tu señal y vuelve a intentar."); setOcupado(false); }
  };
  const noAutorizar = async () => { setOcupado(true); try { await llamar({ acepto: false }); } catch {} onSalir(); };
  const p0 = String(nombre || "").replace(/^jos[eé]\s+/i, "").split(/[\s·()]+/).find(w => /\p{L}/u.test(w) && !/^prueba$/i.test(w)) || "";
  const pila = p0 ? p0[0].toUpperCase() + p0.slice(1).toLowerCase() : "";
  return (
    <div style={{ minHeight: "100dvh", background: "#eef2f9", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: AZUL, padding: "calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: NARANJA }}>{RESPONSABLE.nombre}</div>
        <h1 style={{ fontSize: 26, margin: "4px 0 6px", fontWeight: 900 }}>Aviso de privacidad</h1>
        <p style={{ color: GRIS, fontSize: 16, margin: "0 0 14px" }}>{pila ? `Hola, ${pila}. ` : ""}Antes de continuar, lee cómo usamos tus datos y autoriza su uso. Versión {version}.</p>
        <div style={{ background: "#fff", borderRadius: 18, padding: "6px 18px", boxShadow: "0 1px 3px rgba(4,37,82,.08)" }}>
          {textoAviso(tipo).map(s => <div key={s.titulo} style={{ padding: "12px 0", borderBottom: "1px solid #e3e8f1" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{s.titulo}</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: "#1f2b3d", marginTop: 4 }}>{s.texto}</div></div>)}
        </div>
        {!rechazando ? <>
          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 16, fontWeight: 700, margin: "18px 0 8px", cursor: "pointer" }}>
            <input type="checkbox" checked={leido} onChange={e => { setLeido(e.target.checked); setError(""); }} style={{ width: 26, height: 26, flex: "none", marginTop: 1 }}/>
            Leí el aviso de privacidad y autorizo el uso de mis datos para estas finalidades.
          </label>
          {error && <div style={{ color: ROJO, fontWeight: 800, margin: "6px 0" }}>{error}</div>}
          <button onClick={autorizar} disabled={ocupado} style={{ width: "100%", border: 0, borderRadius: 16, padding: "16px 0", fontSize: 19, fontWeight: 900, color: "#fff", background: leido ? NARANJA : "#b9c2d0", marginTop: 6, cursor: "pointer" }}>
            {ocupado ? "Guardando…" : "Autorizo"}</button>
          <button onClick={() => setRechazando(true)} disabled={ocupado} style={{ width: "100%", border: 0, background: "none", color: GRIS, fontSize: 15, fontWeight: 700, padding: 14, cursor: "pointer" }}>No autorizo</button>
        </> : <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginTop: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: ROJO }}>¿Seguro que no autorizas?</div>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: "6px 0 12px" }}>Sin tu autorización no puedes usar {tipo === "chofer" ? "la app de choferes" : "el sistema"}. Quedará registrado y se cerrará tu sesión. Si tienes dudas, pregunta por {RESPONSABLE.contacto}.</p>
          <button onClick={noAutorizar} disabled={ocupado} style={{ width: "100%", border: "2px solid " + ROJO, background: "#fff", color: ROJO, borderRadius: 14, padding: "12px 0", fontSize: 16, fontWeight: 900, cursor: "pointer" }}>No autorizo y salir</button>
          <button onClick={() => setRechazando(false)} disabled={ocupado} style={{ width: "100%", border: 0, background: NARANJA, color: "#fff", borderRadius: 14, padding: "12px 0", fontSize: 16, fontWeight: 900, marginTop: 10, cursor: "pointer" }}>Regresar al aviso</button>
        </div>}
      </div>
    </div>);
}
