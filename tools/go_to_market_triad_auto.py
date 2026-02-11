#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — GO TO MARKET TRIAD AUTO

Includes:
- Pilot Launch Plan
- Sales / Partnership Playbook
- Pitch Deck Outline

Docs only. No backend changes.
Auto git commit + push.
"""

from pathlib import Path
import subprocess
import sys

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
COMMIT_MSG = "docs: go to market triad (pilot + sales + pitch)"

FILES = {
    "PILOT_LAUNCH_PLAN.md": """# PILOT LAUNCH PLAN — CANON

## GOAL
Validate product with real users before scale.

---

## SCOPE
- 3–5 masters
- 1 region
- Limited traffic

---

## ONBOARDING
- Manual onboarding
- Direct support
- Feedback collection

---

## SUCCESS METRICS
- bookings created
- bookings completed
- user retention
- error rate

---

## EXIT CRITERIA
- stable bookings
- no P0/P1 incidents
- positive qualitative feedback

END
""",

    "SALES_PARTNERSHIP_PLAYBOOK.md": """# SALES & PARTNERSHIP PLAYBOOK — CANON

## TARGET
- independent masters
- small salons

---

## VALUE PROPOSITION
- virtual administrator
- zero overhead
- no double bookings
- automated flow

---

## SALES FLOW
1. Intro
2. Problem framing
3. Demo / walkthrough
4. Pilot invite

---

## OBJECTIONS
- price → ROI
- complexity → automation
- trust → transparency

END
""",

    "PITCH_DECK_OUTLINE.md": """# PITCH DECK OUTLINE — CANON

## SLIDES
1. Problem
2. Solution
3. Product demo
4. Market
5. Business model
6. Traction (pilot)
7. Roadmap
8. Team
9. Ask

---

## NOTES
- focus on automation
- highlight architecture readiness
- show execution speed

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

    print("[DONE] GO TO MARKET TRIAD AUTO COMPLETED")

if __name__ == "__main__":
    main()
