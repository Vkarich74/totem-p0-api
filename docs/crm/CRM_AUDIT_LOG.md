# CRM_AUDIT_LOG

Purpose:
Audit trail for lead lifecycle changes.

---

## Logged events

- lead_created
- state_changed
- lead_converted
- lead_lost

---

## Fields

- lead_id
- actor_id (user/system)
- action
- previous_state
- new_state
- timestamp

---

## Rules

- Logs are append-only
- Logs are immutable

End of document.
