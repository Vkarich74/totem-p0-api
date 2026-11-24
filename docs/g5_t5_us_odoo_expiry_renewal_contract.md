# G5-T5 — Odoo SaaS entitlement, expiry and renewal on EXISTING Core

Date: 2026-11-24. **Source prepared in GitHub DRAFT, NO DEPLOY, NOT PRODUCTION-READY.**

## Authority and schema
Odoo Online company 4/site 5 remains the ONLY billing authority for US SaaS; never charge the Core wallet or reuse booking Stripe as SaaS subscription proof. The existing `public.billing_subscriptions` with UNIQUE(owner_type,owner_id) is a **projection**, not another billing ledger. DDL was verified directly on Production PostgreSQL using read-only statements. The additive `migrations/g5_us_odoo_billing_projection_v1.sql` adds only nullable, typed provider/source/billing-proof columns to this SAME table and scoped constraints/indexes; historic un-attributed 4 wallet_only=true rows are preserved. Migration has **NOT** been applied to Production, nor successfully run in a disposable PostgreSQL database in this step.

## Full files
- `src/services/billing/usSaasEntitlementProjection.js`: exact UTC half-open paid period and 5-minute evidence freshness, source/partner/company/site/role/policy match, fail-closed missing billing rows or untrusted/expired/refunded/bad status; no grace/trial unless separately approved. Core PostgreSQL `clock_timestamp()` used at evaluation. Writes Odoo proof to the existing billing table inside **T3 canonical activation transaction**, rejects overwriting legacy wallet rows or unrelated owners. Verified Odoo renewal lineage can extend this SAME owner without reactivation or welcome; reversal blocks existing owner without deleting identity.
- `src/services/billing/usSaasReconciliation.js`: explicit privileged readback BEFORE PostgreSQL lock, source recheck and transaction commit, same business ID, no new owner/master/lead/email. Provides candidate query but **does not schedule any worker**.
- `src/middleware/usSaasCommercialGuard.js`: mounts early for owner-scoped internal mutation routes; checks trusted owner and Odoo billing access; legacy Core subscription charge and unblock blocked for typed US even when active. Preserves GET/auth and owner noncommercial preferences.
- FULL existing `src/routes/internal.js`, `src/services/entry/entryAccess.js`, `src/middleware/resolveTenant.js`, `src/routes/internal/salons.js`, `src/routes/internal/masters.js`, `src/routes/internal/finance-engine.js`: scoped server access checks, public bookings and availability, and wallet auto-recovery exclusion `provider_namespace IS NULL` for legacy writer.
- FULL existing `src/services/usServiceLink.service.js` and `src/routes/internalUsMasterManualBooking.js`: bypass protection for US service linking and manual booking, requiring paid owner/master and salon where appropriate.
- FULL existing `src/services/provision/ownerOpeningCanonicalActivation.js` and `src/services/provision/usPaidOwnerOpeningGate.js`: US projection is part of same canonical Core activation transaction after Odoo paid readback; renewal parent `sale.order.subscription_id` retrieved server-side, not from the event body.
- FULL existing `src/routes/internal/adminOpenOwner.js`: same protected Admin routing, optional `/requests/:id/billing-reconcile` gated by BOTH US approved-feature flags OFF by default. No new public webhook or second registration.
- `tests/g5-us-saas-expiry-legacy.test.mjs` and adjusted `tests/g5-owner-opening-paid-activation.unit.test.mjs` for isolated tests.

## Exact technical behavior
**New US owner without valid verified paid Odoo entitlement**: owner registration and Odoo portal/renewal remain separate and open, but commercial Core writes, public booking and availability are denied. A missing `billing_subscriptions` row can NEVER silently mean active for US. An old un-attributed legacy owner row cannot be overwritten to create US rights.

**Paid US owner**: eligible only if typed source identity and owner ID/role/partner + approved commercial policy + Odoo source matches, row is active, not revoked, wallet_only=false, USD, period_start <= database clock < period_end, and verification time is <= 5 minutes old. The amount/customer invoice period/actual payment is proven in T2, before the projection is written in T3.

**Expiry/cancellation/refund**: immediately fail closed on sensitive business access at precise UTC cutoff; no reliance on Odoo's weekly expiry cron. Definitive verified Odoo reversal readback can block the existing row. API outage/unknown status never grants new rights; stale existing proof loses effective access after the 5-minute policy freshness cap.

**Renewal**: only server-confirmed same-partner, same-company/site linked subscription parent, paid evidence and policy may extend the same owner row; never re-provision, create a second lead, unlock via wallet or resend welcome. Historical KG/KZ owners remain under previous business rules, without US Odoo payment requirements.

## Verification, known limitations, Release HOLD
**31/31 T5 isolated Node mock tests PASS**, plus **17/17 previous T3 unit regression PASS** on the T5 changes. `node --check` PASS for all full edited JavaScript files. No actual PostgreSQL INSERT/COMMIT concurrency or real Odoo paid renewal/chargeback test was done. Production PostgreSQL DDL was **read-only** verified to confirm exact baseline columns, UNIQUE and status checks, including 4 historical wallet rows. No production database/Odoo/Stripe/Gmail writes.

**Critical release blockers**:
1. Reconciliation candidate query is prepared but not registered as an enabled recurring job/worker in the existing `async_jobs`. Thus time-based **denial** is source-level immediate, but **automatic periodic refresh/renewal is NOT operational**. With a 5-minute cache TTL a paid US account would fail closed until a trusted readback; do not enable T5 early.
2. The initial route guard covers owner-scoped internal writes, public entry/public bookings, US service links and US manual booking, but **a complete route-by-route audit of money-core, payouts, settlement, tax/payment and administrative actions has NOT passed**. Only release on full write-path guard coverage, without blocking permitted refunds, Odoo portal or customer care.
3. Additive SQL migration has not been executed or verified under real isolated PostgreSQL, and T3/T4 real PostgreSQL transaction concurrency QA is still NOT PASS from earlier Windows PG18 instability.
4. No approved commercial policy for prices/service-period semantics. Odoo product #29 and Stripe provider #32 are not published; company4 paid US orders/invoices zero in last authorized read. Real Odoo renewal/chargeback E2E is unavailable.
5. T6 operator Admin queue, full US/KG regression, missing billing row/market identity negative checks, backup, restore and owner release approval are outstanding. CRM automation 14 OFF; US intake 409 HOLD; NO Production deploy or merge.

**Status**: T5 full source and mock QA prepared, not a functioning deployed subscription gate and not a release-ready financial contract. Continue with T6 and final end-to-end QA before merge, migration or deployment.
