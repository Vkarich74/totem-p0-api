# US-PAY-C11 — Merchant Connect: integration completion boundary and deferred real-seller acceptance

**Decision date:** 2026-11-17
**Owner's decision:** Complete integration contracts and deployment preparation first. Do **not** create or register a synthetic salon/master as a substitute for a real merchant. Defer the first REAL MERCHANT CONNECTION acceptance until a genuine USA salon/master independently enrolls.

## Technical delivery completed on feature branches

- Backend PR #12: authenticated direct-owner salon/master consent; Standard connected-account creation (US only), one-time Stripe onboarding links, per-owner immutable LIVE account binding, verified capability readback. All operations are **disabled by default** in deployed services.
- SDK PR #7: authenticated US-only salon/master self-onboarding, explicit consent and safe Stripe redirect. KG/KZ remain outside the flow.
- Connect account lifecycle backend: default-disabled **POST /stripe/connect/us-pay-c11/live/account-events** raw webhook. HMAC-SHA256 signature and timestamp check, Stripe LIVE-only/Connect account match, verified direct Stripe API capability read (never trust webhook claims); revocation/restriction of already selected US booking collectors, append-only event ID deduplication and signed receipt. See `src/services/usPayC11LiveConnectWebhook.service.js` and `migrations/2026_11_17__us_pay_c11_live_connect_webhook_receipts.sql`.
- No PaymentIntent, charge, payout, transfer or payment-status write is performed by merchant onboarding. Booking payment controls remain disabled.

## REAL MERCHANT CONNECTION — explicitly deferred, NOT accepted

Stripe LIVE connected merchants = **0** on last read. No actual seller identity verification, independent representative consent, bank KYC, on-platform onboarding return, or real Stripe Connect signed `account.updated` event has occurred. Backend live key and webhook secret are not provisioned; a live webhook endpoint has NOT been registered because no persistent, production-approved merchant service is deployed. Never invent or borrow an unrelated Stripe account as proof.

The legitimate consent of an actual USA business is mandatory and cannot be provided by a platform operator on its behalf. Do not call a successful synthetic PostgreSQL test a real merchant connection.

**When a real salon/master joins** (single integrated acceptance, not repetitive artificial fixtures): authenticate real owner; ensure their US market / direct ownership; obtain express opt-in; complete Stripe-hosted KYC; verify that the stored connected account belongs to this approved owner and has active capabilities; receive its live signed Connect account event; confirm seller status + booking-recipient binding and absence of KG/KZ writes. This acceptance is intentionally postponed until an actual seller is available.

## Remaining infrastructure prerequisites (not a request to create a seller)

1. Real production/staging PostgreSQL schema compatibility reviewed against a current read-only schema snapshot and rollback/backup, then apply additive migrations in dependency order.
2. Pin correct TOTEM USA Stripe **LIVE** secret server-side, plus dedicated Connect live webhook signing secret and enable only the intended feature gates. Do not publish credentials in GitHub or Drive.
3. Deploy a persistent HTTPS Node.js backend with PostgreSQL and a Connect webhook endpoint, then register Stripe LIVE **connected-accounts** event destination for `account.updated` (and deauthorization as applicable) *after* endpoint is active. Existing Cloudflare TEST-only inbox is **not** a merchant LIVE settlement backend.
4. Support a real seller who **already owns a separate Stripe account** via independently authorized existing-account connection; current Standard flow creates a NEW connected account and the SDK warns existing merchants. Do not silently create duplicates. Determine supported authorization contract with the seller before enabling.
5. Actual LIVE PaymentIntent/checkout/merchant-specific signed payments/refunds are **a separate payment execution scope**, not implemented by this seller-connection stage.

## Hard gates

- **Merchant account provisioning:** OFF unless authenticated owner explicitly initiates consent. Do not programmatically create a LIVE connected account before this.
- **Payment acceptance:** OFF; no live charges, no fake payment `paid` state.
- **Production release:** NO-GO pending production schema/secret/endpoint readiness. Draft PRs are not deployed or merged.
- **Odoo, KG, KZ:** untouched.
- **Acceptance evidence:** earlier synthetic integration is engineering evidence only. A real-merchant acceptance starts only when a genuine consenting business is available.

**Current milestone:** LIVE MERCHANT CONNECTION CODE READY FOR INFRASTRUCTURE GATE; REAL MERCHANT TEST DEFERRED BY OWNER.
