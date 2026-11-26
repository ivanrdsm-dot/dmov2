/* DMOV · App del chofer en el navegador del celular (<dirección del sistema>/chofer).
   Sirve desde hoy, sin instalar nada: entra con su celular y contraseña, ve sus rutas,
   empieza su día, navega a cada parada, entrega con foto y manda su ubicación.
   Usa las MISMAS funciones del servidor que la app nativa: el servidor valida todo
   (equipo, check-in, geocerca, evidencia). Límite honesto: el navegador solo manda la
   ubicación mientras esta pantalla está abierta; por eso se pide mantenerla encendida. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref as refStorage, uploadBytes } from "firebase/storage";
import { correoDeChofer, enlaceNavegar, enlaceRutaCompleta } from "./lugares.ts";
import { leerCola, agregarACola, quitarDeCola, marcarError, esErrorDeRed, yaEstabaCerrada } from "./colaChofer.ts";
import FirmaPad from "./FirmaPad.jsx";
import AvisoPrivacidad, { useAvisoAutorizado } from "./AvisoPrivacidad.jsx";

const LETRA = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
const AZUL = "#042552", NARANJA = "#F27B13", VERDE = "#059669", ROJO = "#dc2626", GRIS = "#5b6b80", FONDO = "#f1f4fb";
const INCIDENCIAS = ["Cliente ausente", "Entrega rechazada", "Entrega parcial", "Faltantes", "Daños", "Devolución al origen"];
/* App nativa (Android / iPhone, carpeta app-nativa): abre esta misma página y agrega el GPS en segundo plano.
   En el navegador todo sigue igual. */
const NATIVO = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
const plugin = nombre => { try { return NATIVO ? window.Capacitor.registerPlugin(nombre) : null; } catch { return null; } };
const GPS_FONDO = plugin("BackgroundGeolocation"), HTTP_NATIVO = plugin("CapacitorHttp");
export const puntoNativo = (l, bateria) => ({ lat: l.latitude, lng: l.longitude, tMs: Math.round(l.time || Date.now()), precisionM: l.accuracy,
  velocidadMs: l.speed ?? null, bateria, simulada: l.simulated === true });
const ENVIO_MS = 15000;   // cada 15 s: el cliente ve la camioneta casi en tiempo real

const fechaCDMX = (ms = Date.now()) => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);
const mensaje = e => String(e?.message || "No se pudo. Intenta otra vez.").replace(/^(functions\/[a-z-]+:?\s*|Firebase:\s*)/i, "")
  .replace(/\(auth\/(invalid-credential|wrong-password|user-not-found|invalid-login-credentials)\)\.?/i, "Celular o contraseña incorrectos.")
  .replace(/\(auth\/too-many-requests\)\.?/i, "Demasiados intentos. Espera unos minutos.")
  .replace(/\(auth\/network-request-failed\)\.?/i, "Sin internet. Revisa tu señal.")
  .replace(/.*storage\/unauthorized.*/i, "No se pudo subir la foto: tu cuenta no tiene permiso. Avisa a la oficina.")
  .replace(/.*storage\/(retry-limit-exceeded|canceled|unknown).*/i, "No se pudo subir la foto por la señal. Intenta otra vez.")
  .replace(/^Error\s+/, "")
  .replace(/ligada a otro equipo\. Avisa a operaciones\./, "ligada a otro equipo. Si acabas de poner la app en tu pantalla de inicio, pide a la oficina: En vivo → Cambió de teléfono.");
function dispositivoId(){
  try {
    let d = localStorage.getItem("dmov_disp");
    if(!d){ d = (crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)) + "-web"; localStorage.setItem("dmov_disp", d); }
    return d;
  } catch { return "web-" + navigator.userAgent.length + "-" + screen.width + "x" + screen.height; }
}
export const posicionAhora = (timeout = 15000) => new Promise((ok, mal) => {
  if(!navigator.geolocation) return mal(new Error("Este celular no da ubicación"));
  navigator.geolocation.getCurrentPosition(p => ok(p), e => mal(new Error(e.code === 1 ? "Permite la ubicación para esta página (candado junto a la dirección)." : "No se pudo leer tu ubicación. Sal a cielo abierto.")),
    { enableHighAccuracy: true, timeout, maximumAge: 0 });
});
const aPunto = (p, bateria) => ({ lat: p.coords.latitude, lng: p.coords.longitude, tMs: Math.round(p.timestamp || Date.now()), precisionM: p.coords.accuracy,
  velocidadMs: p.coords.speed ?? null, bateria, simulada: false });
/* Foto más ligera: máximo 1600 px, JPEG. Así sube rápido con poca señal y queda bajo el límite de 5 MB. */
export async function comprimir(file, maximo = 1600, calidad = 0.8){
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, maximo / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", calidad));
    if(b) return b;
  } catch {}
  if(file.size >= 5 * 1024 * 1024) throw new Error("La foto pesa mucho. Tómala con la cámara (no de la galería) y vuelve a intentar.");
  return file;
}

/* Sello visible en las fotos de check-in/out: quién, cuándo y dónde. El servidor además guarda la hora real
   de subida y la huella del archivo: la foto no se puede cambiar después. */
const FOTO_VIGENTE_MIN = 20;
const horaLocal = ms => new Date(ms).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/* Carga la foto para dibujar el sello: primero createImageBitmap y, si el celular no lo soporta, con <img>. */
async function cargarImagen(file){
  try { return await createImageBitmap(file); } catch {}
  const url = URL.createObjectURL(file);
  try { return await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
}
/* Imprime en la foto quién, cuándo y DÓNDE (dirección y coordenadas). La foto regresa marcada:
   foto.selloImpreso = true/false (si falla, el servidor lo registra como duda). */
export async function conSello(file, lineas, maximo = 1600){
  try {
    const img = await cargarImagen(file);
    const k = Math.min(1, maximo / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height);
    const t = Math.max(14, Math.round(c.width / 38)), alto = Math.round(t * 1.45 * lineas.length + t * 0.8);
    g.fillStyle = "rgba(4,37,82,.78)"; g.fillRect(0, c.height - alto, c.width, alto);
    g.fillStyle = "#fff"; g.font = `700 ${t}px system-ui, sans-serif`; g.textBaseline = "top";
    lineas.forEach((l, i) => g.fillText(l, Math.round(t * 0.6), c.height - alto + Math.round(t * 0.4) + i * Math.round(t * 1.45), c.width - t));
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
    if(b){ b.selloImpreso = true; b.enVivo = file?.enVivo === true; return b; }
  } catch {}
  const sin = await comprimir(file);
  try { sin.selloImpreso = false; sin.enVivo = file?.enVivo === true; } catch {}
  return sin;
}
/* Dirección donde está el chofer (Google, desde el servidor). Si tarda más de 4 s, sigue sin ella (las coordenadas siempre van). */
export async function lugarDe(llamar, p){
  try { const r = await Promise.race([llamar("choferLugar", { lat: p.coords.latitude, lng: p.coords.longitude }), new Promise(ok => setTimeout(() => ok(null), 4000))]);
    return String(r?.lugar || ""); } catch { return ""; }
}
export const lineasSello = (titulo, tomadaMs, lugar, p) => [titulo, horaLocal(tomadaMs), ...(lugar ? ["📍 " + lugar] : []),
  `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)} ±${Math.round(p.coords.accuracy || 0)} m`];
export const metaSello = (lineas, tomadaMs, foto) => ({ sello: lineas.join(" | "), tomadaMs: String(tomadaMs), selloImpreso: foto?.selloImpreso ? "si" : "no", enVivo: foto?.enVivo ? "si" : "no" });

/* Borradores en el celular: si Android recarga la página al abrir la cámara, no se pierde lo capturado. */
const BORR_DIA = "dm_borrador_dia", BORR_ENTREGA = "dm_borrador_entrega";
const leerBorrador = k => { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch { return null; } };
const guardarBorrador = (k, v) => { try { v ? sessionStorage.setItem(k, JSON.stringify(v)) : sessionStorage.removeItem(k); } catch {} };
const aDataURL = async archivo => { if(!archivo) return ""; try { const b = await comprimir(archivo, 1280, 0.72);
  return await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(b); }); } catch { return ""; } };
const almacenLocal = () => { try { return window.localStorage; } catch { return null; } };
const blobADataURL = b => b ? new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(b); }) : Promise.resolve("");
const deDataURL = async url => { if(!url) return null; try { return await (await fetch(url)).blob(); } catch { return null; } };

