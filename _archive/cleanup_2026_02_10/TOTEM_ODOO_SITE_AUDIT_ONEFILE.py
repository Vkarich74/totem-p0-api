# -*- coding: utf-8 -*-
r"""
TOTEM — Odoo Website AUDIT: LAYOUT / HEADER / FOOTER (ONE FILE / READ-ONLY)
STD LIB ONLY (NO pip, NO requests)

OUTPUT (single file):
C:\Users\Vitaly\Desktop\odoo-local\TOTEM_AUDIT_LAYOUT_REPORT.md

Collects:
- Website(s) summary (website.website)
- ALL layout/header/footer/theme-related ir.ui.view (NO "hits" filter)
- Extracted entrypoints from view arch_db: href/form/onclick
- Detects if header/footer contains /web/login or /web/signup or custom cabinet links

Rules:
- READ ONLY
- Status logs in CMD
- One run -> one report file
- After run -> delete this script (API_KEY inside)
"""

import json
import time
import datetime as dt
import traceback
import urllib.request
import ssl
import re

# =========================
# CANON CONFIG (TEMP)
# =========================
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = ODOO_URL + "/jsonrpc"

REPORT_PATH = r"C:\Users\Vitaly\Desktop\odoo-local\TOTEM_AUDIT_LAYOUT_REPORT.md"

# Limits (avoid SaaS timeouts)
LIMIT_WEBSITES = 200
LIMIT_VIEWS_PER_QUERY = 4000
LIMIT_VIEWS_TOTAL = 12000
ARCH_SNIP_LEN = 6000

# Key patterns to fetch layout/header/footer/theme
KEY_PATTERNS = [
    "website.layout",
    "website.header",
    "website.footer",
    "website.navbar",
    "website.snippet",
    "theme_",
    "html_builder",
    "website.",
    # sometimes themes use these:
    "theme_default",
    "website_theme",
]

# Also fetch by name patterns as fallback
NAME_PATTERNS = [
    "layout",
    "header",
    "footer",
    "navbar",
    "theme",
]

# What we consider "entrypoints" inside header/footer/layout
INTERESTING_SUBSTRINGS = [
    "/web/login",
    "/web/signup",
    "/login",
    "/signup",
    "/masters",
    "/salons",
    "/cabinet",
    "/pending",
    "/blocked",
    "/s/",
    "auth_signup",
    "portal",
    "login",
    "signup",
    "register",
    "sign in",
    "sign up",
    "вход",
    "регист",
]

