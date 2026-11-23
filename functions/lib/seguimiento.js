/* SEGUIMIENTO PARA EL CLIENTE · lógica pura.
   Arma lo que el cliente puede ver de SU servicio con el link privado, y la página.
   Nunca sale: precio, costos, notas internas, teléfonos del chofer, placas, direcciones
   escritas ni otros clientes. El chofer, solo con su nombre de pila.
   Mapa (decisión del dueño, nov-2026): el cliente ve SUS puntos de entrega y la camioneta
   SOLO mientras va en camino con su servicio y si la ubicación es reciente (≤ 20 min). */

export const ETAPAS_CLIENTE = ["Recibimos tu pedido", "Confirmado", "Unidad asignada", "En camino", "Entregado"];
const ETAPA_DE_ESTADO = { Solicitud: 0, Cotizada: 0, Confirmada: 1, Asignada: 2, "En ruta": 3, Entregada: 4, Cerrada: 4, Conciliada: 4, Facturada: 4, Cobrada: 4 };
const txt = (v, max = 120) => String(v ?? "").trim().slice(0, max);
const ms = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export const tokenValido = t => TOKEN_RE.test(String(t ?? ""));

export const UBICACION_MAX_MIN = 20;
const r5 = x => Math.round(Number(x) * 1e5) / 1e5;
const coordOk = p => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng)) && !(Number(p.lat) === 0 && Number(p.lng) === 0);
function km(a, b){ const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

/** Avisos para el cliente a partir de la bitácora del servicio (solo lo que le importa, sin datos internos). */
export function avisosCliente(eventos = [], paradas = []){
  const tipoDe = id => (paradas.find(p => p.id === id) || {}).tipo;
  const out = [];
  for(const e of eventos || []){
    const t = ms(e.ts), lugar = txt(e.paradaNombre, 80) || "el punto de entrega";
    let texto = "";
    if(e.tipo === "estado" && e.a === "Asignada") texto = "Tu servicio ya tiene unidad asignada.";
    else if(e.tipo === "estado" && e.a === "En ruta") texto = "🚚 Tu envío salió a ruta.";
    else if(e.tipo === "estado" && e.a === "Entregada") texto = "🎉 Servicio completado.";
    else if(e.tipo === "estado" && e.a === "Cancelada") texto = "Tu servicio fue cancelado.";
    else if(e.tipo === "parada_entregada") texto = tipoDe(e.paradaId) === "carga" ? "📦 Se recogió la mercancía." : `✅ Entregado en ${lugar}${e.receptor ? ` · recibió ${txt(e.receptor, 60)}` : ""}.`;
    else if(e.tipo === "parada_incidencia") texto = `⚠️ Hubo un detalle en ${lugar}: ${txt(e.incidencia, 60) || "lo revisamos"}.`;
    else if(e.tipo === "llegando") texto = `📍 Tu envío está por llegar a ${lugar} (a menos de 1 km).`;
    if(texto) out.push({ id: txt(e.id, 60) || String(t), texto, ts: t });
  }
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12);
}

/** Vista pública del servicio. `paradas` son las de la ruta (si ya se armó).
 *  extra: { servicioId, ubicacion (ubicaciones/{chofer}), eventos, ahoraMs } para el mapa en vivo y los avisos. */
