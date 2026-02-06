# PAYMENT_PROVIDER_CONTRACT v1 — TOTEM
VERSION: 2026-02-06
STATUS: CANONICAL / FROZEN

This document defines the provider-agnostic payment webhook contract for TOTEM.
Any payment provider MUST be adapted to this format.

--------------------------------------------------

## 1. ENDPOINT
POST /system/payment/webhook

Content-Type: application/json

--------------------------------------------------

## 2. CANONICAL EVENT FORMAT

```json
{
  "event": "payment.succeeded | payment.failed",
  "payment_id": "string",
  "booking_id": 123,
  "amount": { "base": 0, "tips": 0, "total": 0 },
  "currency": "KGS",
  "provider": "string",
  "occurred_at": "2026-02-06T00:00:00.000Z",
  "meta": { "provider_event_id": "string", "raw_status": "string" }
}
