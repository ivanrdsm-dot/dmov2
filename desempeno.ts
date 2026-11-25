/* ═══════════════════════════════════════════════════════════════════════════
   DESEMPEÑO DE OPERADORES · cuánto tarda cada chofer por ruta y si califica a incentivo.
   Medición justa:
   - Se separa MANEJO (lo que depende del chofer) de TIEMPO EN SITIO (esperas del cliente).
   - El manejo se compara contra el estimado del mapa de ESA ruta (no contra otros choferes
     con rutas distintas): 100 % = tardó lo estimado; 110 % = 10 % más rápido.
   - Solo cuenta lo que registró el sistema (servidor). Lo que no se midió queda "sin dato",
     nunca se inventa.
   Lógica pura (sin Firebase). Probada en desempeno.test.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ParadaD { tipo?: string; estado?: string; llegadaMs?: number | null; cerradaMs?: number | null; incidencia?: string;
  conFoto?: boolean; conFirmaOReceptor?: boolean; porExcepcion?: boolean; }
export interface RutaD { id: string; folio?: string; choferId: string; choferNombre?: string; fechaServicio?: string; estado?: string;
  salidaMs?: number | null; finMs?: number | null; estimadoManejoSeg?: number | null; km?: number | null; foraneo?: boolean; paradas: ParadaD[]; }
export interface JornadaD { choferId: string; fecha?: string; llegoTarde?: boolean; tardeMin?: number; dudas?: string[]; }
export interface AlertaD { choferId?: string; type?: string; }

/* Propuesta de reglas para calificar a incentivo. Son SUPUESTOS para arrancar: el director las ajusta.
   El monto del incentivo NO está aquí: lo decide el dueño (queda PENDIENTE). */
export const REGLAS_INCENTIVO = {
  minRutas: 4,              // con menos rutas en el periodo no hay datos suficientes para juzgar
  puntualidadMin: 90,       // % de check-ins a tiempo
  evidenciaMin: 95,         // % de entregas con foto y firma (o nombre de quien recibió)
  eficienciaMin: 90,        // % manejo estimado / manejo real
  trampasMax: 0,            // alertas de posible engaño permitidas
};
/* Alertas que indican posible engaño: con una sola, no califica (se revisa caso por caso). */
export const ALERTAS_TRAMPA = ["ubicacion_simulada", "velocidad_imposible", "reloj_adelantado", "km_no_coinciden", "unidad_no_coincide", "dispositivo_no_autorizado"];
/* Alertas de operación: no descalifican solas, pero se muestran. */
export const ALERTAS_OPERACION = ["detenido", "fuera_de_ruta", "fuera_de_cdmx", "sin_ubicacion", "cierre_fuera_de_punto", "cambio_sin_enterado", "sin_checkout", "checkin_dudoso"];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const min = (ms: number) => Math.round(ms / 60000);

/** Una ruta terminada → sus tiempos. */
export function medirRuta(r: RutaD){
  const ps = (r.paradas || []).filter(p => p.estado !== "Quitada");
  const cerradas = ps.filter(p => num(p.cerradaMs) !== null);
  const salida = num(r.salidaMs), fin = num(r.finMs) ?? (cerradas.length ? Math.max(...cerradas.map(p => p.cerradaMs as number)) : null);
  const totalMin = salida !== null && fin !== null && fin > salida ? min(fin - salida) : null;
  /* Tiempo en sitio: de que llegó (GPS) a que cerró la entrega. Solo paradas con ambos datos. */
  const conLlegada = cerradas.filter(p => num(p.llegadaMs) !== null && (p.cerradaMs as number) >= (p.llegadaMs as number));
  const enSitioMin = conLlegada.length ? min(conLlegada.reduce((s, p) => s + ((p.cerradaMs as number) - (p.llegadaMs as number)), 0)) : null;
  const llegadasCompletas = cerradas.length > 0 && conLlegada.length === cerradas.length;
  const manejoMin = totalMin !== null && enSitioMin !== null && llegadasCompletas ? Math.max(0, totalMin - enSitioMin) : null;
  const estimadoMin = num(r.estimadoManejoSeg) !== null ? Math.round((r.estimadoManejoSeg as number) / 60) : null;
  const eficiencia = manejoMin && estimadoMin ? Math.round((estimadoMin / manejoMin) * 100) : null;
  const entregas = ps.filter(p => p.tipo !== "carga" && ["Entregada", "Incidencia"].includes(String(p.estado)));
  return {
    id: r.id, folio: r.folio || "", fecha: r.fechaServicio || "", terminada: ["Entregada", "Completada", "Cerrada", "Facturada", "Cobrada"].includes(String(r.estado)),
    paradas: cerradas.length, entregas: entregas.length, totalMin, enSitioMin, manejoMin, estimadoMin, eficiencia,
    minPorParada: totalMin !== null && cerradas.length ? Math.round(totalMin / cerradas.length) : null,
    conEvidencia: entregas.filter(p => p.conFoto && p.conFirmaOReceptor).length,
    incidencias: entregas.filter(p => p.estado === "Incidencia").length,
    porExcepcion: cerradas.filter(p => p.porExcepcion).length,
    km: num(r.km), foraneo: r.foraneo === true,
  };
}
export type MedidaRuta = ReturnType<typeof medirRuta>;

