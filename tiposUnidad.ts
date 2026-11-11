/* ═══════════════════════════════════════════════════════════════════════════
   TIPOS DE UNIDAD · catálogo de referencia + lo que la flota real enseña
   Cada tipo trae una capacidad de REFERENCIA conservadora con su fuente
   (investigación de fichas técnicas, nov-2026: reports/Capacidades de unidades de carga.md).
   En cuanto una unidad real de ese tipo tiene su capacidad capturada en Flota,
   el cotizador usa la de la unidad y deja de usar la referencia.
   `reglaDeLaCasa` son los topes prácticos que la operación ya conoce.
   Lógica pura; probada en tiposUnidad.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */
import type { TipoUnidad } from "./cotizacionAuto.ts";

export interface TipoCatalogo extends TipoUnidad {
  nombresFlota: string[];        // cómo aparece este tipo en el campo "Tipo de unidad" de Flota
  enFlotaHabitual: number;       // cuántas tiene normalmente la flota (lista del dueño)
  largoInteriorM: number; anchoInteriorM: number; puertaTrasera: string;
  version: string;               // de qué versión sale la referencia
  nota: string;
}
/* `confirmada: true` en el catálogo significa que el dueño confirmó la versión exacta de su unidad. */

/* Las cantidades habituales vienen de la lista de flota del dueño:
   Transporter ×3 + Eurovan 1 t ×1, Expert ×1, Sprinter ×1, Crafter ×1, 3½ ×1, Rabón ×1, Mudancero ×1. */
