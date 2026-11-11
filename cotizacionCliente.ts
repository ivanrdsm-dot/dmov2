/* COTIZACIÓN PARA EL CLIENTE · arma los datos del PDF que se le envía.
   Solo sale el precio que aprobó un administrador, como un solo importe.
   Nunca: desglose interno, precio propuesto, base, % de ganancia, tarifario,
   proveedores, supuestos técnicos ni notas internas. Lógica pura y probada. */
import type { Cotizacion } from "./cotizaciones.ts";
import { IVA_PCT } from "./tarifario.ts";

export const ESTADOS_CON_PDF = ["Aprobada", "Enviada", "Aceptada"];
export interface OpcionesPdf { vigenciaDias?: number | string; nota?: string; atendio?: string; ahoraMs: number; }
export interface CotizacionCliente {
  folio: string; fecha: string; vigenteHasta: string; cliente: string; atencion: string; contacto: string;
  servicio: string; carga: string; considera: string[]; porConfirmar: string[];
  precio: number; iva: number; total: number; ivaPct: number; nota: string; atendio: string;
}

const t = (v: unknown): string => String(v ?? "").trim();
const num = (v: unknown): number => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number): string => n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
const fechaMx = (ms: number): string => new Date(ms).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });
const cent = (n: number): number => Math.round(n * 100) / 100;

/** Por qué no se puede generar el PDF de esta cotización (vacío = sí se puede). */
export function bloqueoPdf(c: Cotizacion): string {
  if(!ESTADOS_CON_PDF.includes(String(c.estado))) return c.estado === "Propuesta" ? "Primero un administrador debe aprobar el precio" : `Una cotización ${String(c.estado ?? "").toLowerCase()} ya no se envía`;
  if(!(num(c.precioAprobado) > 0)) return "La cotización no tiene precio aprobado";
  if(!t(c.empresa)) return "Falta el cliente";
  return "";
}

export function datosCotizacionCliente(c: Cotizacion, o: OpcionesPdf): CotizacionCliente {
  const b = bloqueoPdf(c);
  if(b) throw new Error(b);
  const e = (c.entrada ?? {}) as Record<string, unknown>, r = c.resultado;
  const local = e.tipoRuta !== "nacional";
  const entregas = Math.max(1, Math.floor(num(e.entregas) || 1)), dias = Math.max(0, Math.floor(num(e.diasResguardo)));
  const unidad = r?.unidadNombre ? `${r.unidades || 1} × ${r.unidadNombre}` : "";
  const servicio = (local ? "Transporte local en la Zona Metropolitana de la Ciudad de México" : `Transporte a ${t(e.destino) || "destino por confirmar"}`) + (unidad ? ` · ${unidad}` : "");

  const carga = [
    e.modo === "Cajas" && num(e.cajas) ? `${fmt(num(e.cajas))} cajas` : "",
    r?.tarimas ? `${fmt(r.tarimas)} tarima(s)` : "",
    r?.pesoKg ? `${fmt(r.pesoKg)} kg` : "",
    r?.volumenM3 ? `${fmt(r.volumenM3)} m³` : "",
  ].filter(Boolean).join(" · ");

  const considera: string[] = [], porConfirmar: string[] = [];
  if(unidad) considera.push(`Unidad: ${unidad}.`);
  if(carga) considera.push(`Carga: ${carga}.`);
  considera.push(entregas > 1 ? `${entregas} puntos de entrega.` : "Un punto de entrega.");
  if(dias > 0) considera.push(`Resguardo de la mercancía: ${dias} día(s).`);
  if(r?.maniobra === true) considera.push(`Maniobra de carga y descarga con ${r.ayudantes || 1} ayudante(s).`);
  else if(r?.maniobra === false) considera.push("Carga y descarga sin ayudantes: con andén o montacargas.");
  else porConfirmar.push("Si en la carga y la descarga hace falta maniobra con ayudantes.");
  const anden = (v: unknown, lugar: string) => {
    if(v === "Sí") considera.push(`${lugar} con andén o montacargas.`);
    else if(v === "No") considera.push(`${lugar} sin andén ni montacargas.`);
    else porConfirmar.push(`Si hay andén o montacargas en el ${lugar.toLowerCase()}.`);
  };
  anden(e.origenAnden, "Origen"); anden(e.destinoAnden, "Destino");
  if(e.pisoAlto) considera.push("Entrega en piso alto o por escaleras.");
  if(e.fragil) considera.push("Mercancía frágil.");
  if(e.voluminosa) considera.push("Piezas voluminosas.");
  if(r?.tarimas){
    if(e.apilable === "Sí") considera.push("Las tarimas se pueden apilar.");
    else if(e.apilable === "No") considera.push("Las tarimas no se apilan.");
  }
  if(e.modo === "Cajas" && e.entarimada !== "Sí" && e.entarimada !== "No") porConfirmar.push("Si la mercancía viaja en tarimas o suelta.");
  if(!r?.pesoKg) porConfirmar.push("El peso total de la carga.");

  const vig = Math.floor(num(o.vigenciaDias));
  const precio = cent(num(c.precioAprobado)), iva = cent(precio * IVA_PCT / 100);
  return {
    folio: t(c.folio), fecha: fechaMx(o.ahoraMs), vigenteHasta: vig > 0 ? fechaMx(o.ahoraMs + vig * 86400000) : "",
    cliente: t(c.empresa), atencion: t(c.solicitante), contacto: t(c.contacto),
    servicio, carga, considera, porConfirmar,
    precio, iva, total: cent(precio + iva), ivaPct: IVA_PCT, nota: t(o.nota).slice(0, 800), atendio: t(o.atendio),
  };
}