/* ── Diseño (celular primero): una sola hoja de estilos, animaciones suaves, áreas seguras del notch ── */
const CSS = `
html,body{margin:0;padding:0;background:#eef2f9;overscroll-behavior-y:none}
.dm *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dm{font-family:${LETRA};color:${AZUL};min-height:100dvh;background:#eef2f9;-webkit-font-smoothing:antialiased;padding-bottom:calc(110px + env(safe-area-inset-bottom))}
.dm-hdr{background:linear-gradient(150deg,#042552 0%,#0b3b7d 70%,#13509f 100%);color:#fff;padding:calc(14px + env(safe-area-inset-top)) 18px 26px;border-radius:0 0 28px 28px;position:relative;overflow:hidden}
.dm-hdr:after{content:"";position:absolute;right:-60px;top:-60px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(242,123,19,.35),transparent 70%)}
.dm-top{display:flex;align-items:center;gap:10px;position:relative;z-index:1}
.dm-marca{font-weight:900;color:${NARANJA};font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.dm-hola{font-size:26px;font-weight:900;margin:14px 0 2px;position:relative;z-index:1;letter-spacing:-.02em}
.dm-fecha{opacity:.75;font-size:14px;position:relative;z-index:1;text-transform:capitalize}
.dm-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:800}
.dm-sos{margin-left:auto;background:${ROJO};color:#fff;border:0;border-radius:999px;padding:9px 16px;font-weight:900;font-size:15px;letter-spacing:.04em;box-shadow:0 4px 14px rgba(220,38,38,.45);cursor:pointer}
.dm-salir{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:999px;padding:9px 12px;font-weight:700;font-size:13px;cursor:pointer}
.dm-pasos{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:-16px 14px 0;position:relative;z-index:2}
.dm-paso{background:#fff;border-radius:14px;padding:9px 4px 8px;text-align:center;font-size:11px;font-weight:800;color:${GRIS};box-shadow:0 4px 14px rgba(4,37,82,.08);transition:all .3s}
.dm-paso b{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;margin:0 auto 4px;background:#e8eef7;color:${GRIS};font-size:12px}
.dm-paso.hecho b{background:${VERDE};color:#fff}.dm-paso.ahora{color:${AZUL};outline:2px solid ${NARANJA}}.dm-paso.ahora b{background:${NARANJA};color:#fff}
.dm-cuerpo{max-width:560px;margin:0 auto;padding:16px 14px 0}
.dm-card{background:#fff;border-radius:22px;padding:18px;margin-bottom:14px;box-shadow:0 6px 24px rgba(4,37,82,.07);animation:dmSube .35s ease both}
.dm-titulo{font-size:21px;font-weight:900;letter-spacing:-.01em;margin:0}
.dm-sub{color:${GRIS};font-size:15px;margin:4px 0 0;line-height:1.4}
.dm-et{font-size:12px;font-weight:800;color:${GRIS};margin:16px 0 7px;text-transform:uppercase;letter-spacing:.06em}
.dm-in{width:100%;border:2px solid #dbe3ef;border-radius:14px;padding:14px 15px;font-size:17px;font-family:inherit;background:#f8fafd;color:${AZUL};outline:none;transition:border-color .2s,background .2s}
.dm-in:focus{border-color:${NARANJA};background:#fff}
.dm-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:56px;border-radius:16px;border:0;font-family:inherit;font-size:17px;font-weight:900;cursor:pointer;text-decoration:none;transition:transform .12s,opacity .2s,box-shadow .2s}
.dm-btn:active{transform:scale(.97)}.dm-btn:disabled{opacity:.55}
.dm-naranja{background:linear-gradient(135deg,#F27B13,#ff9b3f);color:#fff;box-shadow:0 8px 20px rgba(242,123,19,.35)}
.dm-verde{background:linear-gradient(135deg,#059669,#10b981);color:#fff;box-shadow:0 8px 20px rgba(5,150,105,.3)}
.dm-azul{background:${AZUL};color:#fff}
.dm-linea{background:#fff;color:${AZUL};border:2px solid #dbe3ef}
.dm-gris{background:#dfe5ee;color:${GRIS}}
.dm-fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.dm-foto{position:relative;aspect-ratio:1/1;border-radius:18px;border:2px dashed #c9d4e4;background:#f6f8fc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;overflow:hidden;transition:transform .12s}
.dm-foto:active{transform:scale(.96)}
button.dm-foto{padding:0;font:inherit;color:inherit;width:100%;-webkit-appearance:none;appearance:none}
.dm-foto span{font-size:30px}.dm-foto small{font-size:12px;font-weight:800;color:${GRIS};text-align:center;padding:0 4px;line-height:1.15}
.dm-foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dm-foto.lista{border:3px solid ${VERDE}}
.dm-foto .ok{position:absolute;right:6px;top:6px;background:${VERDE};color:#fff;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:900;z-index:1}
.dm-seg{display:grid;grid-template-columns:repeat(5,1fr);background:#eef2f9;border-radius:14px;padding:4px;gap:4px}
.dm-seg button{border:0;background:transparent;border-radius:11px;padding:12px 2px;font-weight:800;font-size:14px;color:${GRIS};font-family:inherit;cursor:pointer;transition:all .2s}
.dm-seg button.si{background:#fff;color:${AZUL};box-shadow:0 2px 8px rgba(4,37,82,.12)}
.dm-sig{background:linear-gradient(160deg,#fff 0%,#fff7ef 100%);border:2px solid ${NARANJA}}
.dm-kicker{display:inline-block;background:${NARANJA};color:#fff;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:5px 10px}
.dm-dos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.dm-barra{height:10px;background:#e8eef7;border-radius:999px;overflow:hidden;margin:10px 0 4px}
.dm-barra i{display:block;height:100%;background:linear-gradient(90deg,#059669,#34d399);border-radius:999px;transition:width .6s ease}
.dm-tl{position:relative;margin-top:6px}
.dm-tl-item{position:relative;padding:4px 0 16px 40px}
.dm-tl-item:before{content:"";position:absolute;left:13px;top:30px;bottom:0;width:2px;background:#e2e8f2}
.dm-tl-item:last-child:before{display:none}
.dm-tl-dot{position:absolute;left:0;top:2px;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:900;background:#e8eef7;color:${GRIS}}
.dm-tl-item.hecha .dm-tl-dot{background:${VERDE};color:#fff}.dm-tl-item.prob .dm-tl-dot{background:${NARANJA};color:#fff}.dm-tl-item.sig .dm-tl-dot{background:${AZUL};color:#fff;box-shadow:0 0 0 5px rgba(4,37,82,.12)}
.dm-ind{background:#fff7ed;border-left:5px solid ${NARANJA};border-radius:12px;padding:12px 14px;font-size:16px;margin-top:12px;line-height:1.4}
.dm-vivo{display:flex;align-items:center;gap:10px;border-radius:16px;padding:12px 14px;font-weight:800;font-size:14px;margin-bottom:14px;animation:dmSube .35s ease both}
.dm-pulso{width:12px;height:12px;border-radius:50%;background:${VERDE};box-shadow:0 0 0 0 rgba(5,150,105,.6);animation:dmPulso 1.8s infinite;flex:none}
.dm-pie{position:fixed;left:0;right:0;bottom:0;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(238,242,249,0),#eef2f9 35%);z-index:30}
.dm-pie>div{max-width:560px;margin:0 auto}
.dm-toast{position:fixed;left:14px;right:14px;top:calc(12px + env(safe-area-inset-top));z-index:80;border-radius:16px;padding:14px 16px;color:#fff;font-weight:800;font-size:15px;box-shadow:0 10px 30px rgba(0,0,0,.2);animation:dmBaja .3s ease both;max-width:560px;margin:0 auto}
.dm-velo{position:fixed;inset:0;background:rgba(4,37,82,.55);backdrop-filter:blur(3px);z-index:60;animation:dmAparece .2s ease both}
.dm-hoja{position:fixed;left:0;right:0;bottom:0;max-height:92dvh;overflow-y:auto;background:#fff;border-radius:26px 26px 0 0;z-index:61;padding:10px 18px calc(20px + env(safe-area-inset-bottom));animation:dmHoja .32s cubic-bezier(.2,.8,.2,1) both;max-width:620px;margin:0 auto}
.dm-asa{width:44px;height:5px;border-radius:999px;background:#d5dde8;margin:0 auto 12px}
.dm-vacio{text-align:center;padding:30px 18px}.dm-vacio div{font-size:56px;margin-bottom:6px;animation:dmFlota 3s ease-in-out infinite}
.dm-login{min-height:100dvh;background:linear-gradient(160deg,#042552 0%,#0b3b7d 60%,#13509f 100%);padding:calc(48px + env(safe-area-inset-top)) 20px 30px;display:flex;flex-direction:column}
.dm-logo{width:64px;height:64px;border-radius:20px;background:${NARANJA};display:grid;place-items:center;font-size:30px;box-shadow:0 10px 30px rgba(242,123,19,.45);margin-bottom:18px}
.dm-ojo{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;font-size:20px;cursor:pointer;padding:8px}
@keyframes dmSube{from{transform:translateY(10px)}to{transform:none}}
@keyframes dmBaja{from{transform:translateY(-14px)}to{transform:none}}
@keyframes dmAparece{from{opacity:0}to{opacity:1}}
@keyframes dmHoja{from{transform:translateY(100%)}to{transform:none}}
@keyframes dmPulso{0%{box-shadow:0 0 0 0 rgba(5,150,105,.55)}70%{box-shadow:0 0 0 12px rgba(5,150,105,0)}100%{box-shadow:0 0 0 0 rgba(5,150,105,0)}}
@keyframes dmFlota{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.dm *{animation:none!important;transition:none!important}}
`;
const Estilos = () => <style>{CSS}</style>;
const Falla = ({ children }) => children ? <div style={{ background: "#fef2f2", color: ROJO, borderRadius: 12, padding: "10px 12px", fontWeight: 700, marginTop: 12, fontSize: 15 }}>{children}</div> : null;
const hoyTexto = () => new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

/* ── Cámara EN VIVO dentro de la app ──────────────────────────────────────
   Todas las fotos del chofer (check-in, check-out, tickets y entregas) se toman aquí, del video de la
   cámara en este momento. No existe forma de elegir una foto de la galería. La foto sale marcada
   (foto.enVivo = true) y el servidor revisa esa marca. */
export function CamaraEnVivo({ frente = false, titulo, onFoto, onCerrar }){
  const video = useRef(null), flujo = useRef(null);
  const [usarFrente, setUsarFrente] = useState(frente), [error, setError] = useState(""), [lista, setLista] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      setLista(false); setError("");
      try {
        flujo.current?.getTracks().forEach(t => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: usarFrente ? "user" : { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
        if(!vivo){ s.getTracks().forEach(t => t.stop()); return; }
        flujo.current = s;
        if(video.current){ video.current.srcObject = s; await video.current.play().catch(() => {}); setLista(true); }
      } catch(e){
        setError(e?.name === "NotAllowedError" ? "Permite la cámara: toca el candado junto a la dirección → Cámara → Permitir, y vuelve a intentar."
          : "No se pudo abrir la cámara. Cierra otras apps que la usen y vuelve a intentar.");
      }
    })();
    return () => { vivo = false; };
  }, [usarFrente]);
  useEffect(() => () => flujo.current?.getTracks().forEach(t => t.stop()), []);
  const tomar = async () => {
    const v = video.current;
    if(!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext("2d");
    if(usarFrente){ g.translate(c.width, 0); g.scale(-1, 1); }   // la selfie se ve como en un espejo
    g.drawImage(v, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
    if(!b) return;
    const f = new File([b], "foto.jpg", { type: "image/jpeg", lastModified: Date.now() });
    try { f.enVivo = true; } catch {}
    flujo.current?.getTracks().forEach(t => t.stop());
    onFoto(f);
  };
  /* Encima de toda la pantalla (fuera de las tarjetas animadas, que atraparían el "fixed"). */
  return createPortal(<div role="dialog" aria-label={titulo} style={{ position: "fixed", inset: 0, zIndex: 95, background: "#000", display: "flex", flexDirection: "column", fontFamily: LETRA }}>
    <div style={{ color: "#fff", fontWeight: 900, fontSize: 17, padding: "calc(12px + env(safe-area-inset-top)) 16px 10px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ flex: 1 }}>📷 {titulo}</span>
      <button onClick={() => { flujo.current?.getTracks().forEach(t => t.stop()); onCerrar(); }} style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: 0, borderRadius: 999, padding: "8px 14px", fontWeight: 800, fontSize: 15 }}>Cancelar</button>
    </div>
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <video ref={video} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", transform: usarFrente ? "scaleX(-1)" : "none" }}/>
      {!lista && !error && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700 }}>Abriendo la cámara…</div>}
      {error && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24 }}><div style={{ background: "#fff", color: ROJO, borderRadius: 16, padding: 16, fontWeight: 800, fontSize: 16, textAlign: "center" }}>{error}</div></div>}
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", padding: "16px 16px calc(20px + env(safe-area-inset-bottom))" }}>
      <button onClick={() => setUsarFrente(x => !x)} aria-label="Cambiar de cámara" style={{ width: 54, height: 54, borderRadius: 999, border: 0, background: "rgba(255,255,255,.18)", color: "#fff", fontSize: 22 }}>🔄</button>
      <button onClick={tomar} disabled={!lista} aria-label="Tomar foto" style={{ width: 78, height: 78, borderRadius: 999, border: "5px solid #fff", background: lista ? NARANJA : "#555" }}/>
      <span style={{ width: 54 }}/>
    </div>
  </div>, document.body);
}

