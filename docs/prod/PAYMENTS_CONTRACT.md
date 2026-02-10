# PAYMENTS CONTRACT — TOTEM (CANON)

## STATUS
LOCKED / PROVIDER-AGNOSTIC

## CORE PRINCIPLE
Payment provider is a SOURCE OF EVENTS, never a source of business logic.

---

## ROLES

merchant_type:
- master (individual)
- salon (legal entity)

merchant_owner:
- master → master himself
- salon → salon owner

Only merchant_owner can initiate refund.

---

## CORE ENTITIES

payment_intent
- id
- booking_id
- merchant_type
- merchant_id
- amount
- currency
- status
- created_at

transaction
- id
- payment_intent_id
- external_tx_id
- provider
- status
- created_at

payment_event
- id
- provider
- event_id
- event_type
- status
- raw
- created_at

refund
- id
- payment_intent_id
- initiated_by
- reason
- status
- created_at

---

## PAYMENT LIFECYCLE (IMMUTABLE)

created
→ pending
→ paid
→ failed
→ refunded
→ canceled

No additional statuses allowed.

---

## RULES

- payment_intent always linked to booking
- booking may exist without payment
- payment cannot exist without booking
- refund never deletes transaction
- all changes are event-driven

END OF CONTRACT
