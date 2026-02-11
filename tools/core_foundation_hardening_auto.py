#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — CORE FOUNDATION HARDENING AUTO
Includes:
- CALENDAR / BOOKING HARDENING
- REPORTING CONTRACT v1
- LEGAL / TERMS PREP (PAYMENTS)

Docs only. No backend changes.
Auto git commit + push.
"""

from pathlib import Path
import subprocess
import sys
from datetime import datetime

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
COMMIT_MSG = "docs: calendar booking hardening + reporting + legal prep"

NOW_UTC = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

FILES = {
    "BOOKING_LOCK_RULES.md": """# BOOKING & CALENDAR HARDENING — CANON

## PURPOSE
Prevent race conditions, double bookings and inconsistent states.

---

## CORE RULES

1. One master cannot have overlapping bookings.
2. Booking creation acquires a time-slot lock.
3. Lock is released only by:
   - payment failure / timeout
   - explicit cancellation
4. Paid booking is immutable in time.
5. Calendar is global per master (cross-salon).

---

## STATES

created
→ pending_payment
→ confirmed
→ canceled
→ expired

---

## TIMEOUT POLICY
- pending_payment timeout: configurable
- on timeout → booking.expired → slot released

---

## FORBIDDEN
- manual override of confirmed booking
- parallel writes to same slot
- frontend-side conflict resolution

END
""",

    "REPORTING_CONTRACT_v1.md": """# REPORTING CONTRACT v1 — CANON

## PURPOSE
Define reporting structure before any implementation.

---

## ROLES
- master
- salon
- owner

---

## CORE METRICS

### BOOKINGS
- total bookings
- confirmed
- canceled
- expired
- no-show

### PAYMENTS
- total amount
- paid
- refunded
- pending

### OPERATIONS
- average booking duration
- utilization rate
- cancellation rate

---

## DATA SOURCES
- bookings
- payment_intents
- payment_events

---

## VISIBILITY
- master → own data
- salon → salon scope
- owner → global

---

## FORMAT
- daily summary
- monthly summary
- CSV / JSON export

END
""",

    "TERMS_PAYMENTS_DRAFT.md": """# PAYMENTS TERMS — DRAFT

## PURPOSE
User-facing rules for payments and refunds.

---

## PAYMENTS
- payment required to confirm booking
- prices defined by master or salon
- currency shown before payment

---

## CANCELLATIONS
- cancellation before payment → no charge
- cancellation after payment → refund policy applies

---

## REFUNDS
- initiated by merchant owner
- processed to original payment method
- timing depends on PSP

---

## LIABILITY
- platform acts as technical intermediary
- service responsibility lies with merchant
- disputes handled per PSP rules

---

## ACCEPTANCE
Using the platform implies acceptance of these terms.

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

    print("[DONE] CORE FOUNDATION HARDENING AUTO COMPLETED")

if __name__ == "__main__":
    main()
