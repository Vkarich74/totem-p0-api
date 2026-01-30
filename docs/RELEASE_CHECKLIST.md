# TOTEM — Release Checklist (Docs Phase)

This checklist defines **what must not break** for public consumers
(widget, frontend, partners). It reflects **actual production behavior**.

==================================================
SCOPE
==================================================

Applies to:
- Public API
- Widget
- Token behavior
- Booking & payment lifecycle

Does NOT apply to:
- Internal admin/system APIs
- DB migrations (none pending)

==================================================
MUST-NOT-BREAK ENDPOINTS (PROD)
==================================================

Health:
- GET /health

Public booking:
- POST /public/bookings
- POST /public/bookings/:id/cancel

Payments:
- POST /public/payments/intent

Static:
- /public/static/widget.js

==================================================
HEALTH CHECK INVARIANTS
==================================================

- GET /health MUST return 200
- Response body MUST be:
```json
{ "ok": true }
