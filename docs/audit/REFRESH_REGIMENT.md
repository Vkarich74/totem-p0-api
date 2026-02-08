# Materialized Views — Manual Refresh Regiment

## Scope
Applies to:
- mv_wallet_balance_snapshot
- mv_ledger_daily_summary

Schema: totem_test

## Why manual
- Financial safety
- No background jobs
- Deterministic audit windows

## When to refresh
- After end-of-day (EOD)
- Before generating audit / accounting reports
- Before external audit snapshot

## Who can refresh
- Database admin only (postgres role)
- Read-only users are NOT allowed

## How to refresh (SQL)
```sql
SET search_path TO totem_test;

REFRESH MATERIALIZED VIEW mv_wallet_balance_snapshot;
REFRESH MATERIALIZED VIEW mv_ledger_daily_summary;
