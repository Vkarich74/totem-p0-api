# TOTEM — UI / ODOO Auth Flow (v1)

Status: **UI Track**
Logic: **FORBIDDEN**
Core: **READ ONLY**

This document defines **UI-visible authentication flows only**.
No decisions. No role logic. No fallbacks.

---

## 0) Hard Rules

1) UI does NOT authenticate users.
2) UI does NOT validate roles.
3) UI does NOT decode tokens for decisions.
4) UI only:
   - collects input
   - sends it to backend
   - renders response or error

If backend denies → UI stops.

---

## 1) Actors

- **PUBLIC**
- **MASTER**
- **OWNER**

UI treats them as **labels**, not authorities.

---

## 2) Entry Points (Pages)

### 2.1 Public Entry
- `/`
- `/login`
- `/calendar/view`

Characteristics:
- No token
- Read-only where allowed
- Any protected API call → expect 401/403

---

## 3) Auth Acquisition (Generic)

> Exact auth endpoints are backend-defined.
> UI only mirrors required fields.

### 3.1 Login Form (Generic)

**Page:** `/login`

**Form fields:**
- identifier (email / phone / username — as required by backend)
- password (or equivalent credential)

**UI behavior:**
- Validate presence only
- POST to auth endpoint
- On success:
  - receive token
  - store token (session / secure storage)
- On failure:
  - render backend error
  - do not retry automatically

---

## 4) OWNER Flow (UI Perspective)

### 4.1 Entry
- `/owner/login`
- `/login` (shared)

### 4.2 After Successful Auth
- UI stores token
- UI navigates to:
  - `/owner/dashboard` (UI shell only)

### 4.3 Allowed UI Actions
- Call OWNER-scoped APIs with token
- Render data returned

### 4.4 Forbidden UI Actions
- Checking if user is really OWNER
- Granting access by UI condition
- Hiding backend errors

### 4.5 Error States
- 401 → show "Unauthorized"
- 403 → show "Forbidden"
- Any error → stop

---

## 5) MASTER Flow (UI Perspective)

### 5.1 Entry
- `/master/login`
- `/login` (shared)

### 5.2 After Successful Auth
- UI stores token
- UI navigates to:
  - `/master/dashboard` (UI shell only)

### 5.3 Allowed UI Actions
- Call MASTER-scoped APIs
- Display calendar, bookings, etc. (data-driven)

### 5.4 Forbidden UI Actions
- Switching salon/master context
- Role elevation
- Filtering data beyond backend response

### 5.5 Error States
Same as OWNER:
- 401 / 403 / 4xx / 5xx → render + stop

---

## 6) PUBLIC Flow

### 6.1 Entry
- `/`
- `/calendar/view`

### 6.2 Behavior
- No token
- Read-only calls only
- If backend requires auth:
  - UI shows "Login required"
  - Redirects to `/login`

UI must not attempt partial access.

---

## 7) Logout Flow (UI Only)

### 7.1 Action
- User clicks "Logout"

### 7.2 UI Behavior
- Delete stored token
- Redirect to `/login`

No backend call required unless explicitly defined.

---

## 8) Token Loss / Expiry

### 8.1 Backend Response
- 401 / 403 on any call

### 8.2 UI Reaction (Strict)
- Clear token
- Redirect to `/login`
- Show backend message if present

No retries. No refresh logic unless backend explicitly defines it.

---

## 9) Forbidden Patterns (Explicit)

UI must NOT:
- Refresh tokens
- Guess role from UI route
- Share token between users
- Cache privileged responses

---

## 10) Acceptance Criteria (UI-2 Done)

UI-2 is DONE when:
1) This file exists: `docs/ui/AUTH_FLOW.md`
2) File is committed and pushed
3) All UI auth-related work follows this document only

---
