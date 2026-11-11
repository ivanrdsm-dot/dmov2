/* ═══════════════════════════════════════════════════════════════════════════
   TARIFARIO · fuente única de precios (reemplaza al Excel y al tarifario del código)
   - Los precios se GUARDAN como están en el tarifario; nada se recalcula ni se supone.
   - El precio al cliente se toma del bloque elegido y se redondea a decenas hacia arriba.
   - Si falta una tarifa, se dice; nunca se inventa un precio.
   Lógica pura; probada en tarifario.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */

export const UNIDADES_TARIFA = [
  { k: "eur", nombre: "Eurovan 1 tonelada" },
  { k: "cam", nombre: "Camioneta 3½ (16 m³)" },
  { k: "kra", nombre: "Krafter" },
  { k: "rab", nombre: "Rabón 40 m³" },
  { k: "mud", nombre: "Mudancero 70 m³" },
] as const;
export type UnidadTarifa = typeof UNIDADES_TARIFA[number]["k"];
export type Bloque = "base" | "cliente";
export const IVA_PCT = 16;

export interface Tarifa {
  id?: string; tipo: "nacional" | "local"; nombre: string; km?: number | null;
  base?: Partial<Record<UnidadTarifa, number>>; cliente?: Partial<Record<UnidadTarifa, number>>;
  valorUnico?: number | null;       // conceptos con un solo precio (p. ej. entrega adicional en ruta local)
  activo?: boolean; [k: string]: unknown;
}

const num = (v: unknown): number => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : NaN; };
export const sinAcentos = (s: unknown): string => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Id estable de una tarifa: "nacional_san-luis-potosi". */
export const idTarifa = (tipo: string, nombre: string): string => `${tipo}_${sinAcentos(nombre).replace(/ /g, "-")}`.slice(0, 120);

