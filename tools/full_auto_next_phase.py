#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# TOTEM — FULL AUTO NEXT PHASE (ONE RUN)
# - INTERNAL DEMO MODE pages (/demo/*)
# - MINIMAL PUBLIC CTA (/waitlist)
# - HTTP verify
# - report + git commit/push
#
# HARD:
# - STOP on any error
# - Odoo-only, JSON-RPC
# - No backend changes

import json
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

import requests

# === CONFIG (fixed as provided) ===
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
REPORT = DOCS / "NEXT_PHASE_REPORT.md"
COMMIT_MSG = "docs: next phase (demo + cta) auto"

TIMEOUT = 25
SLUG = "test"

# === helpers ===
def stop(msg: str):
    print(f"\n[STOP] {msg}")
    sys.exit(1)

def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def run(cmd: List[str], cwd: Path = ROOT):
    p = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True)
    if p.returncode != 0:
        if p.stdout: print(p.stdout)
        if p.stderr: print(p.stderr)
        stop("CMD FAILED: " + " ".join(cmd))
    if p.stdout: print(p.stdout.strip())

# === JSON-RPC ===
def rpc(session, service, method, args):
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

def authenticate(session) -> int:
    uid = rpc(session, "common", "authenticate", [DB, LOGIN, API_KEY, {}])
    if not uid:
        stop("AUTH FAILED (uid=False)")
    return int(uid)

def call_kw(session, uid, model, method, args):
    return rpc(session, "object", "execute_kw", [DB, uid, API_KEY, model, method, args, {}])

# === QWeb builders (VALID QWEB) ===
def qweb_page(title: str, body_html: str) -> str:
    return f"""
<t t-name="totem.page.{title}">
  <t t-call="website.layout">
    <div class="container">
      {body_html}
    </div>
  </t>
</t>
""".strip()

def qweb_redirect(target: str) -> str:
    return f"""
<t t-name="totem.redirect.{target}">
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

# === Odoo ops ===
def ensure_models(session, uid):
    for m in ("website.page", "ir.ui.view"):
        call_kw(session, uid, m, "fields_get", [[], ["type"]])

def ensure_page(session, uid, url: str, name: str, arch_db: str, publish=True) -> str:
    # view by name
    v = call_kw(session, uid, "ir.ui.view", "search_read", [[["name", "=", name]]])
    if v:
        vid = v[0]["id"]
        call_kw(session, uid, "ir.ui.view", "write", [[vid], {"arch_db": arch_db, "type": "qweb"}])
        vact = "view.updated"
    else:
        vid = call_kw(session, uid, "ir.ui.view", "create", [{"name": name, "type": "qweb", "arch_db": arch_db}])
        vact = "view.created"

    p = call_kw(session, uid, "website.page", "search_read", [[["url", "=", url]]])
    vals = {"url": url, "view_id": vid, "name": name}
    if "is_published" in call_kw(session, uid, "website.page", "fields_get", [[], ["type"]]):
        vals["is_published"] = bool(publish)
    if p:
        call_kw(session, uid, "website.page", "write", [[p[0]["id"]], vals])
        pact = "page.updated"
    else:
        call_kw(session, uid, "website.page", "create", [vals])
        pact = "page.created"

    return f"{url} ({vact},{pact})"

def apply_next_phase() -> List[str]:
    session = requests.Session()
    uid = authenticate(session)
    print(f"[OK] Auth uid={uid}")
    ensure_models(session, uid)

    log: List[str] = []

    # A) INTERNAL DEMO MODE (public-safe demo pages)
    demo_home_url = "/demo"
    demo_s_url = f"/demo/s/{SLUG}"
    demo_booking_url = f"/demo/s/{SLUG}/booking"
    demo_calendar_url = f"/demo/s/{SLUG}/calendar"

    demo_home_body = """
<h2>Internal Demo Mode</h2>
<p>Демо-режим для показа без реальных пользователей и без платежей.</p>
<ul>
  <li><a href="/demo/s/test">Demo Salon</a></li>
</ul>
""".strip()

    demo_s_body = f"""
<h2>Demo: /s/{SLUG}</h2>
<p>Это демо-страница. Реальный функционал будет подключён позже.</p>
<ul>
  <li><a href="/demo/s/{SLUG}/booking">Booking (demo)</a></li>
  <li><a href="/demo/s/{SLUG}/calendar">Calendar (demo)</a></li>
