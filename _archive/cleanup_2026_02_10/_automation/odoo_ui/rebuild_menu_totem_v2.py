# -*- coding: utf-8 -*-
"""
TOTEM — REBUILD WEBSITE MENU (SAFE)
- НЕ удаляет root-меню (parent_id=False), чтобы не упереться в запрет Odoo
- Убирает дубли /web/login и /web/signup из меню
- Делает "Мастера" и "Салоны" кликабельными (URL = /masters, /salons)
- Собирает правильную структуру под одним root меню текущего сайта
STD LIB ONLY
"""

import json
import time
import ssl
import urllib.request

# ===== CANON CONFIG (как в твоем audit onefile) =====
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = ODOO_URL + "/jsonrpc"

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
    payload = jrpc_payload("common", "authenticate", [DB, LOGIN, API_KEY, {}])
    uid = jsonrpc_call(payload, timeout=60)
    if not uid:
        raise Exception("AUTH FAILED (uid=0)")
    return int(uid)

def call_kw(uid, model, method, args, kwargs=None, timeout=120):
    if kwargs is None:
        kwargs = {}
    payload = jrpc_payload("object", "execute_kw", [DB, uid, API_KEY, model, method, args, kwargs])
    return jsonrpc_call(payload, timeout=timeout)

def first(lst, default=None):
    return lst[0] if lst else default

def get_current_website_id(uid):
    # Берем сайт через website.page url='/' где website_id != False
    rows = call_kw(
        uid,
        "website.page",
        "search_read",
        [[[["url", "=", "/"], ["website_id", "!=", False]]]],
        {"fields": ["id", "url", "website_id"], "limit": 5},
        timeout=120,
    )
    if rows:
        wid = rows[0]["website_id"][0]
        return int(wid)
    # fallback: если нет, пробуем любой сайт
    websites = call_kw(
        uid,
        "website",
        "search_read",
        [[[]]],
        {"fields": ["id", "name"], "limit": 5},
        timeout=120,
    )
    if websites:
        return int(websites[0]["id"])
    raise Exception("Cannot detect website_id")

def pick_root_menu(uid, website_id):
    # Ищем root menu для этого website_id (parent_id=False)
    roots = call_kw(
        uid,
        "website.menu",
        "search_read",
        [[[["parent_id", "=", False], ["website_id", "=", website_id]]]],
        {"fields": ["id", "name", "website_id", "parent_id"], "limit": 20},
        timeout=120,
    )
    if roots:
        return int(roots[0]["id"])

    # fallback: root без website_id (обычно "Главное меню по умолчанию")
    roots2 = call_kw(
        uid,
        "website.menu",
        "search_read",
        [[[["parent_id", "=", False], ["website_id", "=", False]]]],
        {"fields": ["id", "name", "website_id", "parent_id"], "limit": 20},
        timeout=120,
    )
    if roots2:
        return int(roots2[0]["id"])

    raise Exception("Root menu not found")

def menu_search(uid, domain, fields=None, limit=200):
    if fields is None:
        fields = ["id", "name", "url", "parent_id", "website_id", "sequence"]
    return call_kw(
        uid,
        "website.menu",
        "search_read",
        [[domain]],
        {"fields": fields, "limit": limit, "order": "sequence,id"},
        timeout=120,
    )

def menu_unlink_safe(uid, ids):
    # НЕ удаляем root (parent_id=False) никогда
    if not ids:
        return 0
    recs = menu_search(uid, [["id", "in", ids]], fields=["id", "parent_id", "name", "url"], limit=500)
    safe_ids = []
    for r in recs:
        pid = r["parent_id"]
        if pid is False:
            continue
        safe_ids.append(r["id"])
    if safe_ids:
        call_kw(uid, "website.menu", "unlink", [safe_ids], {}, timeout=120)
    return len(safe_ids)

def upsert_menu(uid, website_id, parent_id, name, url, sequence):
    # Ищем по (parent_id, name, website_id in [website_id, False])
    existing = menu_search(
        uid,
        [
            ["parent_id", "=", parent_id],
            ["name", "=", name],
            "|",
            ["website_id", "=", website_id],
            ["website_id", "=", False],
        ],
        fields=["id", "name", "url", "website_id", "sequence", "parent_id"],
        limit=50,
    )
    if existing:
        mid = int(existing[0]["id"])
        vals = {"url": url, "sequence": sequence}
        # если меню было без website_id — привязываем к текущему сайту
        if not existing[0]["website_id"]:
            vals["website_id"] = website_id
        call_kw(uid, "website.menu", "write", [[mid], vals], {}, timeout=120)
        return mid

    vals = {
        "name": name,
        "url": url,
        "parent_id": parent_id,
        "website_id": website_id,
        "sequence": sequence,
    }
    mid = call_kw(uid, "website.menu", "create", [vals], {}, timeout=120)
    return int(mid)

