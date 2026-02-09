# TOTEM — UI / ODOO API WIRES (UI-4)

Status: **UI Track**
Core: **READ ONLY**
Rule: **UI = thin client, backend = source of truth**

This document defines:
- which UI pages call which backend APIs
- which HTTP methods are used
- how UI must react to responses

NO business logic.  
NO data transformation.  
NO retries unless explicitly allowed.

---

## 0) Global Rules (Hard)

1) UI never infers state.
2) UI never fixes errors.
3) UI never retries conflicts (409).
4) UI never modifies payloads beyond form completeness.
5) UI renders backend response **as-is**.

---

## 1) Authentication Wiring (Generic)

### Token usage
- Header: `Authorization: Bearer <token>`
- If token missing or invalid → backend decides.

### UI reaction
- `401` → redirect to `/login`
- `403` → show “Forbidden”
- Any other error → render + stop

---

## 2) PUBLIC / LANDING WIRES

### 2.1 HOME (`/`)
- API calls: ❌ NONE
- Purpose: marketing / navigation only
- Allowed:
  - links to `/s/:slug`
  - links to `/s/:slug/booking`
  - links to `/login`

---

## 3) TOTEM PUBLIC (Slug-based)

### 3.1 Salon Landing (`/s/:slug`)

**Purpose:** read-only salon entry page

**API:**
- `GET /s/:slug/resolve`

**UI behavior:**
- Render returned salon metadata
- No caching
- No assumptions

**Errors:**
- `404` → show “Salon not found”
- `500` → show server error

---

### 3.2 Booking (`/s/:slug/booking`)

**Purpose:** create booking

**API (read):**
- `GET /calendar/master/:master_id`
  - Used to render availability

**API (write):**
- `POST /calendar/reserve`

**UI behavior:**
- Collect form fields only
- Send payload as-is
- Generate idempotency key per submit (if required)

**Errors:**
- `401` → login required
- `403` → forbidden
- `409` → conflict (slot unavailable)
- `422` → validation error
- `500` → server error

UI MUST NOT:
- adjust time
- suggest alternative slot
- retry automatically

---

### 3.3 Calendar (`/s/:slug/calendar`)

**Purpose:** read-only availability view

**API:**
- `GET /calendar/master/:master_id`

**UI behavior:**
- Render slots exactly as returned

**Errors:**
- `404` → not found
- `500` → server error

---

### 3.4 Reports (`/s/:slug/reports`)

**Purpose:** read-only reporting

**API:**
- `GET /reports/*` (exact endpoints defined by backend)

**UI behavior:**
- Render tables / summaries only

**Errors:**
- `401 / 403` → access denied
- `500` → server error

---

### 3.5 Owner View (`/s/:slug/owner`)

**Purpose:** owner-scoped read view

**API:**
- OWNER-scoped GET endpoints only

**UI behavior:**
- No write operations
- No admin actions

**Errors:**
- `403` → forbidden
- `500` → server error

---

## 4) MASTER WIRES

### 4.1 Master Cabinet (`/masters/cabinet`)

**API:**
- `GET /master/profile`
- `GET /master/summary`

**Errors:**
- `401 / 403` → redirect / forbidden
- `500` → server error

---

### 4.2 Master Schedule (`/masters/schedule`)

**API:**
- `GET /calendar/master/:master_id`

**Behavior:**
- Read-only view

---

### 4.3 Master Bookings (`/masters/bookings`)

**API:**
- `GET /bookings/master/:master_id`

**Behavior:**
- List only
- No inline edits

---

### 4.4 Master Clients (`/masters/clients`)

**API:**
- `GET /clients/master/:master_id`

---

### 4.5 Master Money (`/masters/money`)

**API:**
- `GET /ledger/master/:master_id`

**Notes:**
- Ledger is append-only
- UI never computes totals

---

### 4.6 Master Salons (`/masters/salons`)

**API:**
- `GET /salons/master/:master_id`

---

### 4.7 Master Settings (`/masters/settings`)

**API:**
- `GET /master/settings`

**Write operations:** ❌ NONE (UI-4 scope)

---

## 5) SALON WIRES

### 5.1 Salon Cabinet (`/salons/cabinet`)

**API:**
- `GET /salon/profile`

---

### 5.2 Salon Schedule (`/salons/schedule`)

**API:**
- `GET /calendar/salon/:salon_id`

---

### 5.3 Salon Bookings (`/salons/bookings`)

**API:**
- `GET /bookings/salon/:salon_id`

---

### 5.4 Salon Clients (`/salons/clients`)

**API:**
- `GET /clients/salon/:salon_id`

---

### 5.5 Salon Masters (`/salons/masters`)

**API:**
- `GET /masters/salon/:salon_id`

---

### 5.6 Salon Money (`/salons/money`)

**API:**
- `GET /ledger/salon/:salon_id`

---

### 5.7 Salon Settings (`/salons/settings`)

**API:**
- `GET /salon/settings`

**Write operations:** ❌ NONE (UI-4 scope)

---

## 6) Error Handling Canon (ALL PAGES)

| Status | UI Action |
|------:|----------|
| 200/201 | Render success |
| 400 | Show error + stop |
| 401 | Redirect to login |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (no retry) |
| 422 | Validation error |
| 500 | Server error |

---

## 7) Forbidden Patterns (Explicit)

UI must NOT:
- cache responses
- merge API results
- compute availability
- infer roles
- hide backend errors
- invent fallback flows

---

## 8) Acceptance Criteria (UI-4 Done)

UI-4 is DONE when:
1) This file exists: `docs/ui/API_WIRES.md`
2) File is committed (if repo is used) or frozen (odoo-local)
3) UI wiring follows this document strictly

---