export function vistaPublica(s, paradas = [], extra = {}){
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
  /* Mapa: sus puntos de entrega; la camioneta solo en camino, con SU servicio y ubicación reciente. */
  const ahoraMs = Number(extra.ahoraMs) || Date.now();
  const puntos = (paradas || []).filter(p => p.tipo !== "carga" && coordOk(p)).map(p => ({ lat: r5(p.lat), lng: r5(p.lng), lugar: txt(p.nombre, 80) || "Entrega",
    estado: p.estado === "Entregada" ? "Entregado" : p.estado === "Incidencia" ? "Con incidencia" : "Pendiente" }));
  const u = extra.ubicacion;
  const vehiculo = !cancelado && etapa === 3 && u && coordOk(u) && u.confiable !== false && extra.servicioId && u.servicioId === extra.servicioId
    && Number(u.tMs) > 0 && ahoraMs - Number(u.tMs) <= UBICACION_MAX_MIN * 60000 ? { lat: r5(u.lat), lng: r5(u.lng), tMs: Number(u.tMs) } : null;
  const siguiente = puntos.find(p => p.estado === "Pendiente") || null;
  const distanciaKm = vehiculo && siguiente ? Math.round(km(vehiculo, siguiente) * 10) / 10 : null;
  return {
    folio: txt(s.folio, 30), cliente: txt(s.empresa, 80), fecha: txt(s.fechaServicio, 10), hora: txt(s.horaServicio, 30),
    cancelado, etapa, etapas: ETAPAS_CLIENTE.map((nombre, i) => ({ nombre, hecho: !cancelado && i <= etapa, hora: i <= etapa ? (horaEtapa[i] ?? null) : null })),
    chofer: etapa >= 2 ? txt(s.choferNombre, 60).split(/\s+/)[0] || "" : "",
    destinos, entregas, entregadas: entregas.filter(e => e.estado === "Entregado").length,
    puedeCalificar: !cancelado && etapa >= 4 && !s.encuestaRespondida,
    yaCalifico: !!s.encuestaRespondida,
    mapa: { puntos, vehiculo, siguiente: siguiente ? siguiente.lugar : "", distanciaKm },
    avisos: avisosCliente(extra.eventos, paradas),
    actualizado: ahoraMs,
  };
}

export function validarEncuesta(b){
  const cal = Math.round(Number(b?.calificacion));
  if(!(cal >= 1 && cal <= 5)) return { ok: false, error: "Elige de 1 a 5 estrellas" };
  return { ok: true, calificacion: cal, comentario: txt(b?.comentario, 600) };
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hora = t => t ? new Date(t).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }) : "";

/** Partes de la página que se refrescan solas (las pide el navegador cada 15 s). Todo valor va escapado. */
export function seccionesHTML(v){
  const m = v.mapa || {};
  const vivo = v.cancelado ? `<div class="vivo gris">Este servicio fue cancelado.</div>`
    : v.etapa >= 4 ? `<div class="vivo verde">🎉 <div><b>¡Entregado!</b><small>${v.entregadas} de ${v.entregas.length || v.entregadas} entregas listas</small></div></div>`
    : v.etapa === 3 ? `<div class="vivo azul"><span class="pulso"></span><div><b>Tu envío va en camino</b><small>${m.vehiculo
        ? (m.siguiente ? `Próxima entrega: ${esc(m.siguiente)}${m.distanciaKm != null ? ` · a ${esc(m.distanciaKm)} km` : ""}` : "Siguiendo la ruta")
        : "Ubicación en camino de actualizarse…"}</small></div></div>`
    : v.etapa === 2 ? `<div class="vivo naranja">🚚 <div><b>Unidad asignada</b><small>${v.chofer ? `Te atiende ${esc(v.chofer)}. ` : ""}Pronto sale a ruta.</small></div></div>`
    : `<div class="vivo gris">📋 <div><b>Recibimos tu pedido</b><small>Te avisamos aquí cuando salga a ruta.</small></div></div>`;
  const etapas = v.cancelado ? "" : `<ol>${v.etapas.map(e =>
    `<li class="${e.hecho ? "ok" : ""}"><span class="dot"></span><div><b>${esc(e.nombre)}</b>${e.hora ? `<small>${esc(hora(e.hora))}</small>` : ""}</div></li>`).join("")}</ol>`;
  const entregas = v.entregas.length ? `<h2>Entregas (${v.entregadas} de ${v.entregas.length})</h2><ul class="ent">${v.entregas.map(e =>
    `<li><b>${esc(e.lugar)}</b><span class="${e.estado === "Entregado" ? "ok" : e.estado === "Con incidencia" ? "warn" : ""}">${esc(e.estado)}${e.hora ? " · " + esc(hora(e.hora)) : ""}${e.recibio ? " · recibió " + esc(e.recibio) : ""}</span></li>`).join("")}</ul>`
    : v.destinos.length ? `<h2>Destinos</h2><ul class="ent">${v.destinos.map(d => `<li><b>${esc(d)}</b></li>`).join("")}</ul>` : "";
  const avisos = (v.avisos || []).length ? `<h2>Avisos</h2><ul class="avisos">${v.avisos.map(a => `<li><span>${esc(a.texto)}</span><small>${esc(hora(a.ts))}</small></li>`).join("")}</ul>` : "";
  return { vivo, etapas, entregas, avisos };
}

