# TOTEM USA — US-PAY-C11 LIVE infrastructure and existing Stripe account connection

**Date:** 2026-11-17
**Delivery:** executable Backend + SDK feature code and signed Connect merchant lifecycle handler; no real merchant generated.
**Production runtime:** **NO-GO** until the preflight conditions below are real and backed up.
**Real merchant acceptance:** **DEFERRED** by owner until the first genuine US salon/master.

## Production accounts and identities — verified from connected services

- LIVE Stripe platform: **TOTEM USA Connect**, `acct_1UcJO2GBhTJXwgwV`. The backend asserts `GET /v1/account` returns this account, has US country and card-processing capability.
- Connected LIVE sellers: **0** when last checked 2026-11-17.
- LIVE Stripe webhook endpoints: **0** when last checked 2026-11-17.
- Railway production: `peaceful-growth`, project `4a72b83e-1166-486a-9015-49f81547a6e6`, environment `18d52224-fec2-438f-b556-f52d0a3283ed`, API `9970c328-7a72-4c55-8c49-03252fa41baa`.
- Railway isolated staging: project `096d0f2b-ed27-4ba0-bd98-0721335ad3bc`, environment `1bd9c536-5fff-42f1-bea4-346871333406`, **0 services** at last read.
- Existing Cloudflare TEST-only HTTPS event inbox is **NOT** a LIVE merchant webhook or PostgreSQL payment backend.
- Railway API environment does **not** yet expose any `US_PAY_C11_LIVE_*` secrets/flags; do not invent them.

## Two separate legitimate LIVE seller choices

### A. Own a pre-existing US Stripe account (implemented; awaiting actual owner)

1. REAL authenticated owner, whose direct US salon/master authorization is independently checked against active, unrevoked `auth_sessions`, selects **existing**.
2. Explicit opt-in at `POST /internal/us-pay-c11/live-connect/:ownerType/:ownerId/oauth/start`; payload is only `{"consent":true}`. No user-entered Stripe ID, OAuth state, callback URL or KYC details.
3. Backend validates the key belongs to TOTEM USA Connect. Backend constructs short-lived random 256-bit state, stores **only SHA-256**, binding to the active session, real owner, US market, and single binding row; previous pending state is invalidated.
4. Redirect to `https://connect.stripe.com/oauth/authorize` with `scope=read_write`, Stripe client ID `ca_*`, and the EXACT pre-registered HTTPS callback:
   `https://api.totemv.com/stripe/connect/us-pay-c11/live/oauth/callback`.
5. After the owner explicitly authorizes within Stripe, Stripe sends a one-use 5-minute `code` and the state to the backend. The server atomically consumes the state **before** attempting token exchange. The exchange is **never retried**: Stripe warns a second use can revoke the connection.
6. Backend exchanges at Stripe using the LIVE platform secret, checks `livemode=true`, `read_write`, retrieves `stripe_user_id`, reads the connected Account from Stripe LIVE, requires Standard + US and actual account capabilities. It stores **neither access token nor refresh token nor code**.
7. A server transaction binds the resulting `acct_*` only to the original owner, with `connection_method='oauth_existing'` and immutable owner identity. A different TOTEM owner cannot claim this Stripe account.
8. The browser is redirected to `https://app.totemv.com/#/<salon|master>/<slug>/settings?us_connect=linked` — never with OAuth code/state/account ID.

### B. No Stripe account exists (previously implemented)

The same independently authenticated owner explicitly opts into a **new** Stripe Standard connected account, with idempotent server-driven creation and Stripe-hosted onboarding. The account gets `connection_method='new_standard'`. If an existing-account OAuth authorization is pending or completed, duplicate new-account provisioning is **blocked**. The SDK presents these choices distinctly.

Stripe Connect OAuth may reject accounts controlled by another platform for `read_write` authorization; this is a Stripe restriction, NOT evidence of a successful TOTEM connection.

## LIVE runtime configuration — server only; no credentials in GitHub or Google Drive

Deploy only after a current **read-only** production SQL schema audit and restorable backup, permission review and owner-authorized deployment. Environment setting names:

