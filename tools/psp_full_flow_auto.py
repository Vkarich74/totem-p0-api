#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — PSP FULL FLOW AUTO
Includes:
- SEND BACKUP PSP EMAIL (log)
- WAIT BOTH MODE fixation
- CONTRACT / SANDBOX PREP PACK

Docs only. Provider-agnostic.
Auto git commit + push.
"""

from pathlib import Path
import subprocess
import sys
from datetime import datetime

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
LOGS = ROOT / "tools" / "_logs"
COMMIT_MSG = "docs: psp full flow (send + wait + contract prep)"

NOW_UTC = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

FILES = {
    "PSP_EMAIL_SENT_LOG.md": f"""# PSP EMAIL SENT — LOG

## STATUS
SENT / FIXED

## PROVIDER
Backup PSP #1

## TIMESTAMP (UTC)
{NOW_UTC}

## CONTENT
Email sent using canonical template:
docs/prod/PSP_CONTACT_EMAIL.md

## NOTE
No response yet. Awaiting reply.

END
""",

    "PSP_WAIT_MODE.md": """# PSP WAIT MODE — BOTH

## STATUS
ACTIVE

## PRIMARY PSP
FreedomPay — WAIT

## BACKUP PSP
Selected — WAIT

## RULES
- No code changes
- No provider-specific integration
- On first positive response → move to SANDBOX / CONTRACT

END
""",

    "PSP_CONTRACT_PREP.md": """# PSP CONTRACT PREPARATION PACK

## PURPOSE
Immediate start after PSP approval.

---

## REQUIRED FROM PSP
- API base URL
- Public key
- Secret key
- Webhook endpoint
- Signature method
- Sandbox access
- Supported currencies
- Refund rules
- Payout schedule

---

## INTERNAL READY CHECK
- Payments Core Canon: READY
- Webhook Abstract: READY
- Refund Policy: READY
- Audit & Logging: READY

---

## SANDBOX FLOW (TARGET)
1. Create payment_intent
2. Complete sandbox payment
3. Receive webhook
4. Confirm booking
5. Issue refund
6. Verify audit trail

---

## EXIT CRITERIA
- Sandbox payment = success
- Refund tested
- Logs complete
- Ready for PROD switch

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
    LOGS.mkdir(parents=True, exist_ok=True)

    for name, content in FILES.items():
        path = DOCS / name
        path.write_text(content.strip() + "\n", encoding="utf-8")
        print(f"[OK] {name} created")

    # snapshot log
    snap = LOGS / f"psp_full_flow_snapshot_{NOW_UTC.replace(':','').replace('-','')}.txt"
    snap.write_text(
        f"UTC: {NOW_UTC}\nFILES:\n" + "\n".join(f"- {k}" for k in FILES.keys()) + "\n",
        encoding="utf-8"
    )
    print(f"[OK] snapshot log created: {snap.name}")

    if (ROOT / ".git").exists():
        run(["git", "add", "docs/prod", "tools/_logs"])
        run(["git", "commit", "-m", COMMIT_MSG])
        run(["git", "push"])

    print("[DONE] PSP FULL FLOW AUTO COMPLETED")

if __name__ == "__main__":
    main()
