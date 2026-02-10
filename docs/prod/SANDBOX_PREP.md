# SANDBOX PREPARATION — PAYMENTS CORE

## PURPOSE
Be ready to integrate any PSP within 24h after approval.

---

## REQUIRED FROM PSP
- API base URL
- Public key
- Secret key
- Webhook endpoint
- Webhook signature method
- Supported currencies
- Refund support
- Payout timing

---

## INTERNAL CHECKLIST
- payment_intent lifecycle matches canon
- webhook idempotency enforced
- signature validation implemented
- refund flow tested
- audit log populated
- sandbox → prod switch documented

---

## EXIT CRITERIA
- sandbox payment → paid
- webhook received
- booking confirmed
- refund processed
- audit trail complete

END