/** Redondeo a decenas hacia arriba: 22,082.50 → 22,090. Un múltiplo exacto no sube. */
export function redondearDecenasArriba(n: number): number {
  if(!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(Math.round(n * 100) / 100 / 10) * 10;
}

/** Busca un destino por nombre, sin importar acentos ni mayúsculas. Exacto primero; si no, por inicio. */
export function buscarTarifa(tarifas: Tarifa[], tipo: "nacional" | "local", texto: string): Tarifa | null {
  const q = sinAcentos(texto);
  if(!q) return null;
  const vivas = (tarifas ?? []).filter(t => t.tipo === tipo && t.activo !== false);
  return vivas.find(t => sinAcentos(t.nombre) === q) ?? (() => { const c = vivas.filter(t => sinAcentos(t.nombre).startsWith(q)); return c.length === 1 ? c[0]! : null; })();
}

export interface Precio { tarifa: number; redondeado: number; iva: number; total: number; bloque: Bloque; unidad: UnidadTarifa; }
/** Precio de una tarifa para una unidad y un bloque. null si esa tarifa no existe: no se sustituye por otra. */
export function precioDeTarifa(t: Tarifa | null | undefined, unidad: UnidadTarifa, bloque: Bloque): Precio | null {
  const v = num(t?.[bloque]?.[unidad]);
  if(!(v > 0)) return null;
  const redondeado = redondearDecenasArriba(v);
  const iva = Math.round(redondeado * IVA_PCT) / 100;
  return { tarifa: Math.round(v * 100) / 100, redondeado, iva, total: Math.round((redondeado + iva) * 100) / 100, bloque, unidad };
}

/** Precio para cotizar: parte del precio BASE y agrega el porcentaje de ganancia indicado (0 = precio base).
 *  El porcentaje lo decide quien cotiza; el bloque "cliente" del tarifario queda solo como referencia. */
export function precioConGanancia(t: Tarifa | null | undefined, unidad: UnidadTarifa, gananciaPct: unknown): (Precio & { base: number; gananciaPct: number; ganancia: number }) | null {
  const b = num(t?.base?.[unidad]);
  if(!(b > 0)) return null;
  const pct = num(gananciaPct);
  const g = Number.isFinite(pct) && pct > 0 ? Math.min(pct, 300) : 0;
  const tarifa = Math.round(b * (1 + g / 100) * 100) / 100;
  const redondeado = redondearDecenasArriba(tarifa);
  const iva = Math.round(redondeado * IVA_PCT) / 100;
  return { base: Math.round(b * 100) / 100, gananciaPct: g, ganancia: Math.round((redondeado - b) * 100) / 100, tarifa, redondeado, iva,
    total: Math.round((redondeado + iva) * 100) / 100, bloque: "base", unidad };
}

/** Relación entre el bloque cliente y el base de una tarifa (1.12 = +12 %). Sirve para auditar el tarifario. */
export function factorCliente(t: Tarifa): number | null {
  const fs = UNIDADES_TARIFA.map(u => { const b = num(t.base?.[u.k]), c = num(t.cliente?.[u.k]); return b > 0 && c > 0 ? Math.round(c / b * 1000) / 1000 : null; }).filter((x): x is number => x !== null);
  if(fs.length === 0) return null;
  return fs.every(f => f === fs[0]) ? fs[0]! : NaN;        // NaN = las unidades no guardan la misma relación
}

export function validarTarifa(t: Tarifa): { ok: boolean; errores: string[]; avisos: string[] } {
  const errores: string[] = [], avisos: string[] = [];
  if(!String(t.nombre ?? "").trim()) errores.push("Nombre");
  if(t.tipo !== "nacional" && t.tipo !== "local") errores.push("Tipo");
  let algun = false;
  for(const bloque of ["base", "cliente"] as const) for(const u of UNIDADES_TARIFA){
    const crudo = t[bloque]?.[u.k];
    if(crudo === undefined || crudo === null || String(crudo) === "") continue;
    const v = num(crudo);
    if(!(v > 0)) errores.push(`${u.nombre} (${bloque}): debe ser mayor a cero`); else algun = true;
  }
  const vu = t.valorUnico;
  if(vu !== undefined && vu !== null && String(vu) !== ""){ if(!(num(vu) > 0)) errores.push("Valor único: debe ser mayor a cero"); else algun = true; }
  if(!algun) errores.push("Al menos un precio");
  for(const u of UNIDADES_TARIFA){ const b = num(t.base?.[u.k]), c = num(t.cliente?.[u.k]); if(b > 0 && c > 0 && c < b) avisos.push(`${u.nombre}: el precio cliente es menor que el base`); }
  if(t.tipo === "nacional" && !(num(t.km) > 0)) avisos.push("Sin kilometraje");
  return { ok: errores.length === 0, errores, avisos };
}

export interface CambioPrecio { campo: string; antes: number | null; despues: number | null; }
/** Diferencias de precio entre dos versiones de una tarifa, para el historial. */
export function diffTarifa(antes: Tarifa | null, despues: Tarifa): CambioPrecio[] {
  const out: CambioPrecio[] = [];
  const val = (v: unknown) => { const n = num(v); return n > 0 ? Math.round(n * 100) / 100 : null; };
  for(const bloque of ["base", "cliente"] as const) for(const u of UNIDADES_TARIFA){
    const a = val(antes?.[bloque]?.[u.k]), d = val(despues[bloque]?.[u.k]);
    if(a !== d) out.push({ campo: `${bloque}.${u.k}`, antes: a, despues: d });
  }
  const a = val(antes?.valorUnico), d = val(despues.valorUnico);
  if(a !== d) out.push({ campo: "valorUnico", antes: a, despues: d });
  const ka = val(antes?.km), kd = val(despues.km);
  if(ka !== kd) out.push({ campo: "km", antes: ka, despues: kd });
  return out;
}

/** ¿El precio objetivo del cliente queda por debajo del costo base del tarifario? (se marca en rojo antes de aprobar) */
export function bajoElBase(t: Tarifa | null | undefined, unidad: UnidadTarifa, precioObjetivo: unknown): boolean | null {
  const b = num(t?.base?.[unidad]), p = num(precioObjetivo);
  if(!(b > 0) || !(p > 0)) return null;
  return p < b;
}
