# PAYMENT_FAILURE_MATRIX

Purpose:
Define system behavior for payment failures.

---

## Failure cases

| Case | Provider Status | System Action | Booking |
|----|----------------|---------------|---------|
| Card declined | failed | payment failed | pending_payment |
| Timeout | unknown | wait / retry | pending_payment |
| Duplicate payment | paid twice | ignore second | paid |
| Late webhook | paid | accept paid | paid |

---

## Principles

- No booking cancellation on payment failure
- Paid always wins

End of document.
