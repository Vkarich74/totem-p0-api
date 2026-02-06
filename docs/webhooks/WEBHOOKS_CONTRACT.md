# WEBHOOKS_CONTRACT

Purpose:
Single, provider-agnostic webhook contract.
Applies to payments, CRM, and future integrations.

---

## Endpoint

POST /system/webhooks/{source}

source examples:
- payments
- crm
- external

---

## Required headers

- X-Event-Id: string
- X-Event-Type: string
- X-Signature: string
- X-Source: string

---

## Body (raw)

- JSON payload from provider
- Stored verbatim for audit

---

## Idempotency

- Unique key: (X-Source + X-Event-Id)
- Duplicate deliveries MUST be accepted
- Processing MUST be exactly-once logically

---

## Ordering

- Event order is NOT guaranteed
- System MUST tolerate out-of-order events

---

## Response policy

- 2xx: accepted (even if already processed)
- 4xx: permanent rejection (signature, schema)
- 5xx: retryable error

End of document.
