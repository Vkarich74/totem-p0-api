# TOTEM CORE CONTRACT SNAPSHOT
Generated: 2026-02-11T10:25:00.774621Z

---

## 1. SOURCE OF TRUTH

Backend (Node.js on Railway) = Single Source of Truth.
Odoo Website = Thin Frontend.
Business logic MUST NOT live in Odoo.

---

## 2. ARCHITECTURE CHAIN

Backend → Site Page → Cabinet Block

Pages reflect backend state.
Cabinet aggregates backend state.
No business logic duplication allowed.

---

## 3. ROLES

Public
Master
Salon
Owner

Guards are enforced at routing level.

---

## 4. ROUTING (LOCKED)

Public:
- /s/:slug
- /s/:slug/booking
- /s/:slug/calendar
- /s/:slug/owner
- /s/:slug/reports

Cabinet:
- /masters/*
- /salons/*

Slug logic fixed.

---

## 5. PAYMENTS

PSP integration waiting.
Payments do not block product core expansion.

---

## 6. IMPLEMENTATION RULES

- CMD only
- Python scripts only
- Idempotent writes
- No manual UI editing
- Commit + push after changes
- Backend FREEZE

END OF CORE CONTRACT
