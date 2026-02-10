# OPS OBSERVABILITY — CANON

## PURPOSE
Detect failures before users do.

---

## CORE SIGNALS
- API availability
- Error rate (4xx / 5xx)
- Latency (p95 / p99)
- Webhook failures
- Booking conflicts

---

## HEALTH CHECKS
- /health endpoint
- DB connectivity
- External dependencies status

---

## ALERTING RULES
- sustained 5xx > threshold
- webhook delivery failures
- payment / booking desync
- elevated latency

---

## RULES
- alerts are actionable
- no noisy alerts
- ops first, analytics later

END\n