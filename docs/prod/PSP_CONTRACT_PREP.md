# PSP CONTRACT PREPARATION PACK

## PURPOSE
Immediate start after PSP approval.

---

## REQUIRED FROM PSP
- API base URL
- Public key
- Secret key
- Webhook endpoint
- Signature method
- Sandbox access
- Supported currencies
- Refund rules
- Payout schedule

---

## INTERNAL READY CHECK
- Payments Core Canon: READY
- Webhook Abstract: READY
- Refund Policy: READY
- Audit & Logging: READY

---

## SANDBOX FLOW (TARGET)
1. Create payment_intent
2. Complete sandbox payment
3. Receive webhook
4. Confirm booking
5. Issue refund
6. Verify audit trail

---

## EXIT CRITERIA
- Sandbox payment = success
- Refund tested
- Logs complete
- Ready for PROD switch

END