function Foto({ titulo, icono, archivo, onCambio, camara = "", onError }){
  const url = archivo ? URL.createObjectURL(archivo) : "";
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  const [abierta, setAbierta] = useState(false);
  return (<>
    <button type="button" className={"dm-foto" + (archivo ? " lista" : "")} onClick={() => setAbierta(true)} aria-label={`Tomar foto: ${titulo}`}>
      {archivo ? <><img src={url} alt=""/><i className="ok">✓</i></> : <><span>{icono}</span><small>{titulo}</small></>}
    </button>
    {abierta && <CamaraEnVivo frente={camara === "user"} titulo={titulo} onCerrar={() => setAbierta(false)}
      onFoto={f => { setAbierta(false); onError?.(""); onCambio(f); }}/>}
  </>);
}

/* ── Entrar ───────────────────────────────────────────────────────────────── */
function Entrar({ auth, telInicial = "", aviso = "" }){
  const [usuario, setUsuario] = useState(telInicial), [clave, setClave] = useState(""), [ver, setVer] = useState(false), [error, setError] = useState(""), [ocupado, setOcupado] = useState(false);
  const entrar = async () => {
    const correo = correoDeChofer(usuario);
    if(!correo){ setError("Escribe tu celular de 10 dígitos."); return; }
    if(!clave){ setError("Escribe tu contraseña."); return; }
    setOcupado(true); setError("");
    try { await signInWithEmailAndPassword(auth, correo, clave); }
    catch(e){ setError(mensaje(e)); setOcupado(false); }
  };
  return (
    <div className="dm"><Estilos/>
      <div className="dm-login">
        <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
          <div className="dm-logo">🚚</div>
          <div style={{ color: "#fff", fontSize: 30, fontWeight: 900, letterSpacing: "-.02em" }}>Hola, chofer</div>
          <div style={{ color: "rgba(255,255,255,.75)", fontSize: 16, margin: "6px 0 26px" }}>Entra para ver tus rutas de hoy.</div>
          <div className="dm-card" style={{ padding: 20 }}>
            {aviso && <div style={{ background: "#eff6ff", color: AZUL, borderRadius: 12, padding: "10px 12px", fontWeight: 700, marginBottom: 14, fontSize: 15 }}>{aviso}</div>}
            <div className="dm-et" style={{ marginTop: 0 }}>Tu celular</div>
            <input className="dm-in" inputMode="tel" autoComplete="username" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="55 1234 5678"/>
            <div className="dm-et">Tu contraseña</div>
            <div style={{ position: "relative" }}>
              <input className="dm-in" type={ver ? "text" : "password"} autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => e.key === "Enter" && entrar()} style={{ paddingRight: 48 }}/>
              <button type="button" className="dm-ojo" onClick={() => setVer(v => !v)} aria-label={ver ? "Ocultar contraseña" : "Ver contraseña"}>{ver ? "🙈" : "👁️"}</button>
            </div>
            <Falla>{error}</Falla>
            <button onClick={entrar} disabled={ocupado} className="dm-btn dm-naranja" style={{ marginTop: 18 }}>{ocupado ? "Entrando…" : "Entrar"}</button>
          </div>
          <p style={{ color: "rgba(255,255,255,.7)", fontSize: 14, textAlign: "center", marginTop: 8 }}>¿No tienes contraseña? Pídele a la oficina tu enlace por WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}

/* ── Activar la cuenta (enlace que manda la oficina por WhatsApp) ────────────
   Dura 7 días. Si ya se usó o venció, no hay pantalla de error: sale "Entrar" con su celular escrito. */
