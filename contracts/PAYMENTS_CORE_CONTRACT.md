# PAYMENTS CORE CONTRACT — FREEZE

Provider: NOT SELECTED
DB changes: NONE
Backend changes: NONE

ENTITIES
- PaymentIntent
- PaymentEvent (webhook log)
- Refund

STATUSES
Intent: created → pending → succeeded | failed | canceled
Refund: requested → succeeded | failed | canceled

IDEMPOTENCY
- intent: Idempotency-Key
- webhook: (provider, event_id)

WEBHOOK SECURITY
- HMAC signature
- timestamp window ±5 min
