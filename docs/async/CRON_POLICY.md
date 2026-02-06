# CRON_POLICY

Purpose:
Define scheduled jobs and timing guarantees.

---

## Scheduled jobs

- booking_ttl_expire
- payment_reconciliation
- no_show_check
- cleanup_logs

---

## Timing rules

- cron is best-effort
- delays are tolerated
- cron MUST be idempotent

---

## Failure handling

- failures logged
- retries handled by async job runner
- cron never blocks system startup

End of document.