export const TIPOS_UNIDAD: TipoCatalogo[] = [
  { clave: "transporter", nombre: "VW Transporter / Eurovan 1 t", tarifa: "eur", nombresFlota: ["VW Transporter", "Eurovan 1T"], enFlotaHabitual: 4, enFlota: 4,
    capacidadKg: 943, capacidadM3: 5.8, tarimasPiso: 2, altoInteriorM: 1.34, largoInteriorM: 2.32, anchoInteriorM: 1.24, puertaTrasera: "no publicada",
    cajasSueltasMax: 125, confirmada: false, fuente: "ficha global VW T6.1 y ficha México 2025", version: "T6.1 corta, techo normal (la versión más chica)",
    nota: "La nueva generación en México declara 988 kg y 6.7 m³. Regla de la casa: hasta unas 125 cajas densas." },
  { clave: "expert", nombre: "Peugeot Expert", tarifa: "eur", nombresFlota: ["Peugeot Expert"], enFlotaHabitual: 1, enFlota: 1,
    capacidadKg: 1400, capacidadM3: 6.1, tarimasPiso: 2, altoInteriorM: 1.39, largoInteriorM: 2.86, anchoInteriorM: 1.25, puertaTrasera: "1.28 × 1.22 m",
    confirmada: false, fuente: "ficha Peugeot México 2025; medidas interiores de fuentes secundarias", version: "Furgón largo (L3)",
    nota: "La tarima solo entra por las puertas traseras: la puerta lateral mide 0.93 m." },
  { clave: "sprinter", nombre: "Mercedes Sprinter", tarifa: "kra", nombresFlota: ["Mercedes Sprinter"], enFlotaHabitual: 1, enFlota: 1,
    capacidadKg: 945, capacidadM3: 9.0, tarimasPiso: 3, altoInteriorM: 1.72, largoInteriorM: 3.27, anchoInteriorM: 1.35, puertaTrasera: "1.55 × 1.55 m",
    cajasSueltasMax: 150, confirmada: true, fuente: "ficha Mercedes-Benz México; versión confirmada por el dueño (nov-2026)", version: "311 Mediana, 945 kg de carga útil",
    nota: "Versión confirmada: la de 945 kg. Con techo normal son 9.0 m³ y 1.72 m de alto; si la unidad es de techo alto sube a 10.5 m³ y 2.0 m: falta medir el techo. Regla de la casa: no alcanza arriba de unas 150 cajas de líquido." },
  { clave: "crafter", nombre: "VW Crafter", tarifa: "kra", nombresFlota: ["VW Crafter", "Krafter"], enFlotaHabitual: 1, enFlota: 1,
    capacidadKg: 1346, capacidadM3: 9.9, tarimasPiso: 3, altoInteriorM: 1.73, largoInteriorM: 3.45, anchoInteriorM: 1.38, puertaTrasera: "1.52 m de ancho",
    confirmada: false, fuente: "ficha VW México y folleto global; el dueño confirmó que es la 3.5 t (nov-2026)", version: "3.5T: carga de la larga (1,346 kg) con volumen y piso de la mediana",
    nota: "Confirmado que es la de 3.5 toneladas de peso bruto. Falta saber si es mediana (1,469 kg, 9.9 m³, 3 tarimas) o larga (1,346 kg, 14.4 m³, 4 tarimas): se usa lo más conservador de las dos." },
  { clave: "c35", nombre: "Camioneta 3½ (16 m³)", tarifa: "cam", nombresFlota: ["Camioneta 3.5T"], enFlotaHabitual: 1, enFlota: 1,
    capacidadKg: 2700, capacidadM3: 16, tarimasPiso: 5, altoInteriorM: 2.2, largoInteriorM: 3.5, anchoInteriorM: 2.2, puertaTrasera: "depende del carrocero",
    confirmada: false, fuente: "chasis Isuzu ELF 400 / Foton S3 y cajas típicas de carrocero", version: "caja de 16 m³: 3.5 × 2.2 × 2.2 m",
    nota: "\"3.5 toneladas\" es la capacidad del chasis antes de restar la caja; la carga neta estimada es de 2.7 a 3.0 t. En el piso caben 5 tarimas (3 a lo largo y 2 atravesadas); las 10 que maneja la operación salen apilando a dos niveles." },
  { clave: "rabon", nombre: "Rabón (40 m³)", tarifa: "rab", nombresFlota: ["Rabón"], enFlotaHabitual: 1, enFlota: 1,
    capacidadKg: 5400, capacidadM3: 40, tarimasPiso: 12, altoInteriorM: 2.3, largoInteriorM: 7.0, anchoInteriorM: 2.4, puertaTrasera: "depende del carrocero",
    confirmada: false, fuente: "chasis Isuzu Forward 800 / Hino 1018 y cajas típicas de operador", version: "rabón chico (PBV 10.4 t) con caja de 7 m",
    nota: "Un rabón grande (PBV 15.9 a 17 t) carga de 8.3 a 9.9 t. Tope legal C2: 19 t de peso bruto en caminos ET y A. Regla de la casa: de 11 tarimas en adelante va rabón." },
  { clave: "mudancero", nombre: "Mudancero (70 m³)", tarifa: "mud", nombresFlota: ["Mudancero"], enFlotaHabitual: 1, enFlota: 1,
    capacidadKg: 8000, capacidadM3: 70, tarimasPiso: 16, altoInteriorM: 2.9, largoInteriorM: 8.5, anchoInteriorM: 2.5, puertaTrasera: "depende del carrocero",
    confirmada: false, fuente: "estimado: caja de alto volumen sobre chasis de rabón grande", version: "caja de unos 8.5 × 2.5 × 3.0 m más copete",
    nota: "Mudancero es un tipo de caja, no de chasis. Ningún operador publica medidas que den 70 m³ exactos: la carga y las medidas hay que tomarlas de la unidad real." },
  { clave: "torton", nombre: "Torton", tarifa: null, nombresFlota: [], enFlotaHabitual: 0, enFlota: 0,
    capacidadKg: 14000, capacidadM3: 45, tarimasPiso: 12, altoInteriorM: 2.4, largoInteriorM: 7.5, anchoInteriorM: 2.4, puertaTrasera: "depende del carrocero",
    confirmada: false, fuente: "chasis Isuzu Forward 1800 y cajas típicas de operador", version: "3 ejes 6x2 con caja de 7.5 m",
    nota: "Solo con proveedor. Tope legal C3: 24 t con 8 llantas o 27.5 t con 10, en caminos ET y A." },
  { clave: "trailer48", nombre: "Tráiler caja seca 48 pies", tarifa: null, nombresFlota: [], enFlotaHabitual: 0, enFlota: 0,
    capacidadKg: 22000, capacidadM3: 100, tarimasPiso: 24, altoInteriorM: 2.79, largoInteriorM: 14.48, anchoInteriorM: 2.5, puertaTrasera: "aprox. 2.5 × 2.75 m",
    confirmada: false, fuente: "medidas típicas; sin ficha de fabricante", version: "caja seca de 48 pies",
    nota: "Solo con proveedor. 24 tarimas con el lado de 1.0 m a lo ancho; hasta 28 girándolas. No entra al Centro Histórico de la CDMX." },
  { clave: "trailer53", nombre: "Tráiler caja seca 53 pies", tarifa: null, nombresFlota: [], enFlotaHabitual: 0, enFlota: 0,
    capacidadKg: 24700, capacidadM3: 111.9, tarimasPiso: 26, altoInteriorM: 2.79, largoInteriorM: 16.0, anchoInteriorM: 2.5, puertaTrasera: "aprox. 2.5 × 2.75 m",
    confirmada: false, fuente: "ficha Hyundai Translead y NOM-012-SCT-2-2017", version: "caja seca de 53 pies, T3-S2",
    nota: "Solo con proveedor. La caja admite 24.7 t por diseño, menos que el margen legal de 30 a 32 t. 26 tarimas derechas; hasta 30 girándolas." },
];

