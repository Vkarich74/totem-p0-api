# PAYMENTS WEBHOOK CANONICAL FLOW

Endpoint:
POST /payments/webhook

Requirements:
- signature verification
- idempotency check
- replay protection
- append-only event log

Failure handling:
- retry-safe
- duplicate-safe