</ul>
""".strip()

    demo_stub_body = """
<h2>Demo Stub</h2>
<p>Раздел в разработке. Это демо-экран.</p>
<p><a href="/demo">Назад в demo</a> · <a href="/">Главная</a></p>
""".strip()

    log.append("DEMO:")
    log.append("  " + ensure_page(session, uid, demo_home_url, "TOTEM DEMO HOME", qweb_page("demo_home", demo_home_body)))
    log.append("  " + ensure_page(session, uid, demo_s_url, f"TOTEM DEMO S {SLUG}", qweb_page("demo_s", demo_s_body)))
    log.append("  " + ensure_page(session, uid, demo_booking_url, f"TOTEM DEMO BOOKING {SLUG}", qweb_page("demo_booking", demo_stub_body)))
    log.append("  " + ensure_page(session, uid, demo_calendar_url, f"TOTEM DEMO CALENDAR {SLUG}", qweb_page("demo_calendar", demo_stub_body)))

    # B) MINIMAL PUBLIC CTA (waitlist page)
    waitlist_url = "/waitlist"
    waitlist_body = """
<h2>Ранний доступ TOTEM</h2>
<p>Онлайн-запись находится в разработке. Оставьте контакт, чтобы получить доступ первым.</p>
<ul>
  <li>Email: <a href="mailto:kantotemus@gmail.com?subject=TOTEM%20Waitlist">kantotemus@gmail.com</a></li>
</ul>
<p><a href="/">На главную</a></p>
""".strip()
    log.append("CTA:")
    log.append("  " + ensure_page(session, uid, waitlist_url, "TOTEM WAITLIST", qweb_page("waitlist", waitlist_body)))

    # C) OPTIONAL: add a visible public entry point without editing homepage
    # Create /start page that links to waitlist + demo
    start_url = "/start"
    start_body = """
<h2>TOTEM</h2>
<p><a href="/waitlist">Ранний доступ</a></p>
<p><a href="/demo">Internal Demo</a></p>
""".strip()
    log.append("ENTRY:")
    log.append("  " + ensure_page(session, uid, start_url, "TOTEM START", qweb_page("start", start_body)))

    return log

# === HTTP VERIFY ===
def http_get(path: str) -> Tuple[int, str]:
    url = ODOO_URL.rstrip("/") + path
    r = requests.get(url, allow_redirects=True, timeout=TIMEOUT, headers={"User-Agent": "TOTEM-VERIFY/1.0"})
    return r.status_code, r.url

def verify() -> List[str]:
    paths = [
        "/",
        "/start",
        "/waitlist",
        "/demo",
        f"/demo/s/{SLUG}",
        f"/demo/s/{SLUG}/booking",
        f"/demo/s/{SLUG}/calendar",
    ]
    out = []
    for p in paths:
        code, final = http_get(p)
        out.append(f"{p} -> {code} ({final})")
        if code != 200:
            stop(f"VERIFY FAIL {p}: {code}")
    return out

def write_report(apply_log: List[str], verify_log: List[str]) -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    lines = [
        "# NEXT PHASE REPORT — AUTO",
        "",
        f"UTC: {utc_now()}",
        f"ODOO_URL: {ODOO_URL}",
        f"DB: {DB}",
        "",
        "## APPLY LOG",
        *[f"- {x}" for x in apply_log],
        "",
        "## HTTP VERIFY",
        *[f"- {x}" for x in verify_log],
        "",
        "END",
    ]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[OK] report: {REPORT}")

def git_commit_push() -> None:
    if not (ROOT / ".git").exists():
        print("[INFO] no .git -> skip commit/push")
        return
    rel = str(REPORT).replace(str(ROOT) + "\\", "").replace("\\", "/")
    run(["git", "add", rel])
    run(["git", "commit", "-m", COMMIT_MSG])
    run(["git", "push"])
    print("[OK] git push done (deploy triggers if configured).")

def main():
    if not ROOT.exists():
        stop(f"ROOT NOT FOUND: {ROOT}")

    apply_log = apply_next_phase()
    print("[OK] Odoo apply done")

    verify_log = verify()
    print("[OK] HTTP verify passed")

    write_report(apply_log, verify_log)
    git_commit_push()

    print("[DONE] NEXT PHASE AUTO COMPLETED")

if __name__ == "__main__":
    main()
