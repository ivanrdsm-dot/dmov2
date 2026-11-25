/* ═══════════════════════════════════════════════════════════════════════════
   IA (Claude) EN LA OPERACIÓN
   - leerTicketGasto: cada gasto que registra un chofer → Claude lee la foto del ticket (total, litros,
     fecha, gasolinera) y se compara contra lo que escribió el chofer. Si no cuadra → alerta.
   - resumenDiarioIA (21:00 CDMX) y oficinaResumenIA (botón del director): con los números del día YA
     calculados por el sistema, Claude escribe un resumen corto y 3 acciones para mañana.
   Los números los calcula el sistema; la IA solo LEE fotos y REDACTA. Nunca inventa datos.
   La llave vive en Secret Manager (ANTHROPIC_API_KEY). Sin llave (p. ej. en pruebas) no hace nada.
   ═══════════════════════════════════════════════════════════════════════════ */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { compararTicket } from "./lib/gasolina.js";

const CLAUDE = defineSecret("ANTHROPIC_API_KEY");
const MODELO = "claude-opus-5-5";
const BASE = { region: "us-central1", memory: "512MiB", timeoutSeconds: 120, secrets: [CLAUDE] };
const db = () => getFirestore();
const fechaCDMX = (ms = Date.now()) => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);
const llave = () => { try { return String(CLAUDE.value() || "").trim(); } catch { return ""; } };
/* Si Claude declina, el servidor de Anthropic reintenta solo con el modelo adecuado (fallbacks "default"). */
const RESPALDO = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

/* ── 1) Lectura del ticket ──────────────────────────────────────────────── */
const Ticket = z.object({
  esTicket: z.boolean().describe("true si la foto es un ticket o comprobante de pago"),
  legible: z.boolean().describe("true si se alcanzan a leer los montos"),
  total: z.number().nullable().describe("total pagado en pesos, sin signos; null si no se ve"),
  litros: z.number().nullable().describe("litros de combustible; null si no aplica o no se ve"),
  precioLitro: z.number().nullable().describe("precio por litro; null si no se ve"),
  fecha: z.string().nullable().describe("fecha del ticket en formato AAAA-MM-DD; null si no se ve"),
  hora: z.string().nullable().describe("hora del ticket HH:MM (24 h); null si no se ve"),
  establecimiento: z.string().nullable().describe("nombre de la gasolinera o negocio; null si no se ve"),
  nota: z.string().describe("una frase corta: algo raro en el ticket (tachones, editado, borroso) o 'sin observaciones'"),
});

export const leerTicketGasto = onDocumentCreated({ ...BASE, document: "gastosChofer/{id}", retry: false }, async ev => {
  const g = ev.data?.data();
  if(!g || g.origen !== "app chofer" || !g.ticketRuta || g.lecturaIA) return;
  const k = llave();
  if(!k) return;   // sin llave: no se lee (pruebas)
  const ref = ev.data.ref;
  try {
    const archivo = getStorage().bucket().file(g.ticketRuta);
    const [meta] = await archivo.getMetadata();
    const [buf] = await archivo.download();
    const tipo = /^image\/(jpeg|png|webp|gif)$/.test(meta.contentType || "") ? meta.contentType : "image/jpeg";
    const r = await new Anthropic({ apiKey: k }).beta.messages.parse({
      model: MODELO, max_tokens: 2000, ...RESPALDO,
      output_config: { effort: "low", format: betaZodOutputFormat(Ticket) },
      system: "Lees fotos de tickets de una empresa de logística en México. Copia exactamente lo que dice el ticket. Si un dato no se ve, ponlo en null: nunca lo adivines.",
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: tipo, data: buf.toString("base64") } },
        { type: "text", text: `El chofer dice que es un gasto de tipo "${g.tipo}". Extrae los datos del ticket.` },
      ] }],
    });
    if(r.stop_reason === "refusal" || !r.parsed_output){
      await ref.update({ lecturaIA: { ok: false, motivo: r.stop_reason === "refusal" ? "la IA no quiso leerlo" : "no se pudo leer", modelo: r.model, leidoEn: FieldValue.serverTimestamp() } });
      return;
    }
    const leido = r.parsed_output;
    const dudasIA = compararTicket({ monto: g.monto, litros: g.litros }, leido, fechaCDMX(g.fechaTs?.toMillis?.() || Date.now()));
    await ref.update({ lecturaIA: { ok: true, ...leido, modelo: r.model, leidoEn: FieldValue.serverTimestamp() }, dudasIA });
    if(dudasIA.length) await db().collection("alertas").add({ type: "gasto_dudoso", titulo: "Gasto o gasolina que no cuadra", atendida: false, ts: FieldValue.serverTimestamp(),
      choferId: g.choferId || "", choferNombre: g.choferNombre || "", gastoId: ev.params.id, ...(Number.isFinite(g.lat) ? { lat: g.lat, lng: g.lng } : {}),
      msg: `${g.choferNombre || "Chofer"} · ${g.tipo} $${g.monto}: según la foto, ${dudasIA.join("; ")}` });
  } catch(e){
    logger.warn("leer ticket", { gasto: ev.params.id, error: e?.message });
    await ref.update({ lecturaIA: { ok: false, motivo: "error al leer", leidoEn: FieldValue.serverTimestamp() } }).catch(() => {});
  }
});

/* ── 2) Resumen del día ─────────────────────────────────────────────────── */
const ms = v => v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0;
const hora = v => ms(v) ? new Date(ms(v)).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit" }) : "";

