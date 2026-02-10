# PAYMENTS AUDIT & LOGGING

## CORE PRINCIPLE
All payment data is append-only.

---

## LOGGING RULES

- no DELETE operations
- all timestamps in UTC
- all events stored
- source field required

source:
- api
- webhook
- manual

---

## AUDIT REQUIREMENTS

- full event history per payment
- traceable refund chain
- external_tx_id preserved
- provider name stored

END
