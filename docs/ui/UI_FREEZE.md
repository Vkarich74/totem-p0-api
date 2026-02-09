# TOTEM — UI FREEZE (UI-5)

Status: **FROZEN**
UI Version: **v1**
Track: **UI / ODOO**
Date: 2026-02-09

This document freezes the UI layer for TOTEM v1.
Any deviation requires an explicit unfreeze decision.

---

## 0) Scope

This FREEZE applies to:
- Odoo Website pages
- Odoo menus and navigation
- UI → API wiring
- Page structure and routes
- Auth flows (UI-visible only)
- Error rendering behavior

Backend and DB are already frozen separately.

---

## 1) Frozen Artifacts (Canonical)

The following documents are canonical and immutable:

- `docs/ui/INTEGRATION_CONTRACT.md`
- `docs/ui/AUTH_FLOW.md`
- `docs/ui/PAGES_STRUCTURE.md`
- `docs/ui/API_WIRES.md`
- `docs/ui/UI_FREEZE.md` (this document)

These files define UI v1 completely.

---

## 2) Frozen Pages

### Public
- `/`
- `/contactus`
- `/contactus-thank-you`
- `/privacy`
- `/your-task-has-been-submitted`

### TOTEM (slug-based)
- `/s/:slug`
- `/s/:slug/booking`
- `/s/:slug/calendar`
- `/s/:slug/reports`
- `/s/:slug/owner`

### Master (auth required)
- `/masters/cabinet`
- `/masters/schedule`
- `/masters/bookings`
- `/masters/clients`
- `/masters/money`
- `/masters/salons`
- `/masters/settings`

### Salon (auth required)
- `/salons/cabinet`
- `/salons/schedule`
- `/salons/bookings`
- `/salons/clients`
- `/salons/masters`
- `/salons/money`
- `/salons/settings`

---

## 3) Frozen Navigation

- Top Menu structure
- TOTEM menu (`/s/:slug/*`)
- No new menu items
- No reordering
- No conditional visibility logic

---

## 4) Frozen Rules

UI MUST NOT:
- Add business logic
- Infer roles or permissions
- Cache or merge API responses
- Retry conflicts (409)
- Modify payload semantics
- Introduce new user flows
- “Improve UX” by adding decisions

UI MUST:
- Render backend responses as-is
- Stop on any error
- Redirect on 401 only
- Show 403/409 explicitly

---

## 5) HOME Page Rule (Explicit)

- HOME (`/`) is **out of TOTEM core**
- HOME is **layout-only**
- HOME may contain links only
- HOME MUST NOT:
  - call APIs
  - embed data blocks
  - check auth
  - mirror cabinet pages

---

## 6) Change Control (Hard)

Any change after this FREEZE requires:
1) Explicit UNFREEZE decision
2) Defined scope (what exactly changes)
3) Impact analysis
4) New version tag (UI v2)

Without this — changes are forbidden.

---

## 7) Acceptance

UI FREEZE is considered ACTIVE when:
- This file exists
- UI behavior matches frozen documents
- No additional UI logic is introduced

---

## 8) Status

**UI v1 is CLOSED and FROZEN.**
Further work must move to another track.

---
