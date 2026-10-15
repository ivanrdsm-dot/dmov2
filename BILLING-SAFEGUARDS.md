# Billing safeguards: staged rollout

This change creates internal requests, not CFDIs, and sends no email. It does not approve quotes, apply discounts, change the client catalog, migrate records, or deploy Firestore rules.

## Operator workflow

1. Open the budget or existing billing record. Select its exact client/project even if several entries share a legal entity.
2. Verify the legal entity and project plan against the approved case. Catalog values are suggestions, not authority. Correct the plan for this case or explicitly select **Sin plan**. No universal Campari/CCA override is introduced.
3. Enter the real service period explicitly; the export never substitutes the accounting month. Record the actual approval source and date. Confirm that evidence covers the current version, concepts and amounts. Editing those values invalidates the captured approval version.
4. A budget must already be **Aprobado**. Creating its internal request does not change approval status. Old Aprobado alone is insufficient.
5. Creating a request uses a stable budget-derived document ID and a transaction that writes the request and budget link together. Existing links, legacy requests or inconsistent records block new creation and require review. No automatic repair is performed.
6. Export validates every selected record first. Unknown project, mismatched company, unconfirmed plan, stale/missing approval, invalid totals, missing service or duplicate origin blocks the entire workbook. It never silently emits a partial batch.
7. The exported workbook remains a request. Sending it, sending a quote/invoice, or applying a discount requires the owner's separate approval.

## Compatibility and limits

- Existing records are not altered until explicitly saved. The editor preserves project ID and saved override. Legacy records missing verification must be reviewed before export.
- Source/date fields and confirmation record the operator's assertion; they do not independently retrieve or authenticate an approval email.
- Legacy accounting totals remain bookkeeping values, not proof of CFDI issuance. Newly typed internal requests are excluded from the existing accounting filters. UUID/document matching, cancellation verification and full historical reconciliation are a separate phase.
- Transactional uniqueness covers clients running this version. An older deployed/open client can still create random-ID records. The legacy preflight query is not a transactional collection-wide uniqueness constraint. Deploy only after approval, retire stale clients, and verify duplicate origins before rollout. Server-side invariants require a separately reviewed phase; no security-rule changes are included.
- Actual Firestore permissions, emulator contention and browser UI need staging validation. Mock transaction tests establish the callback's read/write/validation behavior, not live Firestore authorization or true concurrent infrastructure behavior.

## Verification and rollout gate

- Run npm ci, npm test, npm run typecheck and npm run build.
- In staging, verify: same legal entity with two projects; ordinary plan vs saved override; explicit no-plan; confirm then edit price/concept/IVA; repeated/concurrent clicks; missing approval; orphan link; whole-batch failure; editable unknown company blocked on export.
- Compare workbook B5 (company), B20 (client plan), B22 (actual service period), G24:G26 (amounts) with approved evidence before authorizing the first batch.
- No merge or deployment is included. Approve a staging rollout, validate with sanitized cases, then separately approve production. Rollback the application release if needed; do not delete or rewrite production requests as a rollback shortcut. SOL records remain internal requests.
