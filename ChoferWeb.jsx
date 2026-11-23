/* DMOV · App del chofer en el navegador del celular (<dirección del sistema>/chofer).
   Sirve desde hoy, sin instalar nada: entra con su celular y contraseña, ve sus rutas,
   empieza su día, navega a cada parada, entrega con foto y manda su ubicación.
   Usa las MISMAS funciones del servidor que la app nativa: el servidor valida todo
   (equipo, check-in, geocerca, evidencia). Límite honesto: el navegador solo manda la
   ubicación mientras esta pantalla está abierta; por eso se pide mantenerla encendida. */
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref as refStorage, uploadBytes } from "firebase/storage";
import { correoDeChofer, enlaceNavegar } from "./lugares.ts";
import FirmaPad from "./FirmaPad.jsx";

const LETRA = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
const AZUL = "#042552", NARANJA = "#F27B13", VERDE = "#059669", ROJO = "#dc2626", GRIS = "#5b6b80", FONDO = "#f1f4fb";
const INCIDENCIAS = ["Cliente ausente", "Entrega rechazada", "Entrega parcial", "Faltantes", "Daños", "Devolución al origen"];
const ENVIO_MS = 30000;

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
const posicionAhora = (timeout = 15000) => new Promise((ok, mal) => {
  if(!navigator.geolocation) return mal(new Error("Este celular no da ubicación"));
  navigator.geolocation.getCurrentPosition(p => ok(p), e => mal(new Error(e.code === 1 ? "Permite la ubicación para esta página (candado junto a la dirección)." : "No se pudo leer tu ubicación. Sal a cielo abierto.")),
    { enableHighAccuracy: true, timeout, maximumAge: 0 });
});
const aPunto = (p, bateria) => ({ lat: p.coords.latitude, lng: p.coords.longitude, tMs: Math.round(p.timestamp || Date.now()), precisionM: p.coords.accuracy,
  velocidadMs: p.coords.speed ?? null, bateria, simulada: false });
/* Foto más ligera: máximo 1600 px, JPEG. Así sube rápido con poca señal y queda bajo el límite de 5 MB. */
async function comprimir(file){
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.8));
    if(b) return b;
  } catch {}
  if(file.size >= 5 * 1024 * 1024) throw new Error("La foto pesa mucho. Tómala con la cámara (no de la galería) y vuelve a intentar.");
  return file;
}

const boton = (color, lleno = true) => ({ background: lleno ? color : "#fff", color: lleno ? "#fff" : color, border: "2px solid " + color, borderRadius: 14,
  padding: "14px 16px", fontSize: 17, fontWeight: 800, width: "100%", cursor: "pointer", fontFamily: "inherit" });
const caja = { width: "100%", boxSizing: "border-box", border: "2px solid #d2dcea", borderRadius: 12, padding: "13px 14px", fontSize: 17, fontFamily: "inherit", background: "#fff", color: AZUL };
const tarjeta = { background: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(4,37,82,.08)" };
const Etiqueta = ({ children }) => <div style={{ fontSize: 13, fontWeight: 800, color: GRIS, margin: "12px 0 6px", textTransform: "uppercase", letterSpacing: ".04em" }}>{children}</div>;

function Foto({ titulo, archivo, onCambio, frontal = false }){
  const url = archivo ? URL.createObjectURL(archivo) : "";
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ ...boton(archivo ? VERDE : AZUL, !archivo), display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
        {archivo ? <img src={url} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }}/> : <span style={{ fontSize: 24 }}>📷</span>}
        <span>{archivo ? "✓ " + titulo + " (cambiar)" : titulo}</span>
      </div>
      <input type="file" accept="image/*" capture={frontal ? "user" : "environment"} style={{ display: "none" }} onChange={e => e.target.files?.[0] && onCambio(e.target.files[0])}/>
    </label>
  );
}

