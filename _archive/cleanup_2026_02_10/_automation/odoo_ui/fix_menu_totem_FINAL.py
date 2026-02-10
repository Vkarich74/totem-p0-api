# STD LIB ONLY. SAFE: NO UNLINK. NO MEGA MENU. NO DEFAULT-ROOT DELETE.
import json
import ssl
import urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "PASTE_YOUR_API_KEY_HERE"  # <= вставь свой ключ
JSONRPC = f"{ODOO_URL}/jsonrpc"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def jsonrpc(payload, timeout=120):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(JSONRPC, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
        res = json.loads(r.read().decode("utf-8"))
    if res.get("error"):
        raise Exception(json.dumps(res["error"], ensure_ascii=False))
    return res["result"]

def odoo_login():
    return jsonrpc({
        "jsonrpc": "2.0",
        "method": "call",
        "id": 1,
        "params": {"service": "common", "method": "login", "args": [DB, LOGIN, API_KEY]},
    })

def exec_kw(uid, model, method, args=None, kwargs=None):
    return jsonrpc({
        "jsonrpc": "2.0",
        "method": "call",
        "id": 2,
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, method, args or [], kwargs or {}],
        },
    })

def search_read(uid, model, domain, fields, order="id asc", limit=None):
    kw = {"fields": fields, "order": order}
    if limit is not None:
        kw["limit"] = limit
    return exec_kw(uid, model, "search_read", [domain], kw)

def write(uid, model, ids, vals):
    return exec_kw(uid, model, "write", [[ids, vals]])

def create(uid, model, vals):
    return exec_kw(uid, model, "create", [vals])

def pick_root_menu(uid):
    roots = search_read(uid, "website.menu", [["parent_id", "=", False]], ["id", "name"], order="id asc")
    if not roots:
        raise Exception("NO_ROOT_MENU_FOUND")

    # Prefer a root that looks like TOTEM Platform if present, else first.
    for r in roots:
        n = (r.get("name") or "").lower()
        if "totem" in n or "platform" in n:
            return r["id"], r["name"]
    return roots[0]["id"], roots[0]["name"]

def ensure_menu(uid, name, url, parent_id, seq):
    # Find existing by exact url first
    rows = search_read(uid, "website.menu", [["url", "=", url]], ["id", "name", "parent_id", "url", "sequence"], order="id asc")
    if rows:
        mid = rows[0]["id"]
        vals = {"name": name, "url": url, "sequence": seq}
        if parent_id is not None:
            vals["parent_id"] = parent_id
        write(uid, "website.menu", [mid], vals)
        return mid, "UPDATED_BY_URL"

    # Else find by name under the same parent
    dom = [["name", "=", name]]
    if parent_id is None:
        dom.append(["parent_id", "=", False])
    else:
        dom.append(["parent_id", "=", parent_id])

    rows2 = search_read(uid, "website.menu", dom, ["id", "name", "parent_id", "url", "sequence"], order="id asc", limit=1)
    if rows2:
        mid = rows2[0]["id"]
        vals = {"url": url, "sequence": seq}
        write(uid, "website.menu", [mid], vals)
        return mid, "UPDATED_BY_NAME"

    # Create new
    vals = {"name": name, "url": url, "sequence": seq}
    if parent_id is not None:
        vals["parent_id"] = parent_id
    mid = create(uid, "website.menu", vals)
    return mid, "CREATED"

def main():
    uid = odoo_login()
    print("UID:", uid)

    root_id, root_name = pick_root_menu(uid)
    print("ROOT:", root_id, root_name)

    # ROOT clickable parents (NO '#')
    masters_id, s1 = ensure_menu(uid, "Мастера", "/masters/cabinet", root_id, 20)
    salons_id,  s2 = ensure_menu(uid, "Салоны",  "/salons/cabinet",  root_id, 30)
    totem_id,   s3 = ensure_menu(uid, "TOTEM",   "/s/:slug",         root_id, 40)

    # Ensure Home exists (optional but stable)
    ensure_menu(uid, "Главная", "/", root_id, 10)

    masters_items = [
        ("Кабинет", "/masters/cabinet", 10),
        ("Расписание", "/masters/schedule", 20),
        ("Записи", "/masters/bookings", 30),
        ("Клиенты", "/masters/clients", 40),
        ("Деньги", "/masters/money", 50),
        ("Настройки", "/masters/settings", 60),
        ("Мои салоны", "/masters/salons", 70),
    ]

    salons_items = [
        ("Кабинет", "/salons/cabinet", 10),
        ("Расписание", "/salons/schedule", 20),
        ("Записи", "/salons/bookings", 30),
        ("Клиенты", "/salons/clients", 40),
        ("Деньги", "/salons/money", 50),
        ("Настройки", "/salons/settings", 60),
        ("Мастера", "/salons/masters", 70),
    ]

    totem_items = [
        ("Салон", "/s/:slug", 10),
        ("Запись", "/s/:slug/booking", 20),
        ("Календарь", "/s/:slug/calendar", 30),
        ("Отчёты", "/s/:slug/reports", 40),
        ("Владелец", "/s/:slug/owner", 50),
    ]

    for n, u, q in masters_items:
        ensure_menu(uid, n, u, masters_id, q)

    for n, u, q in salons_items:
        ensure_menu(uid, n, u, salons_id, q)

    for n, u, q in totem_items:
        ensure_menu(uid, n, u, totem_id, q)

    print("DONE: menu rebuilt (SAFE).")

if __name__ == "__main__":
    main()
