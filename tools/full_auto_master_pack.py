#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# TOTEM — FULL AUTO MASTER PACK (ONE RUN)
# - Generates ALL docs packs
# - Applies Odoo Public Flow Stub v0 via JSON-RPC (website.page + ir.ui.view)
# - Verifies key public URLs (HTTP)
# - Writes ONE master report
# - ONE git commit + push
#
# HARD RULES:
# - Stop on any error
# - No backend changes
# - Idempotent overwrite for docs

import json
import os
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import requests

# ==== ODOO CONFIG (env override allowed) ====
ODOO_URL = os.getenv("ODOO_URL", "https://totem-platform.odoo.com")
DB = os.getenv("ODOO_DB", "totem-platform")
LOGIN = os.getenv("ODOO_LOGIN", "kantotemus@gmail.com")
API_KEY = os.getenv("ODOO_API_KEY", "710c5b2223d24bff082512e7edfbec04a38e2758")
JSONRPC = f"{ODOO_URL}/jsonrpc"

# ==== LOCAL CONFIG ====
ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
TOOLS = ROOT / "tools"
MASTER_REPORT = DOCS / "FULL_AUTO_MASTER_REPORT.md"
COMMIT_MSG = "docs: full auto master pack"

TIMEOUT = 25
SLUG = "test"

# ==== HELPERS ====
def stop(msg: str) -> None:
    print(f"\n[STOP] {msg}")
    sys.exit(1)

def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def run(cmd: List[str], cwd: Path = ROOT) -> None:
    p = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True)
    if p.returncode != 0:
        if p.stdout:
            print(p.stdout)
        if p.stderr:
            print(p.stderr)
        stop("CMD FAILED: " + " ".join(cmd))
    if p.stdout:
        print(p.stdout.strip())

def ensure_dirs() -> None:
    if not ROOT.exists():
        stop(f"ROOT NOT FOUND: {ROOT}")
    DOCS.mkdir(parents=True, exist_ok=True)
    TOOLS.mkdir(parents=True, exist_ok=True)

def write_file(relpath: str, content: str) -> None:
    path = ROOT / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")

# ==== DOC PACK CONTENTS (CANON / SHORT, overwrite ok) ====
DOC_PACKS: Dict[str, str] = {
    # PAYMENTS CORE DOCS
    "docs/prod/PAYMENTS_CONTRACT.md": """
# PAYMENTS CONTRACT — CANON
- intents: created → pending → paid → failed → canceled → refunded
- immutable: paid transaction data
- webhook is source of truth for final status
END
""",
    "docs/prod/WEBHOOK_ABSTRACT.md": """
# WEBHOOK ABSTRACT — CANON
- verify signature
- idempotency by event_id
- store raw event + parsed event
END
""",
    "docs/prod/REFUND_POLICY.md": """
# REFUND POLICY — CANON
- refund initiated by merchant
- refund to original method
- timing depends on PSP
END
""",
    "docs/prod/PAYMENTS_AUDIT.md": """
# PAYMENTS AUDIT — CANON
- traceability: every state change logged
- reconcile: bookings vs payments
- alert on mismatch
END
""",
    "docs/prod/PAYMENT_BOOKING_LINK.md": """
# PAYMENT ↔ BOOKING LINK — CANON
- booking holds slot in pending
- on paid → confirm
- on timeout/fail → release
END
""",

    # PSP PREP / SHORTLIST
    "docs/prod/SANDBOX_PREP.md": """
# SANDBOX PREP — CANON
- sandbox keys
- webhook test endpoint
- test cases: pay/fail/refund
END
""",
    "docs/prod/PSP_EVAL_MATRIX.md": """
# PSP EVAL MATRIX — CANON
- coverage (region, cards)
- settlement time
- fees model
- KYC/KYB burden
- docs quality
END
""",
    "docs/prod/PSP_SHORTLIST.md": """
# PSP SHORTLIST — CANON
- primary
- backup
- fallback #2 (optional)
END
""",

    # BACKUP PSP SELECTED
    "docs/prod/BACKUP_PSP_SELECTED.md": """
# BACKUP PSP SELECTED — CANON
- why chosen
- next steps
END
""",
    "docs/prod/PSP_PROVIDER_REQUIREMENTS.md": """
# PSP PROVIDER REQUIREMENTS — CANON
- onboarding checklist
- legal entity docs
- webhook/security requirements
END
""",
    "docs/prod/PSP_CONTACT_EMAIL.md": """
# PSP CONTACT EMAIL — TEMPLATE
Subject: PSP onboarding for TOTEM
Body: request sandbox + terms + settlement + KYC list
END
""",

    # FOUNDATION HARDENING
    "docs/prod/BOOKING_LOCK_RULES.md": """
# BOOKING & CALENDAR HARDENING — CANON
- no overlaps per master
- pending holds slot
- paid confirms
- timeout releases
END
""",
    "docs/prod/REPORTING_CONTRACT_v1.md": """
# REPORTING CONTRACT v1 — CANON
- bookings metrics
- payments metrics
- role visibility
END
""",
    "docs/prod/TERMS_PAYMENTS_DRAFT.md": """
# PAYMENTS TERMS — DRAFT
- cancellation rules
- refund rules
- liability split
END
""",

    # OPS / SCALE
    "docs/prod/OPS_OBSERVABILITY_CANON.md": """
# OPS OBSERVABILITY — CANON
- availability, errors, latency
- webhook failure rate
- booking conflicts
END
""",
    "docs/prod/INCIDENT_PLAYBOOK.md": """
# INCIDENT PLAYBOOK — CANON
- freeze deploys
- preserve logs/state
- rollback/disable feature
END
""",
    "docs/prod/BACKUP_RECOVERY_STRATEGY.md": """
# BACKUP & RECOVERY — CANON
- daily backups
- retention
- restore drill
END
""",

    # UI / PRODUCT
    "docs/prod/UI_PUBLIC_BOOKING_FLOW.md": """
# UI PUBLIC BOOKING FLOW — CANON
- clear steps
- no dead ends
- readable errors
END
""",
    "docs/prod/UI_CABINET_UX.md": """
# UI CABINET UX — CANON
- empty states
- destructive confirm
END
""",
    "docs/prod/UI_EDGE_CASES.md": """
# UI EDGE CASES — CANON
- no slots
- expired booking
- cancellation info
END
""",

    # SOFT LAUNCH
    "docs/prod/SOFT_LAUNCH_CHECKLIST.md": """
# SOFT LAUNCH CHECKLIST — CANON
- end-to-end public flow (even stub)
- guards enforced
- monitoring on
END
""",
    "docs/prod/GO_NO_GO_CRITERIA.md": """
# GO / NO-GO — CANON
GO: no P0/P1, no integrity issues
NO-GO: double bookings, access leaks
END
""",
    "docs/prod/LAUNCH_DAY_RUNBOOK.md": """
# LAUNCH RUNBOOK — CANON
- freeze deploys
- monitor
- rollback plan
END
""",

    # GTM
    "docs/prod/PILOT_LAUNCH_PLAN.md": """
# PILOT LAUNCH PLAN — CANON
- 3–5 masters
- controlled onboarding
- success metrics
END
""",
    "docs/prod/SALES_PARTNERSHIP_PLAYBOOK.md": """
# SALES PLAYBOOK — CANON
- ICP
- offer
- objections
END
""",
    "docs/prod/PITCH_DECK_OUTLINE.md": """
# PITCH DECK OUTLINE — CANON
- problem/solution/market/model/traction/ask
END
""",
}