/* ── Entrar ───────────────────────────────────────────────────────────────── */
function Entrar({ auth }){
  const [usuario, setUsuario] = useState(""), [clave, setClave] = useState(""), [error, setError] = useState(""), [ocupado, setOcupado] = useState(false);
  const entrar = async () => {
    const correo = correoDeChofer(usuario);
    if(!correo){ setError("Escribe tu celular de 10 dígitos."); return; }
    if(!clave){ setError("Escribe tu contraseña."); return; }
    setOcupado(true); setError("");
    try { await signInWithEmailAndPassword(auth, correo, clave); }
    catch(e){ setError(mensaje(e)); setOcupado(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: AZUL, padding: "48px 20px", boxSizing: "border-box", fontFamily: LETRA }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ color: NARANJA, fontWeight: 900, fontSize: 30 }}>DMovimiento</div>
        <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: "6px 0 28px" }}>Choferes</div>
        <div style={tarjeta}>
          <Etiqueta>Tu celular</Etiqueta>
          <input style={caja} inputMode="tel" autoComplete="username" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="55 1234 5678"/>
          <Etiqueta>Tu contraseña</Etiqueta>
          <input style={caja} type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => e.key === "Enter" && entrar()}/>
          {error && <div style={{ color: ROJO, fontWeight: 700, marginTop: 12 }}>{error}</div>}
          <button onClick={entrar} disabled={ocupado} style={{ ...boton(NARANJA), marginTop: 18, opacity: ocupado ? .6 : 1 }}>{ocupado ? "Entrando…" : "Entrar"}</button>
          <p style={{ color: GRIS, fontSize: 14, marginTop: 14 }}>¿No tienes contraseña? Pídele a la oficina tu enlace por WhatsApp.</p>
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
  useEffect(() => { if(placaSugerida && !placa) setPlaca(placaSugerida); }, [placaSugerida]);   // eslint-disable-line react-hooks/exhaustive-deps
  const listo = selfie && placas && tablero && placa.trim() && km !== "" && gas !== "";
  const enviar = async () => {
    if(!listo){ setError("Faltan fotos o datos."); return; }
    setError("");
    try {
      setPaso("Leyendo tu ubicación…"); const p = await posicionAhora();
      setPaso("Subiendo fotos…");
      const f = fechaCDMX(), t = Date.now(), base = `jornadas/${chofer.id}/${f}_${t}_`;
      const [s, pl, od] = await Promise.all([subir(base + "selfie.jpg", selfie), subir(base + "placas.jpg", placas), subir(base + "odometro.jpg", tablero)]);
      setPaso("Registrando…");
      await llamar("choferCheckIn", { selfieRuta: s, fotoPlacasRuta: pl, fotoOdometroRuta: od, unidadPlaca: placa.trim().toUpperCase(),
        odometroKm: Number(km), combustiblePct: Number(gas), lat: p.coords.latitude, lng: p.coords.longitude, simulada: false });
      onListo();
    } catch(e){ setError(mensaje(e)); }
    setPaso("");
  };
  return (
    <div style={tarjeta}>
      <div style={{ fontSize: 22, fontWeight: 900, color: AZUL }}>☀️ Empieza tu día</div>
      <p style={{ color: GRIS, marginTop: 4 }}>Tres fotos y dos datos. Solo una vez al día.</p>
      <Foto titulo="Tu foto (selfie)" archivo={selfie} onCambio={setSelfie} frontal/>
      <Foto titulo="Foto de las placas" archivo={placas} onCambio={setPlacas}/>
      <Foto titulo="Foto del tablero (kilómetros)" archivo={tablero} onCambio={setTablero}/>
      <Etiqueta>Placas de la camioneta</Etiqueta>
      <input style={caja} value={placa} onChange={e => setPlaca(e.target.value)} placeholder="ABC1234"/>
      <Etiqueta>Kilómetros que marca</Etiqueta>
      <input style={caja} inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/[^\d]/g, ""))} placeholder="Ej. 85230"/>
      <Etiqueta>Gasolina</Etiqueta>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
        {[["Reserva", 10], ["1/4", 25], ["1/2", 50], ["3/4", 75], ["Lleno", 100]].map(([l, v]) => (
          <button key={v} onClick={() => setGas(String(v))} style={{ ...boton(AZUL, gas === String(v)), padding: "12px 4px", fontSize: 14 }}>{l}</button>))}
      </div>
      {error && <div style={{ color: ROJO, fontWeight: 700, marginTop: 12 }}>{error}</div>}
      <button onClick={enviar} disabled={!!paso} style={{ ...boton(listo ? VERDE : GRIS), marginTop: 16, opacity: paso ? .6 : 1 }}>{paso || "Listo, empezar mi día"}</button>
    </div>
  );
}

