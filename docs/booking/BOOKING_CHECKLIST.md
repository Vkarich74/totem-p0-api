# BOOKING_CHECKLIST

Purpose:
Final readiness checklist for booking lifecycle.

This checklist must be satisfied
before scaling, payments integration, or heavy async usage.

---

## State model

- [ ] Canonical booking states defined
- [ ] Final states explicitly marked
- [ ] No implicit transitions exist

---

## Transitions

- [ ] Allowed transitions documented
- [ ] Forbidden transitions documented
- [ ] Actor permissions defined (client / owner / system)

---

## Payments integration

- [ ] Booking becomes paid only via Payment = paid
- [ ] Failed payment does not cancel booking
- [ ] Late payment vs expired policy defined

---

## TTL & system actions

- [ ] Payment TTL defined
- [ ] Reservation TTL defined (if used)
- [ ] System expiry behavior documented

---

## Race conditions

- [ ] Cancel vs complete resolved
- [ ] Late payment handled
- [ ] No-show vs cancel resolved
- [ ] Idempotency rules defined

---

## Error handling

- [ ] Stable error codes defined
- [ ] Frontend relies on codes, not messages
- [ ] Invalid transitions return deterministic errors

---

## Frontend guarantees

- [ ] Frontend does not mutate booking state
- [ ] Frontend reacts only to backend state
- [ ] Reload-safe UX

---

## Operational readiness

- [ ] Logs capture state transitions
- [ ] Final states are immutable
- [ ] Rollback strategy defined (manual if needed)

End of checklist.
