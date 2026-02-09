# TOTEM — PAYMENT PROVIDER REQUIREMENTS
## Provider-Agnostic Acceptance Criteria

Status: **CANON**
Scope: **Provider Selection Gate**
Depends on:
- Financial Core (FROZEN)
- PAYMENT_FLOW_BINDING (CANON)

This document defines **hard requirements** for any external payment provider.
If a provider does not satisfy **ALL mandatory items**, it is **rejected**.
No exceptions.

---

## 0) Non-Negotiable Principles

1) Provider is **NOT** the source of truth for money.
2) Provider **MUST NOT** modify platform balances directly.
3) Provider **MUST** support idempotent operations.
4) Provider events **MUST** be verifiable, replayable, and deduplicated.
5) Provider integration **MUST** be an adapter, not a refactor.

---

## 1) Mandatory Capabilities (REQUIRED)

### 1.1 API Access (Hard)
- HTTPS API
- API-first (no UI-only flows)
- Programmatic payment creation
- Programmatic refunds
- Programmatic payment status query

❌ Redirect-only providers without API → REJECT

---

### 1.2 Webhooks (Hard)
- Webhooks for **final** events:
  - payment succeeded
  - payment failed
  - payment canceled
  - refund succeeded (if supported)
- Webhooks include:
  - unique event id
  - payment reference
  - amount
  - currency
  - event timestamp

Rules:
- Events may be duplicated → MUST be deduplicable
- Events may be delayed → MUST still finalize correctly
- Events may arrive out-of-order → MUST not break finality

❌ No webhooks → REJECT

---

### 1.3 Idempotency (Hard)
Provider must support **idempotency keys** for:
- payment creation
- capture / confirmation (if applicable)
- refund creation

Rules:
- Same idempotency key → same result
- Conflicting payload under same key → error

❌ No idempotency → REJECT

---

### 1.4 Payment Finality (Hard)
Provider must expose **clear final states**:
- success (funds captured/confirmed)
- failure
- cancellation
- expiration

Rules:
- Final state must not revert
- Partial states must be distinguishable from final

❌ Ambiguous states → REJECT

---

### 1.5 Amount & Currency Integrity (Hard)
- Provider returns **exact amount received**
- Provider returns **currency**
- No silent currency conversion without explicit flag

Rules:
- amount_received ≠ amount_requested must be detectable
- Over/under payments must be visible

❌ Hidden conversion or rounding → REJECT

---

## 2) Refund Support (REQUIRED)

- Programmatic refunds
- Refund webhook/event
- Refund finality

Rules:
- Refunds do NOT delete original payment
- Refunds create compensating ledger entries

❌ Manual-only refunds → REJECT

---

## 3) Security & Verification (REQUIRED)

### 3.1 Webhook Verification
Provider must support **at least one**:
- signature verification
- shared secret
- public key verification

❌ Unverifiable webhooks → REJECT

---

### 3.2 Event Payload Transparency
- Raw payload must be storable
- No encrypted-only blobs without metadata

Purpose:
- audit
- forensics
- dispute resolution

---

## 4) Marketplace / Split Payments (OPTIONAL)

Supported but **NOT REQUIRED**.

If present:
- platform may ignore split logic
- provider split ≠ ledger split

Rules:
- Platform ledger remains authoritative
- Provider split must not force business logic

---

## 5) Settlement & Reconciliation (REQUIRED)

Provider must allow:
- listing transactions by date
- listing transactions by reference
- settlement export (API or file)

Purpose:
- reconcile provider settlements vs ledger sums

❌ No reconciliation path → REJECT

---

## 6) Sandbox / Test Environment (REQUIRED)

- Sandbox environment or test mode
- Fake money / test cards / test accounts
- Deterministic behavior

❌ No sandbox → REJECT

---

## 7) Rate Limits & Reliability (REQUIRED)

- Published rate limits
- Reasonable retry strategy allowed
- Stable availability

Rules:
- Provider outages must not corrupt ledger
- Adapter must be able to retry safely

---

## 8) Legal / Compliance (OUT OF SCOPE, FLAG ONLY)

Provider SHOULD support:
- KYC / AML (provider-side)
- PCI compliance (provider-side)

Platform does NOT:
- store card data
- handle PCI scope directly

---

## 9) Explicit Rejection Criteria (FAST FAIL)

Provider is **immediately rejected** if ANY of the following are true:
- No webhooks
- No idempotency
- No refunds
- Ambiguous payment finality
- Provider modifies balances directly
- UI-only integration
- No sandbox

---

## 10) Evaluation Checklist (YES / NO)

| Requirement | Pass |
|------------|------|
| API-first | ⬜ |
| Webhooks | ⬜ |
| Idempotency | ⬜ |
| Final states | ⬜ |
| Refunds | ⬜ |
| Verification | ⬜ |
| Reconciliation | ⬜ |
| Sandbox | ⬜ |

Only **ALL YES** → provider allowed.

---

## 11) Final Rule

Provider selection is a **mechanical decision**:
- No provider-driven architecture changes
- No exceptions
- No “temporary hacks”

If provider fails this document → **choose another provider**.

---
