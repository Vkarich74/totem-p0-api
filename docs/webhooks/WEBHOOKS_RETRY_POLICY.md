# WEBHOOKS_RETRY_POLICY

Purpose:
Define retry and backoff behavior.

---

## Retry rules

- 5xx responses are retryable
- Network timeouts are retryable
- 4xx responses are NOT retried

---

## Backoff (logical)

- Exponential backoff recommended
- Jitter allowed
- No assumption on provider retry schedule

---

## Idempotency guarantee

- Retries MUST NOT create duplicate side effects
- Reprocessing same event is safe

End of document.