/* ── Entregar en una parada ──────────────────────────────────────────────── */
function Entregar({ chofer, servicio, parada, llamar, subir, mandarAhora, onCerrar }){
  const [foto, setFoto] = useState(null), [foto2, setFoto2] = useState(null), [recibe, setRecibe] = useState(""), [notas, setNotas] = useState("");
  const [problema, setProblema] = useState(""), [error, setError] = useState(""), [paso, setPaso] = useState(""), [firma, setFirma] = useState(null);
  const enviar = async () => {
    if(!foto){ setError(problema ? "Toma una foto del lugar (sirve de prueba)." : "Toma la foto de la entrega."); return; }
    if(!problema && !recibe.trim()){ setError("Escribe el nombre de quien recibe."); return; }
    setError("");
    try {
      setPaso("Confirmando que estás en el lugar…"); await mandarAhora();
      setPaso("Subiendo fotos…");
      const base = `evidencias/${chofer.id}/${servicio.id}/${parada.id}_${Date.now()}_`;
      const fotos = [await subir(base + "1.jpg", foto)];
      if(foto2) fotos.push(await subir(base + "2.jpg", foto2));
      const firmaRuta = firma ? await subir(base + "firma.png", firma) : "";
      setPaso("Cerrando la parada…");
      await llamar("choferCerrarParada", { servicioId: servicio.id, paradaId: parada.id, evidencia: { fotos, firmaRuta, receptor: recibe.trim(), notas: notas.trim(), incidencia: problema } });
      onCerrar(true);
    } catch(e){ setError(mensaje(e)); }
    setPaso("");
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,37,82,.6)", zIndex: 50, overflowY: "auto", padding: 12 }}>
      <div style={{ ...tarjeta, maxWidth: 480, margin: "20px auto" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: AZUL }}>{parada.tipo === "carga" ? "📦 Cargué en" : "✅ Entregué en"} {parada.nombre}</div>
        <p style={{ color: GRIS, margin: "4px 0 12px" }}>{parada.direccion}</p>
        <Foto titulo="Foto de la entrega" archivo={foto} onCambio={setFoto}/>
        {foto && <Foto titulo="Otra foto (opcional)" archivo={foto2} onCambio={setFoto2}/>}
        <Etiqueta>¿Todo bien?</Etiqueta>
        <select style={caja} value={problema} onChange={e => setProblema(e.target.value)}>
          <option value="">Sí, todo bien</option>
          {INCIDENCIAS.map(x => <option key={x} value={x}>Hubo un problema: {x}</option>)}
        </select>
        <Etiqueta>{problema ? "¿Quién te atendió? (si hubo alguien)" : "¿Quién recibió?"}</Etiqueta>
        <input style={caja} value={recibe} onChange={e => setRecibe(e.target.value)} placeholder="Nombre de la persona"/>
        {!problema && <><Etiqueta>Firma de quien recibe (opcional)</Etiqueta><FirmaPad onCambio={setFirma}/></>}
        <Etiqueta>Comentarios (opcional)</Etiqueta>
        <textarea style={{ ...caja, minHeight: 70 }} value={notas} onChange={e => setNotas(e.target.value)}/>
        {error && <div style={{ color: ROJO, fontWeight: 700, marginTop: 12 }}>{error}</div>}
        <button onClick={enviar} disabled={!!paso} style={{ ...boton(VERDE), marginTop: 16, opacity: paso ? .6 : 1 }}>{paso || "Mandar"}</button>
        <button onClick={() => onCerrar(false)} disabled={!!paso} style={{ ...boton(GRIS, false), marginTop: 10 }}>Regresar</button>
      </div>
    </div>
  );
}