# ==== ODOO JSON-RPC ====
def rpc(session: requests.Session, service: str, method: str, args: list):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {"service": service, "method": method, "args": args},
        "id": int(datetime.now(timezone.utc).timestamp()),
    }
    r = session.post(JSONRPC, json=payload, timeout=TIMEOUT)
    if r.status_code != 200:
        stop(f"JSON-RPC HTTP {r.status_code}: {r.text[:300]}")
    data = r.json()
    if "error" in data:
        stop("JSON-RPC error: " + json.dumps(data["error"], ensure_ascii=False)[:900])
    return data["result"]

def authenticate(session: requests.Session) -> int:
    uid = rpc(session, "common", "authenticate", [DB, LOGIN, API_KEY, {}])
    if not uid:
        stop("AUTH FAILED (uid=False)")
    return int(uid)

def call_kw(session: requests.Session, uid: int, model: str, method: str, args: list):
    return rpc(session, "object", "execute_kw", [DB, uid, API_KEY, model, method, args, {}])

def qweb_stub() -> str:
    return f"""
<t t-name="totem.stub">
  <t t-call="website.layout">
    <div class="container">
      <h2>Раздел в разработке</h2>
      <p>Скоро здесь будет доступна онлайн-запись.</p>
      <p><a href="/s/{SLUG}">Назад</a> · <a href="/">Главная</a></p>
    </div>
  </t>
</t>
""".strip()

def qweb_redirect(target: str) -> str:
    return f"""
<t t-name="totem.redirect">
  <t t-call="website.layout">
    <script type="text/javascript">
      window.location.replace("{target}");
    </script>
    <div class="container">
      <p>Перенаправление… <a href="{target}">нажмите здесь</a></p>
    </div>
  </t>
</t>
""".strip()

