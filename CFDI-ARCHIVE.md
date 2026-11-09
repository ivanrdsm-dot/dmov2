# Private PDF/XML archive: staged, disabled by default

## Implemented

- The existing saved-record editor has a PDF/XML section. File review stays local until the operator explicitly confirms the pairing and presses Save.
- Native browser DOMParser reads CFDI 3.3/4.0 namespaces, UUID, issuer/receiver RFC, dates, amount/currency/type and relationships. DTD/entities/processing instructions are rejected before parsing. XML is limited to 4 MB; PDF to 10 MB and a PDF magic header.
- SHA-256 identifies both original byte streams. UUID and hash reservations are atomic and immutable in Firestore; repeated identical uploads resume the same pending reservation. A UUID cannot move to another record, and files are never silently replaced.
- The pair must match verified issuer/receiver RFC, expected currency and the saved total within one cent. Non-income CFDIs need a separate workflow. A human must confirm the PDF corresponds to the XML; this implementation does not parse PDF invoice contents.
- Unsaved invoice edits disable archiving. The saved invoice's company/project/requester/period/amount fingerprint is checked during reservation, retry and finalization. Once reserved, invoice identity fields and deletion are locked; payment notes/status remain editable. Archiving never marks a quote approved, a payment collected, an invoice valid, or a previous UUID cancelled.
- Authenticated byte downloads use Storage permissions. The application never requests public/shareable download-token links.

## What this is not

This extracts structural facts, not SAT authenticity. It does not validate the certificate/signature chain or XSD, query SAT status, prove a PDF matches its XML, scan PDF malware, or infer cancellation from a substitution relation. State remains `no_consultado`. Historical fiscal reconciliation is separate.

## Access and prerequisite companion fix

Initial access is limited to existing active `admin` office profiles with non-anonymous authentication. Operations users, inactive users, anonymous drivers and unauthenticated clients are denied. Operational image evidence retains existing access.

Storage's legacy catch-all read grant excludes `cfdi/`. Merely adding a private path rule would not override the old grant. Original objects allow creation only, with matching reservation/hash metadata and MIME/size constraints, and deny overwrite/delete.

The companion Firestore profile fix prevents users granting themselves role/activation. Self-signup creates an inactive operations profile using the verified authenticated email. Owners can update only name/PIN fields, and admin self-demotion/deactivation/deletion is blocked. Other active admins manage permissions. Automatic legacy email-based role claiming is removed; new Google UIDs require manual admin review. Existing active UID records are not migrated or edited.

## Validation

- Run `npm test`, `npm run typecheck`, `npm run build`.
- Run `npm run test:security` with Java 21. The command always targets `demo-dmov-archive` and localhost ports 8087/9197, never production.
- Security tests cover unauthorized/anonymous/driver denial, admin allow, no wildcard leakage, profile self-escalation, immutable originals, UUID/hash uniqueness, concurrent duplicate UUID, interrupted pair resume and unchanged image evidence access.
- Unit tests cover XML parser attacks and matching errors. Browser UI, real project IAM, deployment permissions and authenticated browser download CORS remain separate staging gates.

Rules enforce access, canonical reservations and immutable objects, but they do not inspect XML bytes or recompute SHA-256. Structural parsing, hash calculation and both-file completion checks run in the trusted office client. Server-attested content/signature validation is outside this phase.

## Activation gate

`VITE_CFDI_ARCHIVE_ENABLED` defaults off. Do not enable it until:

1. The owner explicitly approves the companion profile permission fix. Preparing this draft is not approval to deploy it.
2. Review the existing administrator inventory and identify at least one known valid current admin UID. Investigate any historical self-assigned privileged profiles; do not grant trust from this patch alone.
3. Deploy reviewed profile/registry and Storage rules through an authenticated, authorized project route. Cross-service Storage-to-Firestore evaluation may require Firebase service-agent access; do not grant additional IAM permissions implicitly.
4. Test staging and verified production permission boundaries, including denied anonymous reads of fiscal paths. Confirm bucket CORS supports authenticated `getBlob` from the intended app origin without issuing public tokens.
5. Enable the feature flag and deploy the application only after explicit rollout approval. A PR or preview is not production activation.

Do not upload fiscal files under `evidencias/`, embed them in Firestore, or use public-token links as a workaround. On failure, leave the pending reservation and retry the exact same pair; changed documents require review. Never delete files or rewrite canonical UUID links as a shortcut.

References: SAT CFDI namespace/TFD specifications at https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd and https://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd; Firebase Storage rules and emulator documentation at https://firebase.google.com/docs/reference/security/storage and https://firebase.google.com/docs/rules/unit-tests.
