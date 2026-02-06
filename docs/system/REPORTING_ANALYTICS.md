# REPORTING_ANALYTICS

Purpose:
Define reporting and analytics contracts.
Read-only, privacy-aware, backend-driven.

---

## Core KPIs

- bookings_created
- bookings_completed
- revenue_total
- conversion_rate
- no_show_rate

---

## Aggregation rules

- Time-based (day/week/month)
- Salon-scoped
- Owner-scoped

---

## Data sources

- bookings
- payments
- leads

---

## Privacy rules

- No PII in exports by default
- Aggregated data preferred
- Access controlled by role

---

## Exports

- CSV / JSON
- Read-only endpoints
- Rate-limited

End of document.
