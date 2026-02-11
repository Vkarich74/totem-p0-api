# TOTEM — FORM CONTRACT (STRICT)
Generated: 2026-02-11T10:30:21.135560+00:00

---

## GLOBAL DATA TYPES

Identifiers:
- salon_id: string
- master_id: string
- service_id: string
- booking_id: string

Time:
- start_at: ISO-8601 UTC
- end_at: ISO-8601 UTC

Status enums:
MASTER_STATUS = active | inactive
SALON_STATUS = active | inactive
BOOKING_STATUS = pending | confirmed | cancelled | expired

---

## MASTER_PROFILE_FORM

WRITE:
- master_id
- status
- display_name
- bio_short
- bio_long?
- avatar_url?
- gallery_urls[]?
- tags[]?

READ:
MASTER_PUBLIC_VIEW:
- master_id
- status
- display_name
- bio_short
- avatar_url
- gallery_urls[]
- services[]

---

## SERVICE_CONTRACT

WRITE:
- master_id
- service_id?
- service_name
- duration_min
- price_amount
- currency
- is_visible

READ:
SERVICES_LIST:
- master_id
- services[]: {service_id, service_name, duration_min, price_amount, currency, is_visible, sort_order}

---

## SALON_PROFILE_FORM

WRITE:
- salon_id
- status
- salon_name
- address_text?
- phone?
- logo_url?
- description?

READ:
SALON_PUBLIC_VIEW:
- salon_id
- status
- salon_name
- logo_url
- address_text
- masters[]

---

## BOOKING_FLOW_FORM

Reserve (backend):
- salon_id
- master_id
- service_id
- start_at
- duration_min
- client_name
- client_phone?
- client_email?

Returns:
- booking_id
- status=pending
- expires_at

Confirm:
- booking_id → status=confirmed

Cancel:
- booking_id → status=cancelled

Conflict prevention = backend only.

---

## CALENDAR_ENGINE

Data model:
calendar_slots:
- master_id
- salon_id
- start_at
- end_at
- status (available|reserved|blocked)

Backend enforces:
- no overlaps
- timeout expiry

---

## IMPLEMENTATION BOUNDARY

Odoo:
- Render UI
- Submit to backend
- Display backend response

Odoo MUST NOT:
- Decide conflicts
- Store canonical booking status
- Execute payment logic

---

## TRACE SNAPSHOT

CORE_CONTRACT.md:
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


GAP_MAP.md:
# TOTEM GAP MAP
Generated: 2026-02-11T10:25:00.775561Z

---

## 1. EXISTING WEBSITE PAGES (37)

- /
- /contactus
- /contactus-thank-you
- /demo
- /demo/s/test
- /demo/s/test/booking
- /demo/s/test/calendar
- /masters
- /masters/bookings
- /masters/cabinet
- /masters/clients
- /masters/money
- /masters/salons
- /masters/schedule
- /masters/settings
- /privacy
- /s/:slug
- /s/:slug/booking
- /s/:slug/calendar
- /s/:slug/owner
- /s/:slug/reports
- /s/test
- /s/test/booking
- /s/test/calendar
- /s/test/owner
- /s/test/reports
- /salons
- /salons/bookings
- /salons/cabinet
- /salons/clients
- /salons/masters
- /salons/money
- /salons/schedule
- /salons/settings
- /start
- /waitlist
- /your-task-has-been-submitted


---

## 2. PRODUCT REQUIREMENTS (CORE LAYER)

Required UI Contracts:

- MASTER_PROFILE_FORM
- SALON_PROFILE_FORM
- BOOKING_FLOW_FORM
- CALENDAR_ENGINE_UI


---

## 3. CURRENT STATE ANALYSIS

Observed:
- Pages exist structurally.
- No dedicated booking form.
- No master profile form.
- No salon profile form.
- No custom booking model connected.

Gap:
UI structure present.
Product layer not yet implemented.

---

END OF GAP MAP


END OF FORM CONTRACT
