/* GRÁFICAS Y ESTILO TIPO APPLE · compartido por Finanzas y la Presentación a socios.
   Fondo claro, tarjetas blancas, números grandes, pocas tintas y etiquetas directas;
   cada barra dice su valor y al pasar el cursor muestra el detalle. */
export const C = { fondo: "#f5f5f7", tarjeta: "#ffffff", texto: "#1d1d1f", gris: "#6e6e73", linea: "#e5e5ea", azul: "#0071e3", verde: "#248a3d", naranja: "#b25e00", rojo: "#d70015", barra: "#0071e3", barraSuave: "#a7c7f2" };
export const FUENTE = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';
export const ORDEN_PERIODOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Jul-Ago", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const num = v => Number(v) || 0;
export const dinero = (v, compacto = true) => {
  const x = num(v), s = x < 0 ? "−" : "", a = Math.abs(x);
  if(!compacto) return s + "$" + a.toLocaleString("es-MX", { maximumFractionDigits: 0 });
  return s + "$" + (a >= 1e6 ? (a / 1e6).toFixed(2) + " M" : a >= 1e3 ? Math.round(a / 1e3).toLocaleString("es-MX") + " mil" : Math.round(a));
};
export const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

export const CSS = `
.so{font-family:${FUENTE};color:${C.texto};background:${C.fondo};-webkit-font-smoothing:antialiased}
.so h1{font-size:56px;font-weight:700;letter-spacing:-.03em;margin:0;line-height:1.05}
.so h2{font-size:36px;font-weight:700;letter-spacing:-.025em;margin:6px 0 0;line-height:1.1}
.so .lead{font-size:20px;color:${C.gris};margin:10px 0 22px;line-height:1.4;max-width:820px}
.so .kick{font-size:13px;font-weight:600;color:${C.azul};letter-spacing:.02em;text-transform:uppercase}
.so .card{background:${C.tarjeta};border-radius:22px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 30px rgba(0,0,0,.05)}
.so .fuente{font-size:12px;color:${C.gris};margin-top:14px;line-height:1.5}
.so .grande{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1}
.so .et{font-size:14px;color:${C.gris};font-weight:500;margin-top:6px}
.so .rej{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:14px}
.so .boton{background:${C.tarjeta};border:0;border-radius:999px;padding:10px 18px;font:600 15px ${FUENTE};color:${C.azul};cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.so .boton:disabled{opacity:.35;cursor:default}
.so details summary{cursor:pointer;color:${C.azul};font-size:13px;font-weight:600;margin-top:10px}
.so table{width:100%;border-collapse:collapse;font-size:15px}
.so td,.so th{padding:9px 6px;border-bottom:1px solid ${C.linea};text-align:right}
.so td:first-child,.so th:first-child{text-align:left}
.so th{font-size:12px;color:${C.gris};font-weight:600;text-transform:uppercase;letter-spacing:.03em}
@media (max-width:700px){.so h1{font-size:38px}.so h2{font-size:28px}.so .lead{font-size:17px}.so .grande{font-size:34px}}
@media print{.so .nav{display:none!important}.so .hoja{display:block!important;break-after:page;min-height:auto!important}.so{background:#fff}}
`;

