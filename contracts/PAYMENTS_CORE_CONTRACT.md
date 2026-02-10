# PAYMENTS CORE CONTRACT (v1) — FREEZE
Status: ACCEPTED
Mode: Provider-agnostic (provider not selected yet)
Rule: In this step NO DB changes, NO backend deploy.

## 1) Entities
### 1.1 Payment Intent
Purpose: request to charge client for booking/order.
Fields (required):
- intent_id (uuid)
- salon_id (int)
- master_id (int|null)
- booking_id (int|null)
- amount_cents (int > 0)
- currency (ISO-4217, default USD)
- status (enum)
- provider (string, default "generic")
- idempotency_key (string, unique)
- provider_intent_id (string|null)
- created_at, updated_at (timestamptz)

### 1.2 Payment Event (Webhook log)
Purpose: immutable audit + webhook idempotency.
Fields (required):
- event_id (uuid)
- intent_id (uuid|null)
- provider (string)
- event_type (string)
- event_external_id (string, unique per provider)
- payload (json)
- created_at (timestamptz)

### 1.3 Refund
Purpose: return money for succeeded payment.
Fields (required):
- refund_id (uuid)
- intent_id (uuid)
- amount_cents (int > 0)
- status (enum)
- provider_refund_id (string|null)
- created_at, updated_at (timestamptz)

## 2) Statuses (FREEZE)
### 2.1 Intent status enum
- created
- pending
- succeeded
- failed
- canceled

Allowed transitions:
- created -> pending | canceled
- pending -> succeeded | failed | canceled
Final (no transitions): succeeded, failed, canceled

### 2.2 Refund status enum
- requested
- succeeded
- failed
- canceled

Allowed transitions:
- requested -> succeeded | failed | canceled
Final: succeeded, failed, canceled

## 3) Idempotency (FREEZE)
### 3.1 Create Intent idempotency
- Client sends Idempotency-Key
- Server MUST return same intent for same key (no duplicates)

### 3.2 Webhook idempotency
- Unique key: (provider, event_external_id)
- Duplicate deliveries MUST NOT duplicate state changes

## 4) Webhook Security (FREEZE)
Headers required:
- X-Payment-Timestamp (unix seconds)
- X-Payment-Signature (hex)

Signing:
- signed_payload = timestamp + "." + raw_body
- signature = HMAC_SHA256(webhook_secret, signed_payload)

Validation:
- reject if |now - timestamp| > 300 sec
- reject if signature mismatch
- use RAW body (no re-serialize)

## 5) Logical API Surface (not implemented in this step)
- POST /payments/intent (requires Idempotency-Key)
- POST /payments/webhook (signature verify + event log + status updates)
- GET  /payments/intent/:id

## 6) Provider Requirements (for selection later)
Provider MUST:
- create payment/intent
- send webhooks: success, fail, cancel
- support refunds + refund status
- have stable event id (event_external_id) and retries
- support webhook signature verification

Non-goals (explicit):
- no provider integration now
- no DB migrations now
- no production deploy now
