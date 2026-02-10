# PAYMENTS STATE MACHINE (FREEZE)

Statuses:
- created
- pending
- authorized
- captured
- failed
- canceled
- refunded

Rules:
- created -> pending
- pending -> authorized | failed | canceled
- authorized -> captured | canceled
- captured -> refunded
- failed / canceled / refunded are terminal

Immutability:
- terminal states cannot transition further
