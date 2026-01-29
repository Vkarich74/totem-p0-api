# TOTEM — CORE FLOW v1

Status: FREEZE
Scope: CORE ONLY
Environment: LOCAL
Port: 8080
DB: PostgreSQL
Source of truth: Backend API

---

## STEP 1 — PUBLIC CORE FLOW (LOCAL)

### VERIFIED ACTIONS

1. CREATE BOOKING  
   - endpoint: /public/bookings  
   - result: ok  
   - request_id: 1  
   - price fixed  
   - status: pending_payment  

2. CREATE PAYMENT INTENT  
   - endpoint: /public/payments/intent  
   - intent_id: 1  
   - amount: 1000  
   - currency: KGS  
   - idempotent: true  

3. IDEMPOTENCY CHECK  
   - repeated intent call  
   - intent_id unchanged  
   - no double charge  

---

## LOCAL CORE BOUNDARY

The following steps are NOT available locally:
- payment webhook confirmation
- payouts / settlements
- reports

These steps are executed in PROD or SYSTEM mode only.

---

## CORE FLOW STATUS

LOCAL PUBLIC CORE FLOW  
→ VERIFIED  
→ STABLE  
→ FROZEN
