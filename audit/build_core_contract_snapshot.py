# audit/build_core_contract_snapshot.py
# READ-ONLY
# Builds:
#  - CORE_CONTRACT.md
#  - GAP_MAP.md
# Based on audit_out_deep\state.json

import os
import json
from datetime import datetime

BASE_DIR = r"C:\Users\Vitaly\Desktop\odoo-local"
AUDIT_DIR = os.path.join(BASE_DIR, "audit_out_deep")
STATE_PATH = os.path.join(AUDIT_DIR, "state.json")

CORE_PATH = os.path.join(AUDIT_DIR, "CORE_CONTRACT.md")
GAP_PATH = os.path.join(AUDIT_DIR, "GAP_MAP.md")

def load_state():
    if not os.path.exists(STATE_PATH):
        raise SystemExit("state.json not found. Run deep audit first.")
    with open(STATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def build_core_contract(state):
    now = datetime.utcnow().isoformat() + "Z"

    text = f"""# TOTEM CORE CONTRACT SNAPSHOT
Generated: {now}

---

## 1. SOURCE OF TRUTH

Backend (Node.js on Railway) = Single Source of Truth.
Odoo Website = Thin Frontend.
Business logic MUST NOT live in Odoo.

---

## 2. ARCHITECTURE CHAIN

Backend → Site Page → Cabinet Block

Pages reflect backend state.
Cabinet aggregates backend state.
No business logic duplication allowed.

---

## 3. ROLES

Public
Master
Salon
Owner

Guards are enforced at routing level.

---

## 4. ROUTING (LOCKED)

Public:
- /s/:slug
- /s/:slug/booking
- /s/:slug/calendar
- /s/:slug/owner
- /s/:slug/reports

Cabinet:
- /masters/*
- /salons/*

Slug logic fixed.

---

## 5. PAYMENTS

PSP integration waiting.
Payments do not block product core expansion.

---

## 6. IMPLEMENTATION RULES

- CMD only
- Python scripts only
- Idempotent writes
- No manual UI editing
- Commit + push after changes
- Backend FREEZE

END OF CORE CONTRACT
"""
    return text

def build_gap_map(state):
    now = datetime.utcnow().isoformat() + "Z"

    inside = state.get("inside", {})
    pages = inside.get("pages", {}).get("data", []) if inside.get("pages", {}).get("ok") else []

    existing_urls = sorted(set(p.get("url") for p in pages if p.get("url")))

    required_forms = [
        "MASTER_PROFILE_FORM",
        "SALON_PROFILE_FORM",
        "BOOKING_FLOW_FORM",
        "CALENDAR_ENGINE_UI"
    ]

    text = f"""# TOTEM GAP MAP
Generated: {now}

---

## 1. EXISTING WEBSITE PAGES ({len(existing_urls)})

"""
    for url in existing_urls:
        text += f"- {url}\n"

    text += """

---

## 2. PRODUCT REQUIREMENTS (CORE LAYER)

Required UI Contracts:

"""
    for form in required_forms:
        text += f"- {form}\n"

    text += """

---

## 3. CURRENT STATE ANALYSIS

Observed:
- Pages exist structurally.
- No dedicated booking form.
- No master profile form.
- No salon profile form.
- No custom booking model connected.

Gap:
UI structure present.
Product layer not yet implemented.

---

END OF GAP MAP
"""

    return text

def main():
    state = load_state()

    core_doc = build_core_contract(state)
    gap_doc = build_gap_map(state)

    with open(CORE_PATH, "w", encoding="utf-8") as f:
        f.write(core_doc)

    with open(GAP_PATH, "w", encoding="utf-8") as f:
        f.write(gap_doc)

    print("OK:")
    print("- CORE_CONTRACT.md created")
    print("- GAP_MAP.md created")

if __name__ == "__main__":
    main()
