# BOOKING_RACE_CONDITIONS

Purpose:
Resolve conflicts deterministically when events arrive late or concurrently.

---

## Priority rules

1) completed is final and wins over any late cancel/expire requests
2) paid has priority over expired (late payment can revive from pending_payment only if policy allows)
3) system expiry applies only while state = pending_payment
4) cancellation applies only if booking not final

---

## Late payment vs expired

Case:
- booking expired due to TTL
- payment paid arrives late

Rule (default safe):
- paid DOES NOT revive expired booking
- payment is handled by provider policy (refund/void later when provider exists)

(If business wants revive, it must be explicitly enabled as policy change.)

---

## Cancel vs complete

Case:
- owner completes while client cancels at same time

Rule:
- if completion persisted first -> completed wins
- else -> canceled wins
- no oscillation; one final write

---

## No-show vs cancel

Case:
- client cancels near appointment time

Rule:
- if appointment time passed + grace window passed -> no_show wins
- else cancel allowed (policy-dependent)

---

## Idempotency

- repeated state-change requests must be idempotent
- backend rejects invalid transitions with stable error codes
