# audit/apply_role_gate_stub.py
# WRITE (Odoo): replaces hard redirects on cabinet pages with a strict Role Gate stub.
# Goal: stop redirect-to-index and show deterministic "locked" screen for /masters/* and /salons/*.
# Idempotent: only writes if view arch differs.
# Creates local backup: audit_out_deep\backup_cabinet_views_<timestamp>.json

import os
import json
from datetime import datetime, timezone
import requests

# ===== CONFIG via ENV =====
ODOO_URL = os.getenv("ODOO_URL", "").strip()
ODOO_DB = os.getenv("ODOO_DB", "").strip()
ODOO_EMAIL = os.getenv("ODOO_EMAIL", "").strip()
ODOO_API_KEY = os.getenv("ODOO_API_KEY", "").strip()
JSONRPC = f"{ODOO_URL}/jsonrpc" if ODOO_URL else ""

BASE_DIR = r"C:\Users\Vitaly\Desktop\odoo-local"
AUDIT_DIR = os.path.join(BASE_DIR, "audit_out_deep")

CABINET_PREFIXES = ("/masters", "/salons")

def ensure_config():
    missing = [k for k, v in {
        "ODOO_URL": ODOO_URL, "ODOO_DB": ODOO_DB, "ODOO_EMAIL": ODOO_EMAIL, "ODOO_API_KEY": ODOO_API_KEY
    }.items() if not v]
    if missing:
        raise SystemExit(f"CONFIG MISSING: {', '.join(missing)}. Set env vars first.")

def jpost(payload: dict) -> dict:
    r = requests.post(JSONRPC, json=payload, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(json.dumps(data["error"], ensure_ascii=False, indent=2))
    return data["result"]

def authenticate() -> int:
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "authenticate",
            "args": [ODOO_DB, ODOO_EMAIL, ODOO_API_KEY, {}],
        },
        "id": 1,
    }
    uid = jpost(payload)
    if not uid:
        raise RuntimeError("AUTH FAILED: uid == False. Check ODOO_URL/DB/EMAIL/API_KEY.")
    return int(uid)

def execute_kw(uid: int, model: str, method: str, args=None, kwargs=None):
    if args is None: args = []
    if kwargs is None: kwargs = {}
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs],
        },
        "id": 2,
    }
    return jpost(payload)

def now_tag():
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")

def role_gate_arch(title: str, subtitle: str) -> str:
    # Minimal QWeb for website.page view arch_db
    # No redirects, no auth assumptions. Strict "locked" gate.
    return f"""
<t t-name="totem.role_gate.stub">
  <section class="container py-5">
    <div class="row justify-content-center">
      <div class="col-lg-7">
        <div class="card shadow-sm">
          <div class="card-body p-4">
            <h2 class="mb-2">{title}</h2>
            <p class="text-muted mb-4">{subtitle}</p>

            <div class="alert alert-warning" role="alert">
              Этот раздел доступен только после подтверждения роли (Master/Salon) через ядро TOTEM (backend).
              Odoo-админка не является ролью продукта.
            </div>

            <div class="d-flex gap-2 flex-wrap">
              <a class="btn btn-primary" href="/start">Start</a>
              <a class="btn btn-outline-secondary" href="/waitlist">Waitlist</a>
              <a class="btn btn-link" href="/">Home</a>
            </div>

            <hr class="my-4"/>

            <p class="small text-muted mb-0">
              Статус: ROLE GATE STUB (v1). Следующий шаг: подключение role resolution к backend session.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</t>
""".strip()

def main():
    ensure_config()
    os.makedirs(AUDIT_DIR, exist_ok=True)

    uid = authenticate()

    # 1) Find all cabinet pages
    pages = execute_kw(
        uid,
        "website.page",
        "search_read",
        args=[[("url", "!=", False)]],
        kwargs={"fields": ["id", "name", "url", "view_id", "is_published", "active", "website_id"], "limit": 100000},
    )

    cabinet_pages = []
    for p in pages:
        url = p.get("url") or ""
        if any(url == pref or url.startswith(pref + "/") for pref in CABINET_PREFIXES):
            cabinet_pages.append(p)

    if not cabinet_pages:
        raise SystemExit("NO CABINET PAGES FOUND: no /masters* or /salons* in website.page")

    # 2) Collect linked view ids
    view_ids = []
    for p in cabinet_pages:
        vid = p.get("view_id")
        if isinstance(vid, list) and vid:
            view_ids.append(vid[0])
    view_ids = sorted(set(view_ids))

    views = execute_kw(
        uid,
        "ir.ui.view",
        "read",
        args=[view_ids],
        kwargs={"fields": ["id", "name", "key", "type", "active", "website_id", "arch_db", "write_date"]},
    )

    view_by_id = {v["id"]: v for v in views}

    # 3) Backup originals (local)
    backup = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "odoo_url": ODOO_URL,
        "db": ODOO_DB,
        "cabinet_pages_count": len(cabinet_pages),
        "views_count": len(views),
        "pages": [],
        "views": [],
    }

    for p in cabinet_pages:
        backup["pages"].append({
            "page_id": p.get("id"),
            "url": p.get("url"),
            "name": p.get("name"),
            "view_id": (p.get("view_id") or [None])[0] if isinstance(p.get("view_id"), list) else None,
        })

    for v in views:
        backup["views"].append({
            "id": v.get("id"),
            "name": v.get("name"),
            "key": v.get("key"),
            "write_date": v.get("write_date"),
            "arch_db": v.get("arch_db") or "",
        })

    backup_path = os.path.join(AUDIT_DIR, f"backup_cabinet_views_{now_tag()}.json")
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)

    # 4) Apply Role Gate stub to each cabinet page view if needed
    writes = []
    skips = []

    for p in sorted(cabinet_pages, key=lambda x: x.get("url") or ""):
        url = p.get("url") or ""
        vid = p.get("view_id")
        view_id = vid[0] if isinstance(vid, list) and vid else None
        if not view_id or view_id not in view_by_id:
            skips.append({"url": url, "reason": "no view_id"})
            continue

        v = view_by_id[view_id]
        current = (v.get("arch_db") or "").strip()

        title = "Cabinet locked"
        if url.startswith("/masters"):
            title = "Master cabinet locked"
        if url.startswith("/salons"):
            title = "Salon cabinet locked"

        desired = role_gate_arch(
            title=title,
            subtitle=f"URL: {url}"
        ).strip()

        if current == desired:
            skips.append({"url": url, "view_id": view_id, "reason": "already applied"})
            continue

        # Write arch_db
        ok = execute_kw(
            uid,
            "ir.ui.view",
            "write",
            args=[[view_id], {"arch_db": desired}],
            kwargs={}
        )

        if ok:
            writes.append({"url": url, "view_id": view_id})
        else:
            raise RuntimeError(f"WRITE FAILED for url={url} view_id={view_id}")

    # 5) Summary
    print("OK: ROLE GATE STUB APPLIED")
    print(f"Backup: {backup_path}")
    print(f"Updated: {len(writes)} views")
    print(f"Skipped: {len(skips)}")
    if writes:
        print("UPDATED URLS:")
        for w in writes:
            print(f"- {w['url']} (view_id={w['view_id']})")

if __name__ == "__main__":
    main()
