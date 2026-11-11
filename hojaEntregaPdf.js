/* Genera el PDF de la hoja de entrega con la marca de D Movimiento.
   jsPDF se carga bajo demanda: no pesa en el arranque de la app. */
import { datosHojaEntrega } from "./hojaEntrega.ts";

const AZUL = [4, 37, 82], NARANJA = [242, 123, 19], GRIS = [96, 112, 128];

export async function descargarHojaEntrega(servicio, paradas){
  const h = datosHojaEntrega(servicio, paradas);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const ancho = pdf.internal.pageSize.getWidth(), M = 40;
  pdf.setFillColor(...AZUL); pdf.rect(0, 0, ancho, 78, "F");
  pdf.setFillColor(...NARANJA); pdf.rect(0, 78, ancho, 5, "F");
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.text("D Movimiento", M, 38);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(11); pdf.text("Logística", M, 56);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.text(h.titulo, ancho - M, 36, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(11); pdf.text(h.folio, ancho - M, 56, { align: "right" });

  let y = 112;
  const dato = (etiqueta, valor, x) => { pdf.setTextColor(...GRIS); pdf.setFontSize(8); pdf.text(etiqueta.toUpperCase(), x, y); pdf.setTextColor(12, 24, 41); pdf.setFontSize(11); pdf.text(String(valor || "—"), x, y + 14, { maxWidth: (ancho - 2 * M) / 2 - 10 }); };
  const mitad = M + (ancho - 2 * M) / 2;
  dato("Cliente", h.cliente, M); dato("Solicitó", h.solicitante, mitad); y += 40;
  dato("Fecha del servicio", h.fechaServicio, M); dato("Unidad y operador", [h.unidad, h.chofer].filter(Boolean).join(" · "), mitad); y += 40;
  dato("Carga", h.carga, M); dato("Resultado", `${h.resumen.entregadas} de ${h.resumen.paradas} paradas entregadas${h.resumen.incidencias ? ` · ${h.resumen.incidencias} con incidencia` : ""}`, mitad); y += 44;

  autoTable(pdf, { startY: y, margin: { left: M, right: M },
    head: [["#", "Punto", "Tipo", "Resultado", "Recibió", "Cantidad", "Hora", "Evidencia"]],
    body: h.filas.map(f => [f.n, f.punto, f.tipo, f.resultado, f.recibio || "—", f.cantidad || "—", f.hora || "—", f.evidencia || "—"]),
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" }, headStyles: { fillColor: AZUL, textColor: 255 }, alternateRowStyles: { fillColor: [244, 247, 251] },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 150 } } });
  y = (pdf.lastAutoTable?.finalY ?? y) + 22;
  if(!h.completa){ pdf.setTextColor(...NARANJA); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text("Documento parcial: " + h.pendientes.join(" · "), M, y); y += 18; }
  pdf.setTextColor(...GRIS); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
  pdf.text(`Las horas y los cierres fueron registrados por el sistema de D Movimiento. ${h.resumen.fotos} foto(s) de evidencia en expediente.`, M, y, { maxWidth: ancho - 2 * M });
  pdf.text(`Generado el ${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`, M, pdf.internal.pageSize.getHeight() - 28);
  pdf.save(`Hoja-de-entrega-${h.folio || "servicio"}.pdf`);
  return h;
}
