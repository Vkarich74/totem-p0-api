# OWNER_ROLES

Purpose:
Define roles and permissions for owner/admin side.
Applies to salons, staff, and system access.

---

## Roles

- owner
  Full control over salon, bookings, staff, settings.

- admin
  Operational control without ownership rights.

- staff
  Limited access to assigned bookings and schedule.

- system
  Automated actions (TTL, no_show, async jobs).

---

## Core rules

- Roles are enforced by backend only
- Frontend reflects permissions
- One user may have multiple roles across salons

End of document.
