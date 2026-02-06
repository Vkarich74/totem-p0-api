# NOTIFICATIONS

Purpose:
Define notification system policies for email, SMS, and push.
Provider-agnostic. Async-only. Backend-driven.

---

## Notification types

- booking_created
- booking_paid
- booking_canceled
- booking_expired
- booking_no_show
- system_alert

---

## Triggers

- Booking state transitions
- Payment state transitions
- System events (TTL, failures)

---

## Delivery rules

- All notifications are async jobs
- Frontend never sends notifications directly
- Delivery is best-effort with retries

---

## Retry policy

- Retry on transient failures
- Exponential backoff
- Dead-letter after max retries

---

## User preferences

- Opt-in / opt-out per channel
- Preferences stored server-side
- Preferences respected at send time

---

## SLA

- Non-critical: best-effort
- Critical (booking/payment): prioritized queue

End of document.
