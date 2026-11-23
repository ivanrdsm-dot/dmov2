/* Entregas y evidencias de un servicio, para la oficina: cada parada con su resultado, quién recibió,
   la hora y sus fotos/firma (guardadas en Storage: evidencias/{chofer}/{servicio}/…). Solo lectura. */
import { useEffect, useState } from "react";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { GREEN, AMBER, MUTED, TEXT, BORDER, fechaHora, Chip } from "./uiBasico.jsx";

function Miniatura({ ruta, etiqueta }){
  const [url, setUrl] = useState(""), [error, setError] = useState(false);
  useEffect(() => { let vivo = true; getDownloadURL(ref(getStorage(), ruta)).then(u => vivo && setUrl(u)).catch(() => vivo && setError(true)); return () => { vivo = false; }; }, [ruta]);
  const caja = { width: 92, height: 92, borderRadius: 12, border: "1px solid " + BORDER, background: "#f1f5f9", display: "grid", placeItems: "center", overflow: "hidden", flex: "none" };
  if(error) return <div style={{ ...caja, fontSize: 11, color: MUTED, textAlign: "center", padding: 6 }}>No se pudo abrir</div>;
  if(!url) return <div style={{ ...caja, fontSize: 11, color: MUTED }}>Cargando…</div>;
  return <a href={url} target="_blank" rel="noreferrer" title={etiqueta} style={caja}><img src={url} alt={etiqueta} style={{ width: "100%", height: "100%", objectFit: "cover" }}/></a>;
}

export default function Evidencias({ paradas = [] }){
  if(!paradas.length) return <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>La ruta todavía no está armada.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {paradas.map(p => {
        const ev = p.evidencia || {}, fotos = Array.isArray(ev.fotos) ? ev.fotos : [];
        const cerrada = ["Entregada", "Incidencia"].includes(p.estado);
        return (
          <div key={p.id} style={{ border: "1px solid " + BORDER, borderRadius: 14, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ color: TEXT }}>{p.orden}. {p.tipo === "carga" ? "Recoger" : "Entregar"} · {p.nombre}</b>
              <span style={{ marginLeft: "auto" }}><Chip color={p.estado === "Entregada" ? GREEN : p.estado === "Incidencia" ? AMBER : MUTED}>{p.estado === "Incidencia" ? "⚠️ " + (p.incidencia || "Con problema") : p.estado === "Quitada" ? "Quitada por la oficina" : p.estado}</Chip></span>
            </div>
            {cerrada && <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
              {[ev.receptor && "Recibió: " + ev.receptor, p.cerradaEn && fechaHora(p.cerradaEn), p.distanciaAlCerrarM != null && `a ${p.distanciaAlCerrarM} m del punto`, p.cerradaPorExcepcion && "cierre autorizado por oficina", p.cerradaDiferida && "cerrada sin señal (se envió después)"].filter(Boolean).join(" · ")}
              {ev.notas && <div style={{ color: TEXT, marginTop: 2 }}>📝 {ev.notas}</div>}
            </div>}
            {(fotos.length > 0 || ev.firmaRuta) && <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
              {fotos.map((f, i) => <Miniatura key={f} ruta={f} etiqueta={`Foto ${i + 1} · ${p.nombre}`}/>)}
              {ev.firmaRuta && <Miniatura ruta={ev.firmaRuta} etiqueta={"Firma · " + p.nombre}/>}
            </div>}
          </div>);
      })}
    </div>
  );
}
