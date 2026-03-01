\# 🔒 TOTEM API CONTRACT (FROZEN)



This file defines the MINIMUM public API surface.

Removing or modifying these endpoints is a BREAKING CHANGE.



---



\## CORE HEALTH



GET /health



---



\## PUBLIC API



GET    /public/salons/:slug

GET    /public/salons/:slug/metrics

POST   /public/salons/:slug/bookings

GET    /public/salons/:slug/masters/:master\_id/availability



---



\## INTERNAL (POSTPAID)



POST   /internal/bookings/:id/confirm

POST   /internal/bookings/:id/complete



---



\## RULE



If any of the above endpoints are removed from routing,

deployment must be blocked.

