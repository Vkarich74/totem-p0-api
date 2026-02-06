# ASYNC_JOB_STATES

Purpose:
Canonical job states for background processing.

---

## States

- queued
- running
- completed
- failed
- canceled

---

## Rules

- completed is final
- failed may be retried
- canceled is final
- state transitions are backend-only

---

## Idempotency

- job_key MUST be idempotent
- same job_key cannot produce side effects twice

End of document.
