# HANDOFF — PAYMENTS STACK (FINAL)

Date: 2026-02-10  
Status: FINAL FREEZE  
Mode: EXECUTION ONLY

---

## SCOPE (FROZEN)

### PAYMENTS CORE
- State Machine
- Provider-agnostic adapter contract
- Webhook canonical flow
- Idempotency rules
- Audit / forensics
- Canonical SQL (intents / events / refunds)

### PAYMENTS POST-CORE
- Sandbox mock provider
- Reporting / Finance v1
- Webhook stub

### OPS HARDENING
- Reconciliation job v1
- Timeout & retry logic
- Stuck detection views

### MONITORING / ALERTS
- Failure / refund / SLA metrics
- Alert rules v1
- Ops health views

---

## DATABASE
- PostgreSQL (Railway)
- All SQL applied via psql
- No destructive migrations
- Append-only philosophy

---

## RULES
- Backend core: DO NOT TOUCH
- Schema: DO NOT CHANGE
- States: DO NOT CHANGE

Allowed:
- Real provider adapter
- Sandbox / production keys
- Env configuration

---

## CURRENT STATE
Payments stack is:
- Provider-ready
- Ops-stable
- Monitoring-enabled
- Scalable

Next logical step:
REAL PROVIDER ADAPTER

This document is the single source of truth.
Must be pasted as FIRST MESSAGE in any new chat.

END OF HANDOFF
