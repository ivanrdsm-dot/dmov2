/* ═══════════════════════════════════════════════════════════════════════════
   DIMENSIONAMIENTO · qué unidad(es) necesita un servicio
   Reglas:
   - Solo compara contra capacidades CAPTURADAS en Flota. Si una unidad no tiene
     la capacidad que hace falta comparar, no se recomienda y se reporta.
   - No supone nada de la carga: si no hay peso, volumen, tarimas ni cajas, no dimensiona.
   - Devuelve siempre el porqué, y una alternativa cuando existe.
   Lógica pura; probada en dimensionamiento.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface UnidadFlota {
  id?: string; placa?: string; tipo?: string; status?: string; propietario?: string;
  capacidadKg?: number | string; capacidadM3?: number | string; capacidadTarimas?: number | string; capacidadCajas?: number | string;
  [k: string]: unknown;
}
export interface Carga { pesoKg?: number | string; volumenM3?: number | string; tarimas?: number | string; cajas?: number | string; [k: string]: unknown; }

type Medida = "pesoKg" | "volumenM3" | "tarimas" | "cajas";
const MEDIDAS: { carga: Medida; cap: keyof UnidadFlota; nombre: string; unidad: string }[] = [
  { carga: "pesoKg", cap: "capacidadKg", nombre: "peso", unidad: "kg" },
  { carga: "volumenM3", cap: "capacidadM3", nombre: "volumen", unidad: "m³" },
  { carga: "tarimas", cap: "capacidadTarimas", nombre: "tarimas", unidad: "tarimas" },
  { carga: "cajas", cap: "capacidadCajas", nombre: "cajas", unidad: "cajas" },
];
const num = (v: unknown): number => { const n = Number(String(v ?? "").replace(/[,\s]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
const placaDe = (u: UnidadFlota): string => String(u.placa || u.id || "").trim();
const activa = (u: UnidadFlota): boolean => !u.status || u.status === "Activa";

/** Capacidades básicas que le faltan a una unidad para poder dimensionar con ella. */
export function faltantesCapacidad(u: UnidadFlota): string[] {
  const f: string[] = [];
  if(!String(u.tipo ?? "").trim()) f.push("Tipo de unidad");
  if(!num(u.capacidadKg)) f.push("Capacidad en kg");
  if(!num(u.capacidadM3)) f.push("Capacidad en m³");
  if(!num(u.capacidadTarimas)) f.push("Capacidad en tarimas");
  return f;
}

/** Medidas conocidas de la carga (solo las que vienen con valor mayor a cero). */
export function medidasDeCarga(c: Carga){
  return MEDIDAS.map(m => ({ ...m, valor: num(c?.[m.carga]) })).filter(m => m.valor > 0);
}

export interface Uso { medida: string; unidad: string; carga: number; capacidad: number; pct: number; }
export interface UnidadRecomendada { placa: string; tipo: string; }
export interface Recomendacion {
  estado: "ok" | "sin_datos_carga" | "sin_capacidades" | "no_cabe";
  unidades: UnidadRecomendada[];
  uso: Uso[];                       // contra la capacidad sumada de las unidades recomendadas
  justificacion: string[];
  alternativa: UnidadRecomendada[] | null;
  unidadesSinCapacidad: string[];   // placas que no se pudieron considerar
  faltanDeLaCarga: string[];
}

const suma = (us: UnidadFlota[], cap: keyof UnidadFlota) => us.reduce((a, u) => a + num(u[cap]), 0);
const tamano = (u: UnidadFlota) => num(u.capacidadM3) * 1e6 + num(u.capacidadKg) + num(u.capacidadTarimas);
const usoDe = (us: UnidadFlota[], medidas: ReturnType<typeof medidasDeCarga>): Uso[] =>
  medidas.map(m => { const cap = suma(us, m.cap); return { medida: m.nombre, unidad: m.unidad, carga: m.valor, capacidad: cap, pct: cap ? Math.round(m.valor / cap * 100) : 0 }; });
const cabeEn = (us: UnidadFlota[], medidas: ReturnType<typeof medidasDeCarga>) => medidas.every(m => suma(us, m.cap) >= m.valor);
const comoSalida = (us: UnidadFlota[]): UnidadRecomendada[] => us.map(u => ({ placa: placaDe(u), tipo: String(u.tipo ?? "") }));
const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 });

