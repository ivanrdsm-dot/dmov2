/* PDF de la cotización para el cliente, con la marca de D Movimiento.
   jsPDF se carga bajo demanda. Los datos vienen de cotizacionCliente.ts, que
   solo deja pasar lo que el cliente puede ver. */
import { datosCotizacionCliente } from "./cotizacionCliente.ts";

const AZUL = [4, 37, 82], NARANJA = [242, 123, 19], GRIS = [96, 112, 128], TINTA = [12, 24, 41];
const pesos = n => "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function descargarCotizacionPdf(cotizacion, opciones){
  const d = datosCotizacionCliente(cotizacion, opciones);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const ancho = pdf.internal.pageSize.getWidth(), alto = pdf.internal.pageSize.getHeight(), M = 40, util = ancho - 2 * M;
  pdf.setFillColor(...AZUL); pdf.rect(0, 0, ancho, 78, "F");
  pdf.setFillColor(...NARANJA); pdf.rect(0, 78, ancho, 5, "F");
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.text("D Movimiento", M, 38);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(11); pdf.text("Logística", M, 56);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.text("Cotización", ancho - M, 36, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(11); pdf.text(d.folio, ancho - M, 56, { align: "right" });

  let y = 112;
  const mitad = M + util / 2;
  const dato = (etiqueta, valor, x) => { pdf.setTextColor(...GRIS); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.text(etiqueta.toUpperCase(), x, y);
    pdf.setTextColor(...TINTA); pdf.setFontSize(11); pdf.text(String(valor || "—"), x, y + 14, { maxWidth: util / 2 - 10 }); };
  dato("Cliente", d.cliente, M); dato("Fecha", d.fecha, mitad); y += 40;
  dato("Atención", [d.atencion, d.contacto].filter(Boolean).join(" · "), M); dato("Vigencia", d.vigenteHasta ? `Hasta el ${d.vigenteHasta}` : "", mitad); y += 46;

  autoTable(pdf, { startY: y, margin: { left: M, right: M },
    head: [["Servicio", "Importe"]],
    body: [[d.servicio + (d.carga ? `\n${d.carga}` : ""), pesos(d.precio)]],
    foot: [["Subtotal", pesos(d.precio)], [`IVA ${d.ivaPct} %`, pesos(d.iva)], ["Total", pesos(d.total)]],
    styles: { fontSize: 10, cellPadding: 7, overflow: "linebreak", textColor: TINTA },
    headStyles: { fillColor: AZUL, textColor: 255 }, footStyles: { fillColor: [244, 247, 251], textColor: TINTA, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 120 } },
    didParseCell: h => { if(h.section === "head" && h.column.index === 1) h.cell.styles.halign = "right";
      if(h.section === "foot"){ h.cell.styles.halign = "right"; if(h.row.index === 2){ h.cell.styles.fillColor = NARANJA; h.cell.styles.textColor = 255; } } } });
  y = (pdf.lastAutoTable?.finalY ?? y) + 24;

  const nuevaPagina = alto_ => { if(y + alto_ > alto - 60){ pdf.addPage(); y = 50; } };
  const lista = (titulo, items, color = TINTA) => {
    if(!items.length) return;
    nuevaPagina(30); pdf.setTextColor(...AZUL); pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text(titulo, M, y); y += 16;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(...color);
    for(const it of items){ const l = pdf.splitTextToSize("• " + it, util); nuevaPagina(l.length * 13); pdf.text(l, M, y); y += l.length * 13 + 2; }
    y += 10;
  };
  lista("Esta cotización considera", d.considera);
  lista("Por confirmar antes del servicio", d.porConfirmar);
  lista("Condiciones", [
    "Precios en pesos mexicanos. El IVA se desglosa por separado.",
    "Si la carga, los puntos o las condiciones de carga y descarga cambian, el precio se recalcula.",
    ...(d.nota ? [d.nota] : []),
  ]);
  pdf.setTextColor(...GRIS); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
  pdf.text(`${d.atendio ? `Atendió: ${d.atendio} · ` : ""}Generado el ${new Date(opciones.ahoraMs).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`, M, alto - 28);
  pdf.save(`Cotizacion-${d.folio}.pdf`);
  return d;
}
