# OWNER_PERMISSIONS

Purpose:
Explicit permission matrix for owner/admin actions.

---

## Booking permissions

owner:
- cancel any booking
- complete booking (paid only)
- mark no_show
- view all bookings

admin:
- cancel booking (policy-limited)
- complete booking (paid only)
- view all bookings

staff:
- view assigned bookings
- mark no_show (policy)

---

## Salon permissions

owner:
- create / update salon
- manage staff
- view reports

admin:
- manage staff (limited)
- view reports

staff:
- no salon management

---

## Invariants

- Permission checks are mandatory
- Missing permission = deny by default

End of document.
