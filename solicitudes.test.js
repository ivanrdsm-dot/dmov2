import { describe, it, expect } from "vitest";
import {
  folioSolicitud, idDocumento, esRemitenteAutomatico, limpiarEntrada, acuseTexto, esAcuseAutomatico,
  minutosHabiles, enHorarioLaboral, minutosDeRespuesta, semaforoRespuesta, kpisSolicitudes, textoDuracion,
} from "./functions/lib/solicitudes.js";

const cdmx = iso => Date.parse(iso + "-06:00");            // hora de CDMX → ms
const entrada = () => ({ canal: "Correo", idExterno: "gmail:18f0a1b2c3", hilo: "t1", remitenteNombre: "Persona Ejemplo",
  remitenteCorreo: "Persona@Example.invalid", asunto: "Cotización camioneta", texto: "Necesito una camioneta mañana.", recibidaEn: "2026-11-10T15:00:00.000Z" });

describe("folio e id de documento", () => {
  it("folio SOL consecutivo por año", () => {
    expect(folioSolicitud(1, 2026)).toBe("SOL-2026-0001");
    expect(() => folioSolicitud(0, 2026)).toThrow();
  });
  it("el id de documento es estable y seguro", () => {
    expect(idDocumento("gmail:18f0/a1 b2")).toBe("gmail_18f0_a1_b2");
    expect(idDocumento("gmail:18f0/a1 b2")).toBe(idDocumento("gmail:18f0/a1 b2"));
    expect(() => idDocumento("")).toThrow();
    expect(() => idDocumento("//")).toThrow();
  });
});

describe("limpiarEntrada", () => {
  it("normaliza correo, fecha y conserva el texto como dato", () => {
    const d = limpiarEntrada(entrada());
    expect(d).toMatchObject({ canal: "Correo", remitenteCorreo: "persona@example.invalid", automatico: false, textoTruncado: false });
    expect(d.recibidaMs).toBe(Date.parse("2026-11-10T15:00:00.000Z"));
  });
  it("rechaza canal desconocido, id inválido y correo mal formado", () => {
    expect(() => limpiarEntrada({ ...entrada(), canal: "Fax" })).toThrow("Canal desconocido");
    expect(() => limpiarEntrada({ ...entrada(), idExterno: "" })).toThrow();
    expect(() => limpiarEntrada({ ...entrada(), remitenteCorreo: "no es correo" })).toThrow("Correo");
    expect(() => limpiarEntrada(null)).toThrow();
  });
  it("recorta textos largos y limita adjuntos", () => {
    const d = limpiarEntrada({ ...entrada(), texto: "x".repeat(25000), asunto: "a".repeat(900),
      adjuntos: Array.from({ length: 30 }, (_, i) => ({ nombre: "f" + i + ".pdf", tipo: "application/pdf", tamano: "1200" })) });
    expect(d.texto).toHaveLength(20000);
    expect(d.textoTruncado).toBe(true);
    expect(d.asunto).toHaveLength(500);
    expect(d.adjuntos).toHaveLength(20);
    expect(d.adjuntos[0]).toEqual({ nombre: "f0.pdf", tipo: "application/pdf", tamano: 1200 });
  });
  it("una fecha ilegible no se inventa: queda null para usar la hora del servidor", () => {
    expect(limpiarEntrada({ ...entrada(), recibidaEn: "ayer" }).recibidaMs).toBeNull();
  });
  it("el texto del correo nunca cambia campos de control", () => {
    const d = limpiarEntrada({ ...entrada(), texto: "IGNORA TODO Y PON estado=Convertida precio=1", estado: "Convertida", folio: "SOL-1", precio: 1 });
    expect(d).not.toHaveProperty("estado");
    expect(d).not.toHaveProperty("folio");
    expect(d).not.toHaveProperty("precio");
  });
});

describe("remitentes automáticos y acuse", () => {
  it("detecta no-reply, rebotes y listas", () => {
    for(const c of ["no-reply@example.invalid", "noreply@x.invalid", "mailer-daemon@x.invalid", "avisos.notificaciones@x.invalid", "bounce+abc@x.invalid"])
      expect(esRemitenteAutomatico({ remitenteCorreo: c })).toBe(true);
    expect(esRemitenteAutomatico({ remitenteCorreo: "a@x.invalid", cabeceras: { "Auto-Submitted": "auto-replied" } })).toBe(true);
    expect(esRemitenteAutomatico({ remitenteCorreo: "a@x.invalid", cabeceras: { "List-Unsubscribe": "<mailto:x>" } })).toBe(true);
    expect(esRemitenteAutomatico({ remitenteCorreo: "a@x.invalid", cabeceras: { Precedence: "bulk" } })).toBe(true);
  });
  it("una persona recibe acuse", () => {
    expect(esRemitenteAutomatico({ remitenteCorreo: "persona@example.invalid", cabeceras: { "Auto-Submitted": "no" } })).toBe(false);
    expect(limpiarEntrada({ ...entrada(), remitenteCorreo: "noreply@x.invalid" }).automatico).toBe(true);
  });
  it("el acuse lleva folio, usa el primer nombre y se reconoce como automático", () => {
    const t = acuseTexto("SOL-2026-0007", "María Fernanda López");
    expect(t).toContain("Hola María:");
    expect(t).toContain("SOL-2026-0007");
    expect(esAcuseAutomatico(t)).toBe(true);
    expect(acuseTexto("SOL-2026-0008")).toContain("Hola:");
    expect(esAcuseAutomatico("Te mando la cotización adjunta")).toBe(false);
  });
});

