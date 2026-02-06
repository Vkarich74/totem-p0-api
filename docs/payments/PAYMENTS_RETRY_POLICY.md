# PAYMENTS_RETRY_POLICY

Purpose:
Define retry and restart rules
for payment attempts.

---

## Retry (same payment)

Allowed:
- frontend polling retries
- network retries
- webhook redelivery

Not allowed:
- restarting provider flow
- reusing failed provider payment_id

---

## Restart (new payment)

Allowed when:
- previous payment status = failed
- previous payment status = canceled

Rules:
- new payment_id MUST be created
- previous payment becomes inactive
- booking remains in pending_payment

---

## Forbidden cases

- restart payment when status = paid
- create multiple active payments
- reuse provider_payment_id

---

## UX implication

- user may retry payment
- user never sees old payment attempts
- only latest active payment is visible

End of document.