/* ── Un servicio con sus paradas ─────────────────────────────────────────── */
function Servicio({ db, chofer, servicio, jornadaAbierta, llamar, subir, mandarAhora, avisar }){
  const [paradas, setParadas] = useState([]), [abierta, setAbierta] = useState(null), [ocupado, setOcupado] = useState(false);
  useEffect(() => onSnapshot(query(collection(db, "servicios", servicio.id, "paradas"), orderBy("orden")),
    s => setParadas(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setParadas([])), [db, servicio.id]);
  const enRuta = servicio.estado === "En ruta";
  const hechas = paradas.filter(p => ["Entregada", "Incidencia"].includes(p.estado)).length;
  const siguiente = paradas.find(p => !["Entregada", "Incidencia"].includes(p.estado));
  const iniciar = async () => {
    setOcupado(true);
    try { await llamar("choferIniciarRuta", { servicioId: servicio.id }); await mandarAhora(servicio.id).catch(() => {}); avisar("¡Buen viaje! Ya te vemos en el mapa."); }
    catch(e){ avisar(mensaje(e), true); }
    setOcupado(false);
  };
  return (
    <div style={tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: AZUL }}>{servicio.empresa || "Ruta"}</div>
        <div style={{ fontSize: 13, color: GRIS, fontWeight: 700 }}>{servicio.folio}</div>
      </div>
      <div style={{ color: GRIS, marginTop: 2 }}>{[servicio.fechaServicio, servicio.horaServicio, servicio.unidadPlaca && "Camioneta " + servicio.unidadPlaca].filter(Boolean).join(" · ")}</div>
      {(servicio.indicaciones || servicio.notas) && <div style={{ background: "#fff7ed", border: "2px solid " + NARANJA, borderRadius: 12, padding: 12, marginTop: 10, fontSize: 16, color: AZUL }}>
        <b>Indicaciones:</b> {servicio.indicaciones || servicio.notas}</div>}
      <div style={{ margin: "12px 0 4px", fontWeight: 800, color: AZUL }}>{paradas.length ? `Paradas: ${hechas} de ${paradas.length} listas` : "Cargando paradas…"}</div>
      {paradas.map(p => {
        const lista = ["Entregada", "Incidencia"].includes(p.estado), esSiguiente = siguiente?.id === p.id;
        return (
          <div key={p.id} style={{ border: "2px solid " + (esSiguiente ? NARANJA : "#e5ebf3"), borderRadius: 14, padding: 12, marginTop: 8, opacity: lista ? .6 : 1 }}>
            <div style={{ fontWeight: 900, color: AZUL, fontSize: 17 }}>{p.orden}. {p.tipo === "carga" ? "Recoger en" : "Entregar en"} {p.nombre}</div>
            <div style={{ color: GRIS, fontSize: 15 }}>{p.direccion}</div>
            {(p.contacto || p.telefono) && <div style={{ fontSize: 15, marginTop: 4 }}>👤 {p.contacto} {p.telefono && <a href={"tel:" + p.telefono} style={{ color: AZUL, fontWeight: 800 }}>📞 {p.telefono}</a>}</div>}
            {lista ? <div style={{ color: p.estado === "Incidencia" ? NARANJA : VERDE, fontWeight: 800, marginTop: 6 }}>{p.estado === "Incidencia" ? "⚠️ " + (p.incidencia || "Con problema") : "✓ Listo"}</div>
              : <div style={{ display: "grid", gridTemplateColumns: enRuta ? "1fr 1fr" : "1fr", gap: 8, marginTop: 10 }}>
                  <a href={enlaceNavegar({ lat: p.lat, lng: p.lng })} target="_blank" rel="noreferrer" style={{ ...boton(AZUL, false), textDecoration: "none", textAlign: "center", boxSizing: "border-box", padding: "12px 6px", fontSize: 16 }}>🧭 Cómo llegar</a>
                  {enRuta && <button onClick={() => setAbierta(p)} style={{ ...boton(VERDE), padding: "12px 6px", fontSize: 16 }}>Llegué</button>}
                </div>}
          </div>);
      })}
      {!enRuta && paradas.length > 0 && <button onClick={iniciar} disabled={ocupado || !jornadaAbierta} style={{ ...boton(jornadaAbierta ? NARANJA : GRIS), marginTop: 14, opacity: ocupado ? .6 : 1 }}>
        {jornadaAbierta ? (ocupado ? "Iniciando…" : "🚚 Salir a la ruta") : "Primero empieza tu día (arriba)"}</button>}
      {abierta && <Entregar chofer={chofer} servicio={servicio} parada={abierta} llamar={llamar} subir={subir} mandarAhora={() => mandarAhora(servicio.id)}
        onCerrar={ok => { setAbierta(null); if(ok) avisar("Listo, quedó registrado."); }}/>}
    </div>
  );
}