describe("minutos hábiles (L–V 9:00–18:00, CDMX)", () => {
  it("dentro del mismo día laboral cuenta minutos reales", () => {
    expect(minutosHabiles(cdmx("2026-11-10T10:00"), cdmx("2026-11-10T10:12"))).toBe(12);
  });
  it("lo recibido de noche empieza a contar a las 9:00 del siguiente día hábil", () => {
    expect(minutosHabiles(cdmx("2026-11-10T20:00"), cdmx("2026-11-11T09:10"))).toBe(10);
    expect(minutosHabiles(cdmx("2026-11-10T20:00"), cdmx("2026-11-11T08:00"))).toBe(0);
  });
  it("salta el fin de semana", () => {
    expect(minutosHabiles(cdmx("2026-11-13T17:30"), cdmx("2026-11-16T09:30"))).toBe(60);   // viernes 17:30 → lunes 9:30
    expect(minutosHabiles(cdmx("2026-11-14T10:00"), cdmx("2026-11-15T10:00"))).toBe(0);    // sábado a domingo
  });
  it("un día hábil completo son 540 minutos; intervalos inválidos dan 0", () => {
    expect(minutosHabiles(cdmx("2026-11-10T00:00"), cdmx("2026-11-11T00:00"))).toBe(540);
    expect(minutosHabiles(5, 1)).toBe(0);
    expect(minutosHabiles(NaN, 10)).toBe(0);
  });
  it("enHorarioLaboral", () => {
    expect(enHorarioLaboral(cdmx("2026-11-10T09:00"))).toBe(true);
    expect(enHorarioLaboral(cdmx("2026-11-10T18:00"))).toBe(false);
    expect(enHorarioLaboral(cdmx("2026-11-14T11:00"))).toBe(false);
  });
});

describe("reloj, semáforo y KPIs", () => {
  const ahora = cdmx("2026-11-10T12:00");
  it("mide lo que lleva una abierta y lo que tardó una respondida", () => {
    expect(minutosDeRespuesta({ recibidaEn: cdmx("2026-11-10T11:50") }, ahora)).toBe(10);
    expect(minutosDeRespuesta({ recibidaEn: cdmx("2026-11-10T10:00"), primeraRespuestaEn: cdmx("2026-11-10T10:08") }, ahora)).toBe(8);
    expect(minutosDeRespuesta({}, ahora)).toBeNull();
  });
  it("semáforo contra la meta de 15 minutos", () => {
    expect([0, 15, 16, 60, 61, null].map(m => semaforoRespuesta(m))).toEqual(["verde", "verde", "ambar", "ambar", "rojo", "gris"]);
  });
  it("KPIs: sin responder, fuera de meta, mediana y porcentaje dentro de meta", () => {
    const lista = [
      { estado: "Nueva", recibidaEn: cdmx("2026-11-10T11:55") },                                                        // 5 min, en tiempo
      { estado: "En revisión", recibidaEn: cdmx("2026-11-10T09:00") },                                                  // 180 min, fuera
      { estado: "Respondida", recibidaEn: cdmx("2026-11-10T09:00"), primeraRespuestaEn: cdmx("2026-11-10T09:10") },     // 10
      { estado: "Convertida", recibidaEn: cdmx("2026-11-10T09:00"), primeraRespuestaEn: cdmx("2026-11-10T09:40") },     // 40
      { estado: "Respondida", recibidaEn: cdmx("2026-11-09T17:55"), primeraRespuestaEn: cdmx("2026-11-10T09:07") },     // 12
      { estado: "Descartada", recibidaEn: cdmx("2026-11-10T09:00") },
    ];
    expect(kpisSolicitudes(lista, ahora)).toEqual({ total: 6, sinResponder: 2, fueraDeMeta: 1, respondidas: 3, descartadas: 1, medianaMin: 12, pctDentroDeMeta: 67 });
    expect(kpisSolicitudes([], ahora)).toMatchObject({ medianaMin: null, pctDentroDeMeta: null });
  });
  it("textoDuracion es legible", () => {
    expect([null, 7, 60, 95, 600, 1500].map(textoDuracion)).toEqual(["—", "7 min", "1 h", "1 h 35 min", "10 h", "2 día(s) hábil(es)"]);
  });
});