URL_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
FORM_RE = re.compile(r"""<form[^>]+action\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
ONCLICK_RE = re.compile(r"""onclick\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
DATA_TARGET_RE = re.compile(r"""data-bs-target\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
DATA_TOGGLE_RE = re.compile(r"""data-bs-toggle\s*=\s*["']([^"']+)["']""", re.IGNORECASE)

def ts():
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def log(msg):
    print(f"[{ts()}] {msg}")

def jrpc_payload(service, method, args):
    return {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {"service": service, "method": method, "args": args},
        "id": int(time.time() * 1000) % 1000000000,
    }

def jsonrpc_call(payload, timeout=90):
    ctx = ssl.create_default_context()
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        JSONRPC,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        res = json.loads(raw)
        if res.get("error"):
            raise Exception(json.dumps(res["error"], ensure_ascii=False))
        return res.get("result")

def authenticate():
    log("AUTH: authenticate")
    payload = jrpc_payload("common", "authenticate", [DB, LOGIN, API_KEY, {}])
    uid = jsonrpc_call(payload, timeout=60)
    if not uid:
        raise Exception("Authentication failed (uid=0)")
    log(f"AUTH: OK uid={uid}")
    return int(uid)

def call_kw(uid, model, method, args, kwargs=None, timeout=120):
    if kwargs is None:
        kwargs = {}
    payload = jrpc_payload("object", "execute_kw", [DB, uid, API_KEY, model, method, args, kwargs])
    return jsonrpc_call(payload, timeout=timeout)

def safe_list(x):
    return x if isinstance(x, list) else []

def m2o_norm(val):
    if isinstance(val, list) and len(val) == 2:
        return {"id": val[0], "name": val[1]}
    return None

def model_exists(uid, model):
    try:
        call_kw(uid, model, "search_count", [[]], {}, timeout=60)
        return True
    except Exception:
        return False

def is_interesting(s):
    if not s:
        return False
    low = str(s).lower()
    return any(sub.lower() in low for sub in INTERESTING_SUBSTRINGS)

def extract_arch(arch):
    arch = arch or ""
    hrefs = URL_RE.findall(arch)
    forms = FORM_RE.findall(arch)
    onclicks = ONCLICK_RE.findall(arch)
    targets = DATA_TARGET_RE.findall(arch)
    toggles = DATA_TOGGLE_RE.findall(arch)

    interesting_hrefs = sorted(set([h for h in hrefs if is_interesting(h)]))
    interesting_forms = sorted(set([a for a in forms if is_interesting(a)]))
    interesting_onclicks = sorted(set([o for o in onclicks if is_interesting(o)]))

    return {
        "hrefs_total": len(hrefs),
        "forms_total": len(forms),
        "onclicks_total": len(onclicks),
        "interesting_hrefs": interesting_hrefs[:300],
        "interesting_forms": interesting_forms[:300],
        "interesting_onclicks": interesting_onclicks[:200],
        "hrefs_sample": sorted(set(hrefs))[:120],
        "forms_sample": sorted(set(forms))[:60],
        "data_bs_targets_sample": sorted(set(targets))[:80],
        "data_bs_toggles_sample": sorted(set(toggles))[:40],
    }

def dump_websites(uid):
    if not model_exists(uid, "website.website"):
        log("SKIP: website.website")
        return []
    log("DUMP: websites (website.website)")
    ids = call_kw(uid, "website.website", "search", [[]], {"limit": LIMIT_WEBSITES})
    ids = safe_list(ids)
    log(f"  websites ids={len(ids)}")
    if not ids:
        return []
    rows = call_kw(uid, "website.website", "read", [ids], {"fields": ["id","name","domain","company_id","theme_id","default_lang_id","is_published"]})
    rows = safe_list(rows)
    for r in rows:
        r["company_id"] = m2o_norm(r.get("company_id"))
        r["theme_id"] = m2o_norm(r.get("theme_id"))
        r["default_lang_id"] = m2o_norm(r.get("default_lang_id"))
    return rows

def search_view_ids(uid):
    if not model_exists(uid, "ir.ui.view"):
        log("SKIP: ir.ui.view")
        return []

    log("SEARCH: views by KEY patterns")
    ids = []
    for p in KEY_PATTERNS:
        try:
            got = call_kw(uid, "ir.ui.view", "search", [[("key", "ilike", p)]], {"limit": LIMIT_VIEWS_PER_QUERY})
            got = safe_list(got)
            log(f"  key ilike '{p}' -> {len(got)}")
            ids += got
        except Exception as e:
            log(f"[WARN] key search failed for '{p}': {e}")

    log("SEARCH: views by NAME patterns (fallback)")
    for p in NAME_PATTERNS:
        try:
            got = call_kw(uid, "ir.ui.view", "search", [[("name", "ilike", p)]], {"limit": LIMIT_VIEWS_PER_QUERY})
            got = safe_list(got)
            log(f"  name ilike '{p}' -> {len(got)}")
            ids += got
        except Exception as e:
            log(f"[WARN] name search failed for '{p}': {e}")

    # De-dup + cap
    ids = sorted(set([int(x) for x in ids if isinstance(x, int)]))
    log(f"SEARCH: union views={len(ids)}")
    if len(ids) > LIMIT_VIEWS_TOTAL:
        log(f"[WARN] union capped: {len(ids)} -> {LIMIT_VIEWS_TOTAL}")
        ids = ids[:LIMIT_VIEWS_TOTAL]
    return ids

def read_views(uid, ids):
    if not ids:
        return []
    log("READ: ir.ui.view fields + arch_db")
    fields = ["id","key","name","type","website_id","inherit_id","active","create_date","write_date","arch_db"]
    rows = call_kw(uid, "ir.ui.view", "read", [ids], {"fields": fields})
    rows = safe_list(rows)

    out = []
    for r in rows:
        arch = r.get("arch_db") or ""
        signals = extract_arch(arch)

        # classification to make report readable
        key = (r.get("key") or "").lower()
        name = (r.get("name") or "").lower()

        kind = "other"
        if "website.layout" in key or "layout" in name:
            kind = "layout"
        if "header" in key or "header" in name or "navbar" in key or "navbar" in name:
            kind = "header"
        if "footer" in key or "footer" in name:
            kind = "footer"
        if key.startswith("theme_") or "theme" in key or "theme" in name:
            kind = "theme"

        out.append({
            "id": r.get("id"),
            "key": r.get("key"),
            "name": r.get("name"),
            "type": r.get("type"),
            "active": r.get("active"),
            "website_id": m2o_norm(r.get("website_id")),
            "inherit_id": m2o_norm(r.get("inherit_id")),
            "create_date": r.get("create_date"),
            "write_date": r.get("write_date"),
            "kind": kind,
            "signals": signals,
            "arch_snip": arch[:ARCH_SNIP_LEN] + ("…" if len(arch) > ARCH_SNIP_LEN else ""),
        })

    # sort: kind -> key -> id
    order = {"layout": 0, "header": 1, "footer": 2, "theme": 3, "other": 9}
    out.sort(key=lambda x: (order.get(x.get("kind"), 9), (x.get("key") or "").lower(), x.get("id") or 0))
    log(f"READ: dumped views={len(out)}")
    return out

def build_report(uid, websites, views, errors):
    # aggregate interesting entrypoints across layout/header/footer
    agg = {"hrefs": set(), "forms": set(), "onclicks": set()}
    for v in views:
        sig = v.get("signals") or {}
        for h in sig.get("interesting_hrefs") or []:
            agg["hrefs"].add(h)
        for a in sig.get("interesting_forms") or []:
            agg["forms"].add(a)
        for o in sig.get("interesting_onclicks") or []:
            agg["onclicks"].add(o)

    lines = []
    lines.append("# TOTEM — AUDIT LAYOUT / HEADER / FOOTER (READ-ONLY)")
    lines.append("")
    lines.append("## Meta")
    lines.append(f"- Generated: {ts()}")
    lines.append(f"- ODOO_URL: {ODOO_URL}")
    lines.append(f"- DB: {DB}")
    lines.append(f"- Login: {LOGIN}")
    lines.append(f"- UID: {uid}")
    lines.append("")
    lines.append("## Counts")
    lines.append(f"- websites: {len(websites)}")
    lines.append(f"- views_dumped: {len(views)}")
    lines.append("")

    if errors:
        lines.append("## Errors captured")
        for e in errors[:200]:
            lines.append(f"- {e}")
        lines.append("")

    lines.append("## Aggregated Entrypoints (from layout/header/footer/theme views)")
    lines.append(f"- hrefs: {len(agg['hrefs'])}")
    lines.append(f"- forms: {len(agg['forms'])}")
    lines.append(f"- onclicks: {len(agg['onclicks'])}")
    lines.append("")
    for h in sorted(agg["hrefs"])[:250]:
        lines.append(f"- HREF: {h}")
    for a in sorted(agg["forms"])[:250]:
        lines.append(f"- FORM: {a}")
    for o in sorted(agg["onclicks"])[:150]:
        lines.append(f"- ONCLICK: {o}")
    lines.append("")

    lines.append("## Websites")
    for w in websites[:200]:
        lines.append(f"- id={w.get('id')} name={w.get('name')} domain={w.get('domain')} theme={json.dumps(w.get('theme_id'), ensure_ascii=False)} published={w.get('is_published')}")
    lines.append("")

    # Views detail
    lines.append("## Views (DETAIL) — layout/header/footer/theme first")
    for v in views[:3000]:
        sig = v.get("signals") or {}
        lines.append(
            f"- kind={v.get('kind')} id={v.get('id')} key={v.get('key')} name={v.get('name')} "
            f"active={v.get('active')} website={json.dumps(v.get('website_id'), ensure_ascii=False)} inherit={json.dumps(v.get('inherit_id'), ensure_ascii=False)}"
        )
        lines.append(
            f"  signals: hrefs_total={sig.get('hrefs_total')} forms_total={sig.get('forms_total')} onclicks_total={sig.get('onclicks_total')} "
            f"interesting_hrefs={len(sig.get('interesting_hrefs') or [])} interesting_forms={len(sig.get('interesting_forms') or [])} interesting_onclicks={len(sig.get('interesting_onclicks') or [])}"
        )
        if sig.get("interesting_hrefs"):
            lines.append(f"  interesting_hrefs: {sig.get('interesting_hrefs')[:80]}")
        if sig.get("interesting_forms"):
            lines.append(f"  interesting_forms: {sig.get('interesting_forms')[:40]}")
        if sig.get("interesting_onclicks"):
            lines.append(f"  interesting_onclicks: {sig.get('interesting_onclicks')[:30]}")
        lines.append(f"  arch_snip: {v.get('arch_snip')}")
        lines.append("")
    if len(views) > 3000:
        lines.append(f"- ... truncated views list: {len(views)} total")
        lines.append("")

    lines.append("## Next (TOTEM contract)")
    lines.append("- From this report: pick EXACT header CTA(s) and map them to /web/login or /web/signup.")
    lines.append("- Then implement STEP 2B: post-signup server-to-server -> Core /system/onboarding/identity.")
    lines.append("- Then implement STEP 3: post-login read-only state check -> redirect by core_state.")
    lines.append("")
    return "\n".join(lines)

def main():
    errors = []
    log("TOTEM LAYOUT AUDIT: START (READ-ONLY)")
    log(f"Target: {ODOO_URL} | DB: {DB} | Login: {LOGIN}")
    log(f"JSONRPC: {JSONRPC}")
    log(f"Report: {REPORT_PATH}")

    try:
        uid = authenticate()
    except Exception:
        log("[FATAL] AUTH FAILED")
        traceback.print_exc()
        raise SystemExit(1)

    try:
        websites = dump_websites(uid)
    except Exception as e:
        websites = []
        errors.append("websites: " + str(e))
        log("[WARN] websites dump failed")

    try:
        ids = search_view_ids(uid)
    except Exception as e:
        ids = []
        errors.append("search views: " + str(e))
        log("[WARN] view id search failed")

    try:
        views = read_views(uid, ids)
    except Exception as e:
        views = []
        errors.append("read views: " + str(e))
        log("[WARN] view read failed")

    log("REPORT: building ...")
    report = build_report(uid, websites, views, errors)

    log("REPORT: writing file ...")
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    log("DONE: LAYOUT audit completed.")
    log(f"REPORT: {REPORT_PATH}")

if __name__ == "__main__":
    main()
