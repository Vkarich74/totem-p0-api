# audit/dump_odoo_site_audit_deep.py
# READ-ONLY DEEP AUDIT:
#  - Inside: JSON-RPC dump (pages, views, menus, redirects, websites, attachments, controllers-ish signals)
#  - Outside: crawler (HTTP GET each page URL, parse HTML forms and detect reuse)
# Output: audit_out_deep\

import os
import json
import re
import time
import hashlib
from datetime import datetime
from urllib.parse import urljoin, urlparse
import requests
from html.parser import HTMLParser

# =========================
# CONFIG (ENV FIRST)
# =========================
# Set env vars in CMD:
# set ODOO_URL=https://totem-platform.odoo.com
# set ODOO_DB=totem-platform
# set ODOO_EMAIL=kantotemus@gmail.com
# set ODOO_API_KEY=PASTE
ODOO_URL = os.getenv("ODOO_URL", "").strip()
ODOO_DB = os.getenv("ODOO_DB", "").strip()
ODOO_EMAIL = os.getenv("ODOO_EMAIL", "").strip()
ODOO_API_KEY = os.getenv("ODOO_API_KEY", "").strip()
JSONRPC = f"{ODOO_URL}/jsonrpc" if ODOO_URL else ""

# CRAWL settings
CRAWL_ENABLED = True
CRAWL_DELAY_SEC = 0.25
CRAWL_TIMEOUT_SEC = 30
CRAWL_MAX_PAGES = 100000
CRAWL_USER_AGENT = "TOTEM-AUDIT-BOT/1.0 (+local)"

# Limits
MAX_RECORDS = 100000
VIEW_ARCH_MAX_CHARS = 2_000_000  # safety cap per view (still large)

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "audit_out_deep"))

# =========================
# JSON-RPC helpers
# =========================
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

def ensure_config():
    missing = [k for k, v in {
        "ODOO_URL": ODOO_URL, "ODOO_DB": ODOO_DB, "ODOO_EMAIL": ODOO_EMAIL, "ODOO_API_KEY": ODOO_API_KEY
    }.items() if not v]
    if missing:
        raise SystemExit(f"CONFIG MISSING: {', '.join(missing)}. Set env vars first.")

# =========================
# Helpers
# =========================
def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8", errors="ignore")).hexdigest()

def normalize_text(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    # remove Odoo editor noise
    s = re.sub(r"data-oe-id=\"[^\"]*\"", "", s)
    s = re.sub(r"data-oe-xpath=\"[^\"]*\"", "", s)
    s = re.sub(r"data-oe-model=\"[^\"]*\"", "", s)
    s = re.sub(r"data-oe-field=\"[^\"]*\"", "", s)
    return s

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def write_text(path, s: str):
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)

def now_utc():
    return datetime.utcnow().isoformat() + "Z"

def safe_arch(arch: str) -> str:
    if not isinstance(arch, str):
        return ""
    if len(arch) <= VIEW_ARCH_MAX_CHARS:
        return arch
    return arch[:VIEW_ARCH_MAX_CHARS] + "\n<!-- TRUNCATED -->\n"

# =========================
# HTML crawler parser
# =========================
class FormHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.forms = []
        self._in_form = False
        self._cur_form = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs or [])
        if tag.lower() == "form":
            self._in_form = True
            self._cur_form = {
                "action": a.get("action"),
                "method": (a.get("method") or "").lower() or "get",
                "id": a.get("id"),
                "class": a.get("class"),
                "data_model_name": a.get("data-model_name") or a.get("data_model_name"),
                "inputs": [],
                "buttons": [],
            }
        elif self._in_form and tag.lower() in ("input", "select", "textarea"):
            self._cur_form["inputs"].append({
                "tag": tag.lower(),
                "name": a.get("name"),
                "type": a.get("type"),
                "id": a.get("id"),
                "class": a.get("class"),
                "value": a.get("value"),
            })
        elif self._in_form and tag.lower() == "button":
            self._cur_form["buttons"].append({
                "type": a.get("type"),
                "name": a.get("name"),
                "id": a.get("id"),
                "class": a.get("class"),
            })

    def handle_endtag(self, tag):
        if tag.lower() == "form" and self._in_form:
            self.forms.append(self._cur_form or {})
            self._cur_form = None
            self._in_form = False

