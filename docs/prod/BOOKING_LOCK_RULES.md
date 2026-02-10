# BOOKING & CALENDAR HARDENING — CANON

## PURPOSE
Prevent race conditions, double bookings and inconsistent states.

---

## CORE RULES

1. One master cannot have overlapping bookings.
2. Booking creation acquires a time-slot lock.
3. Lock is released only by:
   - payment failure / timeout
   - explicit cancellation
4. Paid booking is immutable in time.
5. Calendar is global per master (cross-salon).

---

## STATES

created
→ pending_payment
→ confirmed
→ canceled
→ expired

---

## TIMEOUT POLICY
- pending_payment timeout: configurable
- on timeout → booking.expired → slot released

---

## FORBIDDEN
- manual override of confirmed booking
- parallel writes to same slot
- frontend-side conflict resolution

END
