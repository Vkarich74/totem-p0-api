# TOTEM — PUBLIC API v1 (CANONICAL)

Status: STABLE  
Environment: PROD  
Base URL:
https://totem-p0-api-production.up.railway.app

---

## 1. Availability

GET /public/availability

Query parameters:
- salon_slug (string, required)
- master_slug (string, required)
- service_id (string, required)
- date (YYYY-MM-DD, required)

Response 200:
{
  "date": "2026-02-10",
  "slots": ["10:00","11:00","12:00","13:00"]
}

Errors:
- 400 INVALID_INPUT
- 404 NOT_FOUND
- 500 INTERNAL_ERROR

---

## 2. Create Booking

POST /public/booking/create

Body:
{
  "salon_slug": "totem-demo-salon",
  "master_slug": "test-master",
  "service_id": "srv1",
  "date": "2026-02-10",
  "start_time": "10:00",
  "request_id": "optional-idempotency-key"
}

Response 200:
{
  "booking_id": 76,
  "status": "pending_payment",
  "request_id": "optional-idempotency-key"
}

Notes:
- Idempotent by request_id
- Initial status is always pending_payment

---

## 3. Booking Result

GET /public/booking/{booking_id}/result

Response 200:
{
  "booking_id": 76,
  "status": "pending_payment"
}

Errors:
- 400 INVALID_INPUT
- 404 NOT_FOUND

---

## 4. Cancel Booking

POST /public/booking/{booking_id}/cancel

Response 200:
{
  "ok": true,
  "booking_id": 76,
  "status": "cancelled"
}

Errors:
- 400 BOOKING_NOT_CANCELLABLE
- 400 INVALID_BOOKING_ID

---

## 5. Payment Intent

POST /public/payments/intent

Body:
{
  "booking_id": 76,
  "provider": "demo",
  "amount": 1000
}

Response 200:
{
  "ok": true,
  "intent": {
    "id": 18,
    "booking_id": 76,
    "provider": "demo",
    "amount": 1000,
    "status": "pending",
    "is_active": true
  }
}

Rules:
- One active payment per booking
- Previous active payment is deactivated automatically

---

## 6. Public SDK

GET /public/sdk.js

Usage (ESM):
import { createTotemClient } from "https://totem-p0-api-production.up.railway.app/public/sdk.js";

Example:
const client = createTotemClient({
  baseUrl: "https://totem-p0-api-production.up.railway.app"
});

Methods:
- getAvailability
- createBooking
- getBookingResult
- cancelBooking
- createPaymentIntent

SDK contract strictly matches PUBLIC API v1.

---

## NON-GOALS (NOT PUBLIC)

The following are NOT part of public API:
- Owner endpoints
- System endpoints
- Direct DB access
- Internal audit APIs

---

END OF DOCUMENT
