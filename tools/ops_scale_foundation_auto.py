#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — OPS / SCALE FOUNDATION AUTO

Includes:
- Observability Canon
- Incident Playbook
- Backup & Recovery Strategy

Docs only. No backend changes.
Auto git commit + push.
"""

from pathlib import Path
import subprocess
import sys
from datetime import datetime

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
COMMIT_MSG = "docs: ops scale foundation canon"

FILES = {
    "OPS_OBSERVABILITY_CANON.md": """# OPS OBSERVABILITY — CANON

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

END
""",

    "INCIDENT_PLAYBOOK.md": """# INCIDENT PLAYBOOK — CANON

## PURPOSE
Act fast, don’t improvise.

---

## SEVERITY LEVELS
- P0: full outage
- P1: core functionality broken
- P2: partial degradation

---

## IMMEDIATE ACTIONS
1. Freeze deploys
2. Identify failing component
3. Preserve logs & state
4. Communicate status

---

## RECOVERY
- rollback last change
- disable affected feature
- verify system integrity

---

## POSTMORTEM
- root cause
- mitigation
- prevention

END
""",

    "BACKUP_RECOVERY_STRATEGY.md": """# BACKUP & RECOVERY STRATEGY — CANON

## PURPOSE
Recover data without panic.

---

## BACKUPS
- database: daily
- retention: 7–30 days
- encrypted at rest

---

## RECOVERY
- restore to isolated environment
- verify consistency
- promote to production if valid

---

## DRILLS
- recovery steps documented
- restore tested periodically (manual)

---

## RULES
- backups are mandatory
- restore is rehearsed
- no silent failures

END
"""
}

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if p.returncode != 0:
        print(p.stderr)
        sys.exit(1)
    if p.stdout:
        print(p.stdout)

def main():
    DOCS.mkdir(parents=True, exist_ok=True)

    for name, content in FILES.items():
        path = DOCS / name
        path.write_text(content.strip() + "\\n", encoding="utf-8")
        print(f"[OK] {name} created")

    if (ROOT / ".git").exists():
        run(["git", "add", "docs/prod"])
        run(["git", "commit", "-m", COMMIT_MSG])
        run(["git", "push"])

    print("[DONE] OPS / SCALE FOUNDATION AUTO COMPLETED")

if __name__ == "__main__":
    main()
