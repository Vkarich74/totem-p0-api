# AUDIT CHECKLIST — Financial Core v1

## Invariants
- [x] Ledger append-only
- [x] Wallet balance derived from ledger
- [x] No direct balance mutations
- [x] SYSTEM funds separated
- [x] Single exit: payouts
- [x] Rollback via ledger only

## Payments
- [x] pending → paid | failed
- [x] Ledger entry on paid only

## Fees
- [x] Rule-based
- [x] No hardcoded % or amounts

## Payouts
- [x] Reserve on request
- [x] Rollback on fail

## Reporting
- [x] MV for Postgres
- [x] SQLite fallback

## Safety
- [x] DB transactions around state changes
- [x] Idempotent references