def signature_from_form_obj(form: dict) -> str:
    # stable signature for "same form reused" detection
    action = (form.get("action") or "").strip()
    method = (form.get("method") or "").strip().lower()
    data_model = (form.get("data_model_name") or "").strip()
    names = []
    for i in form.get("inputs") or []:
        nm = (i.get("name") or "").strip()
        if nm:
            names.append(nm)
    names = sorted(set(names))
    base = json.dumps({
        "action": action,
        "method": method,
        "data_model": data_model,
        "input_names": names,
    }, ensure_ascii=False, sort_keys=True)
    return sha256(base)

# =========================
# Inside form detection from arch_db (QWeb)
# =========================
FORM_HINTS = [
    "website_form", "s_website_form", "o_website_form", "data-model_name",
    "<form", "o_website_form_send", "data-snippet", "s_form"
]

def detect_forms_in_arch(arch: str):
    if not arch or not isinstance(arch, str):
        return []
    low = arch.lower()
    if not any(h in low for h in FORM_HINTS):
        return []

    # Extract candidates by regex around <form ... </form>
    out = []
    for m in re.finditer(r"(<form\b.*?</form>)", arch, flags=re.I | re.S):
        snippet = m.group(1)
        norm = normalize_text(snippet)
        sig = sha256(norm)
        fields = sorted(set(re.findall(r'name="([^"]+)"', snippet, flags=re.I)))
        data_models = sorted(set(re.findall(r'data-model_name="([^"]+)"', snippet, flags=re.I)))
        out.append({
            "kind": "qweb_form_tag",
            "signature": sig,
            "fields": fields,
            "data_models": data_models,
        })

    # Also detect data-model blocks even without <form>
    for m in re.finditer(r'(data-model_name="[^"]+")', arch, flags=re.I):
        start = max(0, m.start() - 400)
        end = min(len(arch), m.start() + 900)
        snippet = arch[start:end]
        norm = normalize_text(snippet)
        sig = sha256(norm)
        fields = sorted(set(re.findall(r'name="([^"]+)"', snippet, flags=re.I)))
        data_models = sorted(set(re.findall(r'data-model_name="([^"]+)"', snippet, flags=re.I)))
        out.append({
            "kind": "qweb_data_model_chunk",
            "signature": sig,
            "fields": fields,
            "data_models": data_models,
        })

    # De-dup
    uniq = {}
    for f in out:
        key = f"{f['kind']}::{f['signature']}"
        if key not in uniq:
            uniq[key] = f
    return list(uniq.values())

# =========================
# Inside dump collectors
# =========================
def dump_model(uid, model, fields, domain=None, limit=MAX_RECORDS, order=None):
    if domain is None: domain = []
    kwargs = {"fields": fields, "limit": limit}
    if order:
        kwargs["order"] = order
    return execute_kw(uid, model, "search_read", args=[domain], kwargs=kwargs)

def try_dump(uid, label, model, fields, domain=None, order=None):
    try:
        data = dump_model(uid, model, fields, domain=domain, order=order)
        return {"ok": True, "label": label, "model": model, "count": len(data), "data": data}
    except Exception as e:
        return {"ok": False, "label": label, "model": model, "error": str(e), "count": 0, "data": []}