export const tipoPorNombreFlota = (nombre: unknown): TipoCatalogo | null => {
  const q = String(nombre ?? "").trim().toLowerCase();
  return q ? TIPOS_UNIDAD.find(t => t.nombresFlota.some(x => x.toLowerCase() === q)) ?? null : null;
};

interface UnidadFlotaMin { tipo?: unknown; status?: unknown; capacidadKg?: unknown; capacidadM3?: unknown; capacidadTarimas?: unknown; altoCm?: unknown; }
const num = (v: unknown): number => { const x = Number(String(v ?? "").replace(/[,\s]/g, "")); return Number.isFinite(x) && x > 0 ? x : 0; };

/** Catálogo que usa el cotizador: la referencia por tipo, corregida con lo que la flota real tiene capturado.
 *  - Si hay unidades de ese tipo dadas de alta, `enFlota` es cuántas hay activas.
 *  - Si alguna tiene kg, m³ y tarimas capturados, se usan los de la unidad más chica y queda como confirmada. */
export function tiposParaCotizar(unidades: UnidadFlotaMin[] = []): TipoUnidad[] {
  const activas = (unidades ?? []).filter(u => !u.status || u.status === "Activa");
  const hayTipos = activas.some(u => tipoPorNombreFlota(u.tipo));
  return TIPOS_UNIDAD.map(t => {
    const mias = activas.filter(u => tipoPorNombreFlota(u.tipo)?.clave === t.clave);
    const completas = mias.filter(u => num(u.capacidadKg) && num(u.capacidadM3) && num(u.capacidadTarimas));
    const base: TipoUnidad = { clave: t.clave, nombre: t.nombre, tarifa: t.tarifa, capacidadKg: t.capacidadKg, capacidadM3: t.capacidadM3, tarimasPiso: t.tarimasPiso,
      altoInteriorM: t.altoInteriorM, cajasSueltasMax: t.cajasSueltasMax, enFlota: hayTipos ? mias.length : t.enFlotaHabitual, fuente: t.fuente, confirmada: t.confirmada };
    if(completas.length === 0) return base;
    const min = (k: keyof UnidadFlotaMin) => Math.min(...completas.map(u => num(u[k])));
    const altos = completas.map(u => num(u.altoCm)).filter(Boolean);
    return { ...base, capacidadKg: min("capacidadKg"), capacidadM3: min("capacidadM3"), tarimasPiso: min("capacidadTarimas"),
      altoInteriorM: altos.length ? Math.min(...altos) / 100 : t.altoInteriorM, fuente: `capturado en Flota (${completas.length} unidad(es))`, confirmada: true };
  });
}
