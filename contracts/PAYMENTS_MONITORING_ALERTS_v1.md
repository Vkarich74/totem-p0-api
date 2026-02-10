# PAYMENTS MONITORING & ALERTS v1

Metrics:
- failure_rate
- refund_rate
- pending_over_sla

Alert Rules:
- failure_rate > 5% → CRITICAL
- refund_rate > 10% → WARNING
- pending_over_sla > 0 → WARNING

Action:
- investigate provider
- check ops reconcile job
- verify webhook delivery

Status:
ACTIVE