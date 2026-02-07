# TOTEM — OPS RUNBOOK
Version: v1.0.0
Status: FREEZE
Date: 2026-02-07

---

## PURPOSE
Operational runbook for TOTEM backend.
This document defines the ONLY supported way to run, deploy, and operate the system.
Any deviation is forbidden.

---

## ARCHITECTURE (FIXED)

Backend-driven system.

Backend (Node.js, Railway, PostgreSQL)
→ Public/System API
→ Frontend (Odoo Website, JS fetch)
→ No business logic in frontend

Source of Truth: Backend ONLY.

---

## ENVIRONMENT

### Runtime
- Node.js (ESM)
- Platform: Railway
- DB:
  - PROD: PostgreSQL (Railway)
  - LOCAL: SQLite

### Mandatory ENV
- DATABASE_URL (Railway provides automatically)
- PORT (Railway provides automatically)

No other env is required for core operation.

---

## DATABASE RULES (STRICT)

- Backend owns schema.
- No manual DB edits.
- No psql console usage.
- No external migrations.
- Schema changes only via `ensure*()` functions on startup.

If schema is broken → RESET TABLE (explicit decision).

---

## CORE TABLES (CANONICAL)

### salons
- id (PK)
- slug (UNIQUE)
- name
- status

Auto-created by backend on `/s/:slug/resolve`.

---

### salon_subscriptions
- salon_id (PK)
- active_until

Used by activation guard.

---

### finance_events
- id
- salon_id
- type
- amount
- status
- created_at

Payment events only. No side effects except subscription extend.

---

### bookings (CANONICAL — RESET APPLIED)
- id (PK)
- salon_id (NOT NULL)
- salon_slug (NOT NULL)
- master_id (NOT NULL)
- start_at (NOT NULL)
- end_at (NOT NULL)
- status (DEFAULT 'reserved')
- request_id (UNIQUE, NOT NULL)
- created_at

Bookings are idempotent by request_id.

---

### calendar_slots
- master_id
- salon_id
- start_at
- end_at
- status

Calendar is source of truth for time conflicts.

---

## GUARANTEES

- One request_id → one booking_id (IDEMPOTENCY)
- Calendar prevents time overlaps globally per master
- Inactive salon → all protected routes blocked
- Owner access requires:
  - Active subscription
  - Explicit owner_salon link
- Backend restart is idempotent

---

## FORBIDDEN ACTIONS

- Adding logic to frontend
- Writing to DB manually
- Editing schema outside backend
- Using CREATE TABLE IF NOT EXISTS as migration
- Silent hotfixes in PROD
- Pushing without git commit

---

## DEPLOYMENT

Deployment is automatic via GitHub → Railway.

### Valid flow:
1. Modify files locally
2. git add
3. git commit
4. git push
5. Railway auto-deploys

No manual deploys.

---

## HEALTHCHECK

Expected endpoint:
- `/health` → HTTP 200

If unavailable → rollback to last tag.

---

## RELEASE POLICY

- All releases are frozen via git tag
- Current release: v1.0.0-freeze
- Any new work must start from a new version branch

---

## RECOVERY

If PROD breaks:
1. Checkout last tag
2. git push
3. Railway redeploys automatically

No partial fixes.

---

## CONTACT

System owner: TOTEM core
Single source of truth: this repository

END OF RUNBOOK
