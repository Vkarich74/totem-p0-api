# PERFORMANCE_SCALE

Purpose:
Define performance assumptions and scaling rules.

---

## Load assumptions

- Burst traffic possible
- Async preferred for heavy work
- External dependencies are slow/unreliable

---

## Bottlenecks

- Webhooks
- Payment reconciliation
- Reporting queries

---

## Scaling rules

- Horizontal scaling preferred
- Stateless backend
- Queues for burst absorption

---

## Limits

- Rate limits on public APIs
- Backpressure via queues
- Graceful degradation

End of document.
