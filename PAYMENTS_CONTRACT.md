# PAYMENTS — Public Flow Contract (v1)

## Actors
- Client (Widget)
- Public API
- Payment Provider (external)
- System API (webhook)

---

## Booking States
pending_payment → paid → completed
pending_payment → expired
pending_payment → cancelled

---

## Public Endpoints

### POST /public/payments/start
Start payment for booking.

**Input**
```json
{
  "booking_id": number,
  "return_url": string
}
