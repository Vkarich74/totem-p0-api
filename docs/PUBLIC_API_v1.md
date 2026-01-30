==================================================
CANCEL BOOKING (PUBLIC)
==================================================

POST /public/bookings/:id/cancel

Purpose:
- Cancel a booking
- Safe to call multiple times

IMPORTANT:
- Endpoint IS IDEMPOTENT
- Repeating the same cancel request does NOT cause an error
- Final state remains `cancelled`

Headers:
- Content-Type: application/json
- X-Public-Token: <token> (optional)

Request:
```json
{
  "reason": "client_request"
}
