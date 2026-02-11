#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM - PAYMENTS CORE DOCS PACK (provider-agnostic)
Execution rules:
- Writes ONLY docs/prod/*.md
- Creates snapshot logs
- If inside a git repo, runs: git add -> git commit -> git push
Stop on any error.
"""

from __future__ import annotations
import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS_DIR = ROOT / "docs" / "prod"
LOG_DIR = ROOT / "tools" / "_logs"

COMMIT_MESSAGE = "docs: payments core canon"

FILES = {
    "PAYMENTS_CONTRACT.md": r"""# PAYMENTS CONTRACT — TOTEM (CANON)

## STATUS
LOCKED / PROVIDER-AGNOSTIC

## CORE PRINCIPLE
Payment provider is a SOURCE OF EVENTS, never a source of business logic.

---

## ROLES

merchant_type:
- master (individual)
- salon (legal entity)

merchant_owner:
- master → master himself
- salon → salon owner

Only merchant_owner can initiate refund.

---

## CORE ENTITIES

payment_intent
- id
- booking_id
- merchant_type
- merchant_id
- amount
- currency
- status
- created_at

transaction
- id
- payment_intent_id
- external_tx_id
- provider
- status
- created_at

payment_event
- id
- provider
- event_id
- event_type
- status
- raw
- created_at

refund
- id
- payment_intent_id
- initiated_by
- reason
- status
- created_at

---

## PAYMENT LIFECYCLE (IMMUTABLE)

created
→ pending
→ paid
→ failed
→ refunded
→ canceled

No additional statuses allowed.

---

## RULES

- payment_intent always linked to booking
- booking may exist without payment
- payment cannot exist without booking
- refund never deletes transaction
- all changes are event-driven

END OF CONTRACT
""",
    "WEBHOOK_ABSTRACT.md": r"""# WEBHOOK ABSTRACT — PROVIDER AGNOSTIC

## PURPOSE
Normalize all payment provider events into a single internal format.

---

## EVENT STRUCTURE

{
  "provider": "string",
  "event_id": "string",
  "event_type": "payment|refund|fail",
  "external_tx_id": "string",
  "amount": number,
  "currency": "string",
  "status": "pending|paid|failed|refunded",
  "raw": {}
}

---

## RULES

- event_id is idempotency key
- duplicate event_id must be ignored
- raw payload is stored AS IS
- business logic never reads raw
- webhook is NOT trusted input

---

## SECURITY

- signature validation required
- replay attacks must be rejected
- webhook never changes state directly

END
""",
    "PAYMENT_BOOKING_LINK.md": r"""# PAYMENT ↔ BOOKING LINK (CANON)

## CORE RULE
Every payment belongs to exactly one booking.

---

## STATES INTERACTION

booking.created
→ payment_intent.created

payment.paid
→ booking.confirmed

payment.failed
→ booking.released

payment.canceled
→ booking.released

payment.refunded
→ booking.canceled

---

## RESTRICTIONS

- booking cannot be confirmed without paid status
- refund does not remove booking
- booking history is immutable

END
""",
    "REFUND_POLICY.md": r"""# REFUND POLICY — TOTEM

## WHO CAN REFUND
Only merchant_owner can initiate refund.

merchant_type = master
→ refund initiated by master

merchant_type = salon
→ refund initiated by salon owner

---

## REFUND TYPES

AUTO REFUND
- master no-show
- service not provided

MANUAL REVIEW
- disputes
- partial service

NO REFUND
- client no-show
- late cancellation (policy based)

---

## RULES

- refund allowed only from status: paid
- cancel before paid ≠ refund
- refund is irreversible
- refund creates new event, not overwrite

END
""",
    "PAYMENTS_AUDIT.md": r"""# PAYMENTS AUDIT & LOGGING

## CORE PRINCIPLE
All payment data is append-only.

---

## LOGGING RULES

- no DELETE operations
- all timestamps in UTC
- all events stored
- source field required

source:
- api
- webhook
- manual

---

## AUDIT REQUIREMENTS

- full event history per payment
- traceable refund chain
- external_tx_id preserved
- provider name stored

END
""",
}

def die(msg: str, code: int = 1) -> None:
    print(f"\n[STOP] {msg}")
    sys.exit(code)

def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    print(f"\n> {' '.join(cmd)}")
    try:
        p = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            text=True,
            capture_output=True,
            check=False,
            shell=False,
        )
    except Exception as e:
        die(f"Failed to run command: {cmd}\n{e}")

    if p.stdout:
        print(p.stdout.strip())
    if p.stderr:
        print(p.stderr.strip())

    if p.returncode != 0:
        die(f"Command failed ({p.returncode}): {' '.join(cmd)}")
    return p

def ensure_dirs() -> None:
    if not ROOT.exists():
        die(f"Root directory not found: {ROOT}")
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

def write_files() -> list[Path]:
    written: list[Path] = []
    for name, content in FILES.items():
        path = DOCS_DIR / name
        # Always overwrite: canon source of truth
        path.write_text(content.strip() + "\n", encoding="utf-8")
        written.append(path)
        print(f"[OK] wrote {path}")
    return written

def snapshot(written: list[Path]) -> Path:
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    snap = LOG_DIR / f"payments_docs_snapshot_{ts}.txt"
    lines = []
    lines.append(f"UTC: {datetime.utcnow().isoformat()}Z")
    lines.append(f"ROOT: {ROOT}")
    lines.append(f"DOCS_DIR: {DOCS_DIR}")
    lines.append("")
    lines.append("FILES:")
    for p in written:
        st = p.stat()
        lines.append(f"- {p.name} | {st.st_size} bytes | mtime={datetime.utcfromtimestamp(st.st_mtime).isoformat()}Z")
    snap.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[OK] snapshot: {snap}")
    return snap

def is_git_repo() -> bool:
    return (ROOT / ".git").exists()

def git_has_changes() -> bool:
    p = run(["git", "status", "--porcelain"], cwd=ROOT)
    return bool(p.stdout.strip())

def git_commit_push() -> None:
    # Safety: only docs/prod
    run(["git", "add", "docs/prod"], cwd=ROOT)

    if not git_has_changes():
        print("[OK] no git changes after add. commit/push skipped.")
        return

    # Commit may fail if user has no identity set; that's correct -> STOP
    run(["git", "commit", "-m", COMMIT_MESSAGE], cwd=ROOT)
    run(["git", "push"], cwd=ROOT)
    print("[OK] git push done (deploy should trigger automatically if configured).")

def main() -> None:
    ensure_dirs()
    written = write_files()
    snapshot(written)

    # Optional git automation
    if is_git_repo():
        print("[INFO] .git detected → running git add/commit/push")
        git_commit_push()
    else:
        print("[INFO] No .git detected → files created only (no deploy)")

    print("\n[DONE] PAYMENTS CORE DOCS PACK completed successfully.")

if __name__ == "__main__":
    main()
