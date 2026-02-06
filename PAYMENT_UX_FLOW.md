# PAYMENT_UX_FLOW (MOCK)

Purpose:
Describe frontend UX without real payment provider.
Does NOT define API.

Screens:

INIT:
- User clicks Pay
- Public API called
- Payment created

WAIT:
- Frontend polls backend by payment_id
- Allowed statuses: created, pending
- Loader shown

SUCCESS:
- Status = paid
- Show confirmation
- Proceed to next step

FAIL:
- Status = failed
- Show error
- Retry allowed

CANCELED / EXPIRED:
- Status = canceled
- Inform user
- Restart allowed

Rules:
- No payment logic on frontend
- No provider knowledge on frontend
- Backend controls TTL
