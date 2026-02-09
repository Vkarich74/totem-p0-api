# TOTEM — PAYMENT FLOW BINDING (Core → API) — Provider-Agnostic

Status: **CANON**
Scope: **Binding only**
Core: **FINANCIAL CORE is frozen**
Provider: **NOT selected / NOT required**

This document binds:
- API flows → Payment objects → Ledger application
- Payment status transitions (provider-neutral)
- Idempotency rules
- Failure and audit guarantees

NO provider SDK, NO keys, NO webhook vendor specifics.

---

## 0) Hard Invariants (Non-Negotiable)

1) **Ledger is the only source of truth** for money state.
2) Ledger is **append-only** (no updates, no deletes).
3) **No ledger entries are created** unless Payment is **PAID** (or equivalent final success).
4) Provider events may be delayed, duplicated, or out-of-order.
5) All write endpoints must be **idempotent**.
6) UI never computes money. UI renders API state.

---

## 1) Core Objects (Conceptual)

### 1.1 PaymentIntent
Represents an intent to take money for a business purpose.
- Created by API.
- Not money itself.
- Has expected amount/currency and a target beneficiary model (owner/master/platform).

### 1.2 Payment
Represents payment lifecycle state (provider-neutral).
- Bound to exactly one PaymentIntent.
- Provider reference is optional (until provider chosen).
- Status transitions are strictly controlled.

### 1.3 LedgerEntry
Append-only event that changes balances (wallet projections).
- Created **only by internal finalization step** when Payment becomes PAID.
- Never created by UI.
- Never created by provider adapter directly (adapter only normalizes events).

---

## 2) Payment Status Model (Provider-Neutral)

Allowed statuses:

- `CREATED` — Payment object exists, not started
- `PENDING` — payment initiated / waiting confirmation
- `PAID` — final success (money captured/confirmed)
- `FAILED` — final failure
- `CANCELED` — canceled by user/system before success
- `EXPIRED` — timed out
- `REFUND_PENDING` — refund initiated (optional)
- `REFUNDED` — refund confirmed (optional)

Rules:
- Final statuses: `PAID`, `FAILED`, `CANCELED`, `EXPIRED`, `REFUNDED`
- Once final → cannot move to another non-refund status.
- Refund statuses apply **only after** `PAID`.

---

## 3) Idempotency (Global)

### 3.1 Keys
- For any endpoint that creates a PaymentIntent/Payment: require `Idempotency-Key`.
- For provider events: derive `event_key` from provider event id (or computed hash).

### 3.2 Behavior
- Same idempotency key + same endpoint + same principal → returns same result.
- Conflicting payload under same idempotency key → `409 Conflict`.

---

## 4) Business Triggers (Where Payments originate)

This section defines canonical triggers. Provider does not matter.

### 4.1 Booking Deposit / Prepay (Optional)
Trigger: booking creation requires a prepayment.

API: `POST /payments/intents/booking`
Input:
- booking_id
- payer identity reference (public or auth user)
- amount/currency (or service price reference)
Output:
- payment_intent_id
- payment_id
- next_action (provider-agnostic placeholder)

### 4.2 Service Charge (After booking completion)
Trigger: service rendered, charge must be taken.

API: `POST /payments/intents/service`
Input:
- booking_id (completed)
- amount/currency
Output: payment_intent_id, payment_id

### 4.3 Wallet Top-up (If platform uses wallet funding)
API: `POST /payments/intents/topup`
Input:
- wallet_owner (owner/master)
- amount/currency
Output: payment_intent_id, payment_id

---

## 5) API Binding (Canonical Endpoints)

### 5.1 Create Payment Intent
`POST /payments/intents/*`

Auth:
- booking public flow may be allowed by backend policy
- otherwise requires auth; UI does not decide

Requirements:
- Idempotency-Key required
- Must return deterministic PaymentIntent + Payment

