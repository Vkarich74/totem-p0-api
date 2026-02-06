# TOTEM — Architecture (Backend Core)

## 1. Runtime

- Node.js (Express)
- PostgreSQL (Railway, PROD)
- Stateless API (multi-instance safe)

---

## 2. Core Domains

### 2.1 Booking Core

**Tables:**
- bookings
- booking_audit_log
- idempotency_keys

**Booking statuses (DB enforced):**
- pending_payment
- paid
- expired
- cancelled
- completed

**Rules:**
- Status transitions enforced at API level
- completed allowed ONLY from paid
- expired / cancelled / completed are terminal
- Every transition is audit-logged

**Idempotency:**
- request_id → idempotency_keys
- repeated requests return stored response

---

### 2.2 Payments

**Tables:**
- payments
- payment_intents

**Rules:**
- Only one active payment per booking (DB unique index)
- Payments linked to booking_id
- Status integrity enforced by API

---

### 2.3 Catalog

**Tables:**
- salons
- masters
- services
- salon_master_services

**Notes:**
- Soft binding via slugs and service_id (text)
- No FK between bookings and catalog by design
- Enables soft-delete and historical integrity

---

## 3. Async & Scheduling

### 3.1 Async Jobs

**Table:** async_jobs

**Fields:**
- job_type
- payload (jsonb)
- status (pending | done | failed)
- attempts / max_attempts
- run_at
- idempotency_key

**Guarantees:**
- Idempotent via (job_type, idempotency_key)
- Safe retries
- No duplicate execution

---

### 3.2 Scheduler

- Guarded by system_locks
- TTL-based lock
- Single active scheduler across instances
- Used for:
  - booking TTL expiration
  - settlements
  - maintenance jobs

---

## 4. Finance & Settlements

**Tables:**
- payouts
- settlement_periods
- settlement_payout_batches
- reconciliations

**Guarantees:**
- One payout per booking
- Period-based settlement
- Financial invariants enforced by DB constraints

---

## 5. Auth & Access

### 5.1 Public Access

**Table:** public_tokens

- Rate-limited
- Salon-scoped
- Used for widget / public API

---

### 5.2 Owner / System Access

**Tables:**
- auth_users
- auth_magic_links

**Rules:**
- Role-based access
- System endpoints require X-System-Token
- Owner actions are audit-logged

---

## 6. Audit

**Tables:**
- booking_audit_log
- owner_actions_audit_log

**Properties:**
- Best-effort
- Non-blocking
- Never breaks core flow

---

## 7. Guarantees (Production)

- No duplicate bookings
- No invalid lifecycle transitions
- No double payments
- No double payouts
- Multi-instance safe
- Restart safe
