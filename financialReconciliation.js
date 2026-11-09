/** Evidence-only management reconciliation. Never infers accounting treatment from status,
 * category, payment, UUID text alone, or a legacy enBalanza flag. Amounts are cents. */
const month = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const cents = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const evidence = value => typeof value === 'string' && value.trim().length > 0;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function reconcileMonth({period, currency = 'MXN', entries = [], expectedRecurring = []}) {
  if (!month(period)) throw new Error('Periodo de servicio YYYY-MM requerido');
  const result = {period, currency, revenueNet:0, costsNet:0, provisionalRevenueNet:0,
    collectionsGross:0, disbursementsGross:0, excluded:[], issues:[], accepted:[], missingRecurring:[],
    partialResultNet:0, complete:false, satValidated:false};
  const issues = (entry, reason) => result.issues.push({id:entry.id || null, reason});
  // Quarantine every member of a duplicate group, including conflicting copies.
  const keys = entries.map(e => [e.id && `id:${e.id}`, e.kind === 'revenue' && uuid(e.uuid) && `uuid:${e.uuid.toUpperCase()}`,
    e.sourceKey && `source:${e.sourceKey}`].filter(Boolean));
  const counts = new Map(); keys.flat().forEach(k => counts.set(k,(counts.get(k)||0)+1));
  const recurring = new Set();
  entries.forEach((e,index) => {
    // Cash period is independent of service/issue period; never derive it from paid status.
    if (e.cashPeriod === period) {
      if (e.cashVerified === true && evidence(e.cashEvidence) && cents(e.cashGross) && e.currency === currency && !keys[index].some(k=>counts.get(k)>1)) {
        if (e.cashDirection === 'in') result.collectionsGross += e.cashGross;
        else if (e.cashDirection === 'out') result.disbursementsGross += e.cashGross;
        else issues(e,'invalid_cash_direction');
      } else issues(e,'unverified_cash');
    }
    if (!month(e.servicePeriod)) { issues(e,'missing_service_period'); return; }
    if (e.servicePeriod !== period) return;
    if (!e.id || !e.sourceKey || keys[index].some(k=>counts.get(k)>1)) { issues(e,'duplicate_or_missing_identity'); return; }
    if (e.currency !== currency) { issues(e,'currency_not_reconciled'); return; }
    if (e.cancelled === true || e.superseded === true) { result.excluded.push({id:e.id, reason:'cancelled_or_superseded'}); return; }
    if (['transfer','capital','loan_principal','tax_settlement'].includes(e.kind)) {
      if (e.classificationVerified !== true || !evidence(e.evidence)) { issues(e,'unverified_classification'); return; }
      result.excluded.push({id:e.id,reason:e.kind}); return;
    }
    if (!cents(e.net) || !cents(e.tax) || !cents(e.gross) || e.net + e.tax !== e.gross) { issues(e,'invalid_net_tax_gross'); return; }
    if (e.kind === 'provisional_revenue') {
      result.provisionalRevenueNet += e.net; issues(e,'provisional_unbilled'); return;
    }
    if (e.verified !== true || !evidence(e.evidence)) { issues(e,'missing_evidence'); return; }
    if (e.kind === 'revenue') {
      if (!uuid(e.uuid) || e.documentMatched !== true || e.documentType !== 'I') { issues(e,'unmatched_revenue_document'); return; }
      result.revenueNet += e.net;
    } else if (e.kind === 'cost') {
      if (e.classificationVerified !== true || e.taxTreatmentVerified !== true) { issues(e,'unverified_cost_treatment'); return; }
      result.costsNet += e.net;
      if (e.recurringKey) recurring.add(e.recurringKey);
    } else { issues(e,'unsupported_adjustment_or_kind'); return; }
    result.accepted.push(e.id);
  });
  result.missingRecurring = expectedRecurring.filter(e=>e.period===period && !recurring.has(e.key)).map(e=>e.key);
  result.partialResultNet = result.revenueNet - result.costsNet;
  // Even zero exceptions cannot prove completeness without a separately reviewed closing inventory.
  return result;
}
