# audit/migration/migrate_slugs.py
# TOTEM — Odoo Website Pages Slug Migration (safe, with view arch_db rewrite)
# Works via JSON-RPC. Default: auto-migrate /s/test -> /s/salon-1 if it's the only stub slug.
# If situation is ambiguous, it aborts with an explicit message.

from __future__ import annotations

import os
import re
import json
import time
import datetime as dt
from typing import Any, Dict, List, Tuple

import requests

# =========================
# CONFIG (DO NOT "IMPROVE")
# =========================
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

# If you want to force explicit migrations, fill this list.
# Example:
# MIGRATIONS = [{"old": "test", "new": "salon-1"}]
MIGRATIONS: List[Dict[str, str]] = []

# =========================
# INTERNALS
# =========================

def jrpc_call(session: requests.Session, service: str, method: str, args: List[Any]) -> Any:
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": service,
            "method": method,
            "args": args,
        },
        "id": int(time.time() * 1000),
    }
    r = session.post(JSONRPC, json=payload, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(json.dumps(data["error"], ensure_ascii=False, indent=2))
    return data.get("result")

def login(session: requests.Session) -> int:
    uid = jrpc_call(session, "common", "login", [DB, LOGIN, API_KEY])
    if not uid:
        raise RuntimeError("AUTH FAILED: uid is empty")
    return int(uid)

def execute_kw(session: requests.Session, uid: int, model: str, method: str, args: List[Any], kwargs: Dict[str, Any] | None = None) -> Any:
    if kwargs is None:
        kwargs = {}
    return jrpc_call(session, "object", "execute_kw", [DB, uid, API_KEY, model, method, args, kwargs])

def utc_stamp() -> str:
    return dt.datetime.utcnow().strftime("%Y%m%d_%H%M%SZ")

def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)

def safe_print(s: str) -> None:
    print(s, flush=True)

SLUG_RE = re.compile(r"^/s/([^/:\s]+)(/.*)?$")          # /s/test, /s/test/booking
DEMO_SLUG_RE = re.compile(r"^/demo/s/([^/:\s]+)(/.*)?$")# /demo/s/test, /demo/s/test/booking

def discover_stub_slugs(session: requests.Session, uid: int) -> List[str]:
    # Find website.page urls that match /s/<slug>... where <slug> is NOT ':slug'
    pages = execute_kw(
        session, uid,
        "website.page", "search_read",
        [[["url", "like", "/s/"]]],
        {"fields": ["id", "url", "name", "view_id"], "limit": 5000}
    )
    slugs = set()
    for p in pages:
        url = (p.get("url") or "").strip()
        m = SLUG_RE.match(url)
        if not m:
            continue
        slug = m.group(1)
        if slug == ":slug":
            continue
        slugs.add(slug)

    # Also consider demo urls
    demo_pages = execute_kw(
        session, uid,
        "website.page", "search_read",
        [[["url", "like", "/demo/s/"]]],
        {"fields": ["id", "url", "name", "view_id"], "limit": 5000}
    )
    for p in demo_pages:
        url = (p.get("url") or "").strip()
        m = DEMO_SLUG_RE.match(url)
        if not m:
            continue
        slug = m.group(1)
        if slug == ":slug":
            continue
        slugs.add(slug)

    return sorted(slugs)

def build_migrations_auto(stub_slugs: List[str]) -> List[Dict[str, str]]:
    # SAFE AUTO:
    # - If only one stub slug and it's "test" -> migrate to "salon-1"
    # - Otherwise: abort to avoid unintended mass rename
    if len(stub_slugs) == 1 and stub_slugs[0] == "test":
        return [{"old": "test", "new": "salon-1"}]
    raise RuntimeError(
        "AUTO MIGRATION ABORTED: stub slugs are ambiguous.\n"
        f"Found stub slugs: {stub_slugs}\n"
        "Fill MIGRATIONS manually in the script, example:\n"
        "  MIGRATIONS = [{\"old\":\"test\",\"new\":\"salon-1\"}]\n"
    )

def page_find_by_url_prefix(session: requests.Session, uid: int, prefix: str) -> List[Dict[str, Any]]:
    # prefix like "/s/test" or "/demo/s/test"
    return execute_kw(
        session, uid,
        "website.page", "search_read",
        [[["url", "like", prefix + "%"]]],
        {"fields": ["id", "url", "name", "view_id"], "limit": 5000}
    )

def page_exists_by_exact_url(session: requests.Session, uid: int, url: str) -> List[int]:
    ids = execute_kw(
        session, uid,
        "website.page", "search",
        [[["url", "=", url]]],
        {"limit": 10}
    )
    return [int(x) for x in ids]

def write_page_url(session: requests.Session, uid: int, page_id: int, new_url: str) -> None:
    ok = execute_kw(session, uid, "website.page", "write", [[page_id], {"url": new_url}])
    if not ok:
        raise RuntimeError(f"FAILED: website.page.write id={page_id} url={new_url}")

def read_views(session: requests.Session, uid: int, view_ids: List[int]) -> List[Dict[str, Any]]:
    if not view_ids:
        return []
    return execute_kw(
        session, uid,
        "ir.ui.view", "read",
        [view_ids, ["id", "name", "key", "type", "active", "inherit_id", "arch_db", "write_date"]],
        {}
    )

def write_view_arch(session: requests.Session, uid: int, view_id: int, new_arch: str) -> None:
    ok = execute_kw(session, uid, "ir.ui.view", "write", [[view_id], {"arch_db": new_arch}])
    if not ok:
        raise RuntimeError(f"FAILED: ir.ui.view.write id={view_id}")