const tokenActivar = () => { try { return new URLSearchParams(window.location.search).get("activar") || ""; } catch { return ""; } };
const quitarToken = () => { try { const u = new URL(window.location.href); u.searchParams.delete("activar"); window.history.replaceState(null, "", u.pathname + u.search + u.hash); } catch {} };
function Activar({ auth, app, token }){
  const [info, setInfo] = useState(null), [clave, setClave] = useState(""), [ver, setVer] = useState(false), [error, setError] = useState(""), [ocupado, setOcupado] = useState(false);
  const activar = useCallback(datos => httpsCallable(getFunctions(app, "us-central1"), "choferActivar")({ token, ...datos }).then(r => r.data), [app, token]);
  useEffect(() => { activar({}).then(setInfo).catch(() => setInfo({ estado: "sin-red" })); }, [activar]);
  const crear = async () => {
    if(clave.length < 6){ setError("Usa al menos 6 letras o números."); return; }
    setOcupado(true); setError("");
    try {
      const r = await activar({ clave });
      if(r.estado !== "creada"){ setInfo(r); setOcupado(false); return; }
      quitarToken();
      await signInWithEmailAndPassword(auth, r.correo, clave);
    } catch(e){ setError(mensaje(e)); setOcupado(false); }
  };
  if(!info) return <div className="dm"><Estilos/><div className="dm-vacio" style={{ paddingTop: 120 }}><div>🚚</div><p className="dm-sub">Cargando…</p></div></div>;
  if(info.estado === "sin-red") return <Entrar auth={auth} aviso="No hay señal. Cuando regrese, vuelve a abrir el enlace."/>;
  if(info.estado !== "lista"){
    const aviso = info.estado === "usada" ? "Ya creaste tu contraseña. Escríbela para entrar." : "Este enlace ya no sirve. Si no tienes contraseña, pide uno nuevo a la oficina.";
    return <Entrar auth={auth} telInicial={info.tel || ""} aviso={aviso}/>;
  }
  return (
    <div className="dm"><Estilos/>
      <div className="dm-login">
        <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
          <div className="dm-logo">🚚</div>
          <div style={{ color: "#fff", fontSize: 30, fontWeight: 900, letterSpacing: "-.02em" }}>Hola{info.nombre ? ", " + info.nombre : ""} 👋</div>
          <div style={{ color: "rgba(255,255,255,.75)", fontSize: 16, margin: "6px 0 26px" }}>Crea tu contraseña y listo.</div>
          <div className="dm-card" style={{ padding: 20 }}>
            <div className="dm-et" style={{ marginTop: 0 }}>Tu celular</div>
            <div className="dm-in" style={{ display: "flex", alignItems: "center", color: AZUL, fontWeight: 800 }}>{info.tel}</div>
            <div className="dm-et">Tu nueva contraseña</div>
            <div style={{ position: "relative" }}>
              <input className="dm-in" type={ver ? "text" : "password"} autoComplete="new-password" value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => e.key === "Enter" && crear()} placeholder="Mínimo 6" style={{ paddingRight: 48 }}/>
              <button type="button" className="dm-ojo" onClick={() => setVer(v => !v)} aria-label={ver ? "Ocultar contraseña" : "Ver contraseña"}>{ver ? "🙈" : "👁️"}</button>
            </div>
            <p className="dm-sub" style={{ fontSize: 14, margin: "8px 0 0" }}>Apúntala. Con tu celular y esta contraseña entras siempre.</p>
            <Falla>{error}</Falla>
            <button onClick={crear} disabled={ocupado} className="dm-btn dm-naranja" style={{ marginTop: 18 }}>{ocupado ? "Creando…" : "Crear y entrar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Empezar el día (check-in) ───────────────────────────────────────────── */
function EmpezarDia({ chofer, placaSugerida, llamar, subir, onListo }){
  const [selfie, setSelfie] = useState(null), [placas, setPlacas] = useState(null), [tablero, setTablero] = useState(null);
  const [placa, setPlaca] = useState(placaSugerida || ""), [km, setKm] = useState(""), [gas, setGas] = useState("");
  const [error, setError] = useState(""), [paso, setPaso] = useState("");
  const tomadas = useRef({});   // hora en que se tomó cada foto (se guarda también en el borrador)
  const tomar = (k, set) => f => { tomadas.current = { ...tomadas.current, [k]: f.lastModified || Date.now() }; setError(""); set(f); };
  useEffect(() => { if(placaSugerida && !placa) setPlaca(placaSugerida); }, [placaSugerida]);   // eslint-disable-line react-hooks/exhaustive-deps
  /* Borrador: se recupera si el celular recargó la página, y se guarda en cada cambio. */
  const listoBorr = useRef(false);
  useEffect(() => { (async () => { const b = leerBorrador(BORR_DIA);
    if(b && b.choferId === chofer.id){ setSelfie(await deDataURL(b.selfie)); setPlacas(await deDataURL(b.placas)); setTablero(await deDataURL(b.tablero));
      if(b.placa) setPlaca(b.placa); setKm(b.km || ""); setGas(b.gas || ""); tomadas.current = b.t || {}; }
    listoBorr.current = true; })(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const turno = useRef(0);   // solo se guarda el borrador más reciente (las fotos tardan en convertirse)
  useEffect(() => { if(!listoBorr.current) return; const n = ++turno.current; (async () => { const v = { choferId: chofer.id, selfie: await aDataURL(selfie), placas: await aDataURL(placas),
    tablero: await aDataURL(tablero), placa, km, gas, t: tomadas.current }; if(n === turno.current) guardarBorrador(BORR_DIA, v); })(); }, [selfie, placas, tablero, placa, km, gas]);   // eslint-disable-line react-hooks/exhaustive-deps
  const faltan = [!selfie && "tu foto", !placas && "foto de placas", !tablero && "foto del tablero", !placa.trim() && "placas", km === "" && "kilómetros", gas === "" && "gasolina"].filter(Boolean);
  const enviar = async () => {
    if(faltan.length){ setError("Falta: " + faltan.join(", ") + "."); return; }
    const viejas = ["selfie", "placas", "tablero"].filter(k => !(Date.now() - (tomadas.current[k] || 0) < FOTO_VIGENTE_MIN * 60000));
    if(viejas.length){ setError("Vuelve a tomar las fotos: deben ser de este momento (menos de " + FOTO_VIGENTE_MIN + " min)."); return; }
    setError("");
    try {
      setPaso("Leyendo tu ubicación…"); const p = await posicionAhora();
      const lugar = await lugarDe(llamar, p);
      setPaso("Subiendo fotos…");
      const f = fechaCDMX(), t = Date.now(), base = `jornadas/${chofer.id}/${f}_${t}_`;
      const con = async (k, nombre, archivo) => { const tm = tomadas.current[k], lineas = lineasSello(`D MOVIMIENTO · CHECK-IN · ${chofer.nombre || ""}`, tm, lugar, p);
        const foto = await conSello(archivo, lineas); return subir(base + nombre, foto, metaSello(lineas, tm, foto)); };
      const [s, pl, od] = await Promise.all([con("selfie", "selfie.jpg", selfie), con("placas", "placas.jpg", placas), con("tablero", "odometro.jpg", tablero)]);
      setPaso("Registrando…");
      await llamar("choferCheckIn", { selfieRuta: s, fotoPlacasRuta: pl, fotoOdometroRuta: od, unidadPlaca: placa.trim().toUpperCase(),
        odometroKm: Number(km), combustiblePct: Number(gas), lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy, posTMs: Math.round(p.timestamp || Date.now()), simulada: false });
      guardarBorrador(BORR_DIA, null);
      onListo();
    } catch(e){ setError(mensaje(e)); }
    setPaso("");
  };
  return (
    <div className="dm-card">
      <h2 className="dm-titulo">☀️ Empieza tu día</h2>
      <p className="dm-sub">Toca cada cuadro y toma la foto con la cámara en este momento. Se guarda con tu ubicación y la hora.</p>
      <div className="dm-et">Fotos</div>
      <div className="dm-fotos">
        <Foto titulo="Tú" icono="🤳" archivo={selfie} onCambio={tomar("selfie", setSelfie)} camara="user" onError={setError}/>
        <Foto titulo="Placas" icono="🚚" archivo={placas} onCambio={tomar("placas", setPlacas)} camara="environment" onError={setError}/>
        <Foto titulo="Tablero" icono="⏱️" archivo={tablero} onCambio={tomar("tablero", setTablero)} camara="environment" onError={setError}/>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div className="dm-et">Placas</div><input className="dm-in" value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1234" autoCapitalize="characters"/></div>
        <div><div className="dm-et">Kilómetros</div><input className="dm-in" inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/[^\d]/g, ""))} placeholder="85230"/></div>
      </div>
      <div className="dm-et">Gasolina</div>
      <div className="dm-seg">
        {[["Reserva", 10], ["1/4", 25], ["1/2", 50], ["3/4", 75], ["Lleno", 100]].map(([l, v]) => (
          <button key={v} type="button" className={gas === String(v) ? "si" : ""} onClick={() => setGas(String(v))}>{l}</button>))}
      </div>
      <Falla>{error}</Falla>
      <button onClick={enviar} disabled={!!paso} className={"dm-btn " + (faltan.length ? "dm-gris" : "dm-verde")} style={{ marginTop: 18 }}>
        {paso || (faltan.length ? `Faltan ${faltan.length} cosas` : "✓ Listo, empezar mi día")}</button>
    </div>
  );
}

/* ── Entregar en una parada (hoja que sube desde abajo) ─────────────────── */
function Entregar({ chofer, servicio, parada, llamar, subir, mandarAhora, onCerrar, onEnCola }){
  const [foto, setFoto] = useState(null), [foto2, setFoto2] = useState(null), [recibe, setRecibe] = useState(""), [notas, setNotas] = useState("");
  const [problema, setProblema] = useState(""), [error, setError] = useState(""), [paso, setPaso] = useState(""), [firma, setFirma] = useState(null), [hayProblema, setHayProblema] = useState(false);
  const carga = parada.tipo === "carga";
  const listoBorr = useRef(false);
  useEffect(() => { (async () => { const b = leerBorrador(BORR_ENTREGA);
    if(b && b.servicioId === servicio.id && b.paradaId === parada.id){ setFoto(await deDataURL(b.foto)); setFoto2(await deDataURL(b.foto2));
      setRecibe(b.recibe || ""); setNotas(b.notas || ""); setProblema(b.problema || ""); setHayProblema(!!b.hayProblema); }
    listoBorr.current = true; })(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const turno = useRef(0), cerrada = useRef(false);   // solo el borrador más reciente; nada después de cerrar
  useEffect(() => { if(!listoBorr.current) return; const n = ++turno.current; (async () => { const v = { servicioId: servicio.id, paradaId: parada.id,
    foto: await aDataURL(foto), foto2: await aDataURL(foto2), recibe, notas, problema, hayProblema }; if(n === turno.current && !cerrada.current) guardarBorrador(BORR_ENTREGA, v); })(); }, [foto, foto2, recibe, notas, problema, hayProblema]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cerrar = ok => { cerrada.current = true; guardarBorrador(BORR_ENTREGA, null); onCerrar(ok); };
  const enviar = async () => {
    if(hayProblema && !problema){ setError("Elige qué problema hubo."); return; }
    if(!foto){ setError(problema ? "Toma una foto del lugar (sirve de prueba)." : "Toma la foto de la entrega."); return; }
    if(!problema && !recibe.trim()){ setError(carga ? "Escribe quién te entregó la mercancía." : "Escribe el nombre de quien recibe."); return; }
    setError("");
    const cerradaMs = Date.now();   // la hora real de la entrega (aunque se mande después)
    try {
      setPaso("Confirmando que estás en el lugar…"); await mandarAhora();
      setPaso("Subiendo fotos…");
      const base = `evidencias/${chofer.id}/${servicio.id}/${parada.id}_${Date.now()}_`;
      const fotos = [await subir(base + "1.jpg", foto)];
      if(foto2) fotos.push(await subir(base + "2.jpg", foto2));
      const firmaRuta = firma ? await subir(base + "firma.png", firma) : "";
      setPaso("Cerrando la parada…");
      await llamar("choferCerrarParada", { servicioId: servicio.id, paradaId: parada.id, evidencia: { fotos, firmaRuta, receptor: recibe.trim(), notas: notas.trim(), incidencia: problema } });
      cerrar(true);
    } catch(e){
      /* Sin señal: se guarda en el celular con su hora y se manda sola al volver la señal. */
      if(esErrorDeRed(e, navigator.onLine)){
        setPaso("Sin señal: guardando la entrega en tu celular…");
        const r = agregarACola(almacenLocal(), { id: `${servicio.id}_${parada.id}`, servicioId: servicio.id, paradaId: parada.id, paradaNombre: parada.nombre || "", cerradaMs,
          fotos: [await aDataURL(foto), foto2 ? await aDataURL(foto2) : ""].filter(Boolean), firma: await blobADataURL(firma),
          evidencia: { receptor: recibe.trim(), notas: notas.trim(), incidencia: problema } });
        if(r.ok){ onEnCola?.(); cerrar(true); setPaso(""); return; }
        setError(r.motivo);
      } else setError(mensaje(e));
    }
    setPaso("");
  };
  return (<>
    <div className="dm-velo"/>
    <div className="dm-hoja" role="dialog" aria-label={"Cerrar parada " + parada.nombre}>
      <div className="dm-asa"/>
      <span className="dm-kicker" style={{ background: carga ? AZUL : VERDE }}>{carga ? "Recoger" : "Entregar"}</span>
      <h2 className="dm-titulo" style={{ marginTop: 8 }}>{parada.nombre}</h2>
      <p className="dm-sub">{parada.direccion}</p>
      <div className="dm-et">¿Cómo salió?</div>
      <div className="dm-seg" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button type="button" className={!hayProblema ? "si" : ""} onClick={() => { setHayProblema(false); setProblema(""); }}>✅ Todo bien</button>
        <button type="button" className={hayProblema ? "si" : ""} onClick={() => setHayProblema(true)}>⚠️ Hubo un problema</button>
      </div>
      {hayProblema && <select className="dm-in" style={{ marginTop: 10 }} value={problema} onChange={e => setProblema(e.target.value)}>
        <option value="">— ¿Qué pasó? —</option>{INCIDENCIAS.map(x => <option key={x} value={x}>{x}</option>)}</select>}
      <div className="dm-et">{problema ? "Foto del lugar" : carga ? "Foto de la carga" : "Foto de la entrega"}</div>
      <div className="dm-fotos">
        <Foto titulo="Foto" icono="📷" archivo={foto} onCambio={setFoto}/>
        {foto && <Foto titulo="Otra (opcional)" icono="➕" archivo={foto2} onCambio={setFoto2}/>}
      </div>
      <div className="dm-et">{problema ? "¿Quién te atendió? (si hubo alguien)" : carga ? "¿Quién te entregó?" : "¿Quién recibió?"}</div>
      <input className="dm-in" value={recibe} onChange={e => setRecibe(e.target.value)} placeholder="Nombre de la persona"/>
      {!problema && <><div className="dm-et">Firma (opcional)</div><FirmaPad onCambio={setFirma}/></>}
      <div className="dm-et">Comentarios (opcional)</div>
      <textarea className="dm-in" style={{ minHeight: 70, resize: "vertical" }} value={notas} onChange={e => setNotas(e.target.value)}/>
      <Falla>{error}</Falla>
      <button onClick={enviar} disabled={!!paso} className="dm-btn dm-verde" style={{ marginTop: 16 }}>{paso || "Mandar"}</button>
      <button onClick={() => cerrar(false)} disabled={!!paso} className="dm-btn dm-linea" style={{ marginTop: 10 }}>Regresar</button>
    </div>
  </>);
}

/* ── Un servicio: siguiente parada en grande + línea de tiempo ──────────── */
function Servicio({ db, chofer, servicio, jornadaAbierta, llamar, subir, mandarAhora, avisar, onPaso, enCola = [], onEnCola }){
  const [paradas, setParadas] = useState([]), [abierta, setAbierta] = useState(null), [ocupado, setOcupado] = useState(false);
  useEffect(() => onSnapshot(query(collection(db, "servicios", servicio.id, "paradas"), orderBy("orden")),
    s => setParadas(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.estado !== "Quitada")), () => setParadas([])), [db, servicio.id]);   // las quitadas por la oficina desaparecen
  const enRuta = servicio.estado === "En ruta";
  const reabierta = useRef(false);
  useEffect(() => {
    if(reabierta.current || !paradas.length) return;
    reabierta.current = true;
    const b = leerBorrador(BORR_ENTREGA), p = b && b.servicioId === servicio.id && paradas.find(x => x.id === b.paradaId && !["Entregada", "Incidencia"].includes(x.estado));
    if(p && enRuta) setAbierta(p);
  }, [paradas, enRuta, servicio.id]);
  const guardada = p => enCola.includes(`${servicio.id}_${p.id}`);   // cerrada sin señal, por mandar
  const hecha = p => ["Entregada", "Incidencia"].includes(p.estado) || guardada(p);
  const hechas = paradas.filter(hecha).length;
  const detenida = p => p?.detenida?.activa === true;   // ⛔ la oficina la frenó: no se entrega
  const companero = servicio.segundoChoferId ? (servicio.choferId === chofer.id ? servicio.segundoChoferNombre : servicio.choferNombre) || "" : "";
  const siguiente = paradas.find(p => !hecha(p) && !detenida(p)) || paradas.find(p => !hecha(p));
  /* Cambio de ruta que hay que confirmar con "Enterado" (no se quita hasta tocarlo). */
  const [yaEnterado, setYaEnterado] = useState("");   // id confirmado aquí: la hoja se cierra sin esperar al servidor
  const cambio = servicio.cambioPendiente && !(Number(servicio.cambioPendiente.enteradoMs) > 0) && servicio.cambioPendiente.id !== yaEnterado ? servicio.cambioPendiente : null;
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => { if(cambio?.id) try { navigator.vibrate?.([300, 120, 300, 120, 300]); } catch {} }, [cambio?.id]);
  const enterado = async () => {
    setConfirmando(true);
    try { await llamar("choferEnterado", { servicioId: servicio.id, cambioId: cambio.id }); setYaEnterado(cambio.id); avisar("👍 Enterado. La oficina ya lo vio."); }
    catch(e){ avisar(mensaje(e), true); }
    setConfirmando(false);
  };
  useEffect(() => { onPaso?.(servicio.id, { enRuta, total: paradas.length, hechas }); }, [enRuta, paradas.length, hechas]);   // eslint-disable-line react-hooks/exhaustive-deps
  const iniciar = async () => {
    setOcupado(true);
    try { await llamar("choferIniciarRuta", { servicioId: servicio.id }); await mandarAhora(servicio.id).catch(() => {}); avisar("¡Buen viaje! 🚚 Ya te vemos en el mapa."); }
    catch(e){ avisar(mensaje(e), true); }
    setOcupado(false);
  };
  const pct = paradas.length ? Math.round(hechas / paradas.length * 100) : 0;
  return (<>
    <div className="dm-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div><div className="dm-et" style={{ margin: 0 }}>Tu ruta</div><h2 className="dm-titulo">{servicio.empresa || "Ruta"}</h2></div>
        <span className="dm-chip" style={{ background: enRuta ? "#e0f2fe" : "#fff7ed", color: enRuta ? "#0369a1" : "#c2410c" }}>{enRuta ? "En camino" : "Por salir"}</span>
      </div>
      <p className="dm-sub">{[servicio.horaServicio && "Sale " + servicio.horaServicio, servicio.unidadPlaca && "🚚 " + servicio.unidadPlaca, servicio.folio].filter(Boolean).join(" · ")}</p>
      {(servicio.indicaciones || servicio.notas) && <div className="dm-ind"><b>📝 Indicaciones:</b> {servicio.indicaciones || servicio.notas}</div>}
      {paradas.length > 0 && <><div className="dm-barra"><i style={{ width: pct + "%" }}/></div>
        <div style={{ fontSize: 13, fontWeight: 800, color: GRIS }}>{hechas} de {paradas.length} paradas listas</div></>}
      {paradas.filter(p => !hecha(p)).length > 1 && <a className="dm-btn dm-linea" style={{ marginTop: 12 }} target="_blank" rel="noreferrer"
        href={enlaceRutaCompleta(paradas.filter(p => !hecha(p)))}>🗺️ Ver toda la ruta en Google Maps</a>}
    </div>

    {cambio && <><div className="dm-velo" style={{ zIndex: 80 }}/>
      <div className="dm-hoja" role="alertdialog" aria-label="La oficina cambió tu ruta" style={{ zIndex: 81, borderTop: "6px solid " + ROJO }}>
        <div style={{ fontSize: 40, textAlign: "center" }}>🔔</div>
        <h2 className="dm-titulo" style={{ textAlign: "center", marginTop: 4 }}>La oficina cambió tu ruta</h2>
        <div style={{ margin: "14px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {(cambio.lineas || []).map((l, i) => <div key={i} style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.3, color: l.startsWith("⛔") ? ROJO : AZUL,
            background: l.startsWith("⛔") ? "#fef2f2" : "#eff6ff", borderRadius: 14, padding: "12px 14px" }}>{l}</div>)}
        </div>
        <p className="dm-sub" style={{ textAlign: "center" }}>Lo mandó {cambio.porNombre || "la oficina"}. Si tienes duda, llama antes de seguir.</p>
        <button onClick={enterado} disabled={confirmando} className="dm-btn dm-verde" style={{ marginTop: 6, fontSize: 20 }}>{confirmando ? "Enviando…" : "👍 Enterado"}</button>
      </div></>}

    {enRuta && siguiente && detenida(siguiente) && <div className="dm-card" key={"det-" + siguiente.id} style={{ border: "3px solid " + ROJO, background: "#fef2f2" }}>
      <span className="dm-kicker" style={{ background: ROJO }}>⛔ NO ENTREGAR</span>
      <h2 className="dm-titulo" style={{ marginTop: 10, fontSize: 24 }}>{siguiente.nombre}</h2>
      <p style={{ fontSize: 18, fontWeight: 900, color: ROJO, margin: "6px 0" }}>{siguiente.detenida.motivo || "La oficina detuvo esta entrega"}</p>
      <p className="dm-sub">No descargues aquí. Si ya estás en el lugar, espera y llama a la oficina.</p>
    </div>}
    {enRuta && siguiente && !detenida(siguiente) && <div className="dm-card dm-sig" key={siguiente.id}>
      <span className="dm-kicker">Siguiente · {siguiente.tipo === "carga" ? "Recoger" : "Entregar"}</span>
      <h2 className="dm-titulo" style={{ marginTop: 10, fontSize: 24 }}>{siguiente.nombre}</h2>
      <p className="dm-sub" style={{ fontSize: 16 }}>{siguiente.direccion}</p>
      {companero && <div style={{ fontSize: 15, fontWeight: 800, color: AZUL, marginTop: 4 }}>👥 Vas con {companero}</div>}
      {siguiente.horaPactada && <div style={{ display: "inline-block", background: "#fff7ed", color: "#c2410c", borderRadius: 10, padding: "6px 10px", fontWeight: 900, fontSize: 16, marginTop: 4 }}>⏰ Llega antes de las {siguiente.horaPactada}</div>}
      {(siguiente.contacto || siguiente.telefono) && <p className="dm-sub" style={{ color: AZUL, fontWeight: 700 }}>👤 {siguiente.contacto} {siguiente.telefono && <a href={"tel:" + siguiente.telefono} style={{ color: AZUL }}>📞 {siguiente.telefono}</a>}</p>}
      <div className="dm-dos">
        <a className="dm-btn dm-linea" href={enlaceNavegar({ lat: siguiente.lat, lng: siguiente.lng })} target="_blank" rel="noreferrer">🧭 Cómo llegar</a>
        <button className="dm-btn dm-verde" onClick={() => { setAbierta(siguiente); llamar("choferLlegue", { servicioId: servicio.id, paradaId: siguiente.id }).catch(() => {}); }}>📍 Llegué</button>
      </div>
    </div>}

    {paradas.length > 0 && <div className="dm-card">
      <div className="dm-et" style={{ marginTop: 0 }}>Paradas</div>
      <div className="dm-tl">
        {paradas.map(p => {
          const lista = hecha(p), esSig = enRuta && siguiente?.id === p.id;
          return (
            <div key={p.id} className={"dm-tl-item" + (p.estado === "Incidencia" ? " prob" : lista ? " hecha" : esSig ? " sig" : "")}>
              <div className="dm-tl-dot">{p.estado === "Incidencia" ? "!" : lista ? "✓" : p.orden}</div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{p.tipo === "carga" ? "Recoger · " : "Entregar · "}{p.nombre}{p.horaPactada ? ` · ⏰ ${p.horaPactada}` : ""}</div>
              <div style={{ color: GRIS, fontSize: 14 }}>{p.direccion}</div>
              {detenida(p) && !lista && <div style={{ color: ROJO, fontWeight: 900, fontSize: 14, marginTop: 2 }}>⛔ NO ENTREGAR · {p.detenida.motivo || "detenida por la oficina"}</div>}
              {p.estado === "Incidencia" && <div style={{ color: "#c2410c", fontWeight: 800, fontSize: 13, marginTop: 2 }}>⚠️ {p.incidencia || "Con problema"}</div>}
              {guardada(p) && !["Entregada", "Incidencia"].includes(p.estado) && <div style={{ color: "#b45309", fontWeight: 800, fontSize: 13, marginTop: 2 }}>📶 Guardada sin señal · se manda sola</div>}
              {!lista && !esSig && <a href={enlaceNavegar({ lat: p.lat, lng: p.lng })} target="_blank" rel="noreferrer" style={{ color: AZUL, fontWeight: 800, fontSize: 14, textDecoration: "none" }}>🧭 Cómo llegar</a>}
            </div>);
        })}
      </div>
    </div>}

    {!enRuta && paradas.length > 0 && <div className="dm-pie"><div>
      <button onClick={iniciar} disabled={ocupado || !jornadaAbierta} className={"dm-btn " + (jornadaAbierta ? "dm-naranja" : "dm-gris")}>
        {jornadaAbierta ? (ocupado ? "Saliendo…" : "🚚 Salir a la ruta") : "Primero empieza tu día ☝️"}</button></div></div>}
    {abierta && <Entregar chofer={chofer} servicio={servicio} parada={abierta} llamar={llamar} subir={subir} mandarAhora={() => mandarAhora(servicio.id)}
      onEnCola={() => { onEnCola?.(); avisar("📶 Sin señal: la entrega quedó guardada con su hora y se manda sola cuando vuelva la señal."); }}
      onCerrar={ok => { setAbierta(null); if(ok && !enCola.includes(`${servicio.id}_${abierta.id}`)) avisar(abierta.tipo === "carga" ? "📦 Carga registrada." : "✅ Entrega registrada. ¡Bien!"); }}/>}
  </>);
}

/* ── Gasolina o gasto: foto del ticket en este momento, monto y (en gasolina) litros y km del tablero.
      El servidor calcula precio por litro y rendimiento, y avisa a la oficina si algo no cuadra. ── */
const TIPOS = [["gasolina", "⛽ Gasolina"], ["caseta", "🛣️ Caseta"], ["comida", "🍽️ Comida"], ["hotel", "🏨 Hotel"], ["refaccion", "🔧 Refacción"], ["otro", "📄 Otro"]];
function RegistrarGasto({ chofer, llamar, subir, onCerrar, onListo }){
  const [tipo, setTipo] = useState("gasolina"), [ticket, setTicket] = useState(null), [monto, setMonto] = useState(""), [litros, setLitros] = useState(""), [km, setKm] = useState("");
  const [lleno, setLleno] = useState(true), [nota, setNota] = useState(""), [error, setError] = useState(""), [paso, setPaso] = useState("");
  const tomada = useRef(0), gas = tipo === "gasolina";
  const enviar = async () => {
    const faltan = [!ticket && "foto del ticket", !(Number(monto) > 0) && "cuánto pagaste", gas && !(Number(litros) > 0) && "litros", gas && !(Number(km) > 0) && "km del tablero"].filter(Boolean);
    if(faltan.length){ setError("Falta: " + faltan.join(", ") + "."); return; }
    if(Date.now() - tomada.current > FOTO_VIGENTE_MIN * 60000){ setError("Vuelve a tomar la foto del ticket: debe ser de este momento."); return; }
    setError("");
    try {
      setPaso("Leyendo tu ubicación…"); const p = await posicionAhora();
      const lugar = await lugarDe(llamar, p);
      setPaso("Subiendo el ticket…");
      const lineas = lineasSello(`D MOVIMIENTO · ${tipo.toUpperCase()} · ${chofer.nombre || ""}`, tomada.current, lugar, p);
      const foto = await conSello(ticket, lineas);
      const ruta = await subir(`jornadas/${chofer.id}/${fechaCDMX()}_${Date.now()}_ticket_${tipo}.jpg`, foto, metaSello(lineas, tomada.current, foto));
      setPaso("Registrando…");
      const r = await llamar("choferRegistrarGasto", { tipo, monto: Number(monto), litros: gas ? Number(litros) : null, odometroKm: gas ? Number(km) : null, tanqueLleno: lleno,
        nota: nota.trim(), fotoTicketRuta: ruta, lat: p.coords.latitude, lng: p.coords.longitude });
      onListo(r);
    } catch(e){ setError(mensaje(e)); }
    setPaso("");
  };
  return (<>
    <div className="dm-velo" onClick={() => !paso && onCerrar()}/>
    <div className="dm-hoja" role="dialog" aria-label="Registrar gasto">
      <div className="dm-asa"/>
      <h2 className="dm-titulo">⛽ Gasolina o gasto</h2>
      <p className="dm-sub">Toma la foto del ticket con la cámara. Se guarda con tu ubicación y la hora.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0" }}>
        {TIPOS.map(([k, t]) => <button key={k} type="button" onClick={() => setTipo(k)} className="dm-btn" aria-pressed={tipo === k}
          style={{ width: "auto", flex: "1 1 30%", padding: "10px 8px", fontSize: 15, background: tipo === k ? AZUL : "#fff", color: tipo === k ? "#fff" : AZUL, border: "2px solid " + AZUL }}>{t}</button>)}
      </div>
      <div className="dm-fotos" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Foto titulo="Foto del ticket" icono="🧾" archivo={ticket} onCambio={f => { tomada.current = f.lastModified || Date.now(); setError(""); setTicket(f); }} camara="environment" onError={setError}/>
      </div>
      <div className="dm-et">¿Cuánto pagaste? ($)</div>
      <input className="dm-in" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Ej. 1200"/>
      {gas && <>
        <div className="dm-et">¿Cuántos litros?</div>
        <input className="dm-in" inputMode="decimal" value={litros} onChange={e => setLitros(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Ej. 50"/>
        <div className="dm-et">Kilómetros que marca el tablero</div>
        <input className="dm-in" inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Ej. 85400"/>
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 17, fontWeight: 700, color: AZUL, marginTop: 12 }}>
          <input type="checkbox" checked={lleno} onChange={e => setLleno(e.target.checked)} style={{ width: 24, height: 24 }}/> Llené el tanque</label>
      </>}
      <div className="dm-et">Nota (opcional)</div>
      <input className="dm-in" value={nota} onChange={e => setNota(e.target.value)} placeholder={gas ? "Ej. Gasolinera en la México-Querétaro" : "¿Para qué fue?"}/>
      <Falla>{error}</Falla>
      <button onClick={enviar} disabled={!!paso} className="dm-btn dm-naranja" style={{ marginTop: 16 }}>{paso || "Registrar"}</button>
      <button onClick={onCerrar} disabled={!!paso} className="dm-btn dm-linea" style={{ marginTop: 10 }}>Cancelar</button>
    </div>
  </>);
}

/* ── Terminar el día (check-out): foto del tablero en este momento, kilómetros y ubicación ── */
function TerminarDia({ chofer, llamar, subir, onCerrar, onListo }){
  const [tablero, setTablero] = useState(null), [km, setKm] = useState(""), [error, setError] = useState(""), [paso, setPaso] = useState("");
  const tomada = useRef(0);
  const enviar = async () => {
    if(!tablero){ setError("Toma la foto del tablero."); return; }
    if(!km){ setError("Escribe los kilómetros que marca el tablero."); return; }
    if(Date.now() - tomada.current > FOTO_VIGENTE_MIN * 60000){ setError("Vuelve a tomar la foto: debe ser de este momento."); return; }
    setError("");
    try {
      setPaso("Leyendo tu ubicación…"); const p = await posicionAhora();
      const lugar = await lugarDe(llamar, p);
      setPaso("Subiendo la foto…");
      const lineas = lineasSello(`D MOVIMIENTO · CHECK-OUT · ${chofer.nombre || ""}`, tomada.current, lugar, p);
      const foto = await conSello(tablero, lineas);
      const ruta = await subir(`jornadas/${chofer.id}/${fechaCDMX()}_${Date.now()}_odometro_salida.jpg`, foto, metaSello(lineas, tomada.current, foto));
      setPaso("Cerrando tu día…");
      await llamar("choferTerminarJornada", { lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy, odometroKm: Number(km), fotoOdometroRuta: ruta });
      onListo();
    } catch(e){ setError(mensaje(e)); }
    setPaso("");
  };
  return (<>
    <div className="dm-velo" onClick={() => !paso && onCerrar()}/>
    <div className="dm-hoja" role="dialog" aria-label="Terminar mi día">
      <div className="dm-asa"/>
      <h2 className="dm-titulo">🏁 Terminar mi día</h2>
      <p className="dm-sub">Toma la foto del tablero con la cámara y escribe los kilómetros. Se guarda con tu ubicación y la hora.</p>
      <div className="dm-fotos" style={{ gridTemplateColumns: "1fr" }}>
        <Foto titulo="Tablero (kilómetros)" icono="⏱️" archivo={tablero} camara="environment" onError={setError} onCambio={f => { tomada.current = f.lastModified || Date.now(); setError(""); setTablero(f); }}/>
      </div>
      <div className="dm-et">Kilómetros</div>
      <input className="dm-in" inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/[^\d]/g, ""))} placeholder="85412"/>
      <Falla>{error}</Falla>
      <button onClick={enviar} disabled={!!paso} className={"dm-btn " + (tablero && km ? "dm-verde" : "dm-gris")} style={{ marginTop: 16 }}>{paso || "✓ Cerrar mi día"}</button>
      <button onClick={onCerrar} disabled={!!paso} className="dm-btn dm-linea" style={{ marginTop: 10 }}>Todavía no</button>
    </div>
  </>);
}

