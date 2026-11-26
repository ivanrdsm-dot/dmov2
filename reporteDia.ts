/* REPORTE DEL DÍA · quién vino, a qué hora, desde dónde, cuánto trabajó y QUÉ FALTÓ.
   Junta asistencia (choferes y oficina), rutas y alertas del día y saca los hallazgos en automático:
   retardos, faltas, salidas sin registrar, GPS apagado, kilómetros que no cuadran, rutas fuera de fecha,
   cierres lejos del punto, movimientos sin ruta, odómetros y placas que no cuadran.
   Solo informa con datos; nada se inventa. Lógica pura; probada en reporteDia.test.ts. */

export type Nivel = "grave" | "revisar" | "info";
export interface Hallazgo { nivel: Nivel; titulo: string; detalle: string; quien?: string; }
export interface FilaPersona {
  id: string; nombre: string; tipo: "chofer" | "oficina";
  entradaMs: number | null; tardeMin: number; lugarEntrada: string; salidaMs: number | null; lugarSalida: string; horas: number | null;
  placa: string; odometroKm: number | null; kmTablero: number | null; kmGps: number | null; alertas: Record<string, number>; falto: boolean;
}

const ms = (v: unknown): number | null => { const x = v && typeof (v as any).toMillis === "function" ? (v as any).toMillis() : Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
const txtLugar = (l: unknown) => typeof l === "string" ? l : String((l as any)?.texto || (l as any)?.direccion || "");
const normPlaca = (p: unknown) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hhmm = (t: number | null) => t ? new Date(t).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }) : "";
const dur = (m: number) => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `${m} min`;
const fechaDe = (t: number) => new Date(t - 6 * 3600000).toISOString().slice(0, 10);

