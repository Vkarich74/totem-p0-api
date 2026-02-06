# WEBHOOKS_AUDIT_LOG

Purpose:
Ensure traceability and post-mortem analysis.

---

## What is logged

- event_id
- source
- event_type
- received_at
- processing_status
- related entity id (payment_id, booking_id, etc)

---

## Payload storage

- Raw payload stored for audit
- Retention policy defined separately

---

## Correlation

- Logs link webhook -> internal entity
- Enables full event reconstruction

End of document.
