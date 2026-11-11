/* SEGUIMIENTO PARA EL CLIENTE · lógica pura.
   Arma lo que el cliente puede ver de SU servicio con el link privado, y la página.
   Nunca sale: precio, costos, notas internas, teléfonos del chofer, placas, otros
   clientes ni ubicaciones exactas. El chofer, solo con su nombre de pila. */

export const ETAPAS_CLIENTE = ["Recibimos tu pedido", "Confirmado", "Unidad asignada", "En camino", "Entregado"];
const ETAPA_DE_ESTADO = { Solicitud: 0, Cotizada: 0, Confirmada: 1, Asignada: 2, "En ruta": 3, Entregada: 4, Cerrada: 4, Conciliada: 4, Facturada: 4, Cobrada: 4 };
const txt = (v, max = 120) => String(v ?? "").trim().slice(0, max);
const ms = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export const tokenValido = t => TOKEN_RE.test(String(t ?? ""));

/** Vista pública del servicio. `paradas` son las de la ruta (si ya se armó). */
export function vistaPublica(s, paradas = []){
  const cancelado = s.estado === "Cancelada";
  const etapa = cancelado ? -1 : (ETAPA_DE_ESTADO[s.estado] ?? 0);
  const ts = s.estadoTs || {};
  const horaEtapa = [ms(ts.Solicitud) ?? ms(s.creadoEn), ms(ts.Confirmada), ms(ts.Asignada), ms(ts["En ruta"]), ms(ts.Entregada)];
  const entregas = (paradas || []).filter(p => p.tipo !== "carga").map(p => ({
    lugar: txt(p.nombre, 80) || "Entrega",
    estado: p.estado === "Entregada" ? "Entregado" : p.estado === "Incidencia" ? "Con incidencia" : "Pendiente",
    hora: ms(p.cerradaEn),
    recibio: p.estado === "Entregada" ? txt(p.evidencia?.receptor, 60) : "",
  }));
  const destinos = entregas.length ? entregas.map(e => e.lugar) : (s.destinos || []).map(d => txt(d.nombre, 80) || "Entrega").filter(Boolean);
  return {
    folio: txt(s.folio, 30), cliente: txt(s.empresa, 80), fecha: txt(s.fechaServicio, 10), hora: txt(s.horaServicio, 30),
    cancelado, etapa, etapas: ETAPAS_CLIENTE.map((nombre, i) => ({ nombre, hecho: !cancelado && i <= etapa, hora: i <= etapa ? (horaEtapa[i] ?? null) : null })),
    chofer: etapa >= 2 ? txt(s.choferNombre, 60).split(/\s+/)[0] || "" : "",
    destinos, entregas, entregadas: entregas.filter(e => e.estado === "Entregado").length,
    puedeCalificar: !cancelado && etapa >= 4 && !s.encuestaRespondida,
    yaCalifico: !!s.encuestaRespondida,
  };
}

export function validarEncuesta(b){
  const cal = Math.round(Number(b?.calificacion));
  if(!(cal >= 1 && cal <= 5)) return { ok: false, error: "Elige de 1 a 5 estrellas" };
  return { ok: true, calificacion: cal, comentario: txt(b?.comentario, 600) };
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hora = t => t ? new Date(t).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }) : "";

