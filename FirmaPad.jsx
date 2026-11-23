/* Recuadro para que quien recibe firme con el dedo. Devuelve la firma como imagen PNG (Blob)
   o null si está en blanco. Sin librerías: canvas + eventos de puntero (sirve con dedo y mouse). */
import { useEffect, useRef, useState } from "react";

export default function FirmaPad({ onCambio, alto = 180, color = "#042552" }){
  const lienzo = useRef(null), dibujando = useRef(false), ultimo = useRef(null);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = lienzo.current, r = window.devicePixelRatio || 1;
    const ajustar = () => {
      const ancho = c.parentElement.clientWidth;
      c.width = Math.round(ancho * r); c.height = Math.round(alto * r);
      c.style.width = ancho + "px"; c.style.height = alto + "px";
      const ctx = c.getContext("2d");
      ctx.scale(r, r); ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = color;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, ancho, alto);
      setVacia(true); onCambio?.(null);
    };
    ajustar();
  }, [alto, color]);   // eslint-disable-line react-hooks/exhaustive-deps

  const punto = e => { const b = lienzo.current.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const empezar = e => { e.preventDefault(); lienzo.current.setPointerCapture?.(e.pointerId); dibujando.current = true; ultimo.current = punto(e); };
  const mover = e => {
    if(!dibujando.current) return;
    e.preventDefault();
    const p = punto(e), ctx = lienzo.current.getContext("2d");
    ctx.beginPath(); ctx.moveTo(ultimo.current.x, ultimo.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo.current = p;
    if(vacia) setVacia(false);
  };
  const terminar = () => {
    if(!dibujando.current) return;
    dibujando.current = false;
    lienzo.current.toBlob(b => onCambio?.(b), "image/png");
  };
  const borrar = () => {
    const c = lienzo.current, ctx = c.getContext("2d"), r = window.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
    void r; setVacia(true); onCambio?.(null);
  };

  return (
    <div>
      <div style={{ position: "relative", border: "2px dashed #d2dcea", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <canvas ref={lienzo} onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerLeave={terminar} onPointerCancel={terminar}
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}/>
        {vacia && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#9aa8ba", fontSize: 15, pointerEvents: "none" }}>Firma aquí con el dedo</div>}
      </div>
      {!vacia && <button type="button" onClick={borrar} style={{ background: "none", border: "none", color: "#5b6b80", fontWeight: 700, fontSize: 14, marginTop: 6, cursor: "pointer" }}>Borrar y volver a firmar</button>}
    </div>
  );
}