/** Recomienda la unidad más chica que alcanza; si ninguna sola alcanza, la combinación con menos unidades. */
export function recomendarUnidades(carga: Carga, unidades: UnidadFlota[], opts: { maxUnidades?: number } = {}): Recomendacion {
  const max = opts.maxUnidades ?? 3;
  const medidas = medidasDeCarga(carga);
  const base: Recomendacion = { estado: "ok", unidades: [], uso: [], justificacion: [], alternativa: null, unidadesSinCapacidad: [], faltanDeLaCarga: [] };
  if(medidas.length === 0)
    return { ...base, estado: "sin_datos_carga", faltanDeLaCarga: ["Peso, volumen, tarimas o cajas"],
      justificacion: ["No se puede dimensionar: la solicitud no trae peso, volumen, tarimas ni cajas."] };

  const activas = (unidades ?? []).filter(activa).filter(u => placaDe(u));
  const utiles = activas.filter(u => medidas.every(m => num(u[m.cap]) > 0));
  const sinCapacidad = activas.filter(u => !utiles.includes(u)).map(placaDe);
  if(utiles.length === 0)
    return { ...base, estado: "sin_capacidades", unidadesSinCapacidad: sinCapacidad,
      justificacion: [`Ninguna unidad activa tiene capturada la capacidad de ${medidas.map(m => m.nombre).join(", ")}. Captúrala en Flota.`] };

  const textoCarga = medidas.map(m => `${fmt(m.valor)} ${m.unidad}`).join(", ");
  const porTamano = [...utiles].sort((a, b) => tamano(a) - tamano(b) || placaDe(a).localeCompare(placaDe(b)));

  /* 1) Una sola unidad: la más chica que alcanza */
  const solas = porTamano.filter(u => cabeEn([u], medidas));
  if(solas.length > 0){
    const u = solas[0]!, uso = usoDe([u], medidas);
    const limite = [...uso].sort((a, b) => b.pct - a.pct)[0]!;
    const otra = solas.find(x => String(x.tipo) !== String(u.tipo)) ?? null;
    return { ...base, unidades: comoSalida([u]), uso, unidadesSinCapacidad: sinCapacidad,
      alternativa: otra ? comoSalida([otra]) : null,
      justificacion: [
        `Carga: ${textoCarga}.`,
        `Cabe en una sola unidad: ${placaDe(u)}${u.tipo ? " (" + u.tipo + ")" : ""}. Es la más chica que alcanza.`,
        `Lo que más se ocupa es ${limite.medida}: ${limite.pct} % de su capacidad (${fmt(limite.carga)} de ${fmt(limite.capacidad)} ${limite.unidad}).`,
        ...(otra ? [`Alternativa con más holgura: ${placaDe(otra)}${otra.tipo ? " (" + otra.tipo + ")" : ""}.`] : []),
      ] };
  }

  /* 2) Varias unidades: de la más grande a la más chica hasta que alcance */
  const grandes = [...porTamano].reverse();
  const elegidas: UnidadFlota[] = [];
  for(const u of grandes){ if(elegidas.length >= max) break; elegidas.push(u); if(cabeEn(elegidas, medidas)) break; }
  if(!cabeEn(elegidas, medidas)){
    const uso = usoDe(elegidas, medidas);
    const peor = [...uso].sort((a, b) => b.pct - a.pct)[0]!;
    return { ...base, estado: "no_cabe", uso, unidadesSinCapacidad: sinCapacidad,
      justificacion: [
        `Carga: ${textoCarga}.`,
        `No cabe ni con las ${elegidas.length} unidades más grandes con capacidad capturada: falta ${peor.medida} (${fmt(peor.carga)} contra ${fmt(peor.capacidad)} ${peor.unidad}).`,
        "Requiere proveedor externo con unidad mayor o dividir el servicio.",
      ] };
  }
  /* Cambia la última por la más chica que todavía alcance, para no sobrar capacidad */
  const fijas = elegidas.slice(0, -1);
  const ultima = porTamano.find(u => !fijas.includes(u) && cabeEn([...fijas, u], medidas)) ?? elegidas[elegidas.length - 1]!;
  const final = [...fijas, ultima];
  const uso = usoDe(final, medidas);
  const limite = [...uso].sort((a, b) => b.pct - a.pct)[0]!;
  return { ...base, unidades: comoSalida(final), uso, unidadesSinCapacidad: sinCapacidad,
    justificacion: [
      `Carga: ${textoCarga}.`,
      `No cabe en una sola unidad propia. Se necesitan ${final.length}: ${final.map(u => placaDe(u) + (u.tipo ? " (" + u.tipo + ")" : "")).join(" + ")}.`,
      `Juntas ocupan ${limite.pct} % de su ${limite.medida}.`,
      "Alternativa: un proveedor externo con una sola unidad mayor.",
    ] };
}
