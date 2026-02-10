# REPORTING CONTRACT v1 — CANON

## PURPOSE
Define reporting structure before any implementation.

---

## ROLES
- master
- salon
- owner

---

## CORE METRICS

### BOOKINGS
- total bookings
- confirmed
- canceled
- expired
- no-show

### PAYMENTS
- total amount
- paid
- refunded
- pending

### OPERATIONS
- average booking duration
- utilization rate
- cancellation rate

---

## DATA SOURCES
- bookings
- payment_intents
- payment_events

---

## VISIBILITY
- master → own data
- salon → salon scope
- owner → global

---

## FORMAT
- daily summary
- monthly summary
- CSV / JSON export

END
