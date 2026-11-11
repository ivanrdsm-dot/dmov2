/* Piezas de interfaz compartidas por los módulos nuevos (Servicios, Solicitudes).
   Mismos colores y tipografías que el resto del sistema. */
import { useEffect } from "react";

export const A = "#f97316", BLUE = "#2563eb", GREEN = "#059669", ROSE = "#e11d48", AMBER = "#d97706", VIOLET = "#7c3aed";
export const MUTED = "#607080", TEXT = "#0c1829", BORDER = "#e8eef6", BD2 = "#d2dcea";
export const DISP = "'Bricolage Grotesque',sans-serif", MONO = "'JetBrains Mono',monospace";

export const p2 = n => String(n).padStart(2, "0");
export const ahoraLocal = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/* Pesos: sin centavos si es exacto ($3,500); con dos si los hay ($2,280.50). */
export const dinero = v => { const n = Number(v); if(!(Number.isFinite(n) && n > 0)) return "—"; const c = Math.round(n * 100) % 100 !== 0; return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: 2 }); };
export const fechaHora = ms => ms ? new Date(ms).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export const etiqueta = { fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 5, letterSpacing: "0.07em", textTransform: "uppercase", display: "block" };
export const caja = { width: "100%", background: "#fff", border: "1.5px solid " + BD2, borderRadius: 10, padding: "10px 13px", fontSize: 14, fontFamily: "inherit", color: TEXT, boxSizing: "border-box" };
export const rejilla = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 };
export const boton = (color, lleno = true) => ({ background: lleno ? color : "#fff", color: lleno ? "#fff" : color, border: "1.5px solid " + color, borderRadius: 10,
  padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 42 });

export function Campo({ label, lista, opciones, area, ...p }){
  const id = "srv-" + label.replace(/[^a-z0-9]/gi, "-").toLowerCase() + (p.name ? "-" + p.name : "");
  return (
    <label style={{ display: "block" }}>
      <span style={etiqueta}>{label}</span>
      {opciones ? <select {...p} style={caja}>{opciones.map(o => <option key={o} value={o}>{o || "— Elegir —"}</option>)}</select>
        : area ? <textarea {...p} style={{ ...caja, minHeight: 70, resize: "vertical" }}/>
        : <input {...p} list={lista ? id + "-l" : undefined} style={caja}/>}
      {lista && <datalist id={id + "-l"}>{lista.map(o => <option key={o} value={o}/>)}</datalist>}
    </label>
  );
}
export const Chip = ({ color, children }) => <span style={{ display: "inline-block", background: color + "16", color, border: "1px solid " + color + "40",
  borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
export const Seccion = ({ titulo, children }) => <fieldset style={{ border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px", margin: "0 0 14px" }}>
  <legend style={{ fontFamily: DISP, fontWeight: 700, fontSize: 13, padding: "0 6px" }}>{titulo}</legend>{children}</fieldset>;

export function Dialogo({ titulo, onClose, children }){
  useEffect(() => { const h = e => { if(e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(12,24,41,.45)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 12, overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 860, margin: "20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid " + BORDER, position: "sticky", top: 0, background: "#fff", borderRadius: "18px 18px 0 0", zIndex: 2 }}>
          <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 16, flex: 1 }}>{titulo}</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ ...boton(MUTED, false), padding: "6px 12px", minHeight: 34 }}>Cerrar</button>
        </div>
        <div style={{ padding: "18px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

