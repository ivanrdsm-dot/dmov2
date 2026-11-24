/* ═══════════════════════════════════════════════════════════════════════════
   COLA DE ENTREGAS SIN SEÑAL · si el chofer cierra una parada sin internet, la entrega
   (fotos, firma, quién recibió y la HORA en que entregó) se guarda en su celular y se manda
   sola cuando vuelve la señal. El servidor la valida contra su ubicación de ESE momento.
   Lógica pura (el almacén se pasa como parámetro). Probada en colaChofer.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */
export const CLAVE_COLA = "dm_cola_cierres";
export const MAX_COLA = 12;
export interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void; }
export interface CierreEnCola {
  id: string; servicioId: string; paradaId: string; paradaNombre?: string; cerradaMs: number;
  fotos: string[]; firma?: string; evidencia: { receptor?: string; notas?: string; incidencia?: string }; error?: string; intentos?: number;
}

export function leerCola(a: Almacen | null | undefined): CierreEnCola[] {
  try { const v = JSON.parse(a?.getItem(CLAVE_COLA) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.id && x.servicioId && x.paradaId) : []; }
  catch { return []; }
}
function escribir(a: Almacen, cola: CierreEnCola[]): boolean {
  try { a.setItem(CLAVE_COLA, JSON.stringify(cola)); return true; } catch { return false; }
}

/** Agrega (o reemplaza la misma parada). Si el celular no tiene espacio, avisa: no se pierde en silencio. */
export function agregarACola(a: Almacen, item: CierreEnCola): { ok: boolean; motivo?: string } {
  const cola = leerCola(a).filter(x => x.id !== item.id);
  if(cola.length >= MAX_COLA) return { ok: false, motivo: "Ya tienes muchas entregas sin mandar. Busca señal para enviarlas." };
  return escribir(a, [...cola, { ...item, intentos: 0 }]) ? { ok: true } : { ok: false, motivo: "Tu celular no tiene espacio para guardar la entrega. Busca señal y vuelve a intentar." };
}
export const quitarDeCola = (a: Almacen, id: string) => escribir(a, leerCola(a).filter(x => x.id !== id));
export const marcarError = (a: Almacen, id: string, error: string) =>
  escribir(a, leerCola(a).map(x => x.id === id ? { ...x, error, intentos: (x.intentos || 0) + 1 } : x));

/** ¿Falló por falta de internet (se reintenta) o por otra cosa (hay que avisar)? */
export function esErrorDeRed(e: unknown, enLinea = true): boolean {
  if(!enLinea) return true;
  const x = e as { code?: string; message?: string };
  const code = String(x?.code || ""), msg = String(x?.message || "");
  if(["functions/unavailable", "functions/deadline-exceeded", "storage/retry-limit-exceeded", "auth/network-request-failed"].includes(code)) return true;
  return /network|failed to fetch|load failed|networkerror|offline|internet|timeout|ERR_/i.test(msg) && !/permission|permiso/i.test(msg);
}

/** El servidor ya la tenía (se mandó pero no llegó la respuesta): cuenta como enviada. */
export const yaEstabaCerrada = (e: unknown) => /ya está cerrada/i.test(String((e as { message?: string })?.message || ""));
