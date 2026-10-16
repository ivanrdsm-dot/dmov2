# Monthly financial reconciliation: proposed, not activated

The exported costs register and P&L disagree. Group labels also conflict with service months in descriptions. Detailed amounts and source evidence are retained in the private audit package, not in application assets. No reassignment is safe based on labels alone. The export does not establish net/gross, tax, supplier identity or payment evidence. Months without captured costs cannot establish an actual margin.

## Minimal safe implementation
- Existing historical report values preserved; explicit provisional warning added to UI/export and removed blanket reconciled claim.
- `financialReconciliation.js` is an independently tested proposed evidence-only model, intentionally not connected to historical totals or production writes.
- Explicit servicePeriod YYYY-MM distinct from issuePeriod and cashPeriod; no guessed allocation.
- Integer cents, explicit currency, net + tax = gross. Unsupported currencies/credits/adjustments go to exceptions rather than implicit conversion.
- Revenue requires matching type-I fiscal document evidence; internal unbilled estimates remain separate. XML evidence does not mean SAT validation. Credit notes require a reviewed adjustment path before use.
- Cash requires transaction evidence and an independent cash date; paid status alone is insufficient.
- Expense requires evidence, verified classification and verified tax treatment. Transfers, capital, loan principal and tax settlement are excluded from operating expense only after classification verification; cash remains separately visible.
- Duplicate IDs, UUIDs or canonical source keys quarantine all copies, avoiding an arbitrary first-wins decision.
- Expected recurring obligations show missing coverage rather than creating costs. No completeness claim until a reviewed closing inventory exists.

## Integration prerequisites
1. Match original cost rows to source documents and service periods; record uncertainty explicitly.
2. Verify revenue document, service evidence, company/project/requester, credits/cancellations and cash independently.
3. Define monthly recurring obligation inventory with effective dates, verified amounts and evidence; include payroll and related contributions, rent, communications, maintenance, insurance, financing and taxes as applicable, never presumed amounts.
4. Explicit reviewed allocation for multi-month services; no automatic repartition from description.
5. Preserve immutable source and review trails. Existing archive does not yet constitute a complete reconciliation ledger.
6. Parallel-run reviewed model vs historical reports, publish exception/coverage lists, then authorize activation. No production data migrations in this change.