/* ── Pantalla principal ──────────────────────────────────────────────────── */
export default function ChoferWeb({ db, auth, app }){
  const [usuario, setUsuario] = useState(undefined);
  const [chofer, setChofer] = useState(null), [errorCuenta, setErrorCuenta] = useState("");
  const [servicios, setServicios] = useState(null), [jornada, setJornada] = useState(undefined);
  const [aviso, setAviso] = useState(null), [ultimoEnvio, setUltimoEnvio] = useState(0), [errorGps, setErrorGps] = useState("");
  const [vuelta, setVuelta] = useState(0), [errorRutas, setErrorRutas] = useState("");
  const [, setReloj] = useState(0);
  const disp = useRef(dispositivoId()), buffer = useRef([]), bateria = useRef(null);
  const fns = useRef(getFunctions(app, "us-central1")), almacen = useRef(getStorage(app));

  useEffect(() => { const l = document.querySelector('link[rel="manifest"]'); if(l) l.href = "/manifest-chofer.json"; document.title = "DMovimiento · Choferes"; }, []);
  useEffect(() => onAuthStateChanged(auth, u => { setUsuario(u || null); if(!u){ setChofer(null); setErrorCuenta(""); } }), [auth]);
  useEffect(() => { navigator.getBattery?.().then(b => { bateria.current = Math.round(b.level * 100); b.onlevelchange = () => { bateria.current = Math.round(b.level * 100); }; }).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => setReloj(x => x + 1), 15000); return () => clearInterval(t); }, []);

  const llamar = useCallback((nombre, datos = {}) => httpsCallable(fns.current, nombre)({ dispositivoId: disp.current, ...datos }).then(r => r.data), []);
  const subir = useCallback(async (ruta, archivo) => { const b = await comprimir(archivo);
    await uploadBytes(refStorage(almacen.current, ruta), b, { contentType: /^image\//.test(b.type) ? b.type : "image/jpeg" }); return ruta; }, []);
  const avisar = (texto, error = false) => { setAviso({ texto, error }); setTimeout(() => setAviso(null), 6000); };

  /* Al entrar: el servidor liga este celular a su cuenta (la primera vez) y dice quién es. */
  useEffect(() => {
    if(!usuario) return;
    if(usuario.isAnonymous || !usuario.email){ setErrorCuenta("Esta sesión no es de chofer."); return; }
    llamar("choferRegistrarDispositivo", { modelo: navigator.userAgent.slice(0, 80) })
      .then(r => setChofer({ id: r.choferId, nombre: r.nombre }))
      .catch(e => setErrorCuenta(mensaje(e)));
  }, [usuario, llamar]);

  useEffect(() => {
    if(!chofer) return;
    const u1 = onSnapshot(query(collection(db, "servicios"), where("choferId", "==", chofer.id), where("estado", "in", ["Asignada", "En ruta"])),
      s => setServicios(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.estado === "En ruta") - (a.estado === "En ruta") || String(a.fechaServicio || "").localeCompare(String(b.fechaServicio || "")))),
      e => { setServicios([]); setErrorRutas("No se pudieron cargar tus rutas (" + mensaje(e) + "). Revisa tu señal y vuelve a abrir la app."); });
    const u2 = onSnapshot(doc(db, "jornadas", `${chofer.id}_${fechaCDMX()}`), s => setJornada(s.exists() ? s.data() : null), () => setJornada(null));
    return () => { u1(); u2(); };
  }, [db, chofer, vuelta]);

  const enRuta = (servicios || []).find(s => s.estado === "En ruta");
  const jornadaAbierta = jornada?.estado === "Abierta";

  /* Ubicación: mientras haya una ruta en curso y la pantalla esté abierta. */
  const enviar = useCallback(async (servicioId) => {
    const lote = buffer.current.splice(0, buffer.current.length);
    if(!lote.length || !servicioId) return;
    try { await llamar("choferSubirPosiciones", { servicioId, posiciones: lote }); setUltimoEnvio(Date.now()); }
    catch(e){ buffer.current.unshift(...lote.slice(-200)); throw e; }
  }, [llamar]);
  const mandarAhora = useCallback(async (servicioId) => {
    const p = await posicionAhora();
    buffer.current.push(aPunto(p, bateria.current));
    await enviar(servicioId || enRuta?.id);
  }, [enviar, enRuta]);
  useEffect(() => {
    if(!enRuta || !navigator.geolocation) return;
    const w = navigator.geolocation.watchPosition(p => { setErrorGps(""); buffer.current.push(aPunto(p, bateria.current)); if(buffer.current.length > 300) buffer.current.splice(0, 100); },
      e => setErrorGps(e.code === 1 ? "Permite la ubicación para esta página: toca el candado junto a la dirección → Ubicación → Permitir." : "Buscando señal de GPS…"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    const t = setInterval(() => enviar(enRuta.id).catch(() => {}), ENVIO_MS);
    let candado = null;
    const pedirCandado = () => navigator.wakeLock?.request("screen").then(l => { candado = l; }).catch(() => {});
    const alVolver = () => { if(document.visibilityState === "visible"){ pedirCandado(); enviar(enRuta.id).catch(() => {}); } };
    pedirCandado(); document.addEventListener("visibilitychange", alVolver);
    return () => { navigator.geolocation.clearWatch(w); clearInterval(t); document.removeEventListener("visibilitychange", alVolver); candado?.release?.().catch(() => {}); };
  }, [enRuta?.id, enviar]);   // eslint-disable-line react-hooks/exhaustive-deps

  const sos = async () => {
    if(!confirm("¿Mandar AVISO DE EMERGENCIA a la oficina?")) return;
    let pos = {};
    try { const p = await posicionAhora(8000); pos = { lat: p.coords.latitude, lng: p.coords.longitude }; } catch {}
    try { await llamar("choferSOS", { ...pos, servicioId: enRuta?.id || "" }); avisar("🚨 Aviso enviado. La oficina ya lo vio. Si es grave, llama al 911."); }
    catch(e){ avisar(mensaje(e), true); }
  };
  const terminar = async () => {
    const km = prompt("¿Cuántos kilómetros marca la camioneta al terminar? (puedes dejarlo vacío)") ?? null;
    if(km === null) return;
    let pos = {};
    try { const p = await posicionAhora(8000); pos = { lat: p.coords.latitude, lng: p.coords.longitude }; } catch {}
    try { await llamar("choferTerminarJornada", { ...pos, ...(km.trim() ? { odometroKm: Number(km.replace(/[^\d]/g, "")) } : {}) }); avisar("¡Gracias! Tu día quedó cerrado."); }
    catch(e){ avisar(mensaje(e), true); }
  };

  if(usuario === undefined) return <div style={{ padding: 40, textAlign: "center", color: GRIS, fontFamily: LETRA }}>Cargando…</div>;
  if(!usuario) return <Entrar auth={auth}/>;
  const salir = <button onClick={() => signOut(auth)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Salir</button>;
  if(errorCuenta) return (
    <div style={{ minHeight: "100vh", background: FONDO, padding: 20, fontFamily: LETRA }}>
      <div style={{ ...tarjeta, maxWidth: 480, margin: "40px auto" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: ROJO }}>No se pudo entrar</div>
        <p style={{ fontSize: 17, color: AZUL }}>{errorCuenta}</p>
        <button onClick={() => signOut(auth)} style={boton(AZUL)}>Salir</button>
      </div>
    </div>);
  if(!chofer) return <div style={{ padding: 40, textAlign: "center", color: GRIS, fontFamily: LETRA }}>Revisando tu cuenta…</div>;

  const hace = ultimoEnvio ? Math.round((Date.now() - ultimoEnvio) / 60000) : null;
  return (
    <div style={{ minHeight: "100vh", background: FONDO, fontFamily: LETRA, paddingBottom: 90 }}>
      <div style={{ background: AZUL, color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: NARANJA, fontWeight: 900 }}>DMovimiento</div><div style={{ fontSize: 19, fontWeight: 800 }}>Hola, {String(chofer.nombre || "").split(" ")[0] || "chofer"}</div></div>
        {salir}
      </div>
      {aviso && <div style={{ position: "fixed", left: 12, right: 12, top: 70, zIndex: 60, background: aviso.error ? ROJO : VERDE, color: "#fff", borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 16 }}>{aviso.texto}</div>}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 12 }}>
        {enRuta && <div style={{ ...tarjeta, background: errorGps ? "#fef2f2" : "#ecfdf5", border: "2px solid " + (errorGps ? ROJO : VERDE) }}>
          <div style={{ fontWeight: 900, color: errorGps ? ROJO : VERDE, fontSize: 16 }}>{errorGps ? "⚠️ " + errorGps : "📡 La oficina te ve en el mapa"}</div>
          {!errorGps && <div style={{ color: AZUL, fontSize: 14, marginTop: 4 }}>Deja esta pantalla abierta mientras manejas.{hace !== null ? ` Última ubicación enviada hace ${hace < 1 ? "menos de 1" : hace} min.` : ""}</div>}
        </div>}
        {jornada === undefined || servicios === null ? <div style={{ ...tarjeta, color: GRIS }}>Cargando tus rutas…</div> : <>
          {!jornada && <EmpezarDia chofer={chofer} placaSugerida={(servicios[0] || {}).unidadPlaca || ""} llamar={llamar} subir={subir} onListo={() => { setVuelta(v => v + 1); avisar("¡Listo! Ya puedes salir a tu ruta."); }}/>}
          {jornada?.estado === "Cerrada" && <div style={{ ...tarjeta, color: AZUL, fontWeight: 700 }}>Tu día de hoy ya está cerrado. ¡Buen descanso!</div>}
          {errorRutas && <div style={{ ...tarjeta, color: ROJO, fontWeight: 700 }}>{errorRutas}</div>}
          {servicios.length === 0 && !errorRutas && jornada?.estado !== "Cerrada" && <div style={{ ...tarjeta, textAlign: "center", color: GRIS, fontSize: 17 }}>Por ahora no tienes rutas asignadas.<br/>Cuando la oficina te asigne una, aparece aquí sola.</div>}
          {servicios.map(s => <Servicio key={s.id} db={db} chofer={chofer} servicio={s} jornadaAbierta={jornadaAbierta} llamar={llamar} subir={subir} mandarAhora={mandarAhora} avisar={avisar}/>)}
          {jornadaAbierta && !enRuta && <button onClick={terminar} style={{ ...boton(AZUL, false), marginTop: 6 }}>Terminar mi día</button>}
        </>}
      </div>
      <button onClick={sos} style={{ position: "fixed", right: 16, bottom: 16, width: 72, height: 72, borderRadius: "50%", background: ROJO, color: "#fff", border: "4px solid #fff",
        fontWeight: 900, fontSize: 18, boxShadow: "0 4px 14px rgba(220,38,38,.5)", zIndex: 40, cursor: "pointer" }}>SOS</button>
    </div>
  );
}
