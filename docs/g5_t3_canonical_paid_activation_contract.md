# G5-T3 — canonical paid activation: implementation / source contract

Status: **DRAFT SOURCE, NO DEPLOY, NOT PRODUCTION READY**. Date: 24 Nov 2026.

## Execution result

The existing protected `POST /internal/admin/open-owner/requests/:id/activate`
now delegates to a single transaction service
`src/services/provision/ownerOpeningCanonicalActivation.js`.
It does not create a second registration flow, callback endpoint, billing ledger or new user.

The existing AdminRuntimeGuard mount and market policy remain in force. The
current Odoo-US intake 409 HOLD and CRM automation 14 OFF remain unchanged.

## How the new paid gate works

`src/services/provision/usPaidOwnerOpeningGate.js` performs server-side
readback through the existing T2 Odoo `search_read` client **before** any
PostgreSQL transaction. It will not read commercial evidence from an HTTP
request body or a webhook status. It requires an existing owner opening row
with approved typed company4/site5 Odoo source, partner, request, role and
provisioned Core identity. Exactly one matching subscription order is
allowed. Ambiguous orders wait for verified renewal lineage.

It has TWO independent defaults to HOLD:
1. `TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED` must be `true`.
2. `TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON` must be a separately approved
   plan / SKU / paid-period mapping / allowed role coverage contract.
   Neither is enabled by this source change.

Odoo API connection settings use server-only `TOTEM_US_ODOO_URL`,
`TOTEM_US_ODOO_DB`, `TOTEM_US_ODOO_USER`, `TOTEM_US_ODOO_API_KEY`.
No credential or billing configuration is stored in this repository.

After T2 verifies a **posted+paid** linked invoice and the approved paid
service interval, it produces a short-lived proof tied to the exact Core
request id, created owner, auth user, original Odoo source id, partner,
market, role, order/invoice ids and the period cutoff. The proof is not
directly accepted from an Odoo event or browser request.

## Exactly one Core business transaction

The shared canonical helper creates its own PostgreSQL `BEGIN`,
acquires `SELECT ... FOR UPDATE` on the existing
`public.owner_opening_requests`, and revalidates the paid proof against
the **locked** row and database `clock_timestamp()`. A proof older than 10
seconds or expired at the exact UTC cutoff is rejected. Odoo HTTP is NEVER
called with this transaction open.

The helper reuses the existing `assertAdminOpeningMarketPolicy`,
`assertUsActivationReady`, `activateOwnerOpeningEntity` and
`writeOwnerOpeningAuditEvent` callbacks. The owner/salon or master entity,
US `auth_users.enabled`, request status `activated` and the audit event
are committed together; failure triggers rollback. Subsequent calls to
an already activated request return its existing state without repeating
entity creation or email. This service does not itself send Gmail.

Typed `odoo_online` sources can NEVER masquerade as KG/KZ through a stale
market field; the helper fails closed. Legacy KG activation is preserved
without requiring a US Odoo payment.

The authenticated Odoo renewal/expiry event worker (future T5) can call
the SAME canonical helper, but no new HTTP route and no fake Admin JWT are
created in this T3 change.

## Full source files

- `src/routes/internal/adminOpenOwner.js` — full-file replacement,
  one existing `/activate` route only, payment preflight before execution.
- `src/services/provision/ownerOpeningCanonicalActivation.js` — shared
  transaction service, no external network calls inside SQL transaction.
- `src/services/provision/usPaidOwnerOpeningGate.js` — server-side paid
  evidence and role/ownership/US source check with default HOLD.
- `tests/g5-owner-opening-paid-activation.unit.test.mjs` — 17 no-DB
  unit tests for source checks, roles, cutoff, preflight, rollback path and
  route delegation. **17/17 PASS; full JS syntax PASS**.
- `tests/g5-owner-opening-paid-activation.test.mjs` — dedicated actual
  PostgreSQL integration suite prepared but **NOT PASSED**: the isolated
  Windows PostgreSQL 18 subprocess crashed/restarted the AS-Work agent
  during execution. Local PostgreSQL test process was stopped and
  temporary files cleaned. No PG integration PASS may be claimed.

## Unfinished mandatory release gates

**Do not merge or deploy T3 separately.** The commercial amount/product
publication/payment provider is not approved and no US paid invoice
exists. No Odoo payment push or protected reconciliation entrypoint was
enabled. The existing Core billing projection does not yet enforce
fail-closed US paid business writes (T5); welcome email send is not yet
atomic (T4). T6 Admin UI and full KG/US integration/rollback QA are
unverified. Cross-system refund/chargeback may occur between readback
and commit, so paid-access expiry/revocation must be enforced on actual
business routes in T5; a 10-second preflight is not sufficient by itself.

T3 source-only is complete enough to review, **not** a production release
contract. Confirm isolated transaction/concurrency tests in a stable
PostgreSQL environment before any source merge or Railway deployment.

## Source and documentation

Everything durable: existing TOTEM USA Google Drive G5-T contract and this
GitHub draft PR. AS-Work used only transient source files and PostgreSQL
fixtures, not permanent project archives. No changes to live Odoo, CRM,
Stripe, Gmail, production PostgreSQL, Railway, SDK or business entities.