def main() -> int:
    session = requests.Session()

    safe_print("== TOTEM SLUG MIGRATION ==")
    safe_print(f"ODOO_URL: {ODOO_URL}")
    safe_print(f"DB: {DB}")
    safe_print(f"LOGIN: {LOGIN}")

    uid = login(session)
    safe_print(f"AUTH_UID: {uid}")

    migrations = MIGRATIONS
    if not migrations:
        stub_slugs = discover_stub_slugs(session, uid)
        safe_print(f"DISCOVERED_STUB_SLUGS: {stub_slugs}")
        migrations = build_migrations_auto(stub_slugs)

    safe_print(f"MIGRATIONS: {migrations}")

    report_dir = os.path.join("audit", "migration", "_reports")
    ensure_dir(report_dir)
    report_path = os.path.join(report_dir, f"migration_report_{utc_stamp()}.json")

    actions: List[Dict[str, Any]] = []
    touched_views: Dict[int, Dict[str, Any]] = {}
    touched_pages: Dict[int, Dict[str, Any]] = {}

    # -------------------------
    # PRE-FLIGHT (NO CHANGES)
    # -------------------------
    safe_print("== PRE-FLIGHT ==")

    planned_page_moves: List[Tuple[int, str, str]] = []  # (page_id, old_url, new_url)
    planned_view_updates: Dict[int, Dict[str, Any]] = {} # view_id -> {before, after}

    for m in migrations:
        old = m["old"].strip()
        new = m["new"].strip()
        if not old or not new:
            raise RuntimeError(f"BAD MIGRATION ITEM: {m}")

        # pages: /s/<old>...
        old_prefix = f"/s/{old}"
        new_prefix = f"/s/{new}"
        pages_s = page_find_by_url_prefix(session, uid, old_prefix)

        # pages: /demo/s/<old>...
        old_demo_prefix = f"/demo/s/{old}"
        new_demo_prefix = f"/demo/s/{new}"
        pages_demo = page_find_by_url_prefix(session, uid, old_demo_prefix)

        all_pages = pages_s + pages_demo

        safe_print(f"FOUND_PAGES for {old} -> {new}: {len(all_pages)}")

        for p in all_pages:
            pid = int(p["id"])
            old_url = (p.get("url") or "").strip()

            # compute new url by replacing correct prefix
            if old_url.startswith(old_demo_prefix):
                new_url = new_demo_prefix + old_url[len(old_demo_prefix):]
            elif old_url.startswith(old_prefix):
                new_url = new_prefix + old_url[len(old_prefix):]
            else:
                continue

            # collision check
            existing = page_exists_by_exact_url(session, uid, new_url)
            if existing and (len(existing) != 1 or existing[0] != pid):
                raise RuntimeError(
                    "COLLISION DETECTED (ABORT, NO CHANGES):\n"
                    f"Old page id={pid} url={old_url}\n"
                    f"Target url={new_url} already exists in page ids={existing}\n"
                )

            planned_page_moves.append((pid, old_url, new_url))

            # collect view id for arch update
            view_id = p.get("view_id")
            if isinstance(view_id, list) and view_id:
                vid = int(view_id[0])
            elif isinstance(view_id, int):
                vid = int(view_id)
            else:
                vid = 0

            if vid:
                # we will update arch_db with both replacements:
                # /s/old -> /s/new AND /demo/s/old -> /demo/s/new
                planned_view_updates.setdefault(vid, {"repls": []})
                planned_view_updates[vid]["repls"].append((old_prefix, new_prefix))
                planned_view_updates[vid]["repls"].append((old_demo_prefix, new_demo_prefix))

    safe_print(f"PLANNED_PAGE_MOVES: {len(planned_page_moves)}")
    safe_print(f"PLANNED_VIEW_IDS: {len(planned_view_updates)}")

    # -------------------------
    # APPLY CHANGES
    # -------------------------
    safe_print("== APPLY ==")

    # 1) Update page urls
    for (pid, old_url, new_url) in planned_page_moves:
        safe_print(f"PAGE: {pid} {old_url} -> {new_url}")
        write_page_url(session, uid, pid, new_url)
        touched_pages[pid] = {"id": pid, "old_url": old_url, "new_url": new_url}

    # 2) Update view arch_db
    view_ids = sorted(planned_view_updates.keys())
    views = read_views(session, uid, view_ids)

    # Build per-view unique replacements (dedupe)
    repl_map: Dict[int, List[Tuple[str, str]]] = {}
    for vid, meta in planned_view_updates.items():
        uniq = []
        seen = set()
        for a, b in meta["repls"]:
            key = (a, b)
            if key in seen:
                continue
            seen.add(key)
            uniq.append((a, b))
        repl_map[vid] = uniq

    for v in views:
        vid = int(v["id"])
        arch = v.get("arch_db") or ""
        new_arch = arch
        for a, b in repl_map.get(vid, []):
            if a and b and a in new_arch:
                new_arch = new_arch.replace(a, b)

        if new_arch != arch:
            safe_print(f"VIEW: {vid} arch_db updated")
            write_view_arch(session, uid, vid, new_arch)
            touched_views[vid] = {
                "id": vid,
                "name": v.get("name"),
                "key": v.get("key"),
                "replacements": repl_map.get(vid, []),
            }

    # -------------------------
    # REPORT
    # -------------------------
    report = {
        "time_utc": dt.datetime.utcnow().isoformat() + "Z",
        "odoo_url": ODOO_URL,
        "db": DB,
        "login": LOGIN,
        "auth_uid": uid,
        "migrations": migrations,
        "pages_moved_count": len(touched_pages),
        "views_updated_count": len(touched_views),
        "pages_moved": list(touched_pages.values()),
        "views_updated": list(touched_views.values()),
    }

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    safe_print(f"OK. REPORT: {report_path}")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        safe_print("ERROR: " + str(e))
        raise
