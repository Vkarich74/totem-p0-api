# TOTEM USA — US-SERVICES-01 (Backend ↔ SDK contract)

**Scope:** authenticated US salon/master service creation and attachment.
**Status:** implementation + isolated tests PASS. Production schema audit and release E2E are separate acceptance gates.
**No changes to Odoo, live payments, bookings, Stripe charge, KG/KZ pricing or legacy booking flows.**

## Canonical routes

The existing authenticated internal API router mounts these endpoints:

| Method | Route | Meaning |
|---|---|---|
| GET | `/internal/us-service-links/:ownerType/:ownerSlug/options` | Read-only authorized master/salon/catalog choices |
| POST | `/internal/us-service-links/:ownerType/:ownerSlug` | Atomic creation or attachment with USD cents |
| GET | `/internal/us-service-prices/:ownerType/:ownerSlug/:serviceLinkId` | Independent authorized USD price confirmation (existing contract) |

`ownerType` is exactly `salon` or `master`; `ownerSlug` is the existing canonical slug. Both require the canonical session token and active session. There is no parallel authentication mechanism.

## Ownership and isolation (mandatory server checks)

1. **Salon**: the authenticated actor has role `salon_admin`, direct active `owner_salon` association with the exact slug, and that salon has an active US country/market with default currency USD.
2. **Master**: authenticated role `master` and `masters.user_id` match; master has an active relation to an active US/USD salon. The target salon is selected explicitly by `salon_slug`.
3. **Target**: exact `master_salon(salon_id, master_id)` row is active; both salon and master must be active; market `US`, country `US`, default currency `USD`; write access must not be blocked by billing.
4. **Salon attach source**: catalog service is already linked to an active master **inside that same salon**, using an active USD link in the US market. An unrelated US salon's catalog is not enumerable or attachable.
5. **Master attach source**: catalog service already belongs to that same master via an active US/USD link and active `master_salon` relation. A KG/KZ catalog service cannot be reused as a US source.
6. Caller-supplied identities are **selectors only**; the server resolves and rechecks them against the canonical DB records under transactional locks.

## Required JSON for POST

Exactly five fields; no extra properties or implicit salon selection.

Salon creates:
```json
{"operation":"create","master_id":46,"name":"Haircut","duration_min":45,"amount_minor":15025}
```

Salon attaches another master's service from the **same salon** to master 48:
```json
{"operation":"attach","master_id":48,"service_pk":6,"duration_min":45,"amount_minor":15025}
```

Master creates in an explicitly selected US salon:
```json
{"operation":"create","salon_slug":"chosen-us-salon","name":"Haircut","duration_min":45,"amount_minor":15025}
```

Master attaches their **own** active US catalog service:
```json
{"operation":"attach","salon_slug":"chosen-us-salon","service_pk":6,"duration_min":45,"amount_minor":15025}
```

`duration_min` is an integer 1–720. `amount_minor` is an integer 1–99,999,999 **USD cents**. Name must be trimmed and 1–160 characters. `service_pk` and `master_id` are safe positive integer IDs; the master's `salon_slug` must be a canonical slug.

No exchange rate or legacy price is accepted or inferred.

## Transaction and invariants

POST in one PostgreSQL transaction:

1. Validate exact active session, direct owner authorization, US market and explicit active target.
2. Check billing write availability; serialize operations for target salon.
3. For `attach`: prove source catalog identity with actor-dependent own-salon / own-master US scope.
4. For `create`: reject same normalized name+duration for same salon/master; insert global `services` identity.
5. Reject already attached `(salon_id,master_id,service_pk)` (including inactive old link — never silently reactivate).
6. Insert `salon_master_services` with `currency_code='USD'`, legacy `price=0` and explicit duration.
7. Insert `us_service_price_amounts` with current US market and user-provided minor USD amount; version starts at 1.
8. Read the exact stored link and USD cents/version back before returning `200` and committing.

Any failure, conflict or inconsistent readback must roll back the entire unit. The database's unique `(salon_id,master_id,service_pk)`, sidecar PK and USD price trigger remain authoritative.

The response includes `contract_version: "US-SERVICES-01-v1"`, `market_code: "US"`, `currency_code: "USD"`, `owner_type`, `owner_slug`, `salon_master_service_id`, `service`, `operation`, `readback_verified: true`, `booking_created: false`, `payment_performed: false`.

SDK **must** independently GET the existing US owner price endpoint after POST and verify identity, price and version. An unconfirmed or interrupted response is not retry-safe: refresh before any further POST.

## Fail-closed behavior and errors

| Status | Error | Meaning |
|---|---|---|
| 400 | `US_SERVICE_LINK_OWNER_INVALID`, `US_SERVICE_LINK_INPUT_INVALID` | Invalid route or body |
| 403 | `US_SERVICE_LINK_SESSION_REQUIRED`, `US_SERVICE_LINK_SESSION_INVALID` | Missing, foreign, revoked or expired session |
| 403 | `US_SERVICE_LINK_BILLING_BLOCKED` | Owner cannot write |
| 404 | `US_SERVICE_LINK_OWNER_NOT_FOUND`, `US_SERVICE_LINK_TARGET_NOT_FOUND` | Wrong owner/tenant/market/target |
| 404 | `US_SERVICE_LINK_SOURCE_NOT_FOUND` | Catalog service is not an authorized US source |
| 409 | `US_SERVICE_LINK_DUPLICATE`, `US_SERVICE_LINK_CONFLICT` | Existing attachment, duplicate or concurrent writer |
| 409 | `US_SERVICE_LINK_INTEGRITY_REJECTED` | Database rejected required contract |
| 503 | `US_SERVICE_LINK_STORAGE_UNAVAILABLE` | Storage error: no confirmed success |

Legacy US service writes through salon POST and master POST/PATCH/DELETE reject with `US_SERVICE_LINK_ENDPOINT_REQUIRED`; a master with **any active US salon relation** cannot use the legacy automatic "latest salon" POST even when their latest salon is KG. KG/KZ-only master routes keep existing behavior. When SDK market state is unknown, mutating controls are not displayed.

## Evidence and release gates

- Backend offline role/rollback/market/duplicate tests: `src/tests/usServiceLinkScoped.test.mjs`.
- Actual disposable PostgreSQL 17 tests, including a mixed US/KG master, wrong US salon, KG source rejection, same-salon reuse by another master: `tests/usServiceLinksPostgres.test.mjs`, `tests/sql/us_services_01_isolated_fixture.sql`.
- SDK Vite build and US model regression workflow: `.github/workflows/us-services-01.yml`.
- Read-only Production schema script: `audits/us-services-01-production-schema-read-only.sql` (tested on disposable DB, **not a Production PASS**).

**Release remains HOLD** until the real Production schema check reports no blocks and backups are verified. Sequence is Backend PR #27 → health and read-only verification → SDK PR #20 → authenticated owner GET/UI smoke. A Production service creation or booking/payment write requires separate authorization; do not call offline or synthetic tests "real user E2E". 
