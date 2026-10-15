// Internal billing requests are not fiscal invoices. No catalog fallback is safe:
// the same legal entity can have several client/project plans.
const text = value => String(value ?? "").trim();
export function billingSnapshot(record) {
  return JSON.stringify([
    text(record._clienteId), text(record.empresa), text(record.planOverride || record.plan),
    record.sinPlan === true, text(record.cliente), text(record.servicio),
    (record.conceptos || []).map(c=>({desc:text(c.desc),cant:Number(c.cant)||0,precio:Number(c.precio)||0})), Number(record.subtotal), Number(record.ivaAmt), Number(record.total),
    text(record.approvalSource), text(record.approvalDate), text(record.periodoServicio),
  ]);
}

export function billingFields(record) {
  return {
    _clienteId: record._clienteId || "", plan: record.plan || "", periodoServicio: record.periodoServicio || "",
    planOverride: record.planOverride ?? "", sinPlan: record.sinPlan === true,
    billingConfirmed: record.billingConfirmed === true,
    approvalSource: record.approvalSource || "", approvalDate: record.approvalDate || "",
    approvalSnapshot: record.approvalSnapshot || "",
  };
}

export function resolveBilling(record, catalog) {
  const matched = catalog.find(client => client.id === record._clienteId);
  if (!matched) throw new Error("Selecciona explícitamente el cliente/proyecto del catálogo.");
  if (text(record.empresa).toLowerCase() !== text(matched.empresa).toLowerCase())
    throw new Error("La empresa no coincide con el cliente/proyecto seleccionado.");
  if (record.billingConfirmed !== true)
    throw new Error("Confirma empresa y plan contra el expediente aprobado.");
  const plan = text(record.planOverride || record.plan);
  if (record.sinPlan === true && plan)
    throw new Error("Sin plan no puede combinarse con un plan escrito.");
  if (record.sinPlan !== true && !plan)
    throw new Error("Escribe el plan verificado o confirma explícitamente Sin plan.");
  return { matched, plan: record.sinPlan === true ? "" : plan };
}

export function requireApproval(record) {
  const date=text(record.approvalDate);
  const parsed=new Date(date+"T00:00:00.000Z");
  const validDate=Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===date;
  if (!validDate || !text(record.approvalSource) || !/^\d{4}-\d{2}-\d{2}$/.test(text(record.approvalDate)) ||
      record.approvalSnapshot !== billingSnapshot(record))
    throw new Error("Falta evidencia de aprobación vigente: fuente, fecha y confirmación de esta versión.");
}

export function validateRequest(record, catalog) {
  const resolved = resolveBilling(record, catalog);
  requireApproval(record);
  if (!text(record.periodoServicio)) throw new Error("Falta el período real del servicio; no se infiere del mes de registro.");
  if (record.status === "Cancelada") throw new Error("La solicitud está cancelada.");
  if (!text(record.servicio)) throw new Error("Falta el concepto del servicio.");
  if (![record.subtotal, record.ivaAmt, record.total].every(v => Number.isFinite(Number(v))) ||
      Number(record.subtotal) <= 0 || Number(record.ivaAmt) < 0 ||
      Math.abs(Number(record.subtotal) + Number(record.ivaAmt) - Number(record.total)) > 0.02)
    throw new Error("Los importes de la solicitud no son válidos.");
  return resolved;
}

export function prepareRequest(budget, catalog, date, createdAt) {
  if (budget.status !== "Aprobado") throw new Error("El presupuesto debe estar aprobado antes de crear una solicitud.");
  resolveBilling(budget, catalog);
  requireApproval(budget);
  const request = {
    ...billingFields(budget), empresa: budget.empresa, solicitante: budget.contacto || "",
    servicio: (budget.conceptos || []).map(c => `${c.cant}× ${c.desc}`).join(" · "),
    subtotal: Number(budget.subtotal), ivaAmt: Number(budget.ivaAmt), total: Number(budget.total),
    iva: Number(budget.ivaAmt) > 0, status: "Solicitud interna", tipoDocumento: "solicitud_interna",
    mesOp: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][date.getMonth()],
    anio: date.getFullYear(), fechaEmision: "", fechaVenc: "",
    emailCliente: budget.emailCliente || "", notas: `Generada desde presupuesto ${budget.folio || ""}`,
    presupuestoOrigenId: budget.id, presupuestoOrigenFolio: budget.folio || "",
    cotizacionOrigenId: budget.cotizacionOrigenId || "", cotizacionOrigenFolio: budget.cotizacionOrigenFolio || "",
    presupuestoApprovalSnapshot: budget.approvalSnapshot,
    folio: "SOL-" + budget.id, createdAt,
  };
  request.approvalSnapshot = billingSnapshot(request);
  validateRequest(request, catalog);
  return request;
}

// Read both records before writing. Firestore retries on conflicts with either
// document, so double clicks, concurrent tabs and response loss reuse one link.
export async function convertBudgetTransaction(tx, budgetRef, requestRef, catalog, date, timestamp) {
  const budgetDoc = await tx.get(budgetRef);
  const requestDoc = await tx.get(requestRef);
  if (!budgetDoc.exists()) throw new Error("El presupuesto ya no existe.");
  const budget = { ...budgetDoc.data(), id: budgetRef.id };
  if (budget.convertidoAFacturaId)
    throw new Error("El presupuesto ya tiene una solicitud vinculada. Revisa ese expediente; no se creó otra.");
  if (requestDoc.exists())
    throw new Error("Existe una solicitud sin vínculo consistente. Revisa el expediente antes de continuar.");
  const request = prepareRequest(budget, catalog, date, timestamp);
  tx.set(requestRef, request);
  tx.update(budgetRef, { convertidoAFacturaId: requestRef.id, convertidoEn: timestamp });
  return { id: requestRef.id, existing: false };
}

export function validateBatch(records, catalog) {
  if (!records.length) throw new Error("No hay solicitudes para exportar.");
  const seen = new Set(), errors = [];
  records.forEach((record, index) => {
    const label = record.folio || record.id || `Registro ${index + 1}`;
    try {
      validateRequest(record, catalog);
      const key = record.presupuestoOrigenId || record.id || record.folio;
      if (key && seen.has(key)) throw new Error("Solicitud duplicada en el lote.");
      if (key) seen.add(key);
    } catch (error) { errors.push(`${label}: ${error.message}`); }
  });
  if (errors.length) throw new Error("No se exportó ningún registro. Corrige:\n" + errors.join("\n"));
}