/** Tarjeta de cada operador en el periodo. */
export function tarjetasOperadores(rutas: RutaD[], jornadas: JornadaD[] = [], alertas: AlertaD[] = [], nombres: Record<string, string> = {}, R = REGLAS_INCENTIVO){
  const ids = [...new Set([...rutas.map(r => r.choferId), ...jornadas.map(j => j.choferId)].filter(Boolean))];
  return ids.map(id => {
    const medidas = rutas.filter(r => r.choferId === id).map(medirRuta).filter(m => m.terminada);
    const js = jornadas.filter(j => j.choferId === id), al = alertas.filter(a => a.choferId === id);
    const conEf = medidas.filter(m => m.eficiencia !== null);
    /* Eficiencia ponderada por minutos estimados: una ruta larga pesa más que una corta. */
    const sumEst = conEf.reduce((s, m) => s + (m.estimadoMin || 0), 0), sumMan = conEf.reduce((s, m) => s + (m.manejoMin || 0), 0);
    const entregas = medidas.reduce((s, m) => s + m.entregas, 0);
    const conTotal = medidas.filter(m => m.totalMin !== null);
    const t = {
      choferId: id, nombre: nombres[id] || rutas.find(r => r.choferId === id)?.choferNombre || "Chofer",
      rutas: medidas.length, paradas: medidas.reduce((s, m) => s + m.paradas, 0), entregas,
      horasEnRuta: conTotal.length ? Math.round(conTotal.reduce((s, m) => s + (m.totalMin || 0), 0) / 6) / 10 : null,
      minPromedioRuta: conTotal.length ? Math.round(conTotal.reduce((s, m) => s + (m.totalMin || 0), 0) / conTotal.length) : null,
      minPorParada: conTotal.length ? Math.round(conTotal.reduce((s, m) => s + (m.totalMin || 0), 0) / Math.max(1, conTotal.reduce((s, m) => s + m.paradas, 0))) : null,
      eficiencia: sumMan > 0 ? Math.round((sumEst / sumMan) * 100) : null,
      diasTrabajados: js.length, retardos: js.filter(j => j.llegoTarde).length, minTarde: js.reduce((s, j) => s + (j.llegoTarde ? Number(j.tardeMin) || 0 : 0), 0),
      puntualidad: pct(js.filter(j => !j.llegoTarde).length, js.length),
      evidencia: pct(medidas.reduce((s, m) => s + m.conEvidencia, 0), entregas),
      incidencias: medidas.reduce((s, m) => s + m.incidencias, 0),
      trampas: al.filter(a => ALERTAS_TRAMPA.includes(String(a.type))).length,
      alertasOperacion: al.filter(a => ALERTAS_OPERACION.includes(String(a.type))).length,
      medidas,
    };
    return { ...t, incentivo: calificar(t, R) };
  }).sort((a, b) => (b.incentivo.cumple - a.incentivo.cumple) || (b.entregas - a.entregas));
}

/** ¿Califica a incentivo? Dice qué cumple y qué no (con números), sin montos. */
export function calificar(t: { rutas: number; puntualidad: number | null; evidencia: number | null; eficiencia: number | null; trampas: number }, R = REGLAS_INCENTIVO){
  const reglas = [
    { regla: `Al menos ${R.minRutas} rutas terminadas`, ok: t.rutas >= R.minRutas, valor: `${t.rutas}` },
    { regla: `Puntualidad ${R.puntualidadMin} % o más`, ok: t.puntualidad !== null && t.puntualidad >= R.puntualidadMin, valor: t.puntualidad === null ? "sin dato" : `${t.puntualidad} %` },
    { regla: `Evidencia completa ${R.evidenciaMin} % o más`, ok: t.evidencia !== null && t.evidencia >= R.evidenciaMin, valor: t.evidencia === null ? "sin dato" : `${t.evidencia} %` },
    { regla: `Eficiencia de manejo ${R.eficienciaMin} % o más`, ok: t.eficiencia !== null && t.eficiencia >= R.eficienciaMin, valor: t.eficiencia === null ? "sin dato" : `${t.eficiencia} %` },
    { regla: "Sin alertas de posible engaño", ok: t.trampas <= R.trampasMax, valor: `${t.trampas}` },
  ];
  const cumple = reglas.filter(r => r.ok).length;
  const estado = cumple === reglas.length ? "Califica" : t.trampas > R.trampasMax ? "No califica" : cumple >= reglas.length - 1 ? "Casi" : "No califica";
  return { estado, cumple, total: reglas.length, reglas };
}

/** Bitácora histórica (sin horas): cuántos viajes hizo cada quien, por mes. */
export function volumenHistorico(viajes: { fechaServicio?: string; choferIds?: string[]; choferId?: string }[], nombres: Record<string, string> = {}){
  const out: Record<string, { choferId: string; nombre: string; viajes: number; porMes: Record<string, number> }> = {};
  for(const v of viajes || []){
    const ids = (v.choferIds && v.choferIds.length ? v.choferIds : [v.choferId]).filter(Boolean) as string[];
    const mes = String(v.fechaServicio || "").slice(0, 7);
    for(const id of ids){
      const o = out[id] || (out[id] = { choferId: id, nombre: nombres[id] || id, viajes: 0, porMes: {} });
      o.viajes++; if(mes) o.porMes[mes] = (o.porMes[mes] || 0) + 1;
    }
  }
  return Object.values(out).sort((a, b) => b.viajes - a.viajes);
}
