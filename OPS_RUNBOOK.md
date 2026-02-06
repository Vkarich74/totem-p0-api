# TOTEM — OPS RUNBOOK (PROD)

## 1. Environment

- Runtime: Railway (multi-instance)
- API: Node.js / Express
- DB: PostgreSQL (Railway)
- Mode: PROD only

---

## 2. Health Check

### API
```bash
GET /health