export function reporteDia({ dia, ahoraMs, choferes = [], jornadas = [], oficina = [], usuariosOficina = [], servicios = [], alertas = [], placasFlota = [], horaSalida = "17:00" }:
  { dia: string; ahoraMs: number; choferes: any[]; jornadas: any[]; oficina: any[]; usuariosOficina?: any[]; servicios: any[]; alertas: any[]; placasFlota?: string[]; horaSalida?: string }){
  const vivos = choferes.filter(c => !c.baja && c.activo !== false && c.status !== "Inactivo" && !c.prueba);
  const alertasDe = (id: string) => { const o: Record<string, number> = {}; for(const a of alertas) if(a.choferId === id || a.oficinaUid === id) o[a.type] = (o[a.type] ?? 0) + 1; return o; };
  const filas: FilaPersona[] = [];
  for(const c of vivos){
    const j = jornadas.find(x => x.choferId === c.id);
    filas.push({ id: c.id, nombre: String(c.nombre || c.id), tipo: "chofer", entradaMs: ms(j?.checkInEn), tardeMin: j?.llegoTarde ? Number(j.tardeMin) || 0 : 0,
      lugarEntrada: txtLugar(j?.lugarEntrada), salidaMs: ms(j?.checkOutEn), lugarSalida: txtLugar(j?.lugarSalida),
      horas: ms(j?.checkInEn) && ms(j?.checkOutEn) ? Math.round((ms(j.checkOutEn)! - ms(j.checkInEn)!) / 360000) / 10 : null,
      placa: String(j?.unidadPlaca || ""), odometroKm: Number.isFinite(Number(j?.odometroKm)) && j ? Number(j.odometroKm) : null,
      kmTablero: Number.isFinite(Number(j?.kmRecorridos)) && j?.kmRecorridos !== undefined ? Number(j.kmRecorridos) : null, kmGps: Number.isFinite(Number(j?.kmGps)) && j?.kmGps !== undefined ? Number(j.kmGps) : null,
      alertas: alertasDe(c.id), falto: !j });
  }
  for(const u of usuariosOficina.filter(u => u.rol !== "admin" && u.activo !== false && !u.prueba)){
    const a = oficina.find(x => x.uid === u.id);
    filas.push({ id: u.id, nombre: String(u.nombre || u.id), tipo: "oficina", entradaMs: ms(a?.checkInEn), tardeMin: a?.llegoTarde ? Number(a.tardeMin) || 0 : 0,
      lugarEntrada: txtLugar(a?.lugarEntrada), salidaMs: ms(a?.checkOutEn), lugarSalida: txtLugar(a?.lugarSalida), horas: a?.horasTrabajadas ?? null,
      placa: "", odometroKm: null, kmTablero: null, kmGps: null, alertas: alertasDe(u.id), falto: !a });
  }

  const H: Hallazgo[] = [];
  const add = (nivel: Nivel, titulo: string, detalle: string, quien?: string) => H.push({ nivel, titulo, detalle, ...(quien ? { quien } : {}) });
  const vinieron = filas.filter(f => !f.falto);
  const faltaron = filas.filter(f => f.falto);
  if(faltaron.length) add("grave", `${faltaron.length} sin check-in`, faltaron.map(f => f.nombre).join(", "));
  const tarde = vinieron.filter(f => f.tardeMin > 0);
  if(tarde.length) add(tarde.length === vinieron.length ? "grave" : "revisar", `${tarde.length} de ${vinieron.length} llegaron tarde`,
    `promedio ${dur(Math.round(tarde.reduce((s, f) => s + f.tardeMin, 0) / tarde.length))} tarde · ` + tarde.map(f => `${f.nombre.split(" ")[0]} ${hhmm(f.entradaMs)}`).join(", "));
  const limiteSalida = Date.parse(`${dia}T${horaSalida}:00-06:00`) + 30 * 60000;
  const sinSalida = vinieron.filter(f => !f.salidaMs && ahoraMs > limiteSalida);
  if(sinSalida.length) add("revisar", `${sinSalida.length} sin registrar su salida`, sinSalida.map(f => f.nombre).join(", "));

  /* GPS: la app dejó de mandar ubicación, o el tablero marca kilómetros que el GPS no vio. */
  const sinGps = vinieron.filter(f => (f.alertas.sin_ubicacion ?? 0) > 0);
  if(sinGps.length) add("grave", "Celulares sin mandar ubicación", `${sinGps.map(f => f.nombre).join(", ")}: la app se cerró o quedó en segundo plano; no se sabe por dónde anduvieron.`);
  for(const f of vinieron) if(f.kmTablero !== null && f.kmTablero > 10 && (f.kmGps ?? 0) < f.kmTablero * 0.3)
    add("grave", "Kilómetros sin GPS", `el tablero marca ${f.kmTablero} km y el GPS solo ${f.kmGps ?? 0} km`, f.nombre);

  /* Misma camioneta con odómetros que no cuadran; placa que no está en Flota. */
  const porPlaca: Record<string, FilaPersona[]> = {};
  for(const f of vinieron) if(f.placa) (porPlaca[normPlaca(f.placa)] ??= []).push(f);
  for(const [p, fs] of Object.entries(porPlaca)){
    const odos = fs.map(f => f.odometroKm).filter((x): x is number => x !== null);
    if(odos.length > 1 && Math.max(...odos) - Math.min(...odos) > 500)
      add("revisar", `Odómetros que no cuadran en ${p}`, fs.map(f => `${f.nombre.split(" ")[0]} anotó ${f.odometroKm?.toLocaleString("es-MX")} km`).join(" · "));
  }
  const flota = new Set(placasFlota.map(normPlaca));
  if(flota.size) for(const f of vinieron) if(f.placa && !flota.has(normPlaca(f.placa)))
    add("revisar", "Placa que no está en Flota", `anotó "${f.placa}" en su check-in (¿error de captura?)`, f.nombre);

  /* Rutas: trabajaron sin ruta, rutas iniciadas fuera de su fecha, cierres lejos del punto, movimientos sin ruta. */
  const conRuta = new Set(servicios.filter(s => s.estado !== "Cancelada").flatMap(s => [s.choferId, s.segundoChoferId]).filter(Boolean));
  const sinRuta = vinieron.filter(f => f.tipo === "chofer" && !conRuta.has(f.id));
  if(sinRuta.length) add("revisar", `${sinRuta.length} chofer${sinRuta.length > 1 ? "es" : ""} sin ruta en el sistema`, `${sinRuta.map(f => f.nombre).join(", ")} trabajaron sin ruta asignada: no se puede saber qué hicieron.`);
  for(const s of servicios){
    const salida = ms(s.estadoTs?.["En ruta"]);
    if(salida && fechaDe(salida) === dia && s.fechaServicio && s.fechaServicio !== dia)
      add("grave", `Ruta ${s.folio} iniciada fuera de su fecha`, `estaba programada para el ${s.fechaServicio} y se inició hoy a las ${hhmm(salida)} (${s.empresa || ""}).`);
  }
  const porTipo = (t: string) => alertas.filter(a => a.type === t);
  const cierres = porTipo("cierre_fuera_de_punto");
  const quienCierre = [...new Set(cierres.map(a => a.choferNombre || a.choferId))];
  for(const q of quienCierre){ const xs = cierres.filter(a => (a.choferNombre || a.choferId) === q), m = String(xs[0]?.msg || xs[0]?.message || "");
    add("grave", "Intentó cerrar una entrega lejos del punto", `${xs.length} intento${xs.length > 1 ? "s" : ""}: ${m}`, q); }
  for(const a of porTipo("movimiento_sin_ruta")) add("revisar", "Se movió sin ruta", String(a.msg || a.message || ""), a.choferNombre);
  for(const a of porTipo("fuera_de_ruta")) add("revisar", "Fuera de su ruta", String(a.msg || a.message || ""), a.choferNombre);
  const saltos = porTipo("velocidad_imposible").length;
  if(saltos) add("info", "Saltos de GPS", `${saltos} lectura${saltos > 1 ? "s" : ""} imposible${saltos > 1 ? "s" : ""} (se descartan; suele ser mala señal).`);

  const orden: Record<Nivel, number> = { grave: 0, revisar: 1, info: 2 };
  H.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  filas.sort((a, b) => Number(a.falto) - Number(b.falto) || (a.tipo === b.tipo ? 0 : a.tipo === "oficina" ? 1 : -1) || (a.entradaMs ?? 9e15) - (b.entradaMs ?? 9e15));
  const resumen = { personas: filas.length, vinieron: vinieron.length, faltaron: faltaron.length, tarde: tarde.length, sinSalida: sinSalida.length,
    graves: H.filter(h => h.nivel === "grave").length, revisar: H.filter(h => h.nivel === "revisar").length };
  return { filas, hallazgos: H, resumen };
}

/** Texto corto para mandar por WhatsApp. */
export function textoReporte(dia: string, r: ReturnType<typeof reporteDia>): string {
  const l = [`Reporte D Movimiento · ${dia}`, `Asistencia: ${r.resumen.vinieron}/${r.resumen.personas} · tarde: ${r.resumen.tarde} · sin salida: ${r.resumen.sinSalida}`, ""];
  for(const f of r.filas) l.push(`${f.falto ? "❌" : f.tardeMin ? "⏰" : "✅"} ${f.nombre}: ${f.falto ? "sin check-in" : `${hhmm(f.entradaMs)}${f.tardeMin ? ` (${dur(f.tardeMin)} tarde)` : ""} → ${f.salidaMs ? hhmm(f.salidaMs) : "sin salida"}`}`);
  if(r.hallazgos.length){ l.push("", "Qué faltó:"); for(const h of r.hallazgos.filter(h => h.nivel !== "info")) l.push(`• ${h.quien ? h.quien + ": " : ""}${h.titulo} — ${h.detalle}`); }
  return l.join("\n");
}
