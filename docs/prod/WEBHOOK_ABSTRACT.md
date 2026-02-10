# WEBHOOK ABSTRACT — PROVIDER AGNOSTIC

## PURPOSE
Normalize all payment provider events into a single internal format.

---

## EVENT STRUCTURE

{
  "provider": "string",
  "event_id": "string",
  "event_type": "payment|refund|fail",
  "external_tx_id": "string",
  "amount": number,
  "currency": "string",
  "status": "pending|paid|failed|refunded",
  "raw": {}
}

---

## RULES

- event_id is idempotency key
- duplicate event_id must be ignored
- raw payload is stored AS IS
- business logic never reads raw
- webhook is NOT trusted input

---

## SECURITY

- signature validation required
- replay attacks must be rejected
- webhook never changes state directly

END
