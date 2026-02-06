# PAYMENTS_DOMAIN

Purpose:
Internal payment domain model.
Does NOT replace Public Flow Contract.
Used by backend as source of truth.

Entity: Payment

Required fields:
- payment_id (UUID)
- object_type (booking | order | service)
- object_id (string)
- amount (integer, minor units)
- currency (ISO 4217)
- status (canonical)
- created_at (datetime)
- updated_at (datetime)

Optional fields:
- provider
- provider_payment_id
- fail_reason
- metadata (json)

Rules:
- Payment is created by backend only
- Frontend never changes payment status
- Provider events are normalized into canonical statuses
- One payment affects one business object

Relation to Public Flow:
- POST /public/payments/start creates Payment
- Booking stays in pending_payment until Payment = paid
