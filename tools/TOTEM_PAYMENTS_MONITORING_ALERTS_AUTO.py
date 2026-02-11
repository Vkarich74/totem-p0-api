# TOTEM_PAYMENTS_MONITORING_ALERTS_AUTO.py
# MODE: EXECUTION ONLY / MAX AUTO
# PURPOSE:
# - Monitoring & Alerts for Payments
# - SQL views for metrics
# - Alert rules (documented)
# - Apply SQL via psql (AS IS)
# - Report + commit + push

import os
import subprocess
from datetime import datetime

BASE = r"C:\Users\Vitaly\Desktop\odoo-local"
SQL_DIR = os.path.join(BASE, "sql")
REPORTS = os.path.join(BASE, "reports")
DOCS = os.path.join(BASE, "contracts")

os.makedirs(SQL_DIR, exist_ok=True)
os.makedirs(REPORTS, exist_ok=True)
os.makedirs(DOCS, exist_ok=True)

TS = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

# ---------------- MONITORING SQL ----------------
SQL_FILE = os.path.join(SQL_DIR, "payments_monitoring_alerts_v1.sql")
with open(SQL_FILE, "w", encoding="utf-8") as f:
    f.write("""
-- Payments failure rate
CREATE OR REPLACE VIEW payments_failure_rate_v1 AS
SELECT
  COUNT(*) FILTER (WHERE status = 'failed')::float / NULLIF(COUNT(*),0) AS failure_rate
FROM payment_intents;

-- Payments refund rate
CREATE OR REPLACE VIEW payments_refund_rate_v1 AS
SELECT
  COUNT(*) FILTER (WHERE status = 'refunded')::float / NULLIF(COUNT(*),0) AS refund_rate
FROM payment_intents;

-- Pending longer than SLA
CREATE OR REPLACE VIEW payments_pending_sla_v1 AS
SELECT
  COUNT(*) AS pending_over_sla
FROM payment_intents
WHERE status = 'pending'
  AND created_at < now() - interval '15 minutes';
""".strip())

# ---------------- APPLY SQL VIA PSQL (AS IS) ----------------
PSQL_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PSQL_CMD = (
    'psql "postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU'
    '@interchange.proxy.rlwy.net:55042/railway" '
    f'-f "{SQL_FILE}"'
)

subprocess.check_call(
    f'cd "{PSQL_BIN}" && {PSQL_CMD}',
    shell=True
)

# ---------------- ALERT RULES DOC ----------------
ALERT_DOC = os.path.join(DOCS, "PAYMENTS_MONITORING_ALERTS_v1.md")
with open(ALERT_DOC, "w", encoding="utf-8") as d:
    d.write("""
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
""".strip())

# ---------------- REPORT ----------------
REPORT_FILE = os.path.join(
    REPORTS, f"PAYMENTS_MONITORING_ALERTS_REPORT_{TS}.md"
)

with open(REPORT_FILE, "w", encoding="utf-8") as r:
    r.write(f"""
# PAYMENTS MONITORING / ALERTS REPORT

Timestamp (UTC): {TS}

Created:
- monitoring SQL views
- alert rules documentation

Status:
DONE
""".strip())

# ---------------- GIT ----------------
subprocess.check_call(["git", "add", "sql", "contracts", "reports"])
subprocess.check_call(
    ["git", "commit", "-m", "payments: monitoring & alerts v1"]
)
subprocess.check_call(["git", "push"])

print("OK: PAYMENTS MONITORING / ALERTS — DONE")
print("REPORT:", REPORT_FILE)