| Key | Gate / contractual purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Existing PostgreSQL; authenticated, TLS, least privileges |
| `US_PAY_C11_LIVE_STRIPE_SECRET_KEY` | LIVE Stripe secret belonging **only** to `acct_1UcJO2GBhTJXwgwV`; never copy from Sandbox or other Stripe accounts |
| `US_PAY_C11_LIVE_CONNECT_ENABLED` | `false` until LIVE SQL schema and platform/owner authorization are verified |
| `US_PAY_C11_LIVE_OAUTH_ENABLED` | `false` until OAuth settings and real callback are ready |
| `US_PAY_C11_LIVE_OAUTH_CLIENT_ID` | **actual** Stripe Connect LIVE `ca_*` client ID from TOTEM USA Connect OAuth settings |
| `US_PAY_C11_LIVE_CONNECT_WEBHOOK_SECRET` | LIVE `whsec_*` of the registered **connected-account** webhook |
| `US_PAY_C11_LIVE_CONNECT_WEBHOOK_ENABLED` | `false` until endpoint registered and reachable; no LIVE writes until approved |

Do not activate a flag without its paired secret, schema and real endpoint. No keys or owner personal data in CI logs.

## HTTPS routes and Stripe LIVE Dashboard configuration

- Existing account owner start: `POST /internal/us-pay-c11/live-connect/:ownerType/:ownerId/oauth/start` (session required).
- Existing account OAuth callback: `GET https://api.totemv.com/stripe/connect/us-pay-c11/live/oauth/callback` (Stripe redirect with one-time code + state, server verifies stored session).
- Seller status: `GET /internal/us-pay-c11/live-connect/:ownerType/:ownerId` (session required).
- Seller refresh: `POST /internal/us-pay-c11/live-connect/:ownerType/:ownerId/refresh` (session required).
- New seller onboarding: `POST /internal/us-pay-c11/live-connect/:ownerType/:ownerId/start` (session + express consent).
- LIVE Connect signed merchant lifecycle: `POST https://api.totemv.com/stripe/connect/us-pay-c11/live/account-events`, strict RAW HMAC. Listen to **connected account** `account.updated` (and application deauthorization when event account mapping is confirmed). Do **not** register before running Backend supports and the correct whsec is stored; the existing TEST webhook is not interchangeable.
- Stripe LIVE Dashboard Connect/OAuth settings must include the callback URI exactly. The live client ID must be obtained from the actual TOTEM USA Connect settings, not guessed.

## Production PostgreSQL migrations (additive only, in order)

**Required prerequisite:** current actual PostgreSQL schema, constraints and owner auth ownership relations verified READ ONLY; restorable backup generated and checked. CI synthetic PostgreSQL fixtures are **not** a substitute.

1. `migrations/2026_11_17__us_pay_c11_price_collector_sidecars.sql`
2. `migrations/2026_11_17__us_pay_c11_collector_selection_audit.sql`
3. `migrations/2026_11_17__us_pay_c11_stripe_test_event_sidecars.sql` — existing C11 read service SQL references these isolated tables even in LIVE; disable TEST runtime flags.
4. `migrations/2026_11_17__us_pay_c11_live_seller_onboarding.sql` — includes immutable `connection_method` discriminator.
5. `migrations/2026_11_17__us_pay_c11_live_connect_webhook_receipts.sql`
6. `migrations/2026_11_17__us_pay_c11_live_existing_oauth.sql`

Never apply synthetic `tests/sql/*` to Production; never overwrite existing payment/finance tables.

## Boundaries and acceptance

**Done in code:** authenticated seller consent, new Standard and existing Standard OAuth, immutable LIVE binding, one-time OAuth state, signed account-lifecycle event receiver, narrow US booking collector verification, SDK owner UI, default-disabled feature gates.

**Evidence, not real live sign-off:** GitHub Actions disposable PostgreSQL17 + actual Node/Express/SDK acceptance and mocked Stripe external transport. This proves code contracts only.

**Still blocked until operationally completed:**
- Verified LIVE OAuth configuration/client ID, a real LIVE Stripe secret for TOTEM USA Connect and registered webhook signing secret.
- Restorable production backup and real schema-compatibility pass.
- A persistent publicly reachable API + PostgreSQL release with correctly mounted LIVE routes and webhook, plus owner-approved deployment.
- Actual connected-account and signed webhook acceptance **only with the FIRST REAL, CONSENTING US SALON/MASTER**, as expressly deferred by project owner.
- Real payment intent, signed payment status, charge/refund and payout flows are a **SEPARATE PAYMENT EXECUTION SCOPE**. This merchant binding milestone does not make payments live.

**Hard stop:** no real seller present; never fabricate a merchant. Stripe account creation, KYC, LIVE charges and payouts are not to be triggered merely to claim a PASS.
