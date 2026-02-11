#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — SOFT LAUNCH CHECKLIST AUTO

Includes:
- Pre-launch checklist
- Go / No-Go criteria
- Launch day runbook

Docs only. No backend changes.
Auto git commit + push.
"""

from pathlib import Path
import subprocess
import sys

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
COMMIT_MSG = "docs: soft launch checklist canon"

FILES = {
    "SOFT_LAUNCH_CHECKLIST.md": """# SOFT LAUNCH CHECKLIST — CANON

## PRE-LAUNCH
- Public booking flow works end-to-end
- Calendar prevents double booking
- Error states are user-readable
- Admin access verified
- Logs & monitoring active

---

## LIMITED SCOPE
- Limited number of salons / masters
- Controlled traffic
- Manual support available

---

## COMMUNICATION
- Internal launch notice
- Support contact ready

END
""",

    "GO_NO_GO_CRITERIA.md": """# GO / NO-GO CRITERIA — CANON

## GO IF
- No P0 / P1 incidents
- Booking success rate acceptable
- No data integrity issues

---

## NO-GO IF
- Double bookings detected
- Payment flow broken (when enabled)
- Repeated critical errors

END
""",

    "LAUNCH_DAY_RUNBOOK.md": """# LAUNCH DAY RUNBOOK — CANON

## T-24 HOURS
- Freeze deploys
- Verify backups
- Verify monitoring

---

## T-0
- Open access
- Monitor metrics
- Standby for incidents

---

## POST-LAUNCH
- Review metrics
- Collect feedback
- Decide scale-up or rollback

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

    print("[DONE] SOFT LAUNCH CHECKLIST AUTO COMPLETED")

if __name__ == "__main__":
    main()
