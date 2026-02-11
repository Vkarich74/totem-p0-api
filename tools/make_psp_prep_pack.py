#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — PSP PREP PACK
Includes:
- SANDBOX_PREP.md
- PSP_EVAL_MATRIX.md
- PSP_SHORTLIST.md

Rules:
- Docs only
- Provider-agnostic
- Git auto commit + push
"""

from pathlib import Path
import subprocess
from datetime import datetime
import sys

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"

FILES = {
    "SANDBOX_PREP.md": """# SANDBOX PREPARATION — PAYMENTS CORE

## PURPOSE
Be ready to integrate any PSP within 24h after approval.

---

## REQUIRED FROM PSP
- API base URL
- Public key
- Secret key
- Webhook endpoint
- Webhook signature method
- Supported currencies
- Refund support
- Payout timing

---

## INTERNAL CHECKLIST
- payment_intent lifecycle matches canon
- webhook idempotency enforced
- signature validation implemented
- refund flow tested
- audit log populated
- sandbox → prod switch documented

---

## EXIT CRITERIA
- sandbox payment → paid
- webhook received
- booking confirmed
- refund processed
- audit trail complete

END
""",

    "PSP_EVAL_MATRIX.md": """# PSP EVALUATION MATRIX

| PSP | Region | Webhooks | Refunds | Payout | KYC | Notes |
|-----|--------|----------|---------|--------|-----|------|
| FreedomPay | ? | ? | ? | ? | ? | Primary |
| Backup #1 |  |  |  |  |  |  |
| Backup #2 |  |  |  |  |  |  |

---

## SCORING (0–5)
- API quality
- Docs clarity
- Support response
- Contract terms
- Long-term fit

END
""",

    "PSP_SHORTLIST.md": """# PSP SHORTLIST (BACKUP)

## STATUS
Secondary providers. No contact yet.

---

## CANDIDATES

### PSP #1
- Region:
- Website:
- Notes:

### PSP #2
- Region:
- Website:
- Notes:

---

## RULES
- No integration before contract
- No SDK before approval
- Canon contracts apply

END
"""
}

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if p.returncode != 0:
        print(p.stderr)
        sys.exit(1)
    print(p.stdout)

def main():
    DOCS.mkdir(parents=True, exist_ok=True)

    for name, content in FILES.items():
        path = DOCS / name
        path.write_text(content.strip() + "\n", encoding="utf-8")
        print(f"[OK] {name} created")

    if (ROOT / ".git").exists():
        run(["git", "add", "docs/prod"])
        run(["git", "commit", "-m", "docs: psp prep pack"])
        run(["git", "push"])

    print("[DONE] PSP PREP PACK completed")

if __name__ == "__main__":
    main()