Response:
- `201 Created`
- includes: payment_intent_id, payment_id, status, amount, currency

Errors:
- `401/403` access denied
- `409` idempotency conflict
- `422` validation error

### 5.2 Get Payment State
`GET /payments/:payment_id`

Response:
- payment_id
- payment_intent_id
- status
- amount/currency
- timestamps
- (optional) provider_reference (opaque)

### 5.3 Cancel Payment (Only if not final)
`POST /payments/:payment_id/cancel`

Rules:
- Only allowed in `CREATED` or `PENDING`
- Idempotent cancel: repeated calls return same final cancel state

---

## 6) Finalization (Payment → Ledger)

This is the critical binding that preserves ledger purity.

### 6.1 Single Entry Point
Internal-only operation:
`POST /internal/payments/:payment_id/finalize`

Triggered by:
- provider event normalization pipeline (see section 7)
- or internal reconciliation job (read-only checks + finalize if safe)

### 6.2 Preconditions
- Payment status must be `PENDING` or `CREATED`
- Normalized event indicates final success
- No existing ledger entries exist for this payment_id

### 6.3 Actions (Atomic)
1) Set Payment status → `PAID`
2) Append ledger entries:
   - credit beneficiary wallet(s)
   - debit payer wallet (if internal) OR mark external settlement (provider-agnostic)
   - append fees entries (platform fee, provider fee if modeled)
3) Commit atomically

If any step fails:
- whole finalize fails
- no partial ledger writes
- return error, stays non-final until resolved

### 6.4 Postconditions
- Payment is `PAID`
- Ledger contains entries referencing payment_id/payment_intent_id
- Wallet projections reflect ledger

---

## 7) Provider Adapter Boundary (No provider required)

Provider adapter is a **thin normalization layer**:

### 7.1 Input
- External provider events (webhooks, callbacks, reconciliation export)

### 7.2 Output (Normalized Event)
Normalized event schema (canonical):
- event_key (unique)
- payment_reference (maps to payment_id)
- event_type: `PAYMENT_SUCCEEDED` | `PAYMENT_FAILED` | `PAYMENT_CANCELED` | `REFUND_SUCCEEDED` | ...
- occurred_at
- amount/currency
- raw (stored for audit, optional)

### 7.3 Rule
Adapter MUST NOT:
- write ledger
- calculate fees
- decide business meaning

Adapter MUST:
- only map provider event → normalized event
- call internal finalize/cancel/refund handler by event_type
- be idempotent by event_key

---

## 8) Refund Binding (Optional, Provider-Agnostic)

Refund is modeled as ledger compensation entries, not ledger edits.

### 8.1 Trigger
`POST /payments/:payment_id/refund`

Rules:
- Only allowed if Payment is `PAID`
- Creates refund intent, sets `REFUND_PENDING`

### 8.2 Completion
Normalized event `REFUND_SUCCEEDED` triggers:
- set Payment → `REFUNDED`
- append ledger entries reversing funds and fees per contract

---

## 9) Audit / Forensics Guarantees

1) Every Payment has immutable timeline (status transitions logged).
2) Every ledger entry references:
   - payment_id and/or payment_intent_id
   - actor/system id
   - reason code
3) All provider raw events can be stored in a separate audit log (append-only).
4) Reconciliation is possible:
   - provider settlements vs ledger sums by payment_reference.

---

## 10) Security Rules (Binding Level)

- Public can never see internal wallet balances or ledger raw entries.
- `GET /payments/:id` returns only safe fields for that principal.
- Any “owner/master access” is enforced by backend permissions, not UI.

---

## 11) Acceptance Criteria

This binding is DONE when:
1) It matches the frozen Financial Core model.
2) It does not assume any provider capabilities.
3) It defines the single lawful path: **PAID → finalize → ledger append**.
4) It supports SANDBOX testing without provider.
5) Provider integration later becomes an adapter, not a refactor.

---
