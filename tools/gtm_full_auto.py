#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# TOTEM — GTM FULL AUTO (ONE RUN)
# Делает за один запуск:
# - DEMO SCRIPT (doc)
# - SALES OUTREACH PACK (docs + templates + tracker.csv)
# - INVESTOR PACK (deck outline + memo + roadmap)
# - ONE master report
# - ONE git commit + push
#
# HARD:
# - STOP on any error
# - Idempotent (overwrite docs safely)
# - No backend changes

import csv
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
SALES_DIR = ROOT / "docs" / "sales"
INVEST_DIR = ROOT / "docs" / "investor"
REPORT = DOCS / "GTM_FULL_AUTO_REPORT.md"
COMMIT_MSG = "docs: gtm full auto (demo+sales+investor)"

def stop(msg: str):
    print(f"\n[STOP] {msg}")
    sys.exit(1)

def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def run(cmd: List[str], cwd: Path = ROOT):
    p = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True)
    if p.returncode != 0:
        if p.stdout: print(p.stdout)
        if p.stderr: print(p.stderr)
        stop("CMD FAILED: " + " ".join(cmd))
    if p.stdout: print(p.stdout.strip())

def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")

def make_demo_pack():
    write(DOCS / "DEMO_SCRIPT.md", f"""
# DEMO SCRIPT — CANON
URL: /demo
Flow:
1. Show /start (entry)
2. Show /demo (internal mode)
3. Navigate to /demo/s/test
4. Explain booking & calendar as upcoming
5. Show /waitlist (early access)
Goal:
- Clarity
- No promises about payments
END
""")

def make_sales_pack():
    write(SALES_DIR / "SALES_PLAYBOOK.md", """
# SALES PLAYBOOK — CANON
ICP:
- Solo masters
- Small salons
Offer:
- Virtual admin
- Centralized booking
Objections:
- Already use Instagram/WhatsApp
Answer:
- Automation + visibility
END
""")

    write(SALES_DIR / "OUTREACH_EMAIL_TEMPLATE.md", """
Subject: Онлайн-запись для вашего салона

Здравствуйте!

Мы запускаем TOTEM — виртуальный администратор для мастеров.
Сейчас открыт ранний доступ.

Посмотреть демо: https://totem-platform.odoo.com/demo
Оставить заявку: https://totem-platform.odoo.com/waitlist

Готовы обсудить 15 минут.
""")

    tracker = SALES_DIR / "OUTREACH_TRACKER.csv"
    tracker.parent.mkdir(parents=True, exist_ok=True)
    with tracker.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Name","City","Contact","Date Sent","Response","Status","Notes"])
    return tracker

def make_investor_pack():
    write(INVEST_DIR / "PITCH_DECK_OUTLINE.md", """
# PITCH DECK OUTLINE — CANON
1. Problem
2. Solution (TOTEM)
3. Market
4. Product (demo ready)
5. Business Model
6. Traction (stub + demo live)
7. Roadmap
8. Ask
END
""")

    write(INVEST_DIR / "INVESTOR_MEMO.md", """
# INVESTOR MEMO — CANON
Stage: Pre-revenue
Product: Demo + Public stub live
Payments: PSP onboarding in progress
Risk: Low technical debt
Ask: Seed / Pre-seed (to be defined)
END
""")

    write(INVEST_DIR / "ROADMAP_6_MONTHS.md", """
# ROADMAP 6 MONTHS
M1-2: PSP integration + real booking flow
M3: Pilot with 5-10 salons
M4: Reporting v1
M5: Paid rollout
M6: Scale + marketing
END
""")

def git_push():
    if not (ROOT / ".git").exists():
        return
    run(["git","add","docs"])
    run(["git","commit","-m",COMMIT_MSG])
    run(["git","push"])

def main():
    if not ROOT.exists():
        stop("ROOT NOT FOUND")

    DOCS.mkdir(parents=True, exist_ok=True)

    make_demo_pack()
    tracker = make_sales_pack()
    make_investor_pack()

    write(REPORT, f"""
# GTM FULL AUTO REPORT

UTC: {utc()}

## DEMO
- docs/prod/DEMO_SCRIPT.md

## SALES
- docs/sales/SALES_PLAYBOOK.md
- docs/sales/OUTREACH_EMAIL_TEMPLATE.md
- docs/sales/OUTREACH_TRACKER.csv

## INVESTOR
- docs/investor/PITCH_DECK_OUTLINE.md
- docs/investor/INVESTOR_MEMO.md
- docs/investor/ROADMAP_6_MONTHS.md

END
""")

    print(f"[OK] report: {REPORT}")
    git_push()
    print("[DONE] GTM FULL AUTO COMPLETED")

if __name__ == "__main__":
    main()
