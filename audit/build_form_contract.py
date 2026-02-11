# audit/build_form_contract.py
# READ-ONLY
# Generates STRICT FORM_CONTRACT.md

import os
from datetime import datetime, timezone

BASE_DIR = r"C:\Users\Vitaly\Desktop\odoo-local"
AUDIT_DIR = os.path.join(BASE_DIR, "audit_out_deep")

CORE_PATH = os.path.join(AUDIT_DIR, "CORE_CONTRACT.md")
GAP_PATH = os.path.join(AUDIT_DIR, "GAP_MAP.md")
OUT_PATH = os.path.join(AUDIT_DIR, "FORM_CONTRACT.md")

def must_read(path: str) -> str:
    if not os.path.exists(path):
        raise SystemExit(f"Missing file: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def build():
    now = datetime.now(timezone.utc).isoformat()

    core = must_read(CORE_PATH)
    gap = must_read(GAP_PATH)

    doc = f"""# TOTEM — FORM CONTRACT (STRICT)
Generated: {now}

---

## GLOBAL DATA TYPES

Identifiers:
- salon_id: string
- master_id: string
- service_id: string
- booking_id: string

Time:
- start_at: ISO-8601 UTC
- end_at: ISO-8601 UTC

Status enums:
MASTER_STATUS = active | inactive
SALON_STATUS = active | inactive
BOOKING_STATUS = pending | confirmed | cancelled | expired

---

## MASTER_PROFILE_FORM

WRITE:
- master_id
- status
- display_name
- bio_short
- bio_long?
- avatar_url?
- gallery_urls[]?
- tags[]?

READ:
MASTER_PUBLIC_VIEW:
- master_id
- status
- display_name
- bio_short
- avatar_url
- gallery_urls[]
- services[]

---

## SERVICE_CONTRACT

WRITE:
- master_id
- service_id?
- service_name
- duration_min
- price_amount
- currency
- is_visible

READ:
SERVICES_LIST:
- master_id
- services[]: {{service_id, service_name, duration_min, price_amount, currency, is_visible, sort_order}}

---

## SALON_PROFILE_FORM

WRITE:
- salon_id
- status
- salon_name
- address_text?
- phone?
- logo_url?
- description?

READ:
SALON_PUBLIC_VIEW:
- salon_id
- status
- salon_name
- logo_url
- address_text
- masters[]

---

## BOOKING_FLOW_FORM

Reserve (backend):
- salon_id
- master_id
- service_id
- start_at
- duration_min
- client_name
- client_phone?
- client_email?

Returns:
- booking_id
- status=pending
- expires_at

Confirm:
- booking_id → status=confirmed

Cancel:
- booking_id → status=cancelled

Conflict prevention = backend only.

---

## CALENDAR_ENGINE

Data model:
calendar_slots:
- master_id
- salon_id
- start_at
- end_at
- status (available|reserved|blocked)

Backend enforces:
- no overlaps
- timeout expiry

---

## IMPLEMENTATION BOUNDARY

Odoo:
- Render UI
- Submit to backend
- Display backend response

Odoo MUST NOT:
- Decide conflicts
- Store canonical booking status
- Execute payment logic

---

## TRACE SNAPSHOT

CORE_CONTRACT.md:
{core}

GAP_MAP.md:
{gap}

END OF FORM CONTRACT
"""
    return doc

def main():
    os.makedirs(AUDIT_DIR, exist_ok=True)
    doc = build()
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(doc)
    print("OK: FORM_CONTRACT.md created")

if __name__ == "__main__":
    main()
