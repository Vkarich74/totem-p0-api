# BOOKING_STATES (Canonical)

Purpose:
Canonical booking lifecycle states for backend-driven system.
Frontend reflects states, never defines them.

---

## Canonical states

- draft
  Booking created but not confirmed. No service slot locked.

- pending_payment
  Booking confirmed, awaiting payment decision.
  Slot may be reserved by policy (TTL).

- paid
  Payment confirmed. Booking is financially secured.

- completed
  Service delivered. Final business state.

- canceled
  Canceled by client/owner/system before completion.

- expired
  System TTL expired (e.g., payment TTL or reservation TTL).

- no_show
  Client did not appear. Policy-defined outcome.

---

## Final states

Final states (no transitions out):
- completed
- canceled
- expired
- no_show

---

## Notes

- paid is NOT necessarily final (can go to completed or canceled by policy).
- expired is distinct from canceled: expired is TTL-driven.
- no_show is distinct from canceled: no_show happens at/after appointment time.
