# BOOKING_TRANSITIONS (Rules)

Purpose:
Deterministic transition rules for booking states.

---

## Allowed transitions

draft -> pending_payment
draft -> canceled

pending_payment -> paid
pending_payment -> canceled
pending_payment -> expired

paid -> completed
paid -> canceled
paid -> no_show

completed -> (final)
canceled  -> (final)
expired   -> (final)
no_show   -> (final)

---

## Forbidden transitions (examples)

- any -> draft
- completed -> anything
- expired -> anything
- no_show -> anything
- canceled -> anything
- pending_payment -> completed (must be paid first)
- pending_payment -> no_show (must reach appointment time policy gate)

---

## Actor permissions (high-level)

Client (widget):
- can request cancel while state in: pending_payment, paid (if policy allows)
- cannot force paid/completed/no_show/expired

Owner/Admin:
- can cancel in: draft, pending_payment, paid (policy)
- can complete only when: paid
- can mark no_show only when: paid and after appointment time

System:
- can expire only when: pending_payment and TTL reached
- can enforce no_show rules by schedule policy

---

## Invariants

- Booking becomes paid only via Payment = paid (see payments docs)
- State changes are backend-only
- One booking cannot be both completed and canceled/expired/no_show
