# CRM_WEBHOOKS

Purpose:
Define webhook interactions for CRM leads.

---

## Incoming webhooks

- create_lead
- update_lead_status

---

## Idempotency

- event_id required
- duplicate events accepted and ignored logically

---

## Security

- signature verification required
- secrets stored server-side only

---

## Mapping

- webhook -> lead creation/update
- no direct booking creation without validation

End of document.
