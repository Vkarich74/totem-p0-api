# TOTEM — RELEASE STATUS (MINIMAL)

## Scope
Backend-only. Source of truth = PostgreSQL (Railway).
Frontend / UI — out of scope.

## Frozen Blocks
- FINANCIAL CORE — ❄️ FREEZE
- AUDIT / REPORTING — ❄️ FREEZE
- CALENDAR v1 — ❄️ FREEZE
- BOOKING ↔ CALENDAR — ❄️ FREEZE
- OWNER / MASTER PERMISSIONS (CORE) — ❄️ FREEZE

## Data Consistency (Read-only)
Checked at: 2026-02-08

### Findings (not fixed by design)
1. `calendar_slots.request_id IS NULL` — 4 rows  
   Impact: idempotency invariant violated for legacy/test data.

2. `master_salon` orphan:
   - master_id: `test-master`
   - salon_id: `test-salon`

No overlaps. No critical structural breaks.

## Live API
- POST /calendar/reserve
- GET  /calendar/master/:master_id

## Notes
- No payment provider
- No UI logic
- No data mutations performed during checks
