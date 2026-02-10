# PAYMENT ↔ BOOKING LINK (CANON)

## CORE RULE
Every payment belongs to exactly one booking.

---

## STATES INTERACTION

booking.created
→ payment_intent.created

payment.paid
→ booking.confirmed

payment.failed
→ booking.released

payment.canceled
→ booking.released

payment.refunded
→ booking.canceled

---

## RESTRICTIONS

- booking cannot be confirmed without paid status
- refund does not remove booking
- booking history is immutable

END
