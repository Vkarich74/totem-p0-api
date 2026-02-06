# ASYNC_JOBS_OVERVIEW

Purpose:
Define which operations must be asynchronous
and why synchronous processing is forbidden.

---

## Principles

- Async jobs are REQUIRED for non-user-blocking work
- Frontend never waits for async completion
- Backend is source of truth for job state

---

## Mandatory async operations

- webhook processing (post-accept)
- payment reconciliation
- booking TTL expiration
- no_show enforcement
- notifications (email / sms / push)
- reports and exports

---

## Forbidden sync operations

- waiting for external providers
- long DB scans
- retries with backoff
- batch updates

End of document.
