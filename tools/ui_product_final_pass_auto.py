#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — UI / PRODUCT FINAL PASS AUTO

Includes:
- Public Booking Flow UX
- Cabinet UX (Master / Salon)
- User Edge-Cases Handling

Docs only. No backend changes.
Auto git commit + push.
"""

from pathlib import Path
import subprocess
import sys

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
COMMIT_MSG = "docs: ui product final pass canon"

FILES = {
    "UI_PUBLIC_BOOKING_FLOW.md": """# UI — PUBLIC BOOKING FLOW (CANON)

## GOAL
User must understand what happens at every step.

---

## STEPS
1. Select service
2. Select master
3. Select time slot
4. Confirm booking
5. Payment (if required)
6. Success / failure screen

---

## UX RULES
- no dead ends
- clear call-to-action
- errors explain next step
- loading states visible

---

## FAILURE STATES
- slot unavailable → refresh calendar
- payment pending → show timer
- payment failed → retry / cancel

END
""",

    "UI_CABINET_UX.md": """# UI — CABINET UX (CANON)

## ROLES
- master
- salon

---

## MASTER CABINET
- upcoming bookings
- past bookings
- availability control
- earnings summary (placeholder)

---

## SALON CABINET
- masters list
- calendar overview
- booking control
- reports access

---

## UX RULES
- empty states explained
- destructive actions confirmed
- no hidden actions

END
""",

    "UI_EDGE_CASES.md": """# UI — EDGE CASES (CANON)

## NO AVAILABLE SLOTS
- explain reason
- suggest alternative date
- allow notify option (future)

---

## BOOKING EXPIRED
- explain timeout
- release slot
- suggest rebooking

---

## CANCELLATION
- explain consequences
- show refund status (if any)

---

## RULE
User is never confused about system state.

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

    print("[DONE] UI / PRODUCT FINAL PASS AUTO COMPLETED")

if __name__ == "__main__":
    main()