/** Junta los números del día (calculados aquí, no por la IA). */
export async function datosDelDia(fecha){
  const ini = Date.parse(fecha + "T00:00:00-06:00"), fin = ini + 86400000;
  const [jor, srv, gas, ale] = await Promise.all([
    db().collection("jornadas").where("fecha", "==", fecha).get(),
    db().collection("servicios").where("fechaServicio", "==", fecha).limit(200).get(),
    db().collection("gastosChofer").where("fechaTs", ">=", Timestamp.fromMillis(ini)).where("fechaTs", "<", Timestamp.fromMillis(fin)).limit(500).get(),
    db().collection("alertas").where("ts", ">=", Timestamp.fromMillis(ini)).where("ts", "<", Timestamp.fromMillis(fin)).limit(500).get()]);
  const choferes = jor.docs.map(d => { const j = d.data(); return { chofer: j.choferNombre, entrada: hora(j.checkInEn), llegoTarde: j.llegoTarde === true, minutosTarde: j.tardeMin || 0,
    lugarEntrada: j.lugarEntrada || "", salida: hora(j.checkOutEn) || "no ha cerrado", kmTablero: j.kmRecorridos ?? null, kmGps: j.kmGps ?? null, camioneta: j.unidadPlaca || "",
    dudasCheckIn: j.dudas || [], fueraDeCdmx: j.fueraDeCdmxEntrada === true }; });
  const rutas = srv.docs.map(d => d.data()).filter(s => s.choferId && !s.historico).map(s => ({ folio: s.folio, chofer: s.choferNombre, cliente: s.empresa, estado: s.estado,
    paradasEntregadas: s.paradasEntregadas ?? null, paradasConProblema: s.paradasConProblema ?? null, foranea: s.foraneo === true,
    ...(s.estado === "Cancelada" ? { motivoCancelacion: s.motivoCancelacion || "sin motivo registrado" } : {}) }));
  const gastos = gas.docs.map(d => d.data()).map(g => ({ chofer: g.choferNombre, tipo: g.tipo, monto: g.monto, litros: g.litros ?? null, precioLitro: g.precioLitro ?? null,
    rendimientoKmL: g.rendimientoKmL ?? null, dudas: [...(g.dudas || []), ...(g.dudasIA || [])] }));
  /* Las que se cerraron solas (la situación ya no aplica) no se reportan como problema. */
  const alertas = ale.docs.map(d => d.data()).filter(a => !a.informativa && a.resueltaSola !== true).map(a => ({ tipo: a.titulo || a.type, chofer: a.choferNombre || "", detalle: String(a.message || a.msg || "").slice(0, 200), atendida: a.atendida === true }));
  return { fecha, choferes, rutas, gastos, alertas,
    totales: { choferesTrabajaron: choferes.length, retardos: choferes.filter(c => c.llegoTarde).length, rutas: rutas.length,
      gastoTotal: Math.round(gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0) * 100) / 100, gastosQueNoCuadran: gastos.filter(g => g.dudas.length).length, alertasAbiertas: alertas.filter(a => !a.atendida).length } };
}

const SISTEMA_RESUMEN = `Eres el analista de operaciones de D Movimiento, una empresa de logística en la Ciudad de México. Escribes para el director de operaciones, que lo lee en su celular.
Reglas:
- Usa SOLO los datos que te doy. Si algo no está en los datos, no lo menciones. No inventes cifras, nombres ni causas.
- Español de México, directo, sin rodeos. Máximo 12 renglones en total. Texto simple: sin asteriscos, sin negritas ni formato markdown.
- Primero lo más importante: posibles engaños (gastos que no cuadran, ubicación o kilómetros dudosos), retardos y alertas sin atender.
- Si el día salió bien, dilo en una línea.
- Termina con "Para mañana:" y 3 acciones concretas (quién y qué).`;

async function generarResumen(fecha){
  const k = llave();
  if(!k) throw new HttpsError("failed-precondition", "Falta la llave de Claude en el sistema");
  const datos = await datosDelDia(fecha);
  if(!datos.choferes.length && !datos.rutas.length && !datos.gastos.length) return { fecha, vacio: true };
  const r = await new Anthropic({ apiKey: k }).beta.messages.create({
    model: MODELO, max_tokens: 4000, ...RESPALDO, output_config: { effort: "medium" },
    system: SISTEMA_RESUMEN,
    messages: [{ role: "user", content: `Datos del ${fecha} (ya calculados por el sistema):\n${JSON.stringify(datos)}` }],
  });
  if(r.stop_reason === "refusal") throw new HttpsError("internal", "La IA no generó el resumen");
  const texto = r.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  await db().doc("resumenes_ia/" + fecha).set({ fecha, texto, totales: datos.totales, modelo: r.model, creadoEn: FieldValue.serverTimestamp() });
  return { fecha, texto, totales: datos.totales };
}

/** Todos los días a las 21:00: resumen y aviso al celular del director. */
export const resumenDiarioIA = onSchedule({ ...BASE, schedule: "0 21 * * *", timeZone: "America/Mexico_City", retryCount: 0 }, async () => {
  if(!llave()) return;
  const r = await generarResumen(fechaCDMX());
  if(r.vacio || !r.texto) return;
  await db().collection("alertas").add({ type: "resumen_diario", titulo: "Resumen del día", informativa: true, atendida: true, ts: FieldValue.serverTimestamp(),
    msg: r.texto.replace(/\s+/g, " ").slice(0, 220) });
});

/** Botón del director: genera el resumen de un día cuando quiera. */
export const oficinaResumenIA = onCall(BASE, async req => {
  if(!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión");
  const p = await db().doc("dmov_usuarios/" + req.auth.uid).get();
  if(!p.exists || p.data().activo !== true || p.data().rol !== "admin") throw new HttpsError("permission-denied", "Solo el director");
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.data?.fecha || "")) ? req.data.fecha : fechaCDMX();
  return generarResumen(fecha);
});