/* ── Gráficas (SVG propio, sin librerías): pocas tintas, etiquetas directas, detalle al pasar el cursor ── */
export function Barras({ datos, alto = 260, formato = dinero, color = C.barra }){
  const W = 640, H = alto, pad = { t: 28, b: 34, l: 8, r: 8 };
  const max = Math.max(...datos.map(d => d.v), 0), min = Math.min(...datos.map(d => d.v), 0), rango = max - min || 1;
  const y = v => pad.t + (max - v) / rango * (H - pad.t - pad.b), ancho = (W - pad.l - pad.r) / datos.length;
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gráfica de barras">
    <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke={C.linea}/>
    {datos.map((d, i) => { const x = pad.l + i * ancho + ancho * .18, w = ancho * .64, y0 = y(Math.max(d.v, 0)), h = Math.abs(y(d.v) - y(0));
      return <g key={d.k}><title>{`${d.k}: ${formato(d.v, false)}${d.nota ? " · " + d.nota : ""}`}</title>
        <rect x={x} y={y0} width={w} height={Math.max(h, 1)} rx="5" fill={d.color || (d.v < 0 ? C.rojo : color)} opacity={d.suave ? .45 : 1}/>
        <text x={x + w / 2} y={d.v >= 0 ? y0 - 8 : y(d.v) + 16} textAnchor="middle" fontSize="13" fontWeight="600" fill={C.texto}>{formato(d.v)}</text>
        <text x={x + w / 2} y={H - 12} textAnchor="middle" fontSize="13" fill={C.gris}>{d.k}</text></g>; })}
  </svg>;
}
export function BarrasH({ datos, formato = dinero, color = C.barra }){
  const max = Math.max(...datos.map(d => Math.abs(d.v)), 1);
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {datos.map(d => <div key={d.k} title={`${d.k}: ${formato(d.v, false)}`} style={{ display: "grid", gridTemplateColumns: "minmax(110px,32%) 1fr auto", gap: 10, alignItems: "center", fontSize: 15 }}>
      <span style={{ color: C.texto, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.k}</span>
      <span style={{ background: C.fondo, borderRadius: 6, height: 14, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: Math.max(2, Math.abs(d.v) / max * 100) + "%", background: d.color || color, borderRadius: 6 }}/></span>
      <b style={{ fontVariantNumeric: "tabular-nums", minWidth: 80, textAlign: "right" }}>{formato(d.v)}{d.extra ? <span style={{ color: C.gris, fontWeight: 500 }}> · {d.extra}</span> : null}</b></div>)}
  </div>;
}
export function Apiladas({ datos, series, alto = 260 }){
  const W = 640, H = alto, pad = { t: 24, b: 34, l: 8, r: 8 };
  const max = Math.max(...datos.map(d => series.reduce((s, x) => s + num(d[x.k]), 0)), 1), ancho = (W - pad.l - pad.r) / datos.length;
  return <div><svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Barras apiladas">
    {datos.map((d, i) => { let acum = 0; const x = pad.l + i * ancho + ancho * .2, w = ancho * .6, total = series.reduce((s, z) => s + num(d[z.k]), 0);
      return <g key={d.k}><title>{`${d.k}: ` + series.map(z => `${z.nombre} ${dinero(d[z.k], false)}`).join(" · ")}</title>
        {series.map(z => { const h = num(d[z.k]) / max * (H - pad.t - pad.b), yy = H - pad.b - acum - h; acum += h + (h > 0 ? 2 : 0);
          return h > 0 ? <rect key={z.k} x={x} y={yy} width={w} height={h} rx="4" fill={z.color}/> : null; })}
        {total > 0 && <text x={x + w / 2} y={H - pad.b - acum - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill={C.texto}>{dinero(total)}</text>}
        <text x={x + w / 2} y={H - 12} textAnchor="middle" fontSize="13" fill={C.gris}>{d.k}</text></g>; })}
  </svg>
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: C.gris, marginTop: 4 }}>{series.map(z => <span key={z.k}><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: z.color, marginRight: 6 }}/>{z.nombre}</span>)}</div></div>;
}
export function Cascada({ renglones }){
  const W = 640, H = 300, pad = { t: 28, b: 56, l: 8, r: 8 }, pasos = renglones;
  let acum = 0; const barras = pasos.map(r => { if(r.tipo === "total" || r.tipo === "subtotal"){ acum = r.valor; return { ...r, de: 0, a: r.valor }; } const de = acum; acum += r.valor; return { ...r, de, a: acum }; });
  const vals = barras.flatMap(b => [b.de, b.a, 0]), max = Math.max(...vals), min = Math.min(...vals), rango = max - min || 1;
  const y = v => pad.t + (max - v) / rango * (H - pad.t - pad.b), ancho = (W - pad.l - pad.r) / barras.length;
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cascada del estado de resultados">
    <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke={C.linea}/>
    {barras.map((b, i) => { const x = pad.l + i * ancho + ancho * .15, w = ancho * .7, top = y(Math.max(b.de, b.a)), h = Math.max(Math.abs(y(b.de) - y(b.a)), 1);
      const color = b.tipo === "total" || b.tipo === "subtotal" ? (b.a < 0 ? C.rojo : C.azul) : b.valor < 0 ? "#f2a3a8" : "#9fd3ad";
      return <g key={b.nombre}><title>{`${b.nombre}: ${dinero(b.valor, false)} (${b.pct}% de las ventas)`}</title>
        <rect x={x} y={top} width={w} height={h} rx="4" fill={color}/>
        <text x={x + w / 2} y={top - 7} textAnchor="middle" fontSize="12" fontWeight="600" fill={C.texto}>{dinero(b.valor)}</text>
        <text x={x + w / 2} y={H - 36} textAnchor="middle" fontSize="11" fill={C.gris}>{b.nombre.split(" ").slice(0, 2).join(" ")}</text>
        <text x={x + w / 2} y={H - 22} textAnchor="middle" fontSize="11" fill={C.gris}>{b.nombre.split(" ").slice(2, 4).join(" ")}</text></g>; })}
  </svg>;
}
export function Linea({ puntos, alto = 220 }){
  const W = 640, H = alto, pad = { t: 30, b: 34, l: 30, r: 30 };
  const vals = puntos.map(p => p.v), max = Math.max(...vals), min = Math.min(...vals) * .9, rango = max - min || 1;
  const x = i => pad.l + i * (W - pad.l - pad.r) / Math.max(puntos.length - 1, 1), y = v => pad.t + (max - v) / rango * (H - pad.t - pad.b);
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Línea">
    <polyline points={puntos.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} fill="none" stroke={C.rojo} strokeWidth="2"/>
    {puntos.map((p, i) => <g key={p.k}><title>{`${p.k}: ${dinero(p.v, false)}`}</title><circle cx={x(i)} cy={y(p.v)} r="5" fill={C.rojo} stroke="#fff" strokeWidth="2"/>
      <text x={x(i)} y={y(p.v) - 12} textAnchor="middle" fontSize="13" fontWeight="600">{dinero(p.v)}</text>
      <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="13" fill={C.gris}>{p.k}</text></g>)}
  </svg>;
}
export const Dato = ({ valor, etiqueta, color = C.texto, nota }) => <div className="card"><div className="grande" style={{ color }}>{valor}</div><div className="et">{etiqueta}</div>{nota && <div className="fuente" style={{ marginTop: 8 }}>{nota}</div>}</div>;