/** Página HTML completa (sin scripts de terceros). Todo valor va escapado. */
export function paginaSeguimiento(v, { gracias = false, error = "" } = {}){
  const pasos = v.cancelado ? `<p class="cancel">Este servicio fue cancelado.</p>` : v.etapas.map(e =>
    `<li class="${e.hecho ? "ok" : ""}"><span class="dot"></span><div><b>${esc(e.nombre)}</b>${e.hora ? `<small>${esc(hora(e.hora))}</small>` : ""}</div></li>`).join("");
  const entregas = v.entregas.length ? `<h2>Entregas (${v.entregadas} de ${v.entregas.length})</h2><ul class="ent">${v.entregas.map(e =>
    `<li><b>${esc(e.lugar)}</b><span class="${e.estado === "Entregado" ? "ok" : ""}">${esc(e.estado)}${e.hora ? " · " + esc(hora(e.hora)) : ""}${e.recibio ? " · recibió " + esc(e.recibio) : ""}</span></li>`).join("")}</ul>`
    : v.destinos.length ? `<h2>Destinos</h2><ul class="ent">${v.destinos.map(d => `<li><b>${esc(d)}</b></li>`).join("")}</ul>` : "";
  const encuesta = gracias || v.yaCalifico ? `<div class="card ok"><b>¡Gracias por tu opinión!</b></div>`
    : v.puedeCalificar ? `<form method="POST" class="card"><b>¿Cómo te fue con este servicio?</b>
      <div class="stars">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="calificacion" value="${n}" required><span>${"★".repeat(n)}</span></label>`).join("")}</div>
      <textarea name="comentario" maxlength="600" placeholder="¿Algo que quieras contarnos? (opcional)"></textarea>
      ${error ? `<p class="err">${esc(error)}</p>` : ""}<button type="submit">Enviar</button></form>` : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Seguimiento ${esc(v.folio)} · D Movimiento</title>
<style>
:root{--azul:#042552;--naranja:#F27B13;--gris:#607080;--borde:#e3e8f0}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6fa;color:#0c1829}
header{background:var(--azul);color:#fff;padding:18px 16px;border-bottom:5px solid var(--naranja)}header b{font-size:20px}header small{display:block;opacity:.8}
main{max-width:560px;margin:0 auto;padding:16px}.card{background:#fff;border:1px solid var(--borde);border-radius:14px;padding:16px;margin-bottom:14px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 8px}p{margin:4px 0;color:var(--gris)}
ol{list-style:none;padding:0;margin:8px 0}ol li{display:flex;gap:12px;align-items:flex-start;padding:8px 0;color:var(--gris)}ol li.ok{color:#0c1829}
.dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--borde);margin-top:3px;flex-shrink:0}li.ok .dot{background:var(--naranja);border-color:var(--naranja)}
small{display:block;color:var(--gris);font-size:12px}.ent{list-style:none;padding:0;margin:0}.ent li{display:flex;flex-direction:column;padding:8px 0;border-bottom:1px solid var(--borde)}
.ent span{color:var(--gris);font-size:13px}.ent span.ok{color:#047857}.cancel{color:#be123c;font-weight:700}
.stars{display:flex;flex-direction:column;gap:6px;margin:10px 0}.stars label{display:flex;gap:8px;align-items:center;font-size:20px;color:var(--naranja)}
textarea{width:100%;min-height:70px;border:1.5px solid var(--borde);border-radius:10px;padding:10px;font:inherit}
button{margin-top:10px;background:var(--naranja);color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;font-size:15px;width:100%}
.err{color:#be123c}.card.ok{border-color:#a7f3d0;background:#ecfdf5}footer{text-align:center;color:var(--gris);font-size:12px;padding:20px}
</style></head><body><header><b>D Movimiento</b><small>Seguimiento de tu servicio</small></header><main>
<div class="card"><h1>Servicio ${esc(v.folio)}</h1>${v.cliente ? `<p>${esc(v.cliente)}</p>` : ""}${v.fecha ? `<p>Fecha: ${esc(v.fecha)}${v.hora ? " · " + esc(v.hora) : ""}</p>` : ""}${v.chofer ? `<p>Te atiende: <b>${esc(v.chofer)}</b></p>` : ""}
<ol>${pasos}</ol>${entregas}</div>${encuesta}</main><footer>D Movimiento · Logística</footer></body></html>`;
}

export const paginaNoEncontrada = () => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>D Movimiento</title></head>
<body style="font-family:system-ui,sans-serif;background:#f4f6fa;color:#0c1829;padding:40px 16px;text-align:center"><h1 style="color:#042552">D Movimiento</h1><p>Este link de seguimiento no existe o ya no está activo. Pide uno nuevo a tu contacto de D Movimiento.</p></body></html>`;
