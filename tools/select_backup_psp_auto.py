#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — BACKUP PSP SELECTION (AUTO)

Creates:
- BACKUP_PSP_SELECTED.md
- PSP_PROVIDER_REQUIREMENTS.md
- PSP_CONTACT_EMAIL.md

Rules:
- Docs only
- Provider-agnostic
- Git auto commit + push
"""

from pathlib import Path
import subprocess
import sys
from datetime import datetime

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
COMMIT_MSG = "docs: backup psp selected (auto)"

FILES = {
    "BACKUP_PSP_SELECTED.md": """# BACKUP PSP — SELECTED

## STATUS
SELECTED / SECONDARY PROVIDER

## SELECTION RULE
Chosen as backup PSP in case primary provider is unavailable or delayed.

## POSITION
- Priority: Backup #1
- Integration: Provider Adapter (after approval)
- No code changes before contract

## NEXT ACTION
- Send contact email
- Await response
- If approved → SANDBOX PREP applies

END
""",

    "PSP_PROVIDER_REQUIREMENTS.md": """# PSP PROVIDER REQUIREMENTS — CANON

## REQUIRED CAPABILITIES
- Online payments (cards)
- API access
- Webhooks (signed)
- Refund support
- Payouts to merchant
- Sandbox environment

## SECURITY
- Webhook signature verification
- Idempotent events
- No secrets on frontend

## COMPLIANCE
- KYC / KYB
- Chargeback handling
- Audit logs

## INTEGRATION NOTES
- Provider is event source only
- TOTEM canon applies without changes

END
""",

    "PSP_CONTACT_EMAIL.md": """# PSP CONTACT EMAIL — TEMPLATE

Subject: Partnership inquiry — online payments integration

Hello,

We are preparing to launch a production platform for service bookings with integrated online payments.

We already have a finalized payment architecture and are currently selecting a payment service provider for a long-term partnership.

Could you please share:
- API documentation
- Sandbox access details
- Webhook & refund capabilities
- Contract and onboarding requirements

We are ready to move to sandbox testing immediately.

Best regards,
TOTEM Team

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
        path.write_text(content.strip() + "\n", encoding="utf-8")
        print(f"[OK] {name} created")

    if (ROOT / ".git").exists():
        run(["git", "add", "docs/prod"])
        run(["git", "commit", "-m", COMMIT_MSG])
        run(["git", "push"])

    print("[DONE] BACKUP PSP SELECTED AND FIXED")

if __name__ == "__main__":
    main()
