# PAYMENTS_RACE_CONDITIONS

Purpose:
Define deterministic rules
for conflicting or late events.

---

## Priority rules

1. paid has absolute priority
2. paid is FINAL
3. paid cannot be reverted

---

## Late events

Case:
- webhook paid arrives AFTER TTL

Rule:
- paid WINS
- booking moves to paid

---

## Conflicting events

Case:
- canceled and paid arrive close in time

Rule:
- paid WINS
- canceled is ignored

---

## Duplicate events

Case:
- same webhook delivered multiple times

Rule:
- idempotency key blocks reprocessing

---

## System crashes

Rule:
- state restored from last persisted status
- no recomputation from events

End of document.
