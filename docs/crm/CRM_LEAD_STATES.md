# CRM_LEAD_STATES

Purpose:
Canonical lifecycle states for CRM leads.
Backend-driven, provider-agnostic.

---

## Canonical states

- new
  Lead created, not yet processed.

- contacted
  Initial contact attempted or made.

- qualified
  Lead validated as potential client.

- converted
  Lead converted into booking/client.

- lost
  Lead closed without conversion.

---

## Final states

- converted
- lost

---

## Rules

- Transitions are backend-only
- Final states are immutable
- One lead converts to at most one booking/client

End of document.
