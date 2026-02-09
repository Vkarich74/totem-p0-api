# TOTEM — UI / ODOO Integration Contract (v1)

Status: **UI Track / READ ONLY**
Core: **FULL FREEZE (backend + DB unchanged)**
Frontend: **Odoo Website = thin client only**

---

## 0) Non-Negotiables (Hard Rules)

1) **Backend is Source of Truth.**  
   UI must never derive or “fix” business outcomes.

2) **No business logic in UI.**  
   UI may only:
   - collect input
   - call API
   - render response
   - render errors as-is

3) **No backend/DB changes in this track.**  
   Any request that implies schema/logic change is **out of scope**.

4) **No silent assumptions.**  
   If API is missing something, UI must show an error and stop.

5) **Idempotency & conflicts are backend responsibility.**  
   UI only forwards idempotency keys (if required) and displays 409.

---

## 1) Environments & Base URLs

- **Production API (Railway)**: use existing public HTTPS endpoint (already deployed).
- **Frontend (Odoo Website)**: UI only.

> UI must store **API_BASE** as a configuration value (no hardcoded URLs across pages).

---

## 2) Roles & Tokens (Auth Model)

### 2.1 Roles
- **PUBLIC**
  - unauthenticated, read-only where allowed
- **MASTER**
  - authenticated
  - acts only within master scope
- **OWNER**
  - authenticated
  - administrative scope per owner permissions

### 2.2 Token transport
- UI sends token in:
  - `Authorization: Bearer <token>`

### 2.3 What UI is allowed to do with tokens
- Store token in a safe Odoo mechanism (session/user context where possible).
- Attach token to API calls.
- If token missing/expired → show “Unauthorized” and stop.

### 2.4 What UI is NOT allowed to do
- Decode JWT for decisions (roles/exp) as a source of truth.
- Override role checks.
- “Auto-retry” privileged operations.

---

## 3) API Call Policy (UI Behavior)

### 3.1 Allowed UI actions
- Validate **form completeness only** (required fields present).
- Normalize presentation fields (trim spaces).
- Call API.
- Render result.

### 3.2 Forbidden UI actions
- Conflict detection in UI (calendar overlaps).
- Time rounding rules.
- Any “smart” fallback (e.g., choose nearest slot).
- Merging records, deriving IDs, guessing salon/master.

---

## 4) Required Endpoints (v1 UI Track)

> Exact endpoint shapes are defined by backend. UI contract defines **how UI must behave**.

### 4.1 Calendar — Read
**GET** `/calendar/master/:master`

UI responsibilities:
- Provide `master` identifier exactly as required by backend.
- Render returned slots list.
- If response empty → show “No slots”.

Expected errors:
- `401/403` → show “Unauthorized / Forbidden”
- `404` → show “Not found”
- `500` → show “Server error” (no additional interpretation)

### 4.2 Calendar — Reserve (Conflict-safe)
**POST** `/calendar/reserve`

UI responsibilities:
- Collect required fields (as specified by backend contract / API docs).
- Send request body as-is.
- If backend requires idempotency:
  - UI must send `Idempotency-Key: <uuid>` (or the agreed header)
  - UI must generate UUID once per user submit attempt.

Expected errors:
- `401/403` → show “Unauthorized / Forbidden”
- `409` → show “Conflict: slot already reserved / overlap” (display backend message)
- `422` → show “Validation error” (display backend message)
- `500` → show “Server error”

UI MUST NOT:
- Retry on `409`
- Suggest alternative slot automatically
- Modify times to “fit”

---

## 5) Error Handling Standard (UI Canon)

UI displays:
- **Status code**
- **Backend message** (if present)
- **Request correlation id** (if backend returns one)

UI must NOT:
- Hide errors
- Replace backend meaning with UI logic
- “Pretend success” if response is not 2xx

### 5.1 Mapping table (strict)

| Status | Meaning in UI | UI action |
|---:|---|---|
| 200/201 | Success | Render success state |
| 400 | Bad request | Show message + stop |
| 401 | Unauthorized | Ask login/token + stop |
| 403 | Forbidden | Show forbidden + stop |
| 404 | Not found | Show not found + stop |
| 409 | Conflict | Show conflict + stop |
| 422 | Validation | Show validation + stop |
| 429 | Rate limit | Show rate limit + stop |
| 500 | Server error | Show server error + stop |

---

## 6) Data & Privacy (UI Constraints)

- UI must not log tokens.
- UI must not store sensitive payloads in public pages.
- UI must avoid embedding secrets in page source.

---

## 7) Observability (UI Minimal)

UI should capture minimal diagnostic data for operator:
- timestamp
- endpoint called
- status code
- safe error text (no secrets)

---

## 8) Out of Scope (Explicit)

- Any new backend endpoints
- Any DB schema change
- Any changes to business rules:
  - pricing
  - ledger logic
  - audit logic
  - calendar conflict rules
  - booking atomicity
- “UX improvements” that introduce decisions

---

## 9) Acceptance Criteria (UI-1 Done)

UI-1 is considered complete when:
1) This contract file exists at `docs/ui/INTEGRATION_CONTRACT.md`
2) It is committed and pushed
3) UI work starts from this contract only

---
