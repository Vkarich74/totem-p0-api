# OWNER_UX_FLOW

Purpose:
Describe owner/admin UX flows.
No business logic in frontend.

---

## Core screens

- dashboard
- bookings list
- booking details
- staff management
- reports

---

## Booking actions flow

- owner/admin selects booking
- frontend sends action request
- backend validates role + state
- backend updates state
- frontend reflects new state

---

## Error handling

- frontend reacts to error codes
- no implicit retries
- clear user feedback

End of document.
