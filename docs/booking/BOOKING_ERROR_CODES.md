# BOOKING_ERROR_CODES

Purpose:
Stable and deterministic error codes for booking lifecycle.
Errors are part of the contract between backend and frontend.

---

## Principles

- Error codes are stable
- Error codes are language-agnostic
- Frontend reacts by code, not by message
- Messages are optional and replaceable

---

## Error codes

### BOOKING_NOT_FOUND
Booking does not exist or not accessible.

---

### BOOKING_INVALID_STATE
Requested action is not allowed in current booking state.

Example:
- trying to complete booking that is not paid
- trying to cancel completed booking

---

### BOOKING_FINAL_STATE
Booking is already in final state.
No further transitions allowed.

Final states:
- completed
- canceled
- expired
- no_show

---

### BOOKING_PAYMENT_REQUIRED
Action requires booking to be paid.

Example:
- attempt to complete unpaid booking

---

### BOOKING_TTL_EXPIRED
Booking expired due to TTL.
No further payment or confirmation allowed.

---

### BOOKING_NO_SHOW_LOCKED
Booking already marked as no_show.
Action not allowed.

---

### BOOKING_POLICY_VIOLATION
Action violates business policy.

Examples:
- late cancel after cutoff
- revive expired booking
- invalid role attempting transition

---

## Error response shape (example)

{
  "error": "BOOKING_INVALID_STATE",
  "message": "Booking cannot be completed in current state"
}

Message is optional.
Error code is mandatory.

End of document.
