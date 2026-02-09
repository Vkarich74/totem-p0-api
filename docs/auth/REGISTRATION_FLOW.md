# TOTEM — REGISTRATION FLOW (Odoo → CRM → Core Identity)
Status: CANON (Design)
Scope: Registration + onboarding only
Core: Source of Truth
UI: Odoo Website/CRM as intake + session gate
Provider: Not required

This document defines the safe, minimal, non-annoying registration flow:
- User registers in Odoo (password/session)
- Odoo creates CRM request (lead)
- After email verification (or manual approval), Odoo calls Core (system-to-system)
- Core creates canonical identity + grants role/state
- Odoo mirrors core_user_id + granted_role + state and enables correct UI

No business logic in UI.
No API tokens in browser.
No “Odoo ID == Core ID”.

---

## 0) Hard Rules

1) **Core generates canonical IDs**. Odoo never dictates identity.
2) **requested_role != granted_role**. User choice is intent, Core decides.
3) **System-to-system only** for Core identity creation (Odoo server → Core API).
4) **No user tokens in browser**. Odoo pages must not expose Core tokens.
5) **Idempotent** identity creation based on CRM request id (lead_id).
6) **State-gated UI**: ACTIVE required for real cabinets.
7) Every identity creation is **audited** in Core.

---

## 1) Roles & States (Core)

Roles (Core):
- CLIENT
- MASTER
- OWNER (Salon)
- SUPER_ADMIN (out of scope here)

Identity state (Core):
- PENDING (created, not activated)
- ACTIVE (activated)
- SUSPENDED (blocked)

UI gating rule:
- ACTIVE → allow full cabinet UI
- PENDING → only onboarding/pending pages
- SUSPENDED → blocked page + support instructions

---

## 2) Odoo Objects (Intake Layer)

### 2.1 Odoo User
Odoo handles:
- password
- session login
- website pages access (UI only)

### 2.2 CRM Request (Lead)
Create a CRM lead/request record for every registration.

Required fields on CRM request:
- lead_id (Odoo record id) — used as idempotency key
- odoo_user_id (or res.partner.id reference)
- email (normalized)
- phone (normalized)
- requested_role: MASTER | OWNER | CLIENT (if allowed)
- verification_status: NEW | VERIFIED | APPROVED | REJECTED
- core_user_id (nullable, filled after Core creation)
- granted_role (nullable, mirror from Core)
- core_state (nullable, mirror from Core)
- timestamps (create/write)

---

## 3) User Experience (No “User Hell”)

### 3.1 Registration Screen (Odoo)
Single form:
- name
- email
- phone
- password
- requested_role (MASTER / SALON)
- optional: city

After submit:
- user sees: “Check your email to confirm”.

### 3.2 Email Verification (Minimal)
One-click verification:
- verification_status: NEW → VERIFIED

No OTP required in v1 unless abuse appears.

### 3.3 Onboarding Cabinet (Odoo)
After login:
- If no core_user_id → show onboarding status page
- If core_state=PENDING → show “Pending approval” page
- If core_state=ACTIVE → show role cabinet entry points
- If core_state=SUSPENDED → show blocked page

---

## 4) Approval Policy (Minimal, Safe)

Core identity should NOT be created immediately on form submit.
Create Core identity only when:
- verification_status == VERIFIED (automatic path), OR
- manual APPROVED by operator (if enabled)

Recommended v1:
- MASTER: auto-create identity after VERIFIED (state can still be PENDING if you want moderation)
- OWNER: create identity after VERIFIED but keep core_state=PENDING until minimal salon verification (operator approve)

This avoids spam identities in Core and keeps UX simple.

---

## 5) Core Identity Creation (System-to-System)

### 5.1 Endpoint (Core)
`POST /system/onboarding/identity`

Authentication:
- `X-System-Token: <system_secret>` (server-to-server only)

Request payload (minimum):
- lead_id (int/string)  ← idempotency key
- odoo_user_id
- email
- phone
- requested_role (MASTER|OWNER|CLIENT)

Response payload (minimum):
- core_user_id
- granted_role (MASTER|OWNER|CLIENT)
- state (PENDING|ACTIVE|SUSPENDED)
- reason (optional)

### 5.2 Idempotency Rules (Core)
- If lead_id already processed:
  - return the same core_user_id + granted_role + state
- If same lead_id but payload conflicts:
  - return 409 Conflict

### 5.3 Core Decision Rules
- requested_role is intent only
- Core assigns granted_role + initial state
- Core logs audit: identity_created_from_odoo {lead_id, odoo_user_id, email, requested_role, granted_role, state}

---

## 6) Mapping & Storage (Odoo Mirrors Core)

After Core responds:
- write CRM lead fields:
  - core_user_id
  - granted_role
  - core_state
- (optional) write to Odoo user/partner a read-only mirror:
  - core_user_id
  - granted_role
  - core_state

Write-protection:
- core_user_id/granted_role/core_state must be editable only by system integration user, not by normal UI users.

---

## 7) Access Control Strategy (Safe & Simple)

### 7.1 Odoo UI gating (Soft)
Use granted_role + core_state to show/hide:
- menus
- cabinet links
- pages

Soft gating is UX only.

### 7.2 Core enforcement (Hard)
Every Core API that returns sensitive data must enforce:
- role
- state
- ownership/scope

Even if Odoo mistakenly shows a link, Core must still deny.

---

## 8) CLIENT Role (v1 minimal)

Client exists in Core but minimal:
Allowed:
- create booking request (only if Core policy allows)
- view own booking/payment status only

Forbidden:
- read master calendars fully
- read salon/master ledgers
- view other users’ data

---

## 9) Failure Modes & Handling

### 9.1 Email not verified
- user can login to Odoo, but only sees “Verify email” screen
- no Core call

### 9.2 Core identity creation fails (5xx)
- keep lead VERIFIED
- show “We’re processing, try later”
- integration job may retry safely due to idempotency

### 9.3 Core returns PENDING
- show “Pending approval” cabinet
- no sensitive pages enabled

### 9.4 Core returns SUSPENDED
- show blocked page + support instructions

### 9.5 Duplicate registrations
- multiple leads possible, but Core is idempotent per lead_id
- recommended: prevent duplicates by email in Odoo intake where possible

---

## 10) Security Checklist (Must Pass)

- [ ] No Core token in browser JS
- [ ] Core identity create is system-to-system only
- [ ] lead_id idempotency implemented in Core
- [ ] requested_role treated as intent
- [ ] core_user_id mirror fields write-protected in Odoo
- [ ] Core enforces role/state on all sensitive endpoints
- [ ] Audit event written for identity creation

---

## 11) Acceptance Criteria (v1)

Flow is accepted when:
1) User can register in Odoo and verify email.
2) After verification, Core creates identity idempotently.
3) Odoo shows correct cabinet based on core_state/granted_role.
4) No Core secrets are exposed to the browser.
5) Operator can approve OWNER if needed without manual DB edits.

---
