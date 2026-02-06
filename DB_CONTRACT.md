# TOTEM — DB CONTRACT (Catalog)

## Scope
Catalog of services, prices and durations.
Source of truth for booking pricing.

---

## Tables

### services
Purpose: service template / reference.

Fields:
- id (int, PK)
- service_id (text, UNIQUE)
- name (text)
- duration_min (int)
- price (int)
- created_at (timestamp)

Notes:
- NOT a pricing authority in PROD
- Used as base template only

---

### salon_master_services
Purpose: canonical pricing & duration per salon/master/service.

Fields:
- id (int, PK)
- salon_id (FK → salons.id)
- master_id (FK → masters.id)
- service_pk (FK → services.id)
- price (int, >= 0)
- duration_min (int, > 0)
- active (bool)
- created_at (timestamp)

Constraints:
- UNIQUE (salon_id, master_id, service_pk)
- price >= 0
- duration_min > 0

Indexes:
- (salon_id, active)
- (master_id, active)
- (service_pk)

---

## Canon Rules

- Booking price and duration MUST be read from salon_master_services
- services table MUST NOT be used for pricing in PROD
- Inactive rows (active=false) MUST be ignored
- Exactly one active row per (salon, master, service)

---

## Booking Integration

- bookings.service_id (text) maps to services.service_id
- Resolution to services.id is done at API level
- Final pricing is resolved via salon_master_services

---

## Current PROD State

- services: 1 row
- salon_master_services: 1 row

---

## Change Policy

- Any change requires migration
- No direct DB edits in PROD
