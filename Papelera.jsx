/* Papelera: lo que se borró, quién y cuándo, y un botón para recuperarlo. Solo admin. */
import { useEffect, useState } from "react";
import { GREEN, ROSE, MUTED, TEXT, BORDER, DISP, boton, caja, Chip } from "./uiBasico.jsx";
import { listarPapelera, recuperar, NOMBRE_COLECCION, resumenRegistro } from "./papelera.js";

const cuando = ts => { const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  return ms ? new Date(ms).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; };

export default function Papelera({ db, usuario }){
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState("");
  const [ocupado, setOcupado] = useState("");
  const cargar = () => listarPapelera(db).then(setItems).catch(e => { setError(e.message); setItems([]); });
  useEffect(() => { cargar(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const recuperarUno = async c => {
    if(!confirm("¿Recuperar este " + (NOMBRE_COLECCION[c.coleccion] || "registro").toLowerCase() + "?\n\n" + resumenRegistro(c.datos))) return;
    setOcupado(c.id); setError("");
    try { await recuperar(db, usuario, c); await cargar(); }
    catch(e){ setError(e?.code === "permission-denied" ? "Solo un administrador puede recuperar." : e.message); }
    setOcupado("");
  };

  const q = buscar.trim().toLowerCase();
  const lista = (items || []).filter(c => !q || [NOMBRE_COLECCION[c.coleccion], resumenRegistro(c.datos), c.borradoPorNombre, c.motivo]
    .join(" ").toLowerCase().includes(q));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: "#f1f4fb" }}>
      <h1 style={{ fontFamily: DISP, fontWeight: 800, fontSize: 28, color: TEXT, margin: 0 }}>Papelera</h1>
      <p style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>Todo lo que se borra queda aquí, con quién y cuándo. Si se borró por error, toca <b>Recuperar</b>.</p>
      <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar: cliente, folio, concepto, quién borró…" style={{ ...caja, maxWidth: 420, margin: "10px 0 16px" }}/>
      {error && <div style={{ color: ROSE, fontSize: 14, marginBottom: 12 }}>{error}</div>}
      {items === null ? <div style={{ color: MUTED }}>Cargando…</div>
        : lista.length === 0 ? <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 14, padding: 30, textAlign: "center", color: MUTED }}>
            {items.length ? "Nada coincide con la búsqueda." : "✓ La papelera está vacía: no se ha borrado nada."}</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{lista.map(c => (
            <div key={c.id} style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Chip color={MUTED}>{NOMBRE_COLECCION[c.coleccion] || c.coleccion}</Chip>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{resumenRegistro(c.datos) || "(sin nombre)"}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Lo borró {c.borradoPorNombre || "alguien"} · {cuando(c.borradoEn)}{c.motivo ? " · " + c.motivo : ""}</div>
              </div>
              {c.recuperadoEn
                ? <Chip color={GREEN}>Recuperado · {cuando(c.recuperadoEn)}</Chip>
                : <button disabled={!!ocupado} onClick={() => recuperarUno(c)} style={{ ...boton(GREEN), opacity: ocupado ? .5 : 1 }}>{ocupado === c.id ? "Recuperando…" : "Recuperar"}</button>}
            </div>))}
          </div>}
    </div>
  );
}
