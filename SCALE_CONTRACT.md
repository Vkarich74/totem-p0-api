# SCALE CONTRACT v1

## BOOKINGS

pending_payment → expired timeout (minutes):
- VALUE:

Manual cancel allowed:
- before payment: YES / NO
- after payment: YES / NO

Repeat booking allowed:
- same slot: YES / NO
- same request_id: YES / NO


## PAYMENTS

Active payment per booking:
- enforced by DB: YES

Retry payment allowed after failure:
- YES / NO


## PAYOUTS

Payout creation moment:
- on payment.confirmed
- batch (periodic)

Payout retry on failure:
- YES / NO


## SETTLEMENT

Settlement type:
- automatic
- manual
- mixed

Settlement period:
- daily / weekly / monthly
