#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# TOTEM — ALL TASKS AUTO (ONE RUN)
# Выполняет ЗА ОДИН ЗАПУСК:
# - Public Flow Stub v0 (если нет)
# - Internal Demo Mode (/demo)
# - Minimal Public CTA (/waitlist)
# - Entry (/start)
# - HTTP verify
# - ЕДИНЫЙ отчёт + git commit/push
#
# HARD:
# - STOP on any error
# - Odoo-only (JSON-RPC)
# - No backend changes
# - Idempotent

import json, sys, subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple
import requests

# === CONFIG ===
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
REPORT = DOCS / "ALL_TASKS_AUTO_REPORT.md"
COMMIT_MSG = "docs: all tasks auto"

TIMEOUT = 25
SLUG = "test"

# === helpers ===
def stop(msg):
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

def auth(session) -> int:
    uid = rpc(session, "common", "authenticate", [DB, LOGIN, API_KEY, {}])
    if not uid: stop("AUTH FAILED")
    return int(uid)

def call_kw(session, uid, model, method, args):
    return rpc(session, "object", "execute_kw", [DB, uid, API_KEY, model, method, args, {}])

# === QWeb ===
def qweb_page(title: str, body: str) -> str:
    return f"""
<t t-name="totem.page.{title}">
  <t t-call="website.layout">
    <div class="container">
      {body}
    </div>
  </t>
</t>
""".strip()

def qweb_redirect(target: str) -> str:
    return f"""
<t t-name="totem.redirect.{target}">
  <t t-call="website.layout">
    <script type="text/javascript">window.location.replace("{target}");</script>
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

def ensure_page(session, uid, url: str, name: str, arch: str, publish=True) -> str:
    v = call_kw(session, uid, "ir.ui.view", "search_read", [[["name","=",name]]])
    if v:
        vid = v[0]["id"]
        call_kw(session, uid, "ir.ui.view", "write", [[vid], {"arch_db": arch, "type":"qweb"}])
        vact = "view.updated"
    else:
        vid = call_kw(session, uid, "ir.ui.view", "create", [{"name":name,"type":"qweb","arch_db":arch}])
        vact = "view.created"

    p = call_kw(session, uid, "website.page", "search_read", [[["url","=",url]]])
    vals = {"url":url,"view_id":vid,"name":name}
    # publish if field exists
    if "is_published" in call_kw(session, uid, "website.page", "fields_get", [[], ["type"]]):
        vals["is_published"] = bool(publish)
    if p:
        call_kw(session, uid, "website.page", "write", [[p[0]["id"]], vals])
        pact = "page.updated"
    else:
        call_kw(session, uid, "website.page", "create", [vals])
        pact = "page.created"
    return f"{url} ({vact},{pact})"

def apply_all() -> List[str]:
    s = requests.Session()
    uid = auth(s)
    ensure_models(s, uid)
    log = [f"uid={uid}"]

    # PUBLIC STUB v0
    stub_body = f"""
<h2>Раздел в разработке</h2>
<p>Скоро здесь будет доступна онлайн-запись.</p>
<p><a href="/s/{SLUG}">Назад</a> · <a href="/">Главная</a></p>
"""
    for u in (f"/s/{SLUG}", f"/s/{SLUG}/booking", f"/s/{SLUG}/calendar"):
        log.append("STUB " + ensure_page(s, uid, u, f"TOTEM STUB {u}", qweb_page("stub", stub_body)))

    # FORBIDDEN → redirect pages
    for src, dst in (
        (f"/s/{SLUG}/owner", f"/s/{SLUG}"),
        (f"/s/{SLUG}/reports", f"/s/{SLUG}"),
        ("/masters/cabinet", "/"),
        ("/salons/cabinet", "/"),
    ):
        log.append("REDIRECT " + ensure_page(s, uid, src, f"TOTEM REDIRECT {src}", qweb_redirect(dst)))

    # DEMO
    log.append("DEMO " + ensure_page(s, uid, "/demo", "TOTEM DEMO HOME",
        qweb_page("demo_home", "<h2>Internal Demo</h2><ul><li><a href='/demo/s/test'>Demo Salon</a></li></ul>")))
    log.append("DEMO " + ensure_page(s, uid, f"/demo/s/{SLUG}", f"TOTEM DEMO S {SLUG}",
        qweb_page("demo_s", f"<h2>Demo /s/{SLUG}</h2><ul><li><a href='/demo/s/{SLUG}/booking'>Booking</a></li><li><a href='/demo/s/{SLUG}/calendar'>Calendar</a></li></ul>")))
    for u in (f"/demo/s/{SLUG}/booking", f"/demo/s/{SLUG}/calendar"):
        log.append("DEMO " + ensure_page(s, uid, u, f"TOTEM DEMO {u}", qweb_page("demo_stub", "<p>Demo stub</p>")))

    # CTA + ENTRY
    log.append("CTA " + ensure_page(s, uid, "/waitlist", "TOTEM WAITLIST",
        qweb_page("waitlist", "<h2>Ранний доступ</h2><p>Email: <a href='mailto:kantotemus@gmail.com'>kantotemus@gmail.com</a></p>")))
    log.append("ENTRY " + ensure_page(s, uid, "/start", "TOTEM START",
        qweb_page("start", "<p><a href='/waitlist'>Ранний доступ</a></p><p><a href='/demo'>Demo</a></p>")))

    return log

# === HTTP verify ===
def http_get(path: str) -> Tuple[int,str]:
    r = requests.get(ODOO_URL.rstrip("/") + path, allow_redirects=True, timeout=TIMEOUT)
    return r.status_code, r.url

def verify() -> List[str]:
    out=[]
    for p in ("/","/start","/waitlist","/demo",f"/demo/s/{SLUG}",f"/demo/s/{SLUG}/booking",f"/demo/s/{SLUG}/calendar"):
        code, final = http_get(p)
        out.append(f"{p} -> {code} ({final})")
        if code != 200: stop(f"VERIFY FAIL {p}: {code}")
    return out

def git_push():
    if not (ROOT/".git").exists(): return
    run(["git","add","docs/prod"])
    run(["git","commit","-m",COMMIT_MSG])
    run(["git","push"])

def main():
    if not ROOT.exists(): stop("ROOT NOT FOUND")
    DOCS.mkdir(parents=True, exist_ok=True)

    apply_log = apply_all()
    verify_log = verify()

    REPORT.write_text(
        "# ALL TASKS AUTO REPORT\n\n"
        f"UTC: {utc()}\n\n"
        "## APPLY\n" + "\n".join(f"- {x}" for x in apply_log) + "\n\n"
        "## VERIFY\n" + "\n".join(f"- {x}" for x in verify_log) + "\n\nEND\n",
        encoding="utf-8"
    )
    print(f"[OK] report: {REPORT}")

    git_push()
    print("[DONE] ALL TASKS AUTO COMPLETED")

if __name__ == "__main__":
    main()