# =========================
# Crawl public URLs
# =========================
def crawl_urls(base_url: str, urls: list):
    sess = requests.Session()
    sess.headers.update({"User-Agent": CRAWL_USER_AGENT})
    results = []
    sig_index = {}  # signature -> {count, urls, sample}

    for idx, rel in enumerate(urls[:CRAWL_MAX_PAGES], start=1):
        full = urljoin(base_url, rel.lstrip("/")) if rel.startswith("/") else urljoin(base_url, rel)
        try:
            r = sess.get(full, timeout=CRAWL_TIMEOUT_SEC, allow_redirects=True)
            status = r.status_code
            final_url = r.url
            text = r.text or ""

            parser = FormHTMLParser()
            try:
                parser.feed(text)
            except Exception:
                pass

            forms = []
            for f in parser.forms:
                sig = signature_from_form_obj(f)
                forms.append({
                    "signature": sig,
                    "action": f.get("action"),
                    "method": f.get("method"),
                    "id": f.get("id"),
                    "class": f.get("class"),
                    "data_model_name": f.get("data_model_name"),
                    "input_names": sorted({(i.get("name") or "").strip() for i in (f.get("inputs") or []) if (i.get("name") or "").strip()}),
                })
                if sig not in sig_index:
                    sig_index[sig] = {"count": 0, "urls": [], "sample": forms[-1]}
                sig_index[sig]["count"] += 1
                sig_index[sig]["urls"].append(rel)

            title = ""
            mt = re.search(r"<title[^>]*>(.*?)</title>", text, flags=re.I | re.S)
            if mt:
                title = re.sub(r"\s+", " ", mt.group(1)).strip()

            results.append({
                "url": rel,
                "http_status": status,
                "final_url": final_url,
                "title": title,
                "forms_detected": forms,
                "html_sha256": sha256(normalize_text(text[:200000])),
            })
        except Exception as e:
            results.append({
                "url": rel,
                "http_status": None,
                "final_url": None,
                "title": None,
                "forms_detected": [],
                "error": str(e),
            })

        time.sleep(CRAWL_DELAY_SEC)

    # normalize sig_index
    sig_index_sorted = sorted(sig_index.items(), key=lambda kv: kv[1]["count"], reverse=True)
    sig_index_out = []
    for sig, info in sig_index_sorted:
        sig_index_out.append({
            "signature": sig,
            "count": info["count"],
            "urls": info["urls"][:200],
            "sample": info["sample"],
            "urls_more": max(0, len(info["urls"]) - 200),
        })

    return results, sig_index_out

