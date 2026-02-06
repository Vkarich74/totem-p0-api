# BOOKING_TTL_POLICY

Purpose:
Define TTL/expiry rules that the system enforces.

---

## TTL types

1) Payment TTL
- Applies when state = pending_payment
- If TTL reached and no paid -> state becomes expired

2) Reservation TTL (optional)
- If slot reservation is used in pending_payment
- Same expiry outcome: expired

---

## System action on TTL expiry

When TTL triggers:
- booking: pending_payment -> expired
- payment (if exists and not paid): should end as canceled (see payments race rules)

---

## UX implications

- Frontend polls booking/payment and reacts to expired
- Frontend does NOT set timers as source of truth
