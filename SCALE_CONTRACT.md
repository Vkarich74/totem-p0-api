# SCALE CONTRACT v1

## BOOKINGS

pending_payment → expired timeout (minutes):
- VALUE: 15

Manual cancel allowed:
- before payment: YES
- after payment: NO

Repeat booking allowed:
- same slot: NO
- same request_id: NO


## PAYMENTS

Active payment per booking:
- enforced by DB: YES

Retry payment allowed after failure:
- YES


## PAYOUTS

Payout creation moment:
- on payment.confirmed

Payout retry on failure:
- NO


## SETTLEMENT

Settlement type:
- automatic

Settlement period:
- daily
