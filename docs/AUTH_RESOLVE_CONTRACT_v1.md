# TOTEM — AUTH RESOLVE CONTRACT
Generated: 2026-02-11T11:01:10.020458+00:00

---

## 1. PURPOSE

Define a single canonical endpoint for resolving user role
from backend session.

Backend remains Source of Truth.

---

## 2. ENDPOINT

GET /auth/resolve

Headers:
- Cookie: totem_session=<httpOnly backend session>

No query params.
No body.

---

## 3. RESPONSE STRUCTURE

### Public (default)

HTTP 200
{
  "role": "public"
}

---

### Master

HTTP 200
{
  "role": "master",
  "master_id": "string",
  "salon_ids": ["string"],
  "permissions": {
      "can_edit_profile": true,
      "can_manage_schedule": true
  }
}

---

### Salon

HTTP 200
{
  "role": "salon",
  "salon_id": "string",
  "permissions": {
      "can_manage_masters": true,
      "can_view_reports": true
  }
}

---

### Owner (future)

HTTP 200
{
  "role": "owner",
  "owner_id": "string",
  "permissions": {}
}

---

## 4. ERROR STATES

Invalid session:
HTTP 401
{
  "error": "invalid_session"
}

Expired session:
HTTP 401
{
  "error": "expired_session"
}

---

## 5. SECURITY RULES

- Session stored as httpOnly cookie
- Odoo must NOT store role locally
- Role is resolved per request
- No role caching in frontend

---

## 6. ODOO BEHAVIOR

On loading /masters/* or /salons/*:

1. JS calls /auth/resolve
2. If role matches required zone:
      render cabinet
   Else:
      render ROLE GATE screen

No redirects.
No duplicated logic.
No Odoo group usage.

---

## 7. WHY THIS IS CANONICAL

- Prevents role drift
- Prevents duplicated auth
- Supports PSP later
- Supports multi-salon future
- Keeps backend freeze intact

---

END OF AUTH RESOLVE CONTRACT