# =========================
# Build report
# =========================
def build_report(state: dict) -> str:
    lines = []
    lines.append("# TOTEM — DEEP Odoo Website Audit Report")
    lines.append("")
    lines.append(f"- generated_at: **{state.get('generated_at')}**")
    lines.append(f"- odoo_url: **{state.get('odoo_url')}**")
    lines.append("")

    inside = state.get("inside", {})
    outside = state.get("outside", {})

    lines.append("## Inside (JSON-RPC)")
    lines.append("")
    for k in ["websites", "pages", "views_linked", "views_website_all", "menus", "redirects", "attachments", "assets_views"]:
        blk = inside.get(k, {})
        if blk and blk.get("ok"):
            lines.append(f"- {k}: **{blk.get('count', 0)}**")
        elif blk:
            lines.append(f"- {k}: **ERROR**: {blk.get('error')}")
    lines.append("")

    # Key metrics
    pages = inside.get("pages", {}).get("data", []) if inside.get("pages", {}).get("ok") else []
    views_linked = inside.get("views_linked", {}).get("data", []) if inside.get("views_linked", {}).get("ok") else []
    views_all = inside.get("views_website_all", {}).get("data", []) if inside.get("views_website_all", {}).get("ok") else []
    menus = inside.get("menus", {}).get("data", []) if inside.get("menus", {}).get("ok") else []

    # Map page->view
    page_by_url = {}
    linked_view_ids = set()
    for p in pages:
        u = p.get("url")
        if u:
            page_by_url[u] = p
        vid = p.get("view_id")
        if isinstance(vid, list) and vid:
            linked_view_ids.add(vid[0])

    view_by_id = {}
    for v in views_linked:
        view_by_id[v.get("id")] = v

    # Detect inside forms per view
    inside_sig = {}  # signature -> {count, urls, sample_fields, kinds}
    page_forms = []
    for p in pages:
        url = p.get("url")
        vid = p.get("view_id")
        view_id = vid[0] if isinstance(vid, list) and vid else None
        v = view_by_id.get(view_id) if view_id else None
        arch = v.get("arch_db") if v else ""
        forms = detect_forms_in_arch(arch)
        page_forms.append({"url": url, "page_id": p.get("id"), "view_id": view_id, "forms": forms})
        for f in forms:
            sig = f["signature"]
            if sig not in inside_sig:
                inside_sig[sig] = {"count": 0, "urls": [], "kinds": set(), "sample_fields": set(), "sample_data_models": set()}
            inside_sig[sig]["count"] += 1
            if url:
                inside_sig[sig]["urls"].append(url)
            inside_sig[sig]["kinds"].add(f.get("kind"))
            for nm in f.get("fields") or []:
                inside_sig[sig]["sample_fields"].add(nm)
            for dm in f.get("data_models") or []:
                inside_sig[sig]["sample_data_models"].add(dm)

    # Convert sets
    inside_sig_sorted = sorted(inside_sig.items(), key=lambda kv: kv[1]["count"], reverse=True)
    lines.append("## Forms reuse (Inside / QWeb)")
    lines.append("")
    lines.append(f"- unique_signatures_inside: **{len(inside_sig)}**")
    if not inside_sig_sorted:
        lines.append("- no forms detected inside (heuristics).")
    else:
        for sig, info in inside_sig_sorted[:20]:
            lines.append(f"### {sig[:12]}…  (used on {info['count']} pages)")
            lines.append(f"- kinds: {', '.join(sorted(info['kinds']))}")
            dms = sorted(info["sample_data_models"])
            if dms:
                lines.append(f"- data_models: {', '.join(dms[:10])}" + (" …" if len(dms) > 10 else ""))
            sf = sorted(info["sample_fields"])
            if sf:
                lines.append(f"- fields: {', '.join(sf[:40])}" + (" …" if len(sf) > 40 else ""))
            lines.append("- urls:")
            for u in info["urls"][:30]:
                lines.append(f"  - {u}")
            if len(info["urls"]) > 30:
                lines.append(f"  - ... ({len(info['urls']) - 30} more)")
            lines.append("")

    # Menus coverage
    lines.append("## Menus coverage")
    lines.append("")
    menu_urls = []
    for m in menus:
        u = m.get("url")
        if u:
            menu_urls.append(u)
    menu_urls = sorted(set(menu_urls))
    lines.append(f"- unique_menu_urls: **{len(menu_urls)}**")
    missing = [u for u in menu_urls if u not in page_by_url]
    lines.append(f"- menu_urls_without_page_match: **{len(missing)}**")
    if missing[:20]:
        lines.append("- examples:")
        for u in missing[:20]:
            lines.append(f"  - {u}")
    lines.append("")

    # Outside crawl
    if outside.get("ok"):
        lines.append("## Outside (HTTP Crawl BOT)")
        lines.append("")
        crawl = outside.get("crawl_results", [])
        sigs = outside.get("form_signatures", [])
        ok_200 = sum(1 for r in crawl if r.get("http_status") == 200)
        non_200 = sum(1 for r in crawl if r.get("http_status") not in (200, None))
        errs = sum(1 for r in crawl if r.get("http_status") is None)

        lines.append(f"- crawled_urls: **{len(crawl)}**")
        lines.append(f"- http_200: **{ok_200}**")
        lines.append(f"- non_200: **{non_200}**")
        lines.append(f"- errors: **{errs}**")
        lines.append(f"- unique_form_signatures_outside: **{len(sigs)}**")
        lines.append("")

        lines.append("### Top reused form signatures (Outside / HTML)")
        lines.append("")
        if not sigs:
            lines.append("- no <form> detected in public HTML.")
        else:
            for it in sigs[:20]:
                lines.append(f"#### {it['signature'][:12]}…  (used on {it['count']} urls)")
                sample = it.get("sample") or {}
                lines.append(f"- action: {sample.get('action')}")
                lines.append(f"- method: {sample.get('method')}")
                dmn = sample.get("data_model_name")
                if dmn:
                    lines.append(f"- data_model_name: {dmn}")
                inn = sample.get("input_names") or []
                if inn:
                    lines.append(f"- input_names: {', '.join(inn[:40])}" + (" …" if len(inn) > 40 else ""))
                lines.append("- urls:")
                for u in (it.get("urls") or [])[:30]:
                    lines.append(f"  - {u}")
                if it.get("urls_more"):
                    lines.append(f"  - ... ({it['urls_more']} more)")
                lines.append("")
    else:
        lines.append("## Outside (HTTP Crawl BOT)")
        lines.append("")
        lines.append(f"- ERROR: {outside.get('error')}")
        lines.append("")

    # Conclusion rules (no opinions, only deterministic next)
    lines.append("## Deterministic findings rules")
    lines.append("")
    lines.append("- If ONE signature dominates many URLs (inside/outside) → same form/view reused → explains “одна форма на все страницы”.")
    lines.append("- If menu urls lack page match → menu points to external/redirect/controller route.")
    lines.append("- If redirects exist → URLs may not map to pages; need routing contract before changes.")
    lines.append("")

    return "\n".join(lines)