/* ── Pantalla principal ──────────────────────────────────────────────────── */
export default function ChoferWeb({ db, auth, app }){
  const [usuario, setUsuario] = useState(undefined);
  const [chofer, setChofer] = useState(null), [errorCuenta, setErrorCuenta] = useState("");
  const [avisoOk, setAvisoOk] = useAvisoAutorizado(db, usuario?.uid);   // aviso de privacidad autorizado (versión vigente)
  const [servicios, setServicios] = useState(null), [jornada, setJornada] = useState(undefined);
  const [aviso, setAviso] = useState(null), [ultimoEnvio, setUltimoEnvio] = useState(0), [errorGps, setErrorGps] = useState("");
  const [vuelta, setVuelta] = useState(0), [errorRutas, setErrorRutas] = useState(""), [avance, setAvance] = useState({});
  const [, setReloj] = useState(0);
  const disp = useRef(dispositivoId()), buffer = useRef([]), bateria = useRef(null), ultimoEnvioMs = useRef(0);
  const fns = useRef(getFunctions(app, "us-central1")), almacen = useRef(getStorage(app));

  useEffect(() => {
    const l = document.querySelector('link[rel="manifest"]'); if(l) l.href = "/manifest-chofer.json";
    document.title = "DMovimiento · Choferes";
    let tema = document.querySelector('meta[name="theme-color"]');
    if(!tema){ tema = document.createElement("meta"); tema.name = "theme-color"; document.head.appendChild(tema); }
    tema.content = AZUL;
  }, []);
  useEffect(() => onAuthStateChanged(auth, u => { setUsuario(u || null); if(!u){ setChofer(null); setErrorCuenta(""); } }), [auth]);
  useEffect(() => { navigator.getBattery?.().then(b => { bateria.current = Math.round(b.level * 100); b.onlevelchange = () => { bateria.current = Math.round(b.level * 100); }; }).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => setReloj(x => x + 1), 15000); return () => clearInterval(t); }, []);

  const llamar = useCallback((nombre, datos = {}) => httpsCallable(fns.current, nombre)({ dispositivoId: disp.current, ...datos }).then(r => r.data), []);
  const subir = useCallback(async (ruta, archivo, meta = null) => { const b = meta ? archivo : await comprimir(archivo);
    await uploadBytes(refStorage(almacen.current, ruta), b, { contentType: /^image\//.test(b.type) ? b.type : "image/jpeg", ...(meta ? { customMetadata: meta } : {}) }); return ruta; }, []);
  const avisar = (texto, error = false) => { setAviso({ texto, error }); setTimeout(() => setAviso(null), 5000); };

  /* Al entrar: el servidor liga este celular a su cuenta (la primera vez) y dice quién es. */
  useEffect(() => {
    if(!usuario) return;
    if(usuario.isAnonymous || !usuario.email){ setErrorCuenta("Esta sesión no es de chofer."); return; }
    llamar("choferRegistrarDispositivo", { modelo: navigator.userAgent.slice(0, 80) })
      /* Token nuevo: trae el permiso de subir sus fotos (choferId dentro de la cuenta). */
      .then(async r => { await usuario.getIdToken(true).catch(() => {}); setChofer({ id: r.choferId, nombre: r.nombre }); })
      .catch(e => setErrorCuenta(mensaje(e)));
  }, [usuario, llamar]);

  useEffect(() => {
    if(!chofer) return;
    /* Sus rutas como chofer principal y como segundo chofer (hasta 2 por ruta): se juntan las dos listas. */
    const partes = { a: null, b: null };
    const juntar = () => { if(partes.a === null || partes.b === null) return; setErrorRutas("");
      setServicios([...new Map([...partes.a, ...partes.b].map(x => [x.id, x])).values()].sort((a, b) => (b.estado === "En ruta") - (a.estado === "En ruta") || String(a.fechaServicio || "").localeCompare(String(b.fechaServicio || "")))); };
    const fallo = e => { setServicios([]); setErrorRutas("No se pudieron cargar tus rutas (" + mensaje(e) + "). Revisa tu señal y vuelve a abrir la app."); };
    const u1 = onSnapshot(query(collection(db, "servicios"), where("choferId", "==", chofer.id), where("estado", "in", ["Asignada", "En ruta"])),
      s => { partes.a = s.docs.map(d => ({ id: d.id, ...d.data() })); juntar(); }, fallo);
    const u3 = onSnapshot(query(collection(db, "servicios"), where("segundoChoferId", "==", chofer.id), where("estado", "in", ["Asignada", "En ruta"])),
      s => { partes.b = s.docs.map(d => ({ id: d.id, ...d.data() })); juntar(); }, fallo);
    const u2 = onSnapshot(doc(db, "jornadas", `${chofer.id}_${fechaCDMX()}`), s => setJornada(s.exists() ? s.data() : null), () => setJornada(null));
    return () => { u1(); u2(); u3(); };
  }, [db, chofer, vuelta]);

  const enRuta = (servicios || []).find(s => s.estado === "En ruta");
  const jornadaAbierta = jornada?.estado === "Abierta";

  /* Ubicación: TODA la jornada (del check-in al check-out), con la pantalla abierta.
     En ruta cada 15 s (el cliente la ve); sin ruta, cada minuto (la oficina la ve). */
  const enviar = useCallback(async (servicioId) => {
    const lote = buffer.current.splice(0, buffer.current.length);
    if(!lote.length) return;
    try {
      if(NATIVO && HTTP_NATIVO && usuario){
        /* Misma función del servidor (choferSubirPosiciones), llamada por la vía nativa del celular. */
        const token = await usuario.getIdToken();
        const r = await HTTP_NATIVO.post({ url: `https://us-central1-${app.options.projectId}.cloudfunctions.net/choferSubirPosiciones`,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, data: { data: { dispositivoId: disp.current, servicioId, posiciones: lote } } });
        if(!(r.status >= 200 && r.status < 300)) throw new Error("envío " + r.status);
      } else await llamar("choferSubirPosiciones", { servicioId, posiciones: lote });
      setUltimoEnvio(Date.now()); ultimoEnvioMs.current = Date.now();
    }
    catch(e){ buffer.current.unshift(...lote.slice(-200)); throw e; }
  }, [llamar, usuario, app]);
  const mandarAhora = useCallback(async (servicioId) => {
    const p = await posicionAhora();
    buffer.current.push(aPunto(p, bateria.current));
    await enviar(servicioId || enRuta?.id);
  }, [enviar, enRuta]);
  const rastrear = !!enRuta || jornadaAbierta, idRastreo = enRuta?.id || "";
  /* App nativa: GPS en segundo plano (sigue con la pantalla apagada). Solo durante la jornada; se apaga al cerrar el día. */
  useEffect(() => {
    if(!rastrear || !GPS_FONDO) return;
    let id = null, vivo = true;
    const intervalo = idRastreo ? ENVIO_MS : 60000;
    GPS_FONDO.addWatcher({ backgroundTitle: "D Movimiento · ruta en curso", backgroundMessage: "Tu ubicación se registra solo durante tu jornada.", requestPermissions: true, stale: false, distanceFilter: 15 },
      (l, e) => {
        if(e){ setErrorGps(e.code === "NOT_AUTHORIZED" ? "Permite la ubicación «Todo el tiempo» en los ajustes del celular para esta app." : "Buscando señal de GPS…"); return; }
        if(!l) return;
        setErrorGps(""); buffer.current.push(puntoNativo(l, bateria.current)); if(buffer.current.length > 300) buffer.current.splice(0, 100);
        /* El envío sale desde aquí: con la pantalla apagada los relojes de la página se detienen, pero el GPS sigue avisando. */
        if(Date.now() - ultimoEnvioMs.current >= intervalo) enviar(idRastreo).catch(() => {});
      }).then(x => { if(vivo) id = x; else GPS_FONDO.removeWatcher({ id: x }).catch(() => {}); }).catch(() => setErrorGps("No se pudo encender el GPS de la app."));
    const t = setInterval(() => enviar(idRastreo).catch(() => {}), intervalo);
    return () => { vivo = false; clearInterval(t); if(id) GPS_FONDO.removeWatcher({ id }).catch(() => {}); };
  }, [rastrear, idRastreo, enviar]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if(!rastrear || GPS_FONDO || !navigator.geolocation) return;
    const w = navigator.geolocation.watchPosition(p => { setErrorGps(""); buffer.current.push(aPunto(p, bateria.current)); if(buffer.current.length > 300) buffer.current.splice(0, 100); },
      e => setErrorGps(e.code === 1 ? "Permite la ubicación: toca el candado junto a la dirección → Ubicación → Permitir." : "Buscando señal de GPS…"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    const t = setInterval(() => enviar(idRastreo).catch(() => {}), idRastreo ? ENVIO_MS : 60000);
    let candado = null;
    const pedirCandado = () => navigator.wakeLock?.request("screen").then(l => { candado = l; }).catch(() => {});
    /* Al volver a la app (p. ej. desde Google Maps) se manda la ubicación al instante y, si estuvo fuera más de 1 min, se le recuerda. */
    let ocultoDesde = 0;
    const alVolver = () => {
      if(document.visibilityState === "hidden"){ ocultoDesde = Date.now(); return; }
      pedirCandado();
      posicionAhora(8000).then(p => { buffer.current.push(aPunto(p, bateria.current)); }).catch(() => {}).finally(() => enviar(idRastreo).catch(() => {}));
      if(ocultoDesde && Date.now() - ocultoDesde > 60000) avisar("Mientras estuviste fuera de la app no se vio tu ubicación y la oficina recibe una alerta. Déjala abierta.");
      ocultoDesde = 0;
    };
    pedirCandado(); document.addEventListener("visibilitychange", alVolver);
    return () => { navigator.geolocation.clearWatch(w); clearInterval(t); document.removeEventListener("visibilitychange", alVolver); candado?.release?.().catch(() => {}); };
  }, [rastrear, idRastreo, enviar]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* SOS: se confirma en una hoja de la app (sin ventanas del navegador, que en el celular salen en blanco). */
  const [pidiendoSos, setPidiendoSos] = useState(false);
  const sos = async () => {
    setPidiendoSos(false);
    let pos = {};
    try { const p = await posicionAhora(8000); pos = { lat: p.coords.latitude, lng: p.coords.longitude }; } catch {}
    try { await llamar("choferSOS", { ...pos, servicioId: enRuta?.id || "" }); avisar("🚨 Aviso enviado. La oficina ya lo vio. Si es grave, llama al 911."); }
    catch(e){ avisar(mensaje(e), true); }
  };
  const [terminando, setTerminando] = useState(false);
  /* Entregas guardadas sin señal: se mandan solas al volver la señal (y cada 30 s). */
  const [cola, setCola] = useState(() => leerCola(almacenLocal()));
  const sincronizando = useRef(false);
  const sincronizar = useCallback(async () => {
    const a = almacenLocal();
    if(sincronizando.current || !chofer || !a) return;
    const items = leerCola(a);
    setCola(items);
    if(!items.length || !navigator.onLine) return;
    sincronizando.current = true;
    for(const it of items){
      try {
        await enviar(it.servicioId).catch(() => {});   // primero las ubicaciones guardadas: con ellas se valida la entrega
        const base = `evidencias/${chofer.id}/${it.servicioId}/${it.paradaId}_${it.cerradaMs}_`, meta = { sinSenal: "1", cerradaMs: String(it.cerradaMs) };
        const fotos = [];
        for(const [i, d] of it.fotos.entries()) fotos.push(await subir(`${base}${i + 1}.jpg`, await deDataURL(d), meta));
        const firmaRuta = it.firma ? await subir(base + "firma.png", await deDataURL(it.firma), meta) : "";
        await llamar("choferCerrarParada", { servicioId: it.servicioId, paradaId: it.paradaId, cerradaMs: it.cerradaMs, evidencia: { ...it.evidencia, fotos, firmaRuta } });
        quitarDeCola(a, it.id); avisar(`✓ Se mandó la entrega de ${it.paradaNombre || "la parada"}.`);
      } catch(e){
        if(yaEstabaCerrada(e)){ quitarDeCola(a, it.id); continue; }
        if(esErrorDeRed(e, navigator.onLine)) break;
        marcarError(a, it.id, mensaje(e));
      }
    }
    setCola(leerCola(a));
    sincronizando.current = false;
  }, [chofer, llamar, subir, enviar]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if(!chofer) return;
    sincronizar();
    const t = setInterval(sincronizar, 30000);
    window.addEventListener("online", sincronizar);
    return () => { clearInterval(t); window.removeEventListener("online", sincronizar); };
  }, [chofer, sincronizar]);
  const terminar = () => setTerminando(true);
  const [gastando, setGastando] = useState(false);

  const Cargando = ({ texto }) => <div className="dm"><Estilos/><div className="dm-vacio" style={{ paddingTop: 120 }}><div>🚚</div><p className="dm-sub">{texto}</p></div></div>;
  if(usuario === undefined) return <Cargando texto="Cargando…"/>;
  const esCuentaChofer = /@choferes\.denmovimiento\.mx$/i.test(String(usuario?.email || ""));
  /* Enlace de activación: funciona aunque en este navegador haya otra sesión abierta (p. ej. la de oficina). */
  if(tokenActivar() && (!usuario || !esCuentaChofer)) return <Activar auth={auth} app={app} token={tokenActivar()}/>;
  if(!usuario) return <Entrar auth={auth}/>;
  if(!esCuentaChofer) return (
    <div className="dm"><Estilos/><div className="dm-cuerpo" style={{ paddingTop: 60 }}>
      <div className="dm-card"><h2 className="dm-titulo">Estás con la cuenta de oficina</h2>
        <p className="dm-sub" style={{ fontSize: 16 }}>En este navegador está abierta la sesión de <b>{usuario.email || "oficina"}</b>. La app de choferes se usa con el celular y la contraseña del chofer.</p>
        <p className="dm-sub" style={{ fontSize: 14 }}>Tip: para probar sin cerrar tu sesión de oficina, abre este link en una ventana de incógnito o en otro celular.</p>
        <button onClick={() => signOut(auth)} className="dm-btn dm-naranja" style={{ marginTop: 14 }}>Entrar como chofer</button></div></div></div>);
  if(errorCuenta) return (
    <div className="dm"><Estilos/><div className="dm-cuerpo" style={{ paddingTop: 60 }}>
      <div className="dm-card"><h2 className="dm-titulo" style={{ color: ROJO }}>No se pudo entrar</h2><p className="dm-sub" style={{ color: AZUL, fontSize: 17 }}>{errorCuenta}</p>
        <button onClick={() => signOut(auth)} className="dm-btn dm-azul" style={{ marginTop: 14 }}>Salir</button></div></div></div>);
  if(!chofer) return <Cargando texto="Revisando tu cuenta…"/>;
  /* Sin autorizar el aviso de privacidad no se avanza (el servidor también lo exige). */
  if(avisoOk === undefined) return <Cargando texto="Revisando tu cuenta…"/>;
  if(!avisoOk) return <AvisoPrivacidad app={app} tipo="chofer" nombre={chofer.nombre} onAutorizado={() => setAvisoOk(true)} onSalir={() => signOut(auth)}/>;

  /* Los 4 pasos del día */
  const a = Object.values(avance);
  /* Sal = ya salió hoy a una ruta · Entrega = ya no le quedan rutas pendientes (las terminó todas) · Termina = cerró su día. */
  const cerrado = jornada?.estado === "Cerrada";
  const salio = !!jornada && (!!enRuta || a.some(x => x.enRuta));
  const sinPendientes = !!jornada && (servicios || []).length === 0;
  const pasos = [["Empieza", !!jornada], ["Sal", salio || sinPendientes || cerrado], ["Entrega", sinPendientes || cerrado], ["Termina", cerrado]];
  const actual = pasos.findIndex(p => !p[1]);
  const hace = ultimoEnvio ? Math.round((Date.now() - ultimoEnvio) / 60000) : null;
  const nombre = String(chofer.nombre || "").split(" ")[0] || "chofer";
  const estadoDia = cerrado ? ["Día cerrado", "rgba(255,255,255,.16)", "#fff"] : jornadaAbierta ? (enRuta ? ["● En camino", "#10b981", "#fff"] : ["Día iniciado", "rgba(16,185,129,.25)", "#a7f3d0"]) : ["Sin iniciar", "rgba(242,123,19,.25)", "#ffd5ad"];
  return (
    <div className="dm"><Estilos/>
      <div className="dm-hdr">
        <div className="dm-top"><span className="dm-marca">DMovimiento</span>
          <button className="dm-sos" onClick={() => setPidiendoSos(true)} aria-label="Emergencia">SOS</button>
          <button className="dm-salir" onClick={() => signOut(auth)}>Salir</button></div>
        <div className="dm-hola">Hola, {nombre.charAt(0) + nombre.slice(1).toLowerCase()} 👋</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          <span className="dm-fecha">{hoyTexto()}</span>
          <span className="dm-chip" style={{ background: estadoDia[1], color: estadoDia[2] }}>{estadoDia[0]}</span>
        </div>
      </div>
      <div className="dm-pasos">{pasos.map(([t, ok], i) => <div key={t} className={"dm-paso" + (ok ? " hecho" : i === actual ? " ahora" : "")}><b>{ok ? "✓" : i + 1}</b>{t}</div>)}</div>
      {terminando && <TerminarDia chofer={chofer} llamar={llamar} subir={subir} onCerrar={() => setTerminando(false)}
        onListo={() => { setTerminando(false); setVuelta(v => v + 1); avisar("🙌 ¡Gracias! Tu día quedó cerrado."); }}/>}
      {gastando && <RegistrarGasto chofer={chofer} llamar={llamar} subir={subir} onCerrar={() => setGastando(false)}
        onListo={r => { setGastando(false); avisar("✓ Gasto registrado" + (r?.precioLitro ? ` · $${r.precioLitro} por litro` : "") + (r?.rendimientoKmL ? ` · ${r.rendimientoKmL} km/L` : "") + ". La oficina lo revisa."); }}/>}
      {aviso && aviso.texto && <div className="dm-toast" style={{ background: aviso.error ? ROJO : VERDE }}>{aviso.texto}</div>}
      {pidiendoSos && <div className="dm-velo" role="alertdialog" aria-modal="true" aria-labelledby="sos-t" style={{ position: "fixed", inset: 0, background: "rgba(4,37,82,.55)", zIndex: 90, display: "flex", alignItems: "flex-end" }}>
        <div className="dm-card" style={{ width: "100%", borderRadius: "22px 22px 0 0", padding: "22px 18px calc(22px + env(safe-area-inset-bottom))", margin: 0 }}>
          <h2 id="sos-t" className="dm-titulo" style={{ color: ROJO, marginTop: 0 }}>🚨 ¿Mandar aviso de emergencia?</h2>
          <p className="dm-sub" style={{ fontSize: 16 }}>La oficina recibe tu ubicación al momento. Si es grave, llama también al 911.</p>
          <button onClick={sos} className="dm-btn" style={{ background: ROJO, color: "#fff", marginTop: 12, fontSize: 19 }}>Sí, mandar SOS</button>
          <button onClick={() => setPidiendoSos(false)} className="dm-btn dm-azul" style={{ marginTop: 10, background: "#fff", color: AZUL, border: "2px solid " + AZUL }}>No, cancelar</button>
        </div></div>}
      <div className="dm-cuerpo">
        {enRuta && <div className="dm-vivo" style={{ background: errorGps ? "#fef2f2" : "#ecfdf5", color: errorGps ? ROJO : "#047857" }}>
          {errorGps ? "⚠️" : <span className="dm-pulso"/>}
          <div>{errorGps || "La oficina te ve en el mapa"}{!errorGps && <div style={{ fontWeight: 600, color: AZUL, fontSize: 13 }}>Deja esta pantalla abierta mientras manejas{hace !== null ? ` · enviado hace ${hace < 1 ? "un momento" : hace + " min"}` : ""}.</div>}</div>
        </div>}
        {jornada === undefined || servicios === null ? <div className="dm-card"><p className="dm-sub">Cargando tus rutas…</p></div> : <>
          {!jornada && <EmpezarDia chofer={chofer} placaSugerida={(servicios[0] || {}).unidadPlaca || ""} llamar={llamar} subir={subir} onListo={() => { setVuelta(v => v + 1); avisar("☀️ ¡Listo! Ya puedes salir a tu ruta."); }}/>}
          {cerrado && <div className="dm-card dm-vacio"><div>🌙</div><h2 className="dm-titulo">Tu día está cerrado</h2><p className="dm-sub">¡Buen descanso! Nos vemos mañana.</p></div>}
          {errorRutas && <div className="dm-card"><Falla>{errorRutas}</Falla></div>}
          {servicios.length === 0 && !errorRutas && !cerrado && <div className="dm-card dm-vacio"><div>🗺️</div><h2 className="dm-titulo">Sin rutas por ahora</h2><p className="dm-sub">Cuando la oficina te asigne una, aparece aquí sola.</p></div>}
          {cola.length > 0 && <div className="dm-card" style={{ borderLeft: "5px solid #f59e0b" }}>
            <b>📶 {cola.length} {cola.length === 1 ? "entrega guardada" : "entregas guardadas"} sin señal</b>
            <p className="dm-sub" style={{ margin: "4px 0 0" }}>Se mandan solas cuando vuelva la señal. No cierres sesión.</p>
            {cola.filter(x => x.error).map(x => <Falla key={x.id}>{x.paradaNombre || "Una entrega"}: {x.error}. Avisa a la oficina.</Falla>)}
            <button onClick={sincronizar} className="dm-btn dm-linea" style={{ marginTop: 10 }}>Intentar mandar ahora</button></div>}
          {servicios.map(s => <Servicio key={s.id} db={db} chofer={chofer} servicio={s} jornadaAbierta={jornadaAbierta} llamar={llamar} subir={subir} mandarAhora={mandarAhora} avisar={avisar}
            enCola={cola.map(x => x.id)} onEnCola={() => setCola(leerCola(almacenLocal()))}
            onPaso={(id, v) => setAvance(x => ({ ...x, [id]: v }))}/>)}
          {jornadaAbierta && <button onClick={() => setGastando(true)} className="dm-btn dm-linea" style={{ margin: "4px 0 12px" }}>⛽ Gasolina o gasto</button>}
          {jornadaAbierta && !enRuta && !(servicios || []).some(s => s.estado === "Asignada") && <div className="dm-pie"><div>
            <button onClick={terminar} className="dm-btn dm-azul">🏁 Terminar mi día</button></div></div>}
          {jornadaAbierta && enRuta?.foraneo && <div className="dm-card" style={{ textAlign: "center" }}>
            <p className="dm-sub" style={{ marginTop: 0 }}>Ruta foránea{enRuta.regresoEstimado ? ` · regreso estimado ${enRuta.regresoEstimado}` : ""}. Al terminar de manejar hoy, cierra tu día; mañana haces check-in otra vez.</p>
            <button onClick={terminar} className="dm-btn dm-linea">🌙 Terminar mi día (sigo mañana)</button></div>}
        </>}
      </div>
    </div>
  );
}
