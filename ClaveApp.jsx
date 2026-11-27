/* 📱 ACTIVAR LA APP EN MI CELULAR (oficina, desde Chrome con su sesión de Google).
   Dentro de la app Google no deja iniciar sesión, así que se le agrega a SU MISMA cuenta una contraseña para la app
   (mismo usuario, mismos permisos e historial). También sirve para cambiarla. */
import { useState } from "react";
import { getAuth, EmailAuthProvider, GoogleAuthProvider, linkWithCredential, updatePassword, reauthenticateWithPopup } from "firebase/auth";
import { BLUE, GREEN, ROSE, MUTED, TEXT, BORDER, boton } from "./uiBasico.jsx";

export const ENLACE_APP_ANDROID = "https://firebasestorage.googleapis.com/v0/b/salesflow-crm-13c4a.firebasestorage.app/o/app%2Fdmov-choferes.apk?alt=media&token=5d84b85d-7ed4-4d90-96e0-ad61b375b08a";

/** Qué le falta a una contraseña para ser aceptable (vacío = está bien). */
export function faltaEnClave(clave, repetida){
  if(String(clave).length < 8) return "Usa al menos 8 caracteres.";
  if(!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave) || !/\d/.test(clave)) return "Usa letras y números.";
  if(clave !== repetida) return "Las dos contraseñas no son iguales.";
  return "";
}

export default function ClaveApp({ app, onCerrar }){
  const auth = getAuth(app), u = auth.currentUser;
  const yaTiene = !!u?.providerData?.some(p => p.providerId === "password");
  const [clave, setClave] = useState(""), [rep, setRep] = useState(""), [ver, setVer] = useState(false), [paso, setPaso] = useState(""), [error, setError] = useState(""), [listo, setListo] = useState(false);
  const guardar = async () => {
    const falta = faltaEnClave(clave, rep);
    if(falta){ setError(falta); return; }
    setError(""); setPaso("Guardando…");
    const hacer = () => yaTiene ? updatePassword(u, clave) : linkWithCredential(u, EmailAuthProvider.credential(u.email, clave));
    try { await hacer(); setListo(true); }
    catch(e){
      if(e?.code === "auth/requires-recent-login"){
        try { setPaso("Confirma tu cuenta de Google…"); await reauthenticateWithPopup(u, new GoogleAuthProvider()); await hacer(); setListo(true); }
        catch { setError("No se pudo confirmar tu cuenta. Intenta otra vez."); }
      } else setError(e?.code === "auth/weak-password" ? "Esa contraseña es muy débil." : e?.code === "auth/provider-already-linked" ? "Ya tenías contraseña: vuelve a abrir esta ventana para cambiarla." : "No se pudo guardar. Intenta otra vez.");
    }
    setPaso("");
  };
  const caja = { width: "100%", border: "1.5px solid " + BORDER, borderRadius: 12, padding: "12px 12px", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box", marginTop: 6 };
  return (
    <div role="dialog" aria-label="Activar la app en mi celular" style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(4,37,82,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 22, maxWidth: 440, width: "100%", maxHeight: "92dvh", overflowY: "auto", color: TEXT }}>
        <div style={{ fontWeight: 900, fontSize: 22 }}>📱 Activar la app en mi celular</div>
        {!listo ? <>
          <p style={{ fontSize: 14, color: MUTED, margin: "6px 0 12px" }}>Dentro de la app de D Movimiento, Google no deja iniciar sesión. Crea una contraseña para <b>tu misma cuenta</b> ({u?.email}). En la app entras con tu correo y esta contraseña.</p>
          <label style={{ fontWeight: 700, fontSize: 14 }}>{yaTiene ? "Nueva contraseña de la app" : "Contraseña de la app"}
            <input type={ver ? "text" : "password"} autoComplete="new-password" value={clave} onChange={e => setClave(e.target.value)} style={caja}/></label>
          <label style={{ fontWeight: 700, fontSize: 14, display: "block", marginTop: 10 }}>Repítela
            <input type={ver ? "text" : "password"} autoComplete="new-password" value={rep} onChange={e => setRep(e.target.value)} style={caja}/></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginTop: 8 }}><input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)}/> Ver contraseña</label>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Al menos 8 caracteres, con letras y números. No la compartas.</div>
          {error && <div style={{ color: ROSE, fontWeight: 800, marginTop: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={onCerrar} disabled={!!paso} style={{ ...boton(MUTED, false), flex: 1 }}>Cancelar</button>
            <button onClick={guardar} disabled={!!paso} style={{ ...boton(GREEN), flex: 2 }}>{paso || (yaTiene ? "Cambiar contraseña" : "Crear contraseña")}</button>
          </div>
        </> : <>
          <p style={{ fontSize: 15, color: GREEN, fontWeight: 800, margin: "10px 0" }}>✓ Listo. Ya puedes entrar a la app.</p>
          <ol style={{ fontSize: 15, lineHeight: 1.6, paddingLeft: 20, margin: "0 0 10px" }}>
            <li>En tu Android abre <a href={ENLACE_APP_ANDROID} style={{ color: BLUE, fontWeight: 700 }}>este enlace</a> y descarga la app <b>D Movimiento Choferes</b> (es la misma para la oficina). Si pide permiso para instalar, actívalo.</li>
            <li>Ábrela y toca <b>🏢 Soy de la oficina</b>.</li>
            <li>Entra con <b>{u?.email}</b> y tu contraseña.</li>
            <li>Cuando pida ubicación elige <b>Permitir todo el tiempo</b> y permite las notificaciones.</li>
          </ol>
          <p style={{ fontSize: 13, color: MUTED }}>Los avisos al celular (choferes sin ruta, alertas) siguen llegando por Chrome: no desinstales el sistema de Chrome.</p>
          <button onClick={onCerrar} style={{ ...boton(BLUE), width: "100%", marginTop: 8 }}>Cerrar</button>
        </>}
      </div>
    </div>);
}