# =========================
# Main
# =========================
def main():
    ensure_config()
    os.makedirs(OUT_DIR, exist_ok=True)

    uid = authenticate()

    # --- INSIDE DUMPS ---
    inside = {}

    inside["websites"] = try_dump(uid, "websites", "website", ["id", "name", "domain", "company_id", "default_lang_id", "language_ids", "active", "create_date", "write_date"])
    inside["pages"] = try_dump(uid, "pages", "website.page", ["id", "name", "url", "view_id", "website_id", "is_published", "active", "create_date", "write_date"], order="url asc")

    # Linked views (from pages)
    view_ids = []
    if inside["pages"]["ok"]:
        for p in inside["pages"]["data"]:
            vid = p.get("view_id")
            if isinstance(vid, list) and vid:
                view_ids.append(vid[0])
    view_ids = sorted(set(view_ids))

    if view_ids:
        try:
            data = execute_kw(
                uid, "ir.ui.view", "read",
                args=[view_ids],
                kwargs={"fields": ["id", "name", "key", "type", "active", "inherit_id", "website_id", "mode", "priority", "arch_db", "create_date", "write_date"]}
            )
            # trim arch if needed
            for v in data:
                v["arch_db"] = safe_arch(v.get("arch_db") or "")
            inside["views_linked"] = {"ok": True, "label": "views_linked", "model": "ir.ui.view", "count": len(data), "data": data}
        except Exception as e:
            inside["views_linked"] = {"ok": False, "label": "views_linked", "model": "ir.ui.view", "error": str(e), "count": 0, "data": []}
    else:
        inside["views_linked"] = {"ok": True, "label": "views_linked", "model": "ir.ui.view", "count": 0, "data": []}

    # All website-related views (deep)
    # domain: website_id != False OR key ilike 'website.%' OR type='qweb'
    inside["views_website_all"] = try_dump(
        uid, "views_website_all", "ir.ui.view",
        ["id", "name", "key", "type", "active", "inherit_id", "website_id", "mode", "priority", "arch_db", "create_date", "write_date"],
        domain=["|", "|", ("website_id", "!=", False), ("key", "ilike", "website."), ("type", "=", "qweb")],
        order="key asc"
    )
    if inside["views_website_all"]["ok"]:
        for v in inside["views_website_all"]["data"]:
            v["arch_db"] = safe_arch(v.get("arch_db") or "")

    # Menus
    inside["menus"] = try_dump(uid, "menus", "website.menu", ["id", "name", "url", "parent_id", "child_id", "sequence", "website_id", "page_id", "new_window", "is_visible", "create_date", "write_date"], order="sequence asc")

    # Redirects (if module exists)
    inside["redirects"] = try_dump(uid, "redirects", "website.redirect", ["id", "type", "url_from", "url_to", "website_id", "active", "create_date", "write_date"])

    # Attachments: images/files used on website (deep signal)
    inside["attachments"] = try_dump(uid, "attachments", "ir.attachment", ["id", "name", "mimetype", "url", "public", "res_model", "res_id", "create_date", "write_date"], domain=[("public", "=", True)], order="write_date desc")

    # Assets-ish views (optional signal)
    inside["assets_views"] = try_dump(uid, "assets_views", "ir.ui.view", ["id", "name", "key", "type", "active", "inherit_id", "website_id", "priority", "arch_db", "write_date"], domain=[("key", "ilike", "web.assets")], order="key asc")
    if inside["assets_views"]["ok"]:
        for v in inside["assets_views"]["data"]:
            v["arch_db"] = safe_arch(v.get("arch_db") or "")

    # Build inside URL list
    urls = []
    if inside["pages"]["ok"]:
        for p in inside["pages"]["data"]:
            u = p.get("url")
            if u and isinstance(u, str):
                urls.append(u)
    urls = sorted(set(urls))

    # --- OUTSIDE CRAWL ---
    outside = {"ok": False}
    if CRAWL_ENABLED and urls:
        try:
            crawl_results, form_signatures = crawl_urls(ODOO_URL, urls)
            outside = {
                "ok": True,
                "crawl_results": crawl_results,
                "form_signatures": form_signatures,
            }
        except Exception as e:
            outside = {"ok": False, "error": str(e)}

    state = {
        "generated_at": now_utc(),
        "odoo_url": ODOO_URL,
        "db": ODOO_DB,
        "inside": inside,
        "outside": outside,
    }

    # Write outputs
    write_json(os.path.join(OUT_DIR, "state.json"), state)

    # Flat dumps for удобства
    if inside.get("pages", {}).get("ok"):
        write_json(os.path.join(OUT_DIR, "pages.json"), inside["pages"]["data"])
    if inside.get("views_linked", {}).get("ok"):
        write_json(os.path.join(OUT_DIR, "views_linked.json"), inside["views_linked"]["data"])
    if inside.get("views_website_all", {}).get("ok"):
        write_json(os.path.join(OUT_DIR, "views_website_all.json"), inside["views_website_all"]["data"])
    if inside.get("menus", {}).get("ok"):
        write_json(os.path.join(OUT_DIR, "menus.json"), inside["menus"]["data"])
    if inside.get("redirects", {}).get("ok"):
        write_json(os.path.join(OUT_DIR, "redirects.json"), inside["redirects"]["data"])
    if inside.get("attachments", {}).get("ok"):
        write_json(os.path.join(OUT_DIR, "attachments_public.json"), inside["attachments"]["data"])
    if inside.get("assets_views", {}).get("ok"):
        write_json(os.path.join(OUT_DIR, "assets_views.json"), inside["assets_views"]["data"])

    if outside.get("ok"):
        write_json(os.path.join(OUT_DIR, "crawl_results.json"), outside["crawl_results"])
        write_json(os.path.join(OUT_DIR, "crawl_form_signatures.json"), outside["form_signatures"])

    report_md = build_report(state)
    write_text(os.path.join(OUT_DIR, "report.md"), report_md)

    print("OK: audit_out_deep created")
    print(f"DIR: {OUT_DIR}")
    print("- report.md")
    print("- state.json")
    print("- pages.json / views_linked.json / views_website_all.json / menus.json / redirects.json / attachments_public.json / assets_views.json")
    if outside.get("ok"):
        print("- crawl_results.json / crawl_form_signatures.json")

if __name__ == "__main__":
    main()
