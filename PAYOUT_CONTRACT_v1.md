# PAYOUT_CONTRACT v1 — TOTEM
VERSION: 2026-02-06
STATUS: CANONICAL / FROZEN
BLOCK: PAYOUTS_FINALIZATION

This document defines the canonical payout and settlement logic in TOTEM.
No real money movement is performed in this version.

==================================================

## 1. PURPOSE

The payout contract defines how payments are converted into logical payouts
and grouped into settlement batches, independently of any payment provider.

This contract is provider-agnostic and safe for dry-run execution.

==================================================

## 2. ENTITIES

### 2.1 Payment
Source of funds. Created only after `payment.succeeded`.

INVARIANTS:
- immutable
- currency = KGS
- all amounts are integers

--------------------------------------------------

### 2.2 Payout
Logical payout to a master or salon.

RELATION:
1 payment → 1 payout

STRUCTURE:
```json
{
  "payout_id": "string",
  "payment_id": "string",
  "booking_id": 123,
  "recipient_id": "string",
  "amount": 1000,
  "currency": "KGS",
  "status": "pending | ready | settled",
  "created_at": "ISO-8601",
  "settlement_batch_id": "string | null"
}