def odoo_apply_stub_v0() -> List[str]:
    session = requests.Session()
    uid = authenticate(session)
    out = [f"ODOO uid={uid}"]

    # ensure models accessible
    for m in ("website.page", "ir.ui.view"):
        try:
            call_kw(session, uid, m, "fields_get", [[], ["type"]])
        except Exception:
            stop(f"{m} NOT ACCESSIBLE VIA RPC")

    STUB_URLS = [f"/s/{SLUG}", f"/s/{SLUG}/booking", f"/s/{SLUG}/calendar"]
    FORBIDDEN = [
        (f"/s/{SLUG}/owner", f"/s/{SLUG}"),
        (f"/s/{SLUG}/reports", f"/s/{SLUG}"),
        ("/masters/cabinet", "/"),
        ("/salons/cabinet", "/"),
    ]

    # stub pages
    for url in STUB_URLS:
        name = f"TOTEM STUB {url}"

        v = call_kw(session, uid, "ir.ui.view", "search_read", [[["name", "=", name]]])
        if v:
            vid = v[0]["id"]
            call_kw(session, uid, "ir.ui.view", "write", [[vid], {"arch_db": qweb_stub(), "type": "qweb"}])
        else:
            vid = call_kw(session, uid, "ir.ui.view", "create", [{
                "name": name, "type": "qweb", "arch_db": qweb_stub()
            }])

        p = call_kw(session, uid, "website.page", "search_read", [[["url", "=", url]]])
        vals = {"url": url, "view_id": vid, "is_published": True, "name": name}
        if p:
            call_kw(session, uid, "website.page", "write", [[p[0]["id"]], vals])
        else:
            call_kw(session, uid, "website.page", "create", [vals])

        out.append(f"STUB OK {url}")

    # forbidden redirect pages
    for src, dst in FORBIDDEN:
        name = f"TOTEM REDIRECT {src}"

        v = call_kw(session, uid, "ir.ui.view", "search_read", [[["name", "=", name]]])
        if v:
            vid = v[0]["id"]
            call_kw(session, uid, "ir.ui.view", "write", [[vid], {"arch_db": qweb_redirect(dst), "type": "qweb"}])
        else:
            vid = call_kw(session, uid, "ir.ui.view", "create", [{
                "name": name, "type": "qweb", "arch_db": qweb_redirect(dst)
            }])

        p = call_kw(session, uid, "website.page", "search_read", [[["url", "=", src]]])
        vals = {"url": src, "view_id": vid, "is_published": True, "name": name}
        if p:
            call_kw(session, uid, "website.page", "write", [[p[0]["id"]], vals])
        else:
            call_kw(session, uid, "website.page", "create", [vals])

        out.append(f"REDIRECT PAGE OK {src} -> {dst}")

    return out

# ==== HTTP VERIFY ====
def http_get(path: str) -> Tuple[int, str]:
    url = ODOO_URL.rstrip("/") + path
    r = requests.get(url, allow_redirects=True, timeout=TIMEOUT, headers={"User-Agent": "TOTEM-VERIFY/1.0"})
    return r.status_code, r.url

def verify_urls() -> List[str]:
    checks = [
        ("/", 200),
        (f"/s/{SLUG}", 200),
        (f"/s/{SLUG}/booking", 200),
        (f"/s/{SLUG}/calendar", 200),
        (f"/s/{SLUG}/owner", 200),
        (f"/s/{SLUG}/reports", 200),
        ("/masters/cabinet", 200),
        ("/salons/cabinet", 200),
    ]
    out = []
    for path, expected in checks:
        code, final = http_get(path)
        out.append(f"HTTP {code} {path} -> {final}")
        if code != expected:
            stop(f"VERIFY FAIL: {path} expected {expected}, got {code}")
    return out

# ==== GIT ====
def git_commit_push() -> None:
    if not (ROOT / ".git").exists():
        return
    run(["git", "add", "docs/prod"])
    run(["git", "commit", "-m", COMMIT_MSG])
    run(["git", "push"])

# ==== MASTER ====
def main() -> None:
    ensure_dirs()

    # 1) Write/overwrite all docs packs
    for rel, content in DOC_PACKS.items():
        write_file(rel, content)
    print(f"[OK] docs packs written: {len(DOC_PACKS)}")

    # 2) Apply Odoo Stub v0
    odoo_log = odoo_apply_stub_v0()
    print("[OK] Odoo stub v0 applied")

    # 3) Verify URLs
    verify_log = verify_urls()
    print("[OK] HTTP verify passed")

    # Master report
    lines = []
    lines.append("# FULL AUTO MASTER REPORT")
    lines.append("")
    lines.append(f"UTC: {utc_now()}")
    lines.append(f"ODOO_URL: {ODOO_URL}")
    lines.append(f"DB: {DB}")
    lines.append("")
    lines.append("## DOC PACKS")
    lines.append(f"- written: {len(DOC_PACKS)}")
    lines.append("")
    lines.append("## ODOO APPLY LOG")
    for s in odoo_log:
        lines.append(f"- {s}")
    lines.append("")
    lines.append("## HTTP VERIFY")
    for s in verify_log:
        lines.append(f"- {s}")
    lines.append("")
    lines.append("END")

    DOCS.mkdir(parents=True, exist_ok=True)
    MASTER_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[OK] report: {MASTER_REPORT}")

    # One commit + push
    git_commit_push()
    print("[DONE] FULL AUTO MASTER PACK COMPLETED")

if __name__ == "__main__":
    main()
