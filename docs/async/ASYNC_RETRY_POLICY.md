# ASYNC_RETRY_POLICY

Purpose:
Retry and backoff rules for async jobs.

---

## Retryable failures

- network errors
- transient DB errors
- provider timeouts

---

## Non-retryable failures

- validation errors
- permission errors
- logical invariant violations

---

## Backoff strategy

- exponential backoff
- max retry count enforced
- dead-letter after exhaustion

End of document.
