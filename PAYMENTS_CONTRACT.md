# PAYMENTS_CONTRACT

Purpose:
Bridge contract between Public Payment Flow and Internal Payment Domain.
Does NOT replace Public Flow Contract (v1).
Defines guarantees and boundaries.

Scope:
- How public payment actions map to internal Payment entity
- What frontend can expect
- What backend guarantees

---

Relation to Public Flow Contract (v1):

- POST /public/payments/start
  - creates internal Payment entity
  - links Payment to booking_id
  - sets initial status: created

- Booking state:
  - pending_payment while Payment != paid
  - paid when Payment = paid
  - expired / cancelled when Payment = canceled

---

Frontend guarantees:

- Frontend can:
  - start payment
  - poll payment status
  - cancel payment if allowed

- Frontend cannot:
  - change payment status
  - see provider-specific data
  - access secrets or webhook data

---

Backend guarantees:

- Backend is the only authority for:
  - payment creation
  - status transitions
  - TTL and expiration
  - mapping provider events to canonical statuses

- Backend guarantees:
  - idempotent payment creation
  - idempotent webhook handling
  - finality of paid status

---

Out of scope:

- Provider selection
- Payment UI implementation
- Refund logic
- Accounting logic

This contract is provider-agnostic and stable.