def dedupe_children(uid, website_id, parent_id):
    # Удаляем дубли внутри parent_id по (name,url) — оставляем минимальный id
    rows = menu_search(
        uid,
        [
            ["parent_id", "=", parent_id],
            ["website_id", "=", website_id],
        ],
        fields=["id", "name", "url", "parent_id", "website_id"],
        limit=500,
    )
    buckets = {}
    for r in rows:
        k = (r.get("name") or "", r.get("url") or "")
        buckets.setdefault(k, []).append(int(r["id"]))
    to_del = []
    for k, ids in buckets.items():
        if len(ids) > 1:
            ids_sorted = sorted(ids)
            to_del += ids_sorted[1:]
    return menu_unlink_safe(uid, to_del)

def main():
    uid = authenticate()
    website_id = get_current_website_id(uid)
    root_id = pick_root_menu(uid, website_id)

    # 1) снести дубли логина/регистрации В МЕНЮ (оставляем системные кнопки в хедере как есть)
    # удаляем эти пункты и из текущего root, и где они попали в "default menu" под этим же website_id
    login_signup = menu_search(
        uid,
        [
            ["website_id", "=", website_id],
            ["url", "in", ["/web/login", "/web/signup"]],
        ],
        fields=["id", "parent_id", "name", "url"],
        limit=200,
    )
    menu_unlink_safe(uid, [r["id"] for r in login_signup])

    # 2) строим правильную структуру
    # TOP under root
    home_id = upsert_menu(uid, website_id, root_id, "Главная", "/", 10)
    appt_id = upsert_menu(uid, website_id, root_id, "Встреча", "/appointment", 20)

    masters_id = upsert_menu(uid, website_id, root_id, "Мастера", "/masters", 30)   # кликабельно
    salons_id  = upsert_menu(uid, website_id, root_id, "Салоны",  "/salons", 40)    # кликабельно
    totem_id   = upsert_menu(uid, website_id, root_id, "TOTEM",   "#", 50)

    # CHILDREN: Masters
    upsert_menu(uid, website_id, masters_id, "Кабинет", "/masters/cabinet", 10)
    upsert_menu(uid, website_id, masters_id, "Расписание", "/masters/schedule", 20)
    upsert_menu(uid, website_id, masters_id, "Записи", "/masters/bookings", 30)
    upsert_menu(uid, website_id, masters_id, "Клиенты", "/masters/clients", 40)
    upsert_menu(uid, website_id, masters_id, "Деньги", "/masters/money", 50)
    upsert_menu(uid, website_id, masters_id, "Настройки", "/masters/settings", 60)
    upsert_menu(uid, website_id, masters_id, "Мои салоны", "/masters/salons", 70)

    # CHILDREN: Salons
    upsert_menu(uid, website_id, salons_id, "Кабинет", "/salons/cabinet", 10)
    upsert_menu(uid, website_id, salons_id, "Расписание", "/salons/schedule", 20)
    upsert_menu(uid, website_id, salons_id, "Записи", "/salons/bookings", 30)
    upsert_menu(uid, website_id, salons_id, "Клиенты", "/salons/clients", 40)
    upsert_menu(uid, website_id, salons_id, "Деньги", "/salons/money", 50)
    upsert_menu(uid, website_id, salons_id, "Настройки", "/salons/settings", 60)
    upsert_menu(uid, website_id, salons_id, "Мастера", "/salons/masters", 70)

    # CHILDREN: TOTEM dynamic routes (как в твоем списке)
    upsert_menu(uid, website_id, totem_id, "Салон", "/s/:slug", 10)
    upsert_menu(uid, website_id, totem_id, "Запись", "/s/:slug/booking", 20)
    upsert_menu(uid, website_id, totem_id, "Календарь", "/s/:slug/calendar", 30)
    upsert_menu(uid, website_id, totem_id, "Отчёты", "/s/:slug/reports", 40)
    upsert_menu(uid, website_id, totem_id, "Владелец", "/s/:slug/owner", 50)

    # 3) чистим дубли только внутри наших веток (без root)
    dedupe_children(uid, website_id, root_id)
    dedupe_children(uid, website_id, masters_id)
    dedupe_children(uid, website_id, salons_id)
    dedupe_children(uid, website_id, totem_id)

    print("FIX DONE")
    print("website_id =", website_id)
    print("root_id    =", root_id)
    print("home_id    =", home_id, "appt_id =", appt_id)
    print("masters_id =", masters_id, "salons_id =", salons_id, "totem_id =", totem_id)

if __name__ == "__main__":
    main()