/** Lo que pide la página cada 15 s (JSON): secciones ya armadas + datos del mapa. Sin datos internos. */
export const estadoJSON = v => { const sec = seccionesHTML(v);
  return { vivo: sec.vivo, etapas: v.cancelado ? "" : sec.etapas, entregas: sec.entregas, avisosHTML: sec.avisos, mapa: v.mapa,
    avisos: (v.avisos || []).map(a => ({ id: a.id, texto: a.texto })), final: v.cancelado || v.etapa >= 4, actualizado: v.actualizado }; };

/** Página HTML completa. Todo valor va escapado. El mapa usa Mapbox (solo si hay token) y el script lleva nonce. */
export function paginaSeguimiento(v, { gracias = false, error = "", nonce = "", mapboxToken = "", vapidPublica = "" } = {}){
  const sec = seccionesHTML(v);
  const conMapa = !!mapboxToken && !v.cancelado && (v.mapa?.puntos || []).length > 0;
  const encuesta = gracias || v.yaCalifico ? `<div class="card ok"><b>¡Gracias por tu opinión!</b></div>`
    : v.puedeCalificar ? `<form method="POST" class="card"><b>¿Cómo te fue con este servicio?</b>
      <div class="stars">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="calificacion" value="${n}" required><span>${"★".repeat(n)}</span></label>`).join("")}</div>
      <textarea name="comentario" maxlength="600" placeholder="¿Algo que quieras contarnos? (opcional)"></textarea>
      ${error ? `<p class="err">${esc(error)}</p>` : ""}<button type="submit">Enviar</button></form>` : "";
  const datos = JSON.stringify({ mapa: v.mapa, token: conMapa ? mapboxToken : "", vapid: vapidPublica, final: v.cancelado || v.etapa >= 4, avisos: (v.avisos || []).map(a => a.id) }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#042552"><link rel="manifest" href="?formato=manifest">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Mi envío"><link rel="apple-touch-icon" href="/icon.svg"><title>Seguimiento ${esc(v.folio)} · D Movimiento</title>
${conMapa ? `<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/v3.26.0/mapbox-gl.css">` : ""}
<style>
:root{--azul:#042552;--naranja:#F27B13;--gris:#607080;--borde:#e3e8f0;--verde:#059669}
*{box-sizing:border-box}html,body{margin:0}body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#eef2f9;color:#0c1829;-webkit-font-smoothing:antialiased}
header{background:linear-gradient(150deg,#042552,#0b3b7d 70%,#13509f);color:#fff;padding:calc(16px + env(safe-area-inset-top)) 18px 22px;border-radius:0 0 24px 24px}
header .m{color:var(--naranja);font-weight:900;font-size:13px;letter-spacing:.06em;text-transform:uppercase}header h1{font-size:22px;margin:6px 0 2px;color:#fff}header p{color:rgba(255,255,255,.75);margin:0;font-size:14px}
main{max-width:620px;margin:0 auto;padding:14px 14px 30px}.card{background:#fff;border-radius:20px;padding:16px;margin-bottom:14px;box-shadow:0 6px 22px rgba(4,37,82,.07)}
h2{font-size:13px;margin:16px 0 8px;color:var(--gris);text-transform:uppercase;letter-spacing:.06em}p{margin:4px 0;color:var(--gris)}
.vivo{display:flex;gap:12px;align-items:center;border-radius:16px;padding:14px 16px;font-size:22px}.vivo b{display:block;font-size:17px}.vivo small{display:block;font-size:14px;opacity:.85;margin-top:2px}
.vivo.azul{background:#e0f2fe;color:#075985}.vivo.verde{background:#ecfdf5;color:#047857}.vivo.naranja{background:#fff7ed;color:#9a3412}.vivo.gris{background:#f1f5f9;color:#334155}
.pulso{width:14px;height:14px;border-radius:50%;background:#0284c7;flex:none;animation:p 1.8s infinite}@keyframes p{0%{box-shadow:0 0 0 0 rgba(2,132,199,.55)}70%{box-shadow:0 0 0 14px rgba(2,132,199,0)}100%{box-shadow:0 0 0 0 rgba(2,132,199,0)}}
#mapa{height:min(52vh,380px);border-radius:18px;overflow:hidden;margin-top:12px;background:#dfe7f2}
.act{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--gris)}
#avisame{background:#fff;border:2px solid var(--azul);color:var(--azul);border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px;width:auto;margin:0}
ol{list-style:none;padding:0;margin:8px 0}ol li{display:flex;gap:12px;align-items:flex-start;padding:7px 0;color:var(--gris)}ol li.ok{color:#0c1829}
.dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--borde);margin-top:3px;flex-shrink:0}li.ok .dot{background:var(--naranja);border-color:var(--naranja)}
small{display:block;color:var(--gris);font-size:12px}.ent,.avisos{list-style:none;padding:0;margin:0}.ent li,.avisos li{display:flex;flex-direction:column;padding:9px 0;border-bottom:1px solid var(--borde)}
.ent span{color:var(--gris);font-size:13px}.ent span.ok{color:#047857;font-weight:700}.ent span.warn{color:#c2410c;font-weight:700}.avisos li span{font-size:15px}
.cancel{color:#be123c;font-weight:700}.stars{display:flex;flex-direction:column;gap:6px;margin:10px 0}.stars label{display:flex;gap:8px;align-items:center;font-size:20px;color:var(--naranja)}
textarea{width:100%;min-height:70px;border:1.5px solid var(--borde);border-radius:12px;padding:10px;font:inherit}
button{margin-top:10px;background:var(--naranja);color:#fff;border:0;border-radius:12px;padding:12px 18px;font-weight:800;font-size:15px;width:100%}
.err{color:#be123c}.card.ok{background:#ecfdf5}footer{text-align:center;color:var(--gris);font-size:12px;padding:10px 0 24px}
#toast{position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));max-width:600px;margin:0 auto;background:var(--azul);color:#fff;border-radius:14px;padding:14px 16px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.25);transform:translateY(-140%);transition:transform .3s;z-index:9}
#toast.si{transform:none}.ios{margin-top:10px;background:#fff7ed;border-radius:12px;padding:10px 12px;font-size:13px;color:#7c2d12;line-height:1.4}.camion{width:40px;height:40px;border-radius:50%;background:var(--naranja);border:3px solid #fff;display:grid;place-items:center;font-size:20px;box-shadow:0 4px 14px rgba(242,123,19,.6)}
.pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.25);display:grid;place-items:center}.pin i{display:block;transform:rotate(45deg);font-style:normal;color:#fff;font-weight:900;font-size:13px;line-height:1}
</style></head><body><div id="toast"></div>
<header><div class="m">D Movimiento</div><h1>Tu servicio ${esc(v.folio)}</h1><p>${[v.cliente, v.fecha && "Fecha: " + v.fecha, v.hora].filter(Boolean).map(esc).join(" · ")}</p></header>
<main>
<div class="card"><div id="vivo">${sec.vivo}</div>${conMapa ? `<div id="mapa" aria-label="Mapa de tu envío"></div>` : ""}
<div class="act"><span id="actualizado">Actualizado hace un momento</span>${v.cancelado || v.etapa >= 4 ? "" : `<button id="avisame" type="button">🔔 Avísame en este celular</button>`}</div>
<div id="ios" class="ios" hidden>📱 <b>En iPhone:</b> toca <b>Compartir</b> <span aria-hidden="true">⎋</span> → <b>Agregar a inicio</b>, abre "Mi envío" desde tu pantalla y ahí toca <b>Avísame</b>. Así te llegan los avisos aunque cierres la página.</div></div>
<div class="card"><div id="avisos">${sec.avisos || "<h2>Avisos</h2><p>Aquí verás cada novedad de tu envío, al momento.</p>"}</div></div>
<div class="card">${v.chofer ? `<p>Te atiende: <b>${esc(v.chofer)}</b></p>` : ""}<div id="etapas">${v.cancelado ? `<p class="cancel">Este servicio fue cancelado.</p>` : sec.etapas}</div><div id="entregas">${sec.entregas}</div></div>
${encuesta}</main><footer>D Movimiento · Logística · Esta página se actualiza sola</footer>
<script nonce="${esc(nonce)}">
(function(){
  var D=${datos}, conocidos=new Set(D.avisos), ultima=Date.now(), mapa=null, camion=null, pins=[], encuadrado=false;
  function $(id){return document.getElementById(id)}
  function toast(t){var e=$("toast");e.textContent=t;e.className="si";setTimeout(function(){e.className=""},6000)}
  function avisar(t){toast(t);try{navigator.vibrate&&navigator.vibrate([120,60,120])}catch(_){}
    try{if(window.Notification&&Notification.permission==="granted")new Notification("D Movimiento",{body:t,tag:"dmov-"+Date.now()})}catch(_){}}
  function marcador(html){var d=document.createElement("div");d.innerHTML=html;return d.firstChild}
  function pintar(m){if(!mapa||!m)return;
    pins.forEach(function(p){p.remove()});pins=[];var b=new mapboxgl.LngLatBounds();
    (m.puntos||[]).forEach(function(p,i){var c=p.estado==="Entregado"?"#059669":p.estado==="Con incidencia"?"#c2410c":"#042552";
      var el=marcador('<div><div class="pin" style="background:'+c+'"><i>'+(p.estado==="Entregado"?"✓":(i+1))+'</i></div></div>');
      pins.push(new mapboxgl.Marker({element:el,anchor:"bottom"}).setLngLat([p.lng,p.lat]).setPopup(new mapboxgl.Popup({offset:18}).setText(p.lugar+" · "+p.estado)).addTo(mapa));b.extend([p.lng,p.lat]);});
    if(m.vehiculo){var ll=[m.vehiculo.lng,m.vehiculo.lat];if(!camion)camion=new mapboxgl.Marker({element:marcador('<div class="camion">🚚</div>')}).setLngLat(ll).addTo(mapa);else camion.setLngLat(ll);b.extend(ll);}
    else if(camion){camion.remove();camion=null}
    if(!encuadrado&&!b.isEmpty()){mapa.fitBounds(b,{padding:60,maxZoom:15,duration:0});encuadrado=true}}
  if(D.token&&window.mapboxgl===undefined){var s=document.createElement("script");s.src="https://api.mapbox.com/mapbox-gl-js/v3.26.0/mapbox-gl.js";s.nonce="${esc(nonce)}";
    s.onload=function(){mapboxgl.accessToken=D.token;var c=(D.mapa.vehiculo||(D.mapa.puntos||[])[0]||{lat:19.4326,lng:-99.1332});
      mapa=new mapboxgl.Map({container:"mapa",style:"mapbox://styles/mapbox/streets-v12",center:[c.lng,c.lat],zoom:12,cooperativeGestures:true,attributionControl:true,
        locale:{"ScrollZoomBlocker.CtrlMessage":"Usa Ctrl + rueda para acercar","ScrollZoomBlocker.CmdMessage":"Usa ⌘ + rueda para acercar","TouchPanBlocker.Message":"Usa dos dedos para mover el mapa"}});
      mapa.addControl(new mapboxgl.NavigationControl({showCompass:false}),"top-right");mapa.on("load",function(){pintar(D.mapa)});};document.head.appendChild(s);}
  /* Avisos al celular aunque la página esté cerrada (Web Push). En iPhone solo funciona desde "Agregar a inicio". */
  var b=$("avisame"), ios=/iP(hone|ad|od)/.test(navigator.userAgent), app=window.navigator.standalone===true||matchMedia("(display-mode: standalone)").matches;
  var puedePush="serviceWorker" in navigator&&"PushManager" in window&&window.Notification&&D.vapid;
  function b64(s){var p="=".repeat((4-s.length%4)%4),r=atob((s+p).replace(/-/g,"+").replace(/_/g,"/")),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o}
  async function suscribir(){var reg=await navigator.serviceWorker.register("/sw-seguimiento.js",{scope:"/s/"});await navigator.serviceWorker.ready;
    var sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(D.vapid)});
    var r=await fetch(location.pathname+"?accion=suscribir",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sub)});if(!r.ok)throw new Error("no")}
  if(b){
    if(ios&&!app&&!puedePush){b.style.display="none";$("ios").hidden=false}
    else if(!window.Notification){b.style.display="none"}
    else if(Notification.permission==="granted"){b.textContent="🔔 Avisos activados";if(puedePush)suscribir().catch(function(){})}
    b.onclick=async function(){try{var p=await Notification.requestPermission();if(p!=="granted"){b.textContent="Avisos bloqueados en este navegador";return}
      b.textContent="Activando…";if(puedePush)await suscribir();b.textContent="🔔 Avisos activados";toast("Listo: te avisamos en este celular cada novedad de tu envío.")}
      catch(_){b.textContent="🔔 Avisos activados (con la página abierta)"}}}
  setInterval(function(){var s=Math.round((Date.now()-ultima)/1000);$("actualizado").textContent="Actualizado hace "+(s<10?"un momento":s<60?s+" s":Math.round(s/60)+" min")},5000);
  async function refrescar(){if(D.final)return;try{var r=await fetch(location.pathname+"?formato=json",{cache:"no-store"});if(!r.ok)return;var j=await r.json();
    ["vivo","etapas","entregas"].forEach(function(k){if($(k)&&j[k]!=null)$(k).innerHTML=j[k]});if(j.avisosHTML&&$("avisos"))$("avisos").innerHTML=j.avisosHTML;
    (j.avisos||[]).slice().reverse().forEach(function(a){if(!conocidos.has(a.id)){conocidos.add(a.id);avisar(a.texto)}});
    D.mapa=j.mapa;pintar(j.mapa);ultima=Date.now();if(j.final){D.final=true;setTimeout(function(){location.reload()},1500)}}catch(_){}}
  setInterval(refrescar,15000);document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")refrescar()});
})();
</script></body></html>`;
}

/** Notificación al celular del cliente para un evento (o null si no es algo que le importe). */
export function notificacionDeEvento(e, paradas, s, token){
  const [a] = avisosCliente([e], paradas);
  if(!a) return null;
  return { title: `D Movimiento · ${txt(s?.folio, 30) || "tu envío"}`, body: a.texto, url: `/s/${token}`, tag: `dmov-${txt(s?.folio, 30)}-${txt(e.id, 60)}` };
}

/** Suscripción push que manda el navegador: solo https, llaves con formato y tamaño razonables. */
export function suscripcionValida(b){
  const ep = String(b?.endpoint ?? ""), p256dh = String(b?.keys?.p256dh ?? ""), auth = String(b?.keys?.auth ?? "");
  if(!/^https:\/\/[^\s]{10,800}$/.test(ep)) return null;
  if(!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,60}$/.test(auth)) return null;
  return { endpoint: ep, keys: { p256dh, auth } };
}

/** Manifest para que en iPhone se pueda "Agregar a inicio" esta página y así recibir avisos. */
export const manifestCliente = (ruta, folio) => ({ name: `D Movimiento · ${txt(folio, 30)}`, short_name: "Mi envío", start_url: ruta, scope: "/s/",
  display: "standalone", background_color: "#042552", theme_color: "#042552", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] });

export const paginaNoEncontrada = () => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>D Movimiento</title></head>
<body style="font-family:system-ui,sans-serif;background:#f4f6fa;color:#0c1829;padding:40px 16px;text-align:center"><h1 style="color:#042552">D Movimiento</h1><p>Este link de seguimiento no existe o ya no está activo. Pide uno nuevo a tu contacto de D Movimiento.</p></body></html>`;
