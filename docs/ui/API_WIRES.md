# TOTEM — UI / ODOO API WIRES

Status: **UI Track**
Version: **v1.1**
Core: **READ ONLY**
Security model: **backend-enforced**

This document defines the exact wiring between UI pages and backend APIs.
UI is a thin client. Backend is the source of truth.

NO business logic in UI.
NO assumptions.
NO silent fallbacks.

---

## 0) Global Rules (Hard)

1) UI never infers availability, conflicts, roles, or permissions.
2) UI never retries failed operations automatically.
3) UI never alters backend semantics.
4) UI renders backend responses as-is.
5) Any mismatch between UI and backend behavior must be resolved by updating this document.

---

## 1) Authentication Wiring (Global)

### Token usage
- Header: `Authorization: Bearer <token>`

### UI behavior
- Token missing → backend decides
- Token invalid → backend decides

### Status handling
- `401` → redirect to `/login`
- `403` → show “Forbidden”
- Other errors → render and stop

---

## 2) PUBLIC / LANDING

### 2.1 HOME (`/`)

**API calls:** ❌ NONE

**Purpose:**
- marketing
- entry point
- navigation only

**Allowed:**
- links to `/s/:slug`
- links to `/s/:slug/booking`
- links to `/login`

**Forbidden:**
- API calls
- auth checks
- data rendering

---

## 3) TOTEM PUBLIC (Slug-based)

### 3.1 Salon Landing (`/s/:slug`)

**Purpose:** public salon entry page

**API:**
- `GET /s/:slug/resolve`

**UI behavior:**
- render returned metadata only

**Errors:**
- `404` → salon not found
- `500` → server error

---

### 3.2 Booking (`/s/:slug/booking`)

**Purpose:** create booking request

**Security model:**
- Calendar read is **NOT public**
- UI does **NOT** preload availability

**API (write only):**
- `POST /calendar/reserve`

**UI behavior:**
- collect form fields only
- send payload as-is
- backend validates conflicts and availability

**Errors:**
- `401` → login required
- `403` → forbidden
- `409` → conflict (slot unavailable)
- `422` → validation error
- `500` → server error

UI MUST NOT:
- call `GET /calendar/master/:id` without auth
- infer availability
- retry automatically

---

### 3.3 Calendar (`/s/:slug/calendar`)

**Purpose:** availability view

**Access:** **AUTH REQUIRED**

**API:**
- `GET /calendar/master/:master_id`

**UI behavior:**
- if authenticated → render calendar
- if not authenticated → redirect to login

**Errors:**
- `401 / 403` → access denied
- `500` → server error

---

### 3.4 Reports (`/s/:slug/reports`)

**Purpose:** read-only reporting

**API:**
- `GET /reports/*` (backend-defined)

**Access:** auth required

**Errors:**
- `401 / 403` → forbidden
- `500` → server error

---

### 3.5 Owner View (`/s/:slug/owner`)

**Purpose:** owner-scoped read view

**API:**
- OWNER-scoped GET endpoints only

**UI behavior:**
- no write operations

**Errors:**
- `403` → forbidden
- `500` → server error

---

## 4) MASTER AREA (Auth required)

### 4.1 `/masters/cabinet`
- `GET /master/profile`
- `GET /master/summary`

### 4.2 `/masters/schedule`
- `GET /calendar/master/:master_id`

### 4.3 `/masters/bookings`
- `GET /bookings/master/:master_id`

### 4.4 `/masters/clients`
- `GET /clients/master/:master_id`

### 4.5 `/masters/money`
- `GET /ledger/master/:master_id`
- Ledger is append-only
- UI does not compute totals

### 4.6 `/masters/salons`
- `GET /salons/master/:master_id`

### 4.7 `/masters/settings`
- `GET /master/settings`
- Write operations: ❌ NONE (UI scope)

---

## 5) SALON AREA (Auth required)

### 5.1 `/salons/cabinet`
- `GET /salon/profile`

### 5.2 `/salons/schedule`
- `GET /calendar/salon/:salon_id`

### 5.3 `/salons/bookings`
- `GET /bookings/salon/:salon_id`

### 5.4 `/salons/clients`
- `GET /clients/salon/:salon_id`

### 5.5 `/salons/masters`
- `GET /masters/salon/:salon_id`

### 5.6 `/salons/money`
- `GET /ledger/salon/:salon_id`

### 5.7 `/salons/settings`
- `GET /salon/settings`
- Write operations: ❌ NONE (UI scope)

---

## 6) Error Handling Canon (All Pages)

| Status | UI Action |
|------:|----------|
| 200 / 201 | Render success |
| 400 | Show error + stop |
| 401 | Redirect to login |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (no retry) |
| 422 | Validation error |
| 500 | Server error |

---

## 7) Explicitly Forbidden

UI must NOT:
- preload calendar availability publicly
- infer roles or permissions
- cache responses
- merge API results
- invent fallback flows

---

## 8) Contract Change Log

### v1.1 — 2026-02-09
- Calendar read requires authentication
- Public booking no longer assumes availability read
- Change triggered by SANDBOX FAIL (403 without auth)
- Backend unchanged
- DB unchanged

---

## 9) Acceptance

This document is canonical when:
- it matches backend behavior
- SANDBOX passes
- UI logic follows it strictly

Any deviation requires UNFREEZE.

---
