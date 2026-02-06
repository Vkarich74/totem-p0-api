# PAYMENTS_BOOKING_MAPPING

Purpose:
Define strict mapping between Payment status
and Booking state transitions.

This document complements:
- Public Flow Contract (v1)
- PAYMENTS_CONTRACT.md
- PAYMENTS_STATUSES.md

---

## Mapping table

Payment status → Booking state

created
→ pending_payment

pending
→ pending_payment

paid
→ paid
→ completed (existing booking logic)

failed
→ pending_payment

canceled
→ cancelled OR expired
(depending on cancel reason / TTL)

---

## Rules

- Booking MUST NOT move to paid
  until Payment status = paid

- failed payment does NOT cancel booking
  booking stays in pending_payment

- canceled payment MAY:
  - cancel booking explicitly
  - or expire booking by TTL

- completed booking is OUT OF PAYMENT SCOPE

---

## Invariants

- One booking can have multiple payments
- Only ONE payment may reach paid
- paid payment is FINAL

End of document.
